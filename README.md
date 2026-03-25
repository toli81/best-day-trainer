# Best Day - Personal Training Session Analyzer

A full-stack web application that helps personal trainers record, analyze, and document training sessions using AI. Upload or record a session video, and the app automatically identifies each exercise, extracts clips, analyzes form, generates coaching notes, and builds a searchable exercise library.

## What It Does

1. **Record or upload** a training session video (supports 55+ minute sessions)
2. **AI analyzes** the video to identify every exercise performed
3. **Extracts clips** and thumbnails for each individual exercise
4. **Generates professional session notes** with form observations and recommendations
5. **Produces a structured session report** with strengths, improvements, recommendations, and safety flags
6. **Builds a searchable library** of all exercises across all sessions

## Features

### Video Capture
- Record directly from your device camera with live preview
- Camera and microphone selection with auto-switching (wide-angle lens support)
- Auto-detects external microphones
- Screen wake-lock to prevent the phone from sleeping during recording
- Drag-and-drop or file picker upload (MP4, WebM, MOV)

### Direct-to-Cloud Upload
- Videos upload **directly from the phone to Cloudflare R2** using presigned URLs
- Zero video data flows through the server — all uploads go straight to R2
- 10MB multipart chunks with automatic retry (5 attempts, exponential backoff)
- Real-time upload progress tracking
- Cancel and retry support mid-transfer

### Client Management
- Client selector dropdown on upload and record pages
- Inline "Add New Client" flow without leaving the page
- Sessions linked to client records via `clientId`
- Backward-compatible with legacy free-text client names

### AI-Powered Video Analysis (Clip-First Pipeline)
- **Google Gemini 3.1 Pro** performs two-pass video analysis:
  - **Overview pass** on the full video identifies all exercises with timestamps (uses low media resolution for efficiency)
  - **Clip extraction** via FFmpeg isolates each exercise
  - **Detail pass** analyzes each individual clip for name, form quality, muscle groups, reps, sets, equipment, difficulty, and coaching cues
- **Claude** generates professional session notes including:
  - Session overview
  - Per-exercise observations
  - Form and technique assessment
  - Recommendations for the next session
- **Claude** produces structured report data (strengths, improvements, recommendations, safety flags) for the Card Cascade session report
- **Claude** standardizes exercise names and auto-generates searchability tags
- Per-exercise checkpointing — failed exercises don't block the session
- Reprocess button for completed or errored sessions

### Exercise Library
- Searchable across all sessions with real-time filtering
- Category filters: strength, cardio, flexibility, warmup, cooldown, plyometric
- Each exercise includes: video clip, thumbnail, description, muscle groups, equipment, difficulty, rep/set counts, form notes, and coaching cues
- Inline editing for exercise name, description, and form notes
- Delete individual exercises or entire sessions

### Card Cascade Session Report
- Dark-themed structured report replaces plain text display
- **8 organized sections:** header, flags, session overview, category emphasis, exercise list, strengths, improvements/recommendations, session notes
- **Expandable exercise rows** with coaching cues, form score, form notes, and clip links
- **Double-click to rename** exercises inline (saves via API)
- **Category emphasis chart** — percentage bars computed from exercise types
- **Graceful degradation** — existing sessions without structured report data still render using fallback data from exercises and notes
- **Safety flags** — AI-generated warnings and programming notes displayed as alert banners

### Session Management
- Dashboard with all sessions and color-coded status badges
- Real-time processing status with progress tracking
- Retry analysis on error

### UI/UX
- Dark and light theme with system preference detection
- Responsive design (mobile, tablet, desktop)
- Exercise detail modals with embedded video playback

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| UI | React 19, Tailwind CSS 4, shadcn/ui |
| Database | SQLite (better-sqlite3) with Drizzle ORM |
| Video Storage | Cloudflare R2 (S3-compatible) |
| Video Processing | FFmpeg (fluent-ffmpeg + ffmpeg-static) |
| AI - Video Analysis | Google Gemini 3.1 Pro (@google/genai) |
| AI - Notes & Tagging | Anthropic Claude (@anthropic-ai/sdk) |
| Email | Resend (magic link auth, prepared for Phase 2) |
| Deployment | Railway (auto-deploys on push to master) |

## Project Structure

```
best-day-trainer/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Dashboard
│   │   ├── record/page.tsx             # Live recording
│   │   ├── upload/page.tsx             # File upload
│   │   ├── library/page.tsx            # Exercise library
│   │   ├── login/page.tsx              # Login page (auth bypassed for now)
│   │   ├── sessions/
│   │   │   ├── page.tsx                # All sessions
│   │   │   └── [sessionId]/page.tsx    # Session detail
│   │   ├── auth/verify/route.ts        # Magic link verification
│   │   └── api/
│   │       ├── clients/route.ts        # Client CRUD
│   │       ├── upload/
│   │       │   ├── init/route.ts       # Multipart upload init (presigned URLs)
│   │       │   ├── complete/route.ts   # Finalize upload + create session
│   │       │   └── cleanup/route.ts    # Abort failed uploads
│   │       ├── auth/                   # Login/logout routes
│   │       ├── exercises/              # Exercise CRUD
│   │       └── sessions/               # Session CRUD + processing
│   ├── components/
│   │   ├── client-selector.tsx         # Client dropdown with inline add
│   │   ├── exercises/                  # Exercise cards, detail modal, grid
│   │   ├── sessions/                   # Session report, processing status, delete, reprocess
│   │   ├── layout/                     # Header navigation
│   │   └── ui/                         # shadcn/ui components
│   ├── hooks/
│   │   ├── use-media-recorder.ts       # Camera/mic recording + device switching
│   │   ├── use-upload.ts               # Direct-to-R2 multipart upload
│   │   └── use-wake-lock.ts            # Screen wake lock
│   └── lib/
│       ├── db/                         # Schema, queries, connection
│       ├── r2/                         # Cloudflare R2 client + upload sessions
│       ├── gemini/                     # Video analysis (overview + clip detail)
│       ├── claude/                     # Session notes + library tagging
│       ├── video/                      # FFmpeg clip/thumbnail extraction
│       ├── processing/                 # Clip-first orchestration pipeline
│       ├── auth/                       # Session management, magic links
│       ├── email/                      # Resend email client
│       └── audit.ts                    # HIPAA-informed audit logging
├── scripts/
│   └── migrate-clients.ts             # Backfill clients from legacy clientName
├── docs/superpowers/
│   ├── specs/                          # Design specs
│   └── plans/                          # Implementation plans
├── Dockerfile
└── railway.toml
```

## Database Schema

**sessions** — Training session records
- Video file reference (R2 key), duration, status
- AI-generated overview analysis, detail analysis, session notes, and structured report data
- Pipeline stage checkpointing for resumable processing
- `clientId` FK to clients table (nullable for legacy sessions)

**exercises** — Individual exercises extracted from sessions
- Timestamps, clip and thumbnail paths (R2 keys)
- Name, description, category, difficulty
- Muscle groups, equipment, rep/set counts
- Form notes, coaching cues, tags
- `formScore` and `formScoreOverride` (prepared for Phase 4)
- `detailStatus` for per-exercise processing state

**clients** — Client records
- Name, email, phone, status (active/inactive)

**auth_tokens** — Magic link tokens (15-min expiry)

**auth_sessions** — Login sessions (7-day lifetime, 30-min inactivity timeout)

**audit_log** — HIPAA-informed access logging

## Processing Pipeline (Clip-First Architecture)

```
Upload Video → R2
    ↓
Download from R2 to /tmp
    ↓
Gemini: Overview pass — identify exercises + timestamps (low resolution)
    ↓
FFmpeg: Extract individual clips for each exercise
    ↓
FFmpeg: Generate thumbnails at midpoints
    ↓
Upload clips + thumbnails to R2
    ↓
Gemini: Detail pass — analyze each clip individually
    ↓
Claude: Generate professional session notes + structured report data
    ↓
Claude: Standardize names + generate tags
    ↓
Complete — session ready for review
```

Each stage is checkpointed to the database. On retry, the pipeline resumes from the last completed stage.

## Storage Layout (Cloudflare R2)

```
videos/{sessionId}.mp4                  # Full session videos
clips/{sessionId}/{exerciseId}.mp4      # Exercise clips
clips/{sessionId}/{exerciseId}.jpg      # Exercise thumbnails
```

## Getting Started

### Prerequisites
- Node.js 20+
- FFmpeg installed locally (or use Docker)
- Google Gemini API key
- Anthropic Claude API key
- Cloudflare R2 bucket + API credentials

### Local Development

```bash
git clone https://github.com/toli81/best-day-trainer.git
cd best-day-trainer
npm install
cp .env.local.example .env.local   # Add your API keys
npm run dev
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key for video analysis |
| `ANTHROPIC_API_KEY` | Yes | Anthropic Claude API key for notes and tagging |
| `R2_ACCOUNT_ID` | Yes | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | Yes | R2 API token key ID |
| `R2_SECRET_ACCESS_KEY` | Yes | R2 API token secret |
| `R2_BUCKET_NAME` | No | Defaults to `best-day-trainer` |
| `TRAINER_EMAIL` | No | Email that identifies the trainer role (for auth) |
| `RESEND_API_KEY` | No | Resend API key for magic link emails |

### Production Deployment (Railway)

The app auto-deploys to Railway on push to master:

```bash
git push origin master
```

## Roadmap

- [x] Phase 1: Client data model + selector UI
- [x] Phase 2: Dashboard + charts (Recharts — volume, form, balance, frequency)
- [x] Phase 3: Card Cascade session report + structured AI output
- [ ] Phase 4: Trainer overlay (client roster, reminders, scheduling)
- [ ] Phase 5: Form scoring improvements (AI-generated scores + trainer override)
- [ ] Re-enable magic link authentication

## License

Private project.
