"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";

const statusMessages: Record<string, string> = {
  uploaded: "Ready to process",
  analyzing: "AI is analyzing the video...",
  segmenting: "Extracting exercise clips...",
  generating_notes: "Writing session notes...",
  complete: "Processing complete!",
  error: "Processing failed",
};

const stageMessages: Record<string, string> = {
  downloaded: "Video downloaded",
  compressed: "Video compressed",
  uploaded_to_gemini: "Uploaded to AI",
  overview_complete: "Exercise list identified",
  details_complete: "Exercise details analyzed",
  clips_extracted: "Clips extracted",
  notes_generated: "Notes written",
  complete: "Done!",
};

const stageProgress: Record<string, number> = {
  downloaded: 10,
  compressed: 20,
  uploaded_to_gemini: 35,
  overview_complete: 50,
  details_complete: 65,
  clips_extracted: 80,
  notes_generated: 90,
  complete: 100,
};

const statusProgress: Record<string, number> = {
  uploaded: 0,
  analyzing: 30,
  segmenting: 65,
  generating_notes: 85,
  complete: 100,
  error: 0,
};

interface ProcessingStatusProps {
  sessionId: string;
  initialStatus: string;
}

export function ProcessingStatus({
  sessionId,
  initialStatus,
}: ProcessingStatusProps) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [pipelineStage, setPipelineStage] = useState<string | null>(null);

  useEffect(() => {
    if (status === "complete" || status === "error") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/status`);
        const data = await res.json();
        setStatus(data.status);
        if (data.pipelineStage) setPipelineStage(data.pipelineStage);
        if (data.processingError) setError(data.processingError);
        if (data.status === "complete") {
          clearInterval(interval);
          router.refresh();
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [sessionId, status, router]);

  const handleProcess = async () => {
    setStatus("analyzing");
    setError(null);
    await fetch(`/api/sessions/${sessionId}/process`, { method: "POST" });
  };

  if (status === "complete") return null;

  return (
    <Card className="border-border bg-card">
      <CardContent className="py-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-medium text-foreground">
              {statusMessages[status] || status}
            </span>
            <span className="text-sm text-muted-foreground">
              {pipelineStage && stageProgress[pipelineStage]
                ? `${stageProgress[pipelineStage]}%`
                : `${statusProgress[status] || 0}%`}
            </span>
          </div>
          <Progress
            value={
              pipelineStage && stageProgress[pipelineStage]
                ? stageProgress[pipelineStage]
                : statusProgress[status] || 0
            }
            className="[&>div]:bg-[#00CCFF]"
          />
          {pipelineStage && status !== "complete" && status !== "error" && stageMessages[pipelineStage] && (
            <p className="text-xs text-muted-foreground">
              Last completed: {stageMessages[pipelineStage]}
            </p>
          )}

          {status === "uploaded" && (
            <button
              onClick={handleProcess}
              className="w-full rounded-[10px] bg-[#00CCFF] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#00b8e6]"
            >
              Start AI Analysis
            </button>
          )}

          {status === "error" && (
            <div className="space-y-2">
              <p className="text-sm text-red-600">
                {error || "An unknown error occurred"}
              </p>
              <button
                onClick={handleProcess}
                className="w-full rounded-[10px] bg-[#00CCFF] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#00b8e6]"
              >
                Retry Analysis
              </button>
            </div>
          )}

          {(status === "analyzing" ||
            status === "segmenting" ||
            status === "generating_notes") && (
            <p className="text-center text-xs text-muted-foreground">
              This may take 10-15 minutes for a 1-hour session. You can leave
              this page and come back.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
