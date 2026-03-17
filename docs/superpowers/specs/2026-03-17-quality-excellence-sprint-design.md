# Quality Excellence Sprint — Phase 97 Design Spec

> **Goal**: Massive quality uplift across all 12 system areas, fixing critical vulnerabilities, improving AI reliability, and hardening production infrastructure.

## Scope: 4 Parallel Workstreams

### Worker 1: Backend Security + DB Architecture

**CRITICAL fixes:**
1. **SQL Injection in `set_config()`** — `database-context.ts:323` uses string interpolation for userId. Change to parameterized query.
2. **Encryption Key enforcement** — `field-encryption.ts` silently returns plaintext when `ENCRYPTION_KEY` missing in production. Must throw.
3. **Missing DB indexes** — 75% of tables lack indexes. Add composite indexes for (user_id, created_at DESC) on all major tables.
4. **Foreign Key constraints** — user_id columns have no FK to public.users. Add constraints.
5. **Health endpoint auth** — `/api/health/detailed` checks Bearer prefix, not actual key. Fix.
6. **Audit logger error propagation** — Critical security events silently fail. Propagate errors for critical severity.
7. **Auth rate limiting** — Login/register/MFA endpoints lack auth-tier rate limits. Add 10/min.
8. **API key scope validation** — Admin endpoints don't check `requireScope('admin')`. Add.
9. **Partial indexes** — Add WHERE is_archived=false partial indexes for active record queries.
10. **CHECK constraints** — Add context enum constraints on relevant tables.

### Worker 2: AI/LLM Core + RAG Pipeline

**CRITICAL fixes:**
1. **Temperature bug** — `streaming.ts` DEFAULT_OPTIONS `temperature: 1` is wrong for non-thinking queries. Should be 0.7 for conversation, 1.0 only when thinking enabled.
2. **Token counting** — `chat-messages.ts:462` uses 4-chars/token heuristic (15-25% off). Replace with proper estimation using Anthropic's tokenizer approach.
3. **Request correlation IDs** — Add requestId to all Claude API calls, streaming, and tool execution for end-to-end tracing.
4. **RAG cache invalidation** — Context-level invalidation is too broad. Implement idea-level cache invalidation.
5. **Cross-encoder fallback** — Add heuristic fallback re-ranker when cross-encoder fails.
6. **A-RAG early exit threshold** — Reduce from 0.9 to 0.75 to avoid unnecessary iterations.
7. **JSON extraction improvement** — 5-layer fallback in helpers.ts masks bad prompts. Add structured output instructions to system prompts.
8. **Model version configuration** — Hardcoded model IDs. Move to config with graceful fallback.
9. **SSE tool output size limit** — Add 64KB limit + chunking for large tool results.
10. **Streaming abort lifecycle** — Cancel tool execution loops when client disconnects.

### Worker 3: Agent System + MCP + Memory

**CRITICAL fixes:**
1. **MCP input validation** — External tool inputs not validated against inputSchema before execution. Add JSON Schema validation.
2. **Agent timeout enforcement** — No per-agent timeout. Add configurable timeout (default 60s).
3. **Agent error recovery** — Implement exponential backoff (not immediate retry). Add context-aware retry with failure reason.
4. **Shared memory persistence** — In-memory only TeamStore lost on crash. Persist to Redis.
5. **MCP protocol version negotiation** — Hardcoded '2024-11-05'. Implement proper version negotiation.
6. **MCP stdio timeout** — stdio transport has no timeout (can hang forever). Add 30s default.
7. **Sleep cycle race conditions** — Add distributed lock (Redis) before consolidation to prevent concurrent runs.
8. **Embedding dimension validation** — Assert all embeddings match pgvector schema dimension.
9. **Entity resolution batching** — Fire-and-forget entity extraction per fact = unbounded Claude API calls. Batch.
10. **Agent token enforcement** — No hard limit on token spend per agent. Add max_tokens guard.

### Worker 4: Frontend Quality

**HIGH fixes:**
1. **React Query expansion** — Only 4 hooks for entire app. Add hooks for: chat sessions, settings, calendar, email, canvas, voice, browser, finance.
2. **Session race condition** — `initialSessionId` in GeneralChat can toggle rapidly causing double-loads. Add dependency key.
3. **Accessibility: aria-live** — ChatMessageList needs `aria-live="polite"` for screen reader announcements.
4. **Console.log cleanup** — 44 console.log/warn/error statements. Replace with environment-gated logger.
5. **Tool results bounded** — `toolResults` array grows unbounded. Add max length (50).
6. **Navigation consolidation** — Nav items defined in 4 places. Export derived data from navigation.ts.
7. **Query key serialization** — Object filters as query keys cause cache misses. Serialize with JSON.stringify.
8. **Error boundaries for code splits** — Lazy-loaded components lack error boundary wrappers.
9. **Badge memoization** — getBadgeValue() recalculates per render. Wrap with useMemo.
10. **Thinking mode context-awareness** — Filter thinking modes based on active context.

## Success Criteria

- All CRITICAL security fixes applied (SQL injection, encryption, auth)
- Temperature bug fixed (measurable in chat quality)
- Token counting accuracy improved to <5% error
- RAG cache invalidation at idea-level
- Agent system has timeouts + error recovery
- MCP tool execution validated against schema
- React Query hooks cover all major API domains
- Accessibility: aria-live on chat, aria-labels on all interactive elements
- DB indexes on all user_id + created_at patterns
- All tests pass (5286+ existing + new)
