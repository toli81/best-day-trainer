import { db } from "./index";
import { sessions, exercises } from "./schema";
import { eq, and, gte, sql, desc } from "drizzle-orm";

function getDateCutoff(range: string): string | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function buildSessionConditions(clientId: string | null, range: string) {
  const conditions = [eq(sessions.status, "complete")];
  if (clientId) conditions.push(eq(sessions.clientId, clientId));
  const cutoff = getDateCutoff(range);
  if (cutoff) conditions.push(gte(sessions.recordedAt, cutoff));
  return and(...conditions);
}

export function getStats(clientId: string | null, range: string) {
  const where = buildSessionConditions(clientId, range);

  const sessionCount = db
    .select({ count: sql<number>`count(*)` })
    .from(sessions)
    .where(where)
    .get();

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekConditions = [eq(sessions.status, "complete"), gte(sessions.recordedAt, weekAgo.toISOString())];
  if (clientId) weekConditions.push(eq(sessions.clientId, clientId));
  const weekCount = db
    .select({ count: sql<number>`count(*)` })
    .from(sessions)
    .where(and(...weekConditions))
    .get();

  const cutoff = getDateCutoff(range);
  const consistencyConditions = [eq(sessions.status, "complete")];
  if (clientId) consistencyConditions.push(eq(sessions.clientId, clientId));
  if (cutoff) consistencyConditions.push(gte(sessions.recordedAt, cutoff));

  const weeklyData = db
    .select({ week: sql<string>`strftime('%Y-%W', ${sessions.recordedAt})` })
    .from(sessions)
    .where(and(...consistencyConditions))
    .groupBy(sql`strftime('%Y-%W', ${sessions.recordedAt})`)
    .all();

  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : null;
  const totalWeeks = days ? Math.max(1, Math.ceil(days / 7)) : weeklyData.length || 1;
  const activeWeeks = weeklyData.length;
  const consistencyPercent = Math.round((activeWeeks / totalWeeks) * 100);

  const volumeResult = db
    .select({ total: sql<number>`coalesce(sum(${exercises.repCount}), 0)` })
    .from(exercises)
    .innerJoin(sessions, eq(exercises.sessionId, sessions.id))
    .where(where)
    .get();

  let volumeChange = 0;
  if (days) {
    const priorStart = new Date();
    priorStart.setDate(priorStart.getDate() - days * 2);
    const priorEnd = new Date();
    priorEnd.setDate(priorEnd.getDate() - days);
    const priorConditions = [
      eq(sessions.status, "complete"),
      gte(sessions.recordedAt, priorStart.toISOString()),
      sql`${sessions.recordedAt} < ${priorEnd.toISOString()}`,
    ];
    if (clientId) priorConditions.push(eq(sessions.clientId, clientId));
    const priorVolume = db
      .select({ total: sql<number>`coalesce(sum(${exercises.repCount}), 0)` })
      .from(exercises)
      .innerJoin(sessions, eq(exercises.sessionId, sessions.id))
      .where(and(...priorConditions))
      .get();
    const current = volumeResult?.total || 0;
    const prior = priorVolume?.total || 0;
    volumeChange = prior > 0 ? Math.round(((current - prior) / prior) * 100) : 0;
  }

  const formResult = db
    .select({
      avg: sql<number>`coalesce(avg(coalesce(${exercises.formScoreOverride}, ${exercises.formScore})), 0)`,
    })
    .from(exercises)
    .innerJoin(sessions, eq(exercises.sessionId, sessions.id))
    .where(and(where!, sql`coalesce(${exercises.formScoreOverride}, ${exercises.formScore}) is not null`))
    .get();

  let formTrend: "up" | "down" | "flat" = "flat";
  if (days) {
    const priorStart = new Date();
    priorStart.setDate(priorStart.getDate() - days * 2);
    const priorEnd = new Date();
    priorEnd.setDate(priorEnd.getDate() - days);
    const priorFormConditions = [
      eq(sessions.status, "complete"),
      gte(sessions.recordedAt, priorStart.toISOString()),
      sql`${sessions.recordedAt} < ${priorEnd.toISOString()}`,
      sql`coalesce(${exercises.formScoreOverride}, ${exercises.formScore}) is not null`,
    ];
    if (clientId) priorFormConditions.push(eq(sessions.clientId, clientId));
    const priorForm = db
      .select({ avg: sql<number>`coalesce(avg(coalesce(${exercises.formScoreOverride}, ${exercises.formScore})), 0)` })
      .from(exercises)
      .innerJoin(sessions, eq(exercises.sessionId, sessions.id))
      .where(and(...priorFormConditions))
      .get();
    const diff = (formResult?.avg || 0) - (priorForm?.avg || 0);
    formTrend = diff > 0.5 ? "up" : diff < -0.5 ? "down" : "flat";
  }

  return {
    totalSessions: sessionCount?.count || 0,
    weekDelta: weekCount?.count || 0,
    consistencyPercent,
    isShortRange: range === "7d",
    weeklyFrequency: activeWeeks > 0 ? `${Math.round((sessionCount?.count || 0) / activeWeeks)}x/week` : "0x/week",
    monthlyVolume: volumeResult?.total || 0,
    volumeChange,
    avgFormScore: Math.round((formResult?.avg || 0) * 10) / 10,
    formTrend,
  };
}

export function getVolumeData(clientId: string | null, range: string, muscleGroup?: string, exercise?: string) {
  const where = buildSessionConditions(clientId, range);
  const conditions = [where!];
  if (muscleGroup) conditions.push(sql`${exercises.muscleGroups} like ${"%" + muscleGroup + "%"}`);
  if (exercise) conditions.push(eq(exercises.name, exercise));

  return db
    .select({
      date: sql<string>`date(${sessions.recordedAt})`.as("date"),
      reps: sql<number>`coalesce(sum(${exercises.repCount}), 0)`.as("reps"),
      sets: sql<number>`coalesce(sum(${exercises.setCount}), 0)`.as("sets"),
    })
    .from(exercises)
    .innerJoin(sessions, eq(exercises.sessionId, sessions.id))
    .where(and(...conditions))
    .groupBy(sql`date(${sessions.recordedAt})`)
    .orderBy(sql`date(${sessions.recordedAt})`)
    .all();
}

export function getFormData(clientId: string | null, range: string, exercise?: string) {
  const where = buildSessionConditions(clientId, range);
  const conditions = [where!, sql`coalesce(${exercises.formScoreOverride}, ${exercises.formScore}) is not null`];
  if (exercise) conditions.push(eq(exercises.name, exercise));

  return db
    .select({
      date: sql<string>`date(${sessions.recordedAt})`.as("date"),
      exerciseName: exercises.name,
      score: sql<number>`coalesce(${exercises.formScoreOverride}, ${exercises.formScore})`.as("score"),
      isOverride: sql<boolean>`${exercises.formScoreOverride} is not null`.as("isOverride"),
    })
    .from(exercises)
    .innerJoin(sessions, eq(exercises.sessionId, sessions.id))
    .where(and(...conditions))
    .orderBy(sql`date(${sessions.recordedAt})`)
    .all();
}

export function getBalanceData(clientId: string | null, range: string) {
  const where = buildSessionConditions(clientId, range);

  const rows = db
    .select({
      muscleGroups: exercises.muscleGroups,
      reps: exercises.repCount,
    })
    .from(exercises)
    .innerJoin(sessions, eq(exercises.sessionId, sessions.id))
    .where(and(where!, sql`${exercises.muscleGroups} is not null`))
    .all();

  const totals: Record<string, number> = {};
  let grandTotal = 0;
  for (const row of rows) {
    const groups: string[] = JSON.parse(row.muscleGroups || "[]");
    const reps = row.reps || 1;
    for (const g of groups) {
      totals[g] = (totals[g] || 0) + reps;
      grandTotal += reps;
    }
  }

  return Object.entries(totals)
    .map(([muscleGroup, totalReps]) => ({
      muscleGroup,
      totalReps,
      percentage: grandTotal > 0 ? Math.round((totalReps / grandTotal) * 100) : 0,
    }))
    .sort((a, b) => b.totalReps - a.totalReps);
}

export function getSessionsData(clientId: string | null, range: string) {
  const where = buildSessionConditions(clientId, range);

  const heatmap = db
    .select({
      date: sql<string>`date(${sessions.recordedAt})`.as("date"),
      count: sql<number>`count(*)`.as("count"),
    })
    .from(sessions)
    .where(where)
    .groupBy(sql`date(${sessions.recordedAt})`)
    .orderBy(sql`date(${sessions.recordedAt})`)
    .all();

  const sessionList = db
    .select({
      id: sessions.id,
      title: sessions.title,
      clientId: sessions.clientId,
      clientName: sessions.clientName,
      date: sessions.recordedAt,
      duration: sessions.durationSeconds,
      exerciseCount: sql<number>`count(${exercises.id})`.as("exerciseCount"),
      status: sessions.status,
    })
    .from(sessions)
    .leftJoin(exercises, eq(exercises.sessionId, sessions.id))
    .where(where)
    .groupBy(sessions.id)
    .orderBy(desc(sessions.recordedAt))
    .all();

  return { heatmap, sessions: sessionList };
}

export function getNotesData(clientId: string | null, range: string) {
  const where = buildSessionConditions(clientId, range);

  return db
    .select({
      sessionId: sessions.id,
      title: sessions.title,
      clientId: sessions.clientId,
      clientName: sessions.clientName,
      date: sessions.recordedAt,
      sessionNotes: sessions.sessionNotes,
    })
    .from(sessions)
    .where(and(where!, sql`${sessions.sessionNotes} is not null`))
    .orderBy(desc(sessions.recordedAt))
    .all();
}
