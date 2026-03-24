"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { StatCard } from "@/components/dashboard/stat-card";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
import { OverviewChart } from "@/components/dashboard/overview-chart";
import { SessionList } from "@/components/dashboard/session-list";
import { EmptyState } from "@/components/dashboard/empty-state";

interface Stats {
  totalSessions: number;
  weekDelta: number;
  consistencyPercent: number;
  isShortRange: boolean;
  weeklyFrequency: string;
  monthlyVolume: number;
  volumeChange: number;
  avgFormScore: number;
  formTrend: "up" | "down" | "flat";
}

interface SessionItem {
  id: string;
  title: string | null;
  date: string;
  duration: number | null;
  exerciseCount: number;
  status: string;
}

export default function OverviewPage() {
  const searchParams = useSearchParams();
  const client = searchParams.get("client") || "all";
  const range = searchParams.get("range") || "30d";
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentSessions, setRecentSessions] = useState<SessionItem[]>([]);

  useEffect(() => {
    fetch(`/api/dashboard/stats?client=${client}&range=${range}`)
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});

    fetch(`/api/dashboard/sessions?client=${client}&range=${range}`)
      .then((r) => r.json())
      .then((data) => setRecentSessions((data.sessions || []).slice(0, 5)))
      .catch(() => {});
  }, [client, range]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Overview</h1>
        <TimeRangeSelector />
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard
            label="Total Sessions"
            value={stats.totalSessions}
            delta={`${stats.weekDelta} this week`}
          />
          <StatCard
            label={stats.isShortRange ? "This Week" : "Consistency"}
            value={stats.isShortRange ? `${stats.weekDelta} sessions` : `${stats.consistencyPercent}%`}
            delta={stats.isShortRange ? undefined : stats.weeklyFrequency}
          />
          <StatCard
            label="Volume (reps)"
            value={stats.monthlyVolume.toLocaleString()}
            delta={stats.volumeChange !== 0 ? `${stats.volumeChange > 0 ? "+" : ""}${stats.volumeChange}%` : undefined}
            trend={stats.volumeChange > 0 ? "up" : stats.volumeChange < 0 ? "down" : "flat"}
          />
          <StatCard
            label="Avg Form Score"
            value={stats.avgFormScore || "—"}
            trend={stats.formTrend}
          />
        </div>
      )}

      <OverviewChart client={client} range={range} />

      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Recent Sessions</h2>
        {recentSessions.length > 0 ? (
          <SessionList sessions={recentSessions} />
        ) : (
          <EmptyState message="No sessions in this time range." />
        )}
      </div>
    </div>
  );
}
