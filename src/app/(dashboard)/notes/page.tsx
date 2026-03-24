"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
import { NotesFeed } from "@/components/dashboard/notes-feed";
import { EmptyState } from "@/components/dashboard/empty-state";

interface NoteItem {
  sessionId: string;
  title: string | null;
  date: string;
  sessionNotes: string | null;
  clientName?: string | null;
}

export default function NotesPage() {
  const searchParams = useSearchParams();
  const client = searchParams.get("client") || "all";
  const range = searchParams.get("range") || "30d";
  const [notes, setNotes] = useState<NoteItem[]>([]);

  useEffect(() => {
    fetch(`/api/dashboard/notes?client=${client}&range=${range}`)
      .then((r) => r.json())
      .then(setNotes)
      .catch(() => {});
  }, [client, range]);

  const feedItems = notes.map((n) => ({
    sessionId: n.sessionId,
    title: n.title,
    date: n.date,
    notesPreview: (n.sessionNotes || "").slice(0, 200),
    clientName: n.clientName,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Session Notes</h1>
        <TimeRangeSelector />
      </div>
      {feedItems.length > 0 ? (
        <NotesFeed notes={feedItems} />
      ) : (
        <EmptyState message="No session notes in this time range." />
      )}
    </div>
  );
}
