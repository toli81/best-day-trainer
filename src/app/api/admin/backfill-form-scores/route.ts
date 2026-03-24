import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sessions, exercises } from "@/lib/db/schema";
import { eq, and, isNull, isNotNull } from "drizzle-orm";
import { scoreExerciseForms } from "@/lib/claude/form-scoring";
import { updateExercise } from "@/lib/db/queries";

export async function POST() {
  // Find completed sessions with exercises that have formNotes but no formScore
  const needsScoring = db
    .select({ sessionId: sessions.id })
    .from(sessions)
    .where(eq(sessions.status, "complete"))
    .innerJoin(
      exercises,
      and(
        eq(exercises.sessionId, sessions.id),
        isNotNull(exercises.formNotes),
        isNull(exercises.formScore)
      )
    )
    .groupBy(sessions.id)
    .all();

  let sessionsProcessed = 0;
  let exercisesScored = 0;

  for (const { sessionId } of needsScoring) {
    const exs = db
      .select()
      .from(exercises)
      .where(and(eq(exercises.sessionId, sessionId), isNull(exercises.formScore)))
      .all();

    try {
      const scores = await scoreExerciseForms(exs);
      for (const s of scores) {
        await updateExercise(s.exerciseId, { formScore: s.score });
        exercisesScored++;
      }
      sessionsProcessed++;
    } catch (err) {
      console.error(`Backfill failed for session ${sessionId}:`, err);
    }

    // Rate limit between sessions
    await new Promise((r) => setTimeout(r, 2000));
  }

  return NextResponse.json({ sessionsProcessed, exercisesScored });
}
