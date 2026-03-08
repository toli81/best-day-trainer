import { NextRequest, NextResponse } from "next/server";
import { processSession } from "@/lib/processing/pipeline";
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

  // Run processing in the background (don't await)
  processSession(sessionId).catch((err) => {
    console.error(`Background processing failed for ${sessionId}:`, err);
  });

  return NextResponse.json({ status: "analyzing", sessionId });
}
