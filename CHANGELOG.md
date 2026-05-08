# Changelog

All notable changes to ZenAI's public mirror are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

ZenAI's public mirror is a snapshot of the production platform with internal documents, paper sources, and operational runbooks excluded. Functionality entries below refer to the production platform; what's actually exposed in the mirror is the corresponding source code and tests.

## [Unreleased] — 2026-05-08

### Sync to Phase 145 + Sprints 1.1–1.10

Snapshot mirror catch-up after a one-month gap (last sync was 2026-04-07).

**Added (production platform features now reflected in mirror):**
- **Phase 145 — Predictive Memory Architecture (PMA):** 6 new memory services (NeuromodulatorEngine, ReconsolidationEngine, TripleCopyMemory, PriorityMap, StabilityProtector, MetacognitiveMonitor, SemanticPreClusterer, STC Rescue), 9 new tables, 13 new API endpoints, 443 new tests.
- **Sprint 1.1–1.10 (Security/DSGVO):** field encryption + rotation, RLS-per-context, SSRF + DNS-rebind protection, prompt-injection guardrails, content-moderation 3-tier, consent center + DSAR + account deletion, AI output badges (EU AI Act Art. 50), IP truncation (GDPR), Stripe webhook dedup + replay, SIEM forwarder, pentest suite, plan-in-JWT.
- **Phase 143 — Agent Ecosystem Expansion:** 8 built-in agents, blueprint registry, NL agent builder, cross-learning, smart triggers, agent analytics, A2A discovery, marketplace. 222 new backend tests.
- **Phase 142 — V4 Phase 2 Deep Integration:** Multi-LLM routing, AG-UI Protocol cognitive events, Adaptive Thinking SSE tier, GraphRAG event recording, HyperAgents bridge.
- **`@zensation/cli@0.1.1` published:** ZenAI CLI Agent (Claude Code-style filesystem tools + backend bridge).

**Changed:**
- Test totals: 11,589 → 12,000+ across backend + frontend.
- Codebase: 322K+ LOC → 440K+ LOC TypeScript.

**Removed (anonymity-preserving / hygiene):**
- `docs/papers/` — paper sources, build scripts, results, LaTeX bundles. These belong to the private working tree, not the public mirror.
- `docs/superpowers/`, `docs/brand/`, `website/` — pre-existing internal-only paths that had slipped into the public mirror.
- `docs/NEURIPS-9-ALGORITHMS.md`, internal sprint specs, infrastructure-audit reports, security-audit reports, marketing logs, funding-application docs (`docs/foerderung/`).
- `ZENBRAIN_FEATURES` enumeration in `backend/src/algorithms/ablation.ts` — only kept the `PMA_FEATURES` table that is actually imported by production code.

---

## [4.0.0] — 2026-03-30

### Public release

ZenAI is open-sourced as a self-hosted AI platform with neuroscience-inspired memory.

- 60 AI tools across 14 categories.
- 7-layer memory architecture (Working, Short-Term, Episodic, Semantic, Procedural, Core, Cross-Context) powered by [ZenBrain](https://github.com/zensation-ai/zenbrain).
- 4 isolated context schemas (operations, finance, people, strategy).
- Multi-agent system with debate protocol.
- HyDE + Cross-Encoder + GraphRAG hybrid RAG pipeline.
- Real-Time Voice (WebSocket STT/TTS).
- Extended Thinking with budget management.
- Sleep-Time Compute background consolidation.
- MCP Ecosystem for external tool integration.

Sanitization commit `333f7031` ("prepare repo for public zenai release") removed demo emails, hardcoded production URLs, internal CLAUDE.md, and ~40 internal planning documents.

[Unreleased]: https://github.com/zensation-ai/zenai/compare/v4.0.0...HEAD
[4.0.0]: https://github.com/zensation-ai/zenai/releases/tag/v4.0.0
