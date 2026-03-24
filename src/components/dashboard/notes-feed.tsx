import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

interface NoteItem {
  sessionId: string;
  title: string | null;
  date: string;
  notesPreview: string;
  clientName?: string | null;
}

export function NotesFeed({ notes }: { notes: NoteItem[] }) {
  return (
    <div className="space-y-3">
      {notes.map((note) => (
        <Link key={note.sessionId} href={`/sessions/${note.sessionId}`} className="block">
          <Card className="border-border bg-card transition-colors hover:bg-muted/50">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-foreground">{note.title || "Training Session"}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(note.date).toLocaleDateString()}
                    {note.clientName ? ` · ${note.clientName}` : ""}
                  </p>
                </div>
              </div>
              <p className="mt-2 line-clamp-3 text-sm text-secondary-foreground">{note.notesPreview}</p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
