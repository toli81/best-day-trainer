# CLAUDE.md - Best Day Trainer

## Git Workflow (IMPORTANT - Follow Every Session)

This project deploys automatically to Railway when changes are pushed to GitHub.

**Before making ANY code changes:**
```bash
git pull origin master
```

**After making changes:**
```bash
git add .
git commit -m "Describe what was changed"
git push origin master
```

This ensures changes from any device (desktop, laptop, or mobile) stay in sync and auto-deploy to Railway.

- **Repo**: https://github.com/toli81/best-day-trainer
- **Branch**: master
- **Deploy**: Railway auto-deploys on push to master

## Project Structure Notes

- Git root is `C:\Users\chris\Desktop\APP DEV\best-day-trainer\` — source files are at `src/` (NOT inside the untracked `best-day-trainer/` subdirectory which has stale code)
- Next.js 16.1.6 app with App Router
- Uses `better-sqlite3`, `fluent-ffmpeg`, `ffmpeg-static`

## Upload System (Direct-to-R2 Multipart Upload)

The app records and uploads training session videos (typically **55 minutes long**, 400-800MB).

### Architecture
Videos upload **directly from the phone to Cloudflare R2** using S3-compatible presigned URLs. Zero video data flows through Railway.

- **Client hook**: `src/hooks/use-upload.ts` — uploads 10MB parts directly to R2 presigned URLs
- **R2 client**: `src/lib/r2/client.ts` — S3-compatible wrapper for Cloudflare R2
- **Upload session store**: `src/lib/r2/upload-sessions.ts` — in-memory Map for upload metadata
- **Server endpoints**:
  - `POST /api/upload/init` — creates R2 multipart upload, returns presigned URLs for all parts
  - `POST /api/upload/complete` — completes R2 multipart upload with ETags, creates DB session
  - `POST /api/upload/cleanup` — aborts R2 multipart upload on failure
- **Record page** (`src/app/record/page.tsx`) and **Upload page** (`src/app/upload/page.tsx`) both use the same `useUpload()` hook

### Upload Flow
1. Client → `POST /api/upload/init` → server creates R2 multipart upload, returns presigned PUT URLs
2. Client → `PUT` each 10MB part directly to R2 (presigned URL, bypasses Railway)
3. Client → `POST /api/upload/complete` with ETags → server finalizes R2 multipart upload

### Storage Layout (R2)
- Full videos: `videos/{sessionId}.mp4`
- Clips: `clips/{sessionId}/{exerciseId}.mp4`
- Thumbnails: `clips/{sessionId}/{exerciseId}.jpg`

### Key Settings
- Part size: **10MB** (R2 multipart minimum is 5MB except last part)
- Max retries: **5** with exponential backoff (2s, 4s, 6s, 8s, 10s)
- Part timeout: **120 seconds** via AbortController
- Presigned URLs expire in **1 hour**
- MediaRecorder uses 30-second data intervals (`recorder.start(30000)`)

### Processing Pipeline
After upload, `src/lib/processing/pipeline.ts`:
1. Downloads video from R2 to `/tmp` for FFmpeg processing
2. Runs Gemini analysis on local temp file
3. Extracts clips/thumbnails with FFmpeg → uploads each to R2
4. Cleans up all temp files

### Clips Serving
- `src/app/clips/[...path]/route.ts` tries local file first (backward compat), then redirects to R2 presigned GET URL
- Old sessions with local paths still work

### Environment Variables (Railway)
- `R2_ACCOUNT_ID` — Cloudflare account ID
- `R2_ACCESS_KEY_ID` — R2 API token key ID
- `R2_SECRET_ACCESS_KEY` — R2 API token secret
- `R2_BUCKET_NAME` — defaults to `best-day-trainer`

### R2 Bucket CORS
Must expose `ETag` header and allow PUT from the app domain.

### Known Constraints
- The entire recording blob sits in phone memory until upload completes — potential OOM risk for very long sessions
- Processing temporarily downloads the full video to Railway `/tmp` (~800MB). Fits in Railway's ~1GB ephemeral disk since it's cleaned up immediately after.
- Only one session should process at a time to avoid disk exhaustion
