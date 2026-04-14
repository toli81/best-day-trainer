import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const ua = req.headers.get("user-agent") || "unknown";
    console.log(
      `[upload-log] ${JSON.stringify({ ...body, ua, ts: new Date().toISOString() })}`
    );
    return NextResponse.json({ logged: true });
  } catch {
    return NextResponse.json({ logged: false });
  }
}
