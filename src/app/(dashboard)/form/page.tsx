"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
import { FormChart } from "@/components/dashboard/form-chart";

export default function FormPage() {
  const searchParams = useSearchParams();
  const client = searchParams.get("client") || "all";
  const range = searchParams.get("range") || "30d";
  const [exercise, setExercise] = useState<string>("");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Form Scores</h1>
        <TimeRangeSelector />
      </div>
      <div>
        <input
          value={exercise}
          onChange={(e) => setExercise(e.target.value)}
          placeholder="Filter by exercise name..."
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
        />
      </div>
      <FormChart client={client} range={range} exercise={exercise || undefined} />
    </div>
  );
}
