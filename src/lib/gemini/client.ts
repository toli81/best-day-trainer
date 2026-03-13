import { GoogleGenAI } from "@google/genai";

if (!process.env.GEMINI_API_KEY) {
  console.warn("GEMINI_API_KEY is not set. Gemini features will not work.");
}

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const GEMINI_MODEL = "gemini-2.5-pro";
export const GEMINI_FLASH_MODEL = "gemini-2.5-flash";

export async function uploadVideoToGemini(filePath: string, mimeType = "video/mp4") {
  const uploadResult = await ai.files.upload({
    file: filePath,
    config: { mimeType },
  });

  let file = uploadResult;
  while (file.state === "PROCESSING") {
    await new Promise((r) => setTimeout(r, 5000));
    file = await ai.files.get({ name: file.name! });
  }

  if (file.state === "FAILED") {
    throw new Error(`Gemini file processing failed: ${file.name}`);
  }

  return file;
}

export async function deleteGeminiFile(name: string) {
  try {
    await ai.files.delete({ name });
  } catch (e) {
    console.warn("Failed to delete Gemini file:", e);
  }
}

/**
 * Retry wrapper for Gemini API calls that handles 429 rate limit errors.
 * Extracts retryDelay from error when available, otherwise uses exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const errStr = String(error);
      const is429 = errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED");

      if (!is429 || attempt === maxRetries) {
        throw error;
      }

      // Try to extract retryDelay from the error message
      let waitSeconds = 30 * (attempt + 1); // default: 30s, 60s, 90s
      const retryMatch = errStr.match(/retryDelay.*?(\d+\.?\d*)s/);
      if (retryMatch) {
        waitSeconds = Math.ceil(parseFloat(retryMatch[1])) + 5; // add 5s buffer
      }

      console.log(
        `[Gemini] ${label}: Rate limited (attempt ${attempt + 1}/${maxRetries + 1}). ` +
        `Waiting ${waitSeconds}s before retry...`
      );
      await new Promise((r) => setTimeout(r, waitSeconds * 1000));
    }
  }
  throw new Error("Unreachable");
}

/**
 * Wait between Gemini calls to avoid hitting rate limits on large videos.
 */
export async function rateLimitDelay(seconds: number, label?: string) {
  if (label) {
    console.log(`[Gemini] Waiting ${seconds}s before ${label} to avoid rate limits...`);
  }
  await new Promise((r) => setTimeout(r, seconds * 1000));
}
