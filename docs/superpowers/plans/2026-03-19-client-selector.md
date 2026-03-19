# Client Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-text client name input with a dropdown backed by the `clients` DB table, and wire `clientId` through the entire upload pipeline.

**Architecture:** Add CRUD query functions and API routes for clients. Build a reusable `<ClientSelector>` component. Update the upload/record pages and the upload pipeline to pass `clientId` instead of `clientName`. Update all display pages to resolve client names from the clients table with a fallback to the legacy `clientName` field.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM + SQLite, shadcn/ui components, nanoid

**Spec:** `docs/superpowers/specs/2026-03-19-client-selector-phase1.md`

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `src/lib/db/queries.ts` | Modify | Add `listClients()`, `createClient()`, `getClient()` |
| `src/app/api/clients/route.ts` | Create | GET + POST handlers for clients |
| `src/components/client-selector.tsx` | Create | Dropdown with inline "Add New" flow |
| `src/lib/r2/upload-sessions.ts` | Modify | Change `clientName` to `clientId` in type |
| `src/hooks/use-upload.ts` | Modify | Change `clientName` param to `clientId` |
| `src/app/api/upload/init/route.ts` | Modify | Accept `clientId` instead of `clientName` |
| `src/app/api/upload/complete/route.ts` | Modify | Write `clientId` to session row |
| `src/app/upload/page.tsx` | Modify | Replace text input with `<ClientSelector>` |
| `src/app/record/page.tsx` | Modify | Add `<ClientSelector>` to setup panel |
| `src/app/page.tsx` | Modify | Resolve client name from `clientId` with fallback |
| `src/app/sessions/page.tsx` | Modify | Same client name resolution |
| `src/app/sessions/[sessionId]/page.tsx` | Modify | Same client name resolution |
| `src/lib/claude/session-notes.ts` | Modify | Resolve client name from `clientId` |

---

### Task 1: DB Query Functions

**Files:**
- Modify: `src/lib/db/queries.ts`

- [ ] **Step 1: Add client query imports and functions**

Add these functions to `src/lib/db/queries.ts`:

```typescript
// REPLACE the existing import lines at top with these:
import { sessions, exercises, clients, type NewSession, type NewExercise, type NewClient } from "./schema";
import { eq, desc, like, and, sql, asc } from "drizzle-orm";

// Add after existing functions:

export async function listClients() {
  return db
    .select()
    .from(clients)
    .where(eq(clients.status, "active"))
    .orderBy(asc(clients.name))
    .all();
}

export async function getClient(id: string) {
  return db.query.clients.findFirst({
    where: eq(clients.id, id),
  });
}

export async function createClient(data: NewClient) {
  return db.insert(clients).values(data).returning().get();
}
```

- [ ] **Step 2: Verify build**

Run: `cd "C:\Users\chris\Desktop\AI\New Version\best-day-trainer" && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/queries.ts
git commit -m "feat: add client CRUD query functions"
```

---

### Task 2: Client API Routes

**Files:**
- Create: `src/app/api/clients/route.ts`

- [ ] **Step 1: Create the API route file**

Create `src/app/api/clients/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { listClients, createClient } from "@/lib/db/queries";

export async function GET() {
  try {
    const allClients = await listClients();
    return NextResponse.json({ clients: allClients });
  } catch (error) {
    console.error("List clients error:", error);
    return NextResponse.json(
      { error: "Failed to list clients" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, email } = await req.json();

    const trimmedName = (name || "").trim();
    if (!trimmedName) {
      return NextResponse.json(
        { error: "Client name is required" },
        { status: 400 }
      );
    }

    const slug = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const placeholderEmail = email || `${slug}-${nanoid(6)}@placeholder.local`;
    const now = new Date().toISOString();

    const client = await createClient({
      id: nanoid(),
      name: trimmedName,
      email: placeholderEmail,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json(client, { status: 201 });
  } catch (error: any) {
    if (error?.message?.includes("UNIQUE constraint")) {
      return NextResponse.json(
        { error: "A client with that email already exists" },
        { status: 409 }
      );
    }
    console.error("Create client error:", error);
    return NextResponse.json(
      { error: "Failed to create client" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/clients/route.ts
git commit -m "feat: add GET/POST /api/clients routes"
```

---

### Task 3: Client Selector Component

**Files:**
- Create: `src/components/client-selector.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/client-selector.tsx`:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Client {
  id: string;
  name: string;
}

interface ClientSelectorProps {
  value: string | null;
  onChange: (clientId: string | null) => void;
}

const ADD_NEW_VALUE = "__add_new__";
const NO_CLIENT_VALUE = "__none__";

export function ClientSelector({ value, onChange }: ClientSelectorProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch("/api/clients");
      if (!res.ok) throw new Error("Failed to load clients");
      const data = await res.json();
      setClients(data.clients);
    } catch {
      setError("Could not load clients");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const handleSelectChange = (val: string) => {
    if (val === ADD_NEW_VALUE) {
      setShowAddForm(true);
      return;
    }
    if (val === NO_CLIENT_VALUE) {
      onChange(null);
      return;
    }
    onChange(val);
    setShowAddForm(false);
  };

  const handleAddClient = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add client");
      }
      const client = await res.json();
      await fetchClients();
      onChange(client.id);
      setNewName("");
      setShowAddForm(false);
    } catch (err: any) {
      setError(err.message || "Failed to add client");
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="h-10 animate-pulse rounded-[10px] bg-secondary" />
    );
  }

  return (
    <div className="space-y-2">
      <Select
        value={value || NO_CLIENT_VALUE}
        onValueChange={handleSelectChange}
      >
        <SelectTrigger className="rounded-[10px] border-border focus-visible:ring-[#00CCFF]">
          <SelectValue placeholder="Select client" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_CLIENT_VALUE}>No client selected</SelectItem>
          {clients.map((client) => (
            <SelectItem key={client.id} value={client.id}>
              {client.name}
            </SelectItem>
          ))}
          <SelectItem value={ADD_NEW_VALUE} className="text-[#00CCFF] font-medium">
            + Add New Client
          </SelectItem>
        </SelectContent>
      </Select>

      {showAddForm && (
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Client name"
            className="rounded-[10px] border-border focus-visible:ring-[#00CCFF]"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddClient();
              }
            }}
            autoFocus
          />
          <Button
            onClick={handleAddClient}
            disabled={adding || !newName.trim()}
            className="shrink-0 rounded-[10px] bg-[#00CCFF] text-white hover:bg-[#00b8e6]"
          >
            {adding ? "..." : "Add"}
          </Button>
          <Button
            onClick={() => { setShowAddForm(false); setNewName(""); }}
            variant="outline"
            className="shrink-0 rounded-[10px] border-border"
          >
            Cancel
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/client-selector.tsx
git commit -m "feat: add ClientSelector component with inline add"
```

---

### Task 4: Upload Pipeline — Type and Hook Changes

**Files:**
- Modify: `src/lib/r2/upload-sessions.ts`
- Modify: `src/hooks/use-upload.ts`

- [ ] **Step 1: Update UploadSession type**

In `src/lib/r2/upload-sessions.ts`, change `clientName` to `clientId`:

Replace:
```typescript
  clientName: string | null;
```
With:
```typescript
  clientId: string | null;
```

- [ ] **Step 2: Update useUpload hook**

In `src/hooks/use-upload.ts`, make these changes:

Change the `lastArgsRef` type (line 125):
```typescript
  const lastArgsRef = useRef<{ file: File; clientId?: string; sessionDate?: string } | null>(null);
```

Change the `upload` function signature (line 128):
```typescript
    async (file: File, clientId?: string, sessionDate?: string) => {
```

Update `lastArgsRef` assignment (line 130):
```typescript
      lastArgsRef.current = { file, clientId, sessionDate };
```

Update the init request body (lines 146-151):
```typescript
          body: JSON.stringify({
            fileName: file.name,
            fileSize: file.size,
            clientId: clientId || null,
            title: sessionDate
              ? `Session ${new Date(sessionDate).toLocaleDateString()}`
              : null,
          }),
```

Update the retry function (lines 243-245):
```typescript
  const retry = useCallback(async () => {
    if (!lastArgsRef.current) return;
    const { file, clientId, sessionDate } = lastArgsRef.current;
    return upload(file, clientId, sessionDate);
  }, [upload]);
```

- [ ] **Step 3: Update upload init route**

In `src/app/api/upload/init/route.ts`, change `clientName` to `clientId`:

Replace line 11:
```typescript
    const { fileName, fileSize, clientId, title } = await req.json();
```

Replace the `setUploadSession` call (line 38-46):
```typescript
    setUploadSession(uploadId, {
      r2Key,
      r2UploadId,
      fileName,
      fileSize,
      clientId: clientId || null,
      title: title || null,
      createdAt: Date.now(),
    });
```

- [ ] **Step 4: Update upload complete route**

In `src/app/api/upload/complete/route.ts`, write `clientId` instead of `clientName`:

Replace the `createSession` call (lines 31-42):
```typescript
    const dbSession = await createSession({
      id: sessionId,
      title: session.title || `Session ${new Date().toLocaleDateString()}`,
      clientId: session.clientId || undefined,
      recordedAt: now,
      videoFilePath: `r2://${session.r2Key}`,
      videoFileName: session.fileName,
      videoSizeBytes: session.fileSize,
      status: "uploaded",
      createdAt: now,
      updatedAt: now,
    });
```

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/r2/upload-sessions.ts src/hooks/use-upload.ts src/app/api/upload/init/route.ts src/app/api/upload/complete/route.ts
git commit -m "feat: wire clientId through upload pipeline"
```

---

### Task 5: Update Upload Page

**Files:**
- Modify: `src/app/upload/page.tsx`

- [ ] **Step 1: Replace clientName input with ClientSelector**

In `src/app/upload/page.tsx`:

Add import at top:
```typescript
import { ClientSelector } from "@/components/client-selector";
```

Replace state (line 18):
```typescript
  const [clientId, setClientId] = useState<string | null>(null);
```

Replace `handleSubmit` (line 44):
```typescript
      const sessionId = await upload(selectedFile, clientId || undefined, sessionDate);
```

Replace the Client Name input section (lines 125-133) with:
```tsx
          <div>
            <label className="text-sm font-medium text-secondary-foreground">Client</label>
            <ClientSelector value={clientId} onChange={setClientId} />
          </div>
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/upload/page.tsx
git commit -m "feat: replace clientName input with ClientSelector on upload page"
```

---

### Task 6: Update Record Page

**Files:**
- Modify: `src/app/record/page.tsx`

- [ ] **Step 1: Add ClientSelector to setup panel**

In `src/app/record/page.tsx`:

Add import:
```typescript
import { ClientSelector } from "@/components/client-selector";
```

Add state and ref after existing state declarations (after line 52):
```typescript
  const [clientId, setClientId] = useState<string | null>(null);
  const clientIdRef = useRef<string | null>(null);
```

Add a useEffect to keep the ref in sync (after the existing useEffects):
```typescript
  useEffect(() => {
    clientIdRef.current = clientId;
  }, [clientId]);
```

Update the blob upload effect (line 84-85) to pass clientId:
```typescript
      uploader
        .upload(file, clientIdRef.current || undefined)
```

Add the ClientSelector to the setup panel, inside the `{phase === "setup" && (` Card (after the Refresh Preview button, before `</CardContent>`):
```tsx
            <div>
              <label className="mb-1 block text-sm font-medium text-secondary-foreground">Client</label>
              <ClientSelector value={clientId} onChange={setClientId} />
            </div>
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/record/page.tsx
git commit -m "feat: add ClientSelector to record page setup panel"
```

---

### Task 7: Client Name Resolution on Display Pages

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/sessions/page.tsx`
- Modify: `src/app/sessions/[sessionId]/page.tsx`

- [ ] **Step 1: Add a helper to resolve client display name**

Add `getClientName` to `src/lib/db/queries.ts`:

```typescript
export async function getClientName(session: { clientId: string | null; clientName: string | null }): Promise<string | null> {
  if (session.clientId) {
    const client = await getClient(session.clientId);
    if (client) return client.name;
  }
  return session.clientName || null;
}
```

- [ ] **Step 2: Update home page (src/app/page.tsx)**

Replace the existing import:
```typescript
import { listSessions, getClientName } from "@/lib/db/queries";
```

After the `listSessions` call (line 21), add client name resolution:
```typescript
  const { sessions } = await listSessions(1, 20);
  const sessionsWithClientNames = await Promise.all(
    sessions.map(async (session) => ({
      ...session,
      resolvedClientName: await getClientName(session),
    }))
  );
```

Replace `sessions.map` in the JSX (line 71) with `sessionsWithClientNames.map`, and also update the empty check (line 41) to use `sessionsWithClientNames.length === 0`.

Replace the client name display (line 88):
```tsx
                    {session.resolvedClientName && <p>Client: {session.resolvedClientName}</p>}
```

- [ ] **Step 3: Update sessions list page (src/app/sessions/page.tsx)**

Replace the existing import:
```typescript
import { listSessions, getClientName } from "@/lib/db/queries";
```

After the `listSessions` call (line 20), add client name resolution:
```typescript
  const { sessions, total } = await listSessions(1, 50);
  const sessionsWithClientNames = await Promise.all(
    sessions.map(async (session) => ({
      ...session,
      resolvedClientName: await getClientName(session),
    }))
  );
```

Replace `sessions.map` in the JSX (line 30) with `sessionsWithClientNames.map`.

Replace the client name display (line 48):
```tsx
                  {session.resolvedClientName && <p>Client: {session.resolvedClientName}</p>}
```

- [ ] **Step 4: Update session detail page (src/app/sessions/[sessionId]/page.tsx)**

Replace the existing import:
```typescript
import { getSession, getClientName } from "@/lib/db/queries";
```

After `getSession` (line 20), resolve the name:
```typescript
  const clientDisplayName = await getClientName(session);
```

Replace the client name display (line 36):
```tsx
            {clientDisplayName && <span>Client: {clientDisplayName}</span>}
```

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/queries.ts src/app/page.tsx src/app/sessions/page.tsx "src/app/sessions/[sessionId]/page.tsx"
git commit -m "feat: resolve client names from clients table with fallback"
```

---

### Task 8: Update Session Notes Prompt

**Files:**
- Modify: `src/lib/claude/session-notes.ts`

- [ ] **Step 1: Resolve client name in session notes**

In `src/lib/claude/session-notes.ts`:

Add import:
```typescript
import { getClientName } from "@/lib/db/queries";
```

Before the `claude.messages.create` call, resolve the name:
```typescript
  const clientDisplayName = await getClientName(session);
```

Replace line 38:
```typescript
Client: ${clientDisplayName || "Not specified"}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/claude/session-notes.ts
git commit -m "feat: resolve client name in session notes prompt"
```

---

### Task 9: Full Build Verification and Push

- [ ] **Step 1: Full build**

Run: `cd "C:\Users\chris\Desktop\AI\New Version\best-day-trainer" && npm run build 2>&1 | tail -20`
Expected: Build completes with no errors

- [ ] **Step 2: Push to master**

```bash
git push origin master
```

Railway will auto-deploy.
