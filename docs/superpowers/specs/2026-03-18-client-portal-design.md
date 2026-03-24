# Client Portal Design Spec

## Overview

Add a client portal to Best Day Trainer, designed with HIPAA principles in mind. Trainers get a multi-client dashboard; each client gets a personal view of their session history, progress charts, and AI-generated notes. Both roles share the same dashboard layout initially, with data scoped by identity.

> **Note on HIPAA:** This design implements HIPAA-informed technical controls (unique identity, session timeouts, audit logging, encryption in transit, data isolation). Full HIPAA compliance additionally requires Business Associate Agreements (BAAs) with Railway and Cloudflare, which are outside the scope of this spec.

## Build Phases

1. **Data model + Auth** — new tables, magic link authentication, session management, audit logging
2. **Dashboard + Charts** — sidebar-nav dashboard with Recharts (volume, form, balance, frequency, notes)
3. **Trainer overlay** — client roster page with status cards and scheduling info
4. **Form scoring** — extend Claude pipeline to generate numeric form scores with trainer override

Each phase is independently deployable and useful. Phase 1 must include the complete login flow so that the trainer can continue using the app (recording, uploading, viewing sessions) immediately after auth is deployed. The app transitions from fully public to fully gated in one deploy.

## Tech Stack Additions

- **Recharts** — React charting library, used directly with shadcn/ui chart components for full React 19 compatibility
- **Resend** — transactional email for magic links (env var: `RESEND_API_KEY`)
- No other new dependencies required

---

## Phase 1: Data Model + Auth

### New Tables

#### `clients`

| Column      | Type    | Notes                        |
|-------------|---------|------------------------------|
| id          | text PK | nanoid                       |
| email       | text    | unique, indexed              |
| name        | text    | display name                 |
| phone       | text    | optional                     |
| status      | text    | "active" or "inactive"       |
| createdAt   | text    | ISO timestamp                |
| updatedAt   | text    | ISO timestamp                |

#### `auth_tokens`

| Column    | Type    | Notes                              |
|-----------|---------|------------------------------------|
| id        | text PK | nanoid                             |
| clientId  | text    | nullable FK to clients.id (null = trainer) |
| token     | text    | unique hash, indexed               |
| expiresAt | text    | ISO timestamp, 15 min from creation|
| usedAt    | text    | null until redeemed                |
| createdAt | text    | ISO timestamp                      |

#### `auth_sessions`

| Column       | Type    | Notes                                         |
|--------------|---------|-----------------------------------------------|
| id           | text PK | nanoid                                       |
| clientId     | text    | nullable FK to clients.id (null = trainer)   |
| role         | text    | "trainer" or "client"                        |
| token        | text    | unique, stored in HTTP-only cookie           |
| expiresAt    | text    | ISO timestamp, 7 days from creation (absolute max) |
| lastActiveAt | text    | updated on each valid request                |
| createdAt    | text    | ISO timestamp                                |

A session is invalid when either `expiresAt` has passed (absolute 7-day lifetime) or `lastActiveAt` is more than 30 minutes ago (inactivity timeout). Both checks run in middleware.

#### `audit_log`

| Column       | Type    | Notes                                    |
|--------------|---------|------------------------------------------|
| id           | text PK | nanoid                                  |
| clientId     | text    | nullable (trainer actions have no client)|
| action       | text    | e.g., "logged_in", "viewed_session"     |
| resourceType | text    | e.g., "session", "exercise", "dashboard"|
| resourceId   | text    | nullable                                |
| ipAddress    | text    |                                          |
| createdAt    | text    | ISO timestamp                           |

### Modifications to Existing Tables

**`sessions`** (training sessions):
- Add `clientId` (text, FK to clients.id, nullable during migration, required for new sessions)

**`exercises`**:
- Add `formScore` (integer, 1-10, nullable) — AI-generated
- Add `formScoreOverride` (integer, 1-10, nullable) — trainer manual override

### Trainer Identity

The trainer is identified by a `TRAINER_EMAIL` environment variable set in Railway. When a user logs in via magic link with that email, they receive the trainer role. All other emails are client role. The trainer does not have an entry in the `clients` table.

When the trainer logs in, the `auth_sessions` row is created with `clientId = null` and `role = "trainer"`. The `auth_tokens` table also allows `clientId = null` for the trainer's magic link tokens.

### Migration Strategy

The existing `clientName` free-text column on the `sessions` table is handled as follows:

1. `clientName` is kept as a read-only column for historical reference
2. During Phase 1 migration, a script creates `clients` rows from distinct non-empty `clientName` values
3. Existing sessions are backfilled with the corresponding `clientId`
4. The upload flow (`/upload` and `/record` pages) is updated to use a client selector dropdown instead of the free-text `clientName` input
5. New sessions require a `clientId` — the `clientName` field is no longer written to

### Authentication Flow

1. User visits `/login`, enters email
2. `POST /api/auth/login` — generates token, stores in `auth_tokens` (15 min expiry), sends email via Resend with link: `/auth/verify?token=abc123`. Rate limited to 3 requests per email per 15-minute window (checked against recent `auth_tokens` rows for that email).
3. User clicks link — `GET /auth/verify` (API route handler at `src/app/auth/verify/route.ts`) validates token, marks `usedAt`, creates `auth_sessions` row (with `role` set based on `TRAINER_EMAIL` match), sets HTTP-only secure cookie, returns a `redirect()` to `/dashboard`
4. On each request, Next.js middleware checks cookie, validates auth session, checks both `expiresAt` (7-day absolute) and `lastActiveAt` (30-min inactivity)
5. Valid requests refresh `lastActiveAt`
6. Expired or invalid sessions redirect to `/login`

### Logout

- Logout button appears at the bottom of the dashboard sidebar (both desktop and mobile)
- `POST /api/auth/logout` — deletes the `auth_sessions` row, clears the HTTP-only cookie, returns 200
- Client is redirected to `/login` after logout

### Route Protection (Next.js Middleware)

**Public routes** (no auth required):
- `/login`
- `/auth/verify`
- `/api/auth/*`

**Authenticated routes** (any valid session):
- `/dashboard/*` — all dashboard pages
- `/sessions/*` — existing session views (data scoped by identity)
- `/library` — existing library (data scoped by identity)

**Trainer-only routes:**
- `/trainer/clients` — client roster
- `/record` — record training session
- `/upload` — upload training session
- `POST /api/clients` — create client
- `PATCH /api/exercises/[id]/form-score` — override form score

**Data scoping:** Middleware attaches `clientId` and `role` to the request. API routes use these to filter data — clients always see only their own data regardless of query parameters.

### Audit Logging

Every page view and API call that accesses client data writes to `audit_log`. Implemented as a utility function: `auditLog(clientId, action, resourceType, resourceId, ipAddress)`.

---

## Phase 2: Dashboard + Charts

### Layout

Sidebar navigation layout with responsive behavior:

**Desktop (768px+):** Persistent left sidebar with:
- App branding
- Client selector dropdown (trainer only)
- Nav items: Overview, Volume, Form, Balance, Sessions, Notes
- Separated "Trainer" section with Clients link (trainer only)

**Mobile (<768px):**
- Sidebar collapses to bottom tab bar with icons: Overview, Volume, Form, Balance, Sessions
- "More" tab opens full nav as a slide-up sheet
- Client selector moves to top of page as full-width dropdown (trainer only)

### Dashboard Pages

#### Overview (`/dashboard`)
- 4 KPI stat cards (2x2 on mobile, 4-across on desktop):
  - Total Sessions (with "X this week" delta)
  - Consistency % — percentage of weeks in the selected time range with at least one session (with weekly frequency note)
  - Monthly Volume in reps (with % change vs prior month)
  - Avg Form Score (with trend direction)
- Time range selector: 7d / 30d / 90d / All
- Combined trend line chart: volume + form score over time
- Recent sessions list with links to session detail pages

**Empty states:** When a client has zero sessions, all dashboard pages show a friendly empty state: "No sessions yet. Your trainer will add your first session soon." Charts are replaced with the empty message rather than rendering empty axes.

#### Volume (`/dashboard/volume`)
- Bar/area chart: total reps and sets over time
- Filterable by muscle group or specific exercise
- Time range selector

#### Form (`/dashboard/form`)
- Line chart: form scores over time per exercise
- AI score shown as solid line, trainer override as distinct marker
- Filterable by exercise
- Time range selector

#### Balance (`/dashboard/balance`)
- Donut or radar chart: muscle group distribution over selected time period
- Shows percentage of total volume per muscle group
- Time range selector

#### Sessions (`/dashboard/sessions`)
- Calendar heatmap showing training frequency (days trained)
- Session list below with date, title, duration, exercise count
- Links to existing session detail pages

#### Notes (`/dashboard/notes`)
- Chronological feed of AI-generated session notes
- Each entry shows session title, date, and truncated notes preview
- Links to full session view

### Charting

**Library:** Recharts (direct) with shadcn/ui chart wrapper components for consistent styling with existing UI.
- Stat cards: custom components using shadcn/ui `<Card>` primitives
- Line charts: Recharts `<LineChart>` / `<AreaChart>` for trends
- Bar charts: Recharts `<BarChart>` for volume
- Donut: Recharts `<PieChart>` for balance
- All charts are responsive via Recharts `<ResponsiveContainer>`

### Dashboard API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/dashboard/stats` | GET | KPI card data |
| `/api/dashboard/volume` | GET | Volume chart data |
| `/api/dashboard/form` | GET | Form score chart data |
| `/api/dashboard/balance` | GET | Muscle group distribution |
| `/api/dashboard/sessions` | GET | Session frequency + list |
| `/api/dashboard/notes` | GET | Session notes feed (title, date, truncated notes) |

All routes accept `?clientId=X&range=30d` query params. Middleware enforces data scoping (clients can only access their own data).

### Root Layout Refactoring

The existing `src/app/layout.tsx` renders a `<Header />` and wraps children in a constrained `<main>` container. The dashboard requires a full-width sidebar layout that conflicts with this. During Phase 2, refactor using Next.js route groups:

- `(public)/` — existing pages (`/sessions/*`, `/library`, etc.) keep the current Header + constrained layout
- `(dashboard)/dashboard/` — uses the new sidebar layout without the Header wrapper
- Root `layout.tsx` becomes minimal (just html/body/providers)

---

## Phase 3: Trainer Overlay

### Client Roster Page (`/trainer/clients`)

Grid of client status cards, sorted by "needs attention" (inactive/due clients first).

**Each card shows:**
- Client name and email
- Last session date with relative time (e.g., "3 days ago")
- Consistency streak (e.g., "3x/week for 4 weeks")
- Days since last session (prominent number)
- Health indicator badge:
  - Green "On Track" — trained within expected frequency
  - Yellow "Due" — approaching or past expected session time
  - Red "Inactive" — no session in 2+ weeks
- "Send Reminder" action — calls `/api/clients/[id]/remind`, which creates a fresh `auth_tokens` row and sends a magic link email with a friendly nudge. This endpoint is not subject to the login rate limit (separate endpoint, trainer-initiated).

**Add Client form:**
- Fields: name, email
- Creates `clients` row and sends welcome email with first magic link

### Trainer API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/clients` | GET | List all clients with status info |
| `/api/clients` | POST | Create new client + send welcome email |
| `/api/clients/[id]/remind` | POST | Send reminder email with magic link |

---

## Phase 4: Form Scoring

### Pipeline Extension

After existing stage 7 (Claude notes generation), a new step runs:

1. For each exercise in the session, Claude receives `formNotes` and `coachingCues`
2. Prompt includes scoring rubric:
   - 1-3: Significant form issues, risk of injury
   - 4-6: Adequate but notable room for improvement
   - 7-8: Good form with minor corrections
   - 9-10: Excellent technique
3. Claude returns integer score (1-10) + one-line justification
4. Score saved to `exercises.formScore`
5. Exercises processed in batch (one Claude call with all exercises) to minimize API calls

### Trainer Override

- Session detail page shows form score per exercise with an inline edit control
- Trainer clicks score → number input appears → saves to `exercises.formScoreOverride`
- `PATCH /api/exercises/[id]/form-score` — trainer only, writes override + audit log entry

### Effective Score Logic

All charts and displays use: `formScoreOverride ?? formScore`. If trainer has overridden, that value is used everywhere.

---

## HIPAA Compliance

| Requirement | Implementation |
|------------|----------------|
| Unique user identification | Each client has email-based identity in `clients` table |
| Authentication | Magic link with 15-min token expiry |
| Session timeout | Auto-logout after 30 min inactivity via `lastActiveAt` |
| Audit logging | Every data access recorded in `audit_log` |
| Encryption in transit | HTTPS via Railway |
| Data isolation | Middleware enforces client can only access own data |
| Minimum necessary access | Clients see only their sessions/metrics |

### Future Considerations (Not in Scope)

- Encryption at rest (SQLite on Railway volume)
- BAA with Railway and Cloudflare
- Client data deletion requests
- Data retention policy

---

## Environment Variables (New)

| Variable | Description |
|----------|-------------|
| `TRAINER_EMAIL` | Email that identifies the trainer role |
| `RESEND_API_KEY` | Resend API key for transactional email |

---

## File Structure (New/Modified)

```
src/
├── app/
│   ├── login/page.tsx                  # Login page
│   ├── auth/verify/route.ts            # Magic link verification + redirect
│   ├── dashboard/
│   │   ├── layout.tsx                  # Sidebar layout
│   │   ├── page.tsx                    # Overview
│   │   ├── volume/page.tsx
│   │   ├── form/page.tsx
│   │   ├── balance/page.tsx
│   │   ├── sessions/page.tsx
│   │   └── notes/page.tsx
│   ├── trainer/
│   │   └── clients/page.tsx            # Client roster
│   └── api/
│       ├── auth/
│       │   ├── login/route.ts
│       │   └── logout/route.ts
│       ├── clients/
│       │   ├── route.ts                # GET list, POST create
│       │   └── [id]/
│       │       └── remind/route.ts     # POST send reminder
│       ├── dashboard/
│       │   ├── stats/route.ts
│       │   ├── volume/route.ts
│       │   ├── form/route.ts
│       │   ├── balance/route.ts
│       │   ├── sessions/route.ts
│       │   └── notes/route.ts
│       └── exercises/
│           └── [exerciseId]/
│               └── form-score/route.ts # PATCH override
├── components/
│   ├── dashboard/
│   │   ├── sidebar.tsx                 # Desktop sidebar
│   │   ├── mobile-nav.tsx              # Bottom tab bar
│   │   ├── stat-card.tsx
│   │   ├── time-range-selector.tsx
│   │   ├── volume-chart.tsx
│   │   ├── form-chart.tsx
│   │   ├── balance-chart.tsx
│   │   ├── session-heatmap.tsx
│   │   └── client-selector.tsx         # Trainer dropdown
│   └── trainer/
│       ├── client-card.tsx
│       └── add-client-form.tsx
├── lib/
│   ├── auth/
│   │   ├── session.ts                  # Session management
│   │   ├── magic-link.ts               # Token generation + email
│   │   └── middleware.ts               # Auth middleware helpers
│   ├── audit.ts                        # Audit logging utility
│   ├── db/
│   │   └── schema.ts                   # Updated with new tables (existing location)
│   └── email/
│       └── resend.ts                   # Resend client
└── middleware.ts                        # Next.js middleware (route protection)
```
