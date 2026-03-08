import { nanoid } from "nanoid";
import path from "path";
import { runFullAnalysis } from "@/lib/gemini/analyze-session";
import { extractClip, generateThumbnail, getVideoDuration } from "@/lib/video/ffmpeg";
import { generateSessionNotes } from "@/lib/claude/session-notes";
import { standardizeAndTagExercises } from "@/lib/claude/library-manager";
import { updateSessionStatus, createExercises, getSession } from "@/lib/db/queries";
import { parseTimestamp } from "@/lib/utils/timestamps";
import type { NewExercise } from "@/lib/db/schema";

export async function processSession(sessionId: string) {
  const session = await getSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const videoPath = session.videoFilePath;
  const clipsDir = path.join(process.cwd(), "public", "clips", sessionId);

  try {
    // Update status
    await updateSessionStatus(sessionId, "analyzing", {
      processingStartedAt: new Date().toISOString(),
    });

    // Get video duration
    let duration: number;
    try {
      duration = await getVideoDuration(videoPath);
    } catch {
      duration = 0;
    }

    if (duration > 0) {
      await updateSessionStatus(sessionId, "analyzing", {
        durationSeconds: Math.round(duration),
      });
    }

    // Run Gemini analysis (overview + per-exercise detail)
    const analysis = await runFullAnalysis(videoPath, {
      onStatusChange: async (status, detail) => {
        console.log(`[${sessionId}] ${status}: ${detail}`);
      },
    });

    // Save overview
    await updateSessionStatus(sessionId, "segmenting", {
      overviewAnalysis: JSON.stringify(analysis.overview),
      geminiFileUri: analysis.geminiFileUri,
    });

    // Extract clips and thumbnails with FFmpeg
    const exerciseRecords: NewExercise[] = [];
    const now = new Date().toISOString();

    for (let i = 0; i < analysis.realExercises.length; i++) {
      const overviewEx = analysis.realExercises[i];
      const detailEx = analysis.details[i];
      const exerciseId = nanoid();

      const startSec = parseTimestamp(overviewEx.startTimestamp);
      const endSec = parseTimestamp(overviewEx.endTimestamp);
      const clipDuration = endSec - startSec;

      // Extract clip
      const clipFileName = `${exerciseId}.mp4`;
      const clipPath = path.join(clipsDir, clipFileName);
      try {
        await extractClip(videoPath, startSec, endSec, clipPath);
      } catch (err) {
        console.error(`Failed to extract clip for exercise ${i}:`, err);
      }

      // Generate thumbnail
      const thumbFileName = `${exerciseId}.jpg`;
      const midpoint = startSec + clipDuration / 2;
      try {
        await generateThumbnail(videoPath, midpoint, clipsDir, thumbFileName);
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
    const savedExercises = await createExercises(exerciseRecords);

    // Claude: Generate session notes
    await updateSessionStatus(sessionId, "generating_notes");
    let sessionNotes = "";
    try {
      const fullSession = await getSession(sessionId);
      if (fullSession) {
        sessionNotes = await generateSessionNotes(fullSession, savedExercises);
      }
    } catch (err) {
      console.error("Failed to generate session notes:", err);
      sessionNotes = "Session notes generation failed.";
    }

    // Claude: Standardize names and auto-tag
    try {
      const tagSuggestions = await standardizeAndTagExercises(savedExercises);
      // Apply suggestions to DB (we import updateExercise dynamically to avoid circular deps)
      const { updateExercise } = await import("@/lib/db/queries");
      for (const suggestion of tagSuggestions) {
        await updateExercise(suggestion.exerciseId, {
          name: suggestion.standardizedName,
          tags: JSON.stringify(suggestion.tags),
        });
      }
    } catch (err) {
      console.error("Failed to standardize/tag exercises:", err);
    }

    // Mark complete
    await updateSessionStatus(sessionId, "complete", {
      processingCompletedAt: new Date().toISOString(),
      sessionNotes,
      durationSeconds: duration > 0 ? Math.round(duration) : undefined,
    });

    return { success: true, exerciseCount: savedExercises.length };
  } catch (error) {
    console.error(`Pipeline failed for session ${sessionId}:`, error);
    await updateSessionStatus(sessionId, "error", {
      processingError: String(error),
    });
    throw error;
  }
}
