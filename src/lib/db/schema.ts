import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

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

  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
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
