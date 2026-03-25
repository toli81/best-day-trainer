"use client";

import { useRouter } from "next/navigation";
import { SessionReport } from "@/components/sessions/session-report";
import { ProcessingStatus } from "@/components/sessions/processing-status";
import type { Session, Exercise } from "@/lib/db/schema";

interface Props {
  session: Session & { exercises: Exercise[] };
  clientDisplayName: string | null;
}

export function SessionDetailClient({ session, clientDisplayName }: Props) {
  const router = useRouter();
  const isComplete = session.status === "complete";

  const handleReprocess = async () => {
    await fetch(`/api/sessions/${session.id}/process`, { method: "POST" });
    router.refresh();
  };

  const handleDelete = async () => {
    if (!confirm("Delete this session? This cannot be undone.")) return;
    await fetch(`/api/sessions/${session.id}`, { method: "DELETE" });
    router.push("/sessions");
  };

  return (
    <>
      {!isComplete && (
        <ProcessingStatus sessionId={session.id} initialStatus={session.status} />
      )}
      <SessionReport
        session={session}
        clientDisplayName={clientDisplayName}
        onReprocess={(isComplete || session.status === "error") ? handleReprocess : undefined}
        onDelete={handleDelete}
        onBack={() => router.push("/sessions")}
      />
    </>
  );
}
