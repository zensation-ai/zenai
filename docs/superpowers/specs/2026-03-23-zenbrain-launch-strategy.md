# ZenBrain Launch Strategy & Business Plan

> **Status:** Approved
> **Date:** 2026-03-23
> **Author:** Alexander Bering + Claude (Strategic Analysis)
> **Scope:** Brand consolidation, GitHub open-source launch, monetization roadmap

---

## 1. Executive Summary

ZenBrain is the neuroscience-inspired memory system extracted from the ZenAI platform (KI-AB codebase, 170K LOC, Phase 141). It will be published as an open-source npm package (Apache 2.0) on GitHub under a new `zensation` organization, positioned as the technically deepest AI memory system available — surpassing Mem0 (2 layers, $24M funding), Letta (3 layers, $10M funding), and Zep (2 layers) with a 7-layer architecture featuring FSRS spaced repetition, Hebbian learning, emotional tagging, and Ebbinghaus decay curves.

**Strategy:** ZenBrain First (Open Core) → ZenAI Platform (Month 3) → Cloud API Revenue → Seed Funding.

**Target (Optimistic):** 1,000+ GitHub stars in 60 days, first revenue in 90 days.
**Target (Realistic):** 300+ stars in 60 days, first revenue in 120 days.
**Target (Pessimistic):** 100+ stars in 60 days — trigger pivot to consulting-led growth.

> **Note:** Consulting revenue (zensation.sh) is ACTIVE income from existing regional clients. This is the bridge, not aspirational.

---

## 2. Market Analysis

### 2.1 Validated Market

| Competitor | Funding | Stars | Focus | Layers |
|-----------|---------|-------|-------|--------|
| Mem0 | $24M (Seed + A) | 41K+ | Memory API | 2 |
| Letta/MemGPT | $10M (Series A) | 21.7K | Agent Framework + Memory | 3 |
| Zep/Graphiti | $4M+ | 5K+ | Temporal Knowledge Graph | 2 |
| **ZenBrain** | **$0** | **0** | **Neuroscience Memory** | **7** |

### 2.2 Technical Differentiation

| Feature | ZenBrain | Mem0 | Letta | Zep |
|---------|----------|------|-------|-----|
| Memory Layers | 7 (Working/STM/Episodic/LTM/Procedural/Core/Cross-Context) | 2 (Short/Long) | 3 (Core/Conv/Archival) | 2 (Facts/Graphs) |
| Spaced Repetition (FSRS) | Yes | No | No | No |
| Hebbian Learning | Yes | No | No | No |
| Emotional Memory | Yes (Arousal/Valence/Significance) | No | No | No |
| Ebbinghaus Decay | Yes (Exponential curves) | No | No | No |
| Self-Editing Memory | Yes | No | Yes | No |
| Context Isolation | Yes (4 schemas) | No | No | No |
| Sleep Consolidation | Yes (Background compute) | No | No | No |
| Bayesian Confidence | Yes | No | No | No |

### 2.3 Ecosystem Analysis

**Python dominates AI agents:** LangChain 47M+ PyPI downloads, LangGraph 34.5M/month. Mem0 and Letta are Python-first.

**TypeScript is growing:** Next.js/Vercel AI SDK ecosystem, browser-compatible, Mem0 offers both pip + npm.

**Strategy:** npm-first (code is TypeScript), Python port in Month 2-3.

---

## 3. Brand Architecture

### 3.1 Domain Strategy

| Domain | Role | Action |
|--------|------|--------|
| **zensation.ai** | Parent brand website | UPDATE: Add /open-source, /developers, /consulting |
| **zensation.sh** | Regional consulting | REDIRECT: 301 to zensation.ai/consulting |
| **zensation.app** | Consumer family apps | KEEP: Separate segment, add footer link to .ai |

### 3.2 Product Hierarchy

```
ZenSation Enterprise Solutions (zensation.ai)
├── Open Source
│   ├── ZenBrain (Memory System) ← PRIMARY FOCUS
│   └── ZenAI (Full AI Platform) ← PHASE 2
├── Cloud Products
│   ├── ZenBrain Cloud API
│   ├── ZenSales (CRM)
│   ├── ZenFlow (Automation)
│   ├── ZenInsight (Analytics)
│   ├── ZenAssist (Support)
│   └── ZenAgents (AI Agents)
├── Consulting (ex zensation.sh)
│   └── Regional AI Consulting (Schleswig-Holstein)
└── Consumer (zensation.app)
    └── Family Flow
```

### 3.3 GitHub Organization

**New org:** `zensation` (to be created)

**Public repos:**

| Repo | Description | Phase |
|------|-------------|-------|
| `zensation/zenbrain` | Neuroscience-inspired memory for AI agents | Week 1 |
| `zensation/zenai` | AI OS powered by ZenBrain | Month 3 |
| `zensation/.github` | Org profile + templates | Week 1 |
| `zensation/zenbrain-python` | Python port | Month 2-3 |
| `zensation/awesome-ai-memory` | Curated list (SEO) | Month 2 |

**Existing org (`Alexander-Bering`):** Keep for private/internal repos.

**Personal account (`goldfinger2025`):**
- Archive 24 old repos (Lead-Management, EWS, PV, etc.)
- Delete 3 irrelevant public repos
- Keep 6 active project repos (private)

---

## 4. ZenBrain Package Architecture

### 4.1 Monorepo Structure

```
zensation/zenbrain/
├── packages/
│   ├── algorithms/              # @zenbrain/algorithms
│   │   ├── src/
│   │   │   ├── fsrs.ts              # FSRS Spaced Repetition
│   │   │   ├── ebbinghaus.ts        # Exponential Decay Curves
│   │   │   ├── emotional.ts         # Arousal/Valence/Significance Tagging
│   │   │   ├── hebbian.ts           # Co-Activation Learning
│   │   │   ├── bayesian.ts          # Confidence Propagation
│   │   │   ├── context-retrieval.ts # Encoding Specificity
│   │   │   ├── similarity.ts        # String/Name Similarity
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   ├── package.json
│   │   └── README.md
│   │
│   ├── core/                    # @zenbrain/core
│   │   ├── src/
│   │   │   ├── interfaces/
│   │   │   │   ├── storage.ts       # StorageAdapter
│   │   │   │   ├── embedding.ts     # EmbeddingProvider
│   │   │   │   ├── llm.ts           # LLMProvider
│   │   │   │   └── cache.ts         # CacheProvider
│   │   │   ├── layers/
│   │   │   │   ├── working.ts       # Layer 1: Working Memory (active focus)
│   │   │   │   ├── short-term.ts    # Layer 2: Short-Term/Session Memory
│   │   │   │   ├── episodic.ts      # Layer 3: Episodic Memory (experiences)
│   │   │   │   ├── semantic.ts      # Layer 4: Long-Term Semantic Memory
│   │   │   │   ├── procedural.ts    # Layer 5: Procedural Memory (how-to)
│   │   │   │   ├── core.ts          # Layer 6: Core Memory (pinned facts)
│   │   │   │   └── cross-context.ts # Layer 7: Cross-Context Memory
│   │   │   ├── coordinator.ts       # Memory Orchestrator
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   ├── package.json
│   │   └── README.md
│   │
│   └── adapters/
│       ├── postgres/            # @zenbrain/adapter-postgres
│       ├── sqlite/              # @zenbrain/adapter-sqlite
│       ├── openai/              # @zenbrain/adapter-openai
│       └── anthropic/           # @zenbrain/adapter-anthropic
│
├── apps/
│   └── playground/              # Interactive demo (Next.js)
│
├── docs/
│   ├── getting-started.md
│   ├── architecture.md
│   ├── vs-mem0.md
│   ├── vs-letta.md
│   └── api-reference.md
│
├── examples/
│   ├── basic-chatbot.ts
│   ├── with-langchain.ts
│   ├── with-crewai.ts
│   └── with-claude.ts
│
├── README.md                    # Killer README
├── LICENSE                      # Apache 2.0
├── CONTRIBUTING.md
├── SECURITY.md
├── turbo.json                   # Turborepo config
└── .github/
    ├── workflows/ci.yml
    └── ISSUE_TEMPLATE/
```

### 4.2 Extraction Tiers

**Tier 1 — Pure Algorithms (Week 1, trivial effort):**

| Source File (KI-AB) | Target | Lines | Dependencies |
|---------------------|--------|-------|-------------|
| `memory/fsrs-scheduler.ts` | `algorithms/fsrs.ts` | 347 | Logger only |
| `memory/ebbinghaus-decay.ts` | `algorithms/ebbinghaus.ts` | 415 | Logger + FSRS |
| `memory/emotional-tagger.ts` | `algorithms/emotional.ts` | 406 | Logger only |
| `memory/context-enrichment.ts` | `algorithms/context-retrieval.ts` | ~150 | Logger only |
| `knowledge-graph/hebbian-dynamics.ts` (pure fns) | `algorithms/hebbian.ts` | 82 | None |
| `knowledge-graph/confidence-propagation.ts` (pure fn) | `algorithms/bayesian.ts` | 28 | None |
| `memory/ltm-utils.ts` | `algorithms/similarity.ts` | ~100 | Logger only |

**Total Tier 1: ~1,528 LOC, 7 files. Effort: 1-2 days.**

**Tier 2 — Core with Interfaces (Week 3-4, medium effort):**

4 adapter interfaces needed: StorageAdapter, EmbeddingProvider, LLMProvider, CacheProvider.

| Source File | Target | Abstraction Needed |
|------------|--------|-------------------|
| `memory/core-memory.ts` | `core/layers/core.ts` | StorageAdapter (5 queries) |
| `memory/procedural-memory.ts` | `core/layers/procedural.ts` | StorageAdapter + EmbeddingProvider |
| `memory/working-memory.ts` | `core/layers/working.ts` | EmbeddingProvider + CacheProvider |
| `memory/memory-coordinator.ts` | `core/coordinator.ts` | All interfaces |

**Tier 3 — Full System (Month 3, with ZenAI platform):**

Episodic memory, long-term memory, sleep compute, cross-context merger — published as part of `zensation/zenai`.

### 4.3 Existing Tests (Extractable)

| Test File | Lines | Extractable |
|-----------|-------|-------------|
| `fsrs-scheduler.test.ts` | ~200 | Fully |
| `neuroscience-memory.test.ts` | ~300 | Fully |
| `hebbian-dynamics.test.ts` | ~150 | Partially (pure fn tests) |
| `confidence-propagation.test.ts` | ~120 | Partially (pure fn tests) |
| `core-memory.test.ts` | ~180 | After adapter abstraction |

---

## 5. README Strategy

### 5.1 Structure (based on Mem0/Dify best practices)

1. Hero banner (custom designed)
2. Badge row (npm downloads, GitHub stars, Discord, License, CI)
3. One-liner tagline
4. "Why ZenBrain?" — benchmark comparison with hard numbers
5. Quick Start (npm install + 5-line example)
6. Feature comparison table vs Mem0/Letta/Zep
7. Architecture diagram (Mermaid — 7 layers)
8. Code examples (basic, with LangChain, with Claude)
9. Documentation links
10. Community (Discord, Twitter, Contributing)
11. Star history chart
12. License (Apache 2.0)

### 5.2 Key Messages

- "7-layer memory architecture inspired by human neuroscience"
- "FSRS spaced repetition — your AI never forgets what matters"
- "Hebbian learning — memories that strengthen through use"
- "Emotional tagging — AI that remembers what moved you"
- "The deepest memory system for AI agents. Open source."

---

## 6. Launch Strategy

### 6.1 Pre-Launch (Weeks 1-4)

| Week | Tasks | Deliverables |
|------|-------|-------------|
| **1** | Create GitHub org, extract @zenbrain/algorithms, write README, add LICENSE | npm package published, GitHub repo live |
| **2** | Discord server, docs basics, demo GIF, blog post draft | Community infrastructure |
| **3** | @zenbrain/core + adapter interfaces | Core package on npm |
| **4** | @zenbrain/adapter-postgres, playground demo | Working end-to-end demo |

### 6.2 Launch Day (Week 5, Sunday)

| Time (CET) | Channel | Action |
|------------|---------|--------|
| 07:00 | Hacker News | "Show HN: ZenBrain — Neuroscience-Inspired Memory for AI Agents (7 layers, FSRS, Hebbian learning)" |
| 08:00 | Reddit | r/LocalLLaMA, r/selfhosted, r/MachineLearning |
| 09:00 | Twitter/X | Thread: Problem → Solution → Demo GIF → Comparison table → Link |
| 10:00 | Dev.to | "Why AI Memory Needs Neuroscience: Building a 7-Layer Memory System" |
| 16:00 (Tue) | Product Hunt | Launch with screenshots + maker comment (Tue-Thu best) |

### 6.3 Post-Launch (Weeks 6-8)

- Respond to every GitHub issue within 4 hours
- Weekly changelog blog posts
- Integration examples (LangChain, CrewAI, Vercel AI SDK)
- Start Python port
- Set up ZenBrain Cloud API infrastructure

### 6.4 Growth Targets

| Milestone | Target Date | Metric |
|-----------|------------|--------|
| First 100 stars | Week 5 (launch day) | GitHub stars |
| 500 stars | Week 7 | GitHub stars |
| 1,000 stars | Month 2 | GitHub stars |
| 100 npm downloads/week | Month 2 | npm stats |
| 5,000 stars | Month 4 | GitHub stars |
| 10,000 stars | Month 6-9 | Fundraising threshold |

---

## 7. Monetization Roadmap

### 7.1 Revenue Streams

| Stream | Launch | Price | Target |
|--------|--------|-------|--------|
| **Consulting** (zensation.sh → .ai/consulting) | Active | EUR 100-150/h | EUR 3-8K/month (bridge) |
| **GitHub Sponsors** | Week 5 | Tiers: $5/$25/$100 | EUR 200-500/month |
| **ZenBrain Cloud API** | Month 3 | Free / Pro $49/mo / Enterprise custom | EUR 1-5K/month |
| **ZenAI Platform SaaS** | Month 4 | Free / Pro $29/mo / Enterprise custom | EUR 2-10K/month |
| **Enterprise Self-Hosted** | Month 6 | $500-2000/month | EUR 5-20K/month |

### 7.2 ZenBrain Cloud API Pricing

| Tier | Price | Limits |
|------|-------|--------|
| **Free** | $0/month | 1,000 memory ops/day, 1 context, community support |
| **Pro** | $49/month | 50,000 ops/day, 4 contexts, email support, analytics |
| **Enterprise** | Custom | Unlimited, self-hosted option, SSO, audit logs, SLA |

### 7.3 Financial Projections

**Assumptions:** 1-3% conversion rate from active open-source users to paid (industry standard). "Active users" = weekly npm downloads / 10.

**Realistic Scenario:**

| Month | Consulting | Sponsors | Cloud API | Total |
|-------|-----------|----------|-----------|-------|
| 1 | EUR 5,000 | EUR 0 | EUR 0 | EUR 5,000 |
| 3 | EUR 5,000 | EUR 200 | EUR 0 | EUR 5,200 |
| 6 | EUR 4,000 | EUR 400 | EUR 1,000 | EUR 5,400 |
| 9 | EUR 3,000 | EUR 500 | EUR 3,000 | EUR 6,500 |
| 12 | EUR 2,000 | EUR 500 | EUR 7,000 | EUR 9,500 |

**Optimistic Scenario (viral launch + early enterprise):**

| Month | Consulting | Sponsors | Cloud API | Total |
|-------|-----------|----------|-----------|-------|
| 6 | EUR 3,000 | EUR 500 | EUR 5,000 | EUR 8,500 |
| 12 | EUR 1,000 | EUR 500 | EUR 15,000 | EUR 16,500 |

> Note: Consulting is existing active revenue from zensation.sh regional clients, not aspirational.

### 7.4 Seed Funding Path

**Prerequisite:** 10,000+ GitHub stars + EUR 5K+ MRR
**Realistic timeline:** Month 9-12 (earliest — requires optimistic growth scenario)
**Fallback:** If stars < 5K at Month 6, pivot to bootstrapped SaaS + consulting hybrid.

**Target:** EUR 500K - 2M Seed (German/EU AI fund landscape)

**Potential investors:**
- German: HTGF, Cavalry Ventures, Cherry Ventures, Earlybird
- EU AI-focused: Air Street Capital, Balderton
- YC S26/W27 application

---

## 8. GitHub Account Cleanup

### 8.1 Personal Account (goldfinger2025)

**Archive (24 repos):**
- lagerkritikalit-t, PX, installateursuche, enterprise-crm-pv-sap
- V5-Lead-Manager, New-Leadmanagement-EWS, EWS-Website
- Google-Solar-CRM, EMP, EWS-JSE, EWS-Management-2026
- 2025-11-27-1312-Wochenbericht, Visual-Pv-JSE, Neu-EWS-JSE-Test
- Strategie-2026, 16-11-ai-studi-lead-management-new, lead-dahsboard
- NEUSTART, jse, 2025-10-14-Issue-Benchmark, R1-Leadmanagement
- Wg_KD_Analyse, Ai-Studio---Team-Performance

**Delete (3 public repos):**
- Gewerbespeicher, Handwerker-Pro, Wochenbericht-Distribution-Claude-Based

**Keep (private):** Active projects only

### 8.2 Organization (Alexander-Bering)

**Keep as-is:** Internal/private repos for active development. Do not make public.

### 8.3 New Organization (zensation)

**Create with:**
- Display name: "ZenSation"
- Bio: "Neuroscience-inspired AI tools. Open source."
- Website: https://zensation.ai
- Location: Kiel, Germany
- Profile README with links to ZenBrain + docs

---

## 9. Website Updates

### 9.1 zensation.ai Changes

**New navigation:**
```
Products ▾  |  Open Source  |  Developers  |  Pricing  |  Blog
```

**New pages:**
- `/open-source` — ZenBrain overview, GitHub link, community
- `/developers` — API docs, SDK reference, tutorials
- `/consulting` — Content from zensation.sh (301 redirect)
- `/products/zenbrain` — Cloud API pricing, dashboard access

### 9.2 zensation.sh

**Action:** Configure 301 redirect to `zensation.ai/consulting`

### 9.3 zensation.app

**Action:** Add footer link "Built by ZenSation" → zensation.ai

---

## 10. KI-AB → ZenAI Platform (Phase 2, Month 3)

### 10.1 Pre-Publication Checklist

- [ ] Replace 5 hardcoded URLs with environment variables
  - `backend/src/middleware/security-headers.ts` (Railway URL)
  - `backend/src/services/business/lighthouse-connector.ts` (Vercel URL)
  - `backend/src/services/business/data-aggregator.ts` (Vercel URL)
  - `packages/electron/src/main.ts` (Vercel + Railway URLs)
  - `frontend/capacitor.config.ts` (Vercel URL)
- [ ] Sanitize CLAUDE.md (remove prod infrastructure details)
- [ ] Rewrite README.md (Phase 141 features, not Phase 21)
- [ ] Create CONTRIBUTING.md
- [ ] Create SECURITY.md
- [ ] Remove demo data with @zensation.ai emails
- [ ] Verify .env.example is complete and well-documented
- [ ] Add LICENSE (Apache 2.0)
- [ ] Create .github/ISSUE_TEMPLATE/ files
- [ ] Test fresh clone + setup experience

### 10.2 Positioning

"ZenAI — The AI OS that remembers. Self-hosted alternative to ChatGPT with neuroscience-inspired memory. Built on ZenBrain."

### 10.3 Repo Name

`zensation/zenai` — published under the new org.

---

## 11. Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Fork steals thunder | Medium | Medium | Apache 2.0 allows this; cloud API is the moat |
| No traction on launch | Medium | High | Multi-channel launch, iterate on messaging |
| Support burden | High | Medium | CONTRIBUTING.md, issue templates, Discord community |
| Competitor copies features | Medium | Low | First-mover advantage, deeper architecture |
| Burnout (solo founder) | High | High | Priority cuts if overloaded: 1) Drop Python port, 2) Defer enterprise tier, 3) Defer awesome-ai-memory repo. Core path: algorithms → core → launch. Everything else is optional. |
| API key exposure in git | Low | High | Already verified clean; .gitignore robust |

---

## 12. Success Metrics

### 12.1 Month 1 (Post-Launch)

- [ ] 300+ GitHub stars
- [ ] @zenbrain/algorithms published on npm
- [ ] Discord community with 50+ members
- [ ] 3+ external contributors (issues/PRs)

### 12.2 Month 3

- [ ] 1,000+ GitHub stars
- [ ] @zenbrain/core published on npm
- [ ] ZenBrain Cloud API live (free tier)
- [ ] ZenAI platform published
- [ ] First non-consulting revenue

### 12.3 Month 6

- [ ] 5,000+ GitHub stars
- [ ] Python package published
- [ ] EUR 5K+ MRR (cloud + enterprise)
- [ ] 10+ enterprise inquiries

### 12.4 Month 12

- [ ] 10,000+ GitHub stars
- [ ] EUR 15K+ MRR
- [ ] Seed funding conversations active
- [ ] 3+ paying enterprise customers

---

## 13. CI/CD & Infrastructure

### 13.1 GitHub Actions CI Pipeline

```yaml
# .github/workflows/ci.yml
- Lint (ESLint + TypeScript strict)
- Test (all packages, Node 18 + 20)
- Build (turbo build)
- Publish (npm publish --provenance on tag push)
- Docs (deploy docs site on main push)
```

### 13.2 Docker Quickstart

For the r/selfhosted community, provide a Docker Compose quickstart:

```yaml
# docker-compose.yml (in repo root)
services:
  playground:
    build: apps/playground
    ports: ["3000:3000"]
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - DATABASE_URL=postgres://zenbrain:zenbrain@db:5432/zenbrain
  db:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: zenbrain
      POSTGRES_USER: zenbrain
      POSTGRES_PASSWORD: zenbrain
```

**Timeline:** Week 4 (with playground app).

### 13.3 SQLite Adapter Timeline

`@zenbrain/adapter-sqlite` is critical for zero-config adoption (no PostgreSQL needed for development/testing).

**Timeline:** Week 5 (before launch). Ships with `better-sqlite3` + `sqlite-vec` for vector search.

### 13.4 Security Review Checklist (ZenBrain extraction)

Before publishing @zenbrain packages:
- [ ] No internal database schema names (personal, work, learning, creative)
- [ ] No ZenAI-specific API patterns or endpoint URLs
- [ ] No reference to queryContext, AIContext, or ZenAI service imports
- [ ] No @zensation.ai email addresses in code or tests
- [ ] All interfaces use generic types, not ZenAI-specific ones
- [ ] Run `grep -r "zensation\|railway\|supabase\|vercel" packages/` = 0 results

---

## Appendix A: Competitor README Patterns

### Mem0 README Structure
1. Hero banner → 2. Badges (Trendshift, Discord, PyPI, npm, YC) → 3. Research highlights (+26% vs OpenAI) → 4. Introduction → 5. Key features → 6. Quickstart (Hosted + Self-Hosted) → 7. Usage example → 8. Integrations → 9. Docs → 10. Citation → 11. License

### Dify README Structure
1. Hero banner → 2. Massive badge row (13 badges) → 3. 13-language translations → 4. Quick Start (4-line Docker Compose) → 5. Key features → 6. Comparison table (vs LangChain, Flowise, OpenAI) → 7. Using Dify → 8. Advanced setup → 9. Contributing → 10. Community → 11. Star history chart → 12. License

### Letta README Structure
1. Logo (dark/light) → 2. Heading with "(formerly MemGPT)" → 3. CLI quickstart → 4. API quickstart → 5. Installation → 6. Hello World (Python + TypeScript side-by-side) → 7. Contributing

---

## Appendix B: Launch Channel Benchmarks

| Channel | Expected Stars (Week 1) | Best Practices |
|---------|------------------------|----------------|
| Hacker News | 100-300 | Sunday 6-7 AM UTC, "Show HN:" prefix |
| Reddit r/LocalLLaMA | 200-500 | Privacy/local-first angle |
| Reddit r/selfhosted | 100-200 | Docker Compose quickstart essential |
| Product Hunt | 50-150 | Tuesday-Thursday, 10 AM ET |
| Twitter/X | 50-100 | Thread format, demo GIF, tag influencers |
| Dev.to | 50-200 | "How I built..." article |
| **Combined** | **300-1,000** | Coordinated 48-hour window |

---

## Appendix C: ZenBrain Package Dependencies

### @zenbrain/algorithms — Zero external dependencies

Pure TypeScript, no runtime dependencies. Only dev dependencies for testing/building.

### @zenbrain/core — Minimal dependencies

- `@zenbrain/algorithms` (internal)
- No other runtime dependencies (adapters are separate packages)

### Adapter packages — Specific to provider

- `@zenbrain/adapter-postgres`: `pg`, `pgvector`
- `@zenbrain/adapter-sqlite`: `better-sqlite3`
- `@zenbrain/adapter-openai`: `openai`
- `@zenbrain/adapter-anthropic`: `@anthropic-ai/sdk`
