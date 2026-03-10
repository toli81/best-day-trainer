import { NextRequest, NextResponse } from "next/server";
import { completeMultipartUpload } from "@/lib/r2/client";
import { getUploadSession, deleteUploadSession } from "@/lib/r2/upload-sessions";
import { createSession } from "@/lib/db/queries";

export async function POST(req: NextRequest) {
  try {
    const { uploadId, parts } = await req.json();

    if (!uploadId || !parts || !Array.isArray(parts) || parts.length === 0) {
      return NextResponse.json(
        { error: "uploadId and parts array are required" },
        { status: 400 }
      );
    }

    const session = getUploadSession(uploadId);
    if (!session) {
      return NextResponse.json(
        { error: "Invalid or expired uploadId" },
        { status: 404 }
      );
    }

    // Complete the R2 multipart upload
    await completeMultipartUpload(session.r2Key, session.r2UploadId, parts);

    // Create session in database with R2 key reference
    const now = new Date().toISOString();
    const sessionId = uploadId;
    const dbSession = await createSession({
      id: sessionId,
      title: session.title || `Session ${new Date().toLocaleDateString()}`,
      clientName: session.clientName || undefined,
      recordedAt: now,
      videoFilePath: `r2://${session.r2Key}`,
      videoFileName: session.fileName,
      videoSizeBytes: session.fileSize,
      status: "uploaded",
      createdAt: now,
      updatedAt: now,
    });

    // Clean up in-memory session
    deleteUploadSession(uploadId);

    console.log(
      `Upload complete: ${sessionId}, stored at r2://${session.r2Key}`
    );

    return NextResponse.json({
      sessionId: dbSession.id,
      status: dbSession.status,
    });
  } catch (error) {
    console.error("Upload complete error:", error);
    return NextResponse.json(
      { error: "Failed to complete upload", details: String(error) },
      { status: 500 }
    );
  }
}
