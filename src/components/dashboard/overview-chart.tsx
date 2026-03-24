"use client";

import { useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "./empty-state";

interface DataPoint {
  date: string;
  reps: number;
  sets: number;
}

export function OverviewChart({ client, range }: { client: string; range: string }) {
  const [volumeData, setVolumeData] = useState<DataPoint[]>([]);
  const [formData, setFormData] = useState<{ date: string; score: number }[]>([]);

  useEffect(() => {
    fetch(`/api/dashboard/volume?client=${client}&range=${range}`)
      .then((r) => r.json())
      .then(setVolumeData)
      .catch(() => {});
    fetch(`/api/dashboard/form?client=${client}&range=${range}`)
      .then((r) => r.json())
      .then((data: { date: string; score: number }[]) => {
        const byDate: Record<string, number[]> = {};
        for (const d of data) {
          if (!byDate[d.date]) byDate[d.date] = [];
          byDate[d.date].push(d.score);
        }
        setFormData(
          Object.entries(byDate).map(([date, scores]) => ({
            date,
            score: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
          }))
        );
      })
      .catch(() => {});
  }, [client, range]);

  if (volumeData.length === 0) return <EmptyState message="No volume data in this time range." />;

  const merged = volumeData.map((v) => {
    const f = formData.find((fd) => fd.date === v.date);
    return { ...v, formScore: f?.score ?? null };
  });

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Volume & Form Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={merged}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis yAxisId="right" orientation="right" domain={[0, 10]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  color: "hsl(var(--foreground))",
                }}
              />
              <Area yAxisId="left" type="monotone" dataKey="reps" stroke="#00CCFF" fill="#00CCFF" fillOpacity={0.2} name="Reps" />
              <Area yAxisId="right" type="monotone" dataKey="formScore" stroke="#07B492" fill="#07B492" fillOpacity={0.1} name="Form Score" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
