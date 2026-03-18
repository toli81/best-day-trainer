import { NextRequest, NextResponse } from "next/server";
import { getExercise, updateExercise, deleteExercise } from "@/lib/db/queries";
import { deleteObject } from "@/lib/r2/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ exerciseId: string }> }
) {
  const { exerciseId } = await params;
  const exercise = await getExercise(exerciseId);

  if (!exercise) {
    return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  }

  return NextResponse.json(exercise);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ exerciseId: string }> }
) {
  const { exerciseId } = await params;
  const body = await req.json();

  const updated = await updateExercise(exerciseId, body);
  if (!updated) {
    return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ exerciseId: string }> }
) {
  const { exerciseId } = await params;
  const exercise = await getExercise(exerciseId);

  if (!exercise) {
    return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  }

  // Clean up R2 resources
  if (exercise.clipFilePath) {
    const clipKey = exercise.clipFilePath.replace(/^\//, "");
    await deleteObject(clipKey);
  }
  if (exercise.thumbnailFilePath) {
    const thumbKey = exercise.thumbnailFilePath.replace(/^\//, "");
    await deleteObject(thumbKey);
  }

  await deleteExercise(exerciseId);
  return NextResponse.json({ success: true });
}
