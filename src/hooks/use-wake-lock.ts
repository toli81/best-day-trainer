"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export function useWakeLock() {
  const [isLocked, setIsLocked] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    setIsSupported("wakeLock" in navigator);
  }, []);

  const request = useCallback(async () => {
    if (!("wakeLock" in navigator)) return;
    try {
      sentinelRef.current = await navigator.wakeLock.request("screen");
      setIsLocked(true);
      sentinelRef.current.addEventListener("release", () => {
        setIsLocked(false);
      });
    } catch (err) {
      console.warn("Wake Lock request failed:", err);
    }
  }, []);

  const release = useCallback(async () => {
    if (sentinelRef.current) {
      await sentinelRef.current.release();
      sentinelRef.current = null;
      setIsLocked(false);
    }
  }, []);

  // Re-acquire on visibility change
  useEffect(() => {
    const handleVisibility = () => {
      if (
        document.visibilityState === "visible" &&
        sentinelRef.current === null &&
        isLocked
      ) {
        request();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [isLocked, request]);

  return { isLocked, isSupported, request, release };
}
