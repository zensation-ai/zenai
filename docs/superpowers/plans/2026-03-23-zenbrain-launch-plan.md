# ZenBrain Launch — Full Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Launch ZenBrain as open-source npm package, clean up GitHub presence, prepare marketing channels, and publish the ZenAI platform — in a structured 8-week rollout.

**Architecture:** Monorepo (Turborepo) with 3 npm packages extracted from KI-AB. GitHub org `zensation-ai` (because `zensation` is taken). Apache 2.0 license. Multi-channel launch campaign.

**Tech Stack:** TypeScript, Turborepo, Vitest, npm provenance, GitHub Actions CI, Docusaurus docs

**Spec Reference:** `docs/superpowers/specs/2026-03-23-zenbrain-launch-strategy.md`

**Spec Deviations:**
- GitHub org is `zensation-ai` (not `zensation` — that name is taken by a Thailand-based studio)
- Public repos are made private/archived (not deleted — preserves git history as safety net)
- `lagerkritikalit-t` stays non-archived (active project, contains client data — must stay private but usable)
- `awesome-ai-memory` repo deferred to Month 3+ (low priority vs core launch)
- Adapter packages (`openai`, `anthropic`) deferred to post-launch (Week 7-8)
- Playground app is a minimal Express demo (not full Next.js — scope reduction for solo founder)

**Timeline:** Day 1 = first execution day. Launch Day = ~5 weeks from Day 1 (first Sunday after Week 4 completion). Target: **Sunday, April 27, 2026** if starting March 24.

---

## Chunk 1: GitHub Cleanup & Security (Day 1)

### Task 1.1: Secure Public Repos Immediately

**CRITICAL: Gewerbespeicher is PUBLIC with business valuation data.**

**Files:** None (GitHub API operations)

- [ ] **Step 1: Make Gewerbespeicher private**

```bash
gh api repos/goldfinger2025/Gewerbespeicher \
  -X PATCH -f visibility=private
```

Expected: `"visibility": "private"`

- [ ] **Step 2: Archive Handwerker-Pro**

```bash
gh api repos/goldfinger2025/Handwerker-Pro \
  -X PATCH -f archived=true -f visibility=private
```

- [ ] **Step 3: Archive Wochenbericht-Distribution-Claude-Based**

```bash
gh api repos/goldfinger2025/Wochenbericht-Distribution-Claude-Based \
  -X PATCH -f archived=true -f visibility=private
```

- [ ] **Step 4: Verify no public repos remain**

```bash
gh repo list goldfinger2025 --public --json name
```

Expected: `[]` (empty array)

- [ ] **Step 5: Commit checkpoint**

No git commit needed — these are GitHub API operations.

---

### Task 1.2: Archive Old Private Repos

Archive 20+ inactive repos to clean up the account. These stay private but get marked as archived (read-only).

- [ ] **Step 1: Archive old EWS/Lead/PV repos (batch)**

```bash
for repo in PX installateursuche enterprise-crm-pv-sap \
  V5-Lead-Manager New-Leadmanagement-EWS EWS-Website \
  Google-Solar-CRM EMP EWS-JSE EWS-Management-2026 \
  Visual-Pv-JSE Neu-EWS-JSE-Test Strategie-2026 \
  16-11-ai-studi-lead-management-new lead-dahsboard \
  NEUSTART jse 2025-10-14-Issue-Benchmark R1-Leadmanagement \
  Wg_KD_Analyse Ai-Studio---Team-Performance \
  2025-11-27-1312-Wochenbericht; do
  echo "Archiving $repo..."
  gh api repos/goldfinger2025/$repo -X PATCH -f archived=true 2>/dev/null || echo "  SKIP: $repo not found"
done
```

- [ ] **Step 2: Archive org repo EWS-Bilaterales-LeadMTM**

```bash
gh api repos/Alexander-Bering/EWS-Bilaterales-LeadMTM \
  -X PATCH -f archived=true
```

- [ ] **Step 3: Verify archive status**

```bash
gh repo list goldfinger2025 --json name,isArchived --jq '.[] | select(.isArchived == false) | .name'
```

Expected: Only `lagerkritikalit-t` and `Gewerbespeicher` remain non-archived.

---

### Task 1.3: Create GitHub Organization

**`zensation` is TAKEN (Thailand-based studio).** Alternative: `zensation-ai`.

- [ ] **Step 1: Check availability of zensation-ai**

```bash
gh api orgs/zensation-ai 2>&1 | head -5
# If 404: available
```

- [ ] **Step 2: Create the organization**

Go to https://github.com/organizations/plan — create `zensation-ai` with:
- Display name: **ZenSation AI**
- Description: **Neuroscience-inspired AI tools. Open source.**
- URL: **https://zensation.ai**
- Location: **Kiel, Germany**
- Email: **open-source@zensation.ai**

(NOTE: GitHub org creation requires web UI — cannot be done via CLI.)

- [ ] **Step 3: Create org profile README**

```bash
gh repo create zensation-ai/.github --public --description "ZenSation AI organization profile"
```

Then create the profile README (Task 1.4).

- [ ] **Step 4: Configure org settings**

Via web UI at https://github.com/organizations/zensation-ai/settings:
- Member privileges: Base permissions = Read
- Profile: Add avatar (ZenSation logo), bio, links
- Verified domains: Add zensation.ai

---

### Task 1.4: Create Org Profile README

**Files:**
- Create: `.github/profile/README.md` (in the `.github` repo)

- [ ] **Step 1: Clone .github repo and create profile**

```bash
cd /tmp
gh repo clone zensation-ai/.github
cd .github
mkdir -p profile
```

- [ ] **Step 2: Write profile README**

Create `profile/README.md`:

```markdown
# ZenSation AI

**Neuroscience-inspired AI tools. Open source.**

We build memory systems that help AI agents remember like humans do — with spaced repetition, emotional tagging, Hebbian learning, and exponential forgetting curves.

## Our Projects

### 🧠 [ZenBrain](https://github.com/zensation-ai/zenbrain)
The neuroscience-inspired memory system for AI agents. 7-layer architecture with FSRS, Hebbian dynamics, and emotional memory.

`npm install @zenbrain/algorithms`

### 🤖 ZenAI *(Coming Soon)*
Self-hosted AI OS powered by ZenBrain. 170K LOC, 9,228 tests, 55 AI tools.

---

**Company:** [ZenSation Enterprise Solutions](https://zensation.ai) · Kiel, Germany
**Open Source:** Apache 2.0
**Contact:** open-source@zensation.ai
```

- [ ] **Step 3: Push and verify**

```bash
git add profile/README.md
git commit -m "Add organization profile README"
git push origin main
```

Visit https://github.com/zensation-ai to verify the profile appears.

---

## Chunk 2: ZenBrain Repository Setup (Day 2-3)

### Task 2.1: Create ZenBrain Monorepo

- [ ] **Step 1: Create the repository**

```bash
gh repo create zensation-ai/zenbrain \
  --public \
  --description "Neuroscience-inspired memory system for AI agents. 7 layers. FSRS. Hebbian learning." \
  --license apache-2.0 \
  --clone
cd zenbrain
```

- [ ] **Step 2: Initialize Turborepo monorepo**

```bash
npm init -y
npx create-turbo@latest --skip-install
```

Then replace the generated structure with our custom one:

```bash
mkdir -p packages/algorithms/src packages/algorithms/__tests__
mkdir -p packages/core/src/interfaces packages/core/src/layers packages/core/__tests__
mkdir -p packages/adapters/postgres/src packages/adapters/sqlite/src
mkdir -p packages/adapters/openai/src packages/adapters/anthropic/src
mkdir -p apps/playground
mkdir -p docs examples .github/workflows .github/ISSUE_TEMPLATE
```

- [ ] **Step 3: Create root package.json**

Create `package.json`:

```json
{
  "name": "zenbrain",
  "private": true,
  "workspaces": [
    "packages/*",
    "packages/adapters/*",
    "apps/*"
  ],
  "scripts": {
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "clean": "turbo clean"
  },
  "devDependencies": {
    "turbo": "^2.4.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 4: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {}
  }
}
```

- [ ] **Step 5: Create shared tsconfig**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

- [ ] **Step 6: Create essential root files**

Create `.gitignore`:
```
node_modules/
dist/
.turbo/
*.tsbuildinfo
.env
.env.local
coverage/
```

Create `CONTRIBUTING.md`:
```markdown
# Contributing to ZenBrain

Thank you for your interest in contributing!

## Getting Started

1. Fork the repo
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/zenbrain.git`
3. Install dependencies: `npm install`
4. Run tests: `npm test`
5. Create a branch: `git checkout -b my-feature`

## Development

- We use TypeScript with strict mode
- All code must have tests (TDD preferred)
- Run `npm run lint` before committing

## Pull Requests

- One feature per PR
- Include tests
- Update docs if applicable
- Reference related issues

## License

By contributing, you agree that your contributions will be licensed under Apache 2.0.
```

Create `SECURITY.md`:
```markdown
# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities to **security@zensation.ai**.

Do NOT create public GitHub issues for security vulnerabilities.

We will respond within 48 hours and provide a fix timeline.
```

- [ ] **Step 7: Initial commit**

```bash
git add -A
git commit -m "chore: initialize ZenBrain monorepo with Turborepo"
git push origin main
```

---

### Task 2.2: Create @zenbrain/algorithms Package

This is the core differentiator — pure algorithms with zero dependencies.

**Source files to extract from KI-AB:**

| KI-AB Source | ZenBrain Target |
|-------------|----------------|
| `backend/src/services/memory/fsrs-scheduler.ts` | `packages/algorithms/src/fsrs.ts` |
| `backend/src/services/memory/ebbinghaus-decay.ts` | `packages/algorithms/src/ebbinghaus.ts` |
| `backend/src/services/memory/emotional-tagger.ts` | `packages/algorithms/src/emotional.ts` |
| `backend/src/services/memory/context-enrichment.ts` | `packages/algorithms/src/context-retrieval.ts` |
| `backend/src/services/knowledge-graph/hebbian-dynamics.ts` | `packages/algorithms/src/hebbian.ts` (pure fns only) |
| `backend/src/services/knowledge-graph/confidence-propagation.ts` | `packages/algorithms/src/bayesian.ts` (pure fn only) |
| `backend/src/services/memory/ltm-utils.ts` | `packages/algorithms/src/similarity.ts` |

**For each file, the extraction process is:**
1. Copy the file
2. Remove all ZenAI-specific imports (logger, queryContext, AIContext)
3. Replace logger calls with optional logger parameter or console fallback
4. Remove any database-accessing functions (keep only pure computational functions)
5. Ensure NO references to zensation, railway, supabase, vercel, or internal schemas
6. Add JSDoc comments for public API
7. Export from index.ts

- [ ] **Step 1: Create package.json for algorithms**

Create `packages/algorithms/package.json`:

```json
{
  "name": "@zenbrain/algorithms",
  "version": "0.1.0",
  "description": "Neuroscience-inspired memory algorithms: FSRS, Hebbian learning, Ebbinghaus decay, emotional tagging",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "lint": "tsc --noEmit"
  },
  "keywords": [
    "ai", "memory", "fsrs", "spaced-repetition", "hebbian",
    "ebbinghaus", "neuroscience", "agents", "llm"
  ],
  "author": "Alexander Bering <alex@zensation.ai>",
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "https://github.com/zensation-ai/zenbrain",
    "directory": "packages/algorithms"
  },
  "devDependencies": {
    "vitest": "^3.0.0",
    "typescript": "^5.7.0"
  }
}
```

Create `packages/algorithms/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Extract FSRS scheduler**

Copy `backend/src/services/memory/fsrs-scheduler.ts` to `packages/algorithms/src/fsrs.ts`.

**Transformation rules:**
- Remove `import { logger } from '../../utils/logger'`
- Replace all `logger.info/warn/error/debug(...)` with optional logger parameter
- Remove any `queryContext` calls (there should be none — this file is pure)
- Add `export` to all public functions and types
- Add JSDoc comments
- Verify: `grep -r "zensation\|railway\|supabase\|vercel\|queryContext\|AIContext" packages/algorithms/src/fsrs.ts` returns nothing

- [ ] **Step 3: Extract Ebbinghaus decay**

Copy `backend/src/services/memory/ebbinghaus-decay.ts` to `packages/algorithms/src/ebbinghaus.ts`.

Same transformation rules as Step 2. This file imports fsrs-scheduler — update the import to `./fsrs`.

- [ ] **Step 4: Extract emotional tagger**

Copy `backend/src/services/memory/emotional-tagger.ts` to `packages/algorithms/src/emotional.ts`.

Same transformation rules. This should be pure (keyword-based heuristic).

- [ ] **Step 5: Extract context retrieval**

Copy `backend/src/services/memory/context-enrichment.ts` to `packages/algorithms/src/context-retrieval.ts`.

Same transformation rules.

- [ ] **Step 6: Extract Hebbian dynamics (pure functions only)**

From `backend/src/services/knowledge-graph/hebbian-dynamics.ts`, extract ONLY the pure computational functions:
- `computeHebbianStrength()`
- `computeDecay()`
- `normalizeStrength()`

Do NOT extract any functions that call `queryContext`.

Create `packages/algorithms/src/hebbian.ts` with only these pure functions.

- [ ] **Step 7: Extract Bayesian confidence (pure function only)**

From `backend/src/services/knowledge-graph/confidence-propagation.ts`, extract ONLY:
- `propagateForRelation()` (the pure computation)

Create `packages/algorithms/src/bayesian.ts`.

- [ ] **Step 8: Extract similarity utilities**

Copy `backend/src/services/memory/ltm-utils.ts` to `packages/algorithms/src/similarity.ts`.

Extract: negation detection, string similarity (Jaccard), importance scoring.

- [ ] **Step 9: Create index.ts barrel export**

Create `packages/algorithms/src/index.ts`:

```typescript
export * from './fsrs';
export * from './ebbinghaus';
export * from './emotional';
export * from './hebbian';
export * from './bayesian';
export * from './context-retrieval';
export * from './similarity';
```

- [ ] **Step 10: Security scan**

```bash
cd packages/algorithms
grep -r "zensation\|railway\|supabase\|vercel\|queryContext\|AIContext\|@zensation" src/
```

Expected: **zero results**. If any matches, fix them before proceeding.

- [ ] **Step 11: Build and verify**

```bash
cd packages/algorithms
npx tsc --noEmit
npm run build
```

Expected: 0 errors.

- [ ] **Step 12: Commit**

```bash
git add packages/algorithms/
git commit -m "feat(algorithms): extract neuroscience memory algorithms from ZenAI

- FSRS spaced repetition scheduler
- Ebbinghaus exponential decay curves
- Emotional tagger (arousal/valence/significance)
- Hebbian co-activation learning
- Bayesian confidence propagation
- Context-dependent retrieval
- String/name similarity utilities

All pure functions, zero runtime dependencies."
```

---

### Task 2.3: Write Tests for @zenbrain/algorithms

Extract existing tests from KI-AB and adapt them.

**Source test files:**
- `backend/src/__tests__/unit/services/memory/fsrs-scheduler.test.ts`
- `backend/src/__tests__/unit/services/neuroscience-memory.test.ts`
- `backend/src/__tests__/unit/services/knowledge-graph/hebbian-dynamics.test.ts`
- `backend/src/__tests__/unit/services/knowledge-graph/confidence-propagation.test.ts`

- [ ] **Step 1: Create vitest config**

Create `packages/algorithms/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
  },
});
```

- [ ] **Step 2: Extract and adapt FSRS tests**

Copy test file, update imports to use `../src/fsrs` instead of ZenAI paths. Remove any mocks for logger/queryContext.

- [ ] **Step 3: Extract and adapt neuroscience tests**

From `neuroscience-memory.test.ts`, extract tests for emotional-tagger, ebbinghaus-decay, and context-enrichment. Split into individual test files.

- [ ] **Step 4: Extract Hebbian and Bayesian tests (pure function tests only)**

- [ ] **Step 5: Run all tests**

```bash
cd packages/algorithms
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/algorithms/__tests__/
git commit -m "test(algorithms): add comprehensive test suite

Extracted and adapted from ZenAI test suite (9,228 tests).
Covers FSRS, Ebbinghaus, emotional tagger, Hebbian, Bayesian."
```

---

### Task 2.4: Write Killer README

**File:** `README.md` (repository root)

- [ ] **Step 1: Write the README**

The README must follow the structure defined in the spec (Section 5.1):

1. Hero line: `# 🧠 ZenBrain`
2. Tagline: "The neuroscience-inspired memory system for AI agents."
3. Badge row: npm version, npm downloads, GitHub stars, license, CI status, Discord
4. Quote block with key features
5. "Why ZenBrain?" section with comparison table
6. Quick Start (npm install + 5-line example)
7. Architecture diagram (Mermaid)
8. Code examples
9. Documentation links
10. Community + Contributing
11. License

Key content for the comparison table:

| Feature | ZenBrain | Mem0 | Letta | Zep |
|---------|----------|------|-------|-----|
| Memory Layers | 7 | 2 | 3 | 2 |
| Spaced Repetition (FSRS) | ✅ | ❌ | ❌ | ❌ |
| Hebbian Learning | ✅ | ❌ | ❌ | ❌ |
| Emotional Memory | ✅ | ❌ | ❌ | ❌ |
| Ebbinghaus Decay | ✅ | ❌ | ❌ | ❌ |
| TypeScript Native | ✅ | ✅ | ❌ | ❌ |
| Zero Dependencies (core) | ✅ | ❌ | ❌ | ❌ |

- [ ] **Step 2: Create packages/algorithms/README.md**

Focused README for the npm package page. Shorter, more code-focused.

- [ ] **Step 3: Commit**

```bash
git add README.md packages/algorithms/README.md
git commit -m "docs: add killer README with comparison table and quickstart"
```

---

### Task 2.5: Create GitHub Actions CI

**File:** `.github/workflows/ci.yml`

- [ ] **Step 1: Write CI workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      - run: npm install
      - run: npm run lint
      - run: npm run build
      - run: npm test

  publish:
    needs: test
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'
      - run: npm install
      - run: npm run build
      - run: cd packages/algorithms && npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **Step 2: Create issue templates**

Create `.github/ISSUE_TEMPLATE/bug_report.md` and `.github/ISSUE_TEMPLATE/feature_request.md`.

- [ ] **Step 3: Commit**

```bash
git add .github/
git commit -m "ci: add GitHub Actions workflow with npm publish on tag"
```

---

### Task 2.6: Publish @zenbrain/algorithms to npm

- [ ] **Step 1: Create npm account/org if needed**

```bash
npm login
npm org create zenbrain  # or use existing npm account
```

- [ ] **Step 2: Dry run publish**

```bash
cd packages/algorithms
npm run build
npm pack --dry-run
```

Verify: Only `dist/` files + package.json + README + LICENSE are included.

- [ ] **Step 3: Publish**

```bash
npm publish --access public
```

- [ ] **Step 4: Verify on npmjs.com**

Visit https://www.npmjs.com/package/@zenbrain/algorithms

- [ ] **Step 5: Tag and push**

```bash
git tag v0.1.0
git push origin v0.1.0
```

---

## Chunk 3: Marketing Infrastructure (Day 4-7)

### Task 3.1: Community Channels Setup

- [ ] **Step 1: Create Discord server**

Name: "ZenBrain Community"
Channels:
- #announcements (read-only)
- #general
- #help
- #show-and-tell
- #contributing
- #feature-requests

- [ ] **Step 2: Create Twitter/X account**

Handle: @zensation_ai (or @zenbrain_ai if available)
Bio: "Neuroscience-inspired memory for AI agents. Open source. 🧠"
Link: https://github.com/zensation-ai/zenbrain

- [ ] **Step 3: Set up GitHub Sponsors**

Go to https://github.com/sponsors/zensation-ai/dashboard
Tiers: $5/mo (supporter), $25/mo (backer), $100/mo (sponsor)

- [ ] **Step 4: Add badges to README**

Update README.md with live Discord invite link, Twitter follow badge.

- [ ] **Step 5: Commit badge updates**

```bash
git add README.md
git commit -m "docs: add Discord and Twitter badges"
git push origin main
```

---

### Task 3.2: Prepare Launch Content

All content must be READY before launch day. Write everything in advance.

- [ ] **Step 1: Write Hacker News post**

Title: "Show HN: ZenBrain – Neuroscience-Inspired Memory for AI Agents (FSRS, Hebbian, 7 layers)"

Body (first comment):
```
Hi HN, I'm Alexander. I've been building AI tools for 20 years and spent
the last year creating a memory system that takes inspiration from actual
neuroscience — not just "save stuff in a vector database."

ZenBrain has 7 memory layers (working, short-term, episodic, semantic,
procedural, core, cross-context), each inspired by a different aspect of
human memory:

- FSRS spaced repetition (the algorithm behind Anki)
- Hebbian learning ("neurons that fire together wire together")
- Ebbinghaus forgetting curves (exponential decay, not linear)
- Emotional tagging (arousal/valence/significance scores)

The algorithms package has zero dependencies and is pure TypeScript.

npm install @zenbrain/algorithms

GitHub: https://github.com/zensation-ai/zenbrain

I'd love to hear what you think, especially from anyone working on
AI agent memory.
```

Save to: `docs/marketing/hacker-news-post.md`

- [ ] **Step 2: Write Reddit posts**

**r/LocalLLaMA post:**
Title: "I built an open-source memory system for AI agents inspired by neuroscience (7 layers, FSRS, Hebbian learning)"

**r/selfhosted post:**
Title: "ZenBrain: Self-hosted AI memory with Docker Compose — 7 layers of neuroscience-inspired memory for your local AI"

**r/MachineLearning post:**
Title: "[P] ZenBrain: Neuroscience-inspired memory architecture for AI agents (FSRS, Hebbian dynamics, Ebbinghaus decay)"

Save to: `docs/marketing/reddit-posts.md`

- [ ] **Step 3: Write Twitter/X launch thread**

Thread (7 tweets):
1. 🧠 Introducing ZenBrain — the deepest memory system for AI agents, inspired by actual neuroscience. Open source (Apache 2.0).
2. Most AI memory = vector database + similarity search. That's like saying human memory = a filing cabinet. We can do better.
3. ZenBrain has 7 memory layers, each from neuroscience: Working Memory, Short-Term, Episodic, Semantic, Procedural, Core, Cross-Context.
4. FSRS spaced repetition (the algorithm behind Anki). Hebbian learning ("neurons that fire together wire together"). Ebbinghaus decay curves.
5. [Comparison table image: ZenBrain vs Mem0 vs Letta vs Zep]
6. Zero dependencies. Pure TypeScript. npm install @zenbrain/algorithms. Works with any AI provider.
7. GitHub: [link] | npm: [link] | Discord: [link]

Save to: `docs/marketing/twitter-thread.md`

- [ ] **Step 4: Write Dev.to blog post**

Title: "Why AI Memory Needs Neuroscience: Building a 7-Layer Memory System"

Structure:
1. The problem with AI memory today
2. What neuroscience teaches us about memory
3. The 7 layers of ZenBrain
4. FSRS: Teaching AI to remember (spaced repetition)
5. Hebbian learning: Connections that strengthen
6. Getting started (code example)
7. What's next

Length: ~2000 words with code examples and architecture diagram.

Save to: `docs/marketing/devto-blog-post.md`

- [ ] **Step 5: Create comparison table image**

Design a shareable image (1200x628px for Twitter/OG) showing the feature comparison table. Use Figma, Canva, or HTML-to-image.

Save to: `docs/marketing/assets/comparison-table.png`

- [ ] **Step 6: Create demo GIF**

Record a 15-30 second GIF showing:
1. `npm install @zenbrain/algorithms`
2. Run a quick example
3. Show memory retention over time (FSRS)

Save to: `docs/marketing/assets/demo.gif`

- [ ] **Step 7: Write Product Hunt submission**

- Tagline: "Neuroscience-inspired memory for AI agents"
- Description: 2-3 paragraphs
- First comment (as maker)
- 4-5 screenshots/images
- Topics: AI, Developer Tools, Open Source

Save to: `docs/marketing/producthunt-submission.md`

- [ ] **Step 8: Commit all marketing materials**

```bash
git add docs/marketing/
git commit -m "docs: prepare multi-channel launch campaign materials"
git push origin main
```

---

### Task 3.3: Marketing Calendar

Create the detailed marketing calendar that Alexander follows.

- [ ] **Step 1: Write marketing calendar**

Save to `docs/marketing/calendar.md`:

```markdown
# ZenBrain Marketing Calendar

## Pre-Launch (Week 1-4)
- [ ] Week 1: Set up Discord, Twitter/X, GitHub Sponsors
- [ ] Week 2: Write all launch content (HN, Reddit, Twitter, Dev.to, PH)
- [ ] Week 3: Create visual assets (comparison image, demo GIF, architecture diagram)
- [ ] Week 4: Schedule posts, test all links, rehearse launch sequence

## Launch Week (Week 5)

### Sunday (Launch Day)
| Time (CET) | Platform | Action | Who |
|------------|----------|--------|-----|
| 07:00 | Hacker News | Post "Show HN" | Alexander |
| 07:30 | Hacker News | Post first comment (detailed explanation) | Alexander |
| 08:00 | Reddit | Post to r/LocalLLaMA | Alexander |
| 08:15 | Reddit | Post to r/selfhosted | Alexander |
| 08:30 | Reddit | Post to r/MachineLearning | Alexander |
| 09:00 | Twitter/X | Post launch thread (7 tweets) | Alexander |
| 10:00 | Dev.to | Publish blog post | Alexander |
| 10:30 | LinkedIn | Share announcement | Alexander |
| ALL DAY | All platforms | Respond to EVERY comment within 2 hours | Alexander |

### Monday
| Time (CET) | Platform | Action |
|------------|----------|--------|
| 10:00 | Hacker News | Check ranking, respond to new comments |
| ALL DAY | GitHub | Respond to issues/stars/PRs |

### Tuesday
| Time (CET) | Platform | Action |
|------------|----------|--------|
| 16:00 | Product Hunt | Launch submission (Tue-Thu is optimal) |
| 16:30 | Twitter/X | Quote-retweet Product Hunt launch |
| ALL DAY | All channels | Respond to comments |

### Tuesday-Friday
| Daily Tasks |
|-------------|
| 09:00 — Check all platforms for comments/questions |
| 12:00 — Respond to GitHub issues |
| 15:00 — One tweet about a specific feature |
| 18:00 — Check Discord for new members |

## Post-Launch (Week 6-8)
- [ ] Week 6: Blog post "Week 1 Results" on Dev.to + Twitter
- [ ] Week 6: First integration example (with LangChain)
- [ ] Week 7: Second blog post on specific feature (FSRS deep-dive)
- [ ] Week 7: Integration example (with CrewAI)
- [ ] Week 8: Third blog post (Hebbian learning explained)
- [ ] Week 8: Announce @zenbrain/core package

## Monthly Ongoing
| Week of Month | Content |
|---------------|---------|
| Week 1 | Release blog post (changelog + feature highlight) |
| Week 2 | Technical deep-dive blog post |
| Week 3 | Integration/tutorial blog post |
| Week 4 | Community spotlight or comparison post |

## Channel-Specific Strategies

### Hacker News (monthly)
- Post "Show HN" only for MAJOR releases (new packages, benchmarks)
- Comment on related threads (AI memory, LLM agents, RAG)
- Best time: Sunday 6-7 AM UTC

### Reddit (weekly)
- r/LocalLLaMA: Focus on self-hosted, privacy-first angles
- r/selfhosted: Docker Compose quickstart, no cloud dependency
- r/MachineLearning: Research-backed approach, paper citations
- r/typescript: TypeScript-native, zero dependencies

### Twitter/X (daily)
- 1 tweet per day minimum
- Thread format for features
- Retweet/engage with AI agent community
- Tag: @AnthropicAI, @OpenAI, @LangChainAI when relevant

### Dev.to / Hashnode (bi-weekly)
- Alternate between tutorial and deep-dive posts
- Cross-post to Medium for wider reach
- Include code examples and architecture diagrams

### Discord (daily)
- Respond to all messages within 4 hours
- Weekly "office hours" (voice channel, 30 min)
- Pin important announcements
```

- [ ] **Step 2: Commit**

```bash
git add docs/marketing/calendar.md
git commit -m "docs: add detailed marketing calendar with daily tasks"
```

---

## Chunk 4: @zenbrain/core Package (Week 3-4)

### Task 4.1: Define Core Interfaces

**Files:**
- Create: `packages/core/src/interfaces/storage.ts`
- Create: `packages/core/src/interfaces/embedding.ts`
- Create: `packages/core/src/interfaces/llm.ts`
- Create: `packages/core/src/interfaces/cache.ts`
- Create: `packages/core/src/interfaces/index.ts`

- [ ] **Step 1: Write StorageAdapter interface**

```typescript
// packages/core/src/interfaces/storage.ts
export interface StorageAdapter {
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[] }>;
  transaction<T>(fn: (adapter: StorageAdapter) => Promise<T>): Promise<T>;
}
```

- [ ] **Step 2: Write EmbeddingProvider interface**

```typescript
// packages/core/src/interfaces/embedding.ts
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  dimensions(): number;
}
```

- [ ] **Step 3: Write LLMProvider interface**

```typescript
// packages/core/src/interfaces/llm.ts
export interface LLMProvider {
  generate(system: string, prompt: string, opts?: GenerateOptions): Promise<string>;
}

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
}
```

- [ ] **Step 4: Write CacheProvider interface**

```typescript
// packages/core/src/interfaces/cache.ts
export interface CacheProvider {
  get<T = any>(key: string): Promise<T | null>;
  set(key: string, value: any, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}
```

- [ ] **Step 5: Create barrel export and commit**

```bash
git add packages/core/
git commit -m "feat(core): define StorageAdapter, EmbeddingProvider, LLMProvider, CacheProvider interfaces"
```

---

### Task 4.2: Extract Memory Layers

Extract the 7 memory layers from KI-AB, adapting each to use the interfaces defined above instead of direct ZenAI imports.

- [ ] **Step 1-7: Extract each layer** (one commit per layer)

For each layer:
1. Copy source from KI-AB
2. Replace `queryContext(context, sql, params)` with `this.storage.query(sql, params)`
3. Replace `generateEmbedding(text)` with `this.embedding.embed(text)`
4. Replace `logger.*` with optional logger parameter
5. Remove `AIContext` type — replace with generic `string` context parameter
6. Security scan: `grep -r "zensation\|supabase\|railway" src/`
7. Write tests using in-memory storage mock
8. Commit

- [ ] **Step 8: Create coordinator and barrel export**

- [ ] **Step 9: Build and test entire core package**

```bash
cd packages/core
npm run build && npm test
```

- [ ] **Step 10: Commit**

```bash
git add packages/core/
git commit -m "feat(core): 7-layer memory system with pluggable adapters"
```

---

### Task 4.3: Create PostgreSQL Adapter

- [ ] **Step 1: Write adapter implementation using `pg` + `pgvector`**
- [ ] **Step 2: Include schema migration SQL**
- [ ] **Step 3: Write integration tests (with testcontainers or manual Postgres)**
- [ ] **Step 4: Commit**

---

### Task 4.4: Create SQLite Adapter (Week 5, before launch)

- [ ] **Step 1: Write adapter using `better-sqlite3` + `sqlite-vec`**
- [ ] **Step 2: Zero-config setup (auto-creates DB file)**
- [ ] **Step 3: Write tests**
- [ ] **Step 4: Commit**

---

### Task 4.5: Docker Compose Quickstart

**File:** `docker-compose.yml` (repo root)

- [ ] **Step 1: Write docker-compose.yml**

```yaml
version: '3.8'
services:
  playground:
    build: apps/playground
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgres://zenbrain:zenbrain@db:5432/zenbrain
    depends_on:
      db:
        condition: service_healthy
  db:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: zenbrain
      POSTGRES_USER: zenbrain
      POSTGRES_PASSWORD: zenbrain
    healthcheck:
      test: pg_isready -U zenbrain
      interval: 5s
      timeout: 3s
      retries: 5
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

- [ ] **Step 2: Create playground Dockerfile**
- [ ] **Step 3: Test: `docker compose up -d` and verify**
- [ ] **Step 4: Commit**

---

## Chunk 5: KI-AB → ZenAI Platform Preparation (Week 6-7)

### Task 5.1: Fix Hardcoded URLs in KI-AB

**Files to modify:**

| File | Current | Replace With |
|------|---------|-------------|
| `backend/src/middleware/security-headers.ts` | `ki-ab-production.up.railway.app` | `process.env.API_URL` |
| `backend/src/services/business/lighthouse-connector.ts` | `frontend-mu-six-93.vercel.app` | `process.env.FRONTEND_URL` |
| `backend/src/services/business/data-aggregator.ts` | `frontend-mu-six-93.vercel.app` | `process.env.FRONTEND_URL` |
| `packages/electron/src/main.ts` | Vercel + Railway URLs | `process.env.*` |
| `frontend/capacitor.config.ts` | Vercel URL | `process.env.VITE_API_URL` |

- [ ] **Step 1-5: Fix each file** (search & replace)
- [ ] **Step 6: Run full test suite to verify nothing breaks**

```bash
cd /Users/alexanderbering/Projects/KI-AB
cd backend && npm test
cd ../frontend && npm run build && npx vitest run
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "fix: replace hardcoded deployment URLs with environment variables"
```

---

### Task 5.2: Sanitize CLAUDE.md

- [ ] **Step 1: Create a PUBLIC version of CLAUDE.md**

Remove:
- Production deployment URLs (Railway, Vercel, Supabase connection strings)
- Port-specific details (5432 vs 6543)
- Pool size configurations
- Railway environment variable table
- Supabase-specific configuration section

Keep:
- Architecture overview
- API endpoint documentation
- Tool listings
- Phase changelog (public development history)
- Testing commands

- [ ] **Step 2: Rename current CLAUDE.md to CLAUDE.internal.md and gitignore it**
- [ ] **Step 3: Commit**

---

### Task 5.3: Rewrite README.md for KI-AB

- [ ] **Step 1: Write new README with Phase 141 features**

Structure:
1. ZenAI logo + tagline
2. "Built on ZenBrain" badge
3. Feature overview (55 AI tools, 9,228 tests, 4 contexts)
4. Screenshots/GIFs
5. Quick Start (Docker Compose)
6. Architecture diagram
7. API documentation link
8. Contributing guide
9. License (Apache 2.0)

- [ ] **Step 2: Add LICENSE file (Apache 2.0)**
- [ ] **Step 3: Add CONTRIBUTING.md and SECURITY.md**
- [ ] **Step 4: Commit**

---

### Task 5.4: Remove Sensitive Demo Data

- [ ] **Step 1: Search for @zensation.ai emails in non-config files**

```bash
grep -r "@zensation.ai" backend/src/ frontend/src/ --include="*.ts" --include="*.tsx" -l
```

- [ ] **Step 2: Replace demo emails with generic examples**
- [ ] **Step 3: Commit**

---

### Task 5.5: Publish ZenAI as zensation-ai/zenai

- [ ] **Step 1: Create the repo**

```bash
gh repo create zensation-ai/zenai \
  --public \
  --description "AI OS powered by ZenBrain. Self-hosted. 55 tools. 9,228 tests. Neuroscience-inspired memory." \
  --homepage "https://zensation.ai"
```

- [ ] **Step 2: Add as remote and push**

```bash
cd /Users/alexanderbering/Projects/KI-AB
git remote add public https://github.com/zensation-ai/zenai.git
git push public main
```

- [ ] **Step 3: Full security scan before making public**

```bash
cd /Users/alexanderbering/Projects/KI-AB
# Scan for any remaining secrets or internal references
grep -r "sk-ant-\|sk_live_\|whsec_\|re_\|ghp_" --include="*.ts" --include="*.tsx" backend/src/ frontend/src/ | grep -v "test\|mock\|example\|\.env"
# Scan for hardcoded URLs (should be zero after Task 5.1)
grep -r "railway\.app\|vercel\.app\|supabase\.co" --include="*.ts" --include="*.tsx" backend/src/ frontend/src/ | grep -v "\.env\|test\|mock"
```

Expected: Zero results for both scans.

- [ ] **Step 4: Verify .env.example is complete**

```bash
# Compare all env vars used in code vs documented in .env.example
grep -roh "process\.env\.\w\+" backend/src/ | sort -u > /tmp/env-used.txt
grep -oh "^[A-Z_]\+" backend/.env.example | sort -u > /tmp/env-documented.txt
diff /tmp/env-used.txt /tmp/env-documented.txt
```

Fix any undocumented variables.

- [ ] **Step 5: Test fresh clone experience**

```bash
cd /tmp
git clone https://github.com/zensation-ai/zenai.git zenai-test
cd zenai-test
cp backend/.env.example backend/.env
npm install
npm run build
# Verify it builds without errors
```

- [ ] **Step 6: Verify on GitHub**

Visit https://github.com/zensation-ai/zenai — ensure README renders, no secrets visible.

---

### Task 5.6: Add NPM_TOKEN to GitHub Secrets

- [ ] **Step 1: Generate npm automation token**

```bash
npm token create --type=granular
```

- [ ] **Step 2: Add to GitHub repo secrets**

Go to https://github.com/zensation-ai/zenbrain/settings/secrets/actions
Add: `NPM_TOKEN` = (the token from Step 1)

- [ ] **Step 3: Verify CI can publish (dry run)**

Push a test tag:
```bash
git tag v0.0.1-test
git push origin v0.0.1-test
```
Verify CI triggers but publishes successfully (or delete the test tag and re-tag properly later).

---

## Chunk 6: Website & Launch (Week 5-6)

### Task 6.1: Update zensation.ai

- [ ] **Step 1: Add /open-source page**

Content: ZenBrain overview, GitHub link, npm badge, community links.

- [ ] **Step 2: Add /developers page**

Content: API docs, SDK reference, quick start guide.

- [ ] **Step 3: Add /consulting page**

Content: Migrated from zensation.sh.

- [ ] **Step 4: Update navigation**

Add "Open Source" and "Developers" to main nav.

- [ ] **Step 5: Add GitHub link to footer**

---

### Task 6.2: Configure zensation.sh Redirect

- [ ] **Step 1: Set up 301 redirect**

In the hosting config for zensation.sh, add:
```
/* → https://zensation.ai/consulting 301
```

---

### Task 6.3: Execute Launch Day

Follow the marketing calendar exactly (Task 3.3):

- [ ] **07:00 CET Sunday: Post on Hacker News**
- [ ] **07:30: Post detailed first comment on HN**
- [ ] **08:00: Post on r/LocalLLaMA**
- [ ] **08:15: Post on r/selfhosted**
- [ ] **08:30: Post on r/MachineLearning**
- [ ] **09:00: Post Twitter/X launch thread**
- [ ] **10:00: Publish Dev.to blog post**
- [ ] **10:30: LinkedIn announcement**
- [ ] **ALL DAY: Monitor and respond to every comment**
- [ ] **Tuesday 16:00: Product Hunt launch**

---

## Chunk 7: Post-Launch Growth (Week 7-8)

### Task 7.1: Community Engagement

- [ ] **Daily: Respond to GitHub issues within 4 hours**
- [ ] **Daily: Check Discord for new members and questions**
- [ ] **Daily: One tweet about a feature or use case**

### Task 7.2: Integration Examples

- [ ] **Write example: ZenBrain + LangChain**
- [ ] **Write example: ZenBrain + CrewAI**
- [ ] **Write example: ZenBrain + Vercel AI SDK**
- [ ] **Write example: ZenBrain + Claude Code**

### Task 7.3: Publish @zenbrain/core to npm

- [ ] **npm publish @zenbrain/core**
- [ ] **npm publish @zenbrain/adapter-postgres**
- [ ] **npm publish @zenbrain/adapter-sqlite**
- [ ] **Announce on all channels**

### Task 7.4: Start Python Port (if traction warrants)

If npm downloads > 100/week and stars > 300:
- [ ] **Create `zensation-ai/zenbrain-python` repo**
- [ ] **Port @zenbrain/algorithms to Python (pip install zenbrain)**
- [ ] **Write Python-specific README**
- [ ] **Announce on r/Python and PyPI**

### Task 7.5: ZenBrain Cloud API Setup

- [ ] **Deploy API to Railway/Vercel (separate from ZenAI)**
- [ ] **Implement free tier rate limiting**
- [ ] **Add Stripe for Pro tier ($49/mo)**
- [ ] **Create dashboard at zenbrain.zensation.ai**

---

## Quick Reference: What Lives Where

| Asset | Location | Status |
|-------|----------|--------|
| **Launch Strategy Spec** | `docs/superpowers/specs/2026-03-23-zenbrain-launch-strategy.md` | ✅ Approved |
| **This Implementation Plan** | `docs/superpowers/plans/2026-03-23-zenbrain-launch-plan.md` | Current |
| **Marketing Content** | `docs/marketing/` (in zenbrain repo) | To be created |
| **ZenBrain Repo** | `github.com/zensation-ai/zenbrain` | To be created |
| **ZenAI Repo** | `github.com/zensation-ai/zenai` | Month 3 |
| **GitHub Org** | `github.com/zensation-ai` | To be created |
| **npm Packages** | `@zenbrain/algorithms`, `@zenbrain/core`, `@zenbrain/adapter-*` | To be published |
