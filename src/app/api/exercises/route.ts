import { NextRequest, NextResponse } from "next/server";
import { listExercises } from "@/lib/db/queries";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const result = await listExercises({
    search: searchParams.get("search") || undefined,
    category: searchParams.get("category") || undefined,
    muscleGroup: searchParams.get("muscleGroup") || undefined,
    page: parseInt(searchParams.get("page") || "1"),
    limit: parseInt(searchParams.get("limit") || "50"),
  });

  return NextResponse.json(result);
}
