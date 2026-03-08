import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/db/queries";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const session = await getSession(sessionId);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({
    status: session.status,
    exerciseCount: session.exercises?.length ?? 0,
    processingError: session.processingError,
    hasNotes: !!session.sessionNotes,
  });
}
