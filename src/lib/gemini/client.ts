import { GoogleGenAI } from "@google/genai";
import fs from "fs";

if (!process.env.GEMINI_API_KEY) {
  console.warn("GEMINI_API_KEY is not set. Gemini features will not work.");
}

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const GEMINI_MODEL = "gemini-2.5-pro";
export const GEMINI_FLASH_MODEL = "gemini-3-flash-preview";

/**
 * Race a promise against a timeout. Rejects with a clear error if the timeout fires first.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[Timeout] ${label} timed out after ${Math.round(ms / 1000)}s`));
    }, ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

// Timeout constants (milliseconds)
const UPLOAD_TIMEOUT = 10 * 60 * 1000;   // 10 minutes for video upload
const POLL_TIMEOUT = 15 * 60 * 1000;     // 15 minutes for processing poll
const CACHE_TIMEOUT = 5 * 60 * 1000;     // 5 minutes for cache creation
const OVERVIEW_TIMEOUT = 10 * 60 * 1000; // 10 minutes for overview analysis (large video + no cache)
const DETAIL_TIMEOUT = 10 * 60 * 1000;   // 10 minutes — kept for backward compat reference
const CLIP_DETAIL_TIMEOUT = 3 * 60 * 1000; // 3 minutes per individual clip analysis

export { OVERVIEW_TIMEOUT, DETAIL_TIMEOUT, CLIP_DETAIL_TIMEOUT };

export async function uploadVideoToGemini(filePath: string, mimeType = "video/mp4") {
  const fileSize = fs.statSync(filePath).size;
  const fileSizeMB = (fileSize / 1024 / 1024).toFixed(1);
  console.log(`[Gemini] Uploading video to Gemini: ${filePath} (${fileSizeMB}MB)`);

  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const startTime = Date.now();
    try {
      console.log(`[Gemini] Upload attempt ${attempt}/${maxRetries}...`);

      const uploadResult = await withTimeout(
        ai.files.upload({ file: filePath, config: { mimeType } }),
        UPLOAD_TIMEOUT,
        `Gemini upload (${fileSizeMB}MB)`
      );

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[Gemini] Upload completed in ${elapsed}s. File: ${uploadResult.name}, State: ${uploadResult.state}`);

      // Poll for processing completion with overall timeout
      let file = uploadResult;
      const pollStart = Date.now();
      while (file.state === "PROCESSING") {
        if (Date.now() - pollStart > POLL_TIMEOUT) {
          throw new Error(`Gemini file processing timed out after ${Math.round(POLL_TIMEOUT / 60000)} minutes`);
        }
        console.log(`[Gemini] File still processing, waiting 5s...`);
        await new Promise((r) => setTimeout(r, 5000));
        file = await ai.files.get({ name: file.name! });
      }

      if (file.state === "FAILED") {
        throw new Error(`Gemini file processing failed: ${file.name}`);
      }

      console.log(`[Gemini] File ready: ${file.name}, URI: ${file.uri}`);
      return file;

    } catch (error) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(
        `[Gemini] Upload attempt ${attempt} failed after ${elapsed}s:`,
        error instanceof Error ? error.message : String(error)
      );

      if (attempt === maxRetries) {
        throw new Error(
          `Gemini upload failed after ${maxRetries} attempts (file: ${fileSizeMB}MB). ` +
          `Last error: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      // Wait before retry: 10s, 20s, 30s
      const waitSeconds = attempt * 10;
      console.log(`[Gemini] Waiting ${waitSeconds}s before retry...`);
      await new Promise((r) => setTimeout(r, waitSeconds * 1000));
    }
  }

  throw new Error("Unreachable");
}

export async function deleteGeminiFile(name: string) {
  try {
    await ai.files.delete({ name });
  } catch (e) {
    console.warn("Failed to delete Gemini file:", e);
  }
}

/**
 * Create a context cache for a video file so all subsequent API calls
 * reference cached tokens instead of re-ingesting the full video each time.
 * This dramatically reduces token consumption and avoids 429 rate limits.
 *
 * Returns null if the model doesn't support caching (e.g. gemini-2.5-flash).
 */
export async function createVideoCache(
  fileUri: string,
  mimeType: string,
  model: string
) {
  console.log("[Gemini] Creating video cache...");
  try {
    const cache = await withTimeout(
      ai.caches.create({
        model,
        config: {
          contents: [
            {
              role: "user",
              parts: [{ fileData: { fileUri, mimeType } }],
            },
          ],
          ttl: "3600s", // 1 hour — plenty for processing
          displayName: `bdt-session-${Date.now()}`,
        },
      }),
      CACHE_TIMEOUT,
      "Gemini cache creation"
    );

    console.log(`[Gemini] Video cache created: ${cache.name}`);
    return cache;
  } catch (err) {
    const errStr = String(err);
    if (errStr.includes("too large") || errStr.includes("max_total_token_count") || errStr.includes("INVALID_ARGUMENT")) {
      console.warn(`[Gemini] Caching not supported for this model/video, will use direct file reference: ${errStr}`);
      return null;
    }
    throw err; // Re-throw unexpected errors
  }
}

export async function deleteVideoCache(cacheName: string) {
  try {
    await ai.caches.delete({ name: cacheName });
    console.log(`[Gemini] Video cache deleted: ${cacheName}`);
  } catch (e) {
    console.warn("Failed to delete Gemini cache:", e);
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
