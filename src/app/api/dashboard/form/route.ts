import { NextRequest, NextResponse } from "next/server";
import { getFormData } from "@/lib/db/dashboard-queries";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const client = params.get("client") || "all";
  const range = params.get("range") || "30d";
  const exercise = params.get("exercise") || undefined;
  const clientId = client === "all" ? null : client;

  const data = getFormData(clientId, range, exercise);
  return NextResponse.json(data);
}
