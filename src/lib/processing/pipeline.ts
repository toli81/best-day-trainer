import { nanoid } from "nanoid";
import path from "path";
import fs from "fs";
import os from "os";
import {
  uploadAndCache,
  analyzeSessionOverview,
  runDetailAnalysisInBatches,
  cleanupGeminiResources,
} from "@/lib/gemini/analyze-session";
import { extractClip, generateThumbnail, getVideoDuration, compressForAnalysis } from "@/lib/video/ffmpeg";
import { generateSessionNotes } from "@/lib/claude/session-notes";
import { standardizeAndTagExercises } from "@/lib/claude/library-manager";
import { updateSessionStatus, createExercises, getSession } from "@/lib/db/queries";
import { parseTimestamp } from "@/lib/utils/timestamps";
import { downloadToFile, uploadFile } from "@/lib/r2/client";
import type { NewExercise } from "@/lib/db/schema";
import type { ExerciseOverview, ExerciseDetail } from "@/lib/gemini/schemas";
import type { AnalysisCallbacks, VideoRef } from "@/lib/gemini/analyze-session";

// Pipeline stage ordering for checkpoint comparison
const STAGE_ORDER = [
  "downloaded",
  "compressed",
  "uploaded_to_gemini",
  "overview_complete",
  "details_complete",
  "clips_extracted",
  "notes_generated",
  "complete",
] as const;

type PipelineStage = (typeof STAGE_ORDER)[number];

function stageReached(current: string | null | undefined, target: PipelineStage): boolean {
  if (!current) return false;
  const currentIdx = STAGE_ORDER.indexOf(current as PipelineStage);
  const targetIdx = STAGE_ORDER.indexOf(target);
  return currentIdx >= targetIdx;
}

// Concurrency guard: only one session can process at a time (Railway disk constraint)
let currentlyProcessing: string | null = null;

export function isProcessing(): boolean {
  return currentlyProcessing !== null;
}

export function getProcessingSessionId(): string | null {
  return currentlyProcessing;
}

export async function processSession(sessionId: string) {
  // Concurrency guard
  if (currentlyProcessing) {
    throw new Error(
      `Another session (${currentlyProcessing}) is already processing. ` +
      `Only one session can process at a time due to disk constraints.`
    );
  }
  currentlyProcessing = sessionId;

  const session = await getSession(sessionId);
  if (!session) {
    currentlyProcessing = null;
    throw new Error(`Session ${sessionId} not found`);
  }

  const isR2 = session.videoFilePath.startsWith("r2://");
  const r2Key = isR2 ? session.videoFilePath.replace("r2://", "") : "";
  const ext = path.extname(session.videoFileName) || ".mp4";
  const videoPath = isR2
    ? path.join(os.tmpdir(), `bdt-${sessionId}${ext}`)
    : session.videoFilePath;
  const clipsDir = isR2
    ? path.join(os.tmpdir(), "bdt-clips", sessionId)
    : path.join(process.cwd(), "public", "clips", sessionId);

  let analysisVideoPath = "";
  const stage = session.pipelineStage as PipelineStage | null;

  // Callbacks for status updates
  const callbacks: AnalysisCallbacks = {
    onStatusChange: async (status, detail) => {
      console.log(`[${sessionId}] ${status}: ${detail}`);
    },
  };

  try {
    // Update status
    await updateSessionStatus(sessionId, "analyzing", {
      processingStartedAt: session.processingStartedAt || new Date().toISOString(),
      processingError: undefined,
    });

    // ─── Stage 1: Download from R2 ───
    if (isR2 && !stageReached(stage, "downloaded")) {
      console.log(`[${sessionId}] Stage 1: Downloading from R2...`);
      await downloadToFile(r2Key, videoPath);
      console.log(`[${sessionId}] Download complete: ${videoPath}`);

      // Get duration
      let duration = 0;
      try { duration = await getVideoDuration(videoPath); } catch { /* ignore */ }
      await updateSessionStatus(sessionId, "analyzing", {
        pipelineStage: "downloaded",
        durationSeconds: duration > 0 ? Math.round(duration) : undefined,
      });
    } else if (isR2 && stageReached(stage, "downloaded") && !fs.existsSync(videoPath)) {
      // Resuming: re-download since /tmp doesn't persist across restarts or retries
      console.log(`[${sessionId}] Resuming: re-downloading from R2...`);
      await downloadToFile(r2Key, videoPath);
    }

    // ─── Stage 2: Compress for analysis ───
    if (!stageReached(stage, "compressed")) {
      console.log(`[${sessionId}] Stage 2: Compressing video for analysis...`);
      try {
        analysisVideoPath = await compressForAnalysis(videoPath);
      } catch (err) {
        console.warn(`[${sessionId}] Compression failed, using original:`, err);
        analysisVideoPath = videoPath;
      }
      await updateSessionStatus(sessionId, "analyzing", {
        pipelineStage: "compressed",
      });
    } else {
      // Resuming past compression: use original if compressed not available
      analysisVideoPath = videoPath;
    }

    // ─── Stage 3: Upload to Gemini + create cache ───
    let geminiFileUri = session.geminiFileUri;
    let geminiFileName = session.geminiFileName;
    let geminiCacheName = session.geminiCacheId;
    let geminiMimeType = "video/mp4";

    if (!stageReached(stage, "uploaded_to_gemini")) {
      console.log(`[${sessionId}] Stage 3: Uploading to Gemini and creating cache...`);
      const gemini = await uploadAndCache(
        analysisVideoPath || videoPath,
        callbacks
      );
      geminiFileUri = gemini.geminiFileUri;
      geminiFileName = gemini.geminiFileName;
      geminiCacheName = gemini.geminiCacheName;
      geminiMimeType = gemini.geminiMimeType;

      await updateSessionStatus(sessionId, "analyzing", {
        pipelineStage: "uploaded_to_gemini",
        geminiFileUri,
        geminiFileName,
        geminiCacheId: geminiCacheName,
      });
    }

    // Build video reference for analysis calls (cache or direct file)
    const videoRef: VideoRef = {
      cacheName: geminiCacheName,
      fileUri: geminiFileUri!,
      mimeType: geminiMimeType,
    };
    console.log(`[${sessionId}] Using ${geminiCacheName ? "cached" : "direct file"} mode for analysis`);

    // ─── Stage 4: Overview analysis ───
    let overview: ExerciseOverview;

    if (!stageReached(stage, "overview_complete")) {
      console.log(`[${sessionId}] Stage 4: Running overview analysis...`);
      overview = await analyzeSessionOverview(videoRef, callbacks);
      await updateSessionStatus(sessionId, "analyzing", {
        pipelineStage: "overview_complete",
        overviewAnalysis: JSON.stringify(overview),
      });
    } else {
      // Resuming: parse overview from DB
      overview = JSON.parse(session.overviewAnalysis!) as ExerciseOverview;
      console.log(`[${sessionId}] Stage 4: Skipped (overview already complete)`);
    }

    // ─── Stage 5: Batched detail analysis ───
    const realExercises = overview.exercises.filter((e) => !e.isRestPeriod);
    let details: ExerciseDetail[];

    if (!stageReached(stage, "details_complete")) {
      console.log(`[${sessionId}] Stage 5: Running batched detail analysis for ${realExercises.length} exercises...`);
      details = await runDetailAnalysisInBatches(
        videoRef,
        realExercises,
        callbacks
      );
      await updateSessionStatus(sessionId, "segmenting", {
        pipelineStage: "details_complete",
        detailsAnalysis: JSON.stringify(details),
      });
    } else {
      // Resuming: parse details from DB
      details = JSON.parse(session.detailsAnalysis!) as ExerciseDetail[];
      console.log(`[${sessionId}] Stage 5: Skipped (details already complete)`);
    }

    // ─── Stage 6: Extract clips + thumbnails ───
    if (!stageReached(stage, "clips_extracted")) {
      console.log(`[${sessionId}] Stage 6: Extracting clips and thumbnails...`);
      await updateSessionStatus(sessionId, "segmenting");

      // Need source video for clip extraction — re-download if needed
      if (isR2 && !fs.existsSync(videoPath)) {
        console.log(`[${sessionId}] Re-downloading source video for clip extraction...`);
        await downloadToFile(r2Key, videoPath);
      }

      fs.mkdirSync(clipsDir, { recursive: true });

      const exerciseRecords: NewExercise[] = [];
      const now = new Date().toISOString();

      for (let i = 0; i < realExercises.length; i++) {
        const overviewEx = realExercises[i];
        const detailEx = details[i];
        if (!detailEx) {
          console.warn(`[${sessionId}] No detail for exercise ${i} (${overviewEx.label}), skipping`);
          continue;
        }
        const exerciseId = nanoid();

        const startSec = parseTimestamp(overviewEx.startTimestamp);
        const endSec = parseTimestamp(overviewEx.endTimestamp);
        const clipDuration = endSec - startSec;

        // Extract clip
        const clipFileName = `${exerciseId}.mp4`;
        const clipPath = path.join(clipsDir, clipFileName);
        try {
          await extractClip(videoPath, startSec, endSec, clipPath);

          if (isR2 && fs.existsSync(clipPath)) {
            const r2ClipKey = `clips/${sessionId}/${clipFileName}`;
            const clipBuffer = fs.readFileSync(clipPath);
            await uploadFile(r2ClipKey, clipBuffer, "video/mp4");
          }
        } catch (err) {
          console.error(`Failed to extract clip for exercise ${i}:`, err);
        }

        // Generate thumbnail
        const thumbFileName = `${exerciseId}.jpg`;
        const midpoint = startSec + clipDuration / 2;
        try {
          await generateThumbnail(videoPath, midpoint, clipsDir, thumbFileName);

          const thumbPath = path.join(clipsDir, thumbFileName);
          if (isR2 && fs.existsSync(thumbPath)) {
            const r2ThumbKey = `clips/${sessionId}/${thumbFileName}`;
            const thumbBuffer = fs.readFileSync(thumbPath);
            await uploadFile(r2ThumbKey, thumbBuffer, "image/jpeg");
          }
        } catch (err) {
          console.error(`Failed to generate thumbnail for exercise ${i}:`, err);
        }

        exerciseRecords.push({
          id: exerciseId,
          sessionId,
          startTimestamp: overviewEx.startTimestamp,
          endTimestamp: overviewEx.endTimestamp,
          startSeconds: startSec,
          endSeconds: endSec,
          orderIndex: i,
          name: detailEx.name,
          description: detailEx.description,
          muscleGroups: JSON.stringify(detailEx.muscleGroups),
          equipment: JSON.stringify(detailEx.equipment),
          difficulty: detailEx.difficulty,
          category: detailEx.category,
          repCount: detailEx.repCount,
          setCount: detailEx.setCount,
          formNotes: detailEx.formNotes,
          coachingCues: JSON.stringify(detailEx.coachingCues),
          clipFilePath: `/clips/${sessionId}/${clipFileName}`,
          thumbnailFilePath: `/clips/${sessionId}/${thumbFileName}`,
          clipDurationSeconds: clipDuration,
          isLibraryEntry: true,
          tags: null,
          createdAt: now,
          updatedAt: now,
        });
      }

      // Save exercises to DB
      await createExercises(exerciseRecords);

      await updateSessionStatus(sessionId, "generating_notes", {
        pipelineStage: "clips_extracted",
      });
    }

    // ─── Stage 7: Claude session notes ───
    if (!stageReached(stage, "notes_generated")) {
      console.log(`[${sessionId}] Stage 7: Generating session notes...`);
      await updateSessionStatus(sessionId, "generating_notes");

      let sessionNotes = "";
      try {
        const fullSession = await getSession(sessionId);
        if (fullSession) {
          sessionNotes = await generateSessionNotes(fullSession, fullSession.exercises);
        }
      } catch (err) {
        console.error("Failed to generate session notes:", err);
        sessionNotes = "Session notes generation failed.";
      }

      await updateSessionStatus(sessionId, "generating_notes", {
        pipelineStage: "notes_generated",
        sessionNotes,
      });
    }

    // ─── Stage 8: Claude exercise tagging ───
    console.log(`[${sessionId}] Stage 8: Standardizing and tagging exercises...`);
    try {
      const fullSession = await getSession(sessionId);
      if (fullSession && fullSession.exercises.length > 0) {
        const tagSuggestions = await standardizeAndTagExercises(fullSession.exercises);
        const { updateExercise } = await import("@/lib/db/queries");
        for (const suggestion of tagSuggestions) {
          await updateExercise(suggestion.exerciseId, {
            name: suggestion.standardizedName,
            tags: JSON.stringify(suggestion.tags),
          });
        }
      }
    } catch (err) {
      console.error("Failed to standardize/tag exercises:", err);
    }

    // ─── Complete ───
    await updateSessionStatus(sessionId, "complete", {
      pipelineStage: "complete",
      processingCompletedAt: new Date().toISOString(),
    });

    console.log(`[${sessionId}] Pipeline complete!`);

    // Cleanup Gemini resources on success
    await cleanupGeminiResources(geminiCacheName, geminiFileName);

    return { success: true };
  } catch (error) {
    console.error(`Pipeline failed for session ${sessionId}:`, error);
    await updateSessionStatus(sessionId, "error", {
      processingError: String(error),
      // pipelineStage is preserved from last checkpoint — enables resume on retry
    });

    // Try to clean up Gemini resources on unrecoverable failure
    const latestSession = await getSession(sessionId);
    if (latestSession) {
      // Only clean up if we're past the upload stage (otherwise nothing to clean)
      if (stageReached(latestSession.pipelineStage, "uploaded_to_gemini")) {
        await cleanupGeminiResources(
          latestSession.geminiCacheId,
          latestSession.geminiFileName
        );
      }
    }

    throw error;
  } finally {
    // Release concurrency lock
    currentlyProcessing = null;

    // Clean up temp files for R2 sessions
    if (isR2) {
      try {
        if (analysisVideoPath && analysisVideoPath !== videoPath && fs.existsSync(analysisVideoPath)) {
          fs.unlinkSync(analysisVideoPath);
        }
      } catch (err) {
        console.warn(`Failed to clean up compressed video: ${err}`);
      }
      try {
        if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      } catch (err) {
        console.warn(`Failed to clean up temp video: ${err}`);
      }
      try {
        if (fs.existsSync(clipsDir)) fs.rmSync(clipsDir, { recursive: true });
      } catch (err) {
        console.warn(`Failed to clean up temp clips: ${err}`);
      }
    }
  }
}
