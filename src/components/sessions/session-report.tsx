"use client";

import { useState } from "react";
import type { Session, Exercise } from "@/lib/db/schema";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ReportData {
  strengths?: string[];
  improvements?: { area: string; detail: string }[];
  recommendations?: { title: string; detail: string }[];
  flags?: { level: "warning" | "info"; text: string }[];
}

interface SessionReportProps {
  session: Session & { exercises: Exercise[] };
  clientDisplayName?: string | null;
  onReprocess?: () => void;
  onDelete?: () => void;
  onBack?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function safeJsonParse<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const mins = Math.round(seconds / 60);
  return `${mins} min`;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  warmup: { bg: "bg-violet-500/15", text: "text-violet-300", border: "border-violet-500/30" },
  strength: { bg: "bg-emerald-500/15", text: "text-emerald-300", border: "border-emerald-500/30" },
  cardio: { bg: "bg-rose-500/15", text: "text-rose-300", border: "border-rose-500/30" },
  flexibility: { bg: "bg-amber-500/15", text: "text-amber-300", border: "border-amber-500/30" },
  mobility: { bg: "bg-amber-500/15", text: "text-amber-300", border: "border-amber-500/30" },
  cooldown: { bg: "bg-cyan-500/15", text: "text-cyan-300", border: "border-cyan-500/30" },
  plyometric: { bg: "bg-sky-500/15", text: "text-sky-300", border: "border-sky-500/30" },
};

const DEFAULT_CATEGORY_COLOR = { bg: "bg-slate-500/15", text: "text-slate-300", border: "border-slate-500/30" };

const CATEGORY_BAR_COLORS: Record<string, string> = {
  warmup: "bg-violet-500",
  strength: "bg-emerald-500",
  cardio: "bg-rose-500",
  flexibility: "bg-amber-500",
  mobility: "bg-amber-500",
  cooldown: "bg-cyan-500",
  plyometric: "bg-sky-500",
};

function getCategoryColor(category: string | null) {
  return CATEGORY_COLORS[category || ""] || DEFAULT_CATEGORY_COLOR;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function SessionReport({
  session,
  clientDisplayName,
  onReprocess,
  onDelete,
  onBack,
}: SessionReportProps) {
  const exercises = session.exercises || [];
  const reportData = safeJsonParse<ReportData>(session.reportData, {});

  /* ---------- derived data ---------- */

  const clientName = clientDisplayName || session.clientName || "Unnamed Athlete";
  const dateStr = new Date(session.recordedAt).toLocaleDateString();

  // Overview summary
  let summaryText = "No session summary available.";
  const parsedOverview = safeJsonParse<{ sessionSummary?: string }>(session.overviewAnalysis, {});
  if (parsedOverview.sessionSummary) {
    summaryText = parsedOverview.sessionSummary;
  } else if (session.sessionNotes) {
    summaryText = session.sessionNotes;
  }

  // Category emphasis
  const categoryCounts: Record<string, number> = {};
  exercises.forEach((ex) => {
    const cat = ex.category || "strength";
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });
  const total = exercises.length || 1;
  const sortedCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([cat, count]) => ({ category: cat, count, pct: Math.round((count / total) * 100) }));

  // Coaching cues fallback for strengths
  const allCues = exercises.flatMap((ex) => safeJsonParse<string[]>(ex.coachingCues, []));

  // Strengths
  const strengths = reportData.strengths && reportData.strengths.length > 0
    ? reportData.strengths
    : allCues.slice(0, 4);

  // Recommendations fallback
  let recommendations = reportData.recommendations || [];
  if (recommendations.length === 0 && session.sessionNotes) {
    const lines = session.sessionNotes.split("\n");
    let inRec = false;
    const parsed: { title: string; detail: string }[] = [];
    for (const line of lines) {
      if (/recommendations/i.test(line)) {
        inRec = true;
        continue;
      }
      if (inRec) {
        const match = line.match(/^[\s]*(?:\d+[.)]\s*|[-•]\s*)(.+)/);
        if (match) {
          parsed.push({ title: `Recommendation ${parsed.length + 1}`, detail: match[1].trim() });
        } else if (line.trim() === "" && parsed.length > 0) {
          break;
        }
      }
    }
    recommendations = parsed;
  }

  /* ---------- local state ---------- */

  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [exerciseNames, setExerciseNames] = useState<Record<string, string>>({});
  const [notesExpanded, setNotesExpanded] = useState(false);

  /* ---------- handlers ---------- */

  const toggleExercise = (id: string) => {
    setExpandedExercise((prev) => (prev === id ? null : id));
  };

  const startRename = (ex: Exercise) => {
    setEditingExerciseId(ex.id);
    setEditName(exerciseNames[ex.id] || ex.name);
  };

  const commitRename = async (exerciseId: string) => {
    setEditingExerciseId(null);
    const trimmed = editName.trim();
    if (!trimmed) return;
    setExerciseNames((prev) => ({ ...prev, [exerciseId]: trimmed }));
    try {
      await fetch(`/api/exercises/${exerciseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
    } catch {
      // silently fail — local state already updated
    }
  };

  /* ---------- render ---------- */

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      {/* ===== 1. HEADER ===== */}
      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            {onBack && (
              <button
                onClick={onBack}
                className="mb-2 flex items-center gap-1 text-[11px] font-black uppercase tracking-[0.15em] text-slate-500 transition hover:text-slate-300"
              >
                <span className="text-[13px]">&larr;</span> Back
              </button>
            )}
            <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">
              Session Report
            </p>
            <h1 className="text-lg font-bold text-slate-200">{clientName}</h1>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
              <span>{dateStr}</span>
              <span className="text-slate-600">|</span>
              <span>{formatDuration(session.durationSeconds)}</span>
              <span className="text-slate-600">|</span>
              <span>{exercises.length} exercise{exercises.length !== 1 ? "s" : ""}</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {onReprocess && (
              <button
                onClick={onReprocess}
                className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.15em] text-cyan-300 transition hover:bg-cyan-500/20"
              >
                Reprocess
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.15em] text-red-400 transition hover:bg-red-500/20"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ===== 2. FLAGS ===== */}
      {reportData.flags && reportData.flags.length > 0 && (
        <div className="space-y-2">
          {reportData.flags.map((flag, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 rounded-2xl border p-4 ${
                flag.level === "warning"
                  ? "border-amber-500/30 bg-amber-500/10"
                  : "border-indigo-500/30 bg-indigo-500/10"
              }`}
            >
              <span className="mt-0.5 text-[14px]">
                {flag.level === "warning" ? "⚠" : "ℹ"}
              </span>
              <p
                className={`text-[13px] ${
                  flag.level === "warning" ? "text-amber-300" : "text-indigo-300"
                }`}
              >
                {flag.text}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ===== 3. SESSION OVERVIEW ===== */}
      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
        <p className="mb-3 text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">
          Session Overview
        </p>
        <p className="text-[13px] leading-relaxed text-slate-300">{summaryText}</p>
      </div>

      {/* ===== 4. CATEGORY EMPHASIS ===== */}
      {sortedCategories.length > 0 && (
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
          <p className="mb-4 text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">
            Category Emphasis
          </p>
          <div className="space-y-3">
            {sortedCategories.map(({ category, count, pct }) => (
              <div key={category}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-400">
                    {category}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {count} ({pct}%)
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all ${CATEGORY_BAR_COLORS[category] || "bg-slate-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== 5. EXERCISE LIST ===== */}
      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
        <p className="mb-4 text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">
          Exercises
        </p>
        <div className="space-y-2">
          {exercises
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map((ex, idx) => {
              const isExpanded = expandedExercise === ex.id;
              const catColor = getCategoryColor(ex.category);
              const displayName = exerciseNames[ex.id] || ex.name;
              const cues = safeJsonParse<string[]>(ex.coachingCues, []);
              const score = ex.formScoreOverride ?? ex.formScore;

              return (
                <div
                  key={ex.id}
                  className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800/50"
                >
                  {/* Row */}
                  <button
                    onClick={() => toggleExercise(ex.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-800"
                  >
                    <span className="w-6 shrink-0 text-center text-[11px] font-bold text-slate-500">
                      {idx + 1}
                    </span>

                    {editingExerciseId === ex.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={() => commitRename(ex.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(ex.id);
                          if (e.key === "Escape") setEditingExerciseId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-900 px-2 py-0.5 text-[13px] text-slate-200 outline-none focus:border-cyan-500"
                      />
                    ) : (
                      <span
                        className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-200"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          startRename(ex);
                        }}
                        title="Double-click to rename"
                      >
                        {displayName}
                      </span>
                    )}

                    {ex.category && (
                      <span
                        className={`shrink-0 rounded-lg border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.15em] ${catColor.bg} ${catColor.text} ${catColor.border}`}
                      >
                        {ex.category}
                      </span>
                    )}

                    {ex.repCount != null && (
                      <span className="shrink-0 text-[10px] text-slate-500">
                        {ex.repCount} reps
                      </span>
                    )}

                    <span className="shrink-0 text-[10px] text-slate-600">
                      {ex.startTimestamp}
                    </span>

                    <span
                      className={`shrink-0 text-[13px] text-slate-500 transition-transform ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                    >
                      ▾
                    </span>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-slate-700 bg-slate-800/30 px-4 py-4 space-y-3">
                      {/* Time range */}
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">
                          Time
                        </span>
                        {ex.startTimestamp} — {ex.endTimestamp}
                      </div>

                      {/* Form score */}
                      {score != null && (
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">
                            Form Score
                          </span>
                          <span
                            className={`text-[13px] font-bold ${
                              score >= 8
                                ? "text-emerald-400"
                                : score >= 5
                                  ? "text-amber-400"
                                  : "text-red-400"
                            }`}
                          >
                            {score}/10
                          </span>
                        </div>
                      )}

                      {/* Coaching cues */}
                      {cues.length > 0 && (
                        <div>
                          <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">
                            Coaching Cues
                          </span>
                          <ul className="mt-1.5 space-y-1">
                            {cues.map((cue, ci) => (
                              <li key={ci} className="flex items-start gap-2 text-[13px] text-slate-300">
                                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-cyan-500" />
                                {cue}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Form notes */}
                      {ex.formNotes && (
                        <div>
                          <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">
                            Form Notes
                          </span>
                          <p className="mt-1 text-[13px] leading-relaxed text-slate-300">
                            {ex.formNotes}
                          </p>
                        </div>
                      )}

                      {/* View clip */}
                      {ex.clipFilePath && (
                        <a
                          href={ex.clipFilePath}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.15em] text-cyan-300 transition hover:bg-cyan-500/20"
                        >
                          View Clip
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* ===== 6. STRENGTHS + IMPROVEMENTS ===== */}
      {(strengths.length > 0 || (reportData.improvements && reportData.improvements.length > 0)) && (
        <div className="grid gap-5 sm:grid-cols-2">
          {/* Strengths */}
          {strengths.length > 0 && (
            <div className="rounded-2xl border border-emerald-500/20 bg-slate-900 p-5">
              <p className="mb-3 text-[9px] font-black uppercase tracking-[0.15em] text-emerald-400">
                Strengths
              </p>
              <ul className="space-y-2">
                {strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-slate-300">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Improvements */}
          {reportData.improvements && reportData.improvements.length > 0 && (
            <div className="rounded-2xl border border-amber-500/20 bg-slate-900 p-5">
              <p className="mb-3 text-[9px] font-black uppercase tracking-[0.15em] text-amber-400">
                Areas for Improvement
              </p>
              <ul className="space-y-3">
                {reportData.improvements.map((imp, i) => (
                  <li key={i}>
                    <p className="text-[11px] font-black uppercase tracking-[0.15em] text-amber-300">
                      {imp.area}
                    </p>
                    <p className="mt-0.5 text-[13px] text-slate-300">{imp.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ===== 7. RECOMMENDATIONS ===== */}
      {recommendations.length > 0 && (
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
          <p className="mb-4 text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">
            Recommendations
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {recommendations.map((rec, i) => (
              <div
                key={i}
                className="rounded-xl border border-cyan-500/15 bg-slate-800/50 p-4"
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-[10px] font-bold text-cyan-300">
                    {i + 1}
                  </span>
                  <span className="text-[11px] font-black uppercase tracking-[0.15em] text-cyan-300">
                    {rec.title}
                  </span>
                </div>
                <p className="text-[13px] leading-relaxed text-slate-300">{rec.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== 8. SESSION NOTES (collapsible) ===== */}
      {session.sessionNotes && (
        <div className="rounded-2xl border border-slate-700 bg-slate-900">
          <button
            onClick={() => setNotesExpanded((prev) => !prev)}
            className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-slate-800/50"
          >
            <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">
              Session Notes
            </span>
            <span
              className={`text-[13px] text-slate-500 transition-transform ${
                notesExpanded ? "rotate-180" : ""
              }`}
            >
              ▾
            </span>
          </button>
          {notesExpanded && (
            <div className="border-t border-slate-700 p-5">
              <pre className="whitespace-pre-wrap rounded-xl bg-slate-950 p-4 font-mono text-[13px] leading-relaxed text-slate-300">
                {session.sessionNotes}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
