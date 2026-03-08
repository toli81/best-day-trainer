"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatDuration } from "@/lib/utils/timestamps";
import type { Exercise } from "@/lib/db/schema";

interface ExerciseDetailProps {
  exercise: Exercise;
  open: boolean;
  onClose: () => void;
}

export function ExerciseDetail({ exercise, open, onClose }: ExerciseDetailProps) {
  const muscleGroups: string[] = exercise.muscleGroups
    ? JSON.parse(exercise.muscleGroups)
    : [];
  const equipment: string[] = exercise.equipment
    ? JSON.parse(exercise.equipment)
    : [];
  const coachingCues: string[] = exercise.coachingCues
    ? JSON.parse(exercise.coachingCues)
    : [];
  const tags: string[] = exercise.tags ? JSON.parse(exercise.tags) : [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {exercise.clipFilePath && (
          <video
            src={exercise.clipFilePath}
            controls
            className="w-full rounded-lg"
            poster={exercise.thumbnailFilePath || undefined}
          />
        )}

        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold">{exercise.name}</h2>
            <p className="text-sm text-muted-foreground">
              {exercise.startTimestamp} - {exercise.endTimestamp}
              {exercise.clipDurationSeconds &&
                ` (${formatDuration(exercise.clipDurationSeconds)})`}
            </p>
          </div>

          <p>{exercise.description}</p>

          <div className="flex flex-wrap gap-2">
            {exercise.category && (
              <Badge>{exercise.category}</Badge>
            )}
            {exercise.difficulty && (
              <Badge variant="secondary">{exercise.difficulty}</Badge>
            )}
            {exercise.repCount != null && (
              <Badge variant="outline">{exercise.repCount} reps</Badge>
            )}
            {exercise.setCount != null && (
              <Badge variant="outline">{exercise.setCount} sets</Badge>
            )}
          </div>

          {muscleGroups.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-semibold">Muscle Groups</h3>
              <div className="flex flex-wrap gap-1">
                {muscleGroups.map((mg) => (
                  <Badge key={mg} variant="outline" className="text-xs">
                    {mg}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {equipment.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-semibold">Equipment</h3>
              <p className="text-sm">{equipment.join(", ")}</p>
            </div>
          )}

          <Separator />

          {exercise.formNotes && (
            <div>
              <h3 className="mb-1 text-sm font-semibold">Form Notes</h3>
              <p className="text-sm">{exercise.formNotes}</p>
            </div>
          )}

          {coachingCues.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-semibold">Coaching Cues</h3>
              <ul className="list-inside list-disc space-y-1 text-sm">
                {coachingCues.map((cue, i) => (
                  <li key={i}>{cue}</li>
                ))}
              </ul>
            </div>
          )}

          {tags.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-semibold">Tags</h3>
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-muted px-2 py-0.5 text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
