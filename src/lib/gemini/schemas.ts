import { z } from "zod";

export const ExerciseOverviewItemSchema = z.object({
  startTimestamp: z.string(),
  endTimestamp: z.string(),
  label: z.string(),
  isRestPeriod: z.boolean(),
});

export const ExerciseOverviewSchema = z.object({
  exercises: z.array(ExerciseOverviewItemSchema),
  totalExerciseCount: z.number(),
  sessionSummary: z.string(),
});

export type ExerciseOverview = z.infer<typeof ExerciseOverviewSchema>;
export type ExerciseOverviewItem = z.infer<typeof ExerciseOverviewItemSchema>;

export const ExerciseDetailSchema = z.object({
  name: z.string(),
  description: z.string(),
  muscleGroups: z.array(z.string()),
  equipment: z.array(z.string()),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  category: z.enum([
    "strength",
    "cardio",
    "flexibility",
    "warmup",
    "cooldown",
    "plyometric",
  ]),
  repCount: z.number().nullable(),
  setCount: z.number().nullable(),
  formNotes: z.string(),
  coachingCues: z.array(z.string()),
});

export type ExerciseDetail = z.infer<typeof ExerciseDetailSchema>;

export const AllExerciseDetailsSchema = z.object({
  exercises: z.array(
    ExerciseDetailSchema.extend({
      exerciseIndex: z.number(),
    })
  ),
});

export type AllExerciseDetails = z.infer<typeof AllExerciseDetailsSchema>;
