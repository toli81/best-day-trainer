"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUpload } from "@/hooks/use-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { formatFileSize } from "@/lib/utils/timestamps";

export default function UploadPage() {
  const router = useRouter();
  const { progress, uploading, error, stage, upload, cancel } = useUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [clientName, setClientName] = useState("");
  const [sessionDate, setSessionDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("video/")) {
      alert("Please select a video file");
      return;
    }
    setSelectedFile(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleSubmit = async () => {
    if (!selectedFile) return;
    try {
      const sessionId = await upload(selectedFile, clientName, sessionDate);
      router.push(`/sessions/${sessionId}`);
    } catch {
      // error is already set in the hook
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Upload Session Video</h1>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">Video File</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileInputRef.current?.click()}
            className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-[10px] border-2 border-dashed p-8 text-center transition-colors ${
              dragOver
                ? "border-[#00CCFF] bg-[#00CCFF]/5"
                : "border-border hover:border-[#00CCFF]/50"
            }`}
          >
            {selectedFile ? (
              <>
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#07B492]/10">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#07B492" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="text-lg font-medium text-foreground">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatFileSize(selectedFile.size)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Click to change file
                </p>
              </>
            ) : (
              <>
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#00CCFF]/10">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00CCFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <p className="text-lg font-medium text-foreground">
                  Drop video here or click to browse
                </p>
                <p className="text-sm text-muted-foreground">
                  MP4, WebM, MOV supported
                </p>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">Session Details (Optional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-sm font-medium text-secondary-foreground">Client Name</label>
            <Input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g., John Smith"
              className="rounded-[10px] border-border focus-visible:ring-[#00CCFF]"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-secondary-foreground">Session Date</label>
            <Input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              className="rounded-[10px] border-border focus-visible:ring-[#00CCFF]"
            />
          </div>
        </CardContent>
      </Card>

      {uploading && (
        <Card className="border-border bg-card">
          <CardContent className="py-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-secondary-foreground">
                <span>
                  {stage === "assembling"
                    ? "Assembling video..."
                    : `Uploading session...`}
                </span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="[&>div]:bg-[#00CCFF]" />
              {stage === "uploading" && (
                <button
                  onClick={cancel}
                  className="mt-2 text-xs text-red-400 hover:text-red-300"
                >
                  Cancel upload
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="py-4 text-red-700">{error}</CardContent>
        </Card>
      )}

      <Button
        onClick={handleSubmit}
        disabled={!selectedFile || uploading}
        className="w-full rounded-[10px] bg-[#00CCFF] text-white hover:bg-[#00b8e6] disabled:opacity-50"
        size="lg"
      >
        {uploading ? "Uploading..." : "Upload & Analyze"}
      </Button>
    </div>
  );
}
