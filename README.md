# Best Day - Personal Training Session Analyzer

A full-stack web application that helps personal trainers record, analyze, and document training sessions using AI. Upload or record a session video, and the app automatically identifies each exercise, extracts clips, analyzes form, generates coaching notes, and builds a searchable exercise library.

## What It Does

1. **Record or upload** a training session video
2. **AI analyzes** the video to identify every exercise performed
3. **Extracts clips** and thumbnails for each individual exercise
4. **Generates professional session notes** with form observations and recommendations
5. **Builds a searchable library** of all exercises across all sessions

## Features

### Video Capture
- Record directly from your device camera with live preview
- Camera and microphone selection (auto-detects external mics)
- Screen wake-lock to prevent the phone from sleeping during recording
- Drag-and-drop or file picker upload (MP4, WebM, MOV)
- **Chunked upload system** — large videos (1hr+) are split into 5MB chunks to prevent timeout failures
- Automatic retry (3 attempts per chunk with exponential backoff) for unreliable mobile connections
- Cancel upload support mid-transfer
- Real-time upload progress tracking with assembling stage indicator

### AI-Powered Video Analysis
- **Google Gemini** performs two-pass video analysis:
  - **Overview pass** identifies all exercises and rest periods with timestamps
  - **Detail pass** analyzes each exercise for name, form quality, muscle groups, reps, sets, equipment, difficulty, and coaching cues
- **Claude** generates professional session notes including:
  - Session overview
  - Per-exercise observations
  - Form and technique assessment
  - Recommendations for the next session
- **Claude** standardizes exercise names and auto-generates searchability tags (movement patterns, body regions, modalities, planes of motion)

### Exercise Library
- Searchable across all sessions with real-time filtering
- Category filters: strength, cardio, flexibility, warmup, cooldown, plyometric
- Each exercise includes: video clip, thumbnail, description, muscle groups, equipment, difficulty, rep/set counts, form notes, and coaching cues
- AI-generated tags for discoverability

### Session Management
- Dashboard with all sessions and color-coded status badges
- Real-time processing status with progress tracking (analyzing, segmenting, generating notes, complete)
- Detailed session view with notes and exercise grid
- Processing time estimates and retry on error

### UI/UX
- Dark and light theme with system preference detection
- Responsive design (mobile, tablet, desktop)
- Exercise detail modals with embedded video playback
- Sticky navigation header

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| UI | React 19, Tailwind CSS 4, shadcn/ui |
| Database | SQLite (better-sqlite3) with Drizzle ORM |
| Video Processing | FFmpeg (fluent-ffmpeg + ffmpeg-static) |
| AI - Video Analysis | Google Gemini API (@google/genai) |
| AI - Notes & Tagging | Anthropic Claude API (@anthropic-ai/sdk) |
| Deployment | Docker on Railway with persistent volume |

## Project Structure

```
best-day-trainer/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Dashboard
│   │   ├── record/page.tsx             # Live recording
│   │   ├── upload/page.tsx             # File upload
│   │   ├── library/page.tsx            # Exercise library
│   │   ├── sessions/
│   │   │   ├── page.tsx                # All sessions
│   │   │   └── [sessionId]/page.tsx    # Session detail
│   │   └── api/
│   │       ├── upload/route.ts         # Simple video upload endpoint
│   │       ├── upload/init/route.ts   # Chunked upload initialization
│   │       ├── upload/chunk/route.ts  # Individual chunk receiver
│   │       ├── upload/complete/route.ts # Chunk reassembly + finalization
│   │       ├── exercises/              # Exercise CRUD
│   │       └── sessions/               # Session CRUD + processing
│   ├── components/
│   │   ├── exercises/                  # Exercise cards, detail modal, grid
│   │   ├── sessions/                   # Processing status tracker
│   │   ├── layout/                     # Header navigation
│   │   └── ui/                         # shadcn/ui components
│   ├── hooks/
│   │   ├── use-media-recorder.ts       # Camera/mic recording
│   │   ├── use-upload.ts               # Chunked upload with progress & retry
│   │   └── use-wake-lock.ts            # Screen wake lock
│   └── lib/
│       ├── db/                         # Schema, queries, connection
│       ├── gemini/                     # Video analysis pipeline
│       ├── claude/                     # Session notes + library tagging
│       ├── video/                      # FFmpeg clip extraction
│       └── processing/                 # Orchestration pipeline
├── data/                               # SQLite database (gitignored)
├── uploads/                            # Raw video files (gitignored)
├── public/clips/                       # Extracted exercise clips (gitignored)
├── Dockerfile                          # Production Docker build
├── railway.toml                        # Railway deployment config
└── drizzle.config.ts                   # Database config
```

## Database Schema

**sessions** - Training session records
- Video file reference, duration, status
- AI-generated overview analysis and session notes
- Processing state tracking (uploading → analyzing → segmenting → generating_notes → complete)

**exercises** - Individual exercises extracted from sessions
- Timestamps (start/end), clip and thumbnail file paths
- Name, description, category, difficulty
- Muscle groups, equipment, rep/set counts
- Form notes, coaching cues, searchability tags
- Foreign key to sessions (cascade delete)

## Getting Started

### Prerequisites
- Node.js 20+
- FFmpeg installed locally (or use Docker)
- Google Gemini API key
- Anthropic Claude API key

### Local Development

```bash
# Clone the repo
git clone https://github.com/toli81/best-day-trainer.git
cd best-day-trainer

# Install dependencies
npm install

# Create environment file with your API keys
# Add GEMINI_API_KEY and ANTHROPIC_API_KEY
cp .env.local.example .env.local

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key for video analysis |
| `ANTHROPIC_API_KEY` | Yes | Anthropic Claude API key for notes and tagging |
| `NEXT_PUBLIC_APP_NAME` | No | App display name |

### Production Deployment (Railway)

The app is configured for deployment on Railway with Docker:

```bash
# Push to GitHub (Railway auto-deploys on push)
git push origin master
```

**Railway setup:**
1. Create a new project from your GitHub repo
2. Add environment variables (GEMINI_API_KEY, ANTHROPIC_API_KEY)
3. Add a persistent volume mounted at `/app/persist`
4. Generate a public domain under Settings > Networking

## Processing Pipeline

When a video is uploaded or recorded, the processing pipeline runs:

```
Upload Video
    ↓
Gemini: Identify all exercises with timestamps (Overview Pass)
    ↓
Gemini: Analyze each exercise in detail (Detail Pass)
    ↓
FFmpeg: Extract video clips for each exercise
    ↓
FFmpeg: Generate thumbnails at midpoints
    ↓
Claude: Generate professional session notes
    ↓
Claude: Standardize exercise names and generate tags
    ↓
Complete — session ready for review
```

═══════════════════════════════════════════════════════════════════════
  BEST DAY TRAINER — AI ANALYSIS PIPELINE UPDATE
  Date: March 15, 2026
  Commit: 37cac49
═══════════════════════════════════════════════════════════════════════

SUMMARY
-------
Complete overhaul of the AI analysis pipeline to fix persistent failures
when analyzing training session videos. The pipeline is now resumable,
batched, timeout-protected, and self-recovering.


WHAT WAS BROKEN
---------------
The original pipeline was a single fragile chain: download 800MB video →
compress → upload to Gemini → overview analysis → detail analysis (ALL
exercises in one massive call) → clip extraction → Claude notes → Claude
tagging. If ANY step failed, the entire pipeline restarted from scratch.

Root causes of failures:
  1. Monolithic detail pass — one Gemini API call for all 15+ exercises
     meant long inference times and high timeout/failure rates
  2. Destructive cleanup — the Gemini cache was deleted immediately on
     failure, forcing a complete re-upload of the video
  3. Zero timeouts — every API call could hang forever, leaving sessions
     permanently stuck in "analyzing" with no recovery
  4. No resumability — a failure at step 8 of 11 meant repeating steps 1-7
  5. No stuck session recovery — if Railway restarted mid-processing,
     the session was stuck forever


WHAT CHANGED (12 files modified)
---------------------------------

1. BATCHED DETAIL ANALYSIS
   File: src/lib/gemini/analyze-session.ts

   Before: One Gemini call analyzed ALL exercises at once (15+ exercises,
   massive JSON response, 2-3 minute inference window)

   After: Exercises are analyzed in batches of 3. Each batch is a separate
   Gemini API call with its own retry logic. If batch 2 of 5 fails, only
   that batch retries — batches 1, 3, 4, 5 are unaffected.

   New functions:
   - analyzeExerciseBatch() — analyzes 3 exercises per call
   - runDetailAnalysisInBatches() — orchestrates sequential batches
   - uploadAndCache() — separated upload+cache from analysis
   - cleanupGeminiResources() — explicit cleanup (no more finally block)


2. RESUMABLE PIPELINE WITH CHECKPOINTS
   File: src/lib/processing/pipeline.ts (full rewrite)

   The pipeline now saves progress to the database after each stage.
   On retry, it reads the last checkpoint and skips completed stages.

   Pipeline stages (saved to DB as pipelineStage):
   ┌──────────────────────┬──────────────────────────────────────────┐
   │ Stage                │ What's saved to DB                       │
   ├──────────────────────┼──────────────────────────────────────────┤
   │ downloaded           │ Video downloaded from R2                 │
   │ compressed           │ Video compressed for analysis            │
   │ uploaded_to_gemini   │ geminiFileName, geminiCacheId, fileUri   │
   │ overview_complete    │ overviewAnalysis (JSON)                  │
   │ details_complete     │ detailsAnalysis (JSON)                   │
   │ clips_extracted      │ Exercise records with clips in R2        │
   │ notes_generated      │ sessionNotes                             │
   │ complete             │ All done                                 │
   └──────────────────────┴──────────────────────────────────────────┘

   Example: If analysis fails during clip extraction (stage 6), clicking
   Retry skips stages 1-5 entirely and resumes from clip extraction.


3. TIMEOUTS ON ALL API CALLS
   Files: client.ts, session-notes.ts, library-manager.ts, ffmpeg.ts, r2/client.ts

   Before: No timeouts anywhere. A hung request blocked the pipeline forever.

   After:
   ┌──────────────────────────────┬───────────┐
   │ Operation                    │ Timeout   │
   ├──────────────────────────────┼───────────┤
   │ Gemini video upload          │ 10 min    │
   │ Gemini file processing poll  │ 15 min    │
   │ Gemini cache creation        │ 5 min     │
   │ Gemini overview analysis     │ 5 min     │
   │ Gemini detail batch          │ 3 min     │
   │ Claude session notes         │ 2 min     │
   │ Claude exercise tagging      │ 2 min     │
   │ FFmpeg video compression     │ 10 min    │
   │ FFmpeg clip extraction       │ 3 min     │
   │ FFmpeg thumbnail generation  │ 30 sec    │
   │ R2 video download            │ 5 min     │
   └──────────────────────────────┴───────────┘

   FFmpeg timeouts kill the process (SIGKILL) to free resources.


4. GEMINI CACHE PRESERVED ON FAILURE
   File: src/lib/gemini/analyze-session.ts

   Before: finally block deleted cache + uploaded file immediately,
   even on partial failure. Next retry had to re-upload 200MB video.

   After: Pipeline owns cleanup. Cache is only deleted after successful
   completion or when the error is unrecoverable. On retry, the cached
   video is reused if the cache hasn't expired (1-hour TTL).


5. STUCK SESSION RECOVERY ON SERVER STARTUP
   File: src/lib/db/index.ts

   On app startup, any sessions stuck in "analyzing", "segmenting", or
   "generating_notes" are automatically set to "error" with the message:
   "Processing interrupted by server restart — click Retry to resume"

   Their pipelineStage is preserved so retry resumes from checkpoint.


6. CONCURRENCY GUARD
   File: src/lib/processing/pipeline.ts

   Only one session can process at a time (Railway has ~1GB ephemeral
   disk). If you try to process a second session while one is running,
   the API returns a 409 with a clear message.


7. DATABASE SCHEMA ADDITIONS
   Files: src/lib/db/schema.ts, index.ts, queries.ts

   New columns on sessions table:
   - pipeline_stage (TEXT) — last completed checkpoint stage
   - gemini_file_name (TEXT) — persisted for cleanup management
   - details_analysis (TEXT) — JSON of completed detail results

   Migration runs automatically via ALTER TABLE ADD COLUMN (safe for
   existing data, columns default to NULL).


8. STATUS API ENHANCEMENT
   File: src/app/api/sessions/[sessionId]/status/route.ts

   Now returns pipelineStage in the response so the frontend can
   show more granular progress information.


FILES MODIFIED
--------------
  src/lib/processing/pipeline.ts          — Full rewrite (checkpoint pipeline)
  src/lib/gemini/analyze-session.ts       — Batched analysis, no more finally cleanup
  src/lib/gemini/client.ts                — withTimeout utility, timeout constants
  src/lib/video/ffmpeg.ts                 — FFmpeg timeout wrappers with process kill
  src/lib/r2/client.ts                    — R2 download timeout
  src/lib/claude/session-notes.ts         — 2-minute timeout on Claude call
  src/lib/claude/library-manager.ts       — 2-minute timeout on Claude call
  src/lib/db/schema.ts                    — 3 new columns
  src/lib/db/index.ts                     — Migrations + stuck session recovery
  src/lib/db/queries.ts                   — Extended updateSessionStatus types
  src/app/api/sessions/[id]/process/route.ts  — Concurrency guard
  src/app/api/sessions/[id]/status/route.ts   — Returns pipelineStage


TESTING CHECKLIST
-----------------
  [ ] Upload a short test video (2-3 min), trigger analysis, verify
      it completes through all stages
  [ ] Check Railway logs for stage-by-stage progress messages
  [ ] Simulate a failure: if analysis errors, click Retry and verify
      it resumes from the last checkpoint (check logs for "Skipped" messages)
  [ ] Verify stuck recovery: if a session was stuck in "analyzing" before
      this deploy, it should now show as "error" with retry available
  [ ] Test with a full 55-minute session to confirm end-to-end reliability


ARCHITECTURE CONTEXT
--------------------
This update was informed by audits from both Gemini Thinking Model and
Replit Pro, who independently identified the same core issues:

  - Gemini recommended: fan-out per-exercise analysis, persistent caching,
    save overview immediately to DB
  - Replit recommended: skip download+reupload (presigned URLs), resumable
    stages with DB checkpoints, background job queue

This implementation combines the strongest elements of both: batched
analysis (Gemini's recommendation) with checkpoint-based resumability
(Replit's Option B), plus comprehensive timeouts and self-recovery that
neither explicitly covered.

═══════════════════════════════════════════════════════════════════════


## License

Private project.
