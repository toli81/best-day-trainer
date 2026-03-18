import { nanoid } from "nanoid";
import crypto from "crypto";
import { db } from "@/lib/db";
import { authSessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

const SESSION_COOKIE_NAME = "bdt_session";
const SESSION_LIFETIME_DAYS = 7;
const INACTIVITY_TIMEOUT_MINUTES = 30;

export async function createSession(clientId: string | null, role: "trainer" | "client"): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_DAYS * 24 * 60 * 60 * 1000);

  db.insert(authSessions).values({
    id: nanoid(),
    clientId,
    role,
    token,
    expiresAt: expiresAt.toISOString(),
    lastActiveAt: now.toISOString(),
  }).run();

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_LIFETIME_DAYS * 24 * 60 * 60,
  });

  return token;
}

export async function validateSession(): Promise<{ clientId: string | null; role: "trainer" | "client" } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = db.select().from(authSessions)
    .where(eq(authSessions.token, token))
    .get();

  if (!session) return null;

  const now = new Date();

  // Check absolute expiry
  if (new Date(session.expiresAt) < now) {
    db.delete(authSessions).where(eq(authSessions.id, session.id)).run();
    return null;
  }

  // Check inactivity timeout
  const lastActive = new Date(session.lastActiveAt);
  const inactivityLimit = new Date(lastActive.getTime() + INACTIVITY_TIMEOUT_MINUTES * 60 * 1000);
  if (inactivityLimit < now) {
    db.delete(authSessions).where(eq(authSessions.id, session.id)).run();
    return null;
  }

  // Refresh lastActiveAt
  db.update(authSessions)
    .set({ lastActiveAt: now.toISOString() })
    .where(eq(authSessions.id, session.id))
    .run();

  return { clientId: session.clientId, role: session.role as "trainer" | "client" };
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return;

  db.delete(authSessions).where(eq(authSessions.token, token)).run();

  cookieStore.delete(SESSION_COOKIE_NAME);
}
