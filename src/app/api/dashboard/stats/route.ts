import { NextRequest, NextResponse } from "next/server";
import { getStats } from "@/lib/db/dashboard-queries";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const client = params.get("client") || "all";
  const range = params.get("range") || "30d";
  const clientId = client === "all" ? null : client;

  const stats = getStats(clientId, range);
  return NextResponse.json(stats);
}
