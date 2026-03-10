import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const uploadId = formData.get("uploadId") as string;
    const chunkIndex = formData.get("chunkIndex") as string;
    const chunk = formData.get("chunk") as File | null;

    if (!uploadId || chunkIndex === null || !chunk) {
      return NextResponse.json(
        { error: "uploadId, chunkIndex, and chunk are required" },
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

    const buffer = Buffer.from(await chunk.arrayBuffer());
    const chunkPath = path.join(chunksDir, `chunk_${chunkIndex.padStart(6, "0")}`);
    fs.writeFileSync(chunkPath, buffer);

    return NextResponse.json({ received: true, chunkIndex: Number(chunkIndex) });
  } catch (error) {
    console.error("Chunk upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload chunk", details: String(error) },
      { status: 500 }
    );
  }
}
