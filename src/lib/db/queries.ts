import { db } from "./index";
import { sessions, exercises, type NewSession, type NewExercise } from "./schema";
import { eq, desc, like, and, sql } from "drizzle-orm";

export async function createSession(data: NewSession) {
  return db.insert(sessions).values(data).returning().get();
}

export async function getSession(id: string) {
  return db.query.sessions.findFirst({
    where: eq(sessions.id, id),
    with: { exercises: { orderBy: [exercises.orderIndex] } },
  });
}

export async function listSessions(page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const items = db
    .select()
    .from(sessions)
    .orderBy(desc(sessions.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  const countResult = db
    .select({ count: sql<number>`count(*)` })
    .from(sessions)
    .get();

  return { sessions: items, total: countResult?.count ?? 0 };
}

export async function updateSessionStatus(
  id: string,
  status: string,
  extra?: Partial<{
    processingError: string;
    processingStartedAt: string;
    processingCompletedAt: string;
    geminiFileUri: string;
    geminiCacheId: string | null;
    geminiFileName: string;
    overviewAnalysis: string;
    detailsAnalysis: string;
    sessionNotes: string;
    pipelineStage: string;
    tokenCount: number;
    durationSeconds: number;
  }>
) {
  return db
    .update(sessions)
    .set({
      status: status as NewSession["status"],
      updatedAt: new Date().toISOString(),
      ...extra,
    })
    .where(eq(sessions.id, id))
    .returning()
    .get();
}

export async function createExercise(data: NewExercise) {
  return db.insert(exercises).values(data).returning().get();
}

export async function createExercises(data: NewExercise[]) {
  if (data.length === 0) return [];
  return db.insert(exercises).values(data).returning().all();
}

export async function getExercise(id: string) {
  return db.query.exercises.findFirst({
    where: eq(exercises.id, id),
    with: { session: true },
  });
}

export async function listExercises(filters?: {
  search?: string;
  category?: string;
  muscleGroup?: string;
  page?: number;
  limit?: number;
}) {
  const page = filters?.page ?? 1;
  const limit = filters?.limit ?? 50;
  const offset = (page - 1) * limit;

  const conditions = [eq(exercises.isLibraryEntry, true)];

  if (filters?.search) {
    conditions.push(like(exercises.name, `%${filters.search}%`));
  }
  if (filters?.category) {
    conditions.push(sql`${exercises.category} = ${filters.category}`);
  }
  if (filters?.muscleGroup) {
    conditions.push(
      like(exercises.muscleGroups, `%${filters.muscleGroup}%`)
    );
  }

  const items = db
    .select()
    .from(exercises)
    .where(and(...conditions))
    .orderBy(desc(exercises.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  const countResult = db
    .select({ count: sql<number>`count(*)` })
    .from(exercises)
    .where(and(...conditions))
    .get();

  return { exercises: items, total: countResult?.count ?? 0 };
}

export async function updateExercise(
  id: string,
  data: Partial<NewExercise>
) {
  return db
    .update(exercises)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(exercises.id, id))
    .returning()
    .get();
}

type Exercise = typeof exercises.$inferSelect;
