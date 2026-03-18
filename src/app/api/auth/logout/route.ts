import { NextResponse } from "next/server";
import { destroySession, validateSession } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request) {
  const session = await validateSession();

  if (session) {
    await logAudit({
      clientId: session.clientId,
      action: "logged_out",
      ipAddress: request.headers.get("x-forwarded-for") || undefined,
    });
  }

  await destroySession();

  return NextResponse.json({ success: true });
}
