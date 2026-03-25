import { notFound } from "next/navigation";
import { getSession, getClientName } from "@/lib/db/queries";
import { SessionDetailClient } from "./session-detail-client";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const session = await getSession(sessionId);
  if (!session) notFound();

  const clientDisplayName = await getClientName(session);

  return <SessionDetailClient session={session} clientDisplayName={clientDisplayName} />;
}
