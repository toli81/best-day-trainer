# Phase 2: Dashboard + Charts — Design Spec

## Overview

Add a multi-client analytics dashboard to Best Day Trainer. The dashboard replaces the current homepage and provides 6 pages of training insights: Overview, Volume, Form, Balance, Sessions, and Notes. Form scoring is pulled into this phase so the Form chart has real data on day one.

No authentication — the app remains public and trainer-only. Auth will be added in a future phase.

## Decisions

- **No auth** — trainer-only, no login required
- **All 6 dashboard pages** included
- **Form scoring pulled in** from Phase 4 — Claude pipeline generates 1-10 scores per exercise
- **Dashboard replaces homepage** — becomes the new `/`
- **Top nav + horizontal tab bar** on desktop
- **Bottom tab bar** on mobile (native app feel, 5 tabs + More)
- **Per-page time range selectors** (7d / 30d / 90d / All)
- **Dashboard-first build order** — UI first, form scoring last

---

## Layout Architecture

### Route Groups

Use Next.js route groups to support two different layouts:

```
src/app/
├── layout.tsx                    ← minimal: html/body/ThemeProvider only
├── (dashboard)/
│   ├── layout.tsx                ← top nav bar + tab bar shell
│   ├── page.tsx                  ← Overview (new homepage)
│   ├── volume/page.tsx
│   ├── form/page.tsx
│   ├── balance/page.tsx
│   ├── sessions/page.tsx
│   └── notes/page.tsx
├── (legacy)/
│   ├── layout.tsx                ← existing Header + constrained main
│   ├── record/page.tsx
│   ├── upload/page.tsx
│   ├── library/page.tsx
│   └── sessions/[sessionId]/page.tsx
├── api/                          ← unchanged
└── ...
```

The `(dashboard)` group uses the new top nav + tab bar layout. The `(legacy)` group preserves the existing header layout for Record, Upload, Library, and session detail pages.

**Note:** Both route groups share the `/sessions` URL namespace intentionally. `(dashboard)/sessions/page.tsx` renders the dashboard Sessions tab at `/sessions`, while `(legacy)/sessions/[sessionId]/page.tsx` renders the detail view at `/sessions/:id`. Next.js resolves these correctly since route groups are invisible in the URL.

### Desktop Layout (768px+)

**Top nav bar** (sticky):
- Logo ("Best Day") on the left
- Client selector dropdown (center-left)
- Links to Record, Upload, Library (right)
- Theme toggle (far right)

**Tab bar** (below nav):
- 6 horizontal tabs: Overview, Volume, Form, Balance, Sessions, Notes
- Active tab highlighted with brand color underline
- Full-width, horizontally centered

**Main content area:**
- Full-width below the tab bar
- No max-width constraint (unlike the current 5xl constrained layout)

### Mobile Layout (<768px)

**Top nav bar** (simplified):
- Logo + client selector dropdown (full width)
- Record/Upload/Library links removed (accessible via More sheet)

**Bottom tab bar** (fixed):
- 5 visible tabs with icons + labels: Overview, Volume, Form, Balance, Sessions
- "More" tab opens a slide-up sheet containing: Notes, Record, Upload, Library
- Active tab highlighted with brand color (`#00CCFF`)

---

## Dashboard Pages

### Overview (`/`)

- **4 KPI stat cards** (2x2 on mobile, 4-across on desktop):
  - Total Sessions — with "X this week" delta
  - Consistency % — weeks with at least 1 session / total weeks in selected range, with weekly frequency note. For ranges under 2 weeks (e.g., 7d), show session count instead ("3 sessions this week") rather than a misleading percentage.
  - Monthly Volume — total reps, with % change vs prior equivalent period
  - Avg Form Score — mean of effective scores, with trend direction arrow (up/down/flat)
- **Time range selector:** 7d / 30d / 90d / All (pill buttons)
- **Combined trend chart:** area chart with volume + form score over time (dual Y-axis via Recharts)
- **Recent sessions list:** last 5 sessions with date, client name, exercise count, link to session detail

### Volume (`/volume`)

- **Bar chart:** total reps per session over time
- **Filter dropdowns:** muscle group, specific exercise
- **Time range selector**

### Form (`/form`)

- **Line chart:** form scores over time, one line per exercise
- AI-generated score shown as solid line
- Trainer override shown as distinct marker (diamond or square)
- **Filter dropdown:** specific exercise
- **Time range selector**

### Balance (`/balance`)

- **Donut chart:** muscle group distribution as percentage of total volume (reps)
- **Time range selector**

### Sessions (`/sessions`)

Absorbs the current homepage session list.

- **Calendar heatmap:** days trained, color intensity by session count
- **Session list below:** date, title, client, duration, exercise count, status badge
- Links to existing `/sessions/[id]` detail pages

### Notes (`/notes`)

- **Chronological feed:** AI-generated session notes
- Each entry: session title, date, client name, truncated notes preview (first ~200 chars)
- Click through to full session detail view

### Empty States

When filtering to a client with no sessions, or when a time range has no data, all pages show a friendly empty message instead of rendering empty chart axes. Example: "No sessions in this time range."

### Client Selector

Dropdown in the top nav bar. Options:
- "All Clients" (default) — shows aggregate data across all clients
- Individual clients listed by name

Selecting a client filters all dashboard data across all pages. The selection persists across tab switches via URL query parameter: `?client=<id>` or `?client=all`.

---

## API Routes

All dashboard API routes accept query parameters:
- `client` — client ID or `all` (default: `all`)
- `range` — `7d`, `30d`, `90d`, or `all` (default: `30d`)

Additional filter params where noted.

| Route | Method | Query Params | Returns |
|-------|--------|--------------|---------|
| `/api/dashboard/stats` | GET | `client`, `range` | `{ totalSessions, weekDelta, consistencyPercent, weeklyFrequency, monthlyVolume, volumeChange, avgFormScore, formTrend }` |
| `/api/dashboard/volume` | GET | `client`, `range`, `muscleGroup?`, `exercise?` | `[{ date, reps, sets }]` |
| `/api/dashboard/form` | GET | `client`, `range`, `exercise?` | `[{ date, exerciseName, score, isOverride }]` |
| `/api/dashboard/balance` | GET | `client`, `range` | `[{ muscleGroup, totalReps, percentage }]` |
| `/api/dashboard/sessions` | GET | `client`, `range` | `{ heatmap: [{ date, count }], sessions: [{ id, title, client, date, duration, exerciseCount, status }] }` |
| `/api/dashboard/notes` | GET | `client`, `range` | `[{ sessionId, title, client, date, notesPreview }]` |

All queries join `sessions` + `exercises` tables. Filter by `clientId` when not "all". Filter by `recordedAt` within the computed date range. Data is computed server-side using Drizzle ORM aggregation queries — no new tables needed.

### Form Score Override

| Route | Method | Body | Purpose |
|-------|--------|------|---------|
| `/api/exercises/[exerciseId]/form-score` | PATCH | `{ score: number }` | Write to `exercises.formScoreOverride` |

All charts and displays use the effective score: `formScoreOverride ?? formScore`.

---

## Form Scoring Pipeline Extension

### New Pipeline Stage: `form_scored`

Inserted into the `STAGE_ORDER` array in `src/lib/processing/pipeline.ts` between `tags_generated` and `complete`:

```
...tags_generated → form_scored → complete
```

The full updated stage order: `downloaded → uploaded_to_gemini → overview_complete → clips_extracted → details_complete → notes_generated → tags_generated → form_scored → complete`.

**Steps:**

1. Collect all exercises for the session that have `formNotes` and/or `coachingCues`
2. Send a single Claude API call with all exercises and a scoring rubric:
   - 1-3: Significant form issues, risk of injury
   - 4-6: Adequate but notable room for improvement
   - 7-8: Good form with minor corrections
   - 9-10: Excellent technique
3. Claude returns JSON array: `[{ exerciseId, score, justification }]`
4. Write `score` to `exercises.formScore` for each exercise
5. Stage checkpointed as `form_scored` in `sessions.pipelineStage`

### Backfill

A one-time API endpoint `POST /api/admin/backfill-form-scores` that:
1. Finds all completed sessions where exercises have `formNotes` but no `formScore`
2. Runs just the scoring step (not the full pipeline) for each session sequentially (one Claude call per session)
3. Returns count of sessions processed and exercises scored
4. Synchronous — with a small number of sessions this completes quickly. If the dataset grows, this can be converted to a background job later.

### Trainer Override UI

On the existing session detail page (`/sessions/[id]`), each exercise card shows its form score. Clicking the score reveals an inline number input (1-10). Saving calls `PATCH /api/exercises/[exerciseId]/form-score`.

---

## Charting

**Library:** Recharts with shadcn/ui `<Card>` primitives for consistent styling.

| Component | Chart Type |
|-----------|-----------|
| Overview trend | `<AreaChart>` with dual Y-axis (Recharts `<YAxis yAxisId>`) |
| Volume | `<BarChart>` |
| Form scores | `<LineChart>` with custom dot markers for overrides |
| Balance | `<PieChart>` (donut via `innerRadius`) |
| Session heatmap | Custom grid component (div-based, no Recharts needed) |
| Stat cards | shadcn/ui `<Card>` with custom content |

All charts wrapped in `<ResponsiveContainer>` for automatic resizing. Charts are client components (`"use client"`).

---

## New Components

```
src/components/
├── dashboard/
│   ├── top-nav.tsx              # Top navigation bar with logo, client selector, links
│   ├── tab-bar.tsx              # Desktop horizontal tab bar
│   ├── mobile-nav.tsx           # Mobile bottom tab bar + More sheet
│   ├── stat-card.tsx            # KPI card with value, label, delta
│   ├── time-range-selector.tsx  # 7d/30d/90d/All pill buttons
│   ├── overview-chart.tsx       # Combined area chart (volume + form)
│   ├── volume-chart.tsx         # Bar chart for reps over time
│   ├── form-chart.tsx           # Line chart for form scores
│   ├── balance-chart.tsx        # Donut chart for muscle groups
│   ├── session-heatmap.tsx      # Calendar heatmap grid
│   ├── session-list.tsx         # Session cards list (reused from current homepage)
│   ├── notes-feed.tsx           # Chronological notes feed
│   └── empty-state.tsx          # Friendly empty state message
```

---

## Database Changes

**No new tables.** The `formScore` and `formScoreOverride` columns already exist on the `exercises` table.

**New pipeline stage value:** `form_scored` added to the pipeline stage progression in `pipeline.ts`.

---

## Dependencies

**New:** `recharts` — React charting library

No other new dependencies. shadcn/ui chart wrapper components will be generated via `npx shadcn@latest add chart` if available, or charts will use Recharts directly with Tailwind styling.

---

## File Structure Summary

```
src/app/
├── layout.tsx                              # Minimal: html/body/ThemeProvider
├── (dashboard)/
│   ├── layout.tsx                          # Top nav + tab bar + mobile nav
│   ├── page.tsx                            # Overview
│   ├── volume/page.tsx
│   ├── form/page.tsx
│   ├── balance/page.tsx
│   ├── sessions/page.tsx
│   └── notes/page.tsx
├── (legacy)/
│   ├── layout.tsx                          # Existing Header + constrained main
│   ├── record/page.tsx                     # Moved from app/record/
│   ├── upload/page.tsx                     # Moved from app/upload/
│   ├── library/page.tsx                    # Moved from app/library/
│   └── sessions/[sessionId]/page.tsx       # Moved from app/sessions/[sessionId]/
├── api/
│   ├── dashboard/
│   │   ├── stats/route.ts
│   │   ├── volume/route.ts
│   │   ├── form/route.ts
│   │   ├── balance/route.ts
│   │   ├── sessions/route.ts
│   │   └── notes/route.ts
│   ├── exercises/[exerciseId]/
│   │   └── form-score/route.ts
│   ├── admin/
│   │   └── backfill-form-scores/route.ts
│   └── ...existing routes
src/components/dashboard/                   # All new dashboard components (listed above)
src/lib/claude/                             # Extended with form scoring function
src/lib/processing/pipeline.ts              # Extended with form_scored stage
```
