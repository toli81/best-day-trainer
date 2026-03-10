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

## License

Private project.
