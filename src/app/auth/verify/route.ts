import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/magic-link";
import { createSession } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing_token", request.url));
  }

  const result = await verifyToken(token);

  if (!result) {
    return NextResponse.redirect(new URL("/login?error=invalid_or_expired", request.url));
  }

  await createSession(result.clientId, result.role);

  await logAudit({
    clientId: result.clientId,
    action: "logged_in",
    ipAddress: request.headers.get("x-forwarded-for") || undefined,
  });

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
