"use client";

import { useState, useCallback, useRef } from "react";

const MAX_RETRIES = 5;
const PART_TIMEOUT_MS = 120_000; // 120s timeout per part (10MB over mobile)

interface UploadState {
  progress: number;
  uploading: boolean;
  error: string | null;
  sessionId: string | null;
  stage: "idle" | "uploading" | "finalizing";
}

/** Try a small HEAD/OPTIONS against the R2 presigned URL domain to detect CORS issues early. */
async function checkCorsAccess(presignedUrl: string): Promise<string | null> {
  try {
    // Use a simple GET with range 0-0 to check connectivity + CORS
    // We use the presigned URL itself since CORS is per-origin
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(presignedUrl, {
      method: "PUT",
      body: new Blob([new Uint8Array(0)]),
      signal: controller.signal,
    }).catch((err) => {
      clearTimeout(timeoutId);
      if (err instanceof TypeError && /network|fetch/i.test(err.message)) {
        return null; // CORS or network error
      }
      throw err;
    });

    clearTimeout(timeoutId);

    if (res === null) {
      return (
        "Cannot reach R2 storage. This is usually a CORS configuration issue. " +
        "Please check that the R2 bucket CORS policy allows PUT requests from this domain " +
        "and exposes the ETag header."
      );
    }
    // Any response (even 400/403) means CORS is working - the presigned URL check is separate
    return null;
  } catch {
    // Non-network error, let the actual upload handle it
    return null;
  }
}

function classifyError(err: unknown, partNumber: number, retries: number): string {
  if (err instanceof DOMException && err.name === "AbortError") {
    return `Part ${partNumber} timed out after ${retries} attempts. Your connection may be too slow — try on WiFi.`;
  }

  const msg = err instanceof Error ? err.message : String(err);

  // NetworkError / TypeError from fetch = CORS or connectivity issue
  if (/network|fetch|failed to fetch/i.test(msg)) {
    return (
      `Part ${partNumber} failed after ${retries} attempts: Network error. ` +
      "This usually means a CORS misconfiguration on R2 or a connectivity issue. " +
      "Try switching between WiFi and mobile data, or check R2 CORS settings."
    );
  }

  return `Part ${partNumber} failed after ${retries} attempts: ${msg}`;
}

async function uploadPartWithRetry(
  presignedUrl: string,
  partBlob: Blob,
  partNumber: number,
  retries = MAX_RETRIES
): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PART_TIMEOUT_MS);

    try {
      const res = await fetch(presignedUrl, {
        method: "PUT",
        body: partBlob,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Part ${partNumber} failed: ${res.status} ${res.statusText}`);
      }

      // ETag is required for completing the multipart upload
      const etag = res.headers.get("ETag");
      if (!etag) {
        throw new Error(`Part ${partNumber}: no ETag in response`);
      }
      return etag;
    } catch (err) {
      clearTimeout(timeoutId);

      if (attempt === retries - 1) {
        throw new Error(classifyError(err, partNumber, retries));
      }

      // Exponential backoff: 2s, 4s, 6s, 8s, 10s
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  throw new Error("Unreachable");
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
  // Store last upload args for retry
  const lastArgsRef = useRef<{ file: File; clientId?: string; sessionDate?: string } | null>(null);

  const upload = useCallback(
    async (file: File, clientId?: string, sessionDate?: string) => {
      abortRef.current = false;
      lastArgsRef.current = { file, clientId, sessionDate };
      setState({
        progress: 0,
        uploading: true,
        error: null,
        sessionId: null,
        stage: "uploading",
      });

      let uploadId: string | null = null;

      try {
        // Step 1: Initialize upload — get presigned URLs for all parts
        const initRes = await fetch("/api/upload/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            fileSize: file.size,
            clientId: clientId || null,
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

        const { uploadId: id, partSize, totalParts, presignedUrls } =
          await initRes.json();
        uploadId = id;

        // Step 1.5: Quick CORS pre-check with the first presigned URL
        if (presignedUrls.length > 0) {
          const corsError = await checkCorsAccess(presignedUrls[0].url);
          if (corsError) {
            throw new Error(corsError);
          }
        }

        // Step 2: Upload parts directly to R2
        const completedParts: { ETag: string; PartNumber: number }[] = [];

        for (let i = 0; i < totalParts; i++) {
          if (abortRef.current) throw new Error("Upload cancelled");

          const start = i * partSize;
          const end = Math.min(start + partSize, file.size);
          const partBlob = file.slice(start, end);

          const { partNumber, url } = presignedUrls[i];
          const etag = await uploadPartWithRetry(url, partBlob, partNumber);
          completedParts.push({ ETag: etag, PartNumber: partNumber });

          const progress = Math.round(((i + 1) / totalParts) * 95); // 0-95%
          setState((prev) => ({ ...prev, progress }));
        }

        // Step 3: Complete upload
        setState((prev) => ({ ...prev, stage: "finalizing", progress: 97 }));

        const completeRes = await fetch("/api/upload/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadId, parts: completedParts }),
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
        // Clean up the R2 multipart upload on failure
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

  const retry = useCallback(async () => {
    if (!lastArgsRef.current) return;
    const { file, clientId, sessionDate } = lastArgsRef.current;
    return upload(file, clientId, sessionDate);
  }, [upload]);

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

  return { ...state, upload, retry, cancel, reset };
}
