"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "./empty-state";

interface DataPoint { date: string; exerciseName: string; score: number; isOverride: boolean }

const COLORS = ["#00CCFF", "#07B492", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export function FormChart({ client, range, exercise }: {
  client: string; range: string; exercise?: string;
}) {
  const [data, setData] = useState<DataPoint[]>([]);

  useEffect(() => {
    const params = new URLSearchParams({ client, range });
    if (exercise) params.set("exercise", exercise);
    fetch(`/api/dashboard/form?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [client, range, exercise]);

  if (data.length === 0) return <EmptyState message="No form score data yet. Form scores will appear after sessions are processed." />;

  const exercises = [...new Set(data.map((d) => d.exerciseName))];
  const byDate: Record<string, Record<string, number>> = {};
  for (const d of data) {
    if (!byDate[d.date]) byDate[d.date] = {};
    byDate[d.date][d.exerciseName] = d.score;
  }
  const chartData = Object.entries(byDate).map(([date, scores]) => ({ date, ...scores }));

  return (
    <Card className="border-border bg-card">
      <CardContent className="pt-6">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--foreground))" }} />
              {exercises.slice(0, 6).map((name, i) => (
                <Line key={name} type="monotone" dataKey={name} stroke={COLORS[i % COLORS.length]} dot={{ r: 3 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
