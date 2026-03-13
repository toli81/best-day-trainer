import {
  ai,
  GEMINI_MODEL,
  GEMINI_FLASH_MODEL,
  uploadVideoToGemini,
  deleteGeminiFile,
  withRetry,
  rateLimitDelay,
} from "./client";
import { OVERVIEW_PROMPT, exerciseDetailPrompt } from "./prompts";
import {
  ExerciseOverviewSchema,
  ExerciseDetailSchema,
  type ExerciseOverview,
  type ExerciseDetail,
  type ExerciseOverviewItem,
} from "./schemas";

export interface AnalysisCallbacks {
  onStatusChange: (status: string, detail?: string) => void;
}

export async function analyzeSessionOverview(
  fileUri: string,
  mimeType: string,
  callbacks?: AnalysisCallbacks
): Promise<ExerciseOverview> {
  callbacks?.onStatusChange("analyzing", "Running overview analysis...");

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { fileData: { fileUri, mimeType } },
            { text: OVERVIEW_PROMPT },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const text = response.text ?? "";
    const parsed = JSON.parse(text);
    return ExerciseOverviewSchema.parse(parsed);
  }, "overview");
}

export async function analyzeExerciseDetail(
  fileUri: string,
  mimeType: string,
  exercise: ExerciseOverviewItem
): Promise<ExerciseDetail> {
  const prompt = exerciseDetailPrompt(
    exercise.startTimestamp,
    exercise.endTimestamp,
    exercise.label
  );

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      // Use flash model for detail passes — much higher rate limits,
      // still excellent quality for per-exercise analysis
      model: GEMINI_FLASH_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { fileData: { fileUri, mimeType } },
            { text: prompt },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const text = response.text ?? "";
    const parsed = JSON.parse(text);
    return ExerciseDetailSchema.parse(parsed);
  }, `detail:${exercise.label}`);
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

  try {
    // Step 2: Overview pass (uses pro model)
    const overview = await analyzeSessionOverview(fileUri, mimeType, callbacks);

    // Step 3: Detail pass for each non-rest exercise (uses flash model)
    const realExercises = overview.exercises.filter((e) => !e.isRestPeriod);
    callbacks?.onStatusChange(
      "analyzing",
      `Analyzing ${realExercises.length} exercises in detail...`
    );

    // Wait after overview before starting detail passes to let quota recover
    await rateLimitDelay(15, "detail analysis passes");

    const details: ExerciseDetail[] = [];
    for (let i = 0; i < realExercises.length; i++) {
      const ex = realExercises[i];
      callbacks?.onStatusChange(
        "analyzing",
        `Analyzing exercise ${i + 1}/${realExercises.length}: ${ex.label}`
      );
      const detail = await analyzeExerciseDetail(fileUri, mimeType, ex);
      details.push(detail);

      // Small delay between detail calls to avoid burst rate limits
      if (i < realExercises.length - 1) {
        await rateLimitDelay(5, `exercise ${i + 2}`);
      }
    }

    return {
      overview,
      details,
      realExercises,
      geminiFileUri: fileUri,
      geminiFileName: file.name!,
    };
  } finally {
    // Cleanup Gemini file
    if (file.name) {
      await deleteGeminiFile(file.name);
    }
  }
}
