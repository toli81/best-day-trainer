import {
  ai,
  GEMINI_FLASH_MODEL,
  uploadVideoToGemini,
  deleteGeminiFile,
  createVideoCache,
  deleteVideoCache,
  withRetry,
  withTimeout,
  OVERVIEW_TIMEOUT,
  DETAIL_TIMEOUT,
} from "./client";
import { OVERVIEW_PROMPT, allExercisesDetailPrompt } from "./prompts";
import {
  ExerciseOverviewSchema,
  AllExerciseDetailsSchema,
  type ExerciseOverview,
  type ExerciseDetail,
} from "./schemas";

export interface AnalysisCallbacks {
  onStatusChange: (status: string, detail?: string) => void;
}

/**
 * Video reference for analysis — either a cache name or direct file URI.
 * When caching isn't supported (e.g. gemini-2.5-flash), we pass the file inline.
 */
export interface VideoRef {
  cacheName?: string | null;
  fileUri?: string;
  mimeType?: string;
}

/**
 * Build the content config for a Gemini call.
 * Uses cached content when available, otherwise inlines the video file.
 */
function buildVideoConfig(ref: VideoRef) {
  if (ref.cacheName) {
    return {
      config: {
        cachedContent: ref.cacheName,
        responseMimeType: "application/json" as const,
        temperature: 0.1,
      },
      videoParts: [] as { fileData: { fileUri: string; mimeType: string } }[],
    };
  }
  // Direct file reference — include video as a part in the request
  return {
    config: {
      responseMimeType: "application/json" as const,
      temperature: 0.1,
    },
    videoParts: [
      { fileData: { fileUri: ref.fileUri!, mimeType: ref.mimeType || "video/mp4" } },
    ],
  };
}

export async function analyzeSessionOverview(
  videoRef: VideoRef,
  callbacks?: AnalysisCallbacks
): Promise<ExerciseOverview> {
  callbacks?.onStatusChange("analyzing", "Running overview analysis...");
  const { config, videoParts } = buildVideoConfig(videoRef);

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

/**
 * Analyze a batch of exercises (typically 3 at a time) instead of all at once.
 * This reduces inference time, token payload, and failure rate per call.
 */
export async function analyzeExerciseBatch(
  videoRef: VideoRef,
  exercises: { startTimestamp: string; endTimestamp: string; label: string }[]
): Promise<ExerciseDetail[]> {
  const prompt = allExercisesDetailPrompt(exercises);
  const { config, videoParts } = buildVideoConfig(videoRef);

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
      DETAIL_TIMEOUT,
      `Gemini detail batch (${exercises.length} exercises)`
    );

    const text = response.text ?? "";
    const parsed = JSON.parse(text);
    const result = AllExerciseDetailsSchema.parse(parsed);

    // Sort by exerciseIndex and strip the index field
    const sorted = result.exercises.sort(
      (a, b) => a.exerciseIndex - b.exerciseIndex
    );
    return sorted.map(({ exerciseIndex: _, ...detail }) => detail);
  }, `detail-batch-${exercises[0]?.label ?? "unknown"}`);
}

/**
 * Run detail analysis in sequential batches of `batchSize` exercises.
 * Sequential to avoid Gemini rate limits on the same cache.
 * If a batch fails, we know exactly which exercises succeeded.
 */
export async function runDetailAnalysisInBatches(
  videoRef: VideoRef,
  exercises: { startTimestamp: string; endTimestamp: string; label: string }[],
  callbacks?: AnalysisCallbacks,
  batchSize = 3
): Promise<ExerciseDetail[]> {
  const allDetails: ExerciseDetail[] = [];
  const totalBatches = Math.ceil(exercises.length / batchSize);

  for (let i = 0; i < exercises.length; i += batchSize) {
    const batch = exercises.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;

    callbacks?.onStatusChange(
      "analyzing",
      `Analyzing exercises batch ${batchNum}/${totalBatches} (${batch.map(e => e.label).join(", ")})...`
    );

    console.log(`[Gemini] Detail batch ${batchNum}/${totalBatches}: ${batch.map(e => e.label).join(", ")}`);
    const batchDetails = await analyzeExerciseBatch(videoRef, batch);
    allDetails.push(...batchDetails);

    // Brief pause between batches to avoid rate limits
    if (i + batchSize < exercises.length) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return allDetails;
}

/**
 * Upload video to Gemini and create context cache.
 * Returns handles for the pipeline to persist and manage cleanup.
 */
export async function uploadAndCache(
  videoFilePath: string,
  callbacks?: AnalysisCallbacks
) {
  // Step 1: Upload to Gemini
  callbacks?.onStatusChange("analyzing", "Uploading video to Gemini...");
  const file = await uploadVideoToGemini(videoFilePath);
  const fileUri = file.uri!;
  const mimeType = file.mimeType || "video/mp4";

  // Step 2: Try context cache (may return null if model doesn't support it)
  callbacks?.onStatusChange("analyzing", "Creating video cache...");
  const cache = await createVideoCache(fileUri, mimeType, GEMINI_FLASH_MODEL);

  return {
    geminiFileUri: fileUri,
    geminiFileName: file.name!,
    geminiCacheName: cache?.name ?? null,
    geminiMimeType: mimeType,
  };
}

/**
 * Clean up Gemini resources (cache + uploaded file).
 * Called by the pipeline after all processing is complete or on unrecoverable failure.
 */
export async function cleanupGeminiResources(
  cacheName?: string | null,
  fileName?: string | null
) {
  if (cacheName) await deleteVideoCache(cacheName);
  if (fileName) await deleteGeminiFile(fileName);
}

// Keep the old function for backward compatibility but it now delegates to the new functions
export async function runFullAnalysis(
  videoFilePath: string,
  callbacks?: AnalysisCallbacks
) {
  const { geminiFileUri, geminiFileName, geminiCacheName, geminiMimeType } =
    await uploadAndCache(videoFilePath, callbacks);

  const videoRef: VideoRef = {
    cacheName: geminiCacheName,
    fileUri: geminiFileUri,
    mimeType: geminiMimeType,
  };

  // Overview pass
  const overview = await analyzeSessionOverview(videoRef, callbacks);

  // Detail pass in batches
  const realExercises = overview.exercises.filter((e) => !e.isRestPeriod);
  const details = await runDetailAnalysisInBatches(
    videoRef,
    realExercises,
    callbacks
  );

  // NOTE: No cleanup here — the pipeline owns cleanup now
  return {
    overview,
    details,
    realExercises,
    geminiFileUri,
    geminiFileName,
    geminiCacheName,
  };
}
