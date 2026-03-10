import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import path from "path";
import fs from "fs";

// Clean up stale chunk directories older than 1 hour
function cleanupStaleUploads(uploadsDir: string) {
  const chunksBase = path.join(uploadsDir, "chunks");
  if (!fs.existsSync(chunksBase)) return;

  try {
    const dirs = fs.readdirSync(chunksBase);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    for (const dir of dirs) {
      const dirPath = path.join(chunksBase, dir);
      try {
        const stat = fs.statSync(dirPath);
        if (stat.isDirectory() && stat.mtimeMs < oneHourAgo) {
          // Remove all files in the directory, then the directory itself
          const files = fs.readdirSync(dirPath);
          for (const file of files) {
            fs.unlinkSync(path.join(dirPath, file));
          }
          fs.rmdirSync(dirPath);
          console.log(`Cleaned up stale upload: ${dir}`);
        }
      } catch {
        // Skip if we can't access this directory
      }
    }
  } catch {
    // Non-critical - don't fail the init
  }
}

// Also clean up orphaned video files with no matching DB session
function cleanupOrphanedVideos(uploadsDir: string) {
  try {
    const files = fs.readdirSync(uploadsDir);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    for (const file of files) {
      // Only clean up video files, not directories or other files
      if (file === "chunks" || !file.match(/\.(mp4|webm|mov)$/i)) continue;

      const filePath = path.join(uploadsDir, file);
      try {
        const stat = fs.statSync(filePath);
        // Only clean up old files to avoid deleting active uploads
        if (stat.mtimeMs < oneHourAgo && stat.size === 0) {
          fs.unlinkSync(filePath);
          console.log(`Cleaned up empty video file: ${file}`);
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // Non-critical
  }
}

export async function POST(req: NextRequest) {
  try {
    const { fileName, fileSize, clientName, title } = await req.json();

    if (!fileName || !fileSize) {
      return NextResponse.json(
        { error: "fileName and fileSize are required" },
        { status: 400 }
      );
    }

    const uploadDir = path.join(process.cwd(), "uploads");

    // Clean up stale uploads to free disk space
    cleanupStaleUploads(uploadDir);
    cleanupOrphanedVideos(uploadDir);

    const uploadId = nanoid();
    const chunksDir = path.join(uploadDir, "chunks", uploadId);
    fs.mkdirSync(chunksDir, { recursive: true });

    // Check available disk space (rough estimate via df)
    try {
      const stats = fs.statfsSync(uploadDir);
      const freeBytes = stats.bfree * stats.bsize;
      const freeMB = Math.round(freeBytes / 1024 / 1024);
      console.log(`Disk space available: ${freeMB}MB, file size: ${Math.round(fileSize / 1024 / 1024)}MB`);

      if (freeBytes < fileSize * 2) {
        return NextResponse.json(
          {
            error: "Insufficient disk space",
            details: `Need ~${Math.round((fileSize * 2) / 1024 / 1024)}MB, only ${freeMB}MB free`,
          },
          { status: 507 }
        );
      }
    } catch {
      // statfsSync may not be available everywhere — continue anyway
    }

    // Store metadata for the complete step
    const meta = { fileName, fileSize, clientName, title, chunksDir };
    fs.writeFileSync(
      path.join(chunksDir, "_meta.json"),
      JSON.stringify(meta)
    );

    return NextResponse.json({ uploadId });
  } catch (error) {
    console.error("Upload init error:", error);
    return NextResponse.json(
      { error: "Failed to initialize upload", details: String(error) },
      { status: 500 }
    );
  }
}
