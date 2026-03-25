import { claude, CLAUDE_MODEL } from "./client";
import type { Exercise, Session } from "@/lib/db/schema";
import { getClientName } from "@/lib/db/queries";

export interface ReportData {
  strengths: string[];
  improvements: { area: string; detail: string }[];
  recommendations: { title: string; detail: string }[];
  flags: { level: "warning" | "info"; text: string }[];
}

export interface SessionNotesResult {
  notes: string;
  reportData: ReportData;
}

function buildExerciseList(exercises: Exercise[]): string {
  return exercises
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
}

function buildUserContent(
  clientDisplayName: string | null,
  session: Session,
  exerciseList: string
): string {
  return `Write session notes for the following training session:

Client: ${clientDisplayName || "Not specified"}
Date: ${new Date(session.recordedAt).toLocaleDateString()}
Duration: ${session.durationSeconds ? Math.round(session.durationSeconds / 60) + " minutes" : "Not recorded"}
Title: ${session.title || "Training Session"}

Exercises performed:
${exerciseList}`;
}

export async function generateSessionNotes(
  session: Session,
  exercises: Exercise[]
): Promise<SessionNotesResult> {
  const exerciseList = buildExerciseList(exercises);
  const clientDisplayName = await getClientName(session);
  const userContent = buildUserContent(clientDisplayName, session, exerciseList);

  // Call 1: Generate prose session notes (unchanged from original)
  const notesMessage = await claude.messages.create({
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
        content: userContent,
      },
    ],
  }, { timeout: 120_000 });

  const textBlock = notesMessage.content.find((b) => b.type === "text");
  const notes = textBlock?.text || "Unable to generate session notes.";

  // Call 2: Generate structured report data as JSON
  let reportData: ReportData = {
    strengths: [],
    improvements: [],
    recommendations: [],
    flags: [],
  };

  try {
    const reportMessage = await claude.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: `You are an expert personal trainer and exercise scientist. Based on the training session data provided, generate a structured analysis report in JSON format.

Return ONLY valid JSON with this exact structure:
{
  "strengths": ["3-5 specific observed positive behaviors or form qualities"],
  "improvements": [{"area": "Short label like 'Squat Mechanics'", "detail": "Specific observation and explanation"}],
  "recommendations": [{"title": "Exercise or focus area", "detail": "Specific programming suggestion for next session"}],
  "flags": [{"level": "warning or info", "text": "Detailed explanation"}]
}

Guidelines:
- "strengths": List 3-5 genuinely positive observations from the form notes and coaching cues
- "improvements": List 2-4 areas needing correction, with specific detail
- "recommendations": List 2-4 actionable suggestions for the next training session
- "flags": Only include genuine safety concerns (level: "warning") or important programming notes (level: "info"). Empty array if none.
- Be specific and reference actual exercises from the session
- Do not include generic advice — all feedback should be based on the actual session data`,
      messages: [
        {
          role: "user",
          content: userContent,
        },
      ],
    }, { timeout: 120_000 });

    const reportTextBlock = reportMessage.content.find((b) => b.type === "text");
    const rawJson = reportTextBlock?.text || "";

    // Strip markdown code fences if present
    const cleaned = rawJson.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    reportData = JSON.parse(cleaned) as ReportData;
  } catch (err) {
    console.error("Failed to generate or parse structured report data:", err);
    // reportData stays as the empty default
  }

  return { notes, reportData };
}
