import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import path from "path";
import fs from "fs";

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
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
      .outputOptions(["-c", "copy"])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
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
      .on("end", () => resolve(path.join(outputDir, filename)))
      .on("error", (err) => reject(err));
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
