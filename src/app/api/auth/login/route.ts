import { NextResponse } from "next/server";
import { createMagicLinkToken } from "@/lib/auth/magic-link";
import { sendMagicLinkEmail } from "@/lib/email/resend";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const { token } = await createMagicLinkToken(email.trim());
    await sendMagicLinkEmail(email.trim(), token);

    await logAudit({
      action: "magic_link_sent",
      ipAddress: request.headers.get("x-forwarded-for") || undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[auth/login] Error:", error);
    const message = error instanceof Error ? error.message : "Login failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
