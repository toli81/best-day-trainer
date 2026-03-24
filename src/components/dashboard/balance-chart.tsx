"use client";

import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "./empty-state";

interface DataPoint { muscleGroup: string; totalReps: number; percentage: number }

const COLORS = ["#00CCFF", "#07B492", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#6366f1", "#14b8a6"];

export function BalanceChart({ client, range }: { client: string; range: string }) {
  const [data, setData] = useState<DataPoint[]>([]);

  useEffect(() => {
    fetch(`/api/dashboard/balance?client=${client}&range=${range}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [client, range]);

  if (data.length === 0) return <EmptyState message="No muscle group data in this time range." />;

  return (
    <Card className="border-border bg-card">
      <CardContent className="pt-6">
        <div className="flex flex-col items-center gap-4 md:flex-row">
          <div className="h-64 w-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="totalReps" nameKey="muscleGroup" cx="50%" cy="50%" innerRadius={60} outerRadius={100}>
                  {data.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--foreground))" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-2">
            {data.map((d, i) => (
              <div key={d.muscleGroup} className="flex items-center gap-2 text-sm">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-foreground">{d.muscleGroup}</span>
                <span className="text-muted-foreground">{d.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
