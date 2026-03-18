# Clip-First Pipeline Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the batch-over-full-video analysis pipeline with a clip-first architecture using Gemini 3 Flash, eliminating compression/speedFactor and making the pipeline reliable for 55-minute sessions.

**Architecture:** Upload original video to Gemini for overview analysis at low resolution (~330K tokens). Extract individual clips via FFmpeg. Analyze each clip individually (~18K tokens each). Per-exercise checkpointing via `detailStatus` field enables granular resume.

**Tech Stack:** Next.js 16 / TypeScript / @google/genai SDK / FFmpeg / SQLite (Drizzle ORM) / Cloudflare R2

**Spec:** `docs/superpowers/specs/2026-03-17-clip-first-pipeline-redesign.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/db/index.ts` | Modify | Add `detail_status` column migration, update stuck session recovery for `compressed` stage |
| `src/lib/db/schema.ts` | Modify | Add `detailStatus` field to exercises table |
| `src/lib/db/queries.ts` | Modify | Add `deleteSession()`, `deleteExercise()` queries |
| `src/lib/gemini/client.ts` | Modify | Update model constant, update `DETAIL_TIMEOUT`, export `CLIP_DETAIL_TIMEOUT` |
| `src/lib/gemini/prompts.ts` | Modify | Add primary-subject directive, rewrite `exerciseDetailPrompt()` for clips, remove `allExercisesDetailPrompt()` |
| `src/lib/gemini/analyze-session.ts` | Modify | Rewrite `buildVideoConfig()` (remove temperature, add mediaResolution/thinkingConfig), add `analyzeExerciseClip()`, remove batch functions |
| `src/lib/gemini/schemas.ts` | Modify | Remove `AllExerciseDetailsSchema` (no longer needed) |
| `src/lib/video/ffmpeg.ts` | Modify | Remove `compressForAnalysis()` and related constants |
| `src/lib/processing/pipeline.ts` | Modify | Rewrite pipeline: new STAGE_ORDER, remove compression stage, move clip extraction before detail analysis, per-clip detail analysis with checkpointing |
| `src/app/api/sessions/[sessionId]/route.ts` | Modify | Add DELETE handler |
| `src/app/api/exercises/[exerciseId]/route.ts` | Modify | Add DELETE handler |
| `src/app/sessions/[sessionId]/page.tsx` | Modify | Add delete session button |
| `src/components/exercises/exercise-grid.tsx` | Modify | Pass delete/edit callbacks |
| `src/components/exercises/exercise-detail.tsx` | Modify | Add delete button, add edit mode |

---

## Task 1: Database Schema & Migration

**Files:**
- Modify: `src/lib/db/schema.ts:44-89`
- Modify: `src/lib/db/index.ts:80-101`

- [ ] **Step 1: Add `detailStatus` to exercises schema**

In `src/lib/db/schema.ts`, add the `detailStatus` field to the exercises table after the `tags` field:

```typescript
detailStatus: text("detail_status", {
  enum: ["pending", "complete", "failed"],
}).default("complete"),  // default "complete" for backward compat with existing exercises
```

- [ ] **Step 2: Add `detail_status` to the CREATE TABLE block and migration**

In `src/lib/db/index.ts`, add `detail_status TEXT DEFAULT 'complete'` to the `CREATE TABLE IF NOT EXISTS exercises` block (after the `tags TEXT` line) so fresh deployments get the column:

```sql
      tags TEXT,
      detail_status TEXT DEFAULT 'complete',
      created_at TEXT NOT NULL,
```

Also add to the `migrations` array for existing databases:

```typescript
"ALTER TABLE exercises ADD COLUMN detail_status TEXT DEFAULT 'complete'",
```

- [ ] **Step 3: Update stuck session recovery for old `compressed` stage**

In `src/lib/db/index.ts`, add after the existing stuck session recovery SQL:

```sql
UPDATE sessions
SET pipeline_stage = 'downloaded',
    status = 'error',
    processing_error = 'Pipeline upgraded — old compression stage no longer exists. Click Retry to reprocess.',
    updated_at = datetime('now')
WHERE pipeline_stage = 'compressed'
```

- [ ] **Step 4: Verify the app starts without errors**

Run: `npm run build`
Expected: Build succeeds. The new column is added safely via ALTER TABLE.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/index.ts
git commit -m "feat: add detailStatus to exercises schema, migrate compressed stage"
```

---

## Task 2: Gemini Client — Model & Config Updates

**Files:**
- Modify: `src/lib/gemini/client.ts:10-37`

- [ ] **Step 1: Update model constant**

In `src/lib/gemini/client.ts`, change:

```typescript
export const GEMINI_FLASH_MODEL = "gemini-2.5-flash";
```

to:

```typescript
export const GEMINI_FLASH_MODEL = "gemini-3-flash-preview";
```

- [ ] **Step 2: Add clip detail timeout constant**

Change:

```typescript
const DETAIL_TIMEOUT = 10 * 60 * 1000;   // 10 minutes per detail batch (large video + no cache)
```

to:

```typescript
const DETAIL_TIMEOUT = 10 * 60 * 1000;   // 10 minutes — kept for backward compat reference
const CLIP_DETAIL_TIMEOUT = 3 * 60 * 1000; // 3 minutes per individual clip analysis
```

Update the export:

```typescript
export { OVERVIEW_TIMEOUT, DETAIL_TIMEOUT, CLIP_DETAIL_TIMEOUT };
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/gemini/client.ts
git commit -m "feat: switch to gemini-3-flash-preview, add clip detail timeout"
```

---

## Task 3: Prompts — Primary Subject Directive & Clip-Based Detail

**Files:**
- Modify: `src/lib/gemini/prompts.ts`

- [ ] **Step 1: Add primary-subject directive to overview prompt**

Replace the `OVERVIEW_PROMPT` export with:

```typescript
export const OVERVIEW_PROMPT = `The camera is positioned to record a specific client's training session. Focus ONLY on the primary subject — the person who is clearly the focus of the camera framing and appears throughout the video. Ignore any other people visible in the background or periphery, even if they are exercising.

You are an expert personal trainer and exercise scientist analyzing a recorded training session.

Watch this entire video and identify every distinct exercise performed. For each exercise, provide:
1. The start timestamp (MM:SS format) when this exercise begins
2. The end timestamp (MM:SS format) when this exercise ends
3. A brief label for the exercise (e.g., "Barbell Back Squat", "Plank Hold")
4. Whether this is a rest/transition period

Important rules:
- Include warm-up and cool-down exercises
- Separate distinct sets if there is a meaningful rest period (>30 seconds) between them
- Mark transitions and rest periods with isRestPeriod: true
- Use MM:SS format for all timestamps (e.g., "2:30", "15:45")
- Be precise with timestamps — they will be used to cut video clips
- Group consecutive sets of the same exercise only if they flow together without significant breaks

Also provide:
- totalExerciseCount: the count of exercises (excluding rest periods)
- sessionSummary: a 2-3 sentence overview of the training session

Return your analysis as JSON matching this exact structure:
{
  "exercises": [
    {
      "startTimestamp": "0:00",
      "endTimestamp": "3:30",
      "label": "Exercise Name",
      "isRestPeriod": false
    }
  ],
  "totalExerciseCount": 15,
  "sessionSummary": "Description of the session..."
}`;
```

- [ ] **Step 2: Rewrite `exerciseDetailPrompt()` for clip-based analysis**

Replace the existing `exerciseDetailPrompt()` function with:

```typescript
export function exerciseDetailPrompt(label: string) {
  return `Analyze ONLY the primary subject's performance in this clip. Ignore other people visible in the frame.

You are an expert personal trainer and exercise scientist. This video clip shows a single exercise from a training session. The exercise was identified as: "${label}"

Provide a detailed analysis including:
1. name: The correct, specific exercise name (e.g., "Dumbbell Romanian Deadlift" not just "Deadlift")
2. description: A 2-3 sentence description of how the exercise is being performed
3. muscleGroups: Array of primary muscle groups targeted (use standard anatomy terms)
4. equipment: Array of equipment used (empty array if bodyweight only)
5. difficulty: "beginner", "intermediate", or "advanced"
6. category: One of "strength", "cardio", "flexibility", "warmup", "cooldown", "plyometric"
7. repCount: Number of reps performed (null if not applicable, e.g., for holds or cardio)
8. setCount: Number of sets visible in this clip (null if not clearly distinguishable)
9. formNotes: Brief assessment of the client's exercise form — what looks good and what could improve
10. coachingCues: Array of 2-3 verbal coaching cues a trainer might give

Return as JSON matching this exact structure:
{
  "name": "Exercise Name",
  "description": "Description...",
  "muscleGroups": ["muscle1", "muscle2"],
  "equipment": ["equipment1"],
  "difficulty": "intermediate",
  "category": "strength",
  "repCount": 10,
  "setCount": 3,
  "formNotes": "Form notes...",
  "coachingCues": ["Cue 1", "Cue 2"]
}`;
}
```

- [ ] **Step 3: Remove `allExercisesDetailPrompt()`**

Delete the entire `allExercisesDetailPrompt()` function (lines 70-116). It is no longer needed.

- [ ] **Step 4: Commit**

```bash
git add src/lib/gemini/prompts.ts
git commit -m "feat: add primary-subject directive, rewrite detail prompt for clip analysis"
```

---

## Task 4: Gemini Analysis — Clip-Based Detail Function

**Files:**
- Modify: `src/lib/gemini/analyze-session.ts`
- Modify: `src/lib/gemini/schemas.ts`

- [ ] **Step 1: Update `buildVideoConfig()` — remove temperature, add new config params**

Replace the `buildVideoConfig()` function in `analyze-session.ts` with:

```typescript
/**
 * Build the content config for a Gemini overview call.
 * Uses low media resolution for full-video overview analysis.
 */
function buildOverviewConfig(ref: VideoRef) {
  return {
    config: {
      responseMimeType: "application/json" as const,
      mediaResolution: "low" as const,
      thinkingConfig: { thinkingLevel: "low" as const },
    },
    videoParts: [
      { fileData: { fileUri: ref.fileUri!, mimeType: ref.mimeType || "video/mp4" } },
    ],
  };
}

/**
 * Build the content config for a Gemini clip detail call.
 * Uses medium media resolution for detailed form analysis on short clips.
 */
function buildClipDetailConfig(ref: VideoRef) {
  return {
    config: {
      responseMimeType: "application/json" as const,
      mediaResolution: "medium" as const,
      thinkingConfig: { thinkingLevel: "low" as const },
    },
    videoParts: [
      { fileData: { fileUri: ref.fileUri!, mimeType: ref.mimeType || "video/mp4" } },
    ],
  };
}
```

- [ ] **Step 2: Update `VideoRef` interface — remove `cacheName`**

Replace the `VideoRef` interface:

```typescript
export interface VideoRef {
  fileUri: string;
  mimeType?: string;
}
```

The `cacheName` field is removed — caching is no longer used.

- [ ] **Step 3: Update imports**

Replace the imports at the top of `analyze-session.ts`:

```typescript
import {
  ai,
  GEMINI_FLASH_MODEL,
  uploadVideoToGemini,
  deleteGeminiFile,
  withRetry,
  withTimeout,
  OVERVIEW_TIMEOUT,
  CLIP_DETAIL_TIMEOUT,
} from "./client";
import { OVERVIEW_PROMPT, exerciseDetailPrompt } from "./prompts";
import {
  ExerciseOverviewSchema,
  ExerciseDetailSchema,
  type ExerciseOverview,
  type ExerciseDetail,
} from "./schemas";
```

- [ ] **Step 3: Update `analyzeSessionOverview()` to use `buildOverviewConfig()`**

Replace the function body to use the new config builder:

```typescript
export async function analyzeSessionOverview(
  videoRef: VideoRef,
  callbacks?: AnalysisCallbacks
): Promise<ExerciseOverview> {
  callbacks?.onStatusChange("analyzing", "Running overview analysis...");
  const { config, videoParts } = buildOverviewConfig(videoRef);

  return withRetry(async () => {
    const response = await withTimeout(
      ai.models.generateContent({
        model: GEMINI_FLASH_MODEL,
        contents: [
          {
            role: "user",
            parts: [...videoParts, { text: OVERVIEW_PROMPT }],
          },
        ],
        config,
      }),
      OVERVIEW_TIMEOUT,
      "Gemini overview analysis"
    );

    const text = response.text ?? "";
    const parsed = JSON.parse(text);
    return ExerciseOverviewSchema.parse(parsed);
  }, "overview");
}
```

- [ ] **Step 4: Add `analyzeExerciseClip()` function**

Add this new function after `analyzeSessionOverview()`:

```typescript
/**
 * Analyze a single exercise clip uploaded to Gemini.
 * The clip is a short (1-5 min) video of a single exercise.
 */
export async function analyzeExerciseClip(
  clipRef: VideoRef,
  label: string,
  callbacks?: AnalysisCallbacks
): Promise<ExerciseDetail> {
  callbacks?.onStatusChange("analyzing", `Analyzing clip: ${label}...`);
  const { config, videoParts } = buildClipDetailConfig(clipRef);
  const prompt = exerciseDetailPrompt(label);

  return withRetry(async () => {
    const response = await withTimeout(
      ai.models.generateContent({
        model: GEMINI_FLASH_MODEL,
        contents: [
          {
            role: "user",
            parts: [...videoParts, { text: prompt }],
          },
        ],
        config,
      }),
      CLIP_DETAIL_TIMEOUT,
      `Gemini clip detail (${label})`
    );

    const text = response.text ?? "";
    const parsed = JSON.parse(text);
    return ExerciseDetailSchema.parse(parsed);
  }, `clip-detail-${label}`);
}
```

- [ ] **Step 5: Remove batch analysis functions**

Delete `analyzeExerciseBatch()`, `runDetailAnalysisInBatches()`, and `runFullAnalysis()`. These are replaced by `analyzeExerciseClip()`.

- [ ] **Step 6: Replace `uploadAndCache()` with `uploadToGemini()` and simplify `cleanupGeminiResources()`**

Replace `uploadAndCache()` with this renamed, simplified function:

```typescript
/**
 * Upload video to Gemini for analysis.
 * No caching — the overview pass is a single call, and detail passes use individual clips.
 */
export async function uploadToGemini(
  videoFilePath: string,
  callbacks?: AnalysisCallbacks
) {
  callbacks?.onStatusChange("analyzing", "Uploading video to Gemini...");
  const file = await uploadVideoToGemini(videoFilePath);
  const fileUri = file.uri!;
  const mimeType = file.mimeType || "video/mp4";

  console.log(`[Gemini] File uploaded: ${file.name}, URI: ${fileUri}`);

  return {
    geminiFileUri: fileUri,
    geminiFileName: file.name!,
    geminiMimeType: mimeType,
  };
}
```

Also simplify `cleanupGeminiResources()` — remove cache param since caching is gone:

```typescript
export async function cleanupGeminiResources(fileName?: string | null) {
  if (fileName) await deleteGeminiFile(fileName);
}
```

- [ ] **Step 7: Remove dead cache functions from client.ts**

In `src/lib/gemini/client.ts`, delete `createVideoCache()` (lines 120-155) and `deleteVideoCache()` (lines 157-164). These are no longer used — caching is removed from the architecture. Also remove the `CACHE_TIMEOUT` constant (line 35).

- [ ] **Step 8: Remove `AllExerciseDetailsSchema` from schemas.ts**

In `src/lib/gemini/schemas.ts`, delete lines 41-47 (the `AllExerciseDetailsSchema` and its type export). Keep `ExerciseDetailSchema` — it's still used for individual clip analysis.

- [ ] **Step 8: Verify build**

Run: `npm run build`
Expected: May fail due to pipeline.ts still importing old functions — that's expected and fixed in Task 5.

- [ ] **Step 9: Commit**

```bash
git add src/lib/gemini/analyze-session.ts src/lib/gemini/schemas.ts
git commit -m "feat: add clip-based analysis, remove batch analysis functions"
```

---

## Task 5: Remove Compression from FFmpeg

**Files:**
- Modify: `src/lib/video/ffmpeg.ts`

- [ ] **Step 1: Remove compression constants and function**

Delete the following from `src/lib/video/ffmpeg.ts`:
- `MAX_ANALYSIS_DURATION_SEC` constant (line 160)
- `MAX_TOKENS_ESTIMATE_PER_SEC` constant (line 161)
- `MAX_GEMINI_TOKENS` constant (line 162)
- `CompressionResult` interface (lines 164-167)
- `compressForAnalysis()` function (lines 169-244)

Keep `extractClip()`, `generateThumbnail()`, `getVideoDuration()`, and all helper functions — they're still used.

- [ ] **Step 2: Commit**

```bash
git add src/lib/video/ffmpeg.ts
git commit -m "feat: remove compressForAnalysis and speedFactor constants"
```

---

## Task 6: Rewrite Pipeline

**Files:**
- Modify: `src/lib/processing/pipeline.ts`

This is the largest task. The entire pipeline is rewritten with the new stage ordering.

- [ ] **Step 1: Update imports**

Replace the imports at the top of `pipeline.ts`:

```typescript
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
```

- [ ] **Step 2: Update STAGE_ORDER**

Replace the `STAGE_ORDER` constant:

```typescript
const STAGE_ORDER = [
  "downloaded",
  "uploaded_to_gemini",
  "overview_complete",
  "clips_extracted",
  "details_complete",
  "notes_generated",
  "tags_generated",
  "complete",
] as const;
```

- [ ] **Step 3: Rewrite `processSession()` — Stages 1-2 (Download + Upload to Gemini)**

Replace the entire `processSession()` function. Here is the first part (stages 1-2):

```typescript
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
```

- [ ] **Step 4: Rewrite pipeline — Stage 3 (Overview analysis)**

Continue the function:

```typescript
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
```

- [ ] **Step 5: Rewrite pipeline — Stage 4 (Clip extraction)**

Continue:

```typescript
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
          name: overviewEx.label,         // temporary — overwritten by detail analysis
          description: "",                 // filled by detail analysis
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
```

- [ ] **Step 6: Rewrite pipeline — Stage 5 (Per-clip detail analysis)**

Continue:

```typescript
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
            // Local: clip is already on disk
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
```

`uploadVideoToGemini` and `deleteGeminiFile` are imported from `@/lib/gemini/client` in Step 1's import block.

- [ ] **Step 7: Rewrite pipeline — Stages 6-8 (Notes, Tags, Complete)**

Continue:

```typescript
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

    // ─── Stage 8: Complete ───
    await updateSessionStatus(sessionId, "complete", {
      pipelineStage: "complete",
      processingCompletedAt: new Date().toISOString(),
    });

    console.log(`[${sessionId}] Pipeline complete!`);
    await cleanupGeminiResources(geminiFileName);

    return { success: true };
```

- [ ] **Step 8: Rewrite pipeline — Error handling and cleanup**

Complete the function:

```typescript
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
```

- [ ] **Step 9: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 10: Commit**

```bash
git add src/lib/processing/pipeline.ts
git commit -m "feat: rewrite pipeline to clip-first architecture"
```

---

## Task 7: Delete Session API + R2 Cleanup

**Files:**
- Modify: `src/app/api/sessions/[sessionId]/route.ts`
- Modify: `src/lib/db/queries.ts`

- [ ] **Step 1: Add `deleteSession()` query**

In `src/lib/db/queries.ts`, add:

```typescript
export async function deleteSession(id: string) {
  // Exercises cascade-delete via FK constraint
  return db.delete(sessions).where(eq(sessions.id, id)).returning().get();
}
```

- [ ] **Step 2: Add DELETE handler to session route**

In `src/app/api/sessions/[sessionId]/route.ts`, add the import and handler. Note: `getSession()` already returns exercises via the relation, so no extra query is needed.

```typescript
import { getSession, deleteSession } from "@/lib/db/queries";
import { deleteObject } from "@/lib/r2/client";
import { isProcessing, getProcessingSessionId } from "@/lib/processing/pipeline";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  // Block deletion of currently processing session
  if (isProcessing() && getProcessingSessionId() === sessionId) {
    return NextResponse.json(
      { error: "Cannot delete a session that is currently processing" },
      { status: 409 }
    );
  }

  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Clean up R2 resources
  const isR2 = session.videoFilePath.startsWith("r2://");
  if (isR2) {
    const videoKey = session.videoFilePath.replace("r2://", "");
    await deleteObject(videoKey);

    // Delete all exercise clips and thumbnails (exercises come from getSession relation)
    for (const ex of session.exercises) {
      if (ex.clipFilePath) {
        await deleteObject(`clips/${sessionId}/${ex.id}.mp4`);
      }
      if (ex.thumbnailFilePath) {
        await deleteObject(`clips/${sessionId}/${ex.id}.jpg`);
      }
    }
  }

  await deleteSession(sessionId);
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/sessions/[sessionId]/route.ts src/lib/db/queries.ts
git commit -m "feat: add DELETE session endpoint with R2 cleanup"
```

---

## Task 8: Delete Exercise API

**Files:**
- Modify: `src/app/api/exercises/[exerciseId]/route.ts`
- Modify: `src/lib/db/queries.ts`

- [ ] **Step 1: Add `deleteExercise()` query**

In `src/lib/db/queries.ts`, add:

```typescript
export async function deleteExercise(id: string) {
  return db.delete(exercises).where(eq(exercises.id, id)).returning().get();
}
```

- [ ] **Step 2: Add DELETE handler to exercise route**

In `src/app/api/exercises/[exerciseId]/route.ts`, add:

```typescript
import { getExercise, updateExercise, deleteExercise } from "@/lib/db/queries";
import { deleteObject } from "@/lib/r2/client";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ exerciseId: string }> }
) {
  const { exerciseId } = await params;
  const exercise = await getExercise(exerciseId);

  if (!exercise) {
    return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  }

  // Clean up R2 resources
  if (exercise.clipFilePath) {
    const clipKey = exercise.clipFilePath.replace(/^\//, "");
    await deleteObject(clipKey);
  }
  if (exercise.thumbnailFilePath) {
    const thumbKey = exercise.thumbnailFilePath.replace(/^\//, "");
    await deleteObject(thumbKey);
  }

  await deleteExercise(exerciseId);
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/exercises/[exerciseId]/route.ts src/lib/db/queries.ts
git commit -m "feat: add DELETE exercise endpoint with R2 cleanup"
```

---

## Task 9: Session Detail Page — Delete Button

**Files:**
- Modify: `src/app/sessions/[sessionId]/page.tsx`

- [ ] **Step 1: Create a client component for the delete button**

Since the session page is a server component, we need a small client component. Create the delete button inline or as a component. The simplest approach is to add a client component wrapper. Add to the session page:

Replace the session header section to include a delete button:

```tsx
import { DeleteSessionButton } from "@/components/sessions/delete-session-button";

// In the JSX, replace the header div:
<div className="flex items-start justify-between">
  <div>
    <h1 className="text-2xl font-bold text-foreground">
      {session.title || "Training Session"}
    </h1>
    <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
      {session.clientName && <span>Client: {session.clientName}</span>}
      <span>{new Date(session.recordedAt).toLocaleDateString()}</span>
      {session.durationSeconds && (
        <span>{formatDuration(session.durationSeconds)}</span>
      )}
    </div>
  </div>
  <div className="flex items-center gap-2">
    <DeleteSessionButton sessionId={sessionId} />
    <Badge
      variant="secondary"
      className={
        isComplete
          ? "bg-[#07B492] text-white"
          : session.status === "error"
            ? "bg-red-500 text-white"
            : "bg-[#000075] text-white"
      }
    >
      {session.status}
    </Badge>
  </div>
</div>
```

- [ ] **Step 2: Create `DeleteSessionButton` component**

Create `src/components/sessions/delete-session-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function DeleteSessionButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/sessions");
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete session");
      }
    } catch {
      alert("Failed to delete session");
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="destructive"
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? "Deleting..." : "Confirm"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setConfirming(false)}
          disabled={deleting}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="text-red-500 hover:bg-red-50 hover:text-red-600"
      onClick={() => setConfirming(true)}
    >
      Delete
    </Button>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/sessions/[sessionId]/page.tsx src/components/sessions/delete-session-button.tsx
git commit -m "feat: add delete session button to session detail page"
```

---

## Task 10: Exercise Delete & Edit UI

**Files:**
- Modify: `src/components/exercises/exercise-detail.tsx`
- Modify: `src/components/exercises/exercise-grid.tsx`

- [ ] **Step 1: Add delete and edit functionality to `ExerciseDetail`**

Rewrite `src/components/exercises/exercise-detail.tsx` to include:
- A delete button with confirmation
- An edit mode that allows editing key fields (name, description, muscleGroups, equipment, difficulty, category, formNotes, coachingCues)
- Save button that PATCHes `/api/exercises/[exerciseId]`

Add these features to the existing dialog. The delete button should be at the bottom. The edit toggle should be a button at the top. When in edit mode, text fields become inputs/textareas.

Key changes:
- Add `onDelete?: (id: string) => void` and `onUpdate?: (exercise: Exercise) => void` to props
- Add state: `editing`, `confirmingDelete`, `formData`
- Delete calls `DELETE /api/exercises/${exercise.id}`, then `onDelete(exercise.id)`
- Save calls `PATCH /api/exercises/${exercise.id}`, then `onUpdate(updatedExercise)`

- [ ] **Step 2: Update `ExerciseGrid` to handle delete/update**

Pass callbacks to `ExerciseDetail` and update local state when exercises are deleted or updated.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/exercises/exercise-detail.tsx src/components/exercises/exercise-grid.tsx
git commit -m "feat: add exercise delete and edit functionality"
```

---

## Task 11: Final Build Verification & SDK Check

- [ ] **Step 1: Verify `@google/genai` SDK supports `mediaResolution` and `thinkingConfig`**

Run: `grep -r "mediaResolution\|thinkingConfig\|ThinkingConfig\|MediaResolution" node_modules/@google/genai/dist/ 2>/dev/null | head -20`

If these are not found in the SDK types, we may need to:
- Upgrade the SDK: `npm install @google/genai@latest`
- Or pass them as raw config properties (the SDK may accept unknown keys and pass them through)

- [ ] **Step 2: Full build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Final commit with all remaining changes**

```bash
git add -A
git commit -m "feat: clip-first pipeline redesign complete"
git push origin master
```
