# ZenAI World #1 Roadmap — Von 5.5/10 zur weltweit führenden AI OS Anwendung

> **Erstellt:** 2026-03-16
> **Basis:** Competitive Analysis (50+ Produkte), Codebase Audit (380 Tabellen, 252 Komponenten), UX Research (Superhuman, Linear, Raycast, Apple), AI Research (MAGMA, CHI 2025, NeurIPS 2025)
> **Ziel:** ZenAI wird die weltweit führende AI OS Anwendung — ein System, das alles KI-gestützt vereint

---

## Strategische Vision

**ZenAI ist das einzige Produkt weltweit, das diese 6 Eigenschaften kombiniert:**
1. Persistent Memory mit Neurowissenschaft (Ebbinghaus, Emotional Tagging, Sleep Compute)
2. 4-Kontext-Architektur (Personal/Work/Learning/Creative)
3. Proaktive Intelligenz (nicht nur reaktiv)
4. 49+ integrierte Tools mit MCP-Ökosystem
5. Multi-Agent-Orchestrierung mit Governance
6. Temporal Knowledge Graph

**Das Problem:** Die Ausführungsqualität (Design, Performance, Security, Testing) steht bei 5.5/10 und verhindert, dass diese einzigartigen Stärken beim Nutzer ankommen. Ein Konkurrent mit 10% der Features aber Superhuman-Level UX würde besser wahrgenommen.

**Die Lösung:** 19 Phasen in 4 Säulen — erst Fundament härten, dann UX auf Weltklasse heben, dann AI vertiefen, dann neue Differenzierungsmerkmale einführen.

---

## Aktuelle Scores → Ziel-Scores

| Dimension | IST (03/2026) | ZIEL | Delta |
|-----------|:---:|:---:|:---:|
| Code-Architektur | 5/10 | 9/10 | +4 |
| Design System / UI | 3/10 | 10/10 | +7 |
| UX / Produktgefühl | 4/10 | 10/10 | +6 |
| Production Hardening | 5/10 | 9/10 | +4 |
| Mobile Experience | 5/10 | 9/10 | +4 |
| AI-Integrationstiefe | 8/10 | 10/10 | +2 |
| Memory-Architektur | 9/10 | 10/10 | +1 |
| Performance | 5/10 | 10/10 | +5 |
| Testing / Vertrauen | 6/10 | 9/10 | +3 |
| Feature-Breite | 9/10 | 10/10 | +1 |

---

## Säule 1: Foundation Excellence (Phasen 78-81)

> **Prinzip:** Kein Feature wird wahrgenommen, wenn die Basis wackelt. Erst das Fundament, dann der Palast.

---

### Phase 78: Architecture Refactoring — Modularer Startup & Dependency Injection

**Problem:** `main.ts` ist 1.117 Zeilen mit 120 Imports. Kein DI-Container, kein modularer Startup. Jede neue Phase fügt einen Block hinzu. Das ist nicht wartbar für ein Team > 2 Entwickler.

**Ziel:** Clean Architecture mit Service Container, modularem Startup und klarer Dependency Graph.

#### Backend

| Aufgabe | Details |
|---------|---------|
| **Service Container** | Lightweight DI-Container (z.B. `tsyringe` oder eigener Container mit `Map<string, Factory>`) für alle Services |
| **Module System** | Jedes Feature wird ein Module mit eigenem `register(container)` und `routes(router)` |
| **Startup Orchestrator** | `StartupOrchestrator` Klasse mit Phasen: `init` → `connect` → `migrate` → `register` → `start` |
| **Health Aggregator** | Jedes Module meldet seinen Health-Status an zentralen Aggregator |
| **Graceful Shutdown** | Zentraler Shutdown-Handler statt verteilter Cleanup-Logik |
| **Config Module** | Zentrales Config-Objekt mit Validierung (Zod) statt verstreuter `process.env` Zugriffe |

**Module-Struktur (Ziel):**
```
backend/src/
  modules/
    chat/
      chat.module.ts        # register(container), routes(router)
      chat.service.ts
      chat.routes.ts
      chat.test.ts
    memory/
      memory.module.ts
      services/
        long-term-memory.ts
        episodic-memory.ts
        ...
      memory.routes.ts
    email/
      email.module.ts
      ...
    ...
  core/
    container.ts            # DI Container
    startup.ts              # Startup Orchestrator
    config.ts               # Validated Config (Zod)
    health.ts               # Health Aggregator
    shutdown.ts             # Graceful Shutdown
  main.ts                   # < 50 Zeilen: init container, register modules, start
```

**main.ts Ziel (< 50 Zeilen):**
```typescript
import { createContainer } from './core/container';
import { StartupOrchestrator } from './core/startup';
import { modules } from './modules';

const container = createContainer();
const orchestrator = new StartupOrchestrator(container, modules);
await orchestrator.start();
```

**Erfolgskriterium:** `main.ts` < 50 Zeilen, jedes Module ist unabhängig testbar, neue Features erfordern nur ein neues Module-Verzeichnis.

**Dateien:** ~30 neue Module-Dateien, `main.ts` Rewrite, `core/` Verzeichnis neu

---

### Phase 79: Design System Migration — Von 0.8% auf 100% Adoption

**Problem:** Das Design System (Phase 68) hat 28 Dateien, 10 Komponenten, 150+ CSS-Variablen — aber nur 2 von 252 Komponenten nutzen es. Parallel existieren "Neurodesign"-Klassen, 135 individuelle CSS-Dateien, 160 inkonsistente Breakpoints, 61+ Inline-Styles.

**Ziel:** Ein einheitliches, durchgängiges Design System mit 100% Adoption. Jede Komponente nutzt Design Tokens. Kein Inline-Style. Konsistente Breakpoints. Theme-Switching (Light/Dark/Custom) funktioniert überall.

#### Design System Erweiterung

| Aufgabe | Details |
|---------|---------|
| **Tailwind CSS Migration** | Tailwind als Utility-Layer über den Design Tokens. Tokens werden zu Tailwind-Klassen. CSS-Dateien werden sukzessive durch Tailwind ersetzt. Bundle-Size < 10KB nach Tree-Shaking |
| **Breakpoint-Vereinheitlichung** | 6 offizielle Breakpoints aus `tokens.ts` (480/640/768/1024/1280/1536) als einzige erlaubte Werte |
| **Component Library Erweiterung** | Von 10 auf 25+ Komponenten: + Tooltip, Dropdown, Select, Checkbox, Radio, Switch, Slider, DatePicker, ColorPicker, Table, Dialog, Popover, Progress, Spinner, Breadcrumb |
| **Typography System** | Tailwind `@apply` Presets für alle Text-Stufen. Tabular Numbers (`font-variant-numeric: tabular-nums`) für Daten. Inter oder Geist als primäre Schrift |
| **Color System Audit** | LCH-basiertes Farbsystem (wie Linear) für perceptual uniformity. Alle Farben aus Tokens, keine hardcoded Hex-Werte |
| **Animation Tokens** | Spring-basierte Animationen (wie Linear). `motion` Library (Framer Motion Nachfolger) für komplexe Interaktionen, CSS `linear()` für einfache Transitions |
| **Icon System** | Einheitliches Icon-Set (Lucide oder Phosphor). Keine Emoji-Icons mehr in professionellen Bereichen |
| **Dark Mode First** | Dark Mode als Default. Light Mode als Alternative. Beide Themes pixel-perfekt |

#### Migration der 252 Komponenten

**Strategie: Außen nach Innen**

1. **Woche 1-2:** Layout-Shell (AppLayout, Sidebar, TopBar, MobileBottomBar) — alle sehen es sofort
2. **Woche 3-4:** High-Traffic-Seiten (Dashboard, ChatPage, IdeasPage) — größter Impact
3. **Woche 5-6:** Sekundäre Seiten (PlannerPage, Documents, Email, Contacts)
4. **Woche 7-8:** Tertiäre Seiten (Finance, Browser, ScreenMemory, Extensions, Settings)
5. **Woche 9-10:** Modale, Overlays, Toasts, Edge Cases

**Pro Komponente:**
1. Inline-Styles entfernen → Tailwind-Klassen
2. Custom CSS → Tailwind + Design Tokens
3. "Neurodesign"-Klassen → Design System Klassen
4. Hardcoded Breakpoints → Token-Breakpoints
5. Hardcoded Farben → Token-Farben
6. Emoji-Icons → Icon-System (kontextabhängig — Emojis wo sie Sinn machen, Icons wo professionell)

**Löschungen:**
- 135 individuelle CSS-Dateien → durch Tailwind ersetzt (schrittweise)
- "Neurodesign" CSS-System → vollständig in Design System aufgehen lassen
- Doppelte Styling-Definitionen → Single Source of Truth

**Erfolgskriterium:** `grep -r 'style={{' frontend/src/components/` findet 0 Treffer. Kein `@media (max-width:` außerhalb von Tailwind-Config. Theme-Toggle schaltet alle 252 Komponenten synchron um.

**Dateien:** Alle 252 Komponenten-Dateien, 135 CSS-Dateien (davon ~100 gelöscht), `tailwind.config.ts` neu, Design System erweitert

---

### Phase 80: Production Security & Real Testing

**Problem:** RLS ist "vorbereitet aber nicht aktiviert". 4.711 Tests mocken alle die DB. Multi-User-Isolation hängt an `AND user_id = $N` in 89 Route-Dateien — ein vergessener Filter = Datenleck.

**Ziel:** Defense-in-Depth Security und Tests, die echte Bugs finden.

#### Security Hardening

| Aufgabe | Details |
|---------|---------|
| **RLS Aktivierung** | `phase65_rls_policies.sql` aktivieren. Schrittweise: 1 Schema → testen → nächstes Schema |
| **RLS + Application Filter = Double Safety** | Beides behalten. RLS als Sicherheitsnetz, Application-Level als Performance-Optimierung |
| **Query Audit** | Automatisierter Scan aller SQL-Queries in 89 Route-Dateien auf fehlende `user_id` Filter |
| **SQL Injection Audit** | Alle `queryContext` Aufrufe auf parametrized queries prüfen |
| **SYSTEM_USER_ID Hardening** | API-Key-Auth darf nur auf explizit freigegebene Endpoints zugreifen, nicht auf User-Daten |
| **SSL Certificate** | `rejectUnauthorized: true` für Supabase-Verbindung (MITM-Schutz) |
| **Secrets Rotation** | JWT_SECRET, ENCRYPTION_KEY, API-Keys rotieren + Dokumentation |

#### Testing Revolution

| Aufgabe | Details |
|---------|---------|
| **Testcontainers Integration** | PostgreSQL Testcontainers für echte DB-Tests. `@testcontainers/postgresql` |
| **Schema-Setup per Test Suite** | Jede Test Suite erstellt eigenes Schema, migriert, testet, löscht |
| **Critical Path Integration Tests** | Die 20 wichtigsten User Journeys als End-to-End Tests mit echter DB |
| **Mutation Testing** | `stryker-mutator` für Backend — prüft ob Tests echte Bugs finden |
| **Contract Tests** | Pact-Tests für Frontend-Backend API-Contracts |
| **Performance Tests** | `autocannon` für API-Endpoints — Baseline-Performance dokumentieren |
| **Security Tests** | OWASP ZAP Scan als CI-Step |

**Critical Path Tests (Top 20):**
1. User Registration → Login → Token Refresh → Logout
2. Idea erstellen → bearbeiten → löschen (alle 4 Kontexte)
3. Chat-Session erstellen → Nachricht senden → Streaming empfangen
4. Memory Fact speichern → abrufen → Ebbinghaus Decay verifizieren
5. Task erstellen → Status ändern → Projekt zuweisen
6. Email empfangen (Webhook) → AI-Analyse → Antwortvorschlag
7. RAG Query → Retrieval → Reranking → Response
8. Knowledge Graph Entity erstellen → Relations → Community Detection
9. Agent Team Execute → Streaming Progress → Result
10. MCP Server verbinden → Tool discover → Tool execute
11. File Upload → Document Analyse → Search
12. Contact erstellen → Interaction hinzufügen → CRM Timeline
13. Finance Transaction → Budget Check → Goal Progress
14. Calendar Event → Meeting erstellen → Notes AI-Strukturierung
15. Voice Session → STT → LLM → TTS Pipeline
16. Smart Suggestion generieren → anzeigen → dismiss/accept
17. Sleep Compute Cycle → Consolidation → Pre-Loading
18. Canvas Dokument → Versioning → Restore
19. Extension installieren → ausführen → deinstallieren
20. Multi-User Isolation: User A darf Daten von User B nicht sehen

**Erfolgskriterium:** RLS aktiv auf allen 4 Schemas. 20 Integration Tests mit echter DB. Mutation Score > 70%. Zero Security Findings in OWASP Scan.

**Dateien:** `backend/src/__tests__/integration/` (20+ neue Testdateien), Migration-Aktivierung, CI-Pipeline-Update

---

### Phase 81: Performance Revolution — Local-First & Sub-100ms Interactions

**Problem:** 3 Round-Trips pro DB-Query (SET search_path, set_config, Query). Kein Local-First. Keine Prefetching-Strategie. React Router fehlt (Custom-Routing ohne Code-Splitting).

**Ziel:** Superhuman-Grade Performance. Jede Interaktion < 100ms. Local-First Architecture.

#### Frontend Performance

| Aufgabe | Details |
|---------|---------|
| **React Router v6 Migration** | Ersetze Custom `switch/case` Routing durch React Router mit Nested Routes, `<Outlet>`, und Lazy Loading (`React.lazy` + `Suspense`) |
| **Route-Level Code Splitting** | Jede Page als Lazy Route. Initial Bundle nur Dashboard + Shell |
| **Local-First mit IndexedDB** | Critical Data (Ideas, Tasks, Chat Sessions, Contacts) in IndexedDB cachen. UI liest zuerst lokal, synct async mit Server (Superhuman-Pattern) |
| **Optimistic Updates überall** | Jede Mutation aktualisiert sofort lokal, synct im Hintergrund, rollt bei Fehler zurück. React Query `onMutate` + `onError` Rollback |
| **Virtual Scrolling** | `react-window` für alle Listen > 50 Items (Ideas, Contacts, Emails, Tasks, Chat Messages) |
| **Prefetching** | Nächste wahrscheinliche Seite prefetchen (z.B. wenn User über Sidebar-Item hovert) |
| **Bundle Optimization** | Tree-Shaking Audit. Vendor Chunks für React, React Query, Tailwind. Target: < 200KB Initial Bundle |
| **Show-Delay Pattern** | Loading-Indicator erst nach 150ms zeigen. Minimum 300ms Anzeigedauer (Vercel-Pattern gegen Flicker) |
| **Skeleton System** | Jede Seite hat ein content-shaped Skeleton das exakt das finale Layout spiegelt |

#### Backend Performance

| Aufgabe | Details |
|---------|---------|
| **Query Optimization** | 3 Round-Trips → 1: `SET search_path TO $1; SET LOCAL app.current_user_id = $2; SELECT ...` als einzelne Multi-Statement Query |
| **Prepared Statements** | Häufige Queries als Prepared Statements registrieren |
| **Connection Pooling Upgrade** | PgBouncer evaluieren für besseres Pooling als Supabase Transaction Mode |
| **Response Compression** | Brotli Compression für API Responses (10-25% kleiner als gzip) |
| **Redis Caching Strategie** | Cache-Invalidierung auf Event-Basis statt TTL. Aggressive Caching für Read-Heavy Endpoints |
| **API Response Pagination** | Cursor-based Pagination statt Offset (performance bei großen Datasets) |
| **CDN für Static Assets** | Vercel Edge Network für Frontend, Railway CDN Headers für API |

**Performance Budget:**

| Metrik | IST (geschätzt) | ZIEL |
|--------|:---:|:---:|
| Time to Interactive | ~3s | < 1s |
| Largest Contentful Paint | ~2.5s | < 1.2s |
| Input Latency (Keypress → UI) | ~200ms | < 50ms |
| API Response (cached) | ~300ms | < 50ms |
| API Response (uncached) | ~800ms | < 200ms |
| Initial Bundle Size | ~500KB | < 200KB |
| Page Navigation | ~500ms | < 100ms (local) |

**Erfolgskriterium:** Lighthouse Performance Score > 95. Alle Interaktionen fühlen sich "instant" an. Offline-Modus funktioniert für Core Features (Ideas, Tasks, Chat History lesen).

**Dateien:** `frontend/src/App.tsx` (React Router), `frontend/src/routes/` (neue Route-Definitionen), `frontend/src/lib/local-store.ts` (IndexedDB), `backend/src/utils/database-context.ts` (Query-Optimierung)

---

## Säule 2: UX Excellence (Phasen 82-86)

> **Prinzip:** "Speed is not a feature — it IS the product." (Superhuman). Jede Interaktion muss sich anfühlen wie ein natürliches Gespräch mit dem Computer.

---

### Phase 82: Keyboard-First & Command System — Superhuman-Grade

**Problem:** Command Palette existiert (Cmd+K), aber ist nicht durchsuchbar über alle Features. Keyboard-Shortcuts existieren teilweise, sind aber nicht systematisch. Kein progressives Lernsystem für Shortcuts.

**Ziel:** Jede Aktion hat einen Keyboard-Shortcut. Command Palette durchsucht alles. Progressive Shortcut-Discovery.

#### Command Palette 2.0

| Aufgabe | Details |
|---------|---------|
| **Unified Search** | Cmd+K durchsucht: Ideen, Tasks, Kontakte, Emails, Dokumente, Chat-Sessions, Befehle, Navigation, Einstellungen |
| **Mode Prefixes** | `/` für Navigation, `>` für Befehle, `@` für Kontakte, `#` für Tags/Themen, kein Prefix für universale Suche |
| **Fuzzy Search** | Fuse.js mit Boost/Scale Scoring. Häufig genutzte Befehle ranken höher. Recency-Weighting |
| **Shortcut Display** | Jeder Befehl zeigt seinen Shortcut neben dem Namen. Das ist der primäre Lernmechanismus (Superhuman-Pattern) |
| **Quick Actions** | Direkt-Aktionen aus der Palette: "Neue Idee erstellen", "Meeting in 5 Min", "Email an [Kontakt]" |
| **Kontext-Awareness** | Palette zeigt kontextrelevante Aktionen zuerst (auf Email-Seite: Email-Aktionen oben) |
| **AI Command** | `>ai [Frage]` für sofortige AI-Antwort direkt in der Palette |

#### Keyboard Navigation System

| Aufgabe | Details |
|---------|---------|
| **Global Navigation** | `G` dann `D` = Dashboard, `G` dann `C` = Chat, `G` dann `I` = Ideas, etc. (Vim-Style Sequences) |
| **List Navigation** | `J`/`K` in allen Listen (Ideas, Emails, Tasks, Contacts). `Enter` öffnet, `E` archiviert, `X` selektiert |
| **Focus Management** | `Tab`/`Shift+Tab` für Focus-Traverse. Sichtbarer Focus-Ring (Design System) |
| **Context Actions** | `Space` togglet Selektion, `Delete`/`Backspace` für Löschen, `R` für Reply (Email), `C` für Compose |
| **Escape Hierarchy** | `Escape` schließt immer das oberste Overlay/Modal/Panel. Mehrfach `Escape` navigiert zurück |
| **Shortcut Reference** | `?` öffnet kontextsensitive Shortcut-Übersicht |

#### Progressive Shortcut Discovery

| Aufgabe | Details |
|---------|---------|
| **Tooltips mit Shortcuts** | Jeder Button zeigt im Tooltip den Keyboard-Shortcut |
| **Command Palette Teaching** | Wenn User eine Aktion per Maus macht, dezenter Hinweis: "Tipp: Drücke `E` zum Archivieren" |
| **Shortcut Nudges** | Nach 3x gleicher Maus-Aktion: einmaliger dezenter Hinweis auf den Shortcut |
| **Onboarding Shortcuts** | Erste 10 Shortcuts in einer interaktiven Lektion (optional) |
| **Shortcut Heatmap** | In Settings: welche Shortcuts der User nutzt, welche nicht (für personalisierte Tipps) |

**Erfolgskriterium:** Jede Aktion in der App hat einen Keyboard-Shortcut. Power-User können ohne Maus arbeiten. Command Palette findet alles in < 100ms.

---

### Phase 83: Premium Visual Redesign — Linear-Quality Design Language

**Problem:** Emoji-heavy UI, inkonsistente Abstände, kein klares visuelles System. Die App sieht nach "Hobby-Projekt" aus, nicht nach "Weltklasse-Produkt".

**Ziel:** Eine visuelle Sprache, die sofort "Premium" kommuniziert — wie Linear, Superhuman oder Raycast.

#### Design Language Definition

| Element | Entscheidung | Begründung |
|---------|-------------|------------|
| **Primärschrift** | Inter (oder Geist Sans) | Hohe x-Height (68%), optimiert für UI, tabular nums, kostenlos |
| **Monospace** | Geist Mono (oder JetBrains Mono) | Für Code-Blöcke, Terminal-Output, technische Daten |
| **Farbsystem** | LCH-basiert (wie Linear) | Perceptual uniform — Farben wirken bei gleicher Lightness tatsächlich gleich hell |
| **Primärfarbe** | Blau-Violett (ZenAI Brand) | Trust + Innovation. Anpassbar per Kontext (Work=Blau, Creative=Violet, Learning=Grün, Personal=Teal) |
| **Hintergründe** | Near-Black (#0A0A0F) Dark / Off-White (#FAFAFA) Light | Kein reines Schwarz oder Weiß (reduziert Eye Strain) |
| **Text** | Grau-Stufen (#E5E5E5 / #171717) | Niemals reines Weiß oder Schwarz für Text |
| **Akzente** | Muted, sparsam | Helle Farben nur für Status-Indikatoren und CTAs |
| **Schatten** | Subtil, layered | Tiefe durch mehrere leichte Schatten statt einem harten |
| **Border Radius** | 8px Standard, 12px Cards, 16px Modals | Konsistent, modern, nicht zu rund |
| **Spacing** | 4px Grid (4, 8, 12, 16, 24, 32, 48, 64) | Konsistentes 4er-Raster |
| **Icons** | Lucide (oder Phosphor) | Einheitlich, 24px Standard, 1.5px Stroke |

#### Kontext-Farben (USP-Visualisierung)

| Kontext | Akzentfarbe | Subtiler Hintergrund-Tint |
|---------|------------|--------------------------|
| Personal | Teal (#0EA5E9) | Kaum wahrnehmbarer Teal-Tint |
| Work | Blue (#3B82F6) | Kaum wahrnehmbarer Blue-Tint |
| Learning | Green (#10B981) | Kaum wahrnehmbarer Green-Tint |
| Creative | Violet (#8B5CF6) | Kaum wahrnehmbarer Violet-Tint |

#### Komponenten-Redesign

| Komponente | IST | ZIEL |
|------------|-----|------|
| **Dashboard** | Emoji-heavy Cards, bunte Gradients | Clean Cards mit Icon-System, subtile Schatten, Sparklines |
| **Sidebar** | Funktional, uninspiriert | Linear-Style: Hover-States, Active-Indicator, Collapse-Animation |
| **Chat** | Standard-Bubbles | Premium-Bubbles mit Avataren, Timestamps on-hover, Code-Blöcke mit Syntax-Theme |
| **Lists** | Einfache Listen | Virtualisiert, Hover-Preview, Inline-Actions on-hover (Linear-Pattern) |
| **Modals** | Funktionale Overlays | Backdrop-Blur, Spring-Animation open/close, Focus-Trap |
| **Forms** | Basic Inputs | Floating Labels, Validation-Animation, Auto-Complete |
| **Cards** | Verschiedene Styles | Ein Card-System mit Varianten (Default, Interactive, Selected, Dragging) |
| **Tables** | Basic | Sortierbar, filterbar, resizable Columns, Sticky Header |
| **Empty States** | Text + Emoji | Illustrierte Empty States mit CTA (dezent, nicht kindlich) |

#### Glassmorphism 2.0 (Subtil)

Glasmorphism bleibt ein Element der ZenAI-Identität, wird aber subtiler:
- **Backdrop-Blur: 12px** (nicht 20px+ — zu heavy)
- **Background: rgba(255,255,255,0.03)** Dark / **rgba(0,0,0,0.02)** Light
- **Border: 1px solid rgba(255,255,255,0.06)**
- Nur für Overlays, Popovers, Command Palette — nicht für normale Cards

**Erfolgskriterium:** Ein Screenshot der App sieht aus wie ein Produkt, für das man $20/Monat bezahlen würde. Visuell auf Augenhöhe mit Linear und Superhuman.

---

### Phase 84: Animation & Micro-Interaction System

**Problem:** Keine konsistente Animations-Strategie. Einige Komponenten haben CSS-Keyframes, andere nicht. Kein einheitliches Gefühl.

**Ziel:** Jede Interaktion hat eine physisch korrekte Micro-Animation die "alive" fühlt, ohne zu verlangsamen.

#### Animation Architektur

| Kategorie | Technik | Beispiele |
|-----------|---------|-----------|
| **Hovers & Focus** | CSS Transitions (0ms JS overhead) | Farbe, Opacity, Scale (transform: scale(1.02)) |
| **Page Transitions** | CSS `linear()` Springs | Fade + leichte Y-Translation (20px → 0) |
| **Layout Changes** | Framer Motion `layout` | Kanban-Card drag, List-Item reorder, Tab-Switch |
| **Modals & Overlays** | Framer Motion `AnimatePresence` | Spring open (stiffness: 300, damping: 30), fade close |
| **Skeletons** | CSS @keyframes | Shimmer-Animation (background-position shift) |
| **Loading States** | CSS Spinner + Framer Motion | Spinner für Aktionen, Skeleton für Content |
| **Success/Error** | Framer Motion | Check-Mark draw animation, Shake für Error |
| **List Items** | Framer Motion `staggerChildren` | Items erscheinen mit 30ms Stagger |

#### Spezifische Micro-Interactions

| Interaktion | Animation |
|-------------|-----------|
| **Idea archivieren** | Slide-out nach links (150ms), Gap schließt sich mit Spring |
| **Task Status ändern** | Checkbox-Bounce + Strikethrough-Animation |
| **Chat-Nachricht empfangen** | Fade-in von unten (30px, 200ms) |
| **Tool-Use Pill** | Pulse-Animation während aktiv, Checkmark-Draw bei fertig |
| **Sidebar Collapse** | Width-Animation mit Spring (300ms) |
| **Context Switch** | Akzentfarbe morpht mit 200ms Transition |
| **Command Palette Open** | Scale von 0.95 → 1.0 + Fade (100ms) |
| **Toast erscheint** | Slide von rechts + Spring |
| **Card Hover** | Subtiler Shadow-Increase + 1px Y-lift |
| **Button Press** | Scale 0.97 (50ms) → 1.0 (100ms) |

#### Performance-Regeln

1. Nur `transform` und `opacity` animieren (GPU-composited)
2. Keine Layout-Properties animieren (`width`, `height`, `margin`) — stattdessen `scale` + FLIP
3. Animation-Duration: Max 300ms für UI-Feedback, Max 500ms für Seitenübergänge
4. `will-change` nur auf aktiv animierte Elemente (nicht global)
5. `prefers-reduced-motion: reduce` → alle Animationen auf Fade reduzieren

**Erfolgskriterium:** Die App fühlt sich "lebendig" an. Jede Interaktion hat physisch korrektes Feedback. Keine Animation verlangsamt den Workflow. Users mit `prefers-reduced-motion` erhalten reduzierte Animationen.

---

### Phase 85: Mobile Excellence — Native-Feel PWA

**Problem:** 160 inkonsistente `@media`-Breakpoints. PWA existiert, aber fühlt sich nicht nativ an. Kein Haptic Feedback, keine Swipe-Gesten, keine Bottom-Sheet-Patterns.

**Ziel:** Die PWA fühlt sich auf Mobile an wie eine Native App. iOS-User installieren sie auf dem Homescreen.

#### Mobile UX Patterns

| Pattern | Implementation |
|---------|---------------|
| **Bottom Sheet** | Für alle Detail-Views auf Mobile (Idea Detail, Email, Contact). Swipe-down zum Schließen. Spring-Animation |
| **Pull to Refresh** | Native-feel Pull-to-Refresh mit Custom-Animation auf Listen |
| **Swipe Actions** | Links-Swipe: Archivieren (Idea), Löschen (Email). Rechts-Swipe: Pin, Snooze. Haptic Feedback via `navigator.vibrate()` |
| **Bottom Navigation** | 5 Tabs bleiben, aber mit Micro-Animations (Active-Dot, Label-Appear) |
| **Safe Areas** | `env(safe-area-inset-*)` für Notch/Dynamic Island |
| **Gesture Navigation** | Edge-Swipe für Zurück (iOS Safari Kompatibilität) |
| **Viewport Units** | `dvh` statt `vh` überall (Dynamic Viewport Height für Mobile Browser) |
| **Input Handling** | `inputmode="numeric"` für Zahlenfelder. `autocapitalize`, `autocorrect` korrekt gesetzt |
| **Touch Targets** | Minimum 44x44px für alle interaktiven Elemente (WCAG + Apple HIG) |
| **Scroll Behavior** | `overscroll-behavior: contain` um Bounce-Through zu verhindern |

#### PWA Optimierung

| Aufgabe | Details |
|---------|---------|
| **App-Icon & Splash** | Professionelles App-Icon (SVG → alle Größen). Splash Screen mit ZenAI Logo + Shimmer |
| **Offline-First Core** | Ideas, Tasks, Contacts, Chat-History offline lesbar. Neue Einträge offline erstellen, bei Reconnect syncen |
| **Push Notifications** | Web Push via Service Worker. Kategorien: Smart Suggestions, Email, Tasks, Meetings |
| **Share Target** | PWA als Share-Target registrieren. Texte, URLs, Bilder direkt in ZenAI teilen |
| **Background Sync** | Offline-Aktionen per Background Sync API nachholen |
| **App Shortcuts** | Homescreen Long-Press: "Neue Idee", "Chat", "Quick Search" |

#### Responsive Strategie

| Breakpoint | Layout |
|------------|--------|
| **< 480px** | Single Column, Bottom Navigation, Bottom Sheets, Full-Width Cards |
| **480-768px** | Single Column, erweiterte Bottom Nav, Side-Sheets möglich |
| **768-1024px** | Sidebar (collapsed) + Content, Split-View optional |
| **1024-1280px** | Sidebar (expanded) + Content, Split-View Standard |
| **> 1280px** | Sidebar + Content + Detail Panel (3-Column Layout) |
| **> 1536px** | Wie 1280, aber mit mehr Whitespace und größeren Cards |

**Erfolgskriterium:** PWA Score 100/100. Installierte PWA auf iPhone ist nicht von Native App unterscheidbar. Offline-Modus für Core Features funktioniert zuverlässig.

---

### Phase 86: Onboarding & First Impression

**Problem:** Kein Onboarding. Neue User sehen sofort die volle Komplexität aller Features. Die Lernkurve ist steil.

**Ziel:** In 60 Sekunden versteht ein neuer User den Wert von ZenAI. In 5 Minuten hat er sein erstes Erfolgserlebnis.

#### Onboarding Flow

| Schritt | Inhalt | Dauer |
|---------|--------|-------|
| **1. Welcome** | "Willkommen bei ZenAI — Dein AI-Betriebssystem" + kurzes Video (30s) oder Animation | 15s |
| **2. Kontext wählen** | "Wofür nutzt du ZenAI zuerst?" → Personal / Work / Learning / Creative. Setzt Default-Kontext | 10s |
| **3. Erste Idee** | "Erzähl mir, was dich gerade beschäftigt." → Voice oder Text Input → AI strukturiert zur ersten Idee | 30s |
| **4. AI kennenlernen** | "Ich habe deine Idee analysiert und 3 Fragen dazu:" → Mini-Chat → demonstriert Memory + Proaktivität | 60s |
| **5. Feature Discovery** | "Entdecke dein AI-OS" → Interaktive Tour der 4-5 Kernbereiche (Chat, Ideas, Tasks, Insights) | 90s |
| **6. Shortcuts** | "Werde schneller: 5 Shortcuts die dein Leben verändern" → Interaktive Übung (Superhuman-Stil) | 60s |

#### Progressive Disclosure

| Zeitpunkt | Freigeschaltet |
|-----------|---------------|
| **Tag 1** | Dashboard, Chat, Ideas, Basis-Navigation |
| **Tag 2-3** | Tasks, Kalender, Shortcuts-Hinweise |
| **Woche 1** | Email, Contacts, Documents, Smart Suggestions |
| **Woche 2** | Business Insights, Agent Teams, Voice Chat |
| **Woche 3+** | Extensions, MCP, GraphRAG, Advanced Settings |

Kein Feature wird versteckt — alles ist über Command Palette und Navigation erreichbar. Aber die visuelle Prominenz und Hinweise folgen dem Discovery-Zeitplan.

#### Zeigarnik-Effekt Nutzung

- **Setup-Checklist**: "5 von 12 Features eingerichtet" → Fortschrittsanzeige auf Dashboard
- **Daily Streak**: "Du hast ZenAI 7 Tage in Folge genutzt" → subtle Gamification
- **Memory Growth**: "Deine AI kennt jetzt 47 Fakten über dich" → Wachstums-Visualization

**Erfolgskriterium:** Neue User erreichen "Aha-Moment" in < 60s. Day-1 Retention > 70%. Feature Discovery ist natürlich, nicht überwältigend.

---

## Säule 3: AI Depth (Phasen 87-91)

> **Prinzip:** Breite haben wir. Jetzt die Tiefe, die niemand sonst hat.

---

### Phase 87: Next-Gen Memory — MAGMA + Prospective + Source + Meta

**Problem:** HiMeS ist das fortschrittlichste Open-Memory-System der Welt, aber es fehlen 4 entscheidende Dimensionen, die die Forschung 2025-2026 identifiziert hat.

**Ziel:** Das definitiv weltweit fortschrittlichste AI Memory System.

#### MAGMA-Inspired Multi-Graph Retrieval

Basierend auf dem [MAGMA Paper (Jan 2026)](https://arxiv.org/abs/2601.03236):

| Graph | Speichert | Retrieval-Nutzen |
|-------|-----------|-----------------|
| **Semantic** | Embedding-Ähnlichkeit (existiert) | "Finde ähnliche Konzepte" |
| **Temporal** | Zeitliche Beziehungen (teilweise Phase 54) | "Was wusste ich vorher? Was hat sich geändert?" |
| **Causal** | Ursache-Wirkungs-Ketten (NEU) | "Warum habe ich X entschieden? Was führte zu Y?" |
| **Entity** | Personen/Orte/Konzepte (teilweise Phase 58) | "Alles was mit [Person X] zusammenhängt" |

**Implementation:**
- Jeder `learned_fact` wird in alle 4 Graphen eingetragen
- Retrieval nutzt Policy-guided Traversal: je nach Query-Typ wird der optimale Graph-Mix gewählt
- Erwartet: 18-45% Verbesserung gegenüber reinem Semantic Search (MAGMA-Benchmark)

#### Prospective Memory (Erinnerung an zukünftige Aktionen)

Kein Wettbewerber implementiert echte Prospective Memory.

| Trigger-Typ | Beispiel | Implementation |
|-------------|----------|---------------|
| **Time-Based** | "Erinnere mich morgen um 9 an X" | Cron-Job + Smart Suggestion |
| **Event-Based** | "Wenn ich das nächste Mal mit Maria spreche, erwähne Y" | Contact-Interaction Hook + Memory-Injection in Chat-Context |
| **Activity-Based** | "Wenn ich die Finance-Seite öffne, zeige mir Z" | Page-Navigation Hook + Smart Suggestion |
| **Context-Based** | "Wenn der Kontext 'Work' aktiv ist, priorisiere A" | Context-Switch Hook + Memory Pre-Loading |

**Backend:**
- Neue Tabelle `prospective_memories` mit: trigger_type, trigger_condition, memory_content, created_at, fired_at, status
- Proactive Engine (Phase 54) als Ausführungs-Layer
- Chat-Context-Injection: relevante prospective memories werden beim Chat-Start geladen

#### Source Memory (Herkunfts-Nachverfolgung)

Jeder Fakt soll nachverfolgbar sein:

| Feld | Bedeutung |
|------|-----------|
| `source_type` | conversation, document, email, web_search, user_input, ai_inference |
| `source_id` | ID der Quelle (Chat-Session, Document, Email) |
| `source_timestamp` | Wann wurde der Fakt gelernt |
| `confidence` | Wie sicher ist der Fakt (1.0 = User hat es gesagt, 0.7 = AI-Inferenz) |

**Anzeige:** Wenn die AI einen Fakt zitiert: "Ich erinnere mich, dass du am 5. März in unserem Chat über Projektplanung erwähnt hast, dass..."

#### Metamemory (Wissen über das eigene Wissen)

Die AI soll wissen, was sie weiß und was nicht:

| Fähigkeit | Implementation |
|-----------|---------------|
| **Confidence Calibration** | Jeder Fakt hat einen Confidence-Score. Bei Recall: "Ich bin mir ziemlich sicher, dass..." vs "Ich glaube, du hast mal erwähnt..." |
| **Knowledge Gaps** | AI erkennt Bereiche, über die sie wenig weiß: "Über deine Finanzziele weiß ich noch nicht viel — möchtest du mir davon erzählen?" |
| **Memory Conflicts** | Explizite Auflösung: "Im Januar hast du gesagt X, aber letzte Woche Y — was stimmt aktuell?" |
| **Memory Stats** | Dashboard: "Ich kenne 247 Fakten über dich, 89% mit hoher Konfidenz" |

**Erfolgskriterium:** AI zitiert Quellen bei Fakten. Prospective Memories feuern zuverlässig. Metamemory-Anzeige im "Meine KI" Bereich.

**Dateien:** `backend/src/services/memory/multi-graph-retrieval.ts`, `backend/src/services/memory/prospective-memory.ts`, ALTER auf `learned_facts` (source_type, source_id, confidence), neue Tabelle `prospective_memories`

---

### Phase 88: Intelligente Proaktive Engine — Interruptibility + Habit Engine

**Problem:** SmartSurface zeigt Suggestions, aber ohne Rücksicht auf den Nutzer-Zustand. Falsch getimte Unterbrechungen sind schlimmer als keine (CHI 2025).

**Ziel:** Proaktive Intelligence, die weiß WANN sie unterbrechen darf und dem User hilft, bessere Gewohnheiten zu entwickeln.

#### Interruptibility Model

| Signal | Messmethode | Gewicht |
|--------|-------------|---------|
| **Typing Activity** | Keystroke-Rate der letzten 30s | Hoch: 0 = idle, > 60 WPM = deep work |
| **Navigation Pattern** | Schnelle Tab-Wechsel = Exploration, lange Verweildauer = Fokus | Mittel |
| **Time of Day** | Morgens (6-8): Briefing OK. 9-12: nur High-Priority. 12-13: Pause-Tipps | Mittel |
| **Task Context** | Aktive Task-Kategorie (Deep Work vs Admin vs Communication) | Hoch |
| **Dismiss History** | Häufiges Dismissing = Schwelle erhöhen | Hoch |
| **Explicit Focus Mode** | User aktiviert "Fokus" → keine Interruptions | Override |

**Interruptibility Score (0-1):**
- 0.0-0.3: **Do Not Disturb** — nur System-kritische Alerts
- 0.3-0.6: **Low Priority Only** — Batched Suggestions (1x pro Stunde)
- 0.6-0.8: **Normal** — Smart Suggestions erlaubt
- 0.8-1.0: **Available** — Proaktive Insights, Briefings, Suggestions

#### Habit Engine

Basierend auf McKinsey-Forschung (8-10% Produktivitätssteigerung):

| Feature | Details |
|---------|---------|
| **Routine Detection** | AI erkennt Muster: "Du checkst jeden Morgen zuerst Emails. Deine produktivsten Stunden sind aber 9-11." |
| **Habit Suggestions** | "Versuch mal, Emails erst nach 11 Uhr zu checken. Ich erinnere dich." |
| **Adherence Tracking** | Kalender-Heatmap der Gewohnheits-Einhaltung |
| **Gentle Nudges** | Timing-aware Hinweise: "Es ist 9:15 — deine Deep-Work-Zeit. Soll ich Benachrichtigungen stummschalten?" |
| **Progress Reports** | Wöchentlicher AI-Report: "Diese Woche 3h mehr Deep Work als letzte Woche" |

#### Digital Well-Being Layer

| Feature | Details |
|---------|---------|
| **Cognitive Load Indicator** | Subtle Indikator im TopBar: Grün (entspannt) → Gelb (beschäftigt) → Rot (überlastet) |
| **Focus Mode** | Ein-Klick-Aktivierung: Stummt alle Suggestions, dimmt sekundäre UI-Elemente, zeigt nur aktive Task |
| **End-of-Day Summary** | "Dein Tag: 4 Ideen erstellt, 7 Tasks erledigt, 23 Emails verarbeitet. Morgen steht an: ..." |
| **Break Reminders** | Nach 90 Min fokussierter Arbeit: dezenter Pause-Hinweis (Pomodoro-inspired, nicht zwingend) |
| **Weekly Reflection** | Sonntag-Abend: "Deine Woche in ZenAI" — Highlights, Patterns, nächste Woche Vorschau |

**Erfolgskriterium:** Suggestions kommen nur zu passenden Zeitpunkten. User-Dismiss-Rate sinkt um > 50%. Habit Engine zeigt messbare Verhaltensänderungen.

---

### Phase 89: Self-Evolving Agent Pipelines

**Problem:** Agent Teams (Phase 45) sind statisch — gleiche Strategie unabhängig von vergangener Performance. Kein Lernloop.

**Ziel:** Agents, die aus ihren Erfahrungen lernen und sich selbst verbessern.

#### Feedback Loop Architecture

```
User Request → Strategy Selection → Agent Execution → Result
                    ↑                                    ↓
                    ←── Procedural Memory Update ←── User Feedback
                    ←── Strategy Score Update   ←── Quality Metrics
```

| Komponente | Details |
|------------|---------|
| **Execution Scoring** | Jede Agent-Ausführung wird automatisch bewertet: Completion (0/1), User Feedback (1-5), Token Efficiency, Execution Time |
| **Strategy Learning** | A-RAG Strategy Agent (Phase 70) lernt aus vergangenen Scores: welche Retrieval-Strategie für welchen Query-Typ am besten funktioniert |
| **Procedural Memory Integration** | Erfolgreiche Agent-Workflows werden als Procedures gespeichert (Phase 59). Bei ähnlichem Request: "Letztes Mal hat Research → Code → Review in 3 Min funktioniert" |
| **Auto-Tuning** | Model-Routing basierend auf Task-Komplexität: Haiku für einfache Tasks, Sonnet für Standard, Opus für komplexe. Automatische Eskalation bei niedrigem Score |
| **Failure Recovery** | Wenn ein Agent-Typ wiederholt scheitert: automatisch alternativen Agent substituieren |

#### Agent Specialization Profiles

| Agent | Spezialisierung | Lernbare Parameter |
|-------|-----------------|-------------------|
| **Researcher** | Informationssuche & Synthese | Bevorzugte Quellen, Suchtiefe, Output-Format |
| **Writer** | Textproduktion | Stilpräferenzen des Users, Tonalität, Länge |
| **Coder** | Code-Generierung | Bevorzugte Sprachen, Frameworks, Testing-Muster |
| **Reviewer** | Qualitätskontrolle | Fokus-Bereiche (Security, Performance, Style), Strenge |

**Erfolgskriterium:** Agent-Qualität verbessert sich messbar über Zeit. Strategy-Selection-Accuracy > 85% nach 100 Ausführungen.

---

### Phase 90: Advanced Voice — Emotion-Aware Conversational AI

**Problem:** Voice Pipeline (Phase 57) ist funktional, aber ohne Emotions-Erkennung und ohne echte Konversations-Intelligenz.

**Ziel:** Voice-Interaktion die sich anfühlt wie ein Gespräch mit einem empathischen Assistenten.

| Feature | Details |
|---------|---------|
| **Emotion Detection** | Prosodische Analyse (Pitch, Rate, Energy) zur Stimmungserkennung. Beeinflusst AI-Response-Ton |
| **Adaptive Response Style** | Gestresst → kürzere, beruhigendere Antworten. Enthusiastisch → engagierte, detaillierte Antworten |
| **Conversation Memory** | Voice-Sessions werden transkribiert UND als Episodic Memory mit Emotions-Tags gespeichert |
| **Multi-Turn Voice** | Kontextuelles Gespräch ohne "Hey Siri"-Wakeword. Push-to-Talk oder VAD-basiert |
| **Voice Personas** | Verschiedene Stimmen pro Kontext (Professional für Work, Warm für Personal) |
| **Ambient Listening Mode** | (Optional, explizites Opt-In) Immer-zuhören für Meeting-Transkription |
| **Voice Commands** | "Erstelle eine Idee: [Diktat]", "Zeige mir meine Tasks", "Was steht heute an?" |

**Erfolgskriterium:** Voice-Interaktion fühlt sich natürlich an. Emotions-Erkennung verbessert AI-Antworten subjektiv. Voice-zu-Idea Pipeline funktioniert flüssig.

---

### Phase 91: Unified AI Assistant — Siri-Like Surface Layer

**Problem:** AI ist überall eingebaut, aber es fehlt ein einheitlicher "Assistent" der wie Siri/Copilot als Single Entry Point fungiert.

**Ziel:** Ein allgegenwärtiger AI-Assistent der überall in der App verfügbar ist und kontextbewusst agiert.

| Feature | Details |
|---------|---------|
| **Global Trigger** | `Cmd+Shift+Space` (oder konfigurierbarer Hotkey) öffnet AI-Overlay an aktueller Position |
| **Context Awareness** | Assistent weiß, auf welcher Seite/in welchem Element der User ist. Auf Email-Seite: "Soll ich antworten?". Auf Tasks: "Soll ich aufteilen?" |
| **Quick Actions** | "Erstelle eine Idee", "Suche in meinen Emails nach X", "Was weiß ich über Y?", "Zeige mir meine nächsten Termine" |
| **Inline Assistance** | In Textfeldern: Text selektieren → AI-Overlay → Umschreiben, Kürzen, Erweitern (Apple Writing Tools Pattern) |
| **Cross-Feature Actions** | "Erstelle aus dieser Email eine Task und verknüpfe sie mit Projekt X" — verbindet Features |
| **Natural Language Navigation** | "Zeig mir meine Ideen zum Thema Marketing" → navigiert + filtert |
| **Proactive Suggestions im Overlay** | "Ich sehe du bist auf der Finance-Seite — dein Q1-Report ist überfällig. Soll ich starten?" |

**UI Design:**
- Kleines, elegantes Overlay (nicht full-screen)
- Backdrop-Blur Hintergrund
- Typing-Indikator während AI denkt
- Inline-Ergebnisse die expandieren können
- Schließt sich nach Aktion automatisch

**Erfolgskriterium:** User können jede Aufgabe über den Assistenten initiieren. Kontexterkennung ist in > 90% der Fälle korrekt.

---

## Säule 4: Neue Differenzierungsmerkmale (Phasen 92-96)

> **Prinzip:** Features die kein Konkurrent hat und die das "AI OS" Versprechen einlösen.

---

### Phase 92: Digital Twin Profile — "Dein AI Ich"

**Problem:** Die AI kennt den User über 4 Memory-Layer + 49 Tools + Knowledge Graph. Aber es gibt keinen Ort, wo der User sehen kann, "was die AI über mich weiß" — zusammengefasst und editierbar.

**Ziel:** Ein "Digital Twin" Profil das alle AI-Erkenntnisse über den User in einer editierbaren, transparenten Übersicht zusammenfasst.

| Bereich | Inhalte |
|---------|---------|
| **Persönlichkeit** | Kommunikationsstil, Vorlieben, Werte (aus Chat-Analysen) |
| **Expertise** | Wissensbereiche, Stärken, Lernfelder (aus Ideas, Documents, Learning) |
| **Arbeitsmuster** | Produktive Stunden, Routine-Muster, Fokus-Zeiten (aus Interaktions-Daten) |
| **Beziehungen** | Häufige Kontakte, Beziehungs-Kontext (aus Email, Contacts, Calendar) |
| **Interessen** | Topics, Trends, wiederkehrende Themen (aus Knowledge Graph) |
| **Ziele** | Langfristige Ziele, aktuelle Projekte, Meilensteine (aus Tasks, Projects) |
| **Präferenzen** | AI-Einstellungen, Kommunikations-Ton, bevorzugte Tools (aus Feedback) |

**UI:** Ein Dashboard im "Meine KI" Bereich mit:
- Visueller Persönlichkeits-Radar (5 Achsen)
- Editierbare Sektionen (User kann alles korrigieren)
- "Die AI liegt falsch bei..." Button
- Zeitverlauf: wie sich das Profil über Wochen/Monate entwickelt
- Export-Funktion: "Mein Digital Twin" als Dokument

**Erfolgskriterium:** User sagen "Die AI kennt mich wirklich". Digital Twin Accuracy > 85% (gemessen durch User-Bestätigung).

---

### Phase 93: Workspace Automation — AI-Driven Workflows

**Problem:** Die App hat viele Features, aber sie arbeiten isoliert. Der User muss manuell zwischen Email, Tasks, Calendar, Contacts navigieren.

**Ziel:** AI-Workflows die Features automatisch verbinden.

#### Vordefinierte Workflows

| Workflow | Trigger | Aktion |
|----------|---------|--------|
| **Email → Task** | Email mit Action Items empfangen | AI extrahiert Tasks, erstellt sie im richtigen Projekt |
| **Meeting → Notes → Tasks** | Calendar Event endet | AI fasst Meeting zusammen, erstellt Follow-Up Tasks |
| **Idea → Research → Draft** | Idee markiert als "Ausarbeiten" | Researcher Agent recherchiert, Writer erstellt Draft |
| **Contact → CRM Update** | Email-Thread mit Kontakt | AI aktualisiert CRM-Timeline automatisch |
| **Finance → Alert** | Budget-Grenze erreicht | Smart Suggestion mit Analyse |
| **Daily Digest** | Jeden Morgen 7:00 | AI kompiliert: Heute anstehend, gestern verpasst, Smart Suggestions |
| **Weekly Report** | Jeden Freitag 17:00 | AI erstellt Wochenrückblick über alle Kontexte |

#### Custom Workflow Builder

| Feature | Details |
|---------|---------|
| **Visual Builder** | Node-based Flow Editor (React Flow) für custom Workflows |
| **Trigger Types** | Time, Event (Email, Task-Status, Calendar), Condition (Budget > X), Manual |
| **Action Types** | Create (Idea, Task, Email-Draft), Update, Notify, AI-Process, Navigate |
| **Conditions** | If/Else basierend auf AI-Klassifikation oder Daten-Werten |
| **Templates** | 10+ vorgefertigte Workflow-Templates |

**Erfolgskriterium:** > 50% der User nutzen mindestens 1 automatischen Workflow. Manuelle Cross-Feature-Aktionen sinken um > 30%.

---

### Phase 94: On-Device AI — WebGPU Inference Layer

**Problem:** Alles geht über die Cloud-API. Bei Offline oder Latenz-Problemen ist die App ein leeres Shell.

**Ziel:** Kritische AI-Funktionen laufen on-device — sofort, privat, offline.

| Funktion | On-Device Model | Fallback |
|----------|----------------|----------|
| **Intent Classification** | Phi-3-mini (3.8B, quantized) via WebLLM | Heuristic Provider (existiert) |
| **Quick Answers** | Phi-3-mini | Cloud API |
| **Embedding Generation** | all-MiniLM-L6-v2 (23MB) via ONNX | Cloud Embedding API |
| **Sentiment Analysis** | DistilBERT (67MB) via ONNX | Keyword Heuristic (existiert) |
| **Text Completion** | Phi-3-mini | Cloud API |
| **Offline Summarization** | Phi-3-mini | Extractive Summary Heuristic |

**Architektur:**
- WebGPU Detection → Model Download (einmalig, ~2GB) → In-Browser Inference
- Hybrid-Routing: einfache Queries → On-Device (< 100ms), komplexe → Cloud
- Privacy-Mode: "Nichts verlässt mein Gerät" → nur On-Device Models
- Progressive Enhancement: ohne WebGPU → Cloud-only (graceful degradation)

**Erfolgskriterium:** Intent Classification < 50ms on-device. Offline-Chat funktioniert mit akzeptabler Qualität. Privacy-Mode verfügbar.

---

### Phase 95: Semantic Search 2.0 — Universelle Cross-Feature Suche

**Problem:** Suche existiert pro Feature (Ideas, Documents, etc.), aber es gibt keine einheitliche semantische Suche über ALLES.

**Ziel:** Eine Suche die alles findet — Ideas, Emails, Tasks, Contacts, Documents, Chat-History, Calendar Events, Finance, Knowledge Graph — mit semantischem Verständnis.

| Feature | Details |
|---------|---------|
| **Unified Search Index** | Alle Entitäten werden in einen gemeinsamen Embedding-Index aufgenommen |
| **Cross-Feature Results** | Suche "Marketing Budget" findet: 3 Ideas, 2 Emails, 1 Task, 1 Finance-Transaktion |
| **Result Grouping** | Ergebnisse gruppiert nach Typ mit Typ-Icons |
| **Faceted Filtering** | Nach Typ, Kontext, Zeitraum, Person filtern |
| **Natural Language Queries** | "Was hat Maria letzte Woche über das Budget gesagt?" → findet Email + Chat-Message |
| **Search-as-Navigation** | Suchergebnis klicken → direkt zur Entität navigieren |
| **Instant Results** | Lokaler Index für < 50ms Ergebnisse. Cloud-Fallback für Deep Search |
| **Search History** | Letzte Suchen + häufige Suchen als Quick-Access |

**Integration in Command Palette:**
- Default-Modus von Cmd+K ist universale Suche
- Ergebnisse mischen: Navigation + Befehle + Content-Ergebnisse
- Typ-Prefix für fokussierte Suche: `@` Kontakte, `#` Ideas, `$` Finance, etc.

**Erfolgskriterium:** User finden alles in < 3 Sekunden. Cross-Feature-Ergebnisse sind in > 80% der Fälle relevant. Ersetzt manuelle Navigation für Informationssuche.

---

### Phase 96: Cross-Context Business Narrative — Unified Intelligence

**Problem:** Business Dashboard (Phase 34) zeigt Stripe + GA4 + GSC Daten isoliert. Die AI verbindet sie nicht zu einer Story.

**Ziel:** Eine AI-generierte Business-Narrative die alle Datenquellen zu einer kohärenten Geschichte verbindet.

| Feature | Details |
|---------|---------|
| **Daily Business Digest** | Automatischer Report: "Gestern: 12 neue Kunden (+15%), Umsatz €4.200 (-3%), Top-Seite: /pricing (↑23%). 3 Emails von Leads. Meeting morgen mit [Kontakt]." |
| **Anomaly Narrative** | "Ungewöhnlich: Traffic auf /pricing ist 3x gestiegen, aber Conversion ist gefallen. Mögliche Ursache: Marketing-Kampagne bringt unqualifizierte Leads." |
| **Competitive Context** | "Deine SEO-Position für [Keyword] ist von #3 auf #5 gefallen. Mögliche Konkurrenten: [URLs]." |
| **Action Items** | "Empfehlung: Überprüfe die Pricing-Page, antworte auf die Lead-Email von [Kontakt], bereite die Agenda für morgen vor." |
| **Trend Visualization** | Cross-Source Grafiken: Revenue + Traffic + Email-Volume auf einer Timeline |
| **Custom KPIs** | User definiert eigene KPIs die über Datenquellen hinweg berechnet werden |

**Integration:**
- Morning Briefing (SmartSurface) enthält Business-Highlights
- Dashboard-Tab "Business Intelligence" zeigt narrative Reports
- Chat kann Business-Fragen beantworten: "Wie war mein Umsatz diese Woche?"

**Erfolgskriterium:** Täglicher AI-Report ist in > 80% der Fälle actionable. Cross-Source Insights werden als wertvoll bewertet.

---

## Implementierungsreihenfolge & Abhängigkeiten

```
Phase 78 (Architecture) ──────┐
Phase 79 (Design System) ─────┤
Phase 80 (Security/Testing) ──┼──→ [Foundation Complete]
Phase 81 (Performance) ────────┘         │
                                         ▼
Phase 82 (Keyboard/Command) ──┐
Phase 83 (Visual Redesign) ───┤
Phase 84 (Animations) ────────┼──→ [UX Excellence]
Phase 85 (Mobile) ────────────┤         │
Phase 86 (Onboarding) ────────┘         │
                                         ▼
Phase 87 (Next-Gen Memory) ───┐
Phase 88 (Proactive Engine) ──┤
Phase 89 (Self-Evolving) ─────┼──→ [AI Depth]
Phase 90 (Advanced Voice) ────┤         │
Phase 91 (Unified Assistant) ─┘         │
                                         ▼
Phase 92 (Digital Twin) ──────┐
Phase 93 (Workflow Automation)┤
Phase 94 (On-Device AI) ──────┼──→ [Differenzierung]
Phase 95 (Semantic Search 2.0)┤
Phase 96 (Business Narrative) ┘
```

**Parallelisierbarkeit:**
- Phase 78 + 79 können parallel (Backend + Frontend)
- Phase 80 nach 78 (braucht Module-Struktur für saubere Tests)
- Phase 81 nach 79 (braucht Design System für Skeletons)
- Phase 82 + 83 können parallel
- Phase 84 nach 83 (braucht Visual Redesign als Basis)
- Phase 85 nach 79 + 83 (braucht Design System + Visual Language)
- Phase 87-91 können weitgehend parallel (unabhängige Backend-Services)
- Phase 92-96 können nach Bedarf priorisiert werden

---

## Team-Skalierung Empfehlung

| Rolle | Anzahl | Fokus |
|-------|--------|-------|
| **Senior Frontend Engineer** | 2 | Design System Migration, React Router, Performance, Mobile |
| **Senior Backend Engineer** | 2 | Architecture Refactoring, Security, Testing, Performance |
| **AI/ML Engineer** | 1 | Memory System, Agent Pipelines, RAG Optimization |
| **UX/UI Designer** | 1 | Visual Redesign, Animation System, Onboarding, Mobile UX |
| **DevOps / SRE** | 1 | CI/CD, Monitoring, Infrastructure, Security Hardening |

**Minimum Viable Team:** 3 (1 Full-Stack Senior, 1 AI Engineer, 1 Designer)
**Optimal Team:** 7 (wie oben)

---

## Erfolgsmetriken (KPIs)

| Metrik | Ziel | Messung |
|--------|------|---------|
| **Lighthouse Score** | > 95 (Performance, A11y, Best Practices) | Lighthouse CI |
| **Time to Interactive** | < 1s | Web Vitals |
| **Input Latency** | < 50ms | Custom Instrumentation |
| **Test Coverage (meaningful)** | > 80% mit echter DB | Testcontainers + Stryker |
| **Design System Adoption** | 100% | Automated CSS Audit |
| **Mobile PWA Score** | 100/100 | Lighthouse |
| **AI Memory Accuracy** | > 85% | User Feedback Sampling |
| **Proactive Suggestion Relevance** | > 70% Accept Rate | Dismiss/Accept Tracking |
| **Agent Quality Improvement** | > 10% over 30 days | Execution Score Trends |
| **User Satisfaction (Onboarding)** | > 4.5/5 | In-App Survey |

---

## Quellen & Referenzen

### Competitive Intelligence
- Notion AI, ChatGPT, Microsoft Copilot, Apple Intelligence, Google Gemini, Cursor, Raycast, Superhuman, Granola, Otter.ai, Reflect, Obsidian, Linear, Arc Browser, Letta/MemGPT, CrewAI, Open Interpreter

### UX Research
- Superhuman Engineering Blog: 100ms Rule, Offline Architecture, Command Palette
- Linear: UI Redesign, LCH Colors, Sync Architecture
- Vercel: Dashboard Performance, Geist Design System, Web Interface Guidelines
- Figma: CRDT Multiplayer, Real-Time Collaboration
- Apple: Intelligence Writing Tools, Privacy Indicators
- Nielsen Norman Group: Response Time Limits, Skeleton Screens
- Motion (Framer Motion): Hybrid Animation Engine, FLIP Technique

### Academic Papers
- MAGMA: Multi-Graph Agentic Memory Architecture (ArXiv 2601.03236, Jan 2026)
- Memory in the Age of AI Agents (ArXiv 2512.13564, Dec 2025)
- ICLR 2026 Workshop: MemAgents
- CHI 2025: Proactive AI Support, AI False Memories, Proactive Assistant Design
- Nature Neuroscience: Sleep Memory Consolidation Mechanisms
- McKinsey: AI-Driven Nudges for Operations Performance
- Self-Evolving Agents Survey (ArXiv 2508.07407, Aug 2025)

### Industry Trends
- MCP (Model Context Protocol) Adoption Landscape
- CES 2026: Lenovo Qira Cross-Device AI
- Deloitte State of AI 2026
- GraphRAG Evolution (Microsoft Research)
- WebLLM: In-Browser LLM Inference
