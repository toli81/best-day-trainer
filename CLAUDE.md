# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Next.js dev server (http://localhost:3000)
npm run build        # Production build (use to verify before pushing)
npm run lint         # ESLint
npx tsc --noEmit     # Type check without building
```

No test framework is configured. Verify changes with `npx tsc --noEmit` and `npm run build`.

## Git & Deployment

- **Repo**: https://github.com/toli81/best-day-trainer — branch: `master`
- **Deploy**: Railway auto-deploys on push to master
- Always `git pull origin master` before making changes (edits come from multiple devices)
- Railway build takes ~3-5 minutes

## Architecture Overview

Next.js 16 App Router + TypeScript + SQLite (Drizzle ORM) + Cloudflare R2 + Gemini + Claude.

The app lets a personal trainer record/upload training session videos on their phone, then AI analyzes them to identify exercises, extract clips, and generate coaching notes.

### Path alias: `@/*` → `./src/*`

### Key domains in `src/lib/`:

| Directory | Purpose |
|-----------|---------|
| `db/` | Drizzle schema, queries, SQLite connection (better-sqlite3) |
| `r2/` | Cloudflare R2 client (S3-compatible), upload session tracking |
| `gemini/` | Gemini 3.1 Pro video analysis (overview + clip detail) |
| `claude/` | Claude session notes + exercise tagging |
| `video/` | FFmpeg clip extraction and thumbnail generation |
| `processing/` | Pipeline orchestration with checkpoint stages |
| `auth/` | Magic link session management (currently bypassed) |
| `email/` | Resend email client |

## Upload System

Videos upload **directly from the phone to Cloudflare R2** via presigned URLs. Zero video data flows through Railway.

1. Client → `POST /api/upload/init` → server creates R2 multipart upload, returns presigned PUT URLs
2. Client uploads 10MB parts directly to R2 (5 retries, 120s timeout per part)
3. Client → `POST /api/upload/complete` with ETags → server finalizes upload, creates DB session

Both `/record` and `/upload` pages use the `useUpload()` hook (`src/hooks/use-upload.ts`).

**R2 storage layout:**
```
videos/{sessionId}.{ext}              # Full session videos
clips/{sessionId}/{exerciseId}.mp4    # Exercise clips
clips/{sessionId}/{exerciseId}.jpg    # Thumbnails
```

## AI Analysis Pipeline (Clip-First)

Orchestrated in `src/lib/processing/pipeline.ts`. Each stage is checkpointed to the `pipeline_stage` DB column — on retry, the pipeline resumes from the last completed stage.

```
Download from R2 → /tmp
  ↓
Gemini overview pass (low resolution, full video) → exercise timestamps
  ↓
FFmpeg clip extraction + thumbnail generation → upload to R2
  ↓
Gemini detail pass (medium resolution, per-clip) → form/technique analysis
  ↓
Claude session notes → professional documentation
  ↓
Claude tagging → standardized names + searchability tags
```

**Concurrency**: Only one session processes at a time (Railway ~1GB ephemeral disk). The pipeline uses a global guard and returns 409 if another session is already processing.

**Gemini response parsing**: Gemini 3.1 Pro returns inconsistent JSON (arrays vs objects, snake_case vs camelCase, varied timestamp formats). `analyze-session.ts` normalizes all response shapes defensively.

## Database

SQLite via `better-sqlite3` with Drizzle ORM. Schema at `src/lib/db/schema.ts`.

**Migrations**: Auto-applied on startup in `src/lib/db/index.ts` using safe `ALTER TABLE ADD COLUMN` wrapped in try-catch. No separate migration files needed.

**Stuck session recovery**: On server startup, sessions stuck in "analyzing"/"segmenting"/"generating_notes" are auto-reset to "error" so users can retry.

**Key tables**: `sessions` (with pipeline checkpoints), `exercises` (with `detailStatus` for per-exercise processing), `clients`, `auth_tokens`, `auth_sessions`, `audit_log`.

**Client name resolution**: New sessions use `clientId` (FK to clients table). Old sessions have `clientName` (free text). Use `getClientName()` from `queries.ts` which checks `clientId` first, falls back to `clientName`.

## Auth Status

Auth is **currently bypassed**. `src/middleware.ts` returns `NextResponse.next()` for all requests. The original magic-link auth logic is commented out and preserved for re-enabling later. All auth infrastructure (tables, routes, email) is built but inactive.

## Environment Variables

**Required:**
- `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`

**Optional:**
- `R2_BUCKET_NAME` (defaults to `best-day-trainer`)
- `TRAINER_EMAIL` (for auth, when re-enabled)
- `RESEND_API_KEY` (for magic link emails)

## Constraints

- Recording blob stays in phone memory until upload completes — OOM risk for very long sessions
- Processing downloads full video to `/tmp` (~800MB) — fits Railway's ~1GB ephemeral disk since it's cleaned up after
- Only one session processes at a time to avoid disk exhaustion
- R2 bucket CORS must expose `ETag` header and allow PUT from the app domain
