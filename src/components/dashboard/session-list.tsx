import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/utils/timestamps";

const statusColors: Record<string, string> = {
  uploading: "bg-amber-500",
  uploaded: "bg-[#00CCFF]",
  analyzing: "bg-[#000075]",
  segmenting: "bg-[#000075]",
  generating_notes: "bg-[#000075]",
  complete: "bg-[#07B492]",
  error: "bg-red-500",
};

interface SessionItem {
  id: string;
  title: string | null;
  date: string;
  duration: number | null;
  exerciseCount: number;
  status: string;
  clientName?: string | null;
}

export function SessionList({ sessions }: { sessions: SessionItem[] }) {
  return (
    <div className="space-y-2">
      {sessions.map((s) => (
        <Link key={s.id} href={`/sessions/${s.id}`} className="block">
          <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/50">
            <div>
              <p className="font-medium text-foreground">{s.title || "Untitled Session"}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(s.date).toLocaleDateString()}
                {s.duration ? ` · ${formatDuration(s.duration)}` : ""}
                {` · ${s.exerciseCount} exercises`}
              </p>
            </div>
            <Badge variant="secondary" className={`${statusColors[s.status] || ""} text-white`}>
              {s.status}
            </Badge>
          </div>
        </Link>
      ))}
    </div>
  );
}
