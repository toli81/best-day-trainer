import { NextRequest, NextResponse } from "next/server";
import { getSession, deleteSession } from "@/lib/db/queries";
import { deleteObject } from "@/lib/r2/client";
import { isProcessing, getProcessingSessionId } from "@/lib/processing/pipeline";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const session = await getSession(sessionId);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json(session);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  // Block deletion of currently processing session
  if (isProcessing() && getProcessingSessionId() === sessionId) {
    return NextResponse.json(
      { error: "Cannot delete a session that is currently processing" },
      { status: 409 }
    );
  }

  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Clean up R2 resources
  const isR2 = session.videoFilePath.startsWith("r2://");
  if (isR2) {
    const videoKey = session.videoFilePath.replace("r2://", "");
    await deleteObject(videoKey);

    // Delete all exercise clips and thumbnails
    for (const ex of session.exercises) {
      if (ex.clipFilePath) {
        await deleteObject(`clips/${sessionId}/${ex.id}.mp4`);
      }
      if (ex.thumbnailFilePath) {
        await deleteObject(`clips/${sessionId}/${ex.id}.jpg`);
      }
    }
  }

  await deleteSession(sessionId);
  return NextResponse.json({ success: true });
}
