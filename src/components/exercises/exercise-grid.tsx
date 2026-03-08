"use client";

import { useState } from "react";
import { ExerciseCard } from "./exercise-card";
import { ExerciseDetail } from "./exercise-detail";
import type { Exercise } from "@/lib/db/schema";

interface ExerciseGridProps {
  exercises: Exercise[];
}

export function ExerciseGrid({ exercises }: ExerciseGridProps) {
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {exercises.map((exercise) => (
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            onClick={() => setSelectedExercise(exercise)}
          />
        ))}
      </div>

      {selectedExercise && (
        <ExerciseDetail
          exercise={selectedExercise}
          open={!!selectedExercise}
          onClose={() => setSelectedExercise(null)}
        />
      )}
    </>
  );
}
