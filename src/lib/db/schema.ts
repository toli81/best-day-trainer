import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  title: text("title"),
  clientName: text("client_name"),
  recordedAt: text("recorded_at").notNull(),
  durationSeconds: integer("duration_seconds"),
  videoFilePath: text("video_file_path").notNull(),
  videoFileName: text("video_file_name").notNull(),
  videoSizeBytes: integer("video_size_bytes"),

  status: text("status", {
    enum: [
      "uploading",
      "uploaded",
      "analyzing",
      "segmenting",
      "generating_notes",
      "complete",
      "error",
    ],
  })
    .notNull()
    .default("uploading"),
  processingError: text("processing_error"),
  processingStartedAt: text("processing_started_at"),
  processingCompletedAt: text("processing_completed_at"),

  geminiFileUri: text("gemini_file_uri"),
  geminiCacheId: text("gemini_cache_id"),
  geminiFileName: text("gemini_file_name"),
  overviewAnalysis: text("overview_analysis"),
  detailsAnalysis: text("details_analysis"),
  sessionNotes: text("session_notes"),
  pipelineStage: text("pipeline_stage"),
  tokenCount: integer("token_count"),

  clientId: text("client_id"),

  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const exercises = sqliteTable("exercises", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),

  startTimestamp: text("start_timestamp").notNull(),
  endTimestamp: text("end_timestamp").notNull(),
  startSeconds: real("start_seconds").notNull(),
  endSeconds: real("end_seconds").notNull(),
  orderIndex: integer("order_index").notNull(),

  name: text("name").notNull(),
  description: text("description").notNull(),
  muscleGroups: text("muscle_groups"),
  equipment: text("equipment"),
  difficulty: text("difficulty", {
    enum: ["beginner", "intermediate", "advanced"],
  }),
  category: text("category", {
    enum: [
      "strength",
      "cardio",
      "flexibility",
      "warmup",
      "cooldown",
      "plyometric",
    ],
  }),
  repCount: integer("rep_count"),
  setCount: integer("set_count"),
  formNotes: text("form_notes"),
  coachingCues: text("coaching_cues"),

  clipFilePath: text("clip_file_path"),
  thumbnailFilePath: text("thumbnail_file_path"),
  clipDurationSeconds: real("clip_duration_seconds"),

  isLibraryEntry: integer("is_library_entry", { mode: "boolean" })
    .notNull()
    .default(true),
  tags: text("tags"),
  detailStatus: text("detail_status", {
    enum: ["pending", "complete", "failed"],
  }).default("complete"),

  formScore: integer("form_score"),
  formScoreOverride: integer("form_score_override"),

  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const clients = sqliteTable("clients", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  phone: text("phone"),
  status: text("status", { enum: ["active", "inactive"] }).notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const authTokens = sqliteTable("auth_tokens", {
  id: text("id").primaryKey(),
  clientId: text("client_id"),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(),
  clientId: text("client_id"),
  role: text("role", { enum: ["trainer", "client"] }).notNull(),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  lastActiveAt: text("last_active_at").notNull().default(sql`(datetime('now'))`),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  clientId: text("client_id"),
  action: text("action").notNull(),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  ipAddress: text("ip_address"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const sessionsRelations = relations(sessions, ({ many }) => ({
  exercises: many(exercises),
}));

export const exercisesRelations = relations(exercises, ({ one }) => ({
  session: one(sessions, {
    fields: [exercises.sessionId],
    references: [sessions.id],
  }),
}));

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;
export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type AuthToken = typeof authTokens.$inferSelect;
export type NewAuthToken = typeof authTokens.$inferInsert;
export type AuthSession = typeof authSessions.$inferSelect;
export type NewAuthSession = typeof authSessions.$inferInsert;
export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
