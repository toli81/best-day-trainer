# Client Selector — Phase 1 Completion

## Overview

Replace the free-text `clientName` input on upload and record pages with a client dropdown backed by the `clients` database table. Add a "quick-add" inline flow so trainers can create new clients without leaving the page. Wire `clientId` through the entire upload pipeline so new sessions are linked to client records.

Auth remains bypassed — this work is data-model only.

## Scope

### In scope
- `GET /api/clients` and `POST /api/clients` API routes
- `listClients()` and `createClient()` DB query functions
- `<ClientSelector>` reusable component (dropdown + inline add)
- Update `/upload` page: replace `clientName` input with `<ClientSelector>`
- Update `/record` page: add `<ClientSelector>` to setup panel
- Update `useUpload` hook: accept `clientId` instead of `clientName`
- Update `POST /api/upload/init`: accept and store `clientId`
- Update `POST /api/upload/complete`: write `clientId` to session row
- Update home page: display client name from `clients` table with `clientName` fallback
- Update session list and detail pages: same client name resolution
- Update session notes prompt: resolve client name from `clientId`

### Out of scope
- Auth re-enablement
- Client edit/delete (Phase 3)
- Dashboard pages (Phase 2)
- Data scoping by role (requires auth)
- Running the migration script (separate manual step)

## API Design

### `GET /api/clients`

Returns active clients sorted by name.

```json
// Response 200
{
  "clients": [
    { "id": "abc123", "name": "John Smith", "email": "john@example.com", "status": "active" }
  ]
}
```

### `POST /api/clients`

Creates a new client. Only `name` is required (email optional while auth is off).

```json
// Request
{ "name": "Jane Doe", "email": "jane@example.com" }

// Response 201
{ "id": "def456", "name": "Jane Doe", "email": "jane@example.com", "status": "active" }
```

If `email` is omitted, a placeholder `{name-slug}-{nanoid(6)}@placeholder.local` is generated. The nanoid suffix prevents unique constraint violations when two clients share the same name.

Validation: `name` is trimmed and must be non-empty (return 400 otherwise).

## Component Design

### `<ClientSelector>`

Props:
- `value: string | null` — selected clientId
- `onChange: (clientId: string | null) => void` — callback when selection changes (null = cleared)

Behavior:
1. Fetches `GET /api/clients` on mount
2. Renders shadcn `Select` dropdown with client names
3. First option is "No client selected" (clears selection)
4. Last option is "+ Add New Client"
5. Selecting "Add New" shows an inline text input + "Add" button below the dropdown
6. On submit, `POST /api/clients` with the name, auto-selects the new client, refreshes list
7. Loading and error states handled inline
8. Empty state (no clients yet): dropdown shows only "+ Add New Client"

Location: `src/components/client-selector.tsx`

## Upload Pipeline Changes

### Record page `clientId` flow
The record page triggers upload inside a `useEffect` when `blob` is set. The selected `clientId` must be stored in a ref so it is available when the effect fires (React state may be stale in the effect closure).

### `useUpload` hook
- Change `upload(file, clientName?, sessionDate?)` to `upload(file, clientId?, sessionDate?)`
- Change `lastArgsRef` to store `clientId` instead of `clientName`
- Pass `clientId` (not `clientName`) in the `/api/upload/init` request body

### `POST /api/upload/init`
- Accept `clientId` instead of `clientName` in request body
- Store `clientId` in upload session metadata (replace `clientName` field)

### `POST /api/upload/complete`
- Read `clientId` from upload session metadata
- Write `clientId` to the session DB row (instead of `clientName`)
- Stop writing `clientName` for new sessions

### `upload-sessions.ts`
- Update `UploadSessionData` type: replace `clientName` with `clientId`

## Client Name Resolution

All pages that display client names need the same resolution logic: use `clients.name` via `clientId` lookup, fall back to `session.clientName` for old sessions.

### Affected pages
- `src/app/page.tsx` (home page session list)
- `src/app/sessions/page.tsx` (sessions list)
- `src/app/sessions/[sessionId]/page.tsx` (session detail)

### Approach
Add a `getClient(id)` query function. Each page resolves client name at render time. Alternatively, `listSessions()` can be updated to join the clients table and return `clientName` directly.

### Session notes prompt
`src/lib/claude/session-notes.ts` uses `session.clientName` in the AI prompt. Update to resolve client name from `clientId` so new sessions get the correct name in generated notes.

### `queries.ts`
- Add `listClients()`: select all active clients, order by name
- Add `createClient(data)`: insert into clients table, return new row
- Add `getClient(id)`: lookup single client by id

## Backward Compatibility

- `sessions.clientName` column is preserved (not removed)
- Old sessions without `clientId` still display via `clientName` fallback
- New sessions write `clientId` only; `clientName` is left null
- The DB schema already supports `clientId` on sessions (column exists). The migration script (`scripts/migrate-clients.ts`) is for backfilling old sessions only — run manually when ready

## Files Changed

| File | Change |
|------|--------|
| `src/lib/db/queries.ts` | Add `listClients()`, `createClient()` |
| `src/app/api/clients/route.ts` | NEW — GET + POST handlers |
| `src/components/client-selector.tsx` | NEW — dropdown + inline add |
| `src/app/upload/page.tsx` | Replace clientName input with ClientSelector |
| `src/app/record/page.tsx` | Add ClientSelector to setup panel |
| `src/hooks/use-upload.ts` | Change clientName → clientId param |
| `src/app/api/upload/init/route.ts` | Accept clientId instead of clientName |
| `src/app/api/upload/complete/route.ts` | Write clientId to session row |
| `src/lib/r2/upload-sessions.ts` | Update UploadSessionData type |
| `src/app/page.tsx` | Display client name with fallback |
| `src/app/sessions/page.tsx` | Same client name resolution |
| `src/app/sessions/[sessionId]/page.tsx` | Same client name resolution |
| `src/lib/claude/session-notes.ts` | Resolve client name from clientId for AI prompt |
