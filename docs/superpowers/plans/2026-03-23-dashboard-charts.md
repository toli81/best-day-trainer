# Phase 2: Dashboard + Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the homepage with a multi-client analytics dashboard featuring 6 pages (Overview, Volume, Form, Balance, Sessions, Notes), add form scoring to the AI pipeline, and install Recharts for charting.

**Architecture:** Next.js route groups split the app into `(dashboard)` (new top nav + tab bar layout) and `(legacy)` (existing header layout). Dashboard pages fetch data from 6 new API routes that aggregate existing session/exercise data. Form scoring extends the Claude pipeline with a new `form_scored` stage.

**Tech Stack:** Next.js 16, React 19, TypeScript, Recharts, shadcn/ui, Drizzle ORM (SQLite), Anthropic Claude API

**Spec:** `docs/superpowers/specs/2026-03-23-dashboard-charts-design.md`

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `src/app/(dashboard)/layout.tsx` | Dashboard shell: top nav + tab bar (desktop) / bottom nav (mobile) |
| `src/app/(dashboard)/page.tsx` | Overview page: KPI cards + trend chart + recent sessions |
| `src/app/(dashboard)/volume/page.tsx` | Volume page: bar chart + filters |
| `src/app/(dashboard)/form/page.tsx` | Form page: line chart + filters |
| `src/app/(dashboard)/balance/page.tsx` | Balance page: donut chart |
| `src/app/(dashboard)/sessions/page.tsx` | Sessions page: heatmap + session list |
| `src/app/(dashboard)/notes/page.tsx` | Notes page: chronological notes feed |
| `src/app/(legacy)/layout.tsx` | Existing Header + constrained main wrapper |
| `src/app/api/dashboard/stats/route.ts` | KPI stats endpoint |
| `src/app/api/dashboard/volume/route.ts` | Volume chart data endpoint |
| `src/app/api/dashboard/form/route.ts` | Form score chart data endpoint |
| `src/app/api/dashboard/balance/route.ts` | Muscle group distribution endpoint |
| `src/app/api/dashboard/sessions/route.ts` | Session heatmap + list endpoint |
| `src/app/api/dashboard/notes/route.ts` | Notes feed endpoint |
| `src/app/api/exercises/[exerciseId]/form-score/route.ts` | Form score override PATCH endpoint |
| `src/app/api/admin/backfill-form-scores/route.ts` | One-time backfill endpoint |
| `src/components/dashboard/top-nav.tsx` | Top navigation bar |
| `src/components/dashboard/tab-bar.tsx` | Desktop horizontal tab bar |
| `src/components/dashboard/mobile-nav.tsx` | Mobile bottom tab bar + More sheet |
| `src/components/dashboard/stat-card.tsx` | KPI stat card component |
| `src/components/dashboard/time-range-selector.tsx` | 7d/30d/90d/All pill selector |
| `src/components/dashboard/overview-chart.tsx` | Combined area chart (volume + form) |
| `src/components/dashboard/volume-chart.tsx` | Volume bar chart |
| `src/components/dashboard/form-chart.tsx` | Form scores line chart |
| `src/components/dashboard/balance-chart.tsx` | Muscle group donut chart |
| `src/components/dashboard/session-heatmap.tsx` | Calendar heatmap grid |
| `src/components/dashboard/session-list.tsx` | Session cards list |
| `src/components/dashboard/notes-feed.tsx` | Chronological notes feed |
| `src/components/dashboard/empty-state.tsx` | Friendly empty state message |
| `src/components/dashboard/client-filter.tsx` | Client selector dropdown for dashboard |
| `src/lib/claude/form-scoring.ts` | Claude form scoring function |
| `src/lib/db/dashboard-queries.ts` | All dashboard aggregation queries |

### Modified Files

| File | Change |
|------|--------|
| `src/app/layout.tsx` | Strip `<Header />` and constrained `<main>`, keep minimal html/body/ThemeProvider |
| `src/lib/processing/pipeline.ts:28-37` | Insert `form_scored` into STAGE_ORDER, add Stage 8 logic |
| `src/lib/processing/pipeline.ts:352-357` | Renumber Stage 8 → Stage 9 (complete) |
| `src/app/sessions/[sessionId]/page.tsx` | Add inline form score display + override UI |
| `package.json` | Add `recharts` dependency |

### Moved Files (into route groups)

| From | To |
|------|-----|
| `src/app/page.tsx` | Deleted (replaced by `(dashboard)/page.tsx`) |
| `src/app/sessions/page.tsx` | Deleted (replaced by `(dashboard)/sessions/page.tsx`) |
| `src/app/record/` | `src/app/(legacy)/record/` |
| `src/app/upload/` | `src/app/(legacy)/upload/` |
| `src/app/library/` | `src/app/(legacy)/library/` |
| `src/app/sessions/[sessionId]/` | `src/app/(legacy)/sessions/[sessionId]/` |

---

## Task 1: Install Recharts and Scaffold Route Groups

**Files:**
- Modify: `package.json`
- Modify: `src/app/layout.tsx`
- Create: `src/app/(legacy)/layout.tsx`
- Move: existing pages into `(legacy)/`

- [ ] **Step 1: Install recharts**

```bash
cd /c/Users/chris/Desktop/AI/New\ Version/best-day-trainer
npm install recharts
```

- [ ] **Step 2: Slim down root layout**

Edit `src/app/layout.tsx` — remove `<Header />` import and the `<main>` wrapper. Keep html/body/ThemeProvider only:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Best Day Fitness — Session Notes",
  description: "AI-powered personal training session analysis by Best Day Fitness",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme:dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}})()`,
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Create `(legacy)/layout.tsx`**

Create `src/app/(legacy)/layout.tsx` — wraps children with the existing Header + constrained main:

```tsx
import { Header } from "@/components/layout/header";

export default function LegacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </>
  );
}
```

- [ ] **Step 4: Move existing pages into `(legacy)/`**

```bash
cd /c/Users/chris/Desktop/AI/New\ Version/best-day-trainer/src/app
mkdir -p "(legacy)"
mv record "(legacy)/record"
mv upload "(legacy)/upload"
mv library "(legacy)/library"
mkdir -p "(legacy)/sessions"
mv sessions/\[sessionId\] "(legacy)/sessions/[sessionId]"
```

- [ ] **Step 5: Delete old homepage and sessions list**

```bash
rm src/app/page.tsx
rm src/app/sessions/page.tsx
rmdir src/app/sessions 2>/dev/null || true
```

- [ ] **Step 6: Verify build**

```bash
npm run build
```

Expected: Build succeeds. Existing pages (`/record`, `/upload`, `/library`, `/sessions/[id]`) still work with the Header layout. Homepage (`/`) returns 404 (expected — dashboard not created yet).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "refactor: split app into (dashboard) and (legacy) route groups"
```

---

## Task 2: Dashboard Layout Shell (Top Nav + Tab Bar + Mobile Nav)

**Files:**
- Create: `src/components/dashboard/top-nav.tsx`
- Create: `src/components/dashboard/tab-bar.tsx`
- Create: `src/components/dashboard/mobile-nav.tsx`
- Create: `src/components/dashboard/client-filter.tsx`
- Create: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Create empty-state component**

Create `src/components/dashboard/empty-state.tsx`:

```tsx
interface EmptyStateProps {
  message?: string;
}

export function EmptyState({ message = "No data available." }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
          <path d="M3 3v18h18" />
          <path d="m19 9-5 5-4-4-3 3" />
        </svg>
      </div>
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}
```

- [ ] **Step 2: Create client-filter component**

Create `src/components/dashboard/client-filter.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface Client {
  id: string;
  name: string;
}

export function ClientFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const currentClient = searchParams.get("client") || "all";

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data) => setClients(data))
      .catch(() => {});
  }, []);

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete("client");
    } else {
      params.set("client", value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      value={currentClient}
      onChange={(e) => handleChange(e.target.value)}
      className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
    >
      <option value="all">All Clients</option>
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 3: Create time-range-selector component**

Create `src/components/dashboard/time-range-selector.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ranges = ["7d", "30d", "90d", "all"] as const;
type Range = (typeof ranges)[number];

export function TimeRangeSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentRange = (searchParams.get("range") as Range) || "30d";

  function handleChange(range: Range) {
    const params = new URLSearchParams(searchParams.toString());
    if (range === "30d") {
      params.delete("range");
    } else {
      params.set("range", range);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex gap-1">
      {ranges.map((range) => (
        <button
          key={range}
          onClick={() => handleChange(range)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            currentRange === range
              ? "bg-[#00CCFF] text-white"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          {range === "all" ? "All" : range.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create top-nav component**

Create `src/components/dashboard/top-nav.tsx`:

```tsx
import Link from "next/link";
import Image from "next/image";
import { ClientFilter } from "./client-filter";
import { ThemeToggle } from "./theme-toggle";

export function TopNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-[#1a2d45] bg-[#111F32]">
      <div className="flex h-14 items-center px-4 md:px-6">
        <Link href="/" className="mr-4 flex items-center gap-2.5">
          <Image src="/logo.png" alt="Best Day Fitness" width={32} height={32} className="h-8 w-8" />
          <span className="text-lg font-semibold text-white">Best Day</span>
        </Link>
        <div className="hidden md:block">
          <ClientFilter />
        </div>
        <nav className="ml-auto hidden items-center gap-1 md:flex">
          <Link href="/record" className="rounded-lg px-3 py-1.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white">
            Record
          </Link>
          <Link href="/upload" className="rounded-lg px-3 py-1.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white">
            Upload
          </Link>
          <Link href="/library" className="rounded-lg px-3 py-1.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white">
            Library
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Create theme-toggle component**

Create `src/components/dashboard/theme-toggle.tsx` — extracted from the existing header:

```tsx
"use client";

import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="rounded-lg p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      aria-label="Toggle dark mode"
    >
      {theme === "dark" ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
```

- [ ] **Step 6: Create tab-bar component**

Create `src/components/dashboard/tab-bar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "Overview" },
  { href: "/volume", label: "Volume" },
  { href: "/form", label: "Form" },
  { href: "/balance", label: "Balance" },
  { href: "/sessions", label: "Sessions" },
  { href: "/notes", label: "Notes" },
];

export function TabBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const clientParam = searchParams.get("client");
  const qs = clientParam ? `?client=${clientParam}` : "";

  return (
    <div className="hidden border-b border-[#1a2d45] bg-[#111F32] md:block">
      <nav className="flex gap-0 px-4 md:px-6">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={`${tab.href}${qs}`}
              className={cn(
                "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-[#00CCFF] text-[#00CCFF]"
                  : "border-transparent text-white/60 hover:text-white/80"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
```

- [ ] **Step 7: Create mobile-nav component**

Create `src/components/dashboard/mobile-nav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

const mainTabs = [
  { href: "/", label: "Overview", icon: "📊" },
  { href: "/volume", label: "Volume", icon: "💪" },
  { href: "/form", label: "Form", icon: "✅" },
  { href: "/balance", label: "Balance", icon: "⚖️" },
  { href: "/sessions", label: "Sessions", icon: "📅" },
];

const moreTabs = [
  { href: "/notes", label: "Notes", icon: "📝" },
  { href: "/record", label: "Record", icon: "🎥" },
  { href: "/upload", label: "Upload", icon: "📤" },
  { href: "/library", label: "Library", icon: "📚" },
];

export function MobileNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showMore, setShowMore] = useState(false);
  const clientParam = searchParams.get("client");
  const qs = clientParam ? `?client=${clientParam}` : "";

  return (
    <>
      {/* More sheet overlay */}
      {showMore && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setShowMore(false)}>
          <div
            className="absolute bottom-16 left-0 right-0 rounded-t-2xl border-t border-border bg-card p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 text-sm font-medium text-muted-foreground">More</div>
            <div className="grid grid-cols-4 gap-3">
              {moreTabs.map((tab) => (
                <Link
                  key={tab.href}
                  href={`${tab.href}${qs}`}
                  onClick={() => setShowMore(false)}
                  className="flex flex-col items-center gap-1 rounded-lg p-2 text-foreground hover:bg-muted"
                >
                  <span className="text-xl">{tab.icon}</span>
                  <span className="text-xs">{tab.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card md:hidden">
        <div className="flex items-center justify-around py-1">
          {mainTabs.map((tab) => {
            const isActive = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={`${tab.href}${qs}`}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-2 py-1.5",
                  isActive ? "text-[#00CCFF]" : "text-muted-foreground"
                )}
              >
                <span className="text-lg">{tab.icon}</span>
                <span className="text-[10px] font-medium">{tab.label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setShowMore(!showMore)}
            className={cn(
              "flex flex-col items-center gap-0.5 px-2 py-1.5",
              showMore ? "text-[#00CCFF]" : "text-muted-foreground"
            )}
          >
            <span className="text-lg">•••</span>
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
```

- [ ] **Step 8: Create dashboard layout**

Create `src/app/(dashboard)/layout.tsx`:

```tsx
import { Suspense } from "react";
import { TopNav } from "@/components/dashboard/top-nav";
import { TabBar } from "@/components/dashboard/tab-bar";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { ClientFilter } from "@/components/dashboard/client-filter";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense>
      <TopNav />
      <TabBar />
      {/* Mobile client filter */}
      <div className="border-b border-border px-4 py-2 md:hidden">
        <ClientFilter />
      </div>
      <main className="px-4 py-6 pb-20 md:px-6 md:pb-6">{children}</main>
      <MobileNav />
    </Suspense>
  );
}
```

- [ ] **Step 9: Create placeholder Overview page**

Create `src/app/(dashboard)/page.tsx`:

```tsx
export const dynamic = "force-dynamic";

export default function OverviewPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">Overview</h1>
      <p className="text-muted-foreground">Dashboard coming soon.</p>
    </div>
  );
}
```

- [ ] **Step 10: Verify build and test navigation**

```bash
npm run build
```

Expected: Build succeeds. `/` shows placeholder overview with top nav + tab bar. `/record`, `/upload`, `/library` show the existing header layout. Mobile bottom nav renders on narrow viewports.

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "feat: add dashboard layout shell with top nav, tab bar, and mobile nav"
```

---

## Task 3: Dashboard Aggregation Queries

**Files:**
- Create: `src/lib/db/dashboard-queries.ts`

All dashboard data comes from these queries. Build them before the API routes.

- [ ] **Step 1: Create dashboard-queries.ts**

Create `src/lib/db/dashboard-queries.ts` with all aggregation functions. Each function accepts `clientId: string | null` (null = all) and `range: string` (7d/30d/90d/all).

```tsx
import { db } from "./index";
import { sessions, exercises, clients } from "./schema";
import { eq, and, gte, sql, desc } from "drizzle-orm";

function getDateCutoff(range: string): string | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function buildSessionConditions(clientId: string | null, range: string) {
  const conditions = [eq(sessions.status, "complete")];
  if (clientId) conditions.push(eq(sessions.clientId, clientId));
  const cutoff = getDateCutoff(range);
  if (cutoff) conditions.push(gte(sessions.recordedAt, cutoff));
  return and(...conditions);
}

export function getStats(clientId: string | null, range: string) {
  const where = buildSessionConditions(clientId, range);

  const sessionCount = db
    .select({ count: sql<number>`count(*)` })
    .from(sessions)
    .where(where)
    .get();

  // Week delta: sessions this week
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekConditions = [eq(sessions.status, "complete"), gte(sessions.recordedAt, weekAgo.toISOString())];
  if (clientId) weekConditions.push(eq(sessions.clientId, clientId));
  const weekCount = db
    .select({ count: sql<number>`count(*)` })
    .from(sessions)
    .where(and(...weekConditions))
    .get();

  // Consistency: distinct weeks with sessions / total weeks in range
  const cutoff = getDateCutoff(range);
  const consistencyConditions = [eq(sessions.status, "complete")];
  if (clientId) consistencyConditions.push(eq(sessions.clientId, clientId));
  if (cutoff) consistencyConditions.push(gte(sessions.recordedAt, cutoff));

  const weeklyData = db
    .select({ week: sql<string>`strftime('%Y-%W', ${sessions.recordedAt})` })
    .from(sessions)
    .where(and(...consistencyConditions))
    .groupBy(sql`strftime('%Y-%W', ${sessions.recordedAt})`)
    .all();

  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : null;
  const totalWeeks = days ? Math.max(1, Math.ceil(days / 7)) : weeklyData.length || 1;
  const activeWeeks = weeklyData.length;
  const consistencyPercent = Math.round((activeWeeks / totalWeeks) * 100);

  // Volume: total reps
  const volumeResult = db
    .select({ total: sql<number>`coalesce(sum(${exercises.repCount}), 0)` })
    .from(exercises)
    .innerJoin(sessions, eq(exercises.sessionId, sessions.id))
    .where(where)
    .get();

  // Volume change: compare to prior equivalent period
  let volumeChange = 0;
  if (days) {
    const priorStart = new Date();
    priorStart.setDate(priorStart.getDate() - days * 2);
    const priorEnd = new Date();
    priorEnd.setDate(priorEnd.getDate() - days);
    const priorConditions = [
      eq(sessions.status, "complete"),
      gte(sessions.recordedAt, priorStart.toISOString()),
      sql`${sessions.recordedAt} < ${priorEnd.toISOString()}`,
    ];
    if (clientId) priorConditions.push(eq(sessions.clientId, clientId));
    const priorVolume = db
      .select({ total: sql<number>`coalesce(sum(${exercises.repCount}), 0)` })
      .from(exercises)
      .innerJoin(sessions, eq(exercises.sessionId, sessions.id))
      .where(and(...priorConditions))
      .get();
    const current = volumeResult?.total || 0;
    const prior = priorVolume?.total || 0;
    volumeChange = prior > 0 ? Math.round(((current - prior) / prior) * 100) : 0;
  }

  // Avg form score
  const formResult = db
    .select({
      avg: sql<number>`coalesce(avg(coalesce(${exercises.formScoreOverride}, ${exercises.formScore})), 0)`,
    })
    .from(exercises)
    .innerJoin(sessions, eq(exercises.sessionId, sessions.id))
    .where(and(where!, sql`coalesce(${exercises.formScoreOverride}, ${exercises.formScore}) is not null`))
    .get();

  // Form trend: compare current avg to prior period
  let formTrend: "up" | "down" | "flat" = "flat";
  if (days) {
    const priorStart = new Date();
    priorStart.setDate(priorStart.getDate() - days * 2);
    const priorEnd = new Date();
    priorEnd.setDate(priorEnd.getDate() - days);
    const priorFormConditions = [
      eq(sessions.status, "complete"),
      gte(sessions.recordedAt, priorStart.toISOString()),
      sql`${sessions.recordedAt} < ${priorEnd.toISOString()}`,
      sql`coalesce(${exercises.formScoreOverride}, ${exercises.formScore}) is not null`,
    ];
    if (clientId) priorFormConditions.push(eq(sessions.clientId, clientId));
    const priorForm = db
      .select({ avg: sql<number>`coalesce(avg(coalesce(${exercises.formScoreOverride}, ${exercises.formScore})), 0)` })
      .from(exercises)
      .innerJoin(sessions, eq(exercises.sessionId, sessions.id))
      .where(and(...priorFormConditions))
      .get();
    const diff = (formResult?.avg || 0) - (priorForm?.avg || 0);
    formTrend = diff > 0.5 ? "up" : diff < -0.5 ? "down" : "flat";
  }

  return {
    totalSessions: sessionCount?.count || 0,
    weekDelta: weekCount?.count || 0,
    consistencyPercent,
    isShortRange: range === "7d",
    weeklyFrequency: activeWeeks > 0 ? `${Math.round((sessionCount?.count || 0) / activeWeeks)}x/week` : "0x/week",
    monthlyVolume: volumeResult?.total || 0,
    volumeChange,
    avgFormScore: Math.round((formResult?.avg || 0) * 10) / 10,
    formTrend,
  };
}

export function getVolumeData(clientId: string | null, range: string, muscleGroup?: string, exercise?: string) {
  const where = buildSessionConditions(clientId, range);
  const conditions = [where!];
  if (muscleGroup) conditions.push(sql`${exercises.muscleGroups} like ${"%" + muscleGroup + "%"}`);
  if (exercise) conditions.push(eq(exercises.name, exercise));

  return db
    .select({
      date: sql<string>`date(${sessions.recordedAt})`.as("date"),
      reps: sql<number>`coalesce(sum(${exercises.repCount}), 0)`.as("reps"),
      sets: sql<number>`coalesce(sum(${exercises.setCount}), 0)`.as("sets"),
    })
    .from(exercises)
    .innerJoin(sessions, eq(exercises.sessionId, sessions.id))
    .where(and(...conditions))
    .groupBy(sql`date(${sessions.recordedAt})`)
    .orderBy(sql`date(${sessions.recordedAt})`)
    .all();
}

export function getFormData(clientId: string | null, range: string, exercise?: string) {
  const where = buildSessionConditions(clientId, range);
  const conditions = [where!, sql`coalesce(${exercises.formScoreOverride}, ${exercises.formScore}) is not null`];
  if (exercise) conditions.push(eq(exercises.name, exercise));

  return db
    .select({
      date: sql<string>`date(${sessions.recordedAt})`.as("date"),
      exerciseName: exercises.name,
      score: sql<number>`coalesce(${exercises.formScoreOverride}, ${exercises.formScore})`.as("score"),
      isOverride: sql<boolean>`${exercises.formScoreOverride} is not null`.as("isOverride"),
    })
    .from(exercises)
    .innerJoin(sessions, eq(exercises.sessionId, sessions.id))
    .where(and(...conditions))
    .orderBy(sql`date(${sessions.recordedAt})`)
    .all();
}

export function getBalanceData(clientId: string | null, range: string) {
  const where = buildSessionConditions(clientId, range);

  const rows = db
    .select({
      muscleGroups: exercises.muscleGroups,
      reps: exercises.repCount,
    })
    .from(exercises)
    .innerJoin(sessions, eq(exercises.sessionId, sessions.id))
    .where(and(where!, sql`${exercises.muscleGroups} is not null`))
    .all();

  // Aggregate by muscle group
  const totals: Record<string, number> = {};
  let grandTotal = 0;
  for (const row of rows) {
    const groups: string[] = JSON.parse(row.muscleGroups || "[]");
    const reps = row.reps || 1;
    for (const g of groups) {
      totals[g] = (totals[g] || 0) + reps;
      grandTotal += reps;
    }
  }

  return Object.entries(totals)
    .map(([muscleGroup, totalReps]) => ({
      muscleGroup,
      totalReps,
      percentage: grandTotal > 0 ? Math.round((totalReps / grandTotal) * 100) : 0,
    }))
    .sort((a, b) => b.totalReps - a.totalReps);
}

export function getSessionsData(clientId: string | null, range: string) {
  const where = buildSessionConditions(clientId, range);

  // Heatmap: count per day
  const heatmap = db
    .select({
      date: sql<string>`date(${sessions.recordedAt})`.as("date"),
      count: sql<number>`count(*)`.as("count"),
    })
    .from(sessions)
    .where(where)
    .groupBy(sql`date(${sessions.recordedAt})`)
    .orderBy(sql`date(${sessions.recordedAt})`)
    .all();

  // Session list with exercise counts
  const sessionList = db
    .select({
      id: sessions.id,
      title: sessions.title,
      clientId: sessions.clientId,
      clientName: sessions.clientName,
      date: sessions.recordedAt,
      duration: sessions.durationSeconds,
      exerciseCount: sql<number>`count(${exercises.id})`.as("exerciseCount"),
      status: sessions.status,
    })
    .from(sessions)
    .leftJoin(exercises, eq(exercises.sessionId, sessions.id))
    .where(where)
    .groupBy(sessions.id)
    .orderBy(desc(sessions.recordedAt))
    .all();

  return { heatmap, sessions: sessionList };
}

export function getNotesData(clientId: string | null, range: string) {
  const where = buildSessionConditions(clientId, range);

  return db
    .select({
      sessionId: sessions.id,
      title: sessions.title,
      clientId: sessions.clientId,
      clientName: sessions.clientName,
      date: sessions.recordedAt,
      sessionNotes: sessions.sessionNotes,
    })
    .from(sessions)
    .where(and(where!, sql`${sessions.sessionNotes} is not null`))
    .orderBy(desc(sessions.recordedAt))
    .all();
}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/dashboard-queries.ts && git commit -m "feat: add dashboard aggregation queries"
```

---

## Task 4: Dashboard API Routes

**Files:**
- Create: `src/app/api/dashboard/stats/route.ts`
- Create: `src/app/api/dashboard/volume/route.ts`
- Create: `src/app/api/dashboard/form/route.ts`
- Create: `src/app/api/dashboard/balance/route.ts`
- Create: `src/app/api/dashboard/sessions/route.ts`
- Create: `src/app/api/dashboard/notes/route.ts`

All routes follow the same pattern: parse query params, call dashboard query, return JSON.

- [ ] **Step 1: Create stats route**

Create `src/app/api/dashboard/stats/route.ts`:

```tsx
import { NextRequest, NextResponse } from "next/server";
import { getStats } from "@/lib/db/dashboard-queries";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const client = params.get("client") || "all";
  const range = params.get("range") || "30d";
  const clientId = client === "all" ? null : client;

  const stats = getStats(clientId, range);
  return NextResponse.json(stats);
}
```

- [ ] **Step 2: Create volume route**

Create `src/app/api/dashboard/volume/route.ts`:

```tsx
import { NextRequest, NextResponse } from "next/server";
import { getVolumeData } from "@/lib/db/dashboard-queries";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const client = params.get("client") || "all";
  const range = params.get("range") || "30d";
  const muscleGroup = params.get("muscleGroup") || undefined;
  const exercise = params.get("exercise") || undefined;
  const clientId = client === "all" ? null : client;

  const data = getVolumeData(clientId, range, muscleGroup, exercise);
  return NextResponse.json(data);
}
```

- [ ] **Step 3: Create form route**

Create `src/app/api/dashboard/form/route.ts`:

```tsx
import { NextRequest, NextResponse } from "next/server";
import { getFormData } from "@/lib/db/dashboard-queries";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const client = params.get("client") || "all";
  const range = params.get("range") || "30d";
  const exercise = params.get("exercise") || undefined;
  const clientId = client === "all" ? null : client;

  const data = getFormData(clientId, range, exercise);
  return NextResponse.json(data);
}
```

- [ ] **Step 4: Create balance route**

Create `src/app/api/dashboard/balance/route.ts`:

```tsx
import { NextRequest, NextResponse } from "next/server";
import { getBalanceData } from "@/lib/db/dashboard-queries";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const client = params.get("client") || "all";
  const range = params.get("range") || "30d";
  const clientId = client === "all" ? null : client;

  const data = getBalanceData(clientId, range);
  return NextResponse.json(data);
}
```

- [ ] **Step 5: Create sessions route**

Create `src/app/api/dashboard/sessions/route.ts`:

```tsx
import { NextRequest, NextResponse } from "next/server";
import { getSessionsData } from "@/lib/db/dashboard-queries";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const client = params.get("client") || "all";
  const range = params.get("range") || "30d";
  const clientId = client === "all" ? null : client;

  const data = getSessionsData(clientId, range);
  return NextResponse.json(data);
}
```

- [ ] **Step 6: Create notes route**

Create `src/app/api/dashboard/notes/route.ts`:

```tsx
import { NextRequest, NextResponse } from "next/server";
import { getNotesData } from "@/lib/db/dashboard-queries";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const client = params.get("client") || "all";
  const range = params.get("range") || "30d";
  const clientId = client === "all" ? null : client;

  const data = getNotesData(clientId, range);
  return NextResponse.json(data);
}
```

- [ ] **Step 7: Verify build**

```bash
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add src/app/api/dashboard/ && git commit -m "feat: add 6 dashboard API routes"
```

---

## Task 5: Stat Card Component and Overview Page

**Files:**
- Create: `src/components/dashboard/stat-card.tsx`
- Create: `src/components/dashboard/overview-chart.tsx`
- Create: `src/components/dashboard/session-list.tsx`
- Modify: `src/app/(dashboard)/page.tsx`

- [ ] **Step 1: Create stat-card component**

Create `src/components/dashboard/stat-card.tsx`:

```tsx
import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: string | number;
  delta?: string;
  trend?: "up" | "down" | "flat";
}

export function StatCard({ label, value, delta, trend }: StatCardProps) {
  const trendColor = trend === "up" ? "text-green-500" : trend === "down" ? "text-red-500" : "text-muted-foreground";
  const trendArrow = trend === "up" ? "↑" : trend === "down" ? "↓" : "";

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
        {delta && (
          <p className={`mt-1 text-xs ${trendColor}`}>
            {trendArrow} {delta}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create overview-chart component**

Create `src/components/dashboard/overview-chart.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "./empty-state";

interface DataPoint {
  date: string;
  reps: number;
  sets: number;
}

export function OverviewChart({ client, range }: { client: string; range: string }) {
  const [volumeData, setVolumeData] = useState<DataPoint[]>([]);
  const [formData, setFormData] = useState<{ date: string; score: number }[]>([]);

  useEffect(() => {
    fetch(`/api/dashboard/volume?client=${client}&range=${range}`)
      .then((r) => r.json())
      .then(setVolumeData)
      .catch(() => {});
    fetch(`/api/dashboard/form?client=${client}&range=${range}`)
      .then((r) => r.json())
      .then((data: { date: string; score: number }[]) => {
        // Average scores per date
        const byDate: Record<string, number[]> = {};
        for (const d of data) {
          if (!byDate[d.date]) byDate[d.date] = [];
          byDate[d.date].push(d.score);
        }
        setFormData(
          Object.entries(byDate).map(([date, scores]) => ({
            date,
            score: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
          }))
        );
      })
      .catch(() => {});
  }, [client, range]);

  if (volumeData.length === 0) return <EmptyState message="No volume data in this time range." />;

  // Merge volume and form data by date
  const merged = volumeData.map((v) => {
    const f = formData.find((fd) => fd.date === v.date);
    return { ...v, formScore: f?.score ?? null };
  });

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Volume & Form Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={merged}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis yAxisId="right" orientation="right" domain={[0, 10]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  color: "hsl(var(--foreground))",
                }}
              />
              <Area yAxisId="left" type="monotone" dataKey="reps" stroke="#00CCFF" fill="#00CCFF" fillOpacity={0.2} name="Reps" />
              <Area yAxisId="right" type="monotone" dataKey="formScore" stroke="#07B492" fill="#07B492" fillOpacity={0.1} name="Form Score" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create session-list component**

Create `src/components/dashboard/session-list.tsx`:

```tsx
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/utils/timestamps";

const statusColors: Record<string, string> = {
  uploading: "bg-amber-500",
  uploaded: "bg-[#00CCFF]",
  analyzing: "bg-[#000075]",
  segmenting: "bg-[#000075]",
  generating_notes: "bg-[#000075]",
  complete: "bg-[#07B492]",
  error: "bg-red-500",
};

interface SessionItem {
  id: string;
  title: string | null;
  date: string;
  duration: number | null;
  exerciseCount: number;
  status: string;
  clientName?: string | null;
}

export function SessionList({ sessions }: { sessions: SessionItem[] }) {
  return (
    <div className="space-y-2">
      {sessions.map((s) => (
        <Link key={s.id} href={`/sessions/${s.id}`} className="block">
          <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/50">
            <div>
              <p className="font-medium text-foreground">{s.title || "Untitled Session"}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(s.date).toLocaleDateString()}
                {s.duration ? ` · ${formatDuration(s.duration)}` : ""}
                {` · ${s.exerciseCount} exercises`}
              </p>
            </div>
            <Badge variant="secondary" className={`${statusColors[s.status] || ""} text-white`}>
              {s.status}
            </Badge>
          </div>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Build the Overview page**

Replace `src/app/(dashboard)/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { StatCard } from "@/components/dashboard/stat-card";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
import { OverviewChart } from "@/components/dashboard/overview-chart";
import { SessionList } from "@/components/dashboard/session-list";
import { EmptyState } from "@/components/dashboard/empty-state";

interface Stats {
  totalSessions: number;
  weekDelta: number;
  consistencyPercent: number;
  isShortRange: boolean;
  weeklyFrequency: string;
  monthlyVolume: number;
  volumeChange: number;
  avgFormScore: number;
  formTrend: "up" | "down" | "flat";
}

interface SessionItem {
  id: string;
  title: string | null;
  date: string;
  duration: number | null;
  exerciseCount: number;
  status: string;
}

export default function OverviewPage() {
  const searchParams = useSearchParams();
  const client = searchParams.get("client") || "all";
  const range = searchParams.get("range") || "30d";
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentSessions, setRecentSessions] = useState<SessionItem[]>([]);

  useEffect(() => {
    fetch(`/api/dashboard/stats?client=${client}&range=${range}`)
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});

    fetch(`/api/dashboard/sessions?client=${client}&range=${range}`)
      .then((r) => r.json())
      .then((data) => setRecentSessions((data.sessions || []).slice(0, 5)))
      .catch(() => {});
  }, [client, range]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Overview</h1>
        <TimeRangeSelector />
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard
            label="Total Sessions"
            value={stats.totalSessions}
            delta={`${stats.weekDelta} this week`}
          />
          <StatCard
            label={stats.isShortRange ? "This Week" : "Consistency"}
            value={stats.isShortRange ? `${stats.weekDelta} sessions` : `${stats.consistencyPercent}%`}
            delta={stats.isShortRange ? undefined : stats.weeklyFrequency}
          />
          <StatCard
            label="Volume (reps)"
            value={stats.monthlyVolume.toLocaleString()}
            delta={stats.volumeChange !== 0 ? `${stats.volumeChange > 0 ? "+" : ""}${stats.volumeChange}%` : undefined}
            trend={stats.volumeChange > 0 ? "up" : stats.volumeChange < 0 ? "down" : "flat"}
          />
          <StatCard
            label="Avg Form Score"
            value={stats.avgFormScore || "—"}
            trend={stats.formTrend}
          />
        </div>
      )}

      <OverviewChart client={client} range={range} />

      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Recent Sessions</h2>
        {recentSessions.length > 0 ? (
          <SessionList sessions={recentSessions} />
        ) : (
          <EmptyState message="No sessions in this time range." />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify build**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add Overview page with KPI cards, trend chart, and recent sessions"
```

---

## Task 6: Volume, Form, Balance Pages

**Files:**
- Create: `src/components/dashboard/volume-chart.tsx`
- Create: `src/components/dashboard/form-chart.tsx`
- Create: `src/components/dashboard/balance-chart.tsx`
- Create: `src/app/(dashboard)/volume/page.tsx`
- Create: `src/app/(dashboard)/form/page.tsx`
- Create: `src/app/(dashboard)/balance/page.tsx`

- [ ] **Step 1: Create volume-chart**

Create `src/components/dashboard/volume-chart.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "./empty-state";

interface DataPoint { date: string; reps: number; sets: number }

export function VolumeChart({ client, range, muscleGroup, exercise }: {
  client: string; range: string; muscleGroup?: string; exercise?: string;
}) {
  const [data, setData] = useState<DataPoint[]>([]);

  useEffect(() => {
    const params = new URLSearchParams({ client, range });
    if (muscleGroup) params.set("muscleGroup", muscleGroup);
    if (exercise) params.set("exercise", exercise);
    fetch(`/api/dashboard/volume?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [client, range, muscleGroup, exercise]);

  if (data.length === 0) return <EmptyState message="No volume data in this time range." />;

  return (
    <Card className="border-border bg-card">
      <CardContent className="pt-6">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--foreground))" }} />
              <Bar dataKey="reps" fill="#00CCFF" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create form-chart**

Create `src/components/dashboard/form-chart.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "./empty-state";

interface DataPoint { date: string; exerciseName: string; score: number; isOverride: boolean }

const COLORS = ["#00CCFF", "#07B492", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export function FormChart({ client, range, exercise }: {
  client: string; range: string; exercise?: string;
}) {
  const [data, setData] = useState<DataPoint[]>([]);

  useEffect(() => {
    const params = new URLSearchParams({ client, range });
    if (exercise) params.set("exercise", exercise);
    fetch(`/api/dashboard/form?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [client, range, exercise]);

  if (data.length === 0) return <EmptyState message="No form score data yet. Form scores will appear after sessions are processed." />;

  // Group by exercise name for multi-line chart
  const exercises = [...new Set(data.map((d) => d.exerciseName))];
  const byDate: Record<string, Record<string, number>> = {};
  for (const d of data) {
    if (!byDate[d.date]) byDate[d.date] = {};
    byDate[d.date][d.exerciseName] = d.score;
  }
  const chartData = Object.entries(byDate).map(([date, scores]) => ({ date, ...scores }));

  return (
    <Card className="border-border bg-card">
      <CardContent className="pt-6">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--foreground))" }} />
              {exercises.slice(0, 6).map((name, i) => (
                <Line key={name} type="monotone" dataKey={name} stroke={COLORS[i % COLORS.length]} dot={{ r: 3 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create balance-chart**

Create `src/components/dashboard/balance-chart.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "./empty-state";

interface DataPoint { muscleGroup: string; totalReps: number; percentage: number }

const COLORS = ["#00CCFF", "#07B492", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#6366f1", "#14b8a6"];

export function BalanceChart({ client, range }: { client: string; range: string }) {
  const [data, setData] = useState<DataPoint[]>([]);

  useEffect(() => {
    fetch(`/api/dashboard/balance?client=${client}&range=${range}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [client, range]);

  if (data.length === 0) return <EmptyState message="No muscle group data in this time range." />;

  return (
    <Card className="border-border bg-card">
      <CardContent className="pt-6">
        <div className="flex flex-col items-center gap-4 md:flex-row">
          <div className="h-64 w-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="totalReps" nameKey="muscleGroup" cx="50%" cy="50%" innerRadius={60} outerRadius={100}>
                  {data.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--foreground))" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-2">
            {data.map((d, i) => (
              <div key={d.muscleGroup} className="flex items-center gap-2 text-sm">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-foreground">{d.muscleGroup}</span>
                <span className="text-muted-foreground">{d.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Create Volume page with filter dropdowns**

Create `src/app/(dashboard)/volume/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
import { VolumeChart } from "@/components/dashboard/volume-chart";

const MUSCLE_GROUPS = ["chest", "back", "shoulders", "biceps", "triceps", "quadriceps", "hamstrings", "glutes", "calves", "core", "forearms"];

export default function VolumePage() {
  const searchParams = useSearchParams();
  const client = searchParams.get("client") || "all";
  const range = searchParams.get("range") || "30d";
  const [muscleGroup, setMuscleGroup] = useState<string>("");
  const [exercise, setExercise] = useState<string>("");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Volume</h1>
        <TimeRangeSelector />
      </div>
      <div className="flex gap-3">
        <select
          value={muscleGroup}
          onChange={(e) => setMuscleGroup(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
        >
          <option value="">All Muscle Groups</option>
          {MUSCLE_GROUPS.map((g) => (
            <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>
          ))}
        </select>
        <input
          value={exercise}
          onChange={(e) => setExercise(e.target.value)}
          placeholder="Filter by exercise name..."
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
        />
      </div>
      <VolumeChart client={client} range={range} muscleGroup={muscleGroup || undefined} exercise={exercise || undefined} />
    </div>
  );
}
```

- [ ] **Step 5: Create Form page with exercise filter**

Create `src/app/(dashboard)/form/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
import { FormChart } from "@/components/dashboard/form-chart";

export default function FormPage() {
  const searchParams = useSearchParams();
  const client = searchParams.get("client") || "all";
  const range = searchParams.get("range") || "30d";
  const [exercise, setExercise] = useState<string>("");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Form Scores</h1>
        <TimeRangeSelector />
      </div>
      <div>
        <input
          value={exercise}
          onChange={(e) => setExercise(e.target.value)}
          placeholder="Filter by exercise name..."
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
        />
      </div>
      <FormChart client={client} range={range} exercise={exercise || undefined} />
    </div>
  );
}
```

- [ ] **Step 6: Create Balance page**

Create `src/app/(dashboard)/balance/page.tsx`:

```tsx
"use client";

import { useSearchParams } from "next/navigation";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
import { BalanceChart } from "@/components/dashboard/balance-chart";

export default function BalancePage() {
  const searchParams = useSearchParams();
  const client = searchParams.get("client") || "all";
  const range = searchParams.get("range") || "30d";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Muscle Balance</h1>
        <TimeRangeSelector />
      </div>
      <BalanceChart client={client} range={range} />
    </div>
  );
}
```

- [ ] **Step 7: Verify build**

```bash
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: add Volume, Form, and Balance dashboard pages with charts"
```

---

## Task 7: Sessions and Notes Pages

**Files:**
- Create: `src/components/dashboard/session-heatmap.tsx`
- Create: `src/components/dashboard/notes-feed.tsx`
- Create: `src/app/(dashboard)/sessions/page.tsx`
- Create: `src/app/(dashboard)/notes/page.tsx`

- [ ] **Step 1: Create session-heatmap**

Create `src/components/dashboard/session-heatmap.tsx`:

```tsx
"use client";

import { cn } from "@/lib/utils";

interface HeatmapDay { date: string; count: number }

export function SessionHeatmap({ data }: { data: HeatmapDay[] }) {
  if (data.length === 0) return null;

  const countMap = new Map(data.map((d) => [d.date, d.count]));
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  // Build last 90 days grid
  const days: { date: string; count: number }[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    days.push({ date: dateStr, count: countMap.get(dateStr) || 0 });
  }

  function intensity(count: number): string {
    if (count === 0) return "bg-muted";
    const ratio = count / maxCount;
    if (ratio <= 0.33) return "bg-[#00CCFF]/30";
    if (ratio <= 0.66) return "bg-[#00CCFF]/60";
    return "bg-[#00CCFF]";
  }

  return (
    <div className="flex flex-wrap gap-1">
      {days.map((day) => (
        <div
          key={day.date}
          title={`${day.date}: ${day.count} session${day.count !== 1 ? "s" : ""}`}
          className={cn("h-3 w-3 rounded-sm", intensity(day.count))}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create notes-feed**

Create `src/components/dashboard/notes-feed.tsx`:

```tsx
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

interface NoteItem {
  sessionId: string;
  title: string | null;
  date: string;
  notesPreview: string;
  clientName?: string | null;
}

export function NotesFeed({ notes }: { notes: NoteItem[] }) {
  return (
    <div className="space-y-3">
      {notes.map((note) => (
        <Link key={note.sessionId} href={`/sessions/${note.sessionId}`} className="block">
          <Card className="border-border bg-card transition-colors hover:bg-muted/50">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-foreground">{note.title || "Training Session"}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(note.date).toLocaleDateString()}
                    {note.clientName ? ` · ${note.clientName}` : ""}
                  </p>
                </div>
              </div>
              <p className="mt-2 line-clamp-3 text-sm text-secondary-foreground">{note.notesPreview}</p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create Sessions page**

Create `src/app/(dashboard)/sessions/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
import { SessionHeatmap } from "@/components/dashboard/session-heatmap";
import { SessionList } from "@/components/dashboard/session-list";
import { EmptyState } from "@/components/dashboard/empty-state";

export default function SessionsPage() {
  const searchParams = useSearchParams();
  const client = searchParams.get("client") || "all";
  const range = searchParams.get("range") || "90d";
  const [heatmap, setHeatmap] = useState<{ date: string; count: number }[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/api/dashboard/sessions?client=${client}&range=${range}`)
      .then((r) => r.json())
      .then((data) => {
        setHeatmap(data.heatmap || []);
        setSessions(data.sessions || []);
      })
      .catch(() => {});
  }, [client, range]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Sessions</h1>
        <TimeRangeSelector />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Training Frequency</h2>
        <SessionHeatmap data={heatmap} />
      </div>

      {sessions.length > 0 ? (
        <SessionList sessions={sessions} />
      ) : (
        <EmptyState message="No sessions in this time range." />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create Notes page**

Create `src/app/(dashboard)/notes/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
import { NotesFeed } from "@/components/dashboard/notes-feed";
import { EmptyState } from "@/components/dashboard/empty-state";

interface NoteItem {
  sessionId: string;
  title: string | null;
  date: string;
  sessionNotes: string | null;
  clientName?: string | null;
}

export default function NotesPage() {
  const searchParams = useSearchParams();
  const client = searchParams.get("client") || "all";
  const range = searchParams.get("range") || "30d";
  const [notes, setNotes] = useState<NoteItem[]>([]);

  useEffect(() => {
    fetch(`/api/dashboard/notes?client=${client}&range=${range}`)
      .then((r) => r.json())
      .then(setNotes)
      .catch(() => {});
  }, [client, range]);

  const feedItems = notes.map((n) => ({
    sessionId: n.sessionId,
    title: n.title,
    date: n.date,
    notesPreview: (n.sessionNotes || "").slice(0, 200),
    clientName: n.clientName,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Session Notes</h1>
        <TimeRangeSelector />
      </div>
      {feedItems.length > 0 ? (
        <NotesFeed notes={feedItems} />
      ) : (
        <EmptyState message="No session notes in this time range." />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify build**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add Sessions (heatmap + list) and Notes dashboard pages"
```

---

## Task 8: Form Scoring Pipeline + Backfill

**Files:**
- Create: `src/lib/claude/form-scoring.ts`
- Modify: `src/lib/processing/pipeline.ts:28-36` (STAGE_ORDER) and add Stage 8
- Create: `src/app/api/exercises/[exerciseId]/form-score/route.ts`
- Create: `src/app/api/admin/backfill-form-scores/route.ts`

- [ ] **Step 1: Create form-scoring.ts**

Create `src/lib/claude/form-scoring.ts`:

```tsx
import { claude, CLAUDE_MODEL } from "./client";
import type { Exercise } from "@/lib/db/schema";

interface FormScoreResult {
  exerciseId: string;
  score: number;
  justification: string;
}

export async function scoreExerciseForms(exercises: Exercise[]): Promise<FormScoreResult[]> {
  const scorable = exercises.filter((ex) => ex.formNotes || ex.coachingCues);
  if (scorable.length === 0) return [];

  const exerciseList = scorable
    .map(
      (ex) =>
        `- ID: ${ex.id} | Name: "${ex.name}" | Form notes: ${ex.formNotes || "None"} | Coaching cues: ${ex.coachingCues ? JSON.parse(ex.coachingCues).join("; ") : "None"}`
    )
    .join("\n");

  const message = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system: `You are an expert personal trainer scoring exercise form quality on a 1-10 scale.

Scoring rubric:
- 1-3: Significant form issues, risk of injury
- 4-6: Adequate but notable room for improvement
- 7-8: Good form with minor corrections
- 9-10: Excellent technique

Return a JSON array:
[{ "exerciseId": "the-id", "score": 7, "justification": "Brief reason" }]

Score every exercise provided. Be fair but honest. If form notes indicate no issues, score 7-8. Only give 9-10 for explicitly excellent form.`,
    messages: [
      {
        role: "user",
        content: `Score the form quality for these exercises:\n${exerciseList}`,
      },
    ],
  }, { timeout: 120_000 });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return [];

  try {
    const jsonMatch = textBlock.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    return JSON.parse(jsonMatch[0]) as FormScoreResult[];
  } catch {
    console.error("Failed to parse Claude form scoring response");
    return [];
  }
}
```

- [ ] **Step 2: Update pipeline STAGE_ORDER**

Edit `src/lib/processing/pipeline.ts`. Update the STAGE_ORDER array (line 28-37) to insert `form_scored`:

```typescript
const STAGE_ORDER = [
  "downloaded",
  "uploaded_to_gemini",
  "overview_complete",
  "clips_extracted",
  "details_complete",
  "notes_generated",
  "tags_generated",
  "form_scored",
  "complete",
] as const;
```

- [ ] **Step 3: Add form scoring stage to pipeline**

Edit `src/lib/processing/pipeline.ts`. Add import at top:

```typescript
import { scoreExerciseForms } from "@/lib/claude/form-scoring";
```

After the Stage 7 (tags_generated) block and before Stage 8 (complete), insert new stage:

```typescript
    // ─── Stage 8: Claude form scoring ───
    if (!stageReached(stage, "form_scored")) {
      console.log(`[${sessionId}] Stage 8: Scoring exercise forms...`);
      try {
        const fullSession = await getSession(sessionId);
        if (fullSession && fullSession.exercises.length > 0) {
          const scores = await scoreExerciseForms(fullSession.exercises);
          for (const s of scores) {
            await updateExercise(s.exerciseId, { formScore: s.score });
          }
          console.log(`[${sessionId}] Scored ${scores.length} exercises`);
        }
      } catch (err) {
        console.error("Failed to score exercise forms:", err);
      }

      await updateSessionStatus(sessionId, "generating_notes", {
        pipelineStage: "form_scored",
      });
    }

    // ─── Stage 9: Complete ───
```

Update the old "Stage 8: Complete" comment to "Stage 9: Complete".

- [ ] **Step 4: Create form-score override route**

Create `src/app/api/exercises/[exerciseId]/form-score/route.ts`:

```tsx
import { NextRequest, NextResponse } from "next/server";
import { updateExercise, getExercise } from "@/lib/db/queries";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ exerciseId: string }> }
) {
  const { exerciseId } = await params;
  const body = await req.json();
  const score = Number(body.score);

  if (!score || score < 1 || score > 10) {
    return NextResponse.json({ error: "Score must be 1-10" }, { status: 400 });
  }

  const exercise = await getExercise(exerciseId);
  if (!exercise) {
    return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  }

  const updated = await updateExercise(exerciseId, { formScoreOverride: score });
  return NextResponse.json(updated);
}
```

- [ ] **Step 5: Create backfill route**

Create `src/app/api/admin/backfill-form-scores/route.ts`:

```tsx
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sessions, exercises } from "@/lib/db/schema";
import { eq, and, isNull, isNotNull, sql } from "drizzle-orm";
import { scoreExerciseForms } from "@/lib/claude/form-scoring";
import { updateExercise } from "@/lib/db/queries";

export async function POST() {
  // Find completed sessions with exercises that have formNotes but no formScore
  const needsScoring = db
    .select({ sessionId: sessions.id })
    .from(sessions)
    .where(eq(sessions.status, "complete"))
    .innerJoin(
      exercises,
      and(
        eq(exercises.sessionId, sessions.id),
        isNotNull(exercises.formNotes),
        isNull(exercises.formScore)
      )
    )
    .groupBy(sessions.id)
    .all();

  let sessionsProcessed = 0;
  let exercisesScored = 0;

  for (const { sessionId } of needsScoring) {
    const exs = db
      .select()
      .from(exercises)
      .where(and(eq(exercises.sessionId, sessionId), isNull(exercises.formScore)))
      .all();

    try {
      const scores = await scoreExerciseForms(exs);
      for (const s of scores) {
        await updateExercise(s.exerciseId, { formScore: s.score });
        exercisesScored++;
      }
      sessionsProcessed++;
    } catch (err) {
      console.error(`Backfill failed for session ${sessionId}:`, err);
    }

    // Rate limit between sessions
    await new Promise((r) => setTimeout(r, 2000));
  }

  return NextResponse.json({ sessionsProcessed, exercisesScored });
}
```

- [ ] **Step 6: Verify build**

```bash
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: add form scoring to pipeline, override API, and backfill endpoint"
```

---

## Task 9: Form Score Override UI on Session Detail Page

**Files:**
- Modify: `src/app/(legacy)/sessions/[sessionId]/page.tsx`
- Modify: `src/components/exercises/exercise-card.tsx` (or exercise-grid)

- [ ] **Step 1: Read current exercise card component**

Read `src/components/exercises/exercise-card.tsx` to understand the current structure before modifying.

- [ ] **Step 2: Add form score display + inline override**

Add a form score badge to each exercise card. When clicked, it becomes an inline number input (1-10). On blur/enter, it calls `PATCH /api/exercises/[exerciseId]/form-score`.

The exact implementation depends on the current exercise-card structure (read it first). The pattern:

```tsx
// Inside the exercise card, add:
{(exercise.formScoreOverride || exercise.formScore) && (
  <FormScoreBadge
    exerciseId={exercise.id}
    score={exercise.formScoreOverride ?? exercise.formScore}
    isOverride={!!exercise.formScoreOverride}
  />
)}
```

Create a small `FormScoreBadge` client component that toggles between display and edit mode.

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add inline form score display and override on session detail page"
```

---

## Task 10: Final Verification and Deploy

- [ ] **Step 1: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 2: Build**

```bash
npm run build
```

- [ ] **Step 3: Manual smoke test**

Run `npm run dev` and verify:
- `/` shows Overview with KPI cards and trend chart
- `/volume` shows bar chart
- `/form` shows empty state (no scores yet) or line chart if backfill ran
- `/balance` shows donut chart
- `/sessions` shows heatmap + session list
- `/notes` shows notes feed
- Client selector filters data across all pages
- Time range selector works per-page
- Mobile bottom nav works
- `/record`, `/upload`, `/library` still show existing header layout
- `/sessions/[id]` shows session detail with form score badges

- [ ] **Step 4: Run backfill** (optional, can be done after deploy)

```bash
curl -X POST http://localhost:3000/api/admin/backfill-form-scores
```

Expected: Returns `{ sessionsProcessed: N, exercisesScored: M }`

- [ ] **Step 5: Commit any remaining fixes**

- [ ] **Step 6: Push to deploy**

```bash
git push origin master
```

Railway auto-deploys on push to master. After deploy, run the backfill against production if desired.
