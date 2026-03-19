# ZenAI Intent Hub + Smart Pages — Design Specification

> **Codename:** Project Zenith
> **Version:** 1.1
> **Date:** 2026-03-19
> **Author:** Alexander Bering + Claude Opus 4.6
> **Status:** Draft — Pending Review
> **Scope:** Phases 102–118 (Full-Stack Transformation)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Strategic Context](#2-strategic-context)
3. [Information Architecture](#3-information-architecture)
4. [Chat Hub Design](#4-chat-hub-design)
5. [Smart Page Concepts](#5-smart-page-concepts)
6. [Design System Evolution](#6-design-system-evolution)
7. [Backend & AI Improvements](#7-backend--ai-improvements)
8. [Database Cleanup](#8-database-cleanup)
9. [Phase Plan](#9-phase-plan)
10. [Success Metrics](#10-success-metrics)
11. [Risk Assessment](#11-risk-assessment)
12. [Research Sources](#12-research-sources)

---

## 1. Executive Summary

### The Vision

Transform ZenAI from a feature-rich multi-page application into an **Intent-First AI OS** — where a Chat Hub serves as the universal entry point and 7 Smart Pages provide specialized spatial interfaces for tasks that need visual, parallel, or spatial interaction.

### The Problem

ZenAI currently has 17 sidebar navigation items and 40+ page types. Users must learn a taxonomy before they can use the app. The design system exists (10 components, TypeScript tokens) but only ~25% of components actually use it — creating visual inconsistency. The AI core is strong (RAG, Memory, Agents) but underleveraged by a traditional page-based UI.

### The Solution: Variant C — "Intent Hub + Smart Pages"

- **Chat Hub** as the start page and primary interaction surface
- **7 Smart Pages** (down from 17+ nav items) for spatial/visual tasks
- **Unified Design System** ("Calm Neurodesign") applied to 100% of components
- **AI Excellence** upgrades: elastic context budgets, graph-aware RAG, semantic memory clustering
- **Database cleanup**: schema simplification, RLS activation, type safety

### Why This Approach

Research-backed decision (see Section 2). Every successful all-in-one product has an **atomic unit** that absorbs new features without increasing cognitive load:

| Product | Atomic Unit | Users |
|---------|------------|-------|
| Notion | Block | 100M+ |
| Apple | Touch Target | 2B+ |
| Raycast | Command | 1M+ |
| **ZenAI** | **Intent** | — |

The Intent is ZenAI's atomic unit. Users express what they want (via chat, voice, Cmd+K, or suggestion tap). The AI classifies, assembles context, and routes to the right surface.

### Key Differentiators (vs. Competition)

| Feature | ChatGPT | Notion AI | Apple Intelligence | ZenAI (after Zenith) |
|---------|---------|-----------|-------------------|---------------------|
| Chat-First Hub | ✅ | ❌ | ❌ | ✅ |
| Structured Smart Pages | ❌ | ✅ | ❌ | ✅ |
| Persistent Memory (4-Layer) | ❌ | ❌ | ❌ | ✅ |
| Sleep-Time Compute | ❌ | ❌ | ❌ | ✅ |
| Proactive Intelligence | ❌ | ❌ | Partial | ✅ |
| Multi-Agent Orchestration | ❌ | ❌ | ❌ | ✅ |
| 4-Context Architecture | ❌ | ❌ | ❌ | ✅ |
| Knowledge Graph + RAG | ❌ | ❌ | ❌ | ✅ |
| Voice-First Input | ❌ | ❌ | ✅ (Siri) | ✅ |

---

## 2. Strategic Context

### Research Foundation

This spec is informed by extensive research across 6 domains:

**AI OS Trends (2025-2026):**
- Context Engineering has replaced Prompt Engineering (Gartner, Shopify CEO, Andrej Karpathy)
- Multi-agent systems hit production in 2026 (1,445% surge in Gartner inquiries)
- MCP transferred to Linux Foundation with backing from OpenAI, Google, Microsoft, Anthropic
- Memory is the moat: Letta/MemGPT 3-tier architecture is the reference standard (ICLR 2026)
- On-device AI is practical: sub-1B parameter models handle many tasks (Llama 3.2, Phi-4 mini)

**Product Strategy (All-in-One vs. Focused):**
- All-in-one succeeds under 7 specific conditions (all met by ZenAI — see below)
- Notion ($600M ARR, $11B valuation): "Everything is a Block" unification
- Rippling ($570M ARR, $20.8B valuation): Compound startup with shared data layer
- Failures (Humane AI Pin, Rabbit R1): tried everything at once, depth in nothing

**ZenAI meets the 7 success conditions:**

| Condition | ZenAI Status |
|-----------|-------------|
| Shared data layer | ✅ Memory + 4-context architecture |
| Each part standalone quality | ✅ After Zenith: each Smart Page is excellent |
| Natural cross-sell | ✅ Intent-routing naturally connects features |
| Market gap | ✅ No unified personal AI OS exists yet |
| Single user identity | ✅ One person, one AI assistant |
| Product-led growth | ✅ Goal: daily utility sells itself |
| Sequential expansion | ✅ Chat Hub first, then Smart Pages, then AI upgrades |

**Neuroscience & UX Research:**
- Processing Fluency = Perceived Quality (Reber, Schwarz, Winkielman)
- Spring Physics animations create "premium feel" (iOS pattern)
- Gestalt Proximity is the #1 grouping force (2:1 inter/intra ratio)
- Calm Technology: periphery-to-center attention design
- "Director, Not Operator" paradigm for AI interfaces (2026 consensus)
- Color Psychology: max 5 hues, cool tones for trust, warm accents for action
- Arc Browser's "Spaces": context-switching without cognitive cost via color accents

**Unifying Interaction Model Research:**
- Every successful all-in-one has one noun (atomic unit) + one verb (primary interaction)
- Chat as universal interface: strongest for expression, weakest for spatial tasks
- Hybrid model (chat + structured pages) is the 2026 consensus
- Ambient intelligence: features navigate to the user, not the other way around

### Variant Analysis (A vs. B vs. C)

Three approaches were evaluated:

| | A: Pure Intent | B: Contextual Workspace | C: Intent Hub + Smart Pages |
|---|---|---|---|
| Chat is... | THE interface | Embedded everywhere | The Hub + fallback Pages |
| Navigation | None | Traditional (improved) | Minimal (7 items) |
| Spatial tasks | Slide panels only | Dedicated pages | Dedicated Smart Pages |
| Parallel work | Impossible (serial chat) | Full support | Full support |
| Discoverability | Low (must ask) | High (sidebar) | Medium-High (7 items) |
| Revolutionary feel | 10/10 | 6/10 | 9/10 |
| Practical usability | 6/10 | 9/10 | 9/10 |
| Extensibility | 6/10 | 8/10 | 9/10 |

**Decision: Variant C** — because C is a strict superset of A (a user who only uses Chat Hub gets the A experience), while A cannot provide the spatial/parallel capabilities of C. C loses zero functionality from A while adding critical capabilities for Kanban, Calendar, Email, and Dashboards.

---

## 3. Information Architecture

### Current State: 17 Nav Items + 40+ Page Types

```
Chat, Browser
├─ Ideen (2 items, 8 sub-tabs)
├─ Organisieren (4 items, 8+ sub-tabs)
├─ Auswerten (3 items, 4+ sub-tabs)
├─ KI & Lernen (3 items, 7+ sub-tabs)
Footer: System-Admin, Settings (6 tabs), Notifications
```

**Problems:**
- Abstract section names ("Auswerten") create search cost
- 17 top-level items exceed Miller's 7±2 cognitive limit
- Features are organized by type, not by user intent
- Many pages have low usage (Screen Memory, Browser as standalone page)

### Target State: Chat Hub + 7 Smart Pages

```
┌──────────────────────────────────────────────┐
│              CHAT HUB (Start)                │
│    Smart Surface + Conversation + Intent Bar  │
├──────────────────────────────────────────────┤
│  💡 Ideen      Ideas + Incubator + Workshop  │
│  📋 Planer     Calendar + Tasks + Contacts   │
│  📧 Inbox      Email + Notifications + AI    │
│  📁 Wissen     Docs + Canvas + Knowledge Graph│
│  📊 Cockpit    Business + Finance + Insights │
│  🧠 Meine KI   Persona + Memory + Voice      │
│  ⚙️ System     Settings + Admin + Integrations│
└──────────────────────────────────────────────┘
```

### Consolidation Map

#### Chat Hub (replaces: Dashboard + Chat + Browser)

| Old Page | New Location | Rationale |
|----------|-------------|-----------|
| home (Dashboard) | Smart Surface in Chat Hub | Dashboard was passive display. Smart Surface is active: shows actionable cards |
| chat | Core of Chat Hub | Chat IS the primary interaction |
| browser | Chat intent: "Open URL..." or Cmd+K. Bookmarks → Wissen. History → chat query | Browser page removed. All 13 API endpoints remain active. Bookmarks migrate to Wissen as a document source. History accessible via chat intent ("Show browsing history"). `fetch_url` tool handles URL analysis |

#### 💡 Ideen (merges: Gedanken + Werkstatt)

| Old Page | New Location | Rationale |
|----------|-------------|-----------|
| ideas (4 tabs) | Ideen with filter chips (Active/Incubator/Archive) | Filter chips are more flexible than fixed tabs |
| workshop (Proactive/Evolution) | KI-Panel within Ideen page | Workshop was always "AI features for ideas" |
| agent-teams | Chat intent: "Start agent team for..." + result panel | Power feature, doesn't need own page |
| triage | Quick-actions on each idea card | Swipe/quick-action is faster than separate view |

#### 📋 Planer (merges: Calendar + Tasks + Contacts)

| Old Page | New Location | Rationale |
|----------|-------------|-----------|
| calendar (5 tabs) | Planer with view-switcher (Calendar/List/Board/Timeline) | Gantt, Kanban, Tasks are different VIEWS of the same data |
| contacts | Dedicated Contacts view within Planer + slide panels for detail | Full CRM preserved. Contacts is a view in Planer's view-switcher. Contact detail opens as slide panel when referenced from other views |
| meetings | Part of calendar (meeting = event with protocol) | Already the case, just separated as a tab |

#### 📧 Inbox (merges: Email + Notifications + Unified Inbox)

| Old Page | New Location | Rationale |
|----------|-------------|-----------|
| email | Inbox: all incoming items in one place | |
| notifications | Part of Inbox (filter tab) | Notifications ARE inbox items |
| unified inbox API | Data source for new Inbox | API already exists at `/api/:context/inbox` |

#### 📁 Wissen (merges: Knowledge Base + Knowledge Graph + Learning)

| Old Page | New Location | Rationale |
|----------|-------------|-----------|
| documents (Docs, Canvas, Media) | Wissen: Documents, Canvas, Media | Core preserved |
| knowledge-graph (Insights tab) | Visualization within Wissen page | KG shows connections between knowledge units — belongs here |
| learning | Learning mode within Wissen (view) + tasks in Planer | "Explain X" = chat intent. Learning goals migrate to Planer tasks (tagged `source: 'learning'`). `learning_tasks` table data → `tasks` table. Learning material = docs in Wissen. "Learning" filter chip in Planer + Wissen surfaces all learning-related items |
| screen-memory | Chat intent: "What was on my screen yesterday?" | Niche feature, no dedicated page needed |

#### 📊 Cockpit (merges: Business + Finance + Insights)

| Old Page | New Location | Rationale |
|----------|-------------|-----------|
| business (8 tabs) | Cockpit: Business metrics | |
| finance | Cockpit: Finance tab | Business and Finance are both "numbers about my work/life" |
| insights/analytics | Cockpit: Trends & Patterns | Analytics over ideas, sleep compute insights, trends — all under one roof |
| graphrag | Backend feature, no UI needed | GraphRAG is a retrieval strategy, not user-facing |

#### 🧠 Meine KI (focused)

| Old Page | New Location | Rationale |
|----------|-------------|-----------|
| my-ai (5 tabs) | Meine KI: Persona + Memory + Voice | Core preserved, focused |
| digital-twin | Future feature within Persona tab | Not differentiated enough for own tab yet |
| procedural-memory | Backend feature, visible via Memory tab | User doesn't need separate procedural memory UI |

#### ⚙️ System (merges: Settings + System-Admin + Integrations)

| Old Page | New Location | Rationale |
|----------|-------------|-----------|
| settings (6 tabs) | System: All configuration | |
| system-admin | System: Admin tab | Was always "configuration" |
| mcp-servers | System: Integrations tab | MCP is an integration |

### Complete Page Type Migration Map

Every existing `Page` type from `types/idea.ts` is explicitly mapped below. No page is left unmapped.

| Current Page Type | Target Location | Migration Notes |
|---|---|---|
| `home` | **Chat Hub** (Smart Surface) | Dashboard widgets become Smart Surface cards |
| `chat` | **Chat Hub** (core) | IS the Chat Hub |
| `browser` | **Chat Hub** (intent: "Open URL...") | Browse history/bookmarks migrate to Wissen. 13 browser API endpoints remain active, invoked via chat intent or Cmd+K |
| `ideas` | **Ideen** page | Core preserved |
| `incubator` | **Ideen** page (filter chip) | Legacy redirect preserved |
| `archive` | **Ideen** page (filter chip) | Legacy redirect preserved |
| `triage` | **Ideen** page (quick-actions) | Swipe/quick-action on cards |
| `workshop` | **Ideen** page (AI Panel) | Workshop features become slide panel |
| `proactive` | **Ideen** page (AI Panel tab) | Proactive suggestions within AI panel |
| `evolution` | **Ideen** page (AI Panel tab) | Idea evolution within AI panel |
| `agent-teams` | **Chat Hub** (intent + result panel) | "Start agent team for..." triggers agent workflow |
| `calendar` | **Planer** page | Core preserved |
| `tasks` | **Planer** page (List view) | View switcher |
| `kanban` | **Planer** page (Board view) | View switcher |
| `gantt` | **Planer** page (Timeline view) | View switcher |
| `meetings` | **Planer** page (calendar events with protocol) | Meeting = event + protocol, not separate |
| `contacts` | **Planer** page (dedicated Contacts view + slide panels) | Full CRM preserved as a view within Planer. Contact detail opens as slide panel. All 15 Contacts API endpoints remain active |
| `email` | **Inbox** page | Core preserved |
| `notifications` | **Inbox** page (filter tab) | Notifications ARE inbox items |
| `documents` | **Wissen** page | Core preserved |
| `canvas` | **Wissen** page (Canvas view) | Core preserved |
| `media` | **Wissen** page (Media view) | Core preserved |
| `knowledge-graph` | **Wissen** page (Connections view) | Visualization within Wissen |
| `graphrag` | Backend-only (no user-facing page) | Retrieval strategy, API endpoints remain |
| `learning` | **Wissen** page (Learning mode) | Learning goals = tasks in Planer. Learning material = documents in Wissen. "Explain X" = chat intent. `learning_tasks` table data migrates to `tasks` with a `source: 'learning'` tag |
| `learning-tasks` | **Planer** page (tasks with learning tag) | Learning tasks are tasks — shown in Planer with "Learning" filter |
| `insights` | **Cockpit** page (Trends tab) | Core preserved |
| `analytics` | **Cockpit** page (Trends tab) | Sub-page of insights |
| `digest` | **Cockpit** page (Trends tab) | AI-generated summaries |
| `business` | **Cockpit** page (Business tab) | Core preserved |
| `finance` | **Cockpit** page (Finance tab) | Core preserved |
| `my-ai` | **Meine KI** page | Core preserved |
| `voice-chat` | **Meine KI** page (Voice tab) | Core preserved |
| `memory-insights` | **Meine KI** page (Memory tab) | Memory browser with insights |
| `digital-twin` | **Meine KI** page (Persona tab, future) | Not differentiated enough for own tab yet |
| `procedural-memory` | **Meine KI** page (Memory tab, sub-section) | Visible via Memory browser |
| `personalization` | **Meine KI** page (Persona tab) | Legacy redirect |
| `screen-memory` | **Chat Hub** (intent: "What was on my screen?") | Screen Memory API endpoints remain. Niche feature accessed via chat |
| `settings` | **System** page | Core preserved |
| `profile` | **System** page (Profile tab) | Legacy redirect |
| `automations` | **System** page (Integrations tab) | Legacy redirect |
| `integrations` | **System** page (Integrations tab) | Legacy redirect |
| `export` | **System** page (Privacy tab) | Legacy redirect |
| `sync` | **System** page (Privacy tab) | Legacy redirect |
| `mcp-servers` | **System** page (Integrations tab) | MCP is an integration |
| `system-admin` | **System** page (Admin tab) | Core preserved |
| `stories` | Deprecated (remove) | Unused legacy page type |
| `dashboard` | **Chat Hub** (Smart Surface) | Legacy redirect to Chat Hub |
| `ai-workshop` | **Ideen** page (AI Panel) | Legacy redirect |

**Browser Migration Detail:** The `browser` page currently has 13 API endpoints (history CRUD, bookmarks CRUD, AI analyze). These endpoints remain active. Bookmarks migrate to Wissen as a document source. History is accessible via chat ("Show my browsing history for yesterday"). The standalone browser page is removed but all data and APIs persist.

**Learning Migration Detail:** The `learning` page has learning goals and `learning_tasks`. Learning goals migrate to Planer as tasks tagged with `source: 'learning'`. Learning material (documents, notes) stays in Wissen. The "Explain X" learning interaction is a natural chat intent. A "Learning" filter chip in both Planer and Wissen surfaces all learning-related items.

### Result

- **Page types:** 47 → 8 (7 Smart Pages + 1 Chat Hub). All 47 explicitly mapped above
- **Navigation items:** 17 → 7 + 1
- **Zero features lost:** Every capability remains accessible via direct page OR chat intent
- **Zero API endpoints removed:** All backend routes remain active

---

## 4. Chat Hub Design

### Architecture

The Chat Hub consists of three layers:

```
┌─────────────────────────────────────────────────────┐
│ ① Smart Surface (max 3 contextual cards)            │
│    Proactive, time-aware, dismissible               │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ② Conversation Stream                               │
│    Messages + Adaptive Inline Results +              │
│    Slide Panels + Tool Disclosure                    │
│                                                     │
├─────────────────────────────────────────────────────┤
│ ③ Intent Bar                                        │
│    [🎤] [Ask me anything or give me a task...]  [➤] │
│    Thinking: ○ Fast  ● Thorough  ○ Deep             │
└─────────────────────────────────────────────────────┘
```

### ① Smart Surface

**Purpose:** Proactive, time-aware, actionable cards. Not a static dashboard — living, relevant hints.

**Rules:**

| Time Window | Trigger | Card Content |
|-------------|---------|-------------|
| 06:00–11:00 | First visit of day | Morning Briefing: today's events, open tasks, unread mail summary |
| Always | High-priority unread email | "[Sender] replied to [Subject]" + Quick-Reply button |
| Always | Sleep compute contradiction | "AI found a contradiction in your knowledge" + Resolve button |
| Always | Overdue task | "[Task] was due yesterday" + Postpone/Done buttons |
| 14:00–18:00 | Low-energy afternoon | Learning suggestion based on memory patterns |
| Always | New pattern detected | "You've been focused on [topic] for 3 days — create a summary?" |

**Design Specifications:**
- Glassmorphism cards (backdrop-blur 16px, semi-transparent)
- Staggered entry animation: Card 1 at 0ms, Card 2 at 100ms, Card 3 at 200ms
- Spring easing: `cubic-bezier(0.34, 1.56, 0.64, 1)` with 300ms duration
- Dismiss: Swipe-right (mobile) or X button → 24h cooldown
- Snooze: "Later" → 1h / 4h / Tomorrow options
- Accept: One-tap action (e.g., "Reply" opens email composer as slide panel)
- Empty state: Smart Surface disappears completely — no placeholder, no "all caught up" message. Calm technology: show nothing when there is nothing to show.

### ② Conversation Stream — Adaptive Surface Rendering

AI responses render as **adaptive surfaces** that match content type:

| AI Response Contains... | Rendering | Example |
|------------------------|-----------|---------|
| Text only | Markdown bubble (as today) | "Berlin has 3.7M inhabitants" |
| Task created | Task card inline (green border, checkbox) | ✅ "Prepare presentation" — Due: Tomorrow |
| Email draft | Email composer as slide panel from right | Subject, Body, Send button |
| Data/numbers | Inline chart (sparkline or bar chart) | Revenue trend last 7 days |
| Code | Code block with syntax highlighting + Copy + Run | Python/JS/etc. |
| Table | Sortable inline table | Comparison table |
| Multiple results | Expandable cards (progressive disclosure) | "3 related ideas found" → expand |
| Long-form document | "Open in Canvas" button (link to Wissen page) | Generated article |
| Calendar entry | Event card with date/time/attendees | "Meeting with Sarah, Friday 14:00" |
| Agent workflow | Progress timeline with steps | ● Research → ◐ Writing → ○ Review |

**Slide Panels:**
For complex interactions (composing email, editing documents, contact details), a panel slides in from the right — 400px wide on desktop, full-screen on mobile. The panel overlays the chat; the chat remains visible in the background (depth layering via glassmorphism).

```
Desktop Layout:
┌─────────────────┬──────────────────┐
│                 │  Slide Panel     │
│   Chat          │  (400px)         │
│   (blurred bg)  │                  │
│                 │  Email to Sarah  │
│                 │  [Subject]       │
│                 │  [Body...]       │
│                 │  [Send]          │
└─────────────────┴──────────────────┘
```

### ③ Intent Bar

The Intent Bar is the universal entry point for ALL actions.

**Structure:**
```
┌────────────────────────────────────────────────────────┐
│ 🎤 │ Ask me anything or give me a task...          │ ➤ │
├────────────────────────────────────────────────────────┤
│ ○ Fast (Haiku)  ● Thorough (Sonnet)  ○ Deep (Opus)   │
│ 📎 File  🖼️ Image  ⌘K Commands                       │
└────────────────────────────────────────────────────────┘
```

**Behaviors:**
- **Empty input + focus:** Shows 3-4 suggestion chips ("What's on today?", "Unread emails", "Continue last idea")
- **Typing:** Live autocomplete for commands (starts with `/`) and referenced entities (`@Sarah`, `#ProjectName`)
- **Cmd+K:** Opens Command Palette (fuzzy-search across all functions, pages, entities)
- **Voice button:** Starts voice mode (visualizer animation, push-to-talk or VAD)
- **Thinking mode toggle:** Selects depth (routes to different models)
- **Drag-drop:** Files/images onto Intent Bar → automatic analysis

**Command Palette (Cmd+K):**
```
┌─────────────────────────────────────────┐
│ 🔍 Search pages, actions, ideas...      │
├─────────────────────────────────────────┤
│ Pages                                   │
│   📋 Planer                             │
│   📧 Inbox                              │
│   💡 Ideen                              │
│ Actions                                 │
│   ✏️ Create new idea                    │
│   📧 Compose email                      │
│   🤖 Start agent team                   │
│ Recent Ideas                            │
│   "React Hooks Tutorial"                │
│   "Business Plan Q2"                    │
└─────────────────────────────────────────┘
```

### Mobile Layout

```
┌─────────────────────────────────────────┐
│ Smart Surface (horizontal scroll)        │
│ [Card 1] [Card 2] [Card 3]              │
├─────────────────────────────────────────┤
│                                         │
│        Conversation Stream               │
│                                         │
├─────────────────────────────────────────┤
│ [Intent Bar]                             │
├─────────────────────────────────────────┤
│ 💬Chat  💡Ideas  📋Plan  📧Inbox  ●●●More│
└─────────────────────────────────────────┘
```

---

## 5. Smart Page Concepts

### Shared Layout Pattern

Every Smart Page follows the same structural pattern:

```
┌──────────────────────────────────────────────┐
│ Page Header                                  │
│ [Title] [View Switcher] [Filters] [+ New]    │
├──────────────────────────────────────────────┤
│                                              │
│ Content Area                                 │
│ (Adaptive based on selected view)            │
│                                              │
├──────────────────────────────────────────────┤
│ Chat Sidecar (optional, 320px, from right)   │
│ "Ask the AI about this page..."              │
└──────────────────────────────────────────────┘
```

**Chat Sidecar:** Every Smart Page has a collapsible chat panel. The chat knows the context of the current page. On Ideen page: "Which ideas relate to React?" On Planer: "What's most important today?" On Cockpit: "Explain the revenue drop." Same chat backend, page-specific system prompt.

### 💡 Ideen Page

**Purpose:** Capture, develop, and connect all thoughts.

**Views:**
- **Grid** (default): Card grid with glassmorphism cards. Hover shows summary. Color-coded by context (Personal=Blue, Work=Teal, Learning=Purple, Creative=Amber)
- **List**: Compact list view, sortable by date/priority/type
- **Graph**: Knowledge graph visualization of idea connections (2D force-graph with D3)

**Filter Chips** (replace current 4 tabs):
`All` `Active` `Incubator` `Archive` `⭐ Favorites` `Type: Task` `Type: Question` `Priority: High`

**AI Panel** (replaces Workshop):
- Button "✨ AI Suggestions" opens slide panel from right
- Shows: idea developments, similar ideas, contradictions, patterns
- Based on sleep compute results + real-time RAG

**Inline Actions per Card:**
- Quick-edit (title + priority inline editable)
- Swipe left: Archive | Swipe right: Favorite
- Context menu: Convert to task, start agent team, share

### 📋 Planer Page

**Purpose:** Plan, organize, and schedule everything.

**Views (View Switcher):**
- **Calendar**: Month/week/day view. Events + tasks integrated
- **Board**: Kanban with 4 columns (Backlog → Todo → In Progress → Done). Drag-drop
- **List**: Sortable task list, groupable by project/priority/due date
- **Timeline**: Gantt-style horizontal timeline. Project grouping, dependencies
- **Contacts**: Full CRM view. Contact list with search/filter, organization view, follow-up suggestions. All 15 Contacts API endpoints active. Contact detail opens as slide panel

**Contact Integration (cross-view):**
- When a task/event references a contact, a small avatar appears
- Click avatar → contact detail as slide panel
- "Meeting with Sarah" shows Sarah's contact info, last interactions, notes
- Contacts view is a full-featured CRM — not a downgrade from current ContactsPage

**AI Features (inline):**
- Auto-prioritization: AI suggests order based on deadlines, dependencies, energy level (time of day)
- Smart scheduling: "Find a free 1h focus slot tomorrow" → shows suggestions
- Meeting protocol: On calendar event → "Start protocol" → voice recording + AI structuring

### 📧 Inbox Page

**Purpose:** Everything that needs my attention, in one place.

**Sources (unified stream):**
1. Emails (Resend integration)
2. System notifications (reminders, task updates, agent results)
3. Proactive AI hints (sleep compute discoveries, governance approvals)

**Filter Tabs:**
`All` `Email` `AI Hints` `System` `Unread` `⭐ Starred`

**Layout:**
```
┌──────────────┬───────────────────────────┐
│ Inbox List   │ Detail Panel              │
│              │                           │
│ ● Sarah...   │ From: Sarah Meyer         │
│   RE: Offer  │ Subject: RE: Offer Q2     │
│              │                           │
│ ○ AI Hint    │ [Email Body]              │
│   Contradiction│                         │
│              │ AI Summary:               │
│ ○ Reminder   │ "Sarah agrees on price,   │
│   Meeting... │  asks about delivery date" │
│              │                           │
│              │ [Reply] [Forward]          │
│              │ [Generate AI Reply]        │
└──────────────┴───────────────────────────┘
```

**AI Features:**
- Auto-summary of every email (1 sentence, below subject)
- Intelligent prioritization (by relevance + urgency, not chronological)
- Quick-reply suggestions (3 options: formal, friendly, brief)
- Batch actions: "Mark all newsletters as read"

### 📁 Wissen Page

**Purpose:** Store, connect, and retrieve all knowledge.

**Views:**
- **Documents**: Folder structure + file grid. Upload, analysis, search
- **Canvas**: Freeform editor (Markdown + Mermaid + Images). Notion-like pages
- **Connections**: Knowledge graph visualization. Entities, relations, communities
- **Media**: Images, videos, audio recordings in a media grid
- **Learning**: Learning material, study notes, bookmarked resources. Filter chip "Learning" surfaces all learning-tagged documents. Browsing bookmarks (migrated from browser) also appear here

**AI Features:**
- Document analysis: Upload → automatic summary, keyword extraction, entity recognition
- Knowledge synthesis: "Summarize everything I know about topic X" (RAG across all sources)
- Learning mode: "Explain [topic] like I'm a beginner" → uses existing docs + memory
- Learning goal tracking: Learning goals are tasks in Planer, material is here in Wissen. Cross-linked via tags

### 📊 Cockpit Page

**Purpose:** How are things? One glance — all numbers.

**Tabs:**
- **Overview**: Key metrics at a glance. 4-6 cards with sparklines. AI-generated day/week summary
- **Business**: Stripe revenue, GA4 traffic, SEO performance, uptime
- **Finance**: Accounts, transactions, budgets, savings goals
- **Trends**: Idea activity over time, productivity patterns, memory growth, sleep compute insights

**Design:** Bento grid layout with glassmorphism cards. Each card has a sparkline + trend arrow (↑↓→). Hover shows detail chart. Click opens detail view.

### 🧠 Meine KI Page

**Purpose:** Tune the AI to you. Understand what it knows. Listen to it.

**Tabs:**
- **Persona**: Configure AI personality (tone, language, expertise, behavior). Like a "character sheet" for the AI
- **Memory**: What the AI knows about you. Search, correct, delete facts. Memory statistics (facts per context, decay curves, emotional weighting). Sleep compute log: "Last night the AI consolidated 12 episodes and resolved 3 contradictions"
- **Voice**: Voice chat interface. Waveform visualizer. Voice selection. Transcript history

### ⚙️ System Page

**Tabs:**
- **Profile**: Account, avatar, language, context settings
- **General**: Theme (Light/Dark/Auto), notifications, keyboard shortcuts
- **AI Settings**: Default model, thinking budget, max tokens, tool limits
- **Integrations**: MCP servers, API keys, webhooks, extensions
- **Privacy**: Data export, data deletion, memory settings, offline mode
- **Admin**: Queue status, traces, security audit log, rate limits (power user/admin only)

---

## 6. Design System Evolution

### Philosophy: "Calm Neurodesign"

Every design decision grounded in cognitive science:
- **Calm:** Technology that informs without disturbing. Ambient, not invasive.
- **Neuro:** Processing fluency, Gestalt proximity, spring physics, ethical dopamine rewards.

### 6.1 Color System (Single Source of Truth)

**Eliminating the dual system.** One color system for everything:

```css
/* Semantic Colors (5 hues — no more) */
--color-accent:     hsl(250, 65%, 58%);    /* Purple — Primary Action */
--color-accent-2:   hsl(190, 60%, 45%);    /* Teal — Secondary/Links */
--color-success:    hsl(160, 70%, 42%);    /* Green — Success */
--color-warning:    hsl(38, 95%, 55%);     /* Amber — Warning */
--color-danger:     hsl(0, 72%, 55%);      /* Red — Danger */

/* Context Colors (subtle accents, not dominant themes) */
--context-personal: hsl(210, 70%, 55%);    /* Blue */
--context-work:     hsl(160, 60%, 45%);    /* Teal */
--context-learning: hsl(280, 60%, 55%);    /* Purple */
--context-creative: hsl(35, 90%, 55%);     /* Amber */

/* Surface System (Neutral Warm-Gray) */
/* Light Mode */
--surface-bg:       hsl(220, 14%, 97%);    /* Near-white */
--surface-1:        hsl(220, 14%, 99%);    /* Cards — subtle lift above bg */
--surface-2:        hsl(220, 12%, 95%);    /* Elevated cards */
--surface-3:        hsl(220, 10%, 91%);    /* Borders/Dividers */

/* Dark Mode */
--surface-bg-dark:  hsl(225, 18%, 10%);
--surface-1-dark:   hsl(225, 16%, 14%);
--surface-2-dark:   hsl(225, 14%, 18%);
--surface-3-dark:   hsl(225, 12%, 24%);

/* Text (never pure black/white) */
--text-primary:     hsl(220, 15%, 15%);    /* Light mode */
--text-secondary:   hsl(220, 10%, 45%);
--text-tertiary:    hsl(220, 8%, 62%);

/* Glass Surfaces */
--glass-bg:         rgba(255, 255, 255, 0.72);
--glass-bg-dark:    rgba(30, 30, 46, 0.72);
--glass-blur:       16px;
--glass-border:     rgba(255, 255, 255, 0.25);
--glass-border-dark:rgba(255, 255, 255, 0.08);
```

**Context Indication:** Not full theme changes — a subtle 2px accent stripe in sidebar + badge color in TopBar. Rest of UI stays neutral. Arc Browser pattern: enough to recognize context, little enough not to distract.

### 6.2 Typography System

```css
/* Font Stack */
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;

/* Modular Scale 1.25 */
--text-xs:    0.75rem;    /* 12px — Captions, Timestamps */
--text-sm:    0.875rem;   /* 14px — Secondary Text, Labels */
--text-base:  1rem;       /* 16px — Body Text */
--text-lg:    1.125rem;   /* 18px — Subheadings */
--text-xl:    1.25rem;    /* 20px — Section Headers */
--text-2xl:   1.5rem;     /* 24px — Page Titles */
--text-3xl:   1.875rem;   /* 30px — Hero/Greeting (Chat Hub only) */

/* Weights */
--font-normal:   400;     /* Body */
--font-medium:   500;     /* Labels, Buttons */
--font-semibold: 600;     /* Headings */
--font-bold:     700;     /* Emphasis (sparingly!) */

/* Line Heights */
--leading-tight:   1.3;   /* Headings */
--leading-normal:  1.55;  /* Body (optimized for processing fluency) */
--leading-relaxed: 1.7;   /* Long-form content */
```

### 6.3 Spacing System (Gestalt-Proximity Optimized)

```css
/* 4px base scale */
--space-1:   4px;     /* Tight — within an element */
--space-2:   8px;     /* Related — label to input */
--space-3:   12px;    /* Grouped — items in a list */
--space-4:   16px;    /* Between — card padding, item gaps */
--space-5:   20px;
--space-6:   24px;    /* Sections — spacing between groups */
--space-8:   32px;    /* Zones — major layout blocks */
--space-10:  40px;
--space-12:  48px;    /* Regions — page sections */
--space-16:  64px;    /* Pages — page margins on desktop */

/* Gestalt Rule:
   Intra-group: --space-2 to --space-3 (8-12px)
   Inter-group: --space-6 to --space-8 (24-32px)
   → Ratio ≥ 2:1 for clear grouping */
```

### 6.4 Animation System (Spring Physics)

```css
/* Easing Curves */
--ease-default:  cubic-bezier(0.4, 0, 0.2, 1);        /* Standard */
--ease-spring:   cubic-bezier(0.34, 1.56, 0.64, 1);    /* Entry with overshoot */
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);        /* Fast start, gentle end */
--ease-in:       cubic-bezier(0.4, 0, 1, 1);            /* Exit */

/* Durations */
--duration-instant: 80ms;     /* Hover state, press feedback */
--duration-fast:    150ms;    /* Micro-interactions (toggle, checkbox) */
--duration-base:    250ms;    /* Standard transitions */
--duration-smooth:  350ms;    /* Slide panels, expansions */
--duration-layout:  450ms;    /* Layout shifts, page transitions */

/* Presets */
/* Enter:  var(--duration-smooth) var(--ease-spring)     — overshoot, then settle */
/* Exit:   var(--duration-base)   var(--ease-in)          — fast disappear */
/* Layout: var(--duration-layout) var(--ease-out-expo)    — smooth reflow */

/* Reduced Motion (mandatory on ALL animations) */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 6.5 Visual Haptics

```css
/* Button Press — 3% scale for "physical" feedback */
.interactive:active {
  transform: scale(0.97);
  transition: transform var(--duration-instant) var(--ease-default);
}

/* Success Flash */
@keyframes success-flash {
  0%   { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
  50%  { box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.2); }
  100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
}
```

### 6.6 Glassmorphism Specification

Three glass levels for depth hierarchy:

```css
/* Glass Level 1: Smart Surface cards, tooltips */
.glass-1 {
  background: var(--glass-bg);
  backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.04);
}

/* Glass Level 2: Slide panels, modals */
.glass-2 {
  background: var(--glass-bg);
  backdrop-filter: blur(20px);
  border: 1px solid var(--glass-border);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
}

/* Glass Level 3: Overlay backdrop */
.glass-backdrop {
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(8px);
}
```

### 6.7 Component Migration Strategy

| Priority | Action | Scope |
|----------|--------|-------|
| P0 | Colors: Replace all legacy tokens (`--primary`, `--surface`, `--petrol-*`) with new tokens | index.css + all component files |
| P0 | Typography: Replace all hardcoded `font-size`/`font-weight` with token variables | All CSS files |
| P1 | Spacing: Replace all hardcoded px values with `var(--space-N)` | All CSS files |
| P1 | Animations: Replace all individual `transition` declarations with presets | All CSS files |
| P2 | Components: Migrate each page to DS components (Card, Button, Badge, Tabs, Input) | Per page |
| P2 | Dark Mode: Unify via `[data-theme="dark"]` selector | index.css + all files |
| P3 | CSS consolidation: Merge similar styles, remove dead CSS. Target: ~159 → ~60-70 files (pages consolidate, DS components keep individual CSS) | Audit |

**New DS Components needed (10 additions to current 10):**
Tooltip, Dropdown, Switch, Progress, Alert, Dialog/Sheet, Popover, Chip/Tag, Divider, Spinner

### 6.8 React Query Hook Migration Strategy

The existing 9 hook files in `hooks/queries/` are organized per-page. With consolidation, hooks merge alongside pages:

| Current Hook | Target | Action |
|---|---|---|
| `useIdeas.ts` | Ideen page | Keep as-is, add workshop query keys |
| `useDashboard.ts` | Chat Hub Smart Surface | Rename to `useSmartSurface.ts`, adapt queries for card data |
| `useContacts.ts` | Planer page hooks | Merge into `usePlaner.ts` alongside task/calendar queries |
| `useTasks.ts` | Planer page hooks | Merge into `usePlaner.ts` |
| `useCalendar.ts` | Planer page hooks | Merge into `usePlaner.ts` |
| `useEmail.ts` | Inbox page hooks | Rename to `useInbox.ts`, add notification queries |
| `useFinance.ts` | Cockpit page hooks | Merge into `useCockpit.ts` alongside business/insights queries |
| `useChat.ts` | Chat Hub hooks | Keep as-is, extend for intent bar features |
| `useBusinessData.ts` | Cockpit page hooks | Merge into `useCockpit.ts` |
| `useInsightsData.ts` | Cockpit page hooks | Merge into `useCockpit.ts` |
| `useLearningData.ts` | Split: tasks → `usePlaner.ts`, docs → `useWissen.ts` | Dissolve |
| `useMyAI.ts` | Meine KI page hooks | Keep as-is |
| `useSettings.ts` | System page hooks | Rename to `useSystem.ts` |

**Query Key Factory** (`lib/query-keys.ts`): Consolidate 12 domains → 8 domains matching the new page structure. Old keys remain as aliases during migration for backward compatibility.

**Migration approach:** Per-page — when a Smart Page is built (Phases 106-110), its hooks are consolidated in the same phase. No separate "hook migration" phase needed.

---

## 7. Backend & AI Improvements

### 7.1 Context Engineering 2.0

**Problem:** Static token budgets, no semantic relevance filtering.

**Solution: Elastic Domain Budgets + Semantic Filtering**

```typescript
interface DomainBudget {
  system: number;        // Always 2K
  workingMemory: number; // 1.5-3K depending on domain
  personalFacts: number; // 2-4K depending on user's fact base
  ragContext: number;    // 4-12K depending on query complexity
  history: number;       // Remainder up to token limit
}

const DOMAIN_BUDGETS: Record<Domain, DomainBudget> = {
  code:    { system: 2000, workingMemory: 1500, personalFacts: 2000, ragContext: 12000, history: 0 },
  email:   { system: 2000, workingMemory: 2000, personalFacts: 3000, ragContext: 6000,  history: 0 },
  finance: { system: 2000, workingMemory: 1500, personalFacts: 4000, ragContext: 4000,  history: 0 },
  general: { system: 2000, workingMemory: 2000, personalFacts: 3000, ragContext: 8000,  history: 0 },
};

// Semantic Filtering: only include facts relevant to query
function filterByRelevance(facts: Fact[], queryEmbedding: number[], budget: number): Fact[] {
  const scored = facts.map(f => ({
    ...f,
    relevance: cosineSimilarity(f.embedding, queryEmbedding)
  }));
  return scored
    .filter(f => f.relevance > 0.3)
    .sort((a, b) => b.relevance - a.relevance)
    .reduce((acc, f) => {
      const tokens = estimateTokens(f.content);
      if (acc.totalTokens + tokens <= budget) {
        acc.facts.push(f);
        acc.totalTokens += tokens;
      }
      return acc;
    }, { facts: [], totalTokens: 0 }).facts;
}
```

### 7.2 Memory Neuroscience 3.0

**Problem:** Emotional tagging is keyword-based, not contextual.

**Solution: 3-tier upgrade**

1. **Negation Handling**: "I am NOT angry" → sentiment flip. Regex for negation markers (nicht, kein, never, no) + 3-token window
2. **Contextual Valence**: Emotion relative to goal. "Project failed" = negative for work context, neutral for learning context (learning experience)
3. **User-specific Decay Curves**: Instead of global Ebbinghaus parameters → learn per user: How fast does THIS user forget? Adjust based on recall hits/misses over time

**Semantic Clustering for Consolidation:**
```typescript
function clusterEpisodes(episodes: Episode[]): EpisodeCluster[] {
  const embeddings = episodes.map(e => e.embedding);
  const k = findOptimalK(embeddings, { minK: 2, maxK: Math.ceil(episodes.length / 3) });
  return kMeansClustering(embeddings, k);
}
```

### 7.3 RAG Pipeline: Graph-Aware + Iterative Refinement

1. **Graph-Aware Query Expansion**: On every RAG query, check user's knowledge graph entities. If "React" mentioned → auto-add related entities (Hooks, JSX, Virtual DOM) as expansion terms
2. **Iterative Refinement on AMBIGUOUS**: Instead of 1 retry → 2-3 reformulations with different strategies: (a) keyword-focused, (b) semantically rephrased, (c) decomposed into sub-queries
3. **Active Learning Loop**: On confidence < 0.6, ask micro-question: "Do you mean X or Y?" → feedback improves future retrieval

### 7.4 Agent Intelligence

1. **Dynamic Model Selection**:
   - Simple (lookup, greeting): Haiku → 80% cost reduction
   - Standard (analysis, writing): Sonnet → Default
   - Complex (multi-step reasoning, code review): Opus → Maximum quality

2. **Tool Specialization per Agent**:
   - Researcher: `web_search`, `fetch_url`, `search_ideas`, `recall` (read-only tools)
   - Writer: `create_idea`, `draft_email`, `create_task` (write tools)
   - Coder: `execute_code`, `analyze_project`, `github_*` (code tools)
   - Reviewer: No tools — only reflection on other agents' outputs

3. **Graceful Degradation**: Agent 2 (Writer) fails → Agent 1 (Researcher) result returned with note "Research completed, formatting failed"

### 7.5 Proactive Intelligence 2.0

**Score-based prioritization:**
```typescript
interface SuggestionScore {
  relevance: number;     // 0-1
  urgency: number;       // 0-1
  novelty: number;       // 0-1
  actionability: number; // 0-1
  final: number;         // weighted: relevance*0.35 + urgency*0.25 + novelty*0.2 + actionability*0.2
}
// Only show suggestions with score > 0.6
// Max 3 simultaneously (already implemented)
// 24h cooldown for dismissed (already implemented)
```

---

## 8. Database Cleanup

### 8.1 Schema Simplification

**Problem:** 40 tables × 4 schemas = 160 tables. Many don't belong in all 4 schemas.

**Solution: Table Classification**

| Category | Tables | Action |
|----------|--------|--------|
| **Context-specific** (stay in 4 schemas) | ideas, tasks, projects, emails, contacts, organizations, chat_sessions, chat_messages, learned_facts, episodic_memories, voice_memos, documents, bookmarks, financial_*, calendar_events, canvas_documents | Keep in all 4 schemas |
| **User-specific, not context-specific** (→ public) | notification_preferences, notification_history, analytics_events, user_settings, extension_installs | Move to `public` with `user_id` + `context` column |
| **System-global** (already in public) | api_keys, users, user_sessions, agent_identities, agent_workflows, mcp_server_connections, extension_registry | Stay in `public` |

**Result:** ~30 tables per schema instead of 40. ~10 tables moved to `public`.

### 8.2 Type Safety

1. **user_id → UUID everywhere**: Migration for all VARCHAR(100) user_id columns
2. **Native ENUMs**: `CREATE TYPE idea_type AS ENUM (...)` for the 5-6 most-used enum fields
3. **SYSTEM_USER_ID cleanup**: Migrate existing data to first real user, eliminate magic UUID

### 8.3 RLS Activation

Enable `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` for defense-in-depth. Incrementally per table, with tests.

### 8.4 Vector Index Optimization

```sql
CREATE INDEX idx_ideas_embedding_hnsw
  ON personal.ideas
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);
```

### 8.5 JSONB Index Addition

```sql
CREATE INDEX idx_analytics_events_data_gin
  ON personal.analytics_events
  USING GIN (event_data);
```

---

## 9. Phase Plan

### Architecture: 4 Mega-Phases, 17 Phases Total

### Mega-Phase I: "Foundation" (Phases 102–105)

**Goal:** Consolidate design system + build Chat Hub. App looks and feels world-class after this.

| Phase | Name | Content | Key Deliverables |
|-------|------|---------|-----------------|
| 102 | **Design Token Consolidation** | Unified color system, typography scale, spacing scale, animation presets. Eliminate legacy tokens. Unify dark mode. | `tokens.ts` rewrite, `index.css` cleanup, CSS migration script |
| 103 | **Component System Upgrade** | Expand DS to 20 components (+ Tooltip, Dropdown, Switch, Progress, Alert, Dialog, Popover, Sheet, Chip, Divider). Migrate existing pages to DS components. CSS consolidation where pages merge. | 20 DS components, CSS audit report, per-page migration |
| 104 | **Chat Hub MVP** | Chat as start page. Smart Surface with morning briefing. Intent Bar with suggestions + Cmd+K. Adaptive inline results (task cards, code blocks). Slide panel framework. | New ChatHub page, SmartSurface v2, IntentBar, SlidePanel framework |
| 105 | **Navigation Scaffolding** | Update `navigation.ts` to 7+1 structure. New sidebar points to **existing pages initially** — each nav item links to the current page that will later become the Smart Page (e.g., "Planer" links to current `/calendar` until Phase 107 replaces it). Mobile bottom tab bar (5 items). Legacy redirects for all removed routes. Page type refactoring in `types/idea.ts`. | New `navigation.ts`, new Sidebar, mobile redesign, legacy redirect map |

**Critical dependency note for Phase 105:** Navigation items point to existing pages as intermediaries. Each Smart Page phase (106-110) then replaces the intermediary with the consolidated page. This avoids dead links.

**Quality Gate I:** App is visually consistent. Chat Hub is start page. Navigation is 7+1 items (pointing to existing pages as placeholders until Smart Pages land).

### Mega-Phase II: "Smart Pages" (Phases 106–110)

**Goal:** Consolidate all 7 Smart Pages with AI enrichment.

| Phase | Name | Content |
|-------|------|---------|
| 106 | **Ideen Page Redesign** | Grid/List/Graph views. Filter chips replace tabs. AI panel. Inline edit. Swipe actions. Workshop features integrated |
| 107 | **Planer Page Redesign** | View switcher (Calendar/Board/List/Timeline). Contacts as slide panel. Smart scheduling via chat |
| 108 | **Inbox Fusion** | Email + Notifications + AI hints unified. Unified Inbox API as data source. Auto-summary. Intelligent prioritization |
| 109 | **Wissen + Cockpit Pages** | Wissen: Docs + Canvas + Knowledge Graph view. Cockpit: Business + Finance + Trends in bento grid |
| 110 | **Meine KI + System Pages** | Persona editor. Memory browser with search/correction. Voice chat integration. System: Settings + Admin + Integrations consolidated |

**Quality Gate II:** All 7 Smart Pages functional. No orphaned pages. Chat Sidecar on every page.

### Mega-Phase III: "AI Excellence" (Phases 111–114)

**Goal:** Elevate backend AI to state-of-the-art.

| Phase | Name | Content |
|-------|------|---------|
| 111 | **Context Engineering 2.0** | Elastic domain budgets. Semantic relevance filtering. LLM-based domain detection for edge cases |
| 112 | **Memory Neuroscience 3.0** | Negation handling. Contextual valence. User-specific decay curves. Semantic clustering for consolidation |
| 113 | **RAG Graph-Fusion** | Graph-aware query expansion. Iterative refinement (2-3 loops). Active learning micro-questions |
| 114 | **Agent Intelligence** | Dynamic model routing. Tool specialization. Graceful degradation. Cost tracking + reporting |

**Quality Gate III:** RAG accuracy measurably improved. Memory consolidation semantic not lexical. Agents cost 30-40% less.

### Mega-Phase IV: "Polish & Differentiation" (Phases 115–118)

**Goal:** The extra that makes "good" into "unique."

| Phase | Name | Content |
|-------|------|---------|
| 115 | **Proactive Intelligence 2.0** | Score-based suggestion prioritization. Higher signal quality. Personalized timing patterns |
| 116 | **Voice Experience** | Voice as first-class input everywhere (not just voice page). Emotion detection in speech. Proactive voice briefings |
| 117 | **Database Cleanup** | Schema simplification. RLS activation. UUID migration. HNSW index optimization. ENUM migration |
| 118 | **Performance & Polish** | Lighthouse 95+. Bundle size optimization. Skeleton loading everywhere. Animation polish. Accessibility audit (WCAG 2.1 AA complete) |

**Quality Gate IV:** App is visually, functionally, and technically world-class. Every interaction feels "right."

### Timeline Summary

```
Phase 101 (today) ──────────────────────────────────→ Phase 118 (goal)

Mega I:   Foundation     (102-105)   ~4-5 weeks
Mega II:  Smart Pages    (106-110)   ~4-5 weeks
Mega III: AI Excellence  (111-114)   ~3-4 weeks
Mega IV:  Polish         (115-118)   ~3-4 weeks

Total: ~14-18 weeks with careful execution
```

Each phase ends with passing tests and a production-deployable state. No big-bang release — every phase is independently deployable.

---

## 10. Success Metrics

### Quantitative

| Metric | Current | Target | How to Measure |
|--------|---------|--------|---------------|
| Navigation items | 17 | 8 | Count sidebar items |
| Page types | 40+ | 8 (7 Smart + Hub) | Count Page union type |
| CSS files | ~159 | ~60-70 | `find frontend/src -name "*.css" \| wc -l` — pages consolidate (17→8 = ~50% fewer page CSS), but DS components retain individual CSS |
| DS component usage | ~25% | 95%+ | Audit: components using DS vs custom |
| Lighthouse Performance | ~70 | 95+ | Lighthouse CI |
| RAG Accuracy (NDCG@10) | Unmeasured | ≥0.75 | Benchmark suite |
| Agent cost per query | Unmeasured | -30% vs baseline | Token tracking |
| Memory consolidation quality | Keyword-based | Semantic clusters | Manual evaluation |
| Test count | 5,830 | 6,500+ | `npm test` |

### Qualitative

| Dimension | Current | Target |
|-----------|---------|--------|
| First impression | "Feature-rich app" | "This feels premium and intelligent" |
| Navigation | "Where do I find X?" | "I just tell it what I want" |
| AI interaction | "Let me switch to the right page" | "The right thing appeared automatically" |
| Visual consistency | "Some pages look different" | "Everything feels like one product" |
| Animation quality | "Functional" | "Smooth, physical, satisfying" |

---

## 11. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Users miss old navigation | Medium | Medium | Legacy redirects + Cmd+K as escape hatch. Monitor analytics for navigation failures |
| Chat Hub feels empty for new users | Medium | High | Suggestion chips + onboarding flow. First-time tutorial chat |
| Design system migration breaks existing UI | Medium | Medium | Phase-by-phase migration with visual regression tests. Screenshot diffing |
| Smart Page consolidation loses niche features | Low | Medium | Mapping table ensures zero features lost. Chat intents cover all edge cases |
| Performance regression from glassmorphism | Low | Medium | backdrop-filter performance testing. Fallback for older browsers |
| 14-18 week timeline slips | Medium | Low | Each phase is independently deployable. No phase depends on all prior phases |

---

## 12. Research Sources

### AI OS & Agent Trends
- Gartner: Prompt Engineering is Dead, Context Engineering Lives (2025)
- IBM: 2026 AI Tech Trends — Multi-Agent Systems to Production
- Anthropic: Building Effective AI Agents (2025)
- ICLR 2026: MemAgents — Memory for AI Agents
- Letta/MemGPT: Three-Tier Memory Architecture
- MCP Roadmap 2026 (Linux Foundation)

### Product Strategy
- Notion: $600M ARR, Block-Based Unification (SaaStr, Latka)
- Rippling: $570M ARR, Compound Startup (TechCrunch)
- Parker Conrad: The Compound Startup Advantage
- Humane AI Pin / Rabbit R1: Why AI Hardware Failed (TechResearchOnline)
- Menlo Ventures: 2025 State of Generative AI in Enterprise
- a16z: 14 Big Ideas for 2026

### Neuroscience & UX
- Reber, Schwarz, Winkielman: Processing Fluency and Aesthetic Pleasure
- Calm Technology Principles (calmtech.institute)
- Gestalt Principles in UI Design (IxDF)
- Spring Physics and Perceived Quality (iOS HIG)
- Color Psychology in Productivity Tools (Smashing Magazine)
- Arc Browser: Context-Switching via Spaces (Hack Design)
- Designing for Flow: Behavioral Insights (UXPsychology)
- Director Not Operator: Agentic AI UX (Designative)
- Neurodesign: Applying Neuroscience to UX (OneThing Design)

### Interaction Models
- Defining an Interaction Model (UXmatters)
- Notion: Everything is a Block (Data Model)
- Linear Method: Opinionated Software
- Hub and Spoke Architecture (The New Stack)
- ChatGPT as an OS: OpenAI's Ecosystem (DaffodilSW)

---

*End of specification.*
