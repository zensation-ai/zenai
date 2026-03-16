# ZenAI Depth Upgrade: 6.5 → 9.5/10

**Date:** 2026-03-16
**Goal:** Transform ZenAI from "beeindruckend breit" to "beeindruckend tief"

## Executive Summary

After code-level validation of 10 identified gaps, **2 are already resolved** (LLM Memory Write, Cross-Encoder). The remaining **8 gaps** are addressed in 3 sprints across Backend, Frontend, and Database.

## Validated Gap Status

| # | Gap | Claimed Score | Real Score | Action |
|---|-----|--------------|------------|--------|
| 1 | LLM Memory Write | 6/10 | 7.5/10 | **ALREADY RESOLVED** — 5 write tools exist, proactive system prompt |
| 2 | Agent System Sequential | 5/10 | 5/10 | **FIX** — agent-graph.ts exists but execute() never called |
| 3 | Design System Unused | 4/10 | 4/10 | **FIX** — 10 components, 0 imports outside /design-system/ |
| 4 | Tool-Use Visualization | 7/10 | 7.5/10 | **ENHANCE** — Pills exist (Phase 76), but no result display |
| 5 | Cross-Encoder LLM-Judge | 7/10 | 9/10 | **ALREADY RESOLVED** — Heuristic 5-signal scorer, ~0.1ms/doc |
| 6 | State Management | 5/10 | 5.5/10 | **FIX** — React Query installed+hooks written, but 0 pages use them |
| 7 | Queue Workers Stubs | 5/10 | 5/10 | **FIX** — 3/5 workers are logging stubs |
| 8 | Chat Mode Regex | 7/10 | 7/10 | **ENHANCE** — 115+ patterns, no semantic fallback |
| 9 | Voice Latency | 6/10 | 6/10 | **ENHANCE** — Sentence detection ready but not integrated |
| 10 | Offline AI | 5/10 | 5/10 | **DEFER** — WebLLM adoption still limited |

## Sprint 1: Foundation (Highest Impact)

### 1A: React Query Migration — IdeasPage (50→5 props)

**Problem:** IdeasPage receives 50 props from App.tsx. React Query hooks exist but are unused.

**Solution:**
- Replace `useIdeasData` hook usage in App.tsx with React Query hooks directly in IdeasPage
- IdeasPage calls `useIdeasQuery(context)`, `useArchivedIdeasQuery(context)`, etc. internally
- App.tsx only passes: `context`, `initialTab`, `onNavigate`
- Move search/filter/viewMode state into IdeasPage (page-local concerns)

**Files Changed:**
- `frontend/src/components/IdeasPage.tsx` — Import React Query hooks, manage own state
- `frontend/src/App.tsx` — Remove 45+ props from IdeasPage render, remove useIdeasData

### 1B: Design System Adoption — Core Pages

**Problem:** 887 ad-hoc buttons, 347 card divs, 53 modal implementations. 0 design system usage.

**Solution:** Migrate top 3 pages to ds-* components:
- `Dashboard.tsx` — 20 buttons → `<Button />`, 12 cards → `<Card />`
- `IdeasPage.tsx` — 16 buttons → `<Button />`, 11 cards → `<Card />`
- `SettingsDashboard.tsx` — Buttons + Modals

### 1C: Queue Workers Activate (3 Stubs → Real)

**Problem:** RAG-Indexing, Email-Processing, Graph-Indexing workers log `{ status: 'completed' }` without doing work.

**Solution:** Wire stubs to existing service functions:
- RAG-Indexing → `graphIndexer.indexIdea()` / `graphIndexer.indexBatch()`
- Email-Processing → `processEmailWithAI(context, emailId)`
- Graph-Indexing → `graphIndexer.indexBatch()` + `getIndexingStatus()`

**File Changed:** `backend/src/services/queue/workers.ts`

### 1D: Agent Graph Activation

**Problem:** `agent-graph.ts` has full LangGraph-style execute() but it's never called. Routes reconstruct graph but skip execution.

**Solution:**
- Fix `agent-identity.ts` route: provide `agentExecutor` callback to `graph.execute()`
- Import agent factories (researcher, writer, reviewer, coder)
- Add `executeAgentInWorkflow()` function that maps role → agent factory

**Files Changed:**
- `backend/src/routes/agent-identity.ts` — Wire execute() with callbacks

## Sprint 2: Intelligence Depth

### 2A: Semantic Chat Mode Detection

**Problem:** 115+ regex patterns can't classify ambiguous messages like "Kannst du mir helfen, das zu finden?"

**Solution:** Add semantic fallback for low-confidence detections (<0.6):
- Lightweight Claude call with constrained output (1 token: mode name)
- Cache results for similar messages (embedding similarity)
- Keep regex as fast-path for high-confidence matches

**File Changed:** `backend/src/services/chat-modes.ts`

### 2B: Tool-Use Visualization Enhancement

**Problem:** Tool pills show during streaming but completed tool results are stored and never rendered.

**Solution:**
- Render tool results as expandable sections below pills
- Add tool execution duration tracking
- Show tool error states distinctly
- Replace emoji icons with proper SVG icons

**Files Changed:**
- `frontend/src/components/GeneralChat/ChatMessageList.tsx`
- `frontend/src/components/GeneralChat.css`

### 2C: Voice Sentence-Level Streaming

**Problem:** Pipeline waits for full Claude response before TTS. Sentence detection utility exists but isn't integrated.

**Solution:**
- Stream Claude response chunks in voice pipeline
- Use existing `splitIntoSentences()` + `isSentenceEnd()` utilities
- Trigger TTS for each complete sentence immediately
- Queue audio chunks for sequential playback

**File Changed:** `backend/src/services/voice/voice-pipeline.ts`

## Sprint 3: Polish (Deferred)

- Offline AI (WebLLM) — Blocked on browser API maturity
- Navigation cleanup (43 page identifiers) — Lower priority
- Emoji → SVG icon migration — Bundled with Design System adoption

## Architecture Decisions

1. **React Query over Context API** — Server state belongs in React Query, not Context. Context only for truly global UI state (theme, auth).
2. **Design System incremental migration** — No big-bang rewrite. Migrate page-by-page starting with highest traffic.
3. **Agent Graph as execution engine** — Don't rebuild orchestrator. Activate existing agent-graph.ts which already has conditional routing, loop detection, human-in-the-loop.
4. **Regex fast-path + semantic fallback** — Don't replace regex (it's fast). Add Claude fallback only for ambiguous cases.

## Expected Score After Implementation

| Area | Before | After | Change |
|------|--------|-------|--------|
| Agent System | 5/10 | 8/10 | Graph execution + conditional routing |
| Design System | 4/10 | 7.5/10 | Core pages migrated |
| State Management | 5/10 | 8.5/10 | React Query adoption |
| Queue Workers | 5/10 | 8/10 | Real service calls |
| Chat Mode | 7/10 | 8.5/10 | Semantic fallback |
| Tool Visualization | 7/10 | 8.5/10 | Result display + timing |
| Voice | 6/10 | 7.5/10 | Sentence streaming |
| **Overall** | **6.0-6.5** | **8.0-8.5** | |
