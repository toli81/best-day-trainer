import { GoogleGenAI } from "@google/genai";

if (!process.env.GEMINI_API_KEY) {
  console.warn("GEMINI_API_KEY is not set. Gemini features will not work.");
}

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const GEMINI_MODEL = "gemini-2.5-pro";

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
