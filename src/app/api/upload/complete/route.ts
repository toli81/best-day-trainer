import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createSession } from "@/lib/db/queries";

export async function POST(req: NextRequest) {
  try {
    const { uploadId } = await req.json();

    if (!uploadId) {
      return NextResponse.json(
        { error: "uploadId is required" },
        { status: 400 }
      );
    }

    const chunksDir = path.join(process.cwd(), "uploads", "chunks", uploadId);
    if (!fs.existsSync(chunksDir)) {
      return NextResponse.json(
        { error: "Invalid uploadId" },
        { status: 404 }
      );
    }

    // Read metadata
    const meta = JSON.parse(
      fs.readFileSync(path.join(chunksDir, "_meta.json"), "utf-8")
    );

    // Get chunk files sorted by index
    const chunkFiles = fs
      .readdirSync(chunksDir)
      .filter((f) => f.startsWith("chunk_"))
      .sort();

    if (chunkFiles.length === 0) {
      return NextResponse.json(
        { error: "No chunks uploaded" },
        { status: 400 }
      );
    }

    // Reassemble file by streaming chunks to the final file
    const uploadDir = path.join(process.cwd(), "uploads");
    const ext = path.extname(meta.fileName) || ".mp4";
    const sessionId = uploadId;
    const savedFileName = `${sessionId}${ext}`;
    const savedFilePath = path.join(uploadDir, savedFileName);

    const writeStream = fs.createWriteStream(savedFilePath);
    for (const chunkFile of chunkFiles) {
      const chunkPath = path.join(chunksDir, chunkFile);
      const chunkData = fs.readFileSync(chunkPath);
      writeStream.write(chunkData);
    }

    await new Promise<void>((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
      writeStream.end();
    });

    // Clean up chunks
    for (const file of fs.readdirSync(chunksDir)) {
      fs.unlinkSync(path.join(chunksDir, file));
    }
    fs.rmdirSync(chunksDir);

    // Get final file size
    const stats = fs.statSync(savedFilePath);

    // Create session in database
    const now = new Date().toISOString();
    const session = await createSession({
      id: sessionId,
      title: meta.title || `Session ${new Date().toLocaleDateString()}`,
      clientName: meta.clientName || undefined,
      recordedAt: now,
      videoFilePath: savedFilePath,
      videoFileName: meta.fileName,
      videoSizeBytes: stats.size,
      status: "uploaded",
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ sessionId: session.id, status: session.status });
  } catch (error) {
    console.error("Upload complete error:", error);
    return NextResponse.json(
      { error: "Failed to complete upload", details: String(error) },
      { status: 500 }
    );
  }
}
