import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

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

    if (fs.existsSync(chunksDir)) {
      const files = fs.readdirSync(chunksDir);
      for (const file of files) {
        fs.unlinkSync(path.join(chunksDir, file));
      }
      fs.rmdirSync(chunksDir);
      console.log(`Cleaned up failed upload: ${uploadId}`);
    }

    return NextResponse.json({ cleaned: true });
  } catch (error) {
    console.error("Cleanup error:", error);
    // Don't fail hard on cleanup errors
    return NextResponse.json({ cleaned: false, details: String(error) });
  }
}
