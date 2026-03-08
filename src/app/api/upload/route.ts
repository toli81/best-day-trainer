import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import path from "path";
import fs from "fs";
import { createSession } from "@/lib/db/queries";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("video") as File | null;
    const clientName = formData.get("clientName") as string | null;
    const title = formData.get("title") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No video file provided" }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const sessionId = nanoid();
    const ext = path.extname(file.name) || ".mp4";
    const savedFileName = `${sessionId}${ext}`;
    const savedFilePath = path.join(uploadDir, savedFileName);

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(savedFilePath, buffer);

    const now = new Date().toISOString();
    const session = await createSession({
      id: sessionId,
      title: title || `Session ${new Date().toLocaleDateString()}`,
      clientName: clientName || undefined,
      recordedAt: now,
      videoFilePath: savedFilePath,
      videoFileName: file.name,
      videoSizeBytes: file.size,
      status: "uploaded",
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ sessionId: session.id, status: session.status });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Upload failed", details: String(error) },
      { status: 500 }
    );
  }
}
