import { claude, CLAUDE_MODEL } from "./client";
import type { Exercise } from "@/lib/db/schema";

interface TagSuggestion {
  exerciseId: string;
  tags: string[];
  standardizedName: string;
}

export async function standardizeAndTagExercises(
  exercises: Exercise[]
): Promise<TagSuggestion[]> {
  if (exercises.length === 0) return [];

  const exerciseList = exercises
    .map(
      (ex) =>
        `- ID: ${ex.id} | Name: "${ex.name}" | Category: ${ex.category} | Muscles: ${ex.muscleGroups || "[]"} | Equipment: ${ex.equipment || "[]"}`
    )
    .join("\n");

  const message = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system: `You are an exercise science specialist who standardizes exercise naming and tagging for a fitness library.

Your job:
1. Standardize exercise names to use consistent, professional naming (e.g., "DB Bench" → "Dumbbell Bench Press")
2. Add relevant tags for searchability (movement pattern, body region, modality, skill level)

Return a JSON array of objects with this structure:
[
  {
    "exerciseId": "the-id",
    "standardizedName": "Properly Named Exercise",
    "tags": ["push", "upper-body", "horizontal-press", "chest", "compound"]
  }
]

Tag categories to consider:
- Movement pattern: push, pull, hinge, squat, lunge, carry, rotation, anti-rotation
- Body region: upper-body, lower-body, full-body, core
- Modality: barbell, dumbbell, kettlebell, cable, machine, bodyweight, band, medicine-ball
- Joint action: compound, isolation
- Plane of motion: sagittal, frontal, transverse`,
    messages: [
      {
        role: "user",
        content: `Standardize names and add tags for these exercises:\n${exerciseList}`,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return [];

  try {
    const jsonMatch = textBlock.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    return JSON.parse(jsonMatch[0]) as TagSuggestion[];
  } catch {
    console.error("Failed to parse Claude tag response");
    return [];
  }
}
