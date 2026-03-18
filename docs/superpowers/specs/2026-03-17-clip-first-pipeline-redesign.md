# Clip-First Pipeline Redesign

**Date:** 2026-03-17
**Status:** Approved
**Goal:** Make the video analysis pipeline reliable for 55-minute training sessions by switching to a clip-first architecture with Gemini 3 Flash.

## Problem

The current pipeline sends the full compressed video to Gemini for every API call (1 overview + 5 detail batches). Each call re-ingests ~630K tokens. This hits TPM rate limits and 10-minute timeouts on Railway, causing frequent failures.

Analysis quality is already excellent — the only problem is reliability.

## Constraints & Requirements

- **Reliability over speed.** Results by end-of-day is acceptable.
- **Quality is non-negotiable.** Current prompt output quality is great; preserve it.
- **Willing to pay for tokens** if it means reliability.
- **Single-tenant v1** is fine. Architecture should support multi-tenant eventually.
- **Simplicity.** The trainer sets up the camera, forgets about it, hits complete, and it just works.

## Solution: Clip-First Architecture + Gemini 3 Flash

### New Pipeline Flow

| Stage | Checkpoint | Description |
|-------|------------|-------------|
| 1 | `downloaded` | Download original video from R2 to /tmp |
| 2 | `uploaded_to_gemini` | Upload original video to Gemini (no compression) |
| 3 | `overview_complete` | Overview pass on full video with `media_resolution_low` |
| 4 | `clips_extracted` | FFmpeg extracts clips + thumbnails from original video, uploads to R2 |
| 5 | `details_complete` | Detail analysis per clip (each clip uploaded individually to Gemini) |
| 6 | `notes_generated` | Claude generates session notes |
| 7 | `tags_generated` | Claude standardizes names + tags (new checkpoint — currently runs unconditionally) |
| 8 | `complete` | Cleanup Gemini resources, mark done |

**`STAGE_ORDER` update:** The array must be updated to: `["downloaded", "uploaded_to_gemini", "overview_complete", "clips_extracted", "details_complete", "notes_generated", "tags_generated", "complete"]`. The old `"compressed"` stage is removed.

### What's Removed

- **`compressForAnalysis()`** — no more video compression for analysis
- **`speedFactor`** — eliminated entirely; Gemini sees the real video, timestamps are real
- **Timestamp scaling** (`startSec * speedFactor`) — deleted
- **`MAX_ANALYSIS_DURATION_SEC`** and **`MAX_TOKENS_ESTIMATE_PER_SEC`** constants — deleted
- **Batch grouping** (`runDetailAnalysisInBatches`) — replaced with per-clip sequential analysis
- **Compressed video temp file handling** — gone

### What Moves

- **Clip extraction** moves from after detail analysis to before it (stage 4 instead of former stage 6)

### What Stays the Same

- Upload flow (direct-to-R2 multipart)
- Claude integration (session notes + exercise tagging)
- R2 storage paths
- UI (except new CRUD additions below)
- Dockerfile & Railway config
- Resumable checkpoint concept
- Concurrency guard (single session at a time)
- Zod response schemas

### Database Schema Changes

**Exercises table — new field:**
- `detailStatus: text` — values: `pending`, `complete`, `failed`. Tracks per-exercise detail analysis completion for checkpointing.

**Exercise records are created in stage 4** (clip extraction), with `detailStatus = "pending"`. Stage 5 queries for exercises with `detailStatus != "complete"` and updates each to `complete` or `failed` after analysis.

**Sessions table — removed constants:**
- `speedFactor` is no longer written (field can remain in schema for backward compat with old sessions but is ignored).

**Migration for old sessions:**
- Sessions with `pipelineStage = "compressed"` should be treated as needing full reprocessing (reset to `downloaded` or `error` state on startup).

## Gemini Configuration

### Model

- `gemini-2.5-flash` -> `gemini-3-flash-preview`
- Update to `gemini-3-flash` when it reaches GA

### Overview Pass Config

The `@google/genai` SDK (v1.44.0+) supports `mediaResolution` and `thinkingConfig` for Gemini 3 models. These are passed in the `config` object of `generateContent()`. Implementation must verify these parameters are accepted by the SDK at build time — if not, upgrade the SDK or use the REST API equivalent (`generationConfig.mediaResolution` and `generationConfig.thinkingConfig`).

```typescript
{
  responseMimeType: "application/json",
  mediaResolution: "low",                    // ~100 tokens/sec → 55 min = ~330K tokens
  thinkingConfig: { thinkingLevel: "low" },  // structured extraction, not reasoning
  // temperature removed — use Gemini 3 default (1.0) per Google migration guidance
}
```

**Context caching:** The overview pass makes only one call against the full video, so caching provides no multi-call savings. Do NOT re-enable caching for the overview pass — it adds latency (cache creation) and cost (cache storage) for no benefit. Use a direct file reference instead.

### Detail Pass Config (Per Clip)

```typescript
{
  responseMimeType: "application/json",
  mediaResolution: "medium",                 // higher detail for form analysis on short clips
  thinkingConfig: { thinkingLevel: "low" },
  // temperature removed
}
```

No caching for clips — each clip is used once. Token cost per clip is ~18K (trivially small).

### Timeouts

- **Upload timeout:** Keep at 10 minutes. Original videos are 400-800MB; Railway has good egress bandwidth (~1.3 MB/s minimum needed for 800MB in 10 min). Monitor and increase if needed.
- **Overview timeout:** Keep at 10 minutes (one large call).
- **Detail timeout per clip:** Reduce from 10 minutes to 3 minutes. Clips are 1-5 minutes and ~18K tokens — should complete in well under a minute. Shorter timeout means faster failure detection.

### Retry Logic

Existing 3-retry with 30/60/90s backoff stays as a safety net. Less critical now since individual clip calls are small.

## Prompt Changes

### Primary-Subject Directive

Added to the top of both prompts to prevent analyzing background gym-goers:

**Overview prompt prepend:**
> "The camera is positioned to record a specific client's training session. Focus ONLY on the primary subject — the person who is clearly the focus of the camera framing and appears throughout the video. Ignore any other people visible in the background or periphery, even if they are exercising."

**Detail prompt prepend:**
> "Analyze ONLY the primary subject's performance in this clip. Ignore other people visible in the frame."

### Prompt Structure

- `OVERVIEW_PROMPT` — updated with primary-subject directive. Schema unchanged.
- `exerciseDetailPrompt()` — **rewritten for clip-based analysis.** The current version references timestamps in the full video ("Analyze the exercise occurring between ${startTime} and ${endTime}"). Since detail analysis now receives individual clips that start at 0:00, timestamp references are meaningless. The new prompt should say: "Analyze the exercise shown in this video clip. The exercise was identified as: {label}" without any timestamp references. Updated with primary-subject directive. Schema unchanged.
- `allExercisesDetailPrompt()` — deprecated/removed (no longer needed with per-clip analysis)

### Data Captured Per Exercise (Unchanged)

- name, description, muscleGroups, equipment, difficulty, category
- repCount, setCount, formNotes, coachingCues
- Post-analysis: tags, standardizedName (via Claude)

## Detail Analysis Flow

For each exercise with `detailStatus != "complete"`, sequentially:

1. Download the clip from R2 (not /tmp — clips may not survive Railway restarts between stage 4 and 5)
2. Upload the individual clip to Gemini (small file, fast upload)
3. Run `exerciseDetailPrompt()` on just that clip
4. Save result to DB, update `detailStatus` to `complete`
5. Clean up the Gemini file reference and local temp clip
6. 1-2 second pause between calls (rate limit courtesy)

### Per-Exercise Checkpointing

Exercise records are created in stage 4 with `detailStatus = "pending"`. Stage 5 queries for exercises where `detailStatus != "complete"` and processes only those. On resume after a crash, exercises already marked `complete` are skipped. Failure on exercise 8 of 15 means retry picks up at exercise 8.

### Graceful Per-Exercise Failure

If a single exercise's detail analysis fails after 3 retries:
- Log the error
- Mark that exercise as failed
- Continue to the next exercise
- Session still completes — trainer sees which exercises succeeded vs need retry

## New Features: Session & Exercise Management

### New API Endpoints

- `DELETE /api/sessions/[sessionId]` — deletes session, cascades to exercises, cleans up R2 video/clips/thumbnails. Returns 409 if the session is currently processing (must wait for completion or error).
- `DELETE /api/exercises/[exerciseId]` — deletes single exercise, cleans up its R2 clip/thumbnail. Returns 404 if not found.

### UI Additions

- **Session detail page:** Delete session button with confirmation dialog
- **Session detail page:** Delete individual exercise button with confirmation
- **Exercise library / session detail:** Edit exercise fields (name, description, muscle groups, equipment, difficulty, category, form notes, coaching cues) using existing PATCH endpoint

## Deferred to Future Iterations

- **Free-text session context field** — trainer-provided notes prepended to prompts (e.g., "client is the woman in the blue shirt")
- **Multi-tenant scaling** — concurrent processing, queue system
- **Gemini 3 Flash GA migration** — update model string when preview graduates

## Risk Assessment

- **Overview pass** is the one remaining large call (~330K tokens). This is well under the 1M limit. Low risk.
- **Detail passes** are ~18K tokens each. Trivially small. No rate limit or timeout concerns.
- **Gemini 3 Flash preview** may have quirks vs GA. Mitigation: model string is a single constant, easy to swap.
- **Net code change** is a reduction — removing compression, scaling, and batching logic. Less code = fewer failure points.
