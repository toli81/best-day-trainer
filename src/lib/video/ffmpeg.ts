import ffmpeg from "fluent-ffmpeg";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";

// Prefer system ffmpeg (installed via apt in Docker), fall back to ffmpeg-static
function findFfmpegPath(): string | null {
  // Check for system ffmpeg first
  try {
    const systemPath = execSync("which ffmpeg 2>/dev/null || where ffmpeg 2>nul", {
      encoding: "utf-8",
    }).trim().split("\n")[0];
    if (systemPath) return systemPath;
  } catch {
    // Not found on system
  }

  // Fall back to ffmpeg-static npm package
  try {
    const ffmpegStatic = require("ffmpeg-static");
    if (ffmpegStatic) return ffmpegStatic;
  } catch {
    // Package not available
  }

  return null;
}

const ffmpegPath = findFfmpegPath();
if (ffmpegPath) {
  console.log(`[ffmpeg] Using binary: ${ffmpegPath}`);
  ffmpeg.setFfmpegPath(ffmpegPath);
} else {
  console.warn("[ffmpeg] No ffmpeg binary found! Video processing will fail.");
}

export async function extractClip(
  sourceVideoPath: string,
  startSeconds: number,
  endSeconds: number,
  outputPath: string
): Promise<void> {
  const duration = endSeconds - startSeconds;
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    ffmpeg(sourceVideoPath)
      .setStartTime(startSeconds)
      .setDuration(duration)
      // Re-encode to H.264 + AAC for maximum browser compatibility
      // (phones may record in HEVC/H.265 which many browsers can't play)
      .outputOptions([
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-movflags", "+faststart",  // Enable streaming before full download
      ])
      .output(outputPath)
      .on("end", () => {
        console.log(`[ffmpeg] Clip extracted: ${outputPath}`);
        resolve();
      })
      .on("error", (err) => {
        console.error(`[ffmpeg] Clip extraction failed: ${err.message}`);
        reject(err);
      })
      .run();
  });
}

export async function generateThumbnail(
  sourceVideoPath: string,
  timestampSeconds: number,
  outputDir: string,
  filename: string
): Promise<string> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    ffmpeg(sourceVideoPath)
      .screenshots({
        timestamps: [timestampSeconds],
        folder: outputDir,
        filename: filename,
        size: "640x360",
      })
      .on("end", () => {
        console.log(`[ffmpeg] Thumbnail generated: ${path.join(outputDir, filename)}`);
        resolve(path.join(outputDir, filename));
      })
      .on("error", (err) => {
        console.error(`[ffmpeg] Thumbnail generation failed: ${err.message}`);
        reject(err);
      });
  });
}

export async function compressForAnalysis(inputPath: string): Promise<string> {
  const dir = path.dirname(inputPath);
  const ext = path.extname(inputPath);
  const base = path.basename(inputPath, ext);
  const outputPath = path.join(dir, `${base}-analysis${ext}`);

  console.log(`[ffmpeg] Compressing for analysis: ${inputPath} → ${outputPath}`);
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        "-vf", "scale=-2:480",      // 480p height, width auto-even
        "-c:v", "libx264",
        "-preset", "ultrafast",      // Speed over compression efficiency
        "-crf", "32",                // Lower quality is fine for analysis
        "-c:a", "aac",
        "-b:a", "64k",              // Low audio bitrate
        "-movflags", "+faststart",
      ])
      .output(outputPath)
      .on("end", () => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const inputSize = fs.statSync(inputPath).size;
        const outputSize = fs.statSync(outputPath).size;
        const ratio = ((1 - outputSize / inputSize) * 100).toFixed(0);
        console.log(
          `[ffmpeg] Compression complete in ${elapsed}s: ` +
          `${(inputSize / 1024 / 1024).toFixed(0)}MB → ${(outputSize / 1024 / 1024).toFixed(0)}MB (${ratio}% reduction)`
        );
        resolve(outputPath);
      })
      .on("error", (err) => {
        console.error(`[ffmpeg] Compression failed: ${err.message}`);
        reject(err);
      })
      .run();
  });
}

export async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 0);
    });
  });
}
