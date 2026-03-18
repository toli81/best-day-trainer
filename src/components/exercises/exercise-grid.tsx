"use client";

import { useState, useEffect } from "react";
import { ExerciseCard } from "./exercise-card";
import { ExerciseDetail } from "./exercise-detail";
import type { Exercise } from "@/lib/db/schema";

interface ExerciseGridProps {
  exercises: Exercise[];
}

export function ExerciseGrid({ exercises }: ExerciseGridProps) {
  const [localExercises, setLocalExercises] = useState<Exercise[]>(exercises);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);

  useEffect(() => {
    setLocalExercises(exercises);
  }, [exercises]);

  function handleDelete(id: string) {
    setLocalExercises((prev) => prev.filter((e) => e.id !== id));
    setSelectedExercise(null);
  }

  function handleUpdate(updated: Exercise) {
    setLocalExercises((prev) =>
      prev.map((e) => (e.id === updated.id ? updated : e))
    );
    setSelectedExercise(null);
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {localExercises.map((exercise) => (
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
          onDelete={handleDelete}
          onUpdate={handleUpdate}
        />
      )}
    </>
  );
}
