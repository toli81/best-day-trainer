import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import path from "path";
import fs from "fs";

export async function POST(req: NextRequest) {
  try {
    const { fileName, fileSize, clientName, title } = await req.json();

    if (!fileName || !fileSize) {
      return NextResponse.json(
        { error: "fileName and fileSize are required" },
        { status: 400 }
      );
    }

    const uploadId = nanoid();
    const chunksDir = path.join(process.cwd(), "uploads", "chunks", uploadId);
    fs.mkdirSync(chunksDir, { recursive: true });

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
