import {
  ai,
  GEMINI_FLASH_MODEL,
  uploadVideoToGemini,
  deleteGeminiFile,
  createVideoCache,
  deleteVideoCache,
  withRetry,
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

export async function analyzeSessionOverview(
  cacheName: string,
  callbacks?: AnalysisCallbacks
): Promise<ExerciseOverview> {
  callbacks?.onStatusChange("analyzing", "Running overview analysis...");

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: GEMINI_FLASH_MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: OVERVIEW_PROMPT }],
        },
      ],
      config: {
        cachedContent: cacheName,
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const text = response.text ?? "";
    const parsed = JSON.parse(text);
    return ExerciseOverviewSchema.parse(parsed);
  }, "overview");
}

export async function analyzeAllExerciseDetails(
  cacheName: string,
  exercises: { startTimestamp: string; endTimestamp: string; label: string }[]
): Promise<ExerciseDetail[]> {
  const prompt = allExercisesDetailPrompt(exercises);

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      // Use flash model for detail pass — higher rate limits,
      // still excellent quality for per-exercise analysis
      model: GEMINI_FLASH_MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      config: {
        cachedContent: cacheName,
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const text = response.text ?? "";
    const parsed = JSON.parse(text);
    const result = AllExerciseDetailsSchema.parse(parsed);

    // Sort by exerciseIndex and strip the index field to return clean ExerciseDetail[]
    const sorted = result.exercises.sort(
      (a, b) => a.exerciseIndex - b.exerciseIndex
    );
    return sorted.map(({ exerciseIndex: _, ...detail }) => detail);
  }, "all-exercise-details");
}

export async function runFullAnalysis(
  videoFilePath: string,
  callbacks?: AnalysisCallbacks
) {
  // Step 1: Upload to Gemini
  callbacks?.onStatusChange("analyzing", "Uploading video to Gemini...");
  const file = await uploadVideoToGemini(videoFilePath);
  const fileUri = file.uri!;
  const mimeType = file.mimeType || "video/mp4";

  // Step 2: Create context cache so subsequent calls use cached tokens
  callbacks?.onStatusChange("analyzing", "Creating video cache...");
  // Cache must use the same model as all generateContent calls
  // Using flash for everything — higher rate limits and caches are model-specific
  const cache = await createVideoCache(fileUri, mimeType, GEMINI_FLASH_MODEL);
  const cacheName = cache.name!;

  try {
    // Step 3: Overview pass (uses flash model via cache)
    const overview = await analyzeSessionOverview(cacheName, callbacks);

    // Step 4: Combined detail pass for all non-rest exercises (uses flash model)
    const realExercises = overview.exercises.filter((e) => !e.isRestPeriod);
    callbacks?.onStatusChange(
      "analyzing",
      `Analyzing ${realExercises.length} exercises in detail...`
    );

    const details = await analyzeAllExerciseDetails(cacheName, realExercises);

    return {
      overview,
      details,
      realExercises,
      geminiFileUri: fileUri,
      geminiFileName: file.name!,
      geminiCacheName: cacheName,
    };
  } finally {
    // Cleanup: delete cache and uploaded file
    await deleteVideoCache(cacheName);
    if (file.name) {
      await deleteGeminiFile(file.name);
    }
  }
}
