import { NextRequest, NextResponse } from "next/server";
import { updateExercise, getExercise } from "@/lib/db/queries";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ exerciseId: string }> }
) {
  const { exerciseId } = await params;
  const body = await req.json();
  const score = Number(body.score);

  if (!score || score < 1 || score > 10) {
    return NextResponse.json({ error: "Score must be 1-10" }, { status: 400 });
  }

  const exercise = await getExercise(exerciseId);
  if (!exercise) {
    return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  }

  const updated = await updateExercise(exerciseId, { formScoreOverride: score });
  return NextResponse.json(updated);
}
