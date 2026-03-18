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
import { MediaResolution, ThinkingLevel } from "@google/genai";
import { OVERVIEW_PROMPT, exerciseDetailPrompt } from "./prompts";
import {
  ExerciseOverviewSchema,
  ExerciseDetailSchema,
  type ExerciseOverview,
  type ExerciseDetail,
} from "./schemas";

export interface AnalysisCallbacks {
  onStatusChange: (status: string, detail?: string) => void;
}

/**
 * Video reference for analysis — direct file URI.
 */
export interface VideoRef {
  fileUri: string;
  mimeType?: string;
}

/**
 * Build the content config for a Gemini overview call.
 * Uses low media resolution for full-video overview analysis.
 */
function buildOverviewConfig(ref: VideoRef) {
  return {
    config: {
      responseMimeType: "application/json" as const,
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
    videoParts: [
      { fileData: { fileUri: ref.fileUri, mimeType: ref.mimeType || "video/mp4" } },
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
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
    videoParts: [
      { fileData: { fileUri: ref.fileUri, mimeType: ref.mimeType || "video/mp4" } },
    ],
  };
}

/**
 * Normalize an exercise item from Gemini's response to match our expected schema.
 * Gemini 3 Flash may use snake_case, different field names, or nested structures.
 */
function normalizeOverviewExercise(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    startTimestamp: raw.startTimestamp ?? raw.start_timestamp ?? raw.startTime ?? raw.start_time ?? raw.start ?? "",
    endTimestamp: raw.endTimestamp ?? raw.end_timestamp ?? raw.endTime ?? raw.end_time ?? raw.end ?? "",
    label: raw.label ?? raw.name ?? raw.exercise_name ?? raw.exerciseName ?? raw.title ?? "",
    isRestPeriod: raw.isRestPeriod ?? raw.is_rest_period ?? raw.isRest ?? raw.is_rest ?? raw.rest ?? false,
  };
}

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
    console.log(`[Gemini] Raw overview response (first 500 chars): ${text.substring(0, 500)}`);
    let parsed = JSON.parse(text);

    // Handle raw array response
    if (Array.isArray(parsed)) {
      console.log(`[Gemini] Overview returned array (${parsed.length} items), wrapping in object`);
      parsed = { exercises: parsed };
    }

    // Normalize the exercises array — handle different field naming conventions
    const rawExercises = parsed.exercises ?? parsed.exercise_list ?? parsed.items ?? [];
    const normalizedExercises = rawExercises.map((e: Record<string, unknown>) => normalizeOverviewExercise(e));

    const realExercises = normalizedExercises.filter((e: Record<string, unknown>) => !e.isRestPeriod);
    const result = {
      exercises: normalizedExercises,
      totalExerciseCount: parsed.totalExerciseCount ?? parsed.total_exercise_count ?? parsed.exerciseCount ?? realExercises.length,
      sessionSummary: parsed.sessionSummary ?? parsed.session_summary ?? parsed.summary ?? "Training session analysis",
    };

    console.log(`[Gemini] Normalized overview: ${result.exercises.length} exercises, ${result.totalExerciseCount} non-rest`);
    return ExerciseOverviewSchema.parse(result);
  }, "overview");
}

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
    console.log(`[Gemini] Raw detail response for "${label}" (first 500 chars): ${text.substring(0, 500)}`);
    let parsed = JSON.parse(text);

    // Handle if Gemini wraps the result in an array or {exercises: [...]} wrapper
    if (Array.isArray(parsed)) {
      parsed = parsed[0];
    } else if (parsed.exercises && Array.isArray(parsed.exercises)) {
      parsed = parsed.exercises[0];
    }

    // Normalize field names (handle snake_case variants)
    const normalized = {
      name: parsed.name ?? parsed.exercise_name ?? label,
      description: parsed.description ?? parsed.exercise_description ?? "",
      muscleGroups: parsed.muscleGroups ?? parsed.muscle_groups ?? [],
      equipment: parsed.equipment ?? [],
      difficulty: parsed.difficulty ?? "intermediate",
      category: parsed.category ?? "strength",
      repCount: parsed.repCount ?? parsed.rep_count ?? parsed.reps ?? null,
      setCount: parsed.setCount ?? parsed.set_count ?? parsed.sets ?? null,
      formNotes: parsed.formNotes ?? parsed.form_notes ?? "",
      coachingCues: parsed.coachingCues ?? parsed.coaching_cues ?? [],
    };

    return ExerciseDetailSchema.parse(normalized);
  }, `clip-detail-${label}`);
}

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

/**
 * Clean up Gemini resources (uploaded file).
 */
export async function cleanupGeminiResources(fileName?: string | null) {
  if (fileName) await deleteGeminiFile(fileName);
}
