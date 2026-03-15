import { NextRequest, NextResponse } from "next/server";
import { processSession, isProcessing, getProcessingSessionId } from "@/lib/processing/pipeline";
import { getSession } from "@/lib/db/queries";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const session = await getSession(sessionId);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.status === "analyzing" || session.status === "segmenting" || session.status === "generating_notes") {
    return NextResponse.json(
      { error: "Session is already being processed" },
      { status: 409 }
    );
  }

  // Concurrency check — only one session can process at a time
  if (isProcessing()) {
    return NextResponse.json(
      { error: `Another session (${getProcessingSessionId()}) is already processing. Please wait for it to finish.` },
      { status: 409 }
    );
  }

  // Run processing in the background (don't await)
  // This works for both fresh sessions ("uploaded") and retries ("error" with pipelineStage)
  processSession(sessionId).catch((err) => {
    console.error(`Background processing failed for ${sessionId}:`, err);
  });

  return NextResponse.json({ status: "analyzing", sessionId });
}
