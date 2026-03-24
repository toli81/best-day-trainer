import { claude, CLAUDE_MODEL } from "./client";
import type { Exercise } from "@/lib/db/schema";

interface FormScoreResult {
  exerciseId: string;
  score: number;
  justification: string;
}

export async function scoreExerciseForms(exercises: Exercise[]): Promise<FormScoreResult[]> {
  const scorable = exercises.filter((ex) => ex.formNotes || ex.coachingCues);
  if (scorable.length === 0) return [];

  const exerciseList = scorable
    .map(
      (ex) =>
        `- ID: ${ex.id} | Name: "${ex.name}" | Form notes: ${ex.formNotes || "None"} | Coaching cues: ${ex.coachingCues ? JSON.parse(ex.coachingCues).join("; ") : "None"}`
    )
    .join("\n");

  const message = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system: `You are an expert personal trainer scoring exercise form quality on a 1-10 scale.

Scoring rubric:
- 1-3: Significant form issues, risk of injury
- 4-6: Adequate but notable room for improvement
- 7-8: Good form with minor corrections
- 9-10: Excellent technique

Return a JSON array:
[{ "exerciseId": "the-id", "score": 7, "justification": "Brief reason" }]

Score every exercise provided. Be fair but honest. If form notes indicate no issues, score 7-8. Only give 9-10 for explicitly excellent form.`,
    messages: [
      {
        role: "user",
        content: `Score the form quality for these exercises:\n${exerciseList}`,
      },
    ],
  }, { timeout: 120_000 });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return [];

  try {
    const jsonMatch = textBlock.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    return JSON.parse(jsonMatch[0]) as FormScoreResult[];
  } catch {
    console.error("Failed to parse Claude form scoring response");
    return [];
  }
}
