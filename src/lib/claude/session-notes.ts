import { claude, CLAUDE_MODEL } from "./client";
import type { Exercise, Session } from "@/lib/db/schema";

export async function generateSessionNotes(
  session: Session,
  exercises: Exercise[]
): Promise<string> {
  const exerciseList = exercises
    .map(
      (ex, i) =>
        `${i + 1}. ${ex.name} (${ex.startTimestamp}-${ex.endTimestamp})
   - Category: ${ex.category || "N/A"}
   - Reps: ${ex.repCount ?? "N/A"}, Sets: ${ex.setCount ?? "N/A"}
   - Muscle groups: ${ex.muscleGroups ? JSON.parse(ex.muscleGroups).join(", ") : "N/A"}
   - Equipment: ${ex.equipment ? JSON.parse(ex.equipment).join(", ") : "Bodyweight"}
   - Form notes: ${ex.formNotes || "None"}
   - Coaching cues: ${ex.coachingCues ? JSON.parse(ex.coachingCues).join("; ") : "None"}`
    )
    .join("\n\n");

  const message = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system: `You are an expert personal trainer and physical therapist writing professional session documentation. Write clear, concise, clinical-quality session notes that a physical therapist or trainer would use for record-keeping. Include:

1. Session Overview (1-2 sentences)
2. Exercises Performed (brief list with key observations)
3. Form & Technique Observations (what went well, areas for improvement)
4. Recommendations for Next Session
5. Any flags or concerns (if applicable)

Keep the tone professional but accessible. Do not use overly technical jargon unless necessary.`,
    messages: [
      {
        role: "user",
        content: `Write session notes for the following training session:

Client: ${session.clientName || "Not specified"}
Date: ${new Date(session.recordedAt).toLocaleDateString()}
Duration: ${session.durationSeconds ? Math.round(session.durationSeconds / 60) + " minutes" : "Not recorded"}
Title: ${session.title || "Training Session"}

Exercises performed:
${exerciseList}`,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  return textBlock?.text || "Unable to generate session notes.";
}
