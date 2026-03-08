import { notFound } from "next/navigation";
import { getSession } from "@/lib/db/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ProcessingStatus } from "@/components/sessions/processing-status";
import { ExerciseGrid } from "@/components/exercises/exercise-grid";
import { formatDuration } from "@/lib/utils/timestamps";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const session = await getSession(sessionId);

  if (!session) notFound();

  const isComplete = session.status === "complete";
  const exercises = session.exercises || [];

  return (
    <div className="space-y-6">
      {/* Session Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {session.title || "Training Session"}
          </h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            {session.clientName && <span>Client: {session.clientName}</span>}
            <span>{new Date(session.recordedAt).toLocaleDateString()}</span>
            {session.durationSeconds && (
              <span>{formatDuration(session.durationSeconds)}</span>
            )}
          </div>
        </div>
        <Badge
          variant="secondary"
          className={
            isComplete
              ? "bg-[#07B492] text-white"
              : session.status === "error"
                ? "bg-red-500 text-white"
                : "bg-[#000075] text-white"
          }
        >
          {session.status}
        </Badge>
      </div>

      {/* Processing Status */}
      <ProcessingStatus
        sessionId={sessionId}
        initialStatus={session.status}
      />

      {/* Session Notes */}
      {session.sessionNotes && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">Session Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="whitespace-pre-wrap text-sm text-secondary-foreground">
              {session.sessionNotes}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Exercise Grid */}
      {exercises.length > 0 && (
        <>
          <Separator className="bg-border" />
          <div>
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              Exercises ({exercises.length})
            </h2>
            <ExerciseGrid exercises={exercises} />
          </div>
        </>
      )}
    </div>
  );
}
