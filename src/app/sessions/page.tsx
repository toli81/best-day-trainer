import Link from "next/link";
import { listSessions, getClientName } from "@/lib/db/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/utils/timestamps";

export const dynamic = "force-dynamic";

const statusColors: Record<string, string> = {
  uploading: "bg-yellow-500",
  uploaded: "bg-blue-500",
  analyzing: "bg-purple-500",
  segmenting: "bg-purple-500",
  generating_notes: "bg-purple-500",
  complete: "bg-green-500",
  error: "bg-red-500",
};

export default async function SessionsPage() {
  const { sessions, total } = await listSessions(1, 50);

  const sessionsWithClientNames = await Promise.all(
    sessions.map(async (session) => ({
      ...session,
      resolvedClientName: await getClientName(session),
    }))
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">All Sessions</h1>
        <p className="text-sm text-muted-foreground">{total} sessions total</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {sessionsWithClientNames.map((session) => (
          <Link key={session.id} href={`/sessions/${session.id}`}>
            <Card className="transition-shadow hover:shadow-md">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">
                    {session.title || "Untitled Session"}
                  </CardTitle>
                  <Badge
                    variant="secondary"
                    className={`${statusColors[session.status] || ""} text-white`}
                  >
                    {session.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                  {session.resolvedClientName && <p>Client: {session.resolvedClientName}</p>}
                  <p>
                    {new Date(session.recordedAt).toLocaleDateString()}{" "}
                    {session.durationSeconds
                      ? `\u00B7 ${formatDuration(session.durationSeconds)}`
                      : ""}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
