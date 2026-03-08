"use client";

import { useEffect, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ExerciseGrid } from "@/components/exercises/exercise-grid";
import type { Exercise } from "@/lib/db/schema";

const categories = [
  "all",
  "strength",
  "cardio",
  "flexibility",
  "warmup",
  "cooldown",
  "plyometric",
];

export default function LibraryPage() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);

  const fetchExercises = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (category !== "all") params.set("category", category);

    const res = await fetch(`/api/exercises?${params.toString()}`);
    const data = await res.json();
    setExercises(data.exercises);
    setTotal(data.total);
    setLoading(false);
  }, [search, category]);

  useEffect(() => {
    const timeout = setTimeout(fetchExercises, 300);
    return () => clearTimeout(timeout);
  }, [fetchExercises]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Exercise Library</h1>
        <p className="text-sm text-muted-foreground">
          {total} exercises across all sessions
        </p>
      </div>

      <div className="space-y-3">
        <Input
          placeholder="Search exercises..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-[10px] border-border focus-visible:ring-[#00CCFF]"
        />

        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <Badge
              key={cat}
              variant={category === cat ? "default" : "outline"}
              className={`cursor-pointer capitalize ${
                category === cat
                  ? "bg-[#00CCFF] text-white hover:bg-[#00b8e6]"
                  : "border-border text-secondary-foreground hover:bg-secondary"
              }`}
              onClick={() => setCategory(cat)}
            >
              {cat}
            </Badge>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-muted-foreground">
          Loading exercises...
        </div>
      ) : exercises.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          {search || category !== "all"
            ? "No exercises match your filters."
            : "No exercises yet. Upload and process a session to build your library."}
        </div>
      ) : (
        <ExerciseGrid exercises={exercises} />
      )}
    </div>
  );
}
