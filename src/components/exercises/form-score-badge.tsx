"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface FormScoreBadgeProps {
  exerciseId: string;
  score: number | null;
  isOverride: boolean;
}

export function FormScoreBadge({ exerciseId, score, isOverride }: FormScoreBadgeProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(score?.toString() || "");
  const [currentScore, setCurrentScore] = useState(score);
  const [currentIsOverride, setCurrentIsOverride] = useState(isOverride);
  const [saving, setSaving] = useState(false);

  if (currentScore === null) return null;

  function scoreColor(s: number): string {
    if (s <= 3) return "bg-red-500/20 text-red-400 border-red-500/30";
    if (s <= 6) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    if (s <= 8) return "bg-green-500/20 text-green-400 border-green-500/30";
    return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  }

  async function handleSave() {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 1 || num > 10) {
      setValue(currentScore?.toString() || "");
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/exercises/${exerciseId}/form-score`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: num }),
      });
      if (res.ok) {
        setCurrentScore(num);
        setCurrentIsOverride(true);
      }
    } catch {
      // silent fail
    }
    setSaving(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        type="number"
        min={1}
        max={10}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => e.key === "Enter" && handleSave()}
        autoFocus
        disabled={saving}
        className="w-16 rounded border border-border bg-background px-2 py-0.5 text-center text-xs text-foreground"
      />
    );
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setValue(currentScore?.toString() || "");
        setEditing(true);
      }}
      className={cn(
        "rounded-full border px-2 py-0.5 text-xs font-medium transition-colors hover:opacity-80",
        scoreColor(currentScore)
      )}
      title="Click to override form score"
    >
      {currentScore}/10 {currentIsOverride ? "(Override)" : "(AI)"}
    </button>
  );
}
