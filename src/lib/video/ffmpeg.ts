import ffmpeg from "fluent-ffmpeg";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";

// Timeout constants
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

export async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 0);
    });
  });
}
