import { NextRequest, NextResponse } from "next/server";
import { listSessions } from "@/lib/db/queries";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");

  const result = await listSessions(page, limit);
  return NextResponse.json(result);
}
