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
    let parsed = JSON.parse(text);

    // Gemini 3 Flash sometimes returns a raw array instead of the expected object wrapper
    if (Array.isArray(parsed)) {
      console.log(`[Gemini] Overview returned array (${parsed.length} items), wrapping in object`);
      const realExercises = parsed.filter((e: { isRestPeriod?: boolean }) => !e.isRestPeriod);
      parsed = {
        exercises: parsed,
        totalExerciseCount: realExercises.length,
        sessionSummary: "Training session analysis",
      };
    }

    return ExerciseOverviewSchema.parse(parsed);
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
    let parsed = JSON.parse(text);

    // Handle if Gemini wraps the result in an array or {exercises: [...]} wrapper
    if (Array.isArray(parsed)) {
      parsed = parsed[0];
    } else if (parsed.exercises && Array.isArray(parsed.exercises)) {
      parsed = parsed.exercises[0];
    }

    return ExerciseDetailSchema.parse(parsed);
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
