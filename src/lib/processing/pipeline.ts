import { nanoid } from "nanoid";
import path from "path";
import fs from "fs";
import os from "os";
import {
  uploadToGemini,
  analyzeSessionOverview,
  analyzeExerciseClip,
  cleanupGeminiResources,
} from "@/lib/gemini/analyze-session";
import { uploadVideoToGemini, deleteGeminiFile } from "@/lib/gemini/client";
import { extractClip, generateThumbnail, getVideoDuration } from "@/lib/video/ffmpeg";
import { generateSessionNotes } from "@/lib/claude/session-notes";
import { standardizeAndTagExercises } from "@/lib/claude/library-manager";
import { scoreExerciseForms } from "@/lib/claude/form-scoring";
import {
  updateSessionStatus,
  createExercise,
  getSession,
  updateExercise,
} from "@/lib/db/queries";
import { parseTimestamp, formatTimestamp } from "@/lib/utils/timestamps";
import { downloadToFile, uploadFile } from "@/lib/r2/client";
import type { NewExercise } from "@/lib/db/schema";
import type { ExerciseOverview } from "@/lib/gemini/schemas";
import type { AnalysisCallbacks, VideoRef } from "@/lib/gemini/analyze-session";

// Pipeline stage ordering for checkpoint comparison
const STAGE_ORDER = [
  "downloaded",
  "uploaded_to_gemini",
  "overview_complete",
  "clips_extracted",
  "details_complete",
  "notes_generated",
  "tags_generated",
  "form_scored",
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

  let stage = session.pipelineStage as PipelineStage | null;
  if (session.status === "error") {
    console.log(`[${sessionId}] Retrying from error — resuming from stage "${stage}"`);
  }

  const callbacks: AnalysisCallbacks = {
    onStatusChange: async (status, detail) => {
      console.log(`[${sessionId}] ${status}: ${detail}`);
    },
  };

  try {
    await updateSessionStatus(sessionId, "analyzing", {
      processingStartedAt: session.processingStartedAt || new Date().toISOString(),
      processingError: undefined,
    });

    // ─── Stage 1: Download from R2 ───
    if (isR2 && !stageReached(stage, "downloaded")) {
      console.log(`[${sessionId}] Stage 1: Downloading from R2...`);
      await downloadToFile(r2Key, videoPath);

      let duration = 0;
      try { duration = await getVideoDuration(videoPath); } catch { /* ignore */ }
      await updateSessionStatus(sessionId, "analyzing", {
        pipelineStage: "downloaded",
        durationSeconds: duration > 0 ? Math.round(duration) : undefined,
      });
    } else if (isR2 && stageReached(stage, "downloaded") && !fs.existsSync(videoPath)) {
      console.log(`[${sessionId}] Resuming: re-downloading from R2...`);
      await downloadToFile(r2Key, videoPath);
    }

    // ─── Stage 2: Upload original video to Gemini (no compression) ───
    let geminiFileUri = session.geminiFileUri;
    let geminiFileName = session.geminiFileName;
    let geminiMimeType = "video/mp4";

    if (!stageReached(stage, "uploaded_to_gemini")) {
      console.log(`[${sessionId}] Stage 2: Uploading original video to Gemini...`);
      const gemini = await uploadToGemini(videoPath, callbacks);
      geminiFileUri = gemini.geminiFileUri;
      geminiFileName = gemini.geminiFileName;
      geminiMimeType = gemini.geminiMimeType;

      await updateSessionStatus(sessionId, "analyzing", {
        pipelineStage: "uploaded_to_gemini",
        geminiFileUri,
        geminiFileName,
      });
    }

    const videoRef: VideoRef = {
      fileUri: geminiFileUri!,
      mimeType: geminiMimeType,
    };

    // ─── Stage 3: Overview analysis ───
    let overview: ExerciseOverview;

    if (!stageReached(stage, "overview_complete")) {
      console.log(`[${sessionId}] Stage 3: Running overview analysis...`);
      overview = await analyzeSessionOverview(videoRef, callbacks);
      await updateSessionStatus(sessionId, "analyzing", {
        pipelineStage: "overview_complete",
        overviewAnalysis: JSON.stringify(overview),
      });
    } else {
      overview = JSON.parse(session.overviewAnalysis!) as ExerciseOverview;
      console.log(`[${sessionId}] Stage 3: Skipped (overview already complete)`);
    }

    // ─── Stage 4: Extract clips + thumbnails, create exercise records ───
    const realExercises = overview.exercises.filter((e) => !e.isRestPeriod);

    if (!stageReached(stage, "clips_extracted")) {
      console.log(`[${sessionId}] Stage 4: Extracting ${realExercises.length} clips...`);
      await updateSessionStatus(sessionId, "segmenting");

      // Re-download source video if needed
      if (isR2 && !fs.existsSync(videoPath)) {
        console.log(`[${sessionId}] Re-downloading source video for clip extraction...`);
        await downloadToFile(r2Key, videoPath);
      }

      fs.mkdirSync(clipsDir, { recursive: true });
      const now = new Date().toISOString();

      for (let i = 0; i < realExercises.length; i++) {
        const overviewEx = realExercises[i];
        const exerciseId = nanoid();

        // No speedFactor — timestamps are real
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

        // Create exercise record with detailStatus = "pending"
        await createExercise({
          id: exerciseId,
          sessionId,
          startTimestamp: overviewEx.startTimestamp,
          endTimestamp: overviewEx.endTimestamp,
          startSeconds: startSec,
          endSeconds: endSec,
          orderIndex: i,
          name: overviewEx.label,
          description: "",
          clipFilePath: `/clips/${sessionId}/${clipFileName}`,
          thumbnailFilePath: `/clips/${sessionId}/${thumbFileName}`,
          clipDurationSeconds: clipDuration,
          isLibraryEntry: true,
          tags: null,
          detailStatus: "pending",
          createdAt: now,
          updatedAt: now,
        });
      }

      await updateSessionStatus(sessionId, "analyzing", {
        pipelineStage: "clips_extracted",
      });
    }

    // ─── Stage 5: Per-clip detail analysis ───
    if (!stageReached(stage, "details_complete")) {
      console.log(`[${sessionId}] Stage 5: Running per-clip detail analysis...`);

      // Get exercises that still need detail analysis
      const fullSession = await getSession(sessionId);
      const pendingExercises = (fullSession?.exercises || []).filter(
        (ex) => ex.detailStatus !== "complete"
      );

      console.log(`[${sessionId}] ${pendingExercises.length} exercises need detail analysis`);

      for (const exercise of pendingExercises) {
        try {
          // Download clip from R2 (don't rely on /tmp)
          const clipTmpPath = path.join(os.tmpdir(), `bdt-clip-${exercise.id}.mp4`);
          if (isR2) {
            const clipR2Key = `clips/${sessionId}/${exercise.id}.mp4`;
            await downloadToFile(clipR2Key, clipTmpPath);
          } else {
            const localClipPath = path.join(process.cwd(), "public", exercise.clipFilePath!);
            fs.copyFileSync(localClipPath, clipTmpPath);
          }

          // Upload clip to Gemini
          const clipFile = await uploadVideoToGemini(clipTmpPath);
          const clipRef: VideoRef = {
            fileUri: clipFile.uri!,
            mimeType: clipFile.mimeType || "video/mp4",
          };

          // Analyze
          const detail = await analyzeExerciseClip(clipRef, exercise.name, callbacks);

          // Save detail to exercise record
          await updateExercise(exercise.id, {
            name: detail.name,
            description: detail.description,
            muscleGroups: JSON.stringify(detail.muscleGroups),
            equipment: JSON.stringify(detail.equipment),
            difficulty: detail.difficulty,
            category: detail.category,
            repCount: detail.repCount,
            setCount: detail.setCount,
            formNotes: detail.formNotes,
            coachingCues: JSON.stringify(detail.coachingCues),
            detailStatus: "complete",
          });

          // Clean up Gemini file and temp clip
          await deleteGeminiFile(clipFile.name!);
          try { fs.unlinkSync(clipTmpPath); } catch { /* ignore */ }

          console.log(`[${sessionId}] Detail complete for: ${detail.name}`);

          // Rate limit courtesy pause
          await new Promise((r) => setTimeout(r, 1500));

        } catch (err) {
          console.error(`[${sessionId}] Detail analysis failed for exercise ${exercise.id}:`, err);
          await updateExercise(exercise.id, { detailStatus: "failed" });
        }
      }

      await updateSessionStatus(sessionId, "generating_notes", {
        pipelineStage: "details_complete",
      });
    }

    // ─── Stage 6: Claude session notes ───
    if (!stageReached(stage, "notes_generated")) {
      console.log(`[${sessionId}] Stage 6: Generating session notes...`);
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

    // ─── Stage 7: Claude exercise tagging ───
    if (!stageReached(stage, "tags_generated")) {
      console.log(`[${sessionId}] Stage 7: Standardizing and tagging exercises...`);
      try {
        const fullSession = await getSession(sessionId);
        if (fullSession && fullSession.exercises.length > 0) {
          const tagSuggestions = await standardizeAndTagExercises(fullSession.exercises);
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

      await updateSessionStatus(sessionId, "generating_notes", {
        pipelineStage: "tags_generated",
      });
    }

    // ─── Stage 8: Claude form scoring ───
    if (!stageReached(stage, "form_scored")) {
      console.log(`[${sessionId}] Stage 8: Scoring exercise forms...`);
      try {
        const fullSession = await getSession(sessionId);
        if (fullSession && fullSession.exercises.length > 0) {
          const scores = await scoreExerciseForms(fullSession.exercises);
          for (const s of scores) {
            await updateExercise(s.exerciseId, { formScore: s.score });
          }
          console.log(`[${sessionId}] Scored ${scores.length} exercises`);
        }
      } catch (err) {
        console.error("Failed to score exercise forms:", err);
      }

      await updateSessionStatus(sessionId, "generating_notes", {
        pipelineStage: "form_scored",
      });
    }

    // ─── Stage 9: Complete ───
    await updateSessionStatus(sessionId, "complete", {
      pipelineStage: "complete",
      processingCompletedAt: new Date().toISOString(),
    });

    console.log(`[${sessionId}] Pipeline complete!`);
    await cleanupGeminiResources(geminiFileName);

    return { success: true };
  } catch (error) {
    console.error(`Pipeline failed for session ${sessionId}:`, error);
    await updateSessionStatus(sessionId, "error", {
      processingError: String(error),
    });

    // Clean up Gemini file on failure
    const latestSession = await getSession(sessionId);
    if (latestSession?.geminiFileName) {
      await cleanupGeminiResources(latestSession.geminiFileName);
    }

    throw error;
  } finally {
    currentlyProcessing = null;

    // Clean up temp files
    if (isR2) {
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
