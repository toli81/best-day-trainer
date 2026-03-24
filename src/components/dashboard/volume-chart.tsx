"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "./empty-state";

interface DataPoint { date: string; reps: number; sets: number }

export function VolumeChart({ client, range, muscleGroup, exercise }: {
  client: string; range: string; muscleGroup?: string; exercise?: string;
}) {
  const [data, setData] = useState<DataPoint[]>([]);

  useEffect(() => {
    const params = new URLSearchParams({ client, range });
    if (muscleGroup) params.set("muscleGroup", muscleGroup);
    if (exercise) params.set("exercise", exercise);
    fetch(`/api/dashboard/volume?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [client, range, muscleGroup, exercise]);

  if (data.length === 0) return <EmptyState message="No volume data in this time range." />;

  return (
    <Card className="border-border bg-card">
      <CardContent className="pt-6">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--foreground))" }} />
              <Bar dataKey="reps" fill="#00CCFF" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
