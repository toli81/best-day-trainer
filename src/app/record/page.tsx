"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMediaRecorder } from "@/hooks/use-media-recorder";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { useUpload } from "@/hooks/use-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function RecordPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const {
    isRecording,
    duration,
    error,
    stream,
    blob,
    devices,
    selectedCamera,
    selectedMic,
    setSelectedCamera,
    setSelectedMic,
    startPreview,
    startRecording,
    stopRecording,
    cleanup,
  } = useMediaRecorder();
  const wakeLock = useWakeLock();
  const uploader = useUpload();
  const [retrying, setRetrying] = useState(false);
  const [phase, setPhase] = useState<"setup" | "recording" | "uploading">("setup");

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    startPreview();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStart = async () => {
    await wakeLock.request();
    await startRecording();
    setPhase("recording");
  };

  const handleStop = () => {
    stopRecording();
    wakeLock.release();
  };

  useEffect(() => {
    if (blob && phase === "recording") {
      setPhase("uploading");
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      const file = new File([blob], `session-${Date.now()}.${ext}`, {
        type: blob.type,
      });
      uploader
        .upload(file)
        .then((sessionId) => {
          router.push(`/sessions/${sessionId}`);
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob]);

  return (
    <div className="space-y-4">
      {/* Video Preview */}
      <div className="relative overflow-hidden rounded-[10px] bg-[#111F32]">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="aspect-video w-full object-cover"
        />

        {isRecording && (
          <div className="absolute inset-0 flex flex-col items-center justify-between p-4">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
              <span className="rounded-full bg-[#111F32]/80 px-3 py-1 font-mono text-lg text-white">
                {formatTime(duration)}
              </span>
            </div>
            <div />
          </div>
        )}

        {isRecording && !wakeLock.isLocked && (
          <div className="absolute left-0 right-0 top-12 mx-4">
            <div className="rounded-[10px] bg-[#FF9900] px-3 py-2 text-center text-sm font-medium text-[#111F32]">
              Screen lock protection lost. Keep the screen on!
            </div>
          </div>
        )}
      </div>

      {/* Setup Panel */}
      {phase === "setup" && (
        <Card className="border-border bg-card">
          <CardContent className="space-y-3 pt-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-secondary-foreground">Camera</label>
              <Select value={selectedCamera} onValueChange={(v) => { if (v) setSelectedCamera(v); }}>
                <SelectTrigger className="rounded-[10px] border-border">
                  <SelectValue placeholder="Select camera" />
                </SelectTrigger>
                <SelectContent>
                  {devices.cameras.map((cam) => (
                    <SelectItem key={cam.deviceId} value={cam.deviceId}>
                      {cam.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-secondary-foreground">Microphone</label>
              <Select value={selectedMic} onValueChange={(v) => { if (v) setSelectedMic(v); }}>
                <SelectTrigger className="rounded-[10px] border-border">
                  <SelectValue placeholder="Select microphone" />
                </SelectTrigger>
                <SelectContent>
                  {devices.microphones.map((mic) => (
                    <SelectItem key={mic.deviceId} value={mic.deviceId}>
                      {mic.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {devices.microphones.some(
                (m) =>
                  !m.label.toLowerCase().includes("built-in") &&
                  !m.label.toLowerCase().includes("default")
              ) && (
                <Badge variant="secondary" className="mt-1 bg-[#07B492]/10 text-[#07B492]">
                  External mic detected
                </Badge>
              )}
            </div>

            <Button
              onClick={() => startPreview()}
              variant="outline"
              size="sm"
              className="w-full rounded-[10px] border-border text-secondary-foreground hover:bg-secondary"
            >
              Refresh Preview
            </Button>
          </CardContent>
        </Card>
      )}

      {phase === "setup" && (
        <Button
          onClick={handleStart}
          size="lg"
          className="w-full rounded-[10px] bg-[#00CCFF] text-lg text-white hover:bg-[#00b8e6]"
        >
          Start Recording
        </Button>
      )}

      {phase === "recording" && (
        <Button
          onClick={handleStop}
          size="lg"
          variant="destructive"
          className="w-full rounded-[10px] text-lg"
        >
          Stop Recording
        </Button>
      )}

      {phase === "uploading" && (
        <Card className="border-border bg-card">
          <CardContent className="space-y-2 py-4">
            <div className="flex justify-between text-sm text-secondary-foreground">
              <span>Uploading session...</span>
              <span>{uploader.progress}%</span>
            </div>
            <Progress value={uploader.progress} className="[&>div]:bg-[#00CCFF]" />
          </CardContent>
        </Card>
      )}

      {(error || uploader.error) && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="py-3 text-sm text-red-700">
            {error || uploader.error}
          </CardContent>
        </Card>
      )}

      {uploader.error && !uploader.uploading && (
        <Button
          onClick={async () => {
            setRetrying(true);
            try {
              const sessionId = await uploader.retry();
              if (sessionId) router.push(`/sessions/${sessionId}`);
            } catch {
              // error is set in hook
            } finally {
              setRetrying(false);
            }
          }}
          disabled={retrying}
          size="lg"
          className="w-full rounded-[10px] bg-[#FF9900] text-lg text-white hover:bg-[#e68a00]"
        >
          {retrying ? "Retrying..." : "Retry Upload"}
        </Button>
      )}
    </div>
  );
}
