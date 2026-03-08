"use client";

import { useState, useCallback } from "react";

interface UploadState {
  progress: number;
  uploading: boolean;
  error: string | null;
  sessionId: string | null;
}

export function useUpload() {
  const [state, setState] = useState<UploadState>({
    progress: 0,
    uploading: false,
    error: null,
    sessionId: null,
  });

  const upload = useCallback(
    async (file: File, clientName?: string, sessionDate?: string) => {
      setState({ progress: 0, uploading: true, error: null, sessionId: null });

      return new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const formData = new FormData();
        formData.append("video", file);
        if (clientName) formData.append("clientName", clientName);
        if (sessionDate) formData.append("sessionDate", sessionDate);

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100);
            setState((prev) => ({ ...prev, progress }));
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const data = JSON.parse(xhr.responseText);
            setState({
              progress: 100,
              uploading: false,
              error: null,
              sessionId: data.sessionId,
            });
            resolve(data.sessionId);
          } else {
            const error = `Upload failed: ${xhr.statusText}`;
            setState((prev) => ({ ...prev, uploading: false, error }));
            reject(new Error(error));
          }
        });

        xhr.addEventListener("error", () => {
          const error = "Upload failed: network error";
          setState((prev) => ({ ...prev, uploading: false, error }));
          reject(new Error(error));
        });

        xhr.open("POST", "/api/upload");
        xhr.send(formData);
      });
    },
    []
  );

  const reset = useCallback(() => {
    setState({ progress: 0, uploading: false, error: null, sessionId: null });
  }, []);

  return { ...state, upload, reset };
}
