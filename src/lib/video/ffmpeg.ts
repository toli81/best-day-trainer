import ffmpeg from "fluent-ffmpeg";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";

// Timeout constants
const COMPRESS_TIMEOUT = 10 * 60 * 1000;  // 10 minutes for compression
const CLIP_TIMEOUT = 3 * 60 * 1000;       // 3 minutes per clip
const THUMBNAIL_TIMEOUT = 30 * 1000;       // 30 seconds per thumbnail

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

/**
 * Wraps an FFmpeg command promise with a timeout that kills the process.
 */
function withFfmpegTimeout<T>(
  fn: (onCommand: (cmd: ffmpeg.FfmpegCommand) => void) => Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    let cmd: ffmpeg.FfmpegCommand | null = null;
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        if (cmd) {
          try { cmd.kill("SIGKILL"); } catch { /* ignore */ }
        }
        reject(new Error(`[Timeout] ${label} timed out after ${Math.round(timeoutMs / 1000)}s`));
      }
    }, timeoutMs);

    fn((c) => { cmd = c; }).then(
      (val) => { if (!settled) { settled = true; clearTimeout(timer); resolve(val); } },
      (err) => { if (!settled) { settled = true; clearTimeout(timer); reject(err); } },
    );
  });
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

  return withFfmpegTimeout(
    (onCommand) =>
      new Promise((resolve, reject) => {
        const cmd = ffmpeg(sourceVideoPath)
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
          });
        onCommand(cmd);
        cmd.run();
      }),
    CLIP_TIMEOUT,
    `Clip extraction (${startSeconds}s-${endSeconds}s)`
  );
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

  return withFfmpegTimeout(
    (onCommand) =>
      new Promise((resolve, reject) => {
        const cmd = ffmpeg(sourceVideoPath)
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
        onCommand(cmd);
      }),
    THUMBNAIL_TIMEOUT,
    `Thumbnail at ${timestampSeconds}s`
  );
}

/**
 * Gemini token budget:
 * - Video: ~258 tokens per second (1 fps sampling)
 * - Audio: ~32 tokens per second
 * - Max context: 1,048,576 tokens
 *
 * With audio stripped, we can fit ~4,064 seconds (~67 min).
 * We target 3,800 seconds (~63 min) to leave headroom for the prompt.
 * If the video is longer, we speed it up proportionally.
 */
const MAX_ANALYSIS_DURATION_SEC = 2400; // ~40 min target — gives plenty of headroom under 1M token limit
const MAX_TOKENS_ESTIMATE_PER_SEC = 263; // ~258 video + ~5 overhead per second (audio stripped)
const MAX_GEMINI_TOKENS = 1_048_576;

export interface CompressionResult {
  outputPath: string;
  speedFactor: number; // 1.0 = normal speed, 1.5 = 50% faster, etc.
}

export async function compressForAnalysis(inputPath: string): Promise<CompressionResult> {
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  // Always output as .mp4 — input may be .webm which can't hold H.264
  const outputPath = path.join(dir, `${base}-analysis.mp4`);

  // Get duration to determine if we need to speed up
  const duration = await getVideoDuration(inputPath);
  let speedFactor = 1.0;
  if (duration > MAX_ANALYSIS_DURATION_SEC) {
    speedFactor = Math.ceil((duration / MAX_ANALYSIS_DURATION_SEC) * 10) / 10; // round up to 1 decimal
    console.log(`[ffmpeg] Video is ${Math.round(duration)}s (${(duration/60).toFixed(1)}min), ` +
      `exceeds ${MAX_ANALYSIS_DURATION_SEC}s limit. Speeding up ${speedFactor}x for analysis.`);
  }

  // Build video filter chain
  const vfParts = ["scale=-2:480"];
  if (speedFactor > 1.0) {
    vfParts.push(`setpts=${(1 / speedFactor).toFixed(4)}*PTS`);
  }
  const vf = vfParts.join(",");

  console.log(`[ffmpeg] Compressing for analysis: ${inputPath} → ${outputPath} (speed=${speedFactor}x)`);
  const startTime = Date.now();

  const result = await withFfmpegTimeout(
    (onCommand) =>
      new Promise<string>((resolve, reject) => {
        const cmd = ffmpeg(inputPath)
          .outputOptions([
            "-vf", vf,
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "32",
            "-an",                         // Strip audio — not needed for exercise analysis
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
          });
        onCommand(cmd);
        cmd.run();
      }),
    COMPRESS_TIMEOUT,
    "Video compression"
  );

  // Verify the output video duration is under the token limit
  try {
    const outputDuration = await getVideoDuration(result);
    const estimatedTokens = Math.round(outputDuration * MAX_TOKENS_ESTIMATE_PER_SEC);
    console.log(
      `[ffmpeg] Post-compression check: ${Math.round(outputDuration)}s duration, ` +
      `~${(estimatedTokens / 1000).toFixed(0)}K estimated tokens (limit: ${(MAX_GEMINI_TOKENS / 1000).toFixed(0)}K)`
    );
    if (estimatedTokens > MAX_GEMINI_TOKENS * 0.9) {
      console.warn(`[ffmpeg] WARNING: Compressed video may still exceed token limit!`);
    }
  } catch (err) {
    console.warn(`[ffmpeg] Could not verify output duration:`, err);
  }

  return { outputPath: result, speedFactor };
}

export async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 0);
    });
  });
}
