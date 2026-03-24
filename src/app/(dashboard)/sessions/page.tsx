"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
import { SessionHeatmap } from "@/components/dashboard/session-heatmap";
import { SessionList } from "@/components/dashboard/session-list";
import { EmptyState } from "@/components/dashboard/empty-state";

export default function SessionsPage() {
  const searchParams = useSearchParams();
  const client = searchParams.get("client") || "all";
  const range = searchParams.get("range") || "90d";
  const [heatmap, setHeatmap] = useState<{ date: string; count: number }[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/api/dashboard/sessions?client=${client}&range=${range}`)
      .then((r) => r.json())
      .then((data) => {
        setHeatmap(data.heatmap || []);
        setSessions(data.sessions || []);
      })
      .catch(() => {});
  }, [client, range]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Sessions</h1>
        <TimeRangeSelector />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Training Frequency</h2>
        <SessionHeatmap data={heatmap} />
      </div>

      {sessions.length > 0 ? (
        <SessionList sessions={sessions} />
      ) : (
        <EmptyState message="No sessions in this time range." />
      )}
    </div>
  );
}
