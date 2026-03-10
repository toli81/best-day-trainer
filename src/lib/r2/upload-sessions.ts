import { abortMultipartUpload } from "./client";

export interface UploadSession {
  r2Key: string;
  r2UploadId: string;
  fileName: string;
  fileSize: number;
  clientName: string | null;
  title: string | null;
  createdAt: number;
}

const sessions = new Map<string, UploadSession>();

/** Store an upload session. */
export function setUploadSession(id: string, session: UploadSession) {
  sessions.set(id, session);
}

/** Retrieve an upload session. */
export function getUploadSession(id: string): UploadSession | undefined {
  return sessions.get(id);
}

/** Remove an upload session. */
export function deleteUploadSession(id: string) {
  sessions.delete(id);
}

// Clean up abandoned sessions older than 2 hours every 10 minutes
setInterval(() => {
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, session] of sessions) {
    if (session.createdAt < twoHoursAgo) {
      console.log(`Cleaning up abandoned upload session: ${id}`);
      abortMultipartUpload(session.r2Key, session.r2UploadId).catch(() => {});
      sessions.delete(id);
    }
  }
}, 10 * 60 * 1000).unref();
