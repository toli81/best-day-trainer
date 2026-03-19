"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export interface MediaDevice {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

interface MediaRecorderState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  error: string | null;
  stream: MediaStream | null;
  blob: Blob | null;
}

export function useMediaRecorder() {
  const [state, setState] = useState<MediaRecorderState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    error: null,
    stream: null,
    blob: null,
  });

  const [devices, setDevices] = useState<{
    cameras: MediaDevice[];
    microphones: MediaDevice[];
  }>({ cameras: [], microphones: [] });

  const [selectedCamera, setSelectedCamera] = useState<string>("");
  const [selectedMic, setSelectedMic] = useState<string>("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  // Enumerate devices
  const refreshDevices = useCallback(async () => {
    try {
      // Need permission first to get labels — stop the throwaway stream immediately
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      tempStream.getTracks().forEach((t) => t.stop());
      const allDevices = await navigator.mediaDevices.enumerateDevices();

      const cameras = allDevices
        .filter((d) => d.kind === "videoinput")
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${d.deviceId.slice(0, 4)}`,
          kind: d.kind,
        }));

      const microphones = allDevices
        .filter((d) => d.kind === "audioinput")
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Mic ${d.deviceId.slice(0, 4)}`,
          kind: d.kind,
        }));

      setDevices({ cameras, microphones });

      // Auto-select external mic if available (usually last in list, not "default")
      const externalMic = microphones.find(
        (m) =>
          !m.label.toLowerCase().includes("built-in") &&
          !m.label.toLowerCase().includes("default") &&
          m.deviceId !== "default"
      );
      if (externalMic && !selectedMic) {
        setSelectedMic(externalMic.deviceId);
      } else if (microphones.length > 0 && !selectedMic) {
        setSelectedMic(microphones[0].deviceId);
      }

      // Auto-select widest angle rear camera
      if (cameras.length > 0 && !selectedCamera) {
        const rearCameras = cameras.filter(
          (c) =>
            !c.label.toLowerCase().includes("front") &&
            !c.label.toLowerCase().includes("user")
        );
        // Prefer camera with "wide" or "ultra" in the label
        const wideCam =
          rearCameras.find((c) =>
            /wide|ultra/i.test(c.label)
          ) ||
          // Fallback: last rear camera (often ultrawide on modern phones)
          rearCameras[rearCameras.length - 1] ||
          cameras[0];
        setSelectedCamera(wideCam.deviceId);
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: `Device access denied: ${err}`,
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices.addEventListener("devicechange", refreshDevices);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", refreshDevices);
    };
  }, [refreshDevices]);

  // Get preferred MIME type
  const getMimeType = useCallback(() => {
    const types = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    return types.find((t) => MediaRecorder.isTypeSupported(t)) || "video/webm";
  }, []);

  // Start preview stream (stops old tracks synchronously before requesting new one)
  const startPreview = useCallback(async () => {
    try {
      // Stop existing stream tracks SYNCHRONOUSLY via ref before getUserMedia
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      const constraints: MediaStreamConstraints = {
        video: selectedCamera
          ? { deviceId: { exact: selectedCamera } }
          : { facingMode: "environment" },
        audio: selectedMic
          ? { deviceId: { exact: selectedMic } }
          : true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      setState((prev) => ({ ...prev, stream, error: null }));
      return stream;
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: `Failed to start camera: ${err}`,
      }));
      return null;
    }
  }, [selectedCamera, selectedMic]);

  // Auto-restart preview when camera or mic selection changes
  const initializedRef = useRef(false);
  useEffect(() => {
    // Skip the first render — startPreview is called explicitly on mount
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    if (selectedCamera || selectedMic) {
      startPreview();
    }
  }, [selectedCamera, selectedMic, startPreview]);

  // Start recording
  const startRecording = useCallback(async () => {
    let stream = state.stream;
    if (!stream) {
      stream = await startPreview();
      if (!stream) return;
    }

    const mimeType = getMimeType();
    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setState((prev) => ({ ...prev, blob, isRecording: false, isPaused: false }));
      if (timerRef.current) clearInterval(timerRef.current);
    };

    recorder.onerror = () => {
      setState((prev) => ({
        ...prev,
        error: "Recording error occurred",
        isRecording: false,
      }));
      if (timerRef.current) clearInterval(timerRef.current);
    };

    mediaRecorderRef.current = recorder;
    recorder.start(30000); // 30-second chunks for safety

    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setState((prev) => ({
        ...prev,
        duration: Math.floor((Date.now() - startTimeRef.current) / 1000),
      }));
    }, 1000);

    setState((prev) => ({
      ...prev,
      isRecording: true,
      isPaused: false,
      duration: 0,
      blob: null,
      error: null,
    }));
  }, [state.stream, startPreview, getMimeType]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
  }, []);

  // Cleanup
  const cleanup = useCallback(() => {
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setState({
      isRecording: false,
      isPaused: false,
      duration: 0,
      error: null,
      stream: null,
      blob: null,
    });
  }, []);

  return {
    ...state,
    devices,
    selectedCamera,
    selectedMic,
    setSelectedCamera,
    setSelectedMic,
    startPreview,
    startRecording,
    stopRecording,
    cleanup,
    refreshDevices,
  };
}
