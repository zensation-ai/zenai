# ZenAI Wochenplan: KW 49–53 (Phase 49–53)

> **Zeitraum:** Ab Donnerstag KW 49 bis Ende KW 53
> **Max Workers:** 2 parallel
> **Ausgangslage:** Phase 48 abgeschlossen (bis Mi KW 48), 2424+ Tests, Produktion stabil
> **Voraussetzung:** Phase 45-48 merged (Multi-Agent, Extended Thinking, RAG Analytics, Knowledge Graph Reasoning)

---

## Uebersicht

| Woche | Phase | Worker 1 | Worker 2 |
|-------|-------|----------|----------|
| **49** | Phase 49: Advanced RAG v2 | Multi-Document Reasoning + Semantic Chunking | Adaptive Retrieval + Citation Tracking |
| **50** | Phase 50: Dashboard Analytics v2 | Interaktive Visualisierungen + Custom Ranges | AI Usage Metrics + Memory Health Dashboard |
| **51** | Phase 51: Plugin & Extension System | Plugin API + Registry + Sandboxed Execution | UI Extension Points + Event Bus + Marketplace |
| **52** | Phase 52: Multi-Language Support | i18n Framework + Sprachpakete (DE/EN/FR/ES) | AI-Response Language Matching + RTL-Vorbereitung |
| **53** | Phase 53: AI Memory Insights | Memory Graph Visualisierung + Timeline | Confidence Scores + Curation + Impact Analysis |

---

## Woche 49 — Phase 49: Advanced RAG v2

**Ziel:** Weiterentwicklung der RAG-Pipeline mit Multi-Document Reasoning, intelligenten Chunk-Strategien und Source Attribution.

### Worker 1: Multi-Document Reasoning + Semantic Chunking

**Tag 1 (Do): Semantic Chunking Service**
- `backend/src/services/rag/semantic-chunker.ts` (neu):
  - Aktuell: Fixed-size Chunks (Token-basiert)
  - Neu: Semantic Chunking via Embedding-Similarity
  - Paragraphen-Grenzen erkennen, semantisch zusammenhaengende Bloecke bilden
  - Parent-Child Strategie: Grosse Chunks fuer Kontext, kleine fuer Precision
  ```typescript
  interface ChunkStrategy {
    type: 'fixed' | 'semantic' | 'parent_child';
    parentSize?: number;   // z.B. 1500 Tokens
    childSize?: number;    // z.B. 300 Tokens
    overlapTokens?: number;
  }
  ```
- DB-Migration: `chunks` Tabelle erweitern um `parent_chunk_id`, `chunk_strategy`, `semantic_boundaries`

**Tag 2 (Fr): Parent-Child Chunk Retrieval**
- Parent-Child Retrieval Logic:
  - Bei Match auf Child-Chunk → Parent-Chunk als Kontext zurueckgeben
  - Scoring: Child-Relevance × Parent-Context-Quality
  - Konfigurierbar: `retrieveWithParent: boolean`
- `backend/src/services/rag/chunk-retriever.ts` (neu):
  - Methoden: `retrieveChunks()`, `retrieveWithParents()`, `expandContext()`
  - Integration mit bestehendem pgvector-Search

**Tag 3 (Mo): Multi-Document Reasoning**
- `backend/src/services/rag/multi-document-reasoner.ts` (neu):
  - Mehrere Dokumente/Quellen gleichzeitig analysieren
  - Cross-Document Referenzen erkennen
  - Widersprueche zwischen Quellen identifizieren
  - Synthese-Prompt: "Basierend auf Quelle A, B und C..."
  ```typescript
  interface MultiDocumentResult {
    synthesis: string;
    sources: SourceAttribution[];
    agreements: string[];
    contradictions: string[];
    confidence: number;
  }
  ```

**Tag 4 (Di): Query Decomposition Enhancement**
- Bestehende Query Decomposition (Phase 47) erweitern:
  - Comparison Queries: "Vergleiche A mit B" → Separate Retrievals + Merge
  - Causal Queries: "Warum hat X zu Y gefuehrt?" → Ketten-Retrieval
  - Temporal Queries: "Was hat sich seit letztem Monat geaendert?" → Zeitfilter
  - Multi-Part Queries: "Erklaere X und wie es mit Y zusammenhaengt" → Parallel Retrieval
- Integration in `enhanced-rag.ts`: Automatische Decomposition fuer komplexe Queries

**Tag 5 (Mi): Tests + Integration**
- Unit-Tests fuer Semantic Chunker (15+ Tests):
  - Paragraph-Boundary Detection
  - Parent-Child Hierarchie
  - Chunk Overlap Handling
- Integration-Tests fuer Multi-Document Reasoning (10+ Tests)
- Performance-Benchmark: Retrieval-Qualitaet vor/nach Semantic Chunking

**Dateien:**
- `backend/src/services/rag/semantic-chunker.ts` (neu)
- `backend/src/services/rag/chunk-retriever.ts` (neu)
- `backend/src/services/rag/multi-document-reasoner.ts` (neu)
- `backend/src/services/enhanced-rag.ts` (aendern, Integration)
- `backend/sql/migrations/phase49_advanced_rag.sql` (neu)
- `backend/src/__tests__/unit/services/semantic-chunker.test.ts` (neu)
- `backend/src/__tests__/unit/services/multi-document-reasoner.test.ts` (neu)

---

### Worker 2: Adaptive Retrieval + Citation Tracking

**Tag 1 (Do): Adaptive Retrieval Strategy**
- `backend/src/services/rag/adaptive-retrieval.ts` (neu):
  - Automatische Auswahl zwischen Dense/Sparse/Hybrid Retrieval
  - Dense: pgvector Embedding-Similarity (Standard)
  - Sparse: PostgreSQL Full-Text Search (tsvector)
  - Hybrid: Kombination mit RRF (Reciprocal Rank Fusion)
  ```typescript
  interface RetrievalStrategy {
    type: 'dense' | 'sparse' | 'hybrid';
    score: number;
    reason: string;
  }

  function selectStrategy(query: string): RetrievalStrategy {
    // Keyword-lastig → Sparse bevorzugen
    // Konzeptuell → Dense bevorzugen
    // Gemischt → Hybrid
  }
  ```
- Query-Analyse: Keyword-Dichte, Konzeptuelle Tiefe, Entitaets-Erkennung

**Tag 2 (Fr): Citation Tracking + Source Attribution**
- `backend/src/services/rag/citation-tracker.ts` (neu):
  - Jede AI-Antwort bekommt Source-Referenzen
  - Format: `[1]`, `[2]`, etc. inline im Text
  - Source-Liste am Ende der Antwort
  ```typescript
  interface SourceAttribution {
    id: string;
    title: string;
    type: 'idea' | 'document' | 'chat' | 'web';
    snippet: string;
    relevanceScore: number;
    url?: string;
  }
  ```
- Integration in Chat-Response: Citations als Metadata mitliefern
- Frontend: Citations als klickbare Links anzeigen

**Tag 3 (Mo): Feedback-Loop fuer Retrieval-Optimierung**
- Bestehende RAG Feedback API (Phase 47) erweitern:
  - Pro-Source Feedback: "War Quelle X hilfreich?"
  - Strategie-Lernen: Welche Retrieval-Strategie fuer welchen Query-Typ?
  - DB-Tabelle: `rag_source_feedback` (source_id, helpful, query_type)
- Automatische Strategie-Anpassung basierend auf Feedback-History:
  ```typescript
  // Wenn Hybrid fuer "Vergleichs-Queries" 80% positive Bewertung hat:
  // → Hybrid als Default fuer comparison queries
  ```

**Tag 4 (Di): RAG API Endpoints**
- Neue/erweiterte Endpoints:
  ```
  POST /api/:context/rag/retrieve     - Retrieval mit Strategy-Auswahl
  GET  /api/:context/rag/citations     - Citations einer Chat-Nachricht
  POST /api/:context/rag/source-feedback - Feedback pro Quelle
  GET  /api/:context/rag/strategy-stats  - Strategie-Performance
  ```
- Integration in General Chat: Citations automatisch bei RAG-enhanced Responses

**Tag 5 (Mi): Frontend Citations + Tests**
- Frontend Citation UI:
  - `frontend/src/components/CitationList.tsx` (neu):
    - Inline-Referenzen `[1]` als Tooltips
    - Expandierbare Source-Liste unter der AI-Antwort
    - Click → Quelle oeffnen (Idea/Document/Chat)
  - `frontend/src/components/GeneralChat/GeneralChat.tsx` (aendern):
    - Citations aus Response-Metadata extrahieren
    - CitationList unterhalb der AI-Nachricht rendern
- Tests (20+ Tests):
  - Adaptive Strategy Selection
  - Citation Extraction + Formatting
  - Source Feedback CRUD
  - RRF Fusion Scoring

**Dateien:**
- `backend/src/services/rag/adaptive-retrieval.ts` (neu)
- `backend/src/services/rag/citation-tracker.ts` (neu)
- `backend/src/routes/rag.ts` (neu/aendern, erweiterte Endpoints)
- `backend/sql/migrations/phase49_advanced_rag.sql` (aendern, rag_source_feedback Tabelle)
- `frontend/src/components/CitationList.tsx` (neu)
- `frontend/src/components/GeneralChat/GeneralChat.tsx` (aendern)
- `backend/src/__tests__/unit/services/adaptive-retrieval.test.ts` (neu)
- `backend/src/__tests__/unit/services/citation-tracker.test.ts` (neu)

**Erfolgskriterien Phase 49:**
- [ ] Semantic Chunking mit Parent-Child Hierarchie
- [ ] Multi-Document Reasoning mit Synthese
- [ ] Adaptive Dense/Sparse/Hybrid Retrieval
- [ ] Citation Tracking mit Source Attribution in Chat
- [ ] Feedback-basierte Strategie-Optimierung
- [ ] 45+ neue Tests

---

## Woche 50 — Phase 50: Dashboard Analytics v2

**Ziel:** Erweitertes Analytics-Dashboard mit interaktiven Visualisierungen, AI Usage Metrics, Productivity Insights und Memory Health.

### Worker 1: Interaktive Visualisierungen + Custom Date Ranges

**Tag 1 (Mo): Analytics Dashboard Redesign**
- `frontend/src/components/AnalyticsDashboard/AnalyticsDashboard.tsx` (neu):
  - 5 Tabs: Uebersicht, Produktivitaet, AI-Nutzung, Memory, Export
  - Recharts Integration (bereits als Dependency? Sonst installieren)
  - Responsive Grid Layout fuer Karten/Charts
- Navigation: `/insights/analytics` als neuer Sub-Tab unter Insights

**Tag 2 (Di): Custom Date Range Picker + API**
- `frontend/src/components/AnalyticsDashboard/DateRangePicker.tsx` (neu):
  - Presets: Heute, 7 Tage, 30 Tage, 90 Tage, Dieses Jahr, Custom
  - Custom Range: Kalender-Picker (Start + Ende)
  - Vergleichszeitraum: "vs. vorherige Periode" Toggle
- Backend API:
  ```
  GET /api/:context/analytics/overview?from=2026-01-01&to=2026-03-09
  GET /api/:context/analytics/trends?from=...&to=...&granularity=day|week|month
  GET /api/:context/analytics/comparison?period1_from=...&period1_to=...&period2_from=...&period2_to=...
  ```
- `backend/src/services/analytics-v2.ts` (neu):
  - Query-Builder mit Datum-Filter
  - Aggregation: Daily, Weekly, Monthly
  - Vergleich: WoW (Week-over-Week), MoM (Month-over-Month)

**Tag 3 (Mi): Produktivitaets-Charts**
- Task Completion Trends (Line Chart):
  - Tasks erstellt vs. abgeschlossen pro Tag/Woche
  - Durchschnittliche Task-Dauer
  - Kanban-Flow: Backlog → Done Velocity
- Focus Time Analysis (Bar Chart):
  - Chat-Sessions Dauer pro Tag
  - Produktivste Stunden (Heatmap)
  - Context-Switch-Haeufigkeit
- Idea Pipeline (Funnel Chart):
  - Ideen → Inkubiert → In Arbeit → Abgeschlossen → Archiviert
  - Conversion Rates pro Stufe

**Tag 4 (Do): Export-Funktionalitaet**
- PDF Export:
  - Dashboard als PDF mit Charts (html2canvas + jsPDF oder react-pdf)
  - Automatisches Layout (A4, Querformat fuer Charts)
  - Branding: ZenAI Logo + Zeitraum im Header
- CSV Export:
  - Raw-Daten Download fuer alle Metriken
  - Spalten: Datum, Metrik, Wert, Context
- Scheduled Reports (Backend):
  - Woechentlicher Analytics-Report als Email (ueber Resend)
  - Template: Key Metrics + Trends + AI Suggestions

**Tag 5 (Fr): Tests + Feinschliff**
- Backend-Tests (15+ Tests):
  - Date Range Queries
  - Aggregation (Daily/Weekly/Monthly)
  - Comparison Calculations (WoW, MoM)
  - Export Format Validierung
- Frontend-Tests (5+ Tests):
  - DateRangePicker Interactions
  - Chart Rendering mit Mock-Daten
  - Export Button Funktionalitaet

**Dateien:**
- `frontend/src/components/AnalyticsDashboard/AnalyticsDashboard.tsx` (neu)
- `frontend/src/components/AnalyticsDashboard/DateRangePicker.tsx` (neu)
- `frontend/src/components/AnalyticsDashboard/ProductivityCharts.tsx` (neu)
- `frontend/src/components/AnalyticsDashboard/ExportPanel.tsx` (neu)
- `frontend/src/components/AnalyticsDashboard/AnalyticsDashboard.css` (neu)
- `backend/src/services/analytics-v2.ts` (neu)
- `backend/src/routes/analytics-v2.ts` (neu)
- `backend/sql/migrations/phase50_analytics.sql` (neu)
- `backend/src/__tests__/unit/services/analytics-v2.test.ts` (neu)

---

### Worker 2: AI Usage Metrics + Memory Health Dashboard

**Tag 1 (Mo): AI Usage Tracking Service**
- `backend/src/services/ai-usage-tracker.ts` (neu):
  - Jeder Claude API Call wird geloggt:
    ```typescript
    interface AIUsageEntry {
      timestamp: Date;
      model: string;
      input_tokens: number;
      output_tokens: number;
      thinking_tokens: number;
      cost_usd: number;       // Berechnet aus Token-Preise
      feature: string;         // 'chat', 'rag', 'vision', 'code_execution'
      context: AIContext;
      response_time_ms: number;
    }
    ```
  - Cost Calculation: Claude Sonnet Pricing (Input/Output Tokens)
  - Aggregation: Pro Tag, Pro Feature, Pro Model
- DB-Migration: `ai_usage_log` Tabelle (in public Schema, nicht context-spezifisch)

**Tag 2 (Di): AI Usage Dashboard Frontend**
- Token-Verbrauch Chart (Stacked Bar):
  - Input vs. Output vs. Thinking Tokens pro Tag
  - Aufschluesselung nach Feature (Chat, RAG, Vision, Code)
- Kosten-Tracking (Line Chart):
  - Taegliche/Woechentliche Kosten in USD
  - Budget-Linie (konfigurierbar)
  - Prognose: "Bei aktuellem Verbrauch: $X/Monat"
- Model-Breakdown (Pie Chart):
  - Anteil Claude Sonnet vs. Opus vs. Haiku
  - Durchschnittliche Response Time pro Model

**Tag 3 (Mi): Memory Health Dashboard**
- `backend/src/services/memory-health.ts` (neu):
  - Memory Stats aggregieren:
    - Total Memories (Short-Term, Long-Term, Working)
    - Decay Rate: Wie viele Memories pro Tag verfallen?
    - Consolidation Stats: Erfolgsrate, Durchschnittsdauer
    - Memory Coverage: Welche Topics gut/schlecht abgedeckt?
  ```
  GET /api/:context/analytics/memory-health
  ```
- Frontend Memory Health Panel:
  - Decay Rate Gauge (Tachometer-Stil)
  - Consolidation Success Rate (Fortschrittsbalken)
  - Memory Distribution Chart (Donut: Short vs. Long vs. Working)
  - Topic Coverage Heatmap

**Tag 4 (Do): Vergleichende Zeitraum-Analyse**
- Comparison View:
  - Split-Screen: Periode 1 vs. Periode 2
  - Delta-Berechnung: "+15% mehr Tasks abgeschlossen"
  - Trend-Pfeile: Hoch/Runter/Stabil pro Metrik
- Key Metrics Cards:
  - Ideas erstellt (mit Trend)
  - Tasks abgeschlossen (mit Trend)
  - Chat-Nachrichten (mit Trend)
  - AI-Kosten (mit Trend)
  - Memory Health Score (0-100)

**Tag 5 (Fr): Integration + Tests**
- AI Usage Tracker in bestehende Services integrieren:
  - `backend/src/services/claude/streaming.ts` → Log nach Response
  - `backend/src/services/claude-vision.ts` → Log nach Analyse
  - `backend/src/services/enhanced-rag.ts` → Log nach Retrieval
- Tests (15+ Tests):
  - Usage Tracking CRUD
  - Cost Calculation Accuracy
  - Memory Health Aggregation
  - Comparison Delta Calculation
- Performance: Usage-Logging asynchron (fire-and-forget), kein Impact auf Response Time

**Dateien:**
- `backend/src/services/ai-usage-tracker.ts` (neu)
- `backend/src/services/memory-health.ts` (neu)
- `backend/src/routes/analytics-v2.ts` (aendern, Usage + Memory Endpoints)
- `backend/sql/migrations/phase50_analytics.sql` (aendern, ai_usage_log Tabelle)
- `frontend/src/components/AnalyticsDashboard/AIUsagePanel.tsx` (neu)
- `frontend/src/components/AnalyticsDashboard/MemoryHealthPanel.tsx` (neu)
- `frontend/src/components/AnalyticsDashboard/ComparisonView.tsx` (neu)
- `backend/src/__tests__/unit/services/ai-usage-tracker.test.ts` (neu)
- `backend/src/__tests__/unit/services/memory-health.test.ts` (neu)

**Erfolgskriterien Phase 50:**
- [ ] Analytics Dashboard mit 5 Tabs
- [ ] Custom Date Range mit Presets
- [ ] Task Completion + Focus Time Charts
- [ ] AI Token/Kosten-Tracking mit Budget-Linie
- [ ] Memory Health Dashboard (Decay, Consolidation, Coverage)
- [ ] PDF + CSV Export
- [ ] Vergleichende Zeitraum-Analyse (WoW, MoM)
- [ ] 35+ neue Tests

---

## Woche 51 — Phase 51: Plugin & Extension System

**Ziel:** Modulares Plugin-System mit Lifecycle Hooks, Registry, Sandboxed Execution, UI Extension Points und Event Bus.

### Worker 1: Plugin API + Registry + Sandboxed Execution

**Tag 1 (Mo): Plugin API Core**
- `backend/src/services/plugins/plugin-api.ts` (neu):
  ```typescript
  interface Plugin {
    id: string;
    name: string;
    version: string;
    description: string;
    author: string;
    permissions: PluginPermission[];
    hooks: {
      onInstall?: () => Promise<void>;
      onActivate?: () => Promise<void>;
      onDeactivate?: () => Promise<void>;
      onUninstall?: () => Promise<void>;
    };
    extensions?: {
      sidebarWidgets?: SidebarWidget[];
      pages?: CustomPage[];
      tools?: PluginTool[];
      commands?: PluginCommand[];
    };
  }

  type PluginPermission = 'read:ideas' | 'write:ideas' | 'read:tasks' | 'write:tasks'
    | 'read:chat' | 'write:chat' | 'read:memory' | 'api:external';
  ```
- Lifecycle Management: install → activate → deactivate → uninstall
- Plugin State: `installed`, `active`, `inactive`, `error`

**Tag 2 (Di): Plugin Registry**
- `backend/src/services/plugins/plugin-registry.ts` (neu):
  - Plugin Discovery: Lokale Plugins in `plugins/` Verzeichnis
  - Versioning: SemVer-basiert, Update-Checks
  - Dependency Resolution: Plugin A braucht Plugin B v2+
  - Conflict Detection: Zwei Plugins registrieren gleichen Hook
- DB-Migration: `plugins` + `plugin_configs` Tabellen
  ```sql
  CREATE TABLE plugins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    version VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'installed',
    permissions JSONB DEFAULT '[]',
    config JSONB DEFAULT '{}',
    installed_at TIMESTAMPTZ DEFAULT NOW(),
    activated_at TIMESTAMPTZ
  );
  ```

**Tag 3 (Mi): Sandboxed Execution**
- `backend/src/services/plugins/plugin-sandbox.ts` (neu):
  - Isolierte Plugin-Runtime via `vm2` oder Node.js `vm` Module
  - Resource Limits: CPU Time, Memory, Network Access
  - API Surface: Nur erlaubte Methoden per Permission
  ```typescript
  class PluginSandbox {
    private allowedAPIs: Map<string, Function>;

    constructor(plugin: Plugin) {
      this.allowedAPIs = this.buildAPIForPermissions(plugin.permissions);
    }

    async execute(code: string): Promise<unknown> {
      const context = {
        zenai: Object.fromEntries(this.allowedAPIs),
        console: { log: this.safeLog, error: this.safeError },
      };
      return runInSandbox(code, context, { timeout: 5000 });
    }
  }
  ```
- Error Isolation: Plugin-Crash darf Backend nicht beeinflussen
- Logging: Plugin-spezifische Logs in separater Tabelle

**Tag 4 (Do): Plugin CRUD API**
- REST Endpoints:
  ```
  GET    /api/plugins                     - Alle installierten Plugins
  GET    /api/plugins/:id                 - Plugin Details
  POST   /api/plugins/install             - Plugin installieren (aus Registry/Upload)
  POST   /api/plugins/:id/activate        - Plugin aktivieren
  POST   /api/plugins/:id/deactivate      - Plugin deaktivieren
  DELETE /api/plugins/:id                 - Plugin deinstallieren
  GET    /api/plugins/:id/config          - Plugin-Konfiguration
  PUT    /api/plugins/:id/config          - Konfiguration aendern
  GET    /api/plugins/:id/logs            - Plugin Logs
  ```
- Admin-Only: Alle Plugin-Operationen erfordern `admin` Scope

**Tag 5 (Mi): Tests + Beispiel-Plugin**
- Beispiel-Plugin: "Word Counter"
  ```typescript
  export default {
    id: 'word-counter',
    name: 'Word Counter',
    version: '1.0.0',
    permissions: ['read:ideas'],
    hooks: {
      onActivate: async () => console.log('Word Counter activated'),
    },
    extensions: {
      sidebarWidgets: [{
        id: 'word-count-widget',
        title: 'Wortanzahl',
        component: 'WordCountWidget',
      }],
    },
  };
  ```
- Tests (20+ Tests):
  - Plugin Lifecycle (install → activate → deactivate → uninstall)
  - Permission Enforcement
  - Sandbox Isolation
  - Dependency Resolution
  - Conflict Detection

**Dateien:**
- `backend/src/services/plugins/plugin-api.ts` (neu)
- `backend/src/services/plugins/plugin-registry.ts` (neu)
- `backend/src/services/plugins/plugin-sandbox.ts` (neu)
- `backend/src/routes/plugins.ts` (neu)
- `backend/sql/migrations/phase51_plugins.sql` (neu)
- `backend/plugins/word-counter/index.ts` (neu, Beispiel)
- `backend/src/__tests__/unit/services/plugin-api.test.ts` (neu)
- `backend/src/__tests__/unit/services/plugin-registry.test.ts` (neu)
- `backend/src/__tests__/unit/services/plugin-sandbox.test.ts` (neu)

---

### Worker 2: UI Extension Points + Event Bus + Marketplace

**Tag 1 (Mo): Event Bus System**
- `backend/src/services/plugins/event-bus.ts` (neu):
  ```typescript
  class EventBus {
    private listeners: Map<string, EventHandler[]> = new Map();

    on(event: string, handler: EventHandler, pluginId: string): void;
    off(event: string, pluginId: string): void;
    emit(event: string, data: unknown): Promise<void>;

    // Built-in Events:
    // 'idea:created', 'idea:updated', 'idea:deleted'
    // 'task:created', 'task:completed'
    // 'chat:message:sent', 'chat:message:received'
    // 'memory:consolidated', 'memory:decayed'
    // 'plugin:installed', 'plugin:activated'
  }
  ```
- Synchrone + Asynchrone Event-Handler
- Event-Prioritaet: Critical → High → Normal → Low
- Dead Letter Queue fuer fehlgeschlagene Events

**Tag 2 (Di): UI Extension Points**
- `frontend/src/services/plugin-host.ts` (neu):
  - Extension Points definieren:
    ```typescript
    type ExtensionPoint =
      | 'sidebar.widget'        // Sidebar-Widget (unterhalb Navigation)
      | 'page.custom'           // Eigene Seite unter /plugins/:pluginId
      | 'chat.tool'             // Neues Tool im Chat
      | 'idea.action'           // Action-Button auf Idea-Cards
      | 'settings.panel'        // Settings-Tab
      | 'dashboard.card';       // Dashboard-Karte
    ```
  - Plugin-Renderer: React-Komponenten dynamisch laden
  - Slot-System: Plugins registrieren sich fuer Extension Points
- `frontend/src/components/PluginSlot.tsx` (neu):
  ```tsx
  <PluginSlot point="sidebar.widget" /> // Rendert alle registrierten Sidebar-Widgets
  <PluginSlot point="dashboard.card" /> // Rendert alle Dashboard-Karten
  ```

**Tag 3 (Mi): Plugin Management UI**
- `frontend/src/components/PluginManager/PluginManager.tsx` (neu):
  - Tab in Settings: "Erweiterungen"
  - Installierte Plugins Liste (Name, Version, Status, Toggle)
  - Plugin Details View (Beschreibung, Permissions, Konfiguration)
  - Install Button (aus Marketplace oder Upload)
- `frontend/src/components/PluginManager/PluginCard.tsx` (neu):
  - Toggle: Aktiv/Inaktiv
  - Konfigurations-Modal
  - Deinstallieren mit Bestaetigung
  - Version + Autor + Berechtigungen anzeigen

**Tag 4 (Do): Plugin Marketplace (Basic)**
- `backend/src/services/plugins/marketplace.ts` (neu):
  - Curated Plugin List (JSON-basiert, initial):
    ```json
    [
      {
        "id": "word-counter",
        "name": "Word Counter",
        "description": "Zaehlt Woerter in Ideas und Tasks",
        "version": "1.0.0",
        "author": "ZenAI Team",
        "rating": 4.5,
        "downloads": 0,
        "category": "productivity"
      }
    ]
    ```
  - Rating-System: 1-5 Sterne (in DB gespeichert)
  - Kategorien: Productivity, Analytics, Communication, AI Tools
- Frontend Marketplace View:
  - Grid mit Plugin-Cards
  - Filter nach Kategorie
  - Suche nach Name/Beschreibung
  - Install-Button mit Permission-Review

**Tag 5 (Fr): Integration + Tests**
- Event Bus in bestehende Services integrieren:
  - Ideas Service: Emit bei CRUD
  - Tasks Service: Emit bei Status-Aenderung
  - Chat Service: Emit bei Nachricht
- Plugin Slots in bestehendes Frontend integrieren:
  - Sidebar: `<PluginSlot point="sidebar.widget" />` nach Navigation
  - Dashboard: `<PluginSlot point="dashboard.card" />` am Ende
  - Settings: Neuer "Erweiterungen" Tab
- Tests (20+ Tests):
  - Event Bus: Emit, On, Off, Priority
  - Extension Point Registration
  - Plugin Slot Rendering
  - Marketplace CRUD
  - Rating System

**Dateien:**
- `backend/src/services/plugins/event-bus.ts` (neu)
- `backend/src/services/plugins/marketplace.ts` (neu)
- `frontend/src/services/plugin-host.ts` (neu)
- `frontend/src/components/PluginSlot.tsx` (neu)
- `frontend/src/components/PluginManager/PluginManager.tsx` (neu)
- `frontend/src/components/PluginManager/PluginCard.tsx` (neu)
- `frontend/src/components/PluginManager/Marketplace.tsx` (neu)
- `frontend/src/components/PluginManager/PluginManager.css` (neu)
- `backend/src/__tests__/unit/services/event-bus.test.ts` (neu)
- `frontend/src/components/__tests__/PluginManager.test.tsx` (neu)

**Erfolgskriterien Phase 51:**
- [ ] Plugin API mit Lifecycle Hooks
- [ ] Plugin Registry mit Versioning + Dependencies
- [ ] Sandboxed Execution mit Permission-System
- [ ] Event Bus mit Built-in Events
- [ ] 6 UI Extension Points (Sidebar, Page, Chat Tool, Idea Action, Settings, Dashboard)
- [ ] Plugin Management UI in Settings
- [ ] Basic Marketplace mit Rating
- [ ] Beispiel-Plugin funktioniert end-to-end
- [ ] 40+ neue Tests

---

## Woche 52 — Phase 52: Multi-Language Support

**Ziel:** Vollstaendige Internationalisierung mit i18n Framework, 4 Sprachen, AI-Response Language Matching und RTL-Vorbereitung.

### Worker 1: i18n Framework + Sprachpakete (DE/EN/FR/ES)

**Tag 1 (Mo): i18n Setup**
- `react-i18next` + `i18next` installieren
- `frontend/src/i18n/index.ts` (neu):
  ```typescript
  import i18n from 'i18next';
  import { initReactI18next } from 'react-i18next';
  import LanguageDetector from 'i18next-browser-languagedetector';

  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: { de, en, fr, es },
      fallbackLng: 'de',
      ns: ['common', 'chat', 'ideas', 'planner', 'settings', 'email', 'analytics'],
      defaultNS: 'common',
      interpolation: { escapeValue: false },
    });
  ```
- Namespace-Struktur definieren:
  - `common`: Navigation, Buttons, allgemeine Labels
  - `chat`: Chat-Interface, Prompts, Placeholder
  - `ideas`: Ideas Page, Tabs, Actions
  - `planner`: Kalender, Tasks, Kanban, Gantt
  - `settings`: Settings Tabs, Formulare
  - `email`: Email-Interface
  - `analytics`: Dashboard, Charts, Metriken

**Tag 2 (Di): Deutsche + Englische Strings (Kernseiten)**
- `frontend/src/i18n/locales/de/common.json` (~100 Keys):
  - Navigation Labels, Buttons, Statusmeldungen, Fehlermeldungen
- `frontend/src/i18n/locales/en/common.json` (~100 Keys)
- Kernseiten migrieren (hardcoded → `t()`):
  - `navigation.ts` (alle Labels)
  - `Dashboard.tsx` (alle Texte)
  - `ChatPage.tsx` / `GeneralChat.tsx`
  - `Sidebar.tsx`, `AppLayout.tsx`
  - `CommandPalette.tsx`

**Tag 3 (Mi): Alle Seiten migrieren**
- Weitere Namespaces befuellen (DE + EN):
  - `ideas.json` (~80 Keys): IdeasPage, IdeaDetail, Tabs
  - `planner.json` (~60 Keys): PlannerPage, KanbanBoard, GanttChart, TaskForm
  - `settings.json` (~70 Keys): SettingsDashboard, 7 Tabs
  - `email.json` (~50 Keys): EmailPage, Compose, Thread
  - `analytics.json` (~40 Keys): Dashboard Charts, Labels
- Alle betroffenen Komponenten (~25) auf `useTranslation()` umstellen

**Tag 4 (Do): Franzoesisch + Spanisch**
- `frontend/src/i18n/locales/fr/` — Alle 7 Namespaces
- `frontend/src/i18n/locales/es/` — Alle 7 Namespaces
- Pluralisierung fuer alle 4 Sprachen:
  ```json
  {
    "ideas_count": "{{count}} Idee",
    "ideas_count_plural": "{{count}} Ideen"
  }
  ```
- Language Switcher Component:
  - `frontend/src/components/LanguageSwitcher.tsx` (neu)
  - Dropdown in Settings → Allgemein
  - Kompaktes Flag-Icon in Sidebar Footer
  - `localStorage` Persistenz

**Tag 5 (Fr): Datums/Zahlen-Formatierung + Tests**
- `Intl.DateTimeFormat` und `Intl.NumberFormat` locale-aware:
  - `dateUtils.ts` erweitern: Locale-Parameter
  - Finance: Waehrungsformatierung je nach Sprache
  - Kalender: Erster Tag der Woche (Mo vs. So)
- Tests (15+ Tests):
  - Sprachumschaltung funktioniert
  - Alle Namespaces geladen
  - 0 fehlende Keys (MissingKey Handler als Error in Dev)
  - Pluralisierung korrekt
  - Datumsformate pro Sprache

**Dateien:**
- `frontend/src/i18n/index.ts` (neu)
- `frontend/src/i18n/locales/de/*.json` (7 Dateien, ~400 Keys)
- `frontend/src/i18n/locales/en/*.json` (7 Dateien, ~400 Keys)
- `frontend/src/i18n/locales/fr/*.json` (7 Dateien, ~400 Keys)
- `frontend/src/i18n/locales/es/*.json` (7 Dateien, ~400 Keys)
- `frontend/src/components/LanguageSwitcher.tsx` (neu)
- ~25 Frontend-Komponenten (aendern)
- `frontend/src/utils/dateUtils.ts` (aendern)
- `frontend/src/__tests__/i18n.test.tsx` (neu)

---

### Worker 2: AI-Response Language Matching + RTL-Vorbereitung

**Tag 1 (Mo): Backend Locale Middleware**
- `backend/src/middleware/locale.ts` (neu):
  - `Accept-Language` Header parsen
  - User Preference aus DB (falls gespeichert)
  - Fallback-Kette: User Pref → Accept-Language → 'de'
  - `req.locale` auf Request-Objekt setzen
- Backend Error Messages lokalisieren:
  - `backend/src/i18n/messages.ts` (neu):
    ```typescript
    const messages = {
      de: { not_found: 'Nicht gefunden', unauthorized: 'Nicht autorisiert' },
      en: { not_found: 'Not found', unauthorized: 'Unauthorized' },
      fr: { not_found: 'Non trouvé', unauthorized: 'Non autorisé' },
      es: { not_found: 'No encontrado', unauthorized: 'No autorizado' },
    };
    ```

**Tag 2 (Di): AI-Response Language Matching**
- System Prompts anpassen:
  - Sprache des Users in System Prompt injizieren:
    ```
    "Antworte immer auf ${userLanguage}."
    ```
  - Context-aware: Fachbegriffe im Work-Context anders als Personal
- Chat-Modes Anpassung:
  - `backend/src/services/chat-modes.ts` (aendern):
    - Alle System Prompts mit Language-Parameter
    - Tool-Beschreibungen lokalisiert
- Vision API: Bildanalyse in User-Sprache
- Code Execution: Kommentare in User-Sprache

**Tag 3 (Mi): RTL-Support Vorbereitung**
- CSS Logical Properties Migration:
  ```css
  /* Alt */
  margin-left: 16px;
  padding-right: 8px;
  text-align: left;

  /* Neu (RTL-ready) */
  margin-inline-start: 16px;
  padding-inline-end: 8px;
  text-align: start;
  ```
- `dir="auto"` Attribute auf Text-Containern
- Layout-Flexbox: `flex-direction` Anpassungen vorbereiten
- **Hinweis:** Keine RTL-Sprache initial, aber Infrastruktur bereit

**Tag 4 (Do): Context-aware Uebersetzung**
- Fachbegriffe pro Domain:
  - Work-Context: "Meeting", "Deadline", "Sprint" (bleiben englisch)
  - Personal-Context: Lokalisierte Begriffe
  - Learning-Context: Bildungsspezifische Terminologie
- Glossar-System:
  - `backend/src/i18n/glossary.ts` (neu):
    ```typescript
    const glossary: Record<AIContext, Record<string, Record<string, string>>> = {
      work: { de: { sprint: 'Sprint', meeting: 'Meeting' } },
      personal: { de: { sprint: 'Sprint', meeting: 'Treffen' } },
    };
    ```
  - Integration in RAG-Pipeline: Glossar als Kontext

**Tag 5 (Fr): Spracherkennung + Tests**
- Automatische Spracherkennung:
  - Browser: `navigator.language`
  - User Settings: Explizite Auswahl (hoechste Prioritaet)
  - AI Detection: Chat-Sprache erkennen (optional)
- User Language Preference API:
  ```
  GET  /api/user/language           - Aktuelle Sprache
  PUT  /api/user/language           - Sprache setzen
  ```
- Tests (15+ Tests):
  - Locale Middleware (Accept-Language Parsing)
  - AI Response in korrekter Sprache
  - RTL Logical Properties (CSS Snapshot Tests)
  - Context-aware Glossar
  - Language Preference CRUD

**Dateien:**
- `backend/src/middleware/locale.ts` (neu)
- `backend/src/i18n/messages.ts` (neu)
- `backend/src/i18n/glossary.ts` (neu)
- `backend/src/routes/user.ts` (aendern, Language Preference)
- `backend/src/services/chat-modes.ts` (aendern)
- `frontend/src/styles/rtl.css` (neu)
- ~10 CSS-Dateien (aendern, Logical Properties)
- `backend/src/__tests__/unit/middleware/locale.test.ts` (neu)
- `backend/src/__tests__/unit/services/language-matching.test.ts` (neu)

**Erfolgskriterien Phase 52:**
- [ ] 4 Sprachen: DE, EN, FR, ES
- [ ] ~400 Translation Keys pro Sprache
- [ ] Language Switcher in Settings + Sidebar
- [ ] AI antwortet in User-Sprache
- [ ] Backend Error Messages lokalisiert
- [ ] RTL-ready CSS (Logical Properties)
- [ ] Context-aware Fachbegriff-Glossar
- [ ] Automatische Spracherkennung
- [ ] 30+ neue Tests

---

## Woche 53 — Phase 53: AI Memory Insights

**Ziel:** Transparente Einblicke in das KI-Gedaechtnis mit Visualisierung, Timeline, Confidence Scoring, Conflict Detection und User-gesteuerter Curation.

### Worker 1: Memory Graph Visualisierung + Timeline

**Tag 1 (Mo): Memory Graph Backend**
- `backend/src/services/memory/memory-insights.ts` (neu):
  - Memory-Daten als Graph aufbereiten:
    ```typescript
    interface MemoryNode {
      id: string;
      type: 'fact' | 'experience' | 'preference' | 'pattern';
      content: string;
      confidence: number;
      createdAt: Date;
      lastAccessed: Date;
      accessCount: number;
      source: 'chat' | 'rag' | 'user' | 'inference';
    }

    interface MemoryEdge {
      source: string;
      target: string;
      relation: 'supports' | 'contradicts' | 'related' | 'derived_from';
      strength: number;
    }

    interface MemoryGraph {
      nodes: MemoryNode[];
      edges: MemoryEdge[];
      clusters: MemoryCluster[];
    }
    ```
  - Cluster-Erkennung: Zusammengehoerige Memories gruppieren
  - Importance Score: Berechnet aus Access-Haeufigkeit + Confidence + Alter

**Tag 2 (Di): Memory Graph Frontend**
- `frontend/src/components/MemoryInsights/MemoryGraph.tsx` (neu):
  - ReactFlow-basierte Graph-Visualisierung
  - Node-Farben nach Typ (Fact=Blau, Experience=Gruen, Preference=Lila, Pattern=Orange)
  - Edge-Staerke als Liniendicke
  - Zoom + Pan + Minimap
  - Click auf Node → Detail-Panel (Inhalt, Quellen, Confidence)
  - Filter: Nach Typ, Zeitraum, Confidence-Schwelle
- `frontend/src/components/MemoryInsights/MemoryInsights.tsx` (neu):
  - Container mit 3 Tabs: Graph, Timeline, Curation
  - Navigation: MyAI → neuer Tab "Memory Insights" (oder eigener Sidebar-Eintrag)

**Tag 3 (Mi): Memory Timeline**
- `frontend/src/components/MemoryInsights/MemoryTimeline.tsx` (neu):
  - Vertikale Timeline (neueste oben):
    - "Heute gelernt: Du bevorzugst TypeScript gegenueber JavaScript"
    - "Vor 3 Tagen: Meeting mit Team X notiert"
    - "Letzte Woche: Neues Interesse an Machine Learning erkannt"
  - Gruppierung nach Tag/Woche/Monat
  - Filter: Nach Memory-Typ, Quelle, Zeitraum
  - Icon pro Typ + Source Badge
- Backend Endpoint:
  ```
  GET /api/:context/memory/timeline?from=...&to=...&type=fact&limit=50
  ```

**Tag 4 (Do): Confidence Scoring + Decay Visualisierung**
- Confidence Score System:
  - Initiales Scoring bei Memory-Erstellung:
    - Explizite User-Aussage: 0.95
    - AI-Inferenz: 0.7
    - Pattern-Erkennung: 0.5
  - Decay ueber Zeit: Confidence sinkt wenn Memory nicht bestaetigt wird
  - Boost bei Wiederverwendung: +0.1 pro erfolgreiche Nutzung
- Frontend Confidence Gauge:
  - Farbcodierung: Gruen (>0.8), Gelb (0.5-0.8), Rot (<0.5)
  - Tooltip: "Basierend auf 5 Bestaetigungen, zuletzt vor 3 Tagen"
- Decay Visualisierung:
  - Chart: Confidence ueber Zeit fuer ausgewaehlte Memory
  - Prognose: "Diese Memory wird in ~14 Tagen unter 0.5 fallen"

**Tag 5 (Fr): API Endpoints + Tests**
- Neue Endpoints:
  ```
  GET  /api/:context/memory/graph              - Memory Graph (Nodes + Edges)
  GET  /api/:context/memory/timeline           - Memory Timeline
  GET  /api/:context/memory/:id/confidence     - Confidence History
  GET  /api/:context/memory/stats/insights     - Aggregierte Insights
  ```
- Tests (20+ Tests):
  - Graph Generation (Nodes, Edges, Clusters)
  - Timeline Aggregation
  - Confidence Score Berechnung
  - Decay Prognose
  - Importance Ranking

**Dateien:**
- `backend/src/services/memory/memory-insights.ts` (neu)
- `backend/src/routes/memory-insights.ts` (neu)
- `frontend/src/components/MemoryInsights/MemoryInsights.tsx` (neu)
- `frontend/src/components/MemoryInsights/MemoryGraph.tsx` (neu)
- `frontend/src/components/MemoryInsights/MemoryTimeline.tsx` (neu)
- `frontend/src/components/MemoryInsights/ConfidenceGauge.tsx` (neu)
- `frontend/src/components/MemoryInsights/MemoryInsights.css` (neu)
- `backend/src/__tests__/unit/services/memory-insights.test.ts` (neu)
- `frontend/src/components/__tests__/MemoryInsights.test.tsx` (neu)

---

### Worker 2: Conflict Detection + Curation + Impact Analysis

**Tag 1 (Mo): Memory Conflict Detection**
- `backend/src/services/memory/memory-conflicts.ts` (neu):
  - Widersprueche erkennen:
    ```typescript
    interface MemoryConflict {
      memory1: MemoryNode;
      memory2: MemoryNode;
      type: 'direct_contradiction' | 'temporal_inconsistency' | 'preference_change';
      description: string;
      suggestion: 'keep_newer' | 'keep_higher_confidence' | 'merge' | 'ask_user';
    }
    ```
  - Erkennungsmethoden:
    - Embedding-Similarity + Sentiment-Umkehr → Direct Contradiction
    - Gleicher Fakt mit verschiedenen Werten → Temporal Inconsistency
    - "Ich mag X" vs. "Ich mag X nicht" → Preference Change
  - Automatische Aufloesung fuer eindeutige Faelle (keep_newer bei temporal)

**Tag 2 (Di): User-gesteuerte Memory Curation**
- `frontend/src/components/MemoryInsights/MemoryCuration.tsx` (neu):
  - Memory-Liste mit Aktionen:
    - Bestaetigen (Confidence +0.2)
    - Korrigieren (Inline-Edit, alte Version archiviert)
    - Loeschen (Soft-Delete, 30 Tage Papierkorb)
    - Zusammenfuehren (2 aehnliche Memories → 1)
  - Conflict Resolution UI:
    - Seitliche Darstellung: Memory A vs. Memory B
    - Buttons: "A behalten", "B behalten", "Beide behalten", "Zusammenfuehren"
    - Batch-Resolution: Alle Konflikte nacheinander abarbeiten
- Backend Endpoints:
  ```
  GET    /api/:context/memory/conflicts         - Aktuelle Konflikte
  POST   /api/:context/memory/:id/confirm       - Memory bestaetigen
  PUT    /api/:context/memory/:id/correct        - Memory korrigieren
  DELETE /api/:context/memory/:id                - Memory loeschen
  POST   /api/:context/memory/merge              - Memories zusammenfuehren
  POST   /api/:context/memory/conflicts/:id/resolve - Konflikt aufloesen
  ```

**Tag 3 (Mi): Memory Impact Analysis**
- `backend/src/services/memory/memory-impact.ts` (neu):
  - Welche Memories beeinflussen welche Antworten?
  - Tracking: Bei jedem Chat-Response die verwendeten Memories loggen
    ```typescript
    interface MemoryImpact {
      memoryId: string;
      chatMessageId: string;
      impactType: 'context' | 'fact' | 'preference' | 'style';
      relevanceScore: number;
    }
    ```
  - Aggregation: "Diese Memory hat 15 Antworten beeinflusst"
  - Reverse Lookup: "Diese Antwort basierte auf folgenden Memories"

**Tag 4 (Do): Impact Visualisierung + Integration**
- Frontend Impact Panel:
  - Pro Memory: Liste der beeinflussten Chat-Nachrichten
  - Pro Chat-Nachricht: "Basierend auf:" + Memory-Links
  - Impact Score: Wie stark beeinflusst eine Memory die AI-Antworten?
  - "Wichtigste Memories" Ranking (nach Impact Score)
- Integration in GeneralChat:
  - Kleine Info-Ikone neben AI-Antworten
  - Click → "Diese Antwort basierte auf X Memories"
  - Link zu betroffenen Memories in Memory Insights

**Tag 5 (Fr): Integration + Tests**
- Memory Impact Tracking in Chat-Pipeline integrieren:
  - `backend/src/services/general-chat/` → Impact-Logging nach Response
  - RAG-Pipeline → Verwendete Memories als Metadata
- Navigation Integration:
  - MyAI → "Memory Insights" Tab (neben KI anpassen, KI-Wissen, Sprach-Chat)
  - Alternative: Eigener Sidebar-Eintrag unter "Entdecken"
- CLAUDE.md aktualisieren: Phase 53 Endpoints + Changelog
- Tests (20+ Tests):
  - Conflict Detection (Direct, Temporal, Preference)
  - Conflict Resolution (Auto + Manual)
  - Memory Curation (Confirm, Correct, Delete, Merge)
  - Impact Tracking (Log + Aggregation)
  - Impact Reverse Lookup

**Dateien:**
- `backend/src/services/memory/memory-conflicts.ts` (neu)
- `backend/src/services/memory/memory-impact.ts` (neu)
- `backend/src/routes/memory-insights.ts` (aendern, Conflict + Curation Endpoints)
- `frontend/src/components/MemoryInsights/MemoryCuration.tsx` (neu)
- `frontend/src/components/MemoryInsights/ConflictResolver.tsx` (neu)
- `frontend/src/components/MemoryInsights/ImpactPanel.tsx` (neu)
- `frontend/src/components/GeneralChat/GeneralChat.tsx` (aendern, Impact Info)
- `frontend/src/components/MyAIPage.tsx` (aendern, neuer Tab)
- `backend/src/__tests__/unit/services/memory-conflicts.test.ts` (neu)
- `backend/src/__tests__/unit/services/memory-impact.test.ts` (neu)

**Erfolgskriterien Phase 53:**
- [ ] Memory Graph mit ReactFlow (Nodes, Edges, Cluster)
- [ ] Memory Timeline (chronologisch, filterbar)
- [ ] Confidence Scoring mit Decay-Visualisierung
- [ ] Conflict Detection (3 Typen)
- [ ] User-gesteuerte Curation (Bestaetigen, Korrigieren, Loeschen, Zusammenfuehren)
- [ ] Memory Impact Analysis (welche Memories → welche Antworten)
- [ ] Impact-Info in Chat-Nachrichten
- [ ] 40+ neue Tests

---

## Abhaengigkeiten zwischen Phasen

```
Phase 49: Advanced RAG v2 ─────────────────────────┐
  (baut auf Phase 47 RAG Analytics)                │
                                                    │
Phase 50: Dashboard Analytics v2 ◄─────────────────┤
  (nutzt RAG-Metriken aus Phase 49)                │
  (nutzt Memory-Stats fuer Health Dashboard)        │
                                                    │
Phase 51: Plugin & Extension System                │
  (unabhaengig, eigene Architektur)                │
                                                    │
Phase 52: Multi-Language Support                   │
  (unabhaengig, kann parallel zu 51)               │
                                                    │
Phase 53: AI Memory Insights ◄─────────────────────┘
  (baut auf Phase 49 Citation Tracking)
  (nutzt Phase 50 Memory Health Daten)
  (kann Plugin Extension Points nutzen)
```

## Risiken & Mitigationen

| Risiko | Wahrscheinlichkeit | Mitigation |
|--------|-------------------|------------|
| RAG v2 Retrieval-Qualitaet sinkt | Mittel | A/B-Testing mit altem System, Feature Flag |
| Analytics zu viel DB-Load | Niedrig | Materialized Views, Async Aggregation |
| Plugin Sandbox Sicherheit | Mittel | Strenge Permission-Pruefung, kein Network-Access Default |
| i18n zu viele Strings | Hoch | Prioritaet auf Common + Chat, Rest iterativ |
| Memory Graph zu gross fuer Browser | Niedrig | Pagination, Top-100 Nodes, Lazy Loading |

## Metriken (End of KW 53)

| Metrik | Ziel |
|--------|------|
| Tests gesamt | 3000+ (von 2424) |
| Neue Tests (Phase 49-53) | 190+ |
| TypeScript Errors | 0 |
| Neue Backend Services | 15+ |
| Neue Frontend Komponenten | 20+ |
| Neue API Endpoints | 30+ |
| Neue DB-Tabellen | 10+ |
| Sprachen (i18n) | 4 (DE, EN, FR, ES) |
| Plugin Extension Points | 6 |

---

*Erstellt: 2026-03-09*
*Aktualisiert: 2026-03-09 (korrekte Phasen-Definition)*
*Branch: claude/weeks-49-53-plan-yWF15*
*Phase: 48 → 53 (nach KW 53)*
