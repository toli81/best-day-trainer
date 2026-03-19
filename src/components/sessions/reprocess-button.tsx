"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ReprocessButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [processing, setProcessing] = useState(false);

  const handleReprocess = async () => {
    setProcessing(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/process`, {
        method: "POST",
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to start reprocessing");
      }
    } catch {
      alert("Failed to start reprocessing");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      className="text-[#00CCFF] hover:bg-[#00CCFF]/10 hover:text-[#00b8e6]"
      onClick={handleReprocess}
      disabled={processing}
    >
      {processing ? "Reprocessing..." : "Reprocess"}
    </Button>
  );
}
