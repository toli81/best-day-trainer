/** Convert various timestamp formats to total seconds.
 * Handles: "MM:SS", "H:MM:SS", "HH:MM:SS", "2m30s", "150" (raw seconds), numbers
 */
export function parseTimestamp(ts: string | number): number {
  // Handle numeric input (seconds as number)
  if (typeof ts === "number") return ts;

  // Trim whitespace
  ts = ts.trim();

  // Handle raw numeric string (seconds)
  if (/^\d+(\.\d+)?$/.test(ts)) {
    return parseFloat(ts);
  }

  // Handle "XmYs" or "Xm Ys" format
  const minsSecMatch = ts.match(/^(\d+)\s*m\s*(\d+)\s*s?$/i);
  if (minsSecMatch) {
    return parseInt(minsSecMatch[1]) * 60 + parseInt(minsSecMatch[2]);
  }

  // Handle "Xm" format (minutes only)
  const minsOnly = ts.match(/^(\d+)\s*m$/i);
  if (minsOnly) {
    return parseInt(minsOnly[1]) * 60;
  }

  // Handle "Xs" format (seconds only)
  const secsOnly = ts.match(/^(\d+)\s*s$/i);
  if (secsOnly) {
    return parseInt(secsOnly[1]);
  }

  // Handle colon-separated: "MM:SS" or "H:MM:SS" or "HH:MM:SS"
  const parts = ts.split(":").map(Number);
  if (parts.length === 2 && parts.every((p) => !isNaN(p))) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3 && parts.every((p) => !isNaN(p))) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  console.warn(`[Timestamp] Could not parse: "${ts}", defaulting to 0`);
  return 0;
}

/** Convert seconds to "MM:SS" */
export function formatTimestamp(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Convert seconds to human-readable duration like "1m 30s" */
export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (minutes === 0) return `${seconds}s`;
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

/** Format file size in human-readable format */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
