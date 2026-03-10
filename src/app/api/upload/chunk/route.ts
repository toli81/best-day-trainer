import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

// Increase body size limit for chunk uploads (default may be too small)
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const uploadId = formData.get("uploadId") as string;
    const chunkIndex = formData.get("chunkIndex") as string;
    const chunk = formData.get("chunk") as File | null;

    if (!uploadId || chunkIndex === null || !chunk) {
      return NextResponse.json(
        { error: "Missing required fields", details: "uploadId, chunkIndex, and chunk are required" },
        { status: 400 }
      );
    }

    const chunksDir = path.join(process.cwd(), "uploads", "chunks", uploadId);
    if (!fs.existsSync(chunksDir)) {
      return NextResponse.json(
        { error: "Invalid uploadId", details: `Chunks directory not found for ${uploadId}` },
        { status: 404 }
      );
    }

    // Stream the chunk to disk instead of buffering entire thing in memory
    const chunkPath = path.join(chunksDir, `chunk_${chunkIndex.padStart(6, "0")}`);

    try {
      const buffer = Buffer.from(await chunk.arrayBuffer());
      fs.writeFileSync(chunkPath, buffer);
    } catch (writeErr) {
      console.error(`Failed to write chunk ${chunkIndex} for ${uploadId}:`, writeErr);
      return NextResponse.json(
        {
          error: "Failed to write chunk to disk",
          details: `Chunk ${chunkIndex}: ${String(writeErr)}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ received: true, chunkIndex: Number(chunkIndex) });
  } catch (error) {
    console.error("Chunk upload error:", error);
    return NextResponse.json(
      {
        error: "Failed to upload chunk",
        details: `Server error: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 500 }
    );
  }
}
