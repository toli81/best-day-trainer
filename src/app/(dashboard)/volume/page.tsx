"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
import { VolumeChart } from "@/components/dashboard/volume-chart";

const MUSCLE_GROUPS = ["chest", "back", "shoulders", "biceps", "triceps", "quadriceps", "hamstrings", "glutes", "calves", "core", "forearms"];

export default function VolumePage() {
  const searchParams = useSearchParams();
  const client = searchParams.get("client") || "all";
  const range = searchParams.get("range") || "30d";
  const [muscleGroup, setMuscleGroup] = useState<string>("");
  const [exercise, setExercise] = useState<string>("");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Volume</h1>
        <TimeRangeSelector />
      </div>
      <div className="flex gap-3">
        <select
          value={muscleGroup}
          onChange={(e) => setMuscleGroup(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
        >
          <option value="">All Muscle Groups</option>
          {MUSCLE_GROUPS.map((g) => (
            <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>
          ))}
        </select>
        <input
          value={exercise}
          onChange={(e) => setExercise(e.target.value)}
          placeholder="Filter by exercise name..."
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
        />
      </div>
      <VolumeChart client={client} range={range} muscleGroup={muscleGroup || undefined} exercise={exercise || undefined} />
    </div>
  );
}
