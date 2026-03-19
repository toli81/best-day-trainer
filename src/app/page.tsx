import Link from "next/link";
import { listSessions, getClientName } from "@/lib/db/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { sessions } = await listSessions(1, 20);

  const sessionsWithClientNames = await Promise.all(
    sessions.map(async (session) => ({
      ...session,
      resolvedClientName: await getClientName(session),
    }))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Sessions</h1>
        <div className="flex gap-2">
          <Link href="/record">
            <Button className="rounded-[10px] bg-[#00CCFF] text-white hover:bg-[#00b8e6]">
              Record Session
            </Button>
          </Link>
          <Link href="/upload">
            <Button variant="outline" className="rounded-[10px] border-border text-secondary-foreground hover:bg-secondary">
              Upload Video
            </Button>
          </Link>
        </div>
      </div>

      {sessionsWithClientNames.length === 0 ? (
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#00CCFF]/10">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#00CCFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-foreground">No sessions yet</h2>
            <p className="mt-2 max-w-sm text-muted-foreground">
              Record or upload your first training session to get started.
            </p>
            <div className="mt-6 flex gap-3">
              <Link href="/record">
                <Button className="rounded-[10px] bg-[#00CCFF] text-white hover:bg-[#00b8e6]">
                  Record Session
                </Button>
              </Link>
              <Link href="/upload">
                <Button variant="outline" className="rounded-[10px] border-border text-secondary-foreground hover:bg-secondary">
                  Upload Video
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {sessionsWithClientNames.map((session) => (
            <Link key={session.id} href={`/sessions/${session.id}`}>
              <Card className="border-border bg-card transition-all hover:border-[#00CCFF]/30 hover:shadow-md">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base text-foreground">
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
      )}
    </div>
  );
}
