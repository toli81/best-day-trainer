"use client";

import { useState, useCallback, useRef } from "react";

const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB per chunk (smaller for mobile reliability)
const MAX_RETRIES = 5;
const CHUNK_TIMEOUT_MS = 60_000; // 60s timeout per chunk

interface UploadState {
  progress: number;
  uploading: boolean;
  error: string | null;
  sessionId: string | null;
  stage: "idle" | "uploading" | "assembling";
}

async function sendChunkWithRetry(
  uploadId: string,
  chunk: Blob,
  chunkIndex: number,
  retries = MAX_RETRIES
): Promise<void> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const formData = new FormData();
      formData.append("uploadId", uploadId);
      formData.append("chunkIndex", String(chunkIndex));
      formData.append("chunk", chunk);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CHUNK_TIMEOUT_MS);

      try {
        const res = await fetch("/api/upload/chunk", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            data.details || data.error || `Chunk ${chunkIndex} failed: ${res.statusText}`
          );
        }
        return; // success
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof DOMException && err.name === "AbortError") {
          throw new Error(`Chunk ${chunkIndex} timed out`);
        }
        throw err;
      }
    } catch (err) {
      if (attempt === retries - 1) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Upload failed at chunk ${chunkIndex + 1} after ${retries} attempts: ${msg}`);
      }
      // Exponential backoff: 2s, 4s, 6s, 8s
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

export function useUpload() {
  const [state, setState] = useState<UploadState>({
    progress: 0,
    uploading: false,
    error: null,
    sessionId: null,
    stage: "idle",
  });
  const abortRef = useRef(false);

  const upload = useCallback(
    async (file: File, clientName?: string, sessionDate?: string) => {
      abortRef.current = false;
      setState({
        progress: 0,
        uploading: true,
        error: null,
        sessionId: null,
        stage: "uploading",
      });

      let uploadId: string | null = null;

      try {
        // Step 1: Initialize upload (also cleans up stale uploads on server)
        const initRes = await fetch("/api/upload/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            fileSize: file.size,
            clientName: clientName || null,
            title: sessionDate
              ? `Session ${new Date(sessionDate).toLocaleDateString()}`
              : null,
          }),
        });

        if (!initRes.ok) {
          const data = await initRes.json().catch(() => ({}));
          throw new Error(
            data.details || data.error || "Failed to initialize upload"
          );
        }

        uploadId = (await initRes.json()).uploadId;

        // Step 2: Upload chunks
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

        for (let i = 0; i < totalChunks; i++) {
          if (abortRef.current) throw new Error("Upload cancelled");

          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const chunk = file.slice(start, end);

          await sendChunkWithRetry(uploadId!, chunk, i);

          const progress = Math.round(((i + 1) / totalChunks) * 95); // 0-95% for chunks
          setState((prev) => ({ ...prev, progress }));
        }

        // Step 3: Complete upload (reassemble on server)
        setState((prev) => ({ ...prev, stage: "assembling", progress: 97 }));

        const completeRes = await fetch("/api/upload/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadId }),
        });

        if (!completeRes.ok) {
          const data = await completeRes.json().catch(() => ({}));
          throw new Error(data.error || "Failed to complete upload");
        }

        const { sessionId } = await completeRes.json();

        setState({
          progress: 100,
          uploading: false,
          error: null,
          sessionId,
          stage: "idle",
        });

        return sessionId;
      } catch (err) {
        // Clean up orphaned chunks on server so they don't fill disk
        if (uploadId) {
          fetch("/api/upload/cleanup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uploadId }),
          }).catch(() => {}); // fire and forget
        }

        const error =
          err instanceof Error ? err.message : "Upload failed: unknown error";
        setState((prev) => ({
          ...prev,
          uploading: false,
          error,
          stage: "idle",
        }));
        throw err;
      }
    },
    []
  );

  const cancel = useCallback(() => {
    abortRef.current = true;
  }, []);

  const reset = useCallback(() => {
    abortRef.current = false;
    setState({
      progress: 0,
      uploading: false,
      error: null,
      sessionId: null,
      stage: "idle",
    });
  }, []);

  return { ...state, upload, cancel, reset };
}
