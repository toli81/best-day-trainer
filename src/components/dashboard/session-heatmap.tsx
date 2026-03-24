"use client";

import { cn } from "@/lib/utils";

interface HeatmapDay { date: string; count: number }

export function SessionHeatmap({ data }: { data: HeatmapDay[] }) {
  if (data.length === 0) return null;

  const countMap = new Map(data.map((d) => [d.date, d.count]));
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  const days: { date: string; count: number }[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    days.push({ date: dateStr, count: countMap.get(dateStr) || 0 });
  }

  function intensity(count: number): string {
    if (count === 0) return "bg-muted";
    const ratio = count / maxCount;
    if (ratio <= 0.33) return "bg-[#00CCFF]/30";
    if (ratio <= 0.66) return "bg-[#00CCFF]/60";
    return "bg-[#00CCFF]";
  }

  return (
    <div className="flex flex-wrap gap-1">
      {days.map((day) => (
        <div
          key={day.date}
          title={`${day.date}: ${day.count} session${day.count !== 1 ? "s" : ""}`}
          className={cn("h-3 w-3 rounded-sm", intensity(day.count))}
        />
      ))}
    </div>
  );
}
