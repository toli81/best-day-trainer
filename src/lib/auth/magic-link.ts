import { nanoid } from "nanoid";
import crypto from "crypto";
import { db } from "@/lib/db";
import { authTokens, clients } from "@/lib/db/schema";
import { eq, and, gt, isNull } from "drizzle-orm";

const TOKEN_EXPIRY_MINUTES = 15;
const RATE_LIMIT_WINDOW_MINUTES = 15;
const RATE_LIMIT_MAX = 3;

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function createMagicLinkToken(email: string): Promise<{ token: string; isTrainer: boolean }> {
  const trainerEmail = process.env.TRAINER_EMAIL;
  const isTrainer = email.toLowerCase() === trainerEmail?.toLowerCase();

  // Rate limit check (login endpoint only)
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();
  let recentTokens;

  if (isTrainer) {
    recentTokens = db.select().from(authTokens)
      .where(and(isNull(authTokens.clientId), gt(authTokens.createdAt, windowStart)))
      .all();
  } else {
    const client = db.select().from(clients)
      .where(eq(clients.email, email.toLowerCase()))
      .get();

    if (!client) {
      throw new Error("No account found for this email");
    }

    recentTokens = db.select().from(authTokens)
      .where(and(eq(authTokens.clientId, client.id), gt(authTokens.createdAt, windowStart)))
      .all();
  }

  if (recentTokens.length >= RATE_LIMIT_MAX) {
    throw new Error("Too many login attempts. Please try again in 15 minutes.");
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000).toISOString();

  let clientId: string | null = null;
  if (!isTrainer) {
    const client = db.select().from(clients)
      .where(eq(clients.email, email.toLowerCase()))
      .get();
    clientId = client!.id;
  }

  db.insert(authTokens).values({
    id: nanoid(),
    clientId,
    token,
    expiresAt,
  }).run();

  return { token, isTrainer };
}

export async function createReminderToken(clientId: string): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000).toISOString();

  db.insert(authTokens).values({
    id: nanoid(),
    clientId,
    token,
    expiresAt,
  }).run();

  return token;
}

export async function verifyToken(token: string): Promise<{ clientId: string | null; role: "trainer" | "client" } | null> {
  const record = db.select().from(authTokens)
    .where(eq(authTokens.token, token))
    .get();

  if (!record) return null;
  if (record.usedAt) return null;
  if (new Date(record.expiresAt) < new Date()) return null;

  // Mark as used
  db.update(authTokens)
    .set({ usedAt: new Date().toISOString() })
    .where(eq(authTokens.id, record.id))
    .run();

  const role = record.clientId === null ? "trainer" : "client";
  return { clientId: record.clientId, role };
}
