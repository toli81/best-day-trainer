# Client Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a HIPAA-informed client portal with magic link auth, Recharts dashboards, trainer client roster, and AI form scoring.

**Architecture:** Incremental 4-phase build on existing Next.js 16 + SQLite + Drizzle stack. Phase 1 adds auth infrastructure (new tables, magic link via Resend, middleware). Phase 2 adds the dashboard with Recharts charts behind a sidebar layout using route groups. Phase 3 adds the trainer client roster. Phase 4 extends the Claude pipeline with form scoring.

**Tech Stack:** Next.js 16.1.6, React 19, Tailwind CSS 4, shadcn/ui, Drizzle ORM, better-sqlite3, Recharts, Resend, nanoid

**Spec:** `docs/superpowers/specs/2026-03-18-client-portal-design.md`

---

## File Structure Overview

### Phase 1: Data Model + Auth
```
src/
├── lib/
│   ├── db/
│   │   └── schema.ts                   # MODIFY: add clients, authTokens, authSessions, auditLog tables + session/exercise columns
│   ├── auth/
│   │   ├── session.ts                  # CREATE: session creation, validation, refresh, destroy
│   │   └── magic-link.ts              # CREATE: token generation, verification
│   ├── email/
│   │   └── resend.ts                   # CREATE: Resend client, sendMagicLink, sendWelcome, sendReminder
│   └── audit.ts                        # CREATE: auditLog() utility
├── middleware.ts                        # CREATE: Next.js middleware for route protection
├── app/
│   ├── login/
│   │   └── page.tsx                    # CREATE: login form
│   ├── auth/
│   │   └── verify/
│   │       └── route.ts               # CREATE: magic link verification + redirect
│   └── api/
│       └── auth/
│           ├── login/route.ts          # CREATE: POST send magic link
│           └── logout/route.ts         # CREATE: POST destroy session
```

### Phase 2: Dashboard + Charts
```
src/
├── app/
│   ├── (public)/                       # CREATE: route group for existing pages
│   │   ├── layout.tsx                  # CREATE: Header + constrained layout (moved from root)
│   │   ├── page.tsx                    # MOVE: from src/app/page.tsx
│   │   ├── sessions/                   # MOVE: from src/app/sessions/
│   │   ├── library/                    # MOVE: from src/app/library/
│   │   ├── record/                     # MOVE: from src/app/record/
│   │   └── upload/                     # MOVE: from src/app/upload/
│   ├── (dashboard)/
│   │   └── dashboard/
│   │       ├── layout.tsx              # CREATE: sidebar + mobile nav layout
│   │       ├── page.tsx                # CREATE: overview page
│   │       ├── volume/page.tsx         # CREATE: volume charts
│   │       ├── form/page.tsx           # CREATE: form score charts
│   │       ├── balance/page.tsx        # CREATE: muscle group balance
│   │       ├── sessions/page.tsx       # CREATE: session frequency + heatmap
│   │       └── notes/page.tsx          # CREATE: session notes feed
│   ├── api/
│   │   └── dashboard/
│   │       ├── stats/route.ts          # CREATE
│   │       ├── volume/route.ts         # CREATE
│   │       ├── form/route.ts           # CREATE
│   │       ├── balance/route.ts        # CREATE
│   │       ├── sessions/route.ts       # CREATE
│   │       └── notes/route.ts          # CREATE
│   └── layout.tsx                      # MODIFY: make minimal (html/body/providers only)
├── components/
│   └── dashboard/
│       ├── sidebar.tsx                 # CREATE
│       ├── mobile-nav.tsx              # CREATE
│       ├── stat-card.tsx               # CREATE
│       ├── time-range-selector.tsx     # CREATE
│       ├── volume-chart.tsx            # CREATE
│       ├── form-chart.tsx              # CREATE
│       ├── balance-chart.tsx           # CREATE
│       ├── session-heatmap.tsx         # CREATE
│       └── client-selector.tsx         # CREATE
```

### Phase 3: Trainer Overlay
```
src/
├── app/
│   ├── (dashboard)/
│   │   └── trainer/
│   │       └── clients/page.tsx        # CREATE
│   └── api/
│       └── clients/
│           ├── route.ts                # CREATE: GET list, POST create
│           └── [id]/
│               └── remind/route.ts     # CREATE: POST send reminder
├── components/
│   └── trainer/
│       ├── client-card.tsx             # CREATE
│       └── add-client-form.tsx         # CREATE
```

### Phase 4: Form Scoring
```
src/
├── lib/
│   ├── claude/
│   │   └── form-scoring.ts            # CREATE: generateFormScores batch function
│   └── processing/
│       └── pipeline.ts                 # MODIFY: add form scoring stage after notes
├── components/
│   └── exercises/
│       └── exercise-detail.tsx         # MODIFY: add form score display + trainer override
├── app/
│   └── api/
│       └── exercises/
│           └── [exerciseId]/
│               └── form-score/route.ts # CREATE: PATCH override
```

---

## Phase 1: Data Model + Auth

### Task 1: Schema Updates

**Files:**
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Add `sql` import and clients table to schema**

First, add `sql` to the imports at the top of `src/lib/db/schema.ts`:

```typescript
import { sql } from "drizzle-orm";
```

Then add after the existing `exercises` table definition:

```typescript
export const clients = sqliteTable("clients", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  phone: text("phone"),
  status: text("status", { enum: ["active", "inactive"] }).notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});
```

- [ ] **Step 2: Add authTokens table**

```typescript
export const authTokens = sqliteTable("auth_tokens", {
  id: text("id").primaryKey(),
  clientId: text("client_id"),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});
```

Note: `clientId` is nullable (null = trainer). No FK constraint since trainer has no clients row.

- [ ] **Step 3: Add authSessions table**

```typescript
export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(),
  clientId: text("client_id"),
  role: text("role", { enum: ["trainer", "client"] }).notNull(),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  lastActiveAt: text("last_active_at").notNull().default(sql`(datetime('now'))`),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});
```

- [ ] **Step 4: Add auditLog table**

```typescript
export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  clientId: text("client_id"),
  action: text("action").notNull(),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  ipAddress: text("ip_address"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});
```

- [ ] **Step 5: Add clientId to sessions table**

Add to the existing `sessions` table definition:

```typescript
clientId: text("client_id"),
```

- [ ] **Step 6: Add formScore and formScoreOverride to exercises table**

Add to the existing `exercises` table definition:

```typescript
formScore: integer("form_score"),
formScoreOverride: integer("form_score_override"),
```

- [ ] **Step 7: Add migration SQL to initDb()**

This project does NOT use Drizzle migrations. Instead, `src/lib/db/index.ts` has an `initDb()` function with raw `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ADD COLUMN` statements. Add the following to `initDb()`:

```typescript
// New tables for client portal
db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS auth_tokens (
    id TEXT PRIMARY KEY,
    client_id TEXT,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    client_id TEXT,
    role TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    client_id TEXT,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Add new columns to existing tables
try { db.exec("ALTER TABLE sessions ADD COLUMN client_id TEXT"); } catch {}
try { db.exec("ALTER TABLE exercises ADD COLUMN form_score INTEGER"); } catch {}
try { db.exec("ALTER TABLE exercises ADD COLUMN form_score_override INTEGER"); } catch {}
```

Also add `"form_scores_generated"` to the stuck-session recovery SQL so sessions stuck in that state get marked as errors on restart.

- [ ] **Step 8: Commit**

```bash
git add src/lib/db/schema.ts drizzle/
git commit -m "feat: add clients, auth, and audit tables to schema"
```

---

### Task 2: Audit Logging Utility

**Files:**
- Create: `src/lib/audit.ts`

- [ ] **Step 1: Create audit log utility**

```typescript
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

export async function logAudit({
  clientId,
  action,
  resourceType,
  resourceId,
  ipAddress,
}: {
  clientId?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
}) {
  db.insert(auditLog).values({
    id: nanoid(),
    clientId: clientId ?? null,
    action,
    resourceType: resourceType ?? null,
    resourceId: resourceId ?? null,
    ipAddress: ipAddress ?? null,
  }).run();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/audit.ts
git commit -m "feat: add audit logging utility"
```

---

### Task 3: Resend Email Client

**Files:**
- Create: `src/lib/email/resend.ts`

- [ ] **Step 1: Install Resend**

Run: `npm install resend`

- [ ] **Step 2: Create email client with magic link, welcome, and reminder functions**

```typescript
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// Update this to your verified Resend domain, or use an env var
const FROM_EMAIL = process.env.FROM_EMAIL || "Best Day Trainer <noreply@yourdomain.com>";

export async function sendMagicLinkEmail(email: string, token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const verifyUrl = `${baseUrl}/auth/verify?token=${token}`;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: "Your Best Day Trainer login link",
    html: `
      <h2>Log in to Best Day Trainer</h2>
      <p>Click the link below to log in. This link expires in 15 minutes.</p>
      <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#4cc9f0;color:#000;text-decoration:none;border-radius:6px;font-weight:600;">Log In</a></p>
      <p style="color:#888;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
    `,
  });
}

export async function sendWelcomeEmail(email: string, name: string, token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const verifyUrl = `${baseUrl}/auth/verify?token=${token}`;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `Welcome to Best Day Trainer, ${name}!`,
    html: `
      <h2>Welcome, ${name}!</h2>
      <p>Your trainer has set up your Best Day Trainer account. Click below to access your training dashboard.</p>
      <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#4cc9f0;color:#000;text-decoration:none;border-radius:6px;font-weight:600;">View My Dashboard</a></p>
      <p style="color:#888;font-size:12px;">This link expires in 15 minutes. You can request a new one anytime from the login page.</p>
    `,
  });
}

export async function sendReminderEmail(email: string, name: string, token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const verifyUrl = `${baseUrl}/auth/verify?token=${token}`;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `${name}, check out your training progress!`,
    html: `
      <h2>Hey ${name}!</h2>
      <p>Your trainer wanted to share your latest progress. Click below to see your dashboard.</p>
      <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#4cc9f0;color:#000;text-decoration:none;border-radius:6px;font-weight:600;">View My Progress</a></p>
      <p style="color:#888;font-size:12px;">This link expires in 15 minutes.</p>
    `,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/resend.ts package.json package-lock.json
git commit -m "feat: add Resend email client for magic links"
```

---

### Task 4: Auth Session Management

**Files:**
- Create: `src/lib/auth/session.ts`
- Create: `src/lib/auth/magic-link.ts`

- [ ] **Step 1: Create magic link token generation and verification**

Create `src/lib/auth/magic-link.ts`:

```typescript
import { nanoid } from "nanoid";
import crypto from "crypto";
import { db } from "@/lib/db";
import { authTokens, clients } from "@/lib/db/schema";
import { eq, and, gt, isNull } from "drizzle-orm";

const TOKEN_EXPIRY_MINUTES = 15;
const RATE_LIMIT_WINDOW_MINUTES = 15;
const RATE_LIMIT_MAX = 3;

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function createMagicLinkToken(email: string): Promise<{ token: string; isTrainer: boolean }> {
  const trainerEmail = process.env.TRAINER_EMAIL;
  const isTrainer = email.toLowerCase() === trainerEmail?.toLowerCase();

  // Rate limit check (login endpoint only)
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();
  let recentTokens;

  if (isTrainer) {
    recentTokens = db.select().from(authTokens)
      .where(and(isNull(authTokens.clientId), gt(authTokens.createdAt, windowStart)))
      .all();
  } else {
    const client = db.select().from(clients)
      .where(eq(clients.email, email.toLowerCase()))
      .get();

    if (!client) {
      throw new Error("No account found for this email");
    }

    recentTokens = db.select().from(authTokens)
      .where(and(eq(authTokens.clientId, client.id), gt(authTokens.createdAt, windowStart)))
      .all();
  }

  if (recentTokens.length >= RATE_LIMIT_MAX) {
    throw new Error("Too many login attempts. Please try again in 15 minutes.");
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000).toISOString();

  let clientId: string | null = null;
  if (!isTrainer) {
    const client = db.select().from(clients)
      .where(eq(clients.email, email.toLowerCase()))
      .get();
    clientId = client!.id;
  }

  db.insert(authTokens).values({
    id: nanoid(),
    clientId,
    token,
    expiresAt,
  }).run();

  return { token, isTrainer };
}

export async function createReminderToken(clientId: string): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000).toISOString();

  db.insert(authTokens).values({
    id: nanoid(),
    clientId,
    token,
    expiresAt,
  }).run();

  return token;
}

export async function verifyToken(token: string): Promise<{ clientId: string | null; role: "trainer" | "client" } | null> {
  const record = db.select().from(authTokens)
    .where(eq(authTokens.token, token))
    .get();

  if (!record) return null;
  if (record.usedAt) return null;
  if (new Date(record.expiresAt) < new Date()) return null;

  // Mark as used
  db.update(authTokens)
    .set({ usedAt: new Date().toISOString() })
    .where(eq(authTokens.id, record.id))
    .run();

  const role = record.clientId === null ? "trainer" : "client";
  return { clientId: record.clientId, role };
}
```

- [ ] **Step 2: Create auth session management**

Create `src/lib/auth/session.ts`:

```typescript
import { nanoid } from "nanoid";
import crypto from "crypto";
import { db } from "@/lib/db";
import { authSessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

const SESSION_COOKIE_NAME = "bdt_session";
const SESSION_LIFETIME_DAYS = 7;
const INACTIVITY_TIMEOUT_MINUTES = 30;

export async function createSession(clientId: string | null, role: "trainer" | "client"): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_DAYS * 24 * 60 * 60 * 1000);

  db.insert(authSessions).values({
    id: nanoid(),
    clientId,
    role,
    token,
    expiresAt: expiresAt.toISOString(),
    lastActiveAt: now.toISOString(),
  }).run();

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_LIFETIME_DAYS * 24 * 60 * 60,
  });

  return token;
}

export async function validateSession(): Promise<{ clientId: string | null; role: "trainer" | "client" } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = db.select().from(authSessions)
    .where(eq(authSessions.token, token))
    .get();

  if (!session) return null;

  const now = new Date();

  // Check absolute expiry
  if (new Date(session.expiresAt) < now) {
    db.delete(authSessions).where(eq(authSessions.id, session.id)).run();
    return null;
  }

  // Check inactivity timeout
  const lastActive = new Date(session.lastActiveAt);
  const inactivityLimit = new Date(lastActive.getTime() + INACTIVITY_TIMEOUT_MINUTES * 60 * 1000);
  if (inactivityLimit < now) {
    db.delete(authSessions).where(eq(authSessions.id, session.id)).run();
    return null;
  }

  // Refresh lastActiveAt
  db.update(authSessions)
    .set({ lastActiveAt: now.toISOString() })
    .where(eq(authSessions.id, session.id))
    .run();

  return { clientId: session.clientId, role: session.role as "trainer" | "client" };
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return;

  db.delete(authSessions).where(eq(authSessions.token, token)).run();

  cookieStore.delete(SESSION_COOKIE_NAME);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/magic-link.ts src/lib/auth/session.ts
git commit -m "feat: add magic link and session management"
```

---

### Task 5: Next.js Middleware

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 1: Create middleware for route protection**

```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth/verify", "/api/auth"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

const TRAINER_ONLY_PATHS = ["/trainer", "/record", "/upload"];
const TRAINER_ONLY_API = ["/api/clients"];

function isTrainerOnlyPath(pathname: string): boolean {
  return (
    TRAINER_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    TRAINER_ONLY_API.some((p) => pathname === p || pathname.startsWith(p + "/"))
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip public paths, static assets, and API routes that don't need auth
  if (isPublicPath(pathname) || pathname.startsWith("/_next") || pathname.startsWith("/api/upload")) {
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionToken = request.cookies.get("bdt_session")?.value;
  if (!sessionToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // We can't query the DB directly in edge middleware with better-sqlite3.
  // Instead, we set a header and validate in the API routes / server components.
  // The cookie presence check here is a first gate; full validation happens server-side.
  const response = NextResponse.next();
  response.headers.set("x-session-token", sessionToken);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|clips).*)",
  ],
};
```

**Note:** Since better-sqlite3 cannot run in Edge Runtime, the middleware does a cookie presence check only. Full session validation (expiry, inactivity, role) happens in server components and API routes via `validateSession()`.

- [ ] **Step 2: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: add Next.js middleware for route protection"
```

---

### Task 6: Auth API Routes

**Files:**
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/app/auth/verify/route.ts`

- [ ] **Step 1: Create login API route**

Create `src/app/api/auth/login/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createMagicLinkToken } from "@/lib/auth/magic-link";
import { sendMagicLinkEmail } from "@/lib/email/resend";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const { token } = await createMagicLinkToken(email.trim());
    await sendMagicLinkEmail(email.trim(), token);

    await logAudit({
      action: "magic_link_sent",
      ipAddress: request.headers.get("x-forwarded-for") || undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
```

- [ ] **Step 2: Create verify route (magic link landing)**

Create `src/app/auth/verify/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/magic-link";
import { createSession } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing_token", request.url));
  }

  const result = await verifyToken(token);

  if (!result) {
    return NextResponse.redirect(new URL("/login?error=invalid_or_expired", request.url));
  }

  await createSession(result.clientId, result.role);

  await logAudit({
    clientId: result.clientId,
    action: "logged_in",
    ipAddress: request.headers.get("x-forwarded-for") || undefined,
  });

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
```

- [ ] **Step 3: Create logout API route**

Create `src/app/api/auth/logout/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { destroySession, validateSession } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request) {
  const session = await validateSession();

  if (session) {
    await logAudit({
      clientId: session.clientId,
      action: "logged_out",
      ipAddress: request.headers.get("x-forwarded-for") || undefined,
    });
  }

  await destroySession();

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/auth/ src/app/auth/
git commit -m "feat: add login, verify, and logout auth routes"
```

---

### Task 7: Login Page

**Files:**
- Create: `src/app/login/page.tsx`

- [ ] **Step 1: Create login page with email form**

```tsx
"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();

  const urlError = searchParams.get("error");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="text-muted-foreground">
            We sent a login link to <strong>{email}</strong>. Click the link to sign in.
          </p>
          <p className="text-sm text-muted-foreground">
            The link expires in 15 minutes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Best Day Trainer</h1>
          <p className="text-muted-foreground">Enter your email to sign in</p>
        </div>

        {(error || urlError) && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            {error || (urlError === "invalid_or_expired"
              ? "This link has expired or already been used. Please request a new one."
              : urlError === "missing_token"
              ? "Invalid login link."
              : "An error occurred.")}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full px-3 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send login link"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/login/
git commit -m "feat: add login page with magic link flow"
```

---

### Task 8: Migration Script for Existing Data

**Files:**
- Create: `scripts/migrate-clients.ts`

- [ ] **Step 1: Create migration script**

This script creates `clients` rows from distinct `clientName` values on existing sessions, then backfills `clientId`.

```typescript
import { db } from "../src/lib/db";
import { sessions, clients } from "../src/lib/db/schema";
import { nanoid } from "nanoid";
import { eq, isNotNull, and, ne } from "drizzle-orm";

async function migrateClients() {
  // Get distinct non-empty clientNames
  const allSessions = db.select({
    clientName: sessions.clientName,
  }).from(sessions)
    .where(and(isNotNull(sessions.clientName), ne(sessions.clientName, "")))
    .all();

  const uniqueNames = [...new Set(allSessions.map((s) => s.clientName).filter(Boolean))];

  console.log(`Found ${uniqueNames.length} unique client names`);

  for (const name of uniqueNames) {
    if (!name) continue;

    // Create client with placeholder email (trainer can update later)
    const clientId = nanoid();
    const email = `${name.toLowerCase().replace(/\s+/g, ".")}@placeholder.local`;

    db.insert(clients).values({
      id: clientId,
      email,
      name,
      status: "active",
    }).run();

    // Backfill sessions
    db.update(sessions)
      .set({ clientId })
      .where(eq(sessions.clientName, name))
      .run();

    console.log(`Migrated "${name}" → ${clientId} (${email})`);
  }

  console.log("Migration complete");
}

migrateClients();
```

- [ ] **Step 2: Run migration**

Run: `npx tsx scripts/migrate-clients.ts`

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-clients.ts
git commit -m "feat: add client data migration script"
```

---

## Phase 2: Dashboard + Charts

### Task 9: Install Recharts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install recharts**

Run: `npm install recharts`

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add recharts dependency"
```

---

### Task 10: Route Group Refactoring

**Files:**
- Modify: `src/app/layout.tsx` (make minimal)
- Create: `src/app/(public)/layout.tsx` (move Header + constrained layout here)
- Move: existing pages into `(public)/`

- [ ] **Step 1: Create public route group layout**

Create `src/app/(public)/layout.tsx`:

```tsx
import { Header } from "@/components/layout/header";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </>
  );
}
```

- [ ] **Step 2: Simplify root layout**

Modify `src/app/layout.tsx` to remove the Header and main wrapper. Keep only html/body/fonts/providers:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Best Day Trainer",
  description: "AI-powered training session analysis",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem('theme') || 'system';
                const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (theme === 'dark' || (theme === 'system' && systemDark)) {
                  document.documentElement.classList.add('dark');
                }
              } catch {}
            `,
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Move existing pages into (public) route group**

Move the following directories/files into `src/app/(public)/`:

```bash
# From src/app/ to src/app/(public)/
mv src/app/page.tsx src/app/(public)/page.tsx
mv src/app/sessions src/app/(public)/sessions
mv src/app/library src/app/(public)/library
mv src/app/record src/app/(public)/record
mv src/app/upload src/app/(public)/upload
```

**Important:** Route groups (parenthesized folders) do NOT affect URL paths. `/sessions/123` still works as before.

- [ ] **Step 3b: Add trainer-only protection for record and upload pages**

Create `src/app/(public)/record/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { validateSession } from "@/lib/auth/session";

export default async function RecordLayout({ children }: { children: React.ReactNode }) {
  const session = await validateSession();
  if (!session || session.role !== "trainer") {
    redirect("/dashboard");
  }
  return <>{children}</>;
}
```

Create `src/app/(public)/upload/layout.tsx` with the same content (copy the file above).

This ensures clients cannot access the record or upload pages even though they're in the `(public)` route group.

- [ ] **Step 4: Verify existing pages still work**

Run: `npm run build`

Check that the build succeeds with no broken imports.

Run: `npm run dev` and verify:
- `/` loads the home page
- `/sessions` loads sessions list
- `/upload` loads upload page
- `/library` loads library

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/(public)/
git commit -m "refactor: reorganize routes into public route group"
```

---

### Task 11: Dashboard Layout + Sidebar

**Files:**
- Create: `src/components/dashboard/sidebar.tsx`
- Create: `src/components/dashboard/mobile-nav.tsx`
- Create: `src/app/(dashboard)/dashboard/layout.tsx`

- [ ] **Step 1: Create sidebar component**

Create `src/components/dashboard/sidebar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  BarChart3,
  TrendingUp,
  PieChart,
  Calendar,
  FileText,
  Users,
  LogOut,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/volume", label: "Volume", icon: BarChart3 },
  { href: "/dashboard/form", label: "Form", icon: TrendingUp },
  { href: "/dashboard/balance", label: "Balance", icon: PieChart },
  { href: "/dashboard/sessions", label: "Sessions", icon: Calendar },
  { href: "/dashboard/notes", label: "Notes", icon: FileText },
];

const trainerItems = [
  { href: "/trainer/clients", label: "Clients", icon: Users },
];

interface SidebarProps {
  role: "trainer" | "client";
  clientSelector?: React.ReactNode;
}

export function Sidebar({ role, clientSelector }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <aside className="hidden md:flex md:w-56 md:flex-col md:fixed md:inset-y-0 border-r border-border bg-card">
      <div className="flex flex-col h-full">
        {/* Branding */}
        <div className="p-4 border-b border-border">
          <div className="text-lg font-bold">Best Day</div>
          <div className="text-xs text-muted-foreground">
            {role === "trainer" ? "Trainer Portal" : "Client Portal"}
          </div>
        </div>

        {/* Client selector (trainer only) */}
        {role === "trainer" && clientSelector && (
          <div className="p-3 border-b border-border">{clientSelector}</div>
        )}

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}

          {/* Trainer section */}
          {role === "trainer" && (
            <>
              <div className="pt-4 mt-4 border-t border-border">
                <div className="px-3 pb-2 text-xs text-muted-foreground uppercase tracking-wider">
                  Trainer
                </div>
                {trainerItems.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </nav>

        {/* Logout */}
        <div className="p-2 border-t border-border">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted w-full"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Create mobile nav component**

Create `src/components/dashboard/mobile-nav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart3,
  TrendingUp,
  PieChart,
  Calendar,
  FileText,
  Menu,
} from "lucide-react";
import { useState } from "react";

const tabs = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/volume", label: "Volume", icon: BarChart3 },
  { href: "/dashboard/form", label: "Form", icon: TrendingUp },
  { href: "/dashboard/balance", label: "Balance", icon: PieChart },
  { href: "/dashboard/sessions", label: "Sessions", icon: Calendar },
];

interface MobileNavProps {
  role: "trainer" | "client";
  clientSelector?: React.ReactNode;
}

export function MobileNav({ role, clientSelector }: MobileNavProps) {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);

  return (
    <>
      {/* Client selector at top on mobile (trainer only) */}
      {role === "trainer" && clientSelector && (
        <div className="md:hidden p-3 border-b border-border bg-card">
          {clientSelector}
        </div>
      )}

      {/* Bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-card z-50">
        <div className="flex items-center justify-around">
          {tabs.slice(0, 4).map((tab) => {
            const isActive = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-col items-center gap-1 py-2 px-3 text-xs ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <tab.icon className="h-5 w-5" />
                {tab.label}
              </Link>
            );
          })}
          <button
            onClick={() => setShowMore(!showMore)}
            className="flex flex-col items-center gap-1 py-2 px-3 text-xs text-muted-foreground"
          >
            <Menu className="h-5 w-5" />
            More
          </button>
        </div>
      </nav>

      {/* More sheet */}
      {showMore && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setShowMore(false)}
        >
          <div
            className="absolute bottom-16 left-0 right-0 bg-card border-t border-border rounded-t-xl p-4 space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            {[...tabs.slice(4), { href: "/dashboard/notes", label: "Notes", icon: FileText }].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setShowMore(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-md text-sm text-foreground hover:bg-muted"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
            {role === "trainer" && (
              <Link
                href="/trainer/clients"
                onClick={() => setShowMore(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-md text-sm text-foreground hover:bg-muted"
              >
                Clients
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Create dashboard layout**

Create `src/app/(dashboard)/dashboard/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { validateSession } from "@/lib/auth/session";
import { Sidebar } from "@/components/dashboard/sidebar";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { ClientSelector } from "@/components/dashboard/client-selector";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await validateSession();

  if (!session) {
    redirect("/login");
  }

  const clientSelector = session.role === "trainer" ? <ClientSelector /> : undefined;

  return (
    <div className="min-h-screen bg-background">
      <Sidebar role={session.role} clientSelector={clientSelector} />
      <MobileNav role={session.role} clientSelector={clientSelector} />
      <main className="md:pl-56 pb-20 md:pb-0">
        <div className="p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/ src/app/(dashboard)/
git commit -m "feat: add dashboard layout with sidebar and mobile nav"
```

---

### Task 12: Client Selector Component

**Files:**
- Create: `src/components/dashboard/client-selector.tsx`

- [ ] **Step 1: Create client selector**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface Client {
  id: string;
  name: string;
  email: string;
}

export function ClientSelector() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("clientId") || "";

  useEffect(() => {
    fetch("/api/clients")
      .then((res) => res.json())
      .then((data) => {
        setClients(data.clients || []);
        setLoading(false);
      });
  }, []);

  function handleChange(clientId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (clientId) {
      params.set("clientId", clientId);
    } else {
      params.delete("clientId");
    }
    router.push(`?${params.toString()}`);
  }

  if (loading) {
    return <div className="h-9 bg-muted rounded-md animate-pulse" />;
  }

  return (
    <select
      value={selectedId}
      onChange={(e) => handleChange(e.target.value)}
      className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm text-foreground"
    >
      <option value="">All Clients</option>
      {clients.map((client) => (
        <option key={client.id} value={client.id}>
          {client.name}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/client-selector.tsx
git commit -m "feat: add client selector dropdown for trainer view"
```

---

### Task 13: Dashboard Shared Components

**Files:**
- Create: `src/components/dashboard/stat-card.tsx`
- Create: `src/components/dashboard/time-range-selector.tsx`

- [ ] **Step 1: Create stat card component**

Create `src/components/dashboard/stat-card.tsx`:

```tsx
interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: string; positive: boolean };
}

export function StatCard({ title, value, subtitle, trend }: StatCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{title}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {trend && (
        <div className={`text-xs mt-1 ${trend.positive ? "text-green-500" : "text-red-500"}`}>
          {trend.positive ? "\u25B2" : "\u25BC"} {trend.value}
        </div>
      )}
      {subtitle && !trend && (
        <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create time range selector**

Create `src/components/dashboard/time-range-selector.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

const ranges = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "all", label: "All" },
];

export function TimeRangeSelector() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentRange = searchParams.get("range") || "30d";

  function handleChange(range: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", range);
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex gap-1">
      {ranges.map((r) => (
        <button
          key={r.value}
          onClick={() => handleChange(r.value)}
          className={`px-3 py-1 text-xs rounded-md transition-colors ${
            currentRange === r.value
              ? "bg-primary text-primary-foreground font-medium"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/stat-card.tsx src/components/dashboard/time-range-selector.tsx
git commit -m "feat: add stat card and time range selector components"
```

---

### Task 14: Dashboard API Routes

**Files:**
- Create: `src/app/api/dashboard/stats/route.ts`
- Create: `src/app/api/dashboard/volume/route.ts`
- Create: `src/app/api/dashboard/form/route.ts`
- Create: `src/app/api/dashboard/balance/route.ts`
- Create: `src/app/api/dashboard/sessions/route.ts`
- Create: `src/app/api/dashboard/notes/route.ts`

- [ ] **Step 1: Create a shared dashboard query helper**

Create `src/lib/dashboard/queries.ts`:

```typescript
import { db } from "@/lib/db";
import { sessions, exercises } from "@/lib/db/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";

export function getDateRangeStart(range: string): string | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

export function getScopedSessions(clientId: string | null, rangeStart: string | null) {
  const conditions = [];
  if (clientId) conditions.push(eq(sessions.clientId, clientId));
  if (rangeStart) conditions.push(gte(sessions.createdAt, rangeStart));
  conditions.push(eq(sessions.status, "complete"));

  return db.select().from(sessions)
    .where(conditions.length > 1 ? and(...conditions) : conditions[0])
    .orderBy(desc(sessions.createdAt))
    .all();
}

export function getExercisesForSessions(sessionIds: string[]) {
  if (sessionIds.length === 0) return [];
  return db.select().from(exercises)
    .where(sql`${exercises.sessionId} IN (${sql.join(sessionIds.map(id => sql`${id}`), sql`,`)})`)
    .all();
}
```

- [ ] **Step 2: Create stats API route**

Create `src/app/api/dashboard/stats/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth/session";
import { getDateRangeStart, getScopedSessions, getExercisesForSessions } from "@/lib/dashboard/queries";
import { logAudit } from "@/lib/audit";

export async function GET(request: Request) {
  const session = await validateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const range = url.searchParams.get("range") || "30d";
  const requestedClientId = url.searchParams.get("clientId");

  // Scope data: clients can only see their own
  const clientId = session.role === "client" ? session.clientId : (requestedClientId || null);

  const rangeStart = getDateRangeStart(range);
  const sessionList = getScopedSessions(clientId, rangeStart);
  const sessionIds = sessionList.map((s) => s.id);
  const exerciseList = getExercisesForSessions(sessionIds);

  // Total sessions
  const totalSessions = sessionList.length;

  // Sessions this week
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const sessionsThisWeek = sessionList.filter((s) => new Date(s.createdAt) >= weekAgo).length;

  // Consistency: % of weeks with at least one session
  // Use epoch-week bucketing for correctness
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const weekOf = (d: Date) => Math.floor(d.getTime() / WEEK_MS);

  const sessionWeeks = new Set<number>();
  sessionList.forEach((s) => sessionWeeks.add(weekOf(new Date(s.createdAt))));

  let totalWeekCount = 0;
  if (rangeStart) {
    const startWeek = weekOf(new Date(rangeStart));
    const nowWeek = weekOf(new Date());
    totalWeekCount = nowWeek - startWeek + 1;
  }
  const consistency = totalWeekCount > 0 ? Math.round((sessionWeeks.size / totalWeekCount) * 100) : 0;

  // Weekly frequency
  const weekCount = totalWeekCount || 1;
  const weeklyFrequency = (totalSessions / weekCount).toFixed(1);

  // Monthly volume (total reps)
  const totalReps = exerciseList.reduce((sum, e) => sum + (e.repCount || 0) * (e.setCount || 1), 0);

  // Previous period volume for comparison
  const prevRangeStart = rangeStart ? new Date(new Date(rangeStart).getTime() - (Date.now() - new Date(rangeStart).getTime())).toISOString() : null;
  const prevSessions = prevRangeStart ? getScopedSessions(clientId, prevRangeStart).filter((s) => rangeStart && new Date(s.createdAt) < new Date(rangeStart)) : [];
  const prevExercises = getExercisesForSessions(prevSessions.map((s) => s.id));
  const prevReps = prevExercises.reduce((sum, e) => sum + (e.repCount || 0) * (e.setCount || 1), 0);
  const volumeChange = prevReps > 0 ? Math.round(((totalReps - prevReps) / prevReps) * 100) : 0;

  // Avg form score
  const scores = exerciseList
    .map((e) => e.formScoreOverride ?? e.formScore)
    .filter((s): s is number => s !== null && s !== undefined);
  const avgFormScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;

  await logAudit({
    clientId: session.clientId,
    action: "viewed_dashboard_stats",
    resourceType: "dashboard",
    ipAddress: request.headers.get("x-forwarded-for") || undefined,
  });

  return NextResponse.json({
    totalSessions,
    sessionsThisWeek,
    consistency,
    weeklyFrequency,
    totalReps,
    volumeChange,
    avgFormScore,
  });
}
```

- [ ] **Step 3: Create volume API route**

Create `src/app/api/dashboard/volume/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth/session";
import { getDateRangeStart, getScopedSessions, getExercisesForSessions } from "@/lib/dashboard/queries";

export async function GET(request: Request) {
  const session = await validateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const range = url.searchParams.get("range") || "30d";
  const requestedClientId = url.searchParams.get("clientId");
  const muscleGroup = url.searchParams.get("muscleGroup");

  const clientId = session.role === "client" ? session.clientId : (requestedClientId || null);
  const rangeStart = getDateRangeStart(range);
  const sessionList = getScopedSessions(clientId, rangeStart);
  const exerciseList = getExercisesForSessions(sessionList.map((s) => s.id));

  // Group by date
  const byDate = new Map<string, { reps: number; sets: number }>();

  for (const ex of exerciseList) {
    if (muscleGroup) {
      const groups = JSON.parse(ex.muscleGroups || "[]");
      if (!groups.includes(muscleGroup)) continue;
    }

    const s = sessionList.find((s) => s.id === ex.sessionId);
    if (!s) continue;
    const date = new Date(s.createdAt).toISOString().split("T")[0];

    const entry = byDate.get(date) || { reps: 0, sets: 0 };
    entry.reps += (ex.repCount || 0) * (ex.setCount || 1);
    entry.sets += ex.setCount || 0;
    byDate.set(date, entry);
  }

  const data = Array.from(byDate.entries())
    .map(([date, values]) => ({ date, ...values }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ data });
}
```

- [ ] **Step 4: Create form API route**

Create `src/app/api/dashboard/form/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth/session";
import { getDateRangeStart, getScopedSessions, getExercisesForSessions } from "@/lib/dashboard/queries";

export async function GET(request: Request) {
  const session = await validateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const range = url.searchParams.get("range") || "30d";
  const requestedClientId = url.searchParams.get("clientId");
  const exerciseFilter = url.searchParams.get("exercise");

  const clientId = session.role === "client" ? session.clientId : (requestedClientId || null);
  const rangeStart = getDateRangeStart(range);
  const sessionList = getScopedSessions(clientId, rangeStart);
  const exerciseList = getExercisesForSessions(sessionList.map((s) => s.id));

  // Group by date, showing per-exercise scores
  const data: Array<{ date: string; exercise: string; aiScore: number | null; overrideScore: number | null; effectiveScore: number | null }> = [];

  for (const ex of exerciseList) {
    if (exerciseFilter && ex.name !== exerciseFilter) continue;
    if (ex.formScore === null && ex.formScoreOverride === null) continue;

    const s = sessionList.find((s) => s.id === ex.sessionId);
    if (!s) continue;
    const date = new Date(s.createdAt).toISOString().split("T")[0];

    data.push({
      date,
      exercise: ex.name || "Unknown",
      aiScore: ex.formScore,
      overrideScore: ex.formScoreOverride,
      effectiveScore: ex.formScoreOverride ?? ex.formScore,
    });
  }

  data.sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ data });
}
```

- [ ] **Step 5: Create balance API route**

Create `src/app/api/dashboard/balance/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth/session";
import { getDateRangeStart, getScopedSessions, getExercisesForSessions } from "@/lib/dashboard/queries";

export async function GET(request: Request) {
  const session = await validateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const range = url.searchParams.get("range") || "30d";
  const requestedClientId = url.searchParams.get("clientId");

  const clientId = session.role === "client" ? session.clientId : (requestedClientId || null);
  const rangeStart = getDateRangeStart(range);
  const sessionList = getScopedSessions(clientId, rangeStart);
  const exerciseList = getExercisesForSessions(sessionList.map((s) => s.id));

  // Count volume per muscle group
  const groupVolume = new Map<string, number>();

  for (const ex of exerciseList) {
    const groups: string[] = JSON.parse(ex.muscleGroups || "[]");
    const volume = (ex.repCount || 0) * (ex.setCount || 1);

    for (const g of groups) {
      groupVolume.set(g, (groupVolume.get(g) || 0) + volume);
    }
  }

  const totalVolume = Array.from(groupVolume.values()).reduce((a, b) => a + b, 0);

  const data = Array.from(groupVolume.entries())
    .map(([group, volume]) => ({
      group,
      volume,
      percentage: totalVolume > 0 ? Math.round((volume / totalVolume) * 100) : 0,
    }))
    .sort((a, b) => b.volume - a.volume);

  return NextResponse.json({ data });
}
```

- [ ] **Step 6: Create sessions API route**

Create `src/app/api/dashboard/sessions/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth/session";
import { getDateRangeStart, getScopedSessions } from "@/lib/dashboard/queries";
import { db } from "@/lib/db";
import { exercises } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: Request) {
  const session = await validateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const range = url.searchParams.get("range") || "30d";
  const requestedClientId = url.searchParams.get("clientId");

  const clientId = session.role === "client" ? session.clientId : (requestedClientId || null);
  const rangeStart = getDateRangeStart(range);
  const sessionList = getScopedSessions(clientId, rangeStart);

  // Heatmap: dates with sessions
  const heatmap = new Map<string, number>();
  for (const s of sessionList) {
    const date = new Date(s.createdAt).toISOString().split("T")[0];
    heatmap.set(date, (heatmap.get(date) || 0) + 1);
  }

  // Session list with exercise counts (single query, no N+1)
  const allExercises = getExercisesForSessions(sessionList.map((s) => s.id));
  const exerciseCountMap = new Map<string, number>();
  allExercises.forEach((ex) => {
    exerciseCountMap.set(ex.sessionId, (exerciseCountMap.get(ex.sessionId) || 0) + 1);
  });

  const list = sessionList.map((s) => ({
    id: s.id,
    title: s.title || "Untitled Session",
    date: s.createdAt,
    durationSeconds: s.durationSeconds,
    exerciseCount: exerciseCountMap.get(s.id) || 0,
  }));

  return NextResponse.json({
    heatmap: Array.from(heatmap.entries()).map(([date, count]) => ({ date, count })),
    sessions: list,
  });
}
```

- [ ] **Step 7: Create notes API route**

Create `src/app/api/dashboard/notes/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth/session";
import { getDateRangeStart, getScopedSessions } from "@/lib/dashboard/queries";

export async function GET(request: Request) {
  const session = await validateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const range = url.searchParams.get("range") || "30d";
  const requestedClientId = url.searchParams.get("clientId");

  const clientId = session.role === "client" ? session.clientId : (requestedClientId || null);
  const rangeStart = getDateRangeStart(range);
  const sessionList = getScopedSessions(clientId, rangeStart)
    .filter((s) => s.sessionNotes);

  const data = sessionList.map((s) => ({
    sessionId: s.id,
    title: s.title || "Untitled Session",
    date: s.createdAt,
    notes: s.sessionNotes?.substring(0, 300) || "",
    hasMore: (s.sessionNotes?.length || 0) > 300,
  }));

  return NextResponse.json({ data });
}
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/dashboard/ src/app/api/dashboard/
git commit -m "feat: add dashboard API routes for stats, volume, form, balance, sessions, notes"
```

---

### Task 15: Dashboard Chart Components

**Files:**
- Create: `src/components/dashboard/volume-chart.tsx`
- Create: `src/components/dashboard/form-chart.tsx`
- Create: `src/components/dashboard/balance-chart.tsx`
- Create: `src/components/dashboard/session-heatmap.tsx`

- [ ] **Step 1: Create volume chart**

Create `src/components/dashboard/volume-chart.tsx`:

```tsx
"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface VolumeChartProps {
  data: Array<{ date: string; reps: number; sets: number }>;
}

export function VolumeChart({ data }: VolumeChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No volume data yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "6px",
          }}
        />
        <Bar dataKey="reps" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Total Reps" />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Create form chart**

Create `src/components/dashboard/form-chart.tsx`:

```tsx
"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface FormChartProps {
  data: Array<{ date: string; effectiveScore: number | null; exercise: string }>;
}

export function FormChart({ data }: FormChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No form score data yet. Scores are generated after AI analysis.
      </div>
    );
  }

  // Aggregate by date (average score)
  const byDate = new Map<string, number[]>();
  data.forEach((d) => {
    if (d.effectiveScore !== null) {
      const scores = byDate.get(d.date) || [];
      scores.push(d.effectiveScore);
      byDate.set(d.date, scores);
    }
  });

  const chartData = Array.from(byDate.entries())
    .map(([date, scores]) => ({
      date,
      score: Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
        <YAxis domain={[0, 10]} stroke="hsl(var(--muted-foreground))" fontSize={12} />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "6px",
          }}
        />
        <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} name="Form Score" />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: Create balance chart**

Create `src/components/dashboard/balance-chart.tsx`:

```tsx
"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const COLORS = [
  "hsl(200, 80%, 60%)", "hsl(150, 60%, 50%)", "hsl(40, 80%, 55%)",
  "hsl(280, 60%, 60%)", "hsl(350, 70%, 55%)", "hsl(100, 50%, 50%)",
  "hsl(220, 70%, 55%)", "hsl(30, 70%, 55%)",
];

interface BalanceChartProps {
  data: Array<{ group: string; volume: number; percentage: number }>;
}

export function BalanceChart({ data }: BalanceChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No muscle group data yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={350}>
      <PieChart>
        <Pie
          data={data}
          dataKey="volume"
          nameKey="group"
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={120}
          paddingAngle={2}
          label={({ group, percentage }) => `${group} ${percentage}%`}
        >
          {data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 4: Create session heatmap**

Create `src/components/dashboard/session-heatmap.tsx`:

```tsx
"use client";

interface HeatmapProps {
  data: Array<{ date: string; count: number }>;
}

export function SessionHeatmap({ data }: HeatmapProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        No sessions yet. Your trainer will add your first session soon.
      </div>
    );
  }

  const dataMap = new Map(data.map((d) => [d.date, d.count]));

  // Generate last 90 days
  const days: Array<{ date: string; count: number }> = [];
  const now = new Date();
  for (let i = 89; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    days.push({ date: key, count: dataMap.get(key) || 0 });
  }

  // Arrange into weeks (columns) x days (rows)
  const startDayOfWeek = new Date(days[0].date).getDay();
  const paddedDays = Array(startDayOfWeek).fill(null).concat(days);
  const weeks: (typeof days[0] | null)[][] = [];
  for (let i = 0; i < paddedDays.length; i += 7) {
    weeks.push(paddedDays.slice(i, i + 7));
  }

  function getColor(count: number) {
    if (count === 0) return "bg-muted";
    if (count === 1) return "bg-green-300 dark:bg-green-800";
    if (count === 2) return "bg-green-500 dark:bg-green-600";
    return "bg-green-700 dark:bg-green-400";
  }

  return (
    <div className="flex gap-1 overflow-x-auto">
      {weeks.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-1">
          {week.map((day, di) => (
            <div
              key={di}
              className={`w-3 h-3 rounded-sm ${day ? getColor(day.count) : "bg-transparent"}`}
              title={day ? `${day.date}: ${day.count} session(s)` : ""}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/volume-chart.tsx src/components/dashboard/form-chart.tsx src/components/dashboard/balance-chart.tsx src/components/dashboard/session-heatmap.tsx
git commit -m "feat: add Recharts dashboard chart components"
```

---

### Task 16: Dashboard Pages

**Files:**
- Create: `src/app/(dashboard)/dashboard/page.tsx`
- Create: `src/app/(dashboard)/dashboard/volume/page.tsx`
- Create: `src/app/(dashboard)/dashboard/form/page.tsx`
- Create: `src/app/(dashboard)/dashboard/balance/page.tsx`
- Create: `src/app/(dashboard)/dashboard/sessions/page.tsx`
- Create: `src/app/(dashboard)/dashboard/notes/page.tsx`

- [ ] **Step 1: Create overview page**

Create `src/app/(dashboard)/dashboard/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { StatCard } from "@/components/dashboard/stat-card";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import Link from "next/link";

interface Stats {
  totalSessions: number;
  sessionsThisWeek: number;
  consistency: number;
  weeklyFrequency: string;
  totalReps: number;
  volumeChange: number;
  avgFormScore: string | null;
}

interface VolumePoint {
  date: string;
  reps: number;
}

interface SessionItem {
  id: string;
  title: string;
  date: string;
  durationSeconds: number;
  exerciseCount: number;
}

export default function DashboardOverview() {
  const searchParams = useSearchParams();
  const range = searchParams.get("range") || "30d";
  const clientId = searchParams.get("clientId") || "";
  const params = new URLSearchParams();
  if (range) params.set("range", range);
  if (clientId) params.set("clientId", clientId);
  const qs = params.toString();

  const [stats, setStats] = useState<Stats | null>(null);
  const [volumeData, setVolumeData] = useState<VolumePoint[]>([]);
  const [recentSessions, setRecentSessions] = useState<SessionItem[]>([]);

  useEffect(() => {
    fetch(`/api/dashboard/stats?${qs}`).then((r) => r.json()).then(setStats);
    fetch(`/api/dashboard/volume?${qs}`).then((r) => r.json()).then((d) => setVolumeData(d.data || []));
    fetch(`/api/dashboard/sessions?${qs}`).then((r) => r.json()).then((d) => setRecentSessions((d.sessions || []).slice(0, 5)));
  }, [qs]);

  if (!stats) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Overview</h1>
        <TimeRangeSelector />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Total Sessions" value={stats.totalSessions} trend={{ value: `${stats.sessionsThisWeek} this week`, positive: true }} />
        <StatCard title="Consistency" value={`${stats.consistency}%`} subtitle={`${stats.weeklyFrequency}x per week avg`} />
        <StatCard title="Monthly Volume" value={stats.totalReps.toLocaleString()} trend={stats.volumeChange !== 0 ? { value: `${Math.abs(stats.volumeChange)}% vs last period`, positive: stats.volumeChange > 0 } : undefined} subtitle="total reps" />
        <StatCard title="Avg Form Score" value={stats.avgFormScore || "—"} subtitle={stats.avgFormScore ? "out of 10" : "No scores yet"} />
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-3">Progress Trend</h2>
        <div className="rounded-lg border border-border bg-card p-4">
          {volumeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={volumeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px" }} />
                <Area type="monotone" dataKey="reps" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.1} name="Volume (reps)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              No sessions yet. Your trainer will add your first session soon.
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-3">Recent Sessions</h2>
        <div className="space-y-2">
          {recentSessions.length === 0 ? (
            <div className="text-muted-foreground text-sm">No sessions yet.</div>
          ) : (
            recentSessions.map((s) => (
              <Link
                key={s.id}
                href={`/sessions/${s.id}`}
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted transition-colors"
              >
                <div>
                  <div className="text-sm font-medium">{s.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(s.date).toLocaleDateString()} &middot; {Math.round((s.durationSeconds || 0) / 60)} min &middot; {s.exerciseCount} exercises
                  </div>
                </div>
                <div className="text-xs text-primary">View →</div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create volume page**

Create `src/app/(dashboard)/dashboard/volume/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
import { VolumeChart } from "@/components/dashboard/volume-chart";

export default function VolumePage() {
  const searchParams = useSearchParams();
  const range = searchParams.get("range") || "30d";
  const clientId = searchParams.get("clientId") || "";
  const params = new URLSearchParams();
  if (range) params.set("range", range);
  if (clientId) params.set("clientId", clientId);

  const [data, setData] = useState<Array<{ date: string; reps: number; sets: number }>>([]);

  useEffect(() => {
    fetch(`/api/dashboard/volume?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setData(d.data || []));
  }, [range, clientId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Volume</h1>
        <TimeRangeSelector />
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <VolumeChart data={data} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create form page**

Create `src/app/(dashboard)/dashboard/form/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
import { FormChart } from "@/components/dashboard/form-chart";

export default function FormPage() {
  const searchParams = useSearchParams();
  const range = searchParams.get("range") || "30d";
  const clientId = searchParams.get("clientId") || "";
  const params = new URLSearchParams();
  if (range) params.set("range", range);
  if (clientId) params.set("clientId", clientId);

  const [data, setData] = useState([]);

  useEffect(() => {
    fetch(`/api/dashboard/form?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setData(d.data || []));
  }, [range, clientId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Form & Technique</h1>
        <TimeRangeSelector />
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <FormChart data={data} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create balance page**

Create `src/app/(dashboard)/dashboard/balance/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
import { BalanceChart } from "@/components/dashboard/balance-chart";

export default function BalancePage() {
  const searchParams = useSearchParams();
  const range = searchParams.get("range") || "30d";
  const clientId = searchParams.get("clientId") || "";
  const params = new URLSearchParams();
  if (range) params.set("range", range);
  if (clientId) params.set("clientId", clientId);

  const [data, setData] = useState([]);

  useEffect(() => {
    fetch(`/api/dashboard/balance?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setData(d.data || []));
  }, [range, clientId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Muscle Group Balance</h1>
        <TimeRangeSelector />
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <BalanceChart data={data} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create sessions page**

Create `src/app/(dashboard)/dashboard/sessions/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
import { SessionHeatmap } from "@/components/dashboard/session-heatmap";
import Link from "next/link";

export default function SessionsPage() {
  const searchParams = useSearchParams();
  const range = searchParams.get("range") || "30d";
  const clientId = searchParams.get("clientId") || "";
  const params = new URLSearchParams();
  if (range) params.set("range", range);
  if (clientId) params.set("clientId", clientId);

  const [heatmap, setHeatmap] = useState([]);
  const [sessions, setSessions] = useState<Array<{ id: string; title: string; date: string; durationSeconds: number; exerciseCount: number }>>([]);

  useEffect(() => {
    fetch(`/api/dashboard/sessions?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setHeatmap(d.heatmap || []);
        setSessions(d.sessions || []);
      });
  }, [range, clientId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Sessions</h1>
        <TimeRangeSelector />
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold mb-3">Training Frequency</h2>
        <SessionHeatmap data={heatmap} />
      </div>

      <div className="space-y-2">
        {sessions.map((s) => (
          <Link
            key={s.id}
            href={`/sessions/${s.id}`}
            className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted transition-colors"
          >
            <div>
              <div className="text-sm font-medium">{s.title}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(s.date).toLocaleDateString()} &middot; {Math.round((s.durationSeconds || 0) / 60)} min &middot; {s.exerciseCount} exercises
              </div>
            </div>
            <div className="text-xs text-primary">View →</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create notes page**

Create `src/app/(dashboard)/dashboard/notes/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
import Link from "next/link";

interface NoteEntry {
  sessionId: string;
  title: string;
  date: string;
  notes: string;
  hasMore: boolean;
}

export default function NotesPage() {
  const searchParams = useSearchParams();
  const range = searchParams.get("range") || "30d";
  const clientId = searchParams.get("clientId") || "";
  const params = new URLSearchParams();
  if (range) params.set("range", range);
  if (clientId) params.set("clientId", clientId);

  const [data, setData] = useState<NoteEntry[]>([]);

  useEffect(() => {
    fetch(`/api/dashboard/notes?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setData(d.data || []));
  }, [range, clientId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Session Notes</h1>
        <TimeRangeSelector />
      </div>

      {data.length === 0 ? (
        <div className="text-muted-foreground">No session notes yet.</div>
      ) : (
        <div className="space-y-4">
          {data.map((note) => (
            <Link
              key={note.sessionId}
              href={`/sessions/${note.sessionId}`}
              className="block p-4 rounded-lg border border-border bg-card hover:bg-muted transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-sm">{note.title}</h3>
                <span className="text-xs text-muted-foreground">
                  {new Date(note.date).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {note.notes}
                {note.hasMore && "..."}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Verify build**

Run: `npm run build`

Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/app/(dashboard)/dashboard/
git commit -m "feat: add all dashboard pages (overview, volume, form, balance, sessions, notes)"
```

---

## Phase 3: Trainer Overlay

### Task 17: Clients API Routes

**Files:**
- Create: `src/app/api/clients/route.ts`
- Create: `src/app/api/clients/[id]/remind/route.ts`

- [ ] **Step 1: Create clients list and create route**

Create `src/app/api/clients/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { validateSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { clients, sessions } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { createReminderToken } from "@/lib/auth/magic-link";
import { sendWelcomeEmail } from "@/lib/email/resend";
import { logAudit } from "@/lib/audit";

export async function GET(request: Request) {
  const session = await validateSession();
  if (!session || session.role !== "trainer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allClients = db.select().from(clients).orderBy(desc(clients.createdAt)).all();

  // Enrich with session stats
  const enriched = allClients.map((client) => {
    const clientSessions = db.select().from(sessions)
      .where(eq(sessions.clientId, client.id))
      .orderBy(desc(sessions.createdAt))
      .all();

    const lastSession = clientSessions[0];
    const daysSinceLastSession = lastSession
      ? Math.floor((Date.now() - new Date(lastSession.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Health status
    let healthStatus: "on_track" | "due" | "inactive" = "inactive";
    if (daysSinceLastSession !== null) {
      if (daysSinceLastSession <= 4) healthStatus = "on_track";
      else if (daysSinceLastSession <= 14) healthStatus = "due";
      else healthStatus = "inactive";
    }

    // Weekly consistency (last 4 weeks)
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    const recentSessions = clientSessions.filter((s) => new Date(s.createdAt) >= fourWeeksAgo);
    const weeksWithSessions = new Set(recentSessions.map((s) => {
      const d = new Date(s.createdAt);
      return `${d.getFullYear()}-W${Math.ceil(d.getDate() / 7)}`;
    }));
    const weeklyFrequency = (recentSessions.length / 4).toFixed(1);

    return {
      id: client.id,
      name: client.name,
      email: client.email,
      status: client.status,
      totalSessions: clientSessions.length,
      lastSessionDate: lastSession?.createdAt || null,
      daysSinceLastSession,
      healthStatus,
      weeklyFrequency,
      consistencyWeeks: weeksWithSessions.size,
    };
  });

  // Sort: inactive/due first
  enriched.sort((a, b) => {
    const order = { inactive: 0, due: 1, on_track: 2 };
    return order[a.healthStatus] - order[b.healthStatus];
  });

  return NextResponse.json({ clients: enriched });
}

export async function POST(request: Request) {
  const session = await validateSession();
  if (!session || session.role !== "trainer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name, email } = await request.json();

  if (!name || !email) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }

  // Check for existing client
  const existing = db.select().from(clients).where(eq(clients.email, email.toLowerCase())).get();
  if (existing) {
    return NextResponse.json({ error: "A client with this email already exists" }, { status: 409 });
  }

  const clientId = nanoid();
  db.insert(clients).values({
    id: clientId,
    email: email.toLowerCase(),
    name,
    status: "active",
  }).run();

  // Send welcome email with magic link
  const token = await createReminderToken(clientId);
  await sendWelcomeEmail(email, name, token);

  await logAudit({
    clientId: session.clientId,
    action: "created_client",
    resourceType: "client",
    resourceId: clientId,
    ipAddress: request.headers.get("x-forwarded-for") || undefined,
  });

  return NextResponse.json({ id: clientId, name, email }, { status: 201 });
}
```

- [ ] **Step 2: Create remind route**

Create `src/app/api/clients/[id]/remind/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createReminderToken } from "@/lib/auth/magic-link";
import { sendReminderEmail } from "@/lib/email/resend";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await validateSession();
  if (!session || session.role !== "trainer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const client = db.select().from(clients).where(eq(clients.id, id)).get();

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const token = await createReminderToken(client.id);
  await sendReminderEmail(client.email, client.name, token);

  await logAudit({
    clientId: session.clientId,
    action: "sent_reminder",
    resourceType: "client",
    resourceId: client.id,
    ipAddress: request.headers.get("x-forwarded-for") || undefined,
  });

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/clients/
git commit -m "feat: add clients API routes (list, create, remind)"
```

---

### Task 18: Trainer Clients Page

**Files:**
- Create: `src/components/trainer/client-card.tsx`
- Create: `src/components/trainer/add-client-form.tsx`
- Create: `src/app/(dashboard)/trainer/clients/page.tsx`

- [ ] **Step 1: Create client card component**

Create `src/components/trainer/client-card.tsx`:

```tsx
"use client";

import { useState } from "react";

interface ClientCardProps {
  client: {
    id: string;
    name: string;
    email: string;
    totalSessions: number;
    lastSessionDate: string | null;
    daysSinceLastSession: number | null;
    healthStatus: "on_track" | "due" | "inactive";
    weeklyFrequency: string;
    consistencyWeeks: number;
  };
}

const statusConfig = {
  on_track: { label: "On Track", color: "bg-green-500/10 text-green-500 border-green-500/20" },
  due: { label: "Due", color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
  inactive: { label: "Inactive", color: "bg-red-500/10 text-red-500 border-red-500/20" },
};

export function ClientCard({ client }: ClientCardProps) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const status = statusConfig[client.healthStatus];

  async function handleRemind() {
    setSending(true);
    await fetch(`/api/clients/${client.id}/remind`, { method: "POST" });
    setSending(false);
    setSent(true);
    setTimeout(() => setSent(false), 3000);
  }

  const daysSince = client.daysSinceLastSession;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-medium">{client.name}</div>
          <div className="text-xs text-muted-foreground">{client.email}</div>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full border ${status.color}`}>
          {status.label}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-lg font-bold">{daysSince !== null ? daysSince : "—"}</div>
          <div className="text-xs text-muted-foreground">days since</div>
        </div>
        <div>
          <div className="text-lg font-bold">{client.totalSessions}</div>
          <div className="text-xs text-muted-foreground">sessions</div>
        </div>
        <div>
          <div className="text-lg font-bold">{client.weeklyFrequency}x</div>
          <div className="text-xs text-muted-foreground">per week</div>
        </div>
      </div>

      {client.lastSessionDate && (
        <div className="text-xs text-muted-foreground">
          Last session: {new Date(client.lastSessionDate).toLocaleDateString()}
          {daysSince !== null && ` (${daysSince} day${daysSince !== 1 ? "s" : ""} ago)`}
        </div>
      )}

      <button
        onClick={handleRemind}
        disabled={sending || sent}
        className="w-full text-xs px-3 py-2 rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-50"
      >
        {sent ? "Reminder Sent!" : sending ? "Sending..." : "Send Reminder"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create add client form**

Create `src/components/trainer/add-client-form.tsx`:

```tsx
"use client";

import { useState } from "react";

interface AddClientFormProps {
  onAdded: () => void;
}

export function AddClientForm({ onAdded }: AddClientFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error);
      setLoading(false);
      return;
    }

    setName("");
    setEmail("");
    setLoading(false);
    setOpen(false);
    onAdded();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
      >
        Add Client
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h3 className="font-medium text-sm">New Client</h3>
      {error && <div className="text-sm text-destructive">{error}</div>}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        required
        className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        required
        className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
      />
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
          {loading ? "Creating..." : "Create & Send Welcome"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted">
          Cancel
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Create trainer clients page**

Create `src/app/(dashboard)/trainer/clients/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { ClientCard } from "@/components/trainer/client-card";
import { AddClientForm } from "@/components/trainer/add-client-form";

interface ClientData {
  id: string;
  name: string;
  email: string;
  totalSessions: number;
  lastSessionDate: string | null;
  daysSinceLastSession: number | null;
  healthStatus: "on_track" | "due" | "inactive";
  weeklyFrequency: string;
  consistencyWeeks: number;
}

export default function TrainerClientsPage() {
  const [clients, setClients] = useState<ClientData[]>([]);
  const [loading, setLoading] = useState(true);

  function loadClients() {
    setLoading(true);
    fetch("/api/clients")
      .then((r) => r.json())
      .then((d) => {
        setClients(d.clients || []);
        setLoading(false);
      });
  }

  useEffect(() => {
    loadClients();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Clients</h1>
        <AddClientForm onAdded={loadClients} />
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : clients.length === 0 ? (
        <div className="text-muted-foreground">No clients yet. Add your first client above.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add trainer layout to protect route**

Create `src/app/(dashboard)/trainer/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { validateSession } from "@/lib/auth/session";

export default async function TrainerLayout({ children }: { children: React.ReactNode }) {
  const session = await validateSession();

  if (!session || session.role !== "trainer") {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/trainer/ src/app/(dashboard)/trainer/
git commit -m "feat: add trainer clients page with status cards and add client form"
```

---

## Phase 4: Form Scoring

### Task 19: Claude Form Scoring Function

**Files:**
- Create: `src/lib/claude/form-scoring.ts`

- [ ] **Step 1: Create batch form scoring function**

```typescript
import { claude } from "./client";

interface ExerciseForScoring {
  id: string;
  name: string;
  formNotes: string | null;
  coachingCues: string | null;
}

interface FormScoreResult {
  exerciseId: string;
  score: number;
  justification: string;
}

export async function generateFormScores(
  exercises: ExerciseForScoring[],
): Promise<FormScoreResult[]> {
  const exerciseDescriptions = exercises
    .map((ex, i) => {
      const cues = ex.coachingCues ? JSON.parse(ex.coachingCues) : [];
      return `Exercise ${i + 1} (ID: ${ex.id}):
Name: ${ex.name}
Form Notes: ${ex.formNotes || "None"}
Coaching Cues: ${cues.length > 0 ? cues.join(", ") : "None"}`;
    })
    .join("\n\n");

  const response = await claude.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `You are a fitness form assessment expert. Score each exercise's form on a 1-10 scale using this rubric:

- 1-3: Significant form issues, risk of injury
- 4-6: Adequate but notable room for improvement
- 7-8: Good form with minor corrections
- 9-10: Excellent technique

For each exercise, provide a score and a one-line justification.

Respond in JSON format as an array:
[{"exerciseId": "...", "score": N, "justification": "..."}]

Exercises to score:

${exerciseDescriptions}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  // Extract JSON from response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Failed to parse form scores from Claude response");
  }

  return JSON.parse(jsonMatch[0]);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/claude/form-scoring.ts
git commit -m "feat: add Claude form scoring function"
```

---

### Task 20: Pipeline Integration

**Files:**
- Modify: `src/lib/processing/pipeline.ts`

- [ ] **Step 1: Add form scoring stage to pipeline**

In `src/lib/processing/pipeline.ts`, add a new stage after `notes_generated` and before `tags_generated`.

Find the section after notes generation completes and add:

```typescript
// Stage: Form Scoring (after notes_generated, before tags_generated)
if (shouldRunStage("form_scores_generated")) {
  callbacks?.onStatus?.("Generating form scores...");
  callbacks?.onProgress?.(88);

  const exercisesForScoring = db.select().from(exercises)
    .where(eq(exercises.sessionId, sessionId))
    .all()
    .filter((ex) => ex.formNotes || ex.coachingCues);

  if (exercisesForScoring.length > 0) {
    const { generateFormScores } = await import("@/lib/claude/form-scoring");
    const scores = await generateFormScores(
      exercisesForScoring.map((ex) => ({
        id: ex.id,
        name: ex.name || "Unknown",
        formNotes: ex.formNotes,
        coachingCues: ex.coachingCues,
      }))
    );

    for (const score of scores) {
      db.update(exercises)
        .set({ formScore: score.score })
        .where(eq(exercises.id, score.exerciseId))
        .run();
    }
  }

  updatePipelineStage(sessionId, "form_scores_generated");
}
```

Also update the `shouldRunStage` function to include `"form_scores_generated"` in the stage order, between `"notes_generated"` and `"tags_generated"`.

- [ ] **Step 2: Verify the pipeline stage order is correct**

The full stage order should now be:
1. `downloaded`
2. `uploaded_to_gemini`
3. `overview_complete`
4. `clips_extracted`
5. `details_complete`
6. `notes_generated`
7. `form_scores_generated` (NEW)
8. `tags_generated`
9. `complete`

- [ ] **Step 3: Commit**

```bash
git add src/lib/processing/pipeline.ts
git commit -m "feat: add form scoring stage to processing pipeline"
```

---

### Task 21: Form Score Override API + UI

**Files:**
- Create: `src/app/api/exercises/[exerciseId]/form-score/route.ts`
- Modify: `src/components/exercises/exercise-detail.tsx`

- [ ] **Step 1: Create form score override API route**

Create `src/app/api/exercises/[exerciseId]/form-score/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { exercises } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logAudit } from "@/lib/audit";

export async function PATCH(request: Request, { params }: { params: Promise<{ exerciseId: string }> }) {
  const session = await validateSession();
  if (!session || session.role !== "trainer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { exerciseId } = await params;
  const { score } = await request.json();

  if (typeof score !== "number" || score < 1 || score > 10) {
    return NextResponse.json({ error: "Score must be between 1 and 10" }, { status: 400 });
  }

  const exercise = db.select().from(exercises).where(eq(exercises.id, exerciseId)).get();
  if (!exercise) {
    return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  }

  db.update(exercises)
    .set({ formScoreOverride: score })
    .where(eq(exercises.id, exerciseId))
    .run();

  await logAudit({
    clientId: session.clientId,
    action: "overrode_form_score",
    resourceType: "exercise",
    resourceId: exerciseId,
    ipAddress: request.headers.get("x-forwarded-for") || undefined,
  });

  return NextResponse.json({ success: true, score });
}
```

- [ ] **Step 2: Add form score display to exercise detail component**

Modify `src/components/exercises/exercise-detail.tsx` to add a form score section. Find the section where `formNotes` is displayed and add after it:

```tsx
{/* Form Score */}
{(exercise.formScore !== null || exercise.formScoreOverride !== null) && (
  <div className="space-y-1">
    <label className="text-xs text-muted-foreground uppercase tracking-wide">Form Score</label>
    <div className="flex items-center gap-2">
      <span className="text-2xl font-bold">
        {exercise.formScoreOverride ?? exercise.formScore}/10
      </span>
      {exercise.formScoreOverride !== null && exercise.formScore !== null && (
        <span className="text-xs text-muted-foreground">(AI: {exercise.formScore})</span>
      )}
    </div>
  </div>
)}
```

For the trainer override, add an inline edit control (only visible when user is trainer — pass `isTrainer` prop from the parent page after validating the session):

```tsx
{isTrainer && (
  <div className="space-y-1">
    <label className="text-xs text-muted-foreground uppercase tracking-wide">Override Score</label>
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={1}
        max={10}
        value={overrideScore ?? ""}
        onChange={(e) => setOverrideScore(e.target.value ? Number(e.target.value) : null)}
        placeholder={String(exercise.formScore ?? "")}
        className="w-16 px-2 py-1 rounded border border-border bg-background text-sm"
      />
      <button
        onClick={handleSaveOverride}
        disabled={overrideScore === null}
        className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50"
      >
        Save
      </button>
    </div>
  </div>
)}
```

Where `handleSaveOverride`:

```typescript
async function handleSaveOverride() {
  if (overrideScore === null) return;
  await fetch(`/api/exercises/${exercise.id}/form-score`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ score: overrideScore }),
  });
  // Refresh exercise data
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/exercises/ src/components/exercises/exercise-detail.tsx
git commit -m "feat: add form score override API and exercise detail display"
```

---

### Task 22: Update Upload Flow

**Files:**
- Modify: `src/app/(public)/upload/page.tsx`
- Modify: `src/hooks/use-upload.ts`

- [ ] **Step 1: Update useUpload hook to accept clientId**

In `src/hooks/use-upload.ts`, change the `upload` function signature from:
```typescript
upload: (file: File, clientName?: string, sessionDate?: string) => Promise<string>
```
to:
```typescript
upload: (file: File, clientId?: string, sessionDate?: string) => Promise<string>
```

Update the `POST /api/upload/init` fetch call body to send `clientId` instead of `clientName`.

- [ ] **Step 2: Update upload init API to accept clientId**

In `src/app/api/upload/init/route.ts`, change the request body parsing from `clientName` to `clientId`. Pass `clientId` through to the upload session metadata.

- [ ] **Step 3: Update upload complete API to set clientId on session**

In `src/app/api/upload/complete/route.ts`, when creating the session DB record, set `clientId` from the upload session metadata instead of `clientName`.

- [ ] **Step 4: Replace clientName input with client selector in upload page**

In `src/app/(public)/upload/page.tsx`, replace the free-text `clientName` input with a `<select>` dropdown that fetches clients from `/api/clients`. Pass the selected `clientId` to `upload(selectedFile, clientId, sessionDate)`.

```tsx
// Add to component state
const [clients, setClients] = useState<Array<{id: string, name: string}>>([]);
const [selectedClientId, setSelectedClientId] = useState("");

// Fetch clients on mount
useEffect(() => {
  fetch("/api/clients").then(r => r.json()).then(d => setClients(d.clients || []));
}, []);

// Replace clientName input with:
<select
  value={selectedClientId}
  onChange={(e) => setSelectedClientId(e.target.value)}
  required
  className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
>
  <option value="">Select client...</option>
  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
</select>
```

- [ ] **Step 5: Update record page the same way**

Apply the same changes to `src/app/(public)/record/page.tsx` — replace the `clientName` text input with the client selector dropdown, and pass `clientId` to the upload hook.

- [ ] **Step 6: Verify both upload and record flows work**

Run: `npm run dev`

Navigate to `/upload` and `/record`, verify the client dropdown appears and flows work correctly.

- [ ] **Step 7: Commit**

```bash
git add src/app/(public)/upload/ src/app/(public)/record/ src/hooks/use-upload.ts src/app/api/upload/
git commit -m "feat: replace clientName with client selector in upload and record flows"
```

---

### Task 23: Session Detail Data Scoping

**Files:**
- Modify: `src/app/api/sessions/[sessionId]/route.ts`

- [ ] **Step 1: Add auth check to session detail API**

In `src/app/api/sessions/[sessionId]/route.ts`, add `validateSession()` check. If the user is a client, verify that `session.clientId` matches the requested session's `clientId`. Return 404 if the client tries to access another client's session.

```typescript
import { validateSession } from "@/lib/auth/session";

// Inside GET handler, after fetching the session:
const authSession = await validateSession();
if (!authSession) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
if (authSession.role === "client" && session.clientId !== authSession.clientId) {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/sessions/
git commit -m "feat: add data scoping to session detail API"
```

---

### Task 24: Environment Setup + Final Verification

- [ ] **Step 1: Add new environment variables to Railway**

Add to Railway dashboard:
- `TRAINER_EMAIL` — your email address
- `RESEND_API_KEY` — from Resend dashboard
- `NEXT_PUBLIC_APP_URL` — your Railway deployment URL

- [ ] **Step 2: Add .superpowers/ to .gitignore**

```bash
echo ".superpowers/" >> .gitignore
```

- [ ] **Step 3: Full build and smoke test**

Run: `npm run build && npm run dev`

Verify:
- `/login` shows the login page
- Magic link flow works (with Resend test mode or real email)
- `/dashboard` shows overview with sidebar
- `/dashboard/volume`, `/dashboard/form`, `/dashboard/balance`, `/dashboard/sessions`, `/dashboard/notes` all load
- `/trainer/clients` shows client roster (trainer only)
- Mobile layout shows bottom tab bar
- Existing pages (`/sessions`, `/library`) still work

- [ ] **Step 4: Commit any remaining changes**

```bash
git add .gitignore
git commit -m "chore: add .superpowers to gitignore and finalize environment setup"
```

- [ ] **Step 5: Push to deploy**

```bash
git push origin master
```

Railway auto-deploys on push to master.
