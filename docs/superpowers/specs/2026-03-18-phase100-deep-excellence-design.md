# Phase 100 — Deep Excellence

> Design Spec for ZenAI Quality Evolution
> Date: 2026-03-18
> Status: Approved
> Scope: 20 Fixes across 4 parallel Workers

## Context

Deep audit of the entire ZenAI platform revealed a core problem: **architectural breadth without matching implementation depth**. Many subsystems have correct theoretical grounding (Ebbinghaus, Miller's Law, HyDE, A-RAG) but the transformative steps are either missing, stubs, or not wired into the live execution path.

### Current Scores

| Area | Score | Key Gap |
|------|-------|---------|
| Memory System | 6/10 | Consolidation is string-truncation, not LLM abstraction |
| RAG Pipeline | 6.5/10 | Cross-encoder is Claude-call, contextual retrieval is template |
| Agent System | 5/10 | Sequential only, in-memory shared state, static teams |
| Chat UX | 6/10 | No edit/regenerate, dual state management, tools disappear |
| Design System | 5/10 | Built but adopted by only 2/40+ components |
| State Management | 7/10 | useStreamingChat unused, incomplete React Query migration |

### Research Basis

Based on state-of-the-art 2025-2026 research:
- **Memory**: Letta/MemGPT V1 (self-editing memory), Mem0-g (graph memory), MemOS (memory governance), ICLR 2026 MemAgents Workshop
- **RAG**: CRAG (Corrective RAG), ColBERTv2 (late interaction), Anthropic Contextual Retrieval, Self-RAG, Speculative RAG
- **Agents**: LangGraph (parallel branches, fan-out/fan-in), CrewAI (role-based), AutoGen 0.4, MCP/A2A protocols
- **AI OS**: Notion Custom Agents (delegative UI), Claude Computer Use, OpenAI Operator, Limitless/Granola
- **UX**: Delegative UI patterns, Smashing Magazine agentic UX patterns, progressive reasoning disclosure

### Target Scores

| Area | Before | After |
|------|--------|-------|
| Memory | 6/10 | 8.5/10 |
| RAG | 6.5/10 | 8.5/10 |
| Agents | 5/10 | 7.5/10 |
| Chat UX | 6/10 | 8.5/10 |
| Design System | 5/10 | 7.5/10 |
| State Management | 7/10 | 9/10 |

### Constraints

- Tests may be refactored; total count must stay equal or increase
- Build must remain clean (0 TypeScript errors)
- 4 parallel workers, maximum quality focus
- Backward compatibility for API consumers

---

## Worker A: AI Core — Memory & RAG Revolution

### A1: Self-Editing Memory (Letta Paradigm)

**Problem:** System decides when to store memory (after each turn, via cron). Agent has only passive tools (remember, recall). In Letta/MemGPT, the agent itself decides what to remember, forget, and restructure.

**New Tools:**

| Tool | Purpose |
|------|---------|
| `memory_replace(key, old_content, new_content, reason)` | Agent corrects/updates an existing fact |
| `memory_abstract(fact_ids[], instruction)` | Agent consolidates multiple facts into a higher-level abstraction. Deletes source facts, creates new abstracted fact. Note: Named `memory_abstract` to avoid collision with existing `memory_rethink` tool from Phase 99. |
| `memory_search_and_link(query, link_type)` | Agent searches related facts and creates explicit relations |

**Chat Loop Integration:** After each tool-use cycle in `streaming.ts`, inject a memory reflection prompt: "Based on this conversation: Is there anything you should remember, correct, or forget? Use memory_replace/memory_rethink if yes, otherwise continue." Only when last user message >50 tokens (no reflection for "yes"/"ok"/"thanks").

**Database Change:**
```sql
ALTER TABLE learned_facts ADD COLUMN superseded_by UUID REFERENCES learned_facts(id);
ALTER TABLE learned_facts ADD COLUMN supersede_reason TEXT;
-- Apply to all 4 schemas: personal, work, learning, creative
```

**Files to modify:**
- `backend/src/services/tool-handlers/memory-management.ts` — Add 3 new tool implementations
- `backend/src/services/tool-handlers/index.ts` — Register new tools
- `backend/src/services/claude/streaming.ts` — Memory reflection injection
- `backend/src/services/memory/long-term-memory.ts` — supersedeFact() method

**Tests:** Unit tests for each new tool, integration test for reflection loop trigger condition.

### A2: Real Contextual Retrieval

**Problem:** `contextual-retrieval.ts` generates template strings instead of LLM context. Anthropic's paper shows +67% with real LLM-generated context sentences.

**Design:**
```
generateContextPrefix(chunk, documentTitle, fullDocumentContent):
  1. Truncate fullDocumentContent to first 2000 tokens (cost limit)
  2. Claude Haiku call (<500 tokens output):
     "Here is a document '{title}': {truncated_doc}
      Here is a chunk from it: {chunk}
      Give a brief context sentence (1-2 sentences) explaining
      WHERE in the document this chunk appears and WHAT it's about."
  3. Store result in enriched_content column
  4. Cache: Only on first indexing or document update
```

**Cost Control:** Haiku model, max 100 tokens output, batch processing via BullMQ queue (not synchronous). Rate limit: max 50 enrichments/minute.

**Files to modify:**
- `backend/src/services/contextual-retrieval.ts` — Replace template with LLM call
- `backend/src/services/queue/workers.ts` — Add contextual-enrichment worker
- `backend/src/services/queue/job-queue.ts` — Add 'contextual-enrichment' queue

**Tests:** Unit test for LLM context generation, integration test for queue processing.

### A3: CRAG Quality Gate

**Problem:** No formal quality gate between retrieval and generation. Poor retrieval results are passed directly to Claude, causing hallucinations.

**Design:**
```
evaluateRetrieval(query, documents[]):
  Score each document with heuristics:
  - Relevance: Cosine similarity to query embedding (>0.7 = relevant)
  - Freshness: Document age (decay factor)
  - Coverage: How many query terms appear in document

  Overall evaluation:
  - CONFIDENT (avg_score > 0.75): Use documents directly
  - AMBIGUOUS (0.45 < avg_score < 0.75): Reformulate query + re-search (max 1 retry)
  - FAILED (avg_score < 0.45): Web search fallback or explicit "I don't have good information on this"
```

**Integration:** In `enhanced-rag.ts` after retrieval step, before context assembly. Maximum 1 reformulation (no loop). On FAILED, explicitly tell user the knowledge base doesn't have a good answer.

**A2 Backfill Strategy:** Existing documents indexed before Phase 100 have template-based `enriched_content`. Add a one-time BullMQ batch job (`backfill-contextual-enrichment`) that re-enriches existing records where `enriched_content` starts with the template prefix `"This chunk from '"`. Prioritize by recency. Triggered as background job on first startup after migration, rate-limited to 50/minute.

**Files to modify:**
- `backend/src/services/enhanced-rag.ts` — Add evaluateRetrieval() call after retrieval, before assembly
- New file: `backend/src/services/rag-quality-gate.ts` — CRAG evaluation logic
- `backend/src/services/queue/workers.ts` — Add backfill-contextual-enrichment worker

**Tests:** Unit tests for each evaluation tier (CONFIDENT/AMBIGUOUS/FAILED), integration test for reformulation flow, backfill job test.

### A4: LLM-Based Consolidation

**Problem:** `episodic-memory.ts` line 546: Consolidation is `trigger.substring(0,100) + response.substring(0,150)`. String truncation, not abstraction.

**Design:**
```
consolidateEpisodes(episodes[]):
  1. Group similar episodes (Jaccard > 0.3, existing logic)
  2. For each group: Claude Haiku call:
     "Here are {n} related interactions:
      {episode_summaries}
      Extract 1-3 general insights/facts that are valuable long-term.
      Format: JSON Array [{content, fact_type, confidence}]"
  3. Deduplicate against existing long-term facts (cosine > 0.92)
  4. Store as new learned_facts with source='consolidation'
```

**Cost Control:** Only in sleep compute (not real-time), Haiku model, max 5 groups per cycle, max 200 tokens output per group.

**Files to modify:**
- `backend/src/services/memory/episodic-memory.ts` — Replace substring consolidation with LLM call
- `backend/src/services/memory/sleep-compute.ts` — Update consolidation stage to use new method

**Tests:** Unit test for LLM consolidation output parsing, integration test for deduplication.

### A5: Context Window Management

**Problem:** System prompt grows unbounded when RAG + memory + personal facts are all large. No token budget.

**Design:**
```
Token Budget Allocation (at 100K context):
  - System Prompt Base: 2K (fixed)
  - Working Memory: 2K (fixed)
  - Personal Facts: 3K (soft limit, LRU-truncate)
  - RAG Context: 8K (soft limit, top-K by score)
  - Conversation History: REST (dynamic)

When Conversation History > 80K tokens:
  1. Summarize oldest 50% of messages via Haiku
  2. Replace with "[Summary: ...]"
  3. Keep last 20 messages unchanged
```

**Token Counting:** Use existing `backend/src/services/token-estimation.ts` (Phase 97) which already provides char-based token estimation with language and code awareness. No new dependency needed.

**Files to modify:**
- `backend/src/routes/general-chat.ts` — New assembleContextWithBudget() function
- New file: `backend/src/utils/token-budget.ts` — Budget allocation logic, imports from token-estimation.ts

**Tests:** Unit tests for budget allocation with various section sizes, edge case when all sections are large.

---

## Worker B: Agent System — Parallel & Persistent

### B1: Parallel Agent Execution (Fan-out/Fan-in)

**Problem:** `agent-graph.ts` is a sequential while-loop. No parallel execution, no fan-out/fan-in.

**New Node Type:**
```typescript
type WorkflowNodeType = 'agent' | 'tool' | 'condition' | 'human_review' | 'parallel';

interface ParallelNodeConfig {
  branches: WorkflowEdge[][];  // Array of edge sequences
  merge_strategy: 'all' | 'first' | 'majority';
  timeout_ms: number;          // Default 120000
}
```

**Execution Logic:**
```
case 'parallel':
  1. Start all branches[] as Promise.allSettled()
  2. Each branch gets its own state clone (no shared mutation)
  3. Fan-in based on merge_strategy:
     - 'all': Collect all branch results into state.results[]
     - 'first': First successful branch wins
     - 'majority': For condition branches, majority vote
  4. Timeout: Cancel after timeout_ms, use available results
  5. Continue to next node with merged state
```

**New Orchestrator Strategies:**
```
parallel_research:     2x Researcher parallel → Writer → Reviewer
parallel_code_review:  Coder + Researcher parallel → Reviewer
full_parallel:         Researcher + Coder parallel → Writer → Reviewer
```

**Files to modify:**
- `backend/src/services/agents/agent-graph.ts` — Add parallel node execution
- `backend/src/services/agent-orchestrator.ts` — Add parallel strategies + team factories

**Tests:** Unit tests for parallel execution, timeout handling, merge strategies.

### B2: Persistent Shared Memory

**Problem:** SharedMemory is an in-memory Map. Process restart = everything lost.

**Design: 3-Layer Hybrid**
```
Layer 1: In-Memory Map (hot cache, <1ms reads)
Layer 2: Redis Hash (warm cache, <5ms, TTL 1h)
Layer 3: DB Table agent_shared_memory (cold, persistent)

Write: All 3 layers simultaneously (fire-and-forget for Redis+DB)
Read: L1 → L2 → L3 with promotion
Resume: Load all entries for executionId from DB into L1+L2
```

**Database Migration:**
```sql
CREATE TABLE agent_shared_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  agent_role TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(execution_id, key)
);
CREATE INDEX idx_shared_memory_exec ON agent_shared_memory(execution_id);
```

**Initialization Precedence:** On cold start (process restart), DB (L3) is the authoritative source. `restore(executionId)` loads from DB first, populates Redis and in-memory. The existing `restoreFromRedis()` is superseded: if DB data exists, Redis is populated FROM DB (not the reverse). If no DB data but Redis has data (race condition), Redis data is used as fallback.

**Files to modify:**
- `backend/src/services/memory/shared-memory.ts` — Add DB layer, revise init precedence
- New migration: `backend/sql/migrations/phase100_agent_shared_memory.sql`

**Tests:** Unit tests for write/read/restore across layers, integration test for process restart simulation, precedence test (DB wins over Redis).

### B3: Dynamic Team Composition

**Problem:** Hardcoded agent factories. agent-identity.ts exists with DB-stored personas but orchestrator ignores it.

**Design:**
```
selectStrategy(task, context):
  1. Classify task (existing heuristic)
  2. Load matching agent identities from DB:
     agentIdentityService.findByRole(requiredRoles[])
  3. For each required role:
     - DB identity found? Use its persona (tone, expertise, style, language)
     - No DB identity? Fallback to hardcoded factory (backward-compatible)
  4. Build system prompt from persona:
     buildPersonaPrompt(identity) → "You are {name}, a {role} with expertise in {expertise}..."
```

**Files to modify:**
- `backend/src/services/agent-orchestrator.ts` — createAgentWithIdentity() replaces hardcoded factories
- `backend/src/services/agents/base-agent.ts` — Accept optional AgentIdentity in constructor

**Tests:** Unit test for identity-based agent creation, fallback test when no DB identity exists.

### B4: Semantic Tool Search

**Problem:** `tool-search.ts` matches keywords with `nameWords.includes(term)`. "Write a letter" won't find `draft_email`.

**Design:**
```
On server start:
  1. For each tool: Generate embedding from "{name} {description} {keywords.join(' ')}"
  2. Store in toolEmbeddings Map<toolName, Float32Array>

searchTools(query):
  1. Generate query embedding
  2. Cosine similarity against all toolEmbeddings
  3. Top-K (K=5) with score > 0.3
  4. Fallback: If no semantic hit, existing keyword search
  5. Merge and deduplicate results
```

**Files to modify:**
- `backend/src/services/tool-handlers/tool-search.ts` — Add embedding-based search path

**Tests:** Unit test for semantic matching ("write letter" → draft_email), fallback test.

### B5: Heuristic Mode Detection

**Problem:** `detectChatModeAsync()` calls Claude for EVERY message just to decide the mode. Doubles latency for simple conversations.

**Design:**
```
detectChatMode(message, sessionHistory):
  // Heuristic-first (0ms, no API call):
  1. Tool keyword check: TOOL_TRIGGERS → 'tool_assisted'
  2. Agent keyword check: AGENT_TRIGGERS → 'agent'
  3. RAG keyword check: RAG_TRIGGERS → 'rag_enhanced'
  4. Question pattern: ends with '?' and length > 50 → 'rag_enhanced'
  5. Default: 'conversation'

  // LLM fallback only on ambiguity:
  if (confidence < 0.6) → existing Claude-based detection
```

**Note:** The current `detectChatModeAsync()` in `chat-modes.ts` already has a heuristic-first path with LLM fallback at confidence < 0.6, plus an LRU cache. The actual gap is that the heuristic keyword lists are too narrow (e.g., "Write a letter" won't match tool triggers). This fix focuses on **expanding trigger keyword lists** and **tuning confidence thresholds**, not rebuilding the existing architecture.

**Target:** Broader heuristic coverage → fewer LLM fallback calls.

**Files to modify:**
- `backend/src/services/chat-modes.ts` — Expand trigger keyword lists, tune thresholds

**Tests:** Unit tests for expanded trigger patterns, accuracy benchmark against existing test set.

---

## Worker C: Chat UX — World-Class Interaction

### C1: Edit & Regenerate

**Problem:** No edit on user messages, no regenerate on assistant messages. Table stakes in 2026.

**Data Model Change:**
```sql
ALTER TABLE chat_messages ADD COLUMN parent_message_id UUID REFERENCES chat_messages(id);
ALTER TABLE chat_messages ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE chat_messages ADD COLUMN is_active BOOLEAN DEFAULT true;
-- Apply to all 4 schemas
```

Conversation becomes a tree instead of a linear list.

**Edit Flow:**
1. User clicks "Edit" on message #5
2. Frontend shows editable textarea with existing content
3. User changes text, clicks "Send"
4. Backend: Mark message #5 + all following messages as is_active=false
5. Backend: Create new message #5' with parent_message_id = message #4, version = 2
6. Backend: Stream new assistant answer as message #6' (parent = #5')
7. Frontend: Show branch navigation (< 1/2 >) on edited messages

**Regenerate Flow:**
1. User clicks "Regenerate" on assistant message #6
2. Backend: Mark #6 as is_active=false
3. Backend: Create new message #6' with parent_message_id = #5, version = 2
4. Backend: Stream new answer with temperature + 0.1 (slight variation)
5. Frontend: Show branch navigation

**New API Endpoints:**
```
PUT  /api/chat/sessions/:id/messages/:msgId/edit      — Edit + regenerate
POST /api/chat/sessions/:id/messages/:msgId/regenerate — Regenerate only
GET  /api/chat/sessions/:id/messages/:msgId/versions   — All versions of a message
```

**Frontend Components:**
- ChatMessage: Edit icon (pencil) on hover for user messages, Regenerate icon (refresh) for assistant messages
- BranchNavigator: Shows "Version 1 of 3" with prev/next arrows

**Files to modify:**
- New migration: `backend/sql/migrations/phase100_chat_branching.sql`
- `backend/src/routes/general-chat.ts` — 3 new endpoints
- `frontend/src/components/GeneralChat/ChatMessageList.tsx` — Edit/Regenerate buttons, BranchNavigator
- New component: `frontend/src/components/GeneralChat/BranchNavigator.tsx`

**Tests:** Backend: edit flow, regenerate flow, version listing. Frontend: branch navigation rendering.

### C2: Unified Chat State

**Problem:** GeneralChat.tsx has both a chatReducer AND 6 separate useState calls for the same concerns. The reducer doesn't own the state. useStreamingChat exists but is unused.

**Design:**

Phase 1 — chatReducer becomes single source of truth:
```
Remove all useState:
  messages → chatState.messages (already in reducer)
  sessionId → chatState.sessionId (already in reducer)
  sending → derived from chatState.phase === 'streaming'
  streamingContent → chatState.streamingContent (already present)
  isStreaming → chatState.phase === 'streaming'
  thinkingContent → chatState.thinkingContent (already present)

New reducer actions:
  SET_TOOL_ACTIVITY: { activeTools, completedTools }
  EDIT_MESSAGE: { messageId, newContent }
  REGENERATE_MESSAGE: { messageId }
  SET_BRANCH: { messageId, version }
```

Phase 2 — useStreamingChat becomes the chat hook:
```
GeneralChat.tsx calls useStreamingChat() instead of own SSE handling.
useStreamingChat internally uses chatReducer + React Query:
  Query: Load session messages (cache-first)
  Mutation: Send message → SSE stream → reducer updates
  Optimistic: New user message immediately in cache
```

**Implementation Order:** C2 MUST be sequential within Worker C:
1. First: chatReducer.ts changes (new actions, state shape)
2. Second: useStreamingChat.ts updates (consumes new reducer shape)
3. Third: GeneralChat.tsx migration (delegates to hook)
This prevents type-incompatible changes if both files are modified in parallel.

**Files to modify:**
- `frontend/src/components/GeneralChat/chatReducer.ts` — +4 new actions, tool state
- `frontend/src/hooks/useStreamingChat.ts` — Becomes primary hook, uses reducer internally
- `frontend/src/components/GeneralChat/GeneralChat.tsx` — ~200 lines less, delegates to useStreamingChat

**Tests:** Reducer unit tests for all new actions, hook integration tests.

### C3: Persistent Tool Disclosure

**Problem:** Tool activity disappears once the message is complete. Only visible during streaming.

**Data Model:**
```sql
ALTER TABLE chat_messages ADD COLUMN tool_calls JSONB DEFAULT '[]';
-- Format: [{"name": "web_search", "input": {...}, "duration_ms": 1200, "status": "success"}]
```

**Backend:** In streaming.ts, after each tool_use_end event: collect tool call metadata. On final message save: write tool_calls array to DB.

**Frontend — ToolDisclosure component:**
```
When message.tool_calls.length > 0:
  Collapsed (default): "3 Tools verwendet" with expand chevron
  Expanded: Tool name + duration + status for each tool
  Click on individual tool: Input/output detail panel
  Reuses existing TOOL_LABELS map (49+ labels)
```

**Files to modify:**
- New migration in `phase100_chat_branching.sql` (combined)
- `backend/src/services/claude/streaming.ts` — Collect tool metadata during streaming
- `frontend/src/components/GeneralChat/ChatMessageList.tsx` — ToolDisclosure component
- New component: `frontend/src/components/GeneralChat/ToolDisclosure.tsx`

**Tests:** Backend: tool_calls saved correctly. Frontend: collapse/expand rendering.

### C4: Expandable Thinking UX

**Problem:** Thinking content truncated to 100 chars. Claude.ai shows full expandable thinking.

**New Component: ThinkingBlock**
```
Props: { content: string, isStreaming: boolean }

Collapsed (default):
  "Gedankengang" with expand button, 2-line preview with fade

Expanded:
  Full markdown-rendered thinking content
  During streaming: auto-scroll, pulsing border

aria-expanded toggle, keyboard accessible (Enter/Space)
```

**Data Model:**
```sql
ALTER TABLE chat_messages ADD COLUMN thinking_content TEXT;
```

**Files to modify:**
- New component: `frontend/src/components/GeneralChat/ThinkingBlock.tsx`
- `frontend/src/components/GeneralChat/ChatMessageList.tsx` — Use ThinkingBlock
- `backend/src/services/claude/streaming.ts` — Save thinking_content with message

**Tests:** ThinkingBlock rendering tests (collapsed, expanded, streaming states).

### C5: Auto Session Titles

**Problem:** Chat sessions have no intelligent title.

**Design:**
```
After first assistant response in a new session:
  1. Fire-and-forget Haiku call:
     "Generate a short title (3-6 words) for this conversation:
      User: {first_user_message.substring(0, 200)}
      Assistant: {first_assistant_message.substring(0, 200)}"
  2. UPDATE chat_sessions SET title = $1 WHERE id = $2
  3. Frontend: React Query invalidates session-list cache
  4. Sidebar shows new title immediately
```

**Cost:** 1x Haiku call per new session, ~50 tokens.

**Files to modify:**
- `backend/src/services/claude/streaming.ts` — Title generation after first response
- `frontend/src/components/GeneralChat/ChatSessionSidebar.tsx` — Display title

**Tests:** Unit test for title generation trigger, integration test for cache invalidation.

---

## Worker D: Design System & Polish

### D1: Design System Adoption (Top-10 Migration)

**Problem:** Design system exists but adopted by only 2/40+ components. Neurodesign CSS competes.

**Strategy: Merge, not replace.**

The neurodesign aesthetic IS the ZenAI identity. Solution: integrate neurodesign tokens INTO the design system.

**Step 1 — Extend tokens.ts:**
- New token category: "glass" (backdrop-blur, glass-bg, glass-border)
- New token category: "neuro" (hover-lift, focus-ring, glow)

**Step 2 — Add glass variants to DS components:**
- Button: glass variant (liquid-glass look)
- Card: glass variant (liquid-glass-card)
- Input: glass variant (liquid-glass-input)

**Step 3 — Migrate top-10 patterns:**

| Pattern | Occurrences | Migration |
|---------|-------------|-----------|
| liquid-glass-card | ~40x | `<Card variant="glass">` |
| liquid-glass-input | ~25x | `<Input variant="glass">` |
| neuro-hover-lift buttons | ~30x | `<Button variant="glass">` |
| neuro-focus-ring | ~20x | Global focus style in DS |
| Ad-hoc modal divs | ~15x | `<Modal>` from DS |
| Inline badge spans | ~20x | `<Badge>` from DS |
| Hand-rolled tabs | ~12x | `<Tabs>` from DS |
| Spinner divs | ~10x | `<Skeleton>` from DS |
| Empty state divs | ~8x | `<EmptyState>` from DS |
| Avatar imgs | ~6x | `<Avatar>` from DS |

**Target:** ~186 ad-hoc locations → DS components. Neurodesign.css shrinks ~40%.

**Files to modify:**
- `frontend/src/design-system/tokens.ts` — Glass + neuro tokens
- `frontend/src/design-system/components/Button.tsx` + `.css` — Glass variant
- `frontend/src/design-system/components/Card.tsx` + `.css` — Glass variant
- `frontend/src/design-system/components/Input.tsx` + `.css` — Glass variant
- ~40 component files for pattern migration

**Tests:** Visual regression tests not possible in CLI; verify via TypeScript compilation + build.

### D2: Inline Error Recovery

**Problem:** API errors show only a toast. No retry button, no error state with action.

**Pattern:**
```tsx
// For every React Query that can fail:
if (isError) {
  return (
    <EmptyState
      icon="alert-triangle"
      title="Laden fehlgeschlagen"
      description={getErrorMessage(error)}
      action={{ label: "Erneut versuchen", onClick: () => refetch() }}
    />
  )
}
```

**Apply to 8 main pages:** Dashboard, IdeasPage, PlannerPage, ChatPage, EmailPage, ContactsPage, FinancePage, DocumentVaultPage.

**Files to modify:** 8 page components + error-handler.ts for German messages.

**Tests:** Render tests for error states on each page.

### D3: Navigation Cleanup

**3a: Replace emoji icon fields with Lucide icon references** in navigation.ts NavItem. The `icon` field (emoji strings) is actively used by `MobileSidebarDrawer.tsx` and `Breadcrumbs.tsx` — it is NOT dead code. Replace emoji strings with Lucide icon names (matching the existing `getPageIcon()` pattern in `navIcons.ts`), then update all consumers atomically.

**3b: Extract TopBar component** from AppLayout.tsx inline div.

**3c: Dynamic Quick Access** — Dashboard shows frecency-based shortcuts instead of static 8 items.

**Files to modify:**
- `frontend/src/navigation.ts` — Replace emoji icon field with Lucide icon name string
- `frontend/src/components/layout/MobileSidebarDrawer.tsx` — Use Lucide icon from nav item instead of emoji
- `frontend/src/components/Breadcrumbs.tsx` — Use Lucide icon from nav item instead of emoji
- `frontend/src/components/layout/AppLayout.tsx` — Extract TopBar
- New component: `frontend/src/components/layout/TopBar.tsx`
- `frontend/src/components/Dashboard.tsx` — Frecency-based quick nav

**Tests:** Navigation rendering with Lucide icons, TopBar isolation test, mobile drawer icon rendering.

### D4: React Query Completion

**Migrate 5 remaining pages from useState+axios to React Query:**

| Page | New Hook File | Queries | Mutations |
|------|--------------|---------|-----------|
| BusinessDashboard | `useBusinessData.ts` | revenue, traffic, seo, health | connectService |
| InsightsDashboard | `useInsightsData.ts` | stats, summary, connections, sleep | - |
| LearningDashboard | `useLearningData.ts` | learningTasks, progress | completeTask |
| MyAIPage | `useMyAI.ts` | memoryStats, memoryFacts, voiceSettings | updatePreferences |
| SettingsDashboard | `useSettings.ts` | profile, preferences | updateProfile |

Note: Extensions data fetching is handled by `ExtensionMarketplace` component internally. `useSettings.ts` does NOT duplicate extension queries — it covers only profile and preferences data for the Settings page shell.

**Per migration:**
1. Create hooks/queries/use{Domain}.ts
2. Add query keys to query-keys.ts
3. Extract axios calls into query/mutation functions
4. Replace useState/useEffect in page component
5. Add error state (D2) and loading skeleton
6. Verify: No axios import remaining in page component

**Files to modify:**
- 5 new hook files in `frontend/src/hooks/queries/`
- `frontend/src/lib/query-keys.ts` — 5 new domains
- 5 page components refactored

**Tests:** Hook unit tests for each new domain.

### D5: Confidence Indicators on AI Responses

**Problem:** RAG quality invisible to user.

**Design:**
```
When message.role === 'assistant' && message.metadata?.rag_confidence:
  > 0.75: Green dot + "Hohe Sicherheit" tooltip
  0.45-0.75: Amber dot + "Mittlere Sicherheit" tooltip
  < 0.45: Red dot + "Geringe Sicherheit" tooltip
  No RAG: No badge

Position: Right of message timestamp, subtle.
```

**Backend:** In streaming.ts, on final message save: extract rag_confidence and rag_sources_count from RAG result into message metadata.

**Files to modify:**
- `backend/src/services/claude/streaming.ts` — Save RAG metadata with message
- `frontend/src/components/GeneralChat/ChatMessageList.tsx` — ConfidenceBadge integration

**Tests:** Badge rendering for each confidence tier.

---

## Database Migrations Summary

All migrations in `backend/sql/migrations/phase100_deep_excellence.sql`:

```sql
-- A1: Self-Editing Memory
ALTER TABLE learned_facts ADD COLUMN superseded_by UUID;
ALTER TABLE learned_facts ADD COLUMN supersede_reason TEXT;

-- B2: Persistent Shared Memory
CREATE TABLE agent_shared_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  agent_role TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(execution_id, key)
);
CREATE INDEX idx_shared_memory_exec ON agent_shared_memory(execution_id);

-- C1: Chat Branching
ALTER TABLE chat_messages ADD COLUMN parent_message_id UUID REFERENCES chat_messages(id);
ALTER TABLE chat_messages ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE chat_messages ADD COLUMN is_active BOOLEAN DEFAULT true;
CREATE INDEX idx_chat_messages_parent ON chat_messages(parent_message_id) WHERE parent_message_id IS NOT NULL;

-- C3: Persistent Tool Disclosure
ALTER TABLE chat_messages ADD COLUMN tool_calls JSONB DEFAULT '[]';

-- C4: Thinking Persistence
ALTER TABLE chat_messages ADD COLUMN thinking_content TEXT;

-- All ALTER TABLEs applied to all 4 schemas (personal, work, learning, creative)
-- agent_shared_memory in public schema only
```

## New Files Summary

| File | Worker | Purpose |
|------|--------|---------|
| `backend/src/services/rag-quality-gate.ts` | A | CRAG evaluation logic |
| `backend/src/utils/token-budget.ts` | A | Token counting and budget allocation |
| `backend/sql/migrations/phase100_deep_excellence.sql` | A+B+C | Combined migration |
| `frontend/src/components/GeneralChat/BranchNavigator.tsx` | C | Version navigation UI |
| `frontend/src/components/GeneralChat/ToolDisclosure.tsx` | C | Persistent tool display |
| `frontend/src/components/GeneralChat/ThinkingBlock.tsx` | C | Expandable thinking UI |
| `frontend/src/components/layout/TopBar.tsx` | D | Extracted TopBar component |
| `frontend/src/hooks/queries/useBusinessData.ts` | D | Business page React Query |
| `frontend/src/hooks/queries/useInsightsData.ts` | D | Insights page React Query |
| `frontend/src/hooks/queries/useLearningData.ts` | D | Learning page React Query |
| `frontend/src/hooks/queries/useMyAI.ts` | D | MyAI page React Query |
| `frontend/src/hooks/queries/useSettings.ts` | D | Settings page React Query |

## Modified Files Summary (Key)

| File | Worker | Change |
|------|--------|--------|
| `backend/src/services/tool-handlers/memory-management.ts` | A | 3 new self-editing memory tools |
| `backend/src/services/contextual-retrieval.ts` | A | Template → LLM context generation |
| `backend/src/services/enhanced-rag.ts` | A | CRAG quality gate integration |
| `backend/src/services/memory/episodic-memory.ts` | A | LLM-based consolidation |
| `backend/src/routes/general-chat.ts` | A+C | Context budget + edit/regenerate endpoints |
| `backend/src/services/claude/streaming.ts` | A+C | Memory reflection + tool metadata + thinking + titles |
| `backend/src/services/agents/agent-graph.ts` | B | Parallel node execution |
| `backend/src/services/agent-orchestrator.ts` | B | Parallel strategies + dynamic teams |
| `backend/src/services/memory/shared-memory.ts` | B | Redis + DB persistence layers |
| `backend/src/services/tool-handlers/tool-search.ts` | B | Semantic embedding search |
| `backend/src/services/chat-modes.ts` | B | Heuristic-first detection |
| `frontend/src/components/GeneralChat/GeneralChat.tsx` | C | Unified state via useStreamingChat |
| `frontend/src/components/GeneralChat/chatReducer.ts` | C | 4 new actions, tool state |
| `frontend/src/hooks/useStreamingChat.ts` | C | Primary chat hook |
| `frontend/src/components/GeneralChat/ChatMessageList.tsx` | C+D | Edit/regenerate/tools/thinking/confidence |
| `frontend/src/design-system/tokens.ts` | D | Glass + neuro token categories |
| `frontend/src/design-system/components/Button.tsx` | D | Glass variant |
| `frontend/src/design-system/components/Card.tsx` | D | Glass variant |
| `frontend/src/navigation.ts` | D | Remove dead icon field |
| `frontend/src/lib/query-keys.ts` | D | 5 new domains |
