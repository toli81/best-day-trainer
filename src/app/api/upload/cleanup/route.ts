import { NextRequest, NextResponse } from "next/server";
import { abortMultipartUpload } from "@/lib/r2/client";
import { getUploadSession, deleteUploadSession } from "@/lib/r2/upload-sessions";

export async function POST(req: NextRequest) {
  try {
    const { uploadId } = await req.json();

    if (!uploadId) {
      return NextResponse.json(
        { error: "uploadId is required" },
        { status: 400 }
      );
    }

    const session = getUploadSession(uploadId);
    if (session) {
      await abortMultipartUpload(session.r2Key, session.r2UploadId);
      deleteUploadSession(uploadId);
      console.log(`Upload cleanup: aborted multipart upload ${uploadId}`);
    }

    return NextResponse.json({ cleaned: true });
  } catch (error) {
    console.error("Cleanup error:", error);
    // Non-critical — don't fail
    return NextResponse.json({ cleaned: false, details: String(error) });
  }
}
