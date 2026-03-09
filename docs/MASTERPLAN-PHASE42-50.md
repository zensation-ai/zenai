# ZenAI Masterplan: Phase 42-50

> **Von "KI die hilft wenn man fragt" zu "KI-Teammates die rund um die Uhr arbeiten"**
> Stand: 2026-03-09 | Alexander Bering / ZenSation Enterprise Solutions

---

## Aktueller Stand

| Metrik | Wert |
|--------|------|
| **Code Quality Audit** | 8.9/10 |
| **Backend Tests** | 2385 passed, 0 failed |
| **Frontend Tests** | 548 passed, 0 failed |
| **Route-Dateien** | 50+ Endpoint-Dateien |
| **Services** | 94 Service-Dateien |
| **AI Tools** | 17 integrierte Tools |
| **DB Tabellen** | 40 pro Schema x 4 Schemas |
| **Seiten** | 17 Primary Pages + Sub-Routes |

### Bestehende Bausteine (die wir nutzen)

- **Agent Orchestrator** (`agent-orchestrator.ts`) - Multi-Agent mit Task-Decomposition
- **3 Agent-Rollen**: Researcher (Haiku), Writer (Sonnet), Reviewer (Sonnet)
- **Proactive Engine** - Briefings, Suggestions, Workflow-Patterns
- **Routine Detection** - Zeit-, Sequenz- und Kontext-basierte Muster
- **Workflow Boundary Detector** - CHI 2025 Forschung, optimales Timing
- **Memory Scheduler** - Cron-System ohne externe Dependencies
- **HiMeS 4-Layer Memory** - Working, Episodic, Short-Term, Long-Term
- **Knowledge Graph** - 14 Relationstypen, LLM-Analyse, Suggested Connections

---

## Phase 42: Autonomous Agent Framework (P0 - CRITICAL)

**Ziel:** Persistente Background-Agents die 24/7 laufen, Trigger beobachten und selbstaendig handeln.

### 42.1 Agent Runtime Engine

**Datei:** `backend/src/services/agents/agent-runtime.ts`

```
AgentRuntime
  - Map<string, RunningAgent>     // Aktive Agent-Instanzen
  - startAgent(config)            // Agent starten
  - stopAgent(agentId)            // Agent stoppen
  - getStatus(agentId)            // Status abfragen
  - listRunning()                 // Alle laufenden Agents
  - processEvent(event)           // Event an alle Agents dispatchen
```

**RunningAgent:**
```
{
  id: string
  name: string
  description: string             // Natuerlichsprachliche Beschreibung
  status: 'active' | 'paused' | 'error' | 'stopped'
  triggers: AgentTrigger[]        // Wann reagiert der Agent
  instructions: string            // System-Prompt fuer den Agent
  tools: string[]                 // Welche Tools darf er nutzen
  context: AIContext               // In welchem Kontext arbeitet er
  approvalRequired: boolean       // Braucht er Bestaetigung vor Aktionen
  maxActionsPerDay: number        // Rate Limit
  lastRun: Date | null
  stats: { runsTotal, actionsTotal, tokensUsed }
}
```

### 42.2 Trigger System

**Datei:** `backend/src/services/agents/agent-triggers.ts`

| Trigger-Typ | Beschreibung | Beispiel |
|-------------|-------------|---------|
| `email_received` | Neue Email eingetroffen | "Wenn Email von @kunde.de -> Zusammenfassung + Task erstellen" |
| `task_due` | Aufgabe faellig in X Stunden | "12h vor Deadline -> Erinnerung + Status-Check" |
| `calendar_soon` | Termin in X Minuten | "30min vor Meeting -> Briefing generieren" |
| `schedule` | Cron-Schedule | "Jeden Morgen 7:00 -> Tages-Briefing" |
| `idea_created` | Neue Idee gespeichert | "Bei neuer Idee -> Verbindungen suchen + Research" |
| `webhook` | Externer Webhook | "GitHub Push -> Code-Review erstellen" |
| `pattern_detected` | Routine erkannt | "Freitags 16:00 -> Wochen-Zusammenfassung" |
| `manual` | User-Ausloesung | "User klickt 'Ausfuehren'" |

**Integration mit bestehendem System:**
- `email-webhooks.ts` -> dispatcht `email_received` Events
- `memory-scheduler.ts` -> dispatcht `schedule` Events
- `routine-detection.ts` -> dispatcht `pattern_detected` Events
- `workflow-boundary-detector.ts` -> dispatcht `idea_created` Events

### 42.3 Agent Execution Loop

```
1. Event trifft ein
2. AgentRuntime prueft alle Agents gegen ihre Trigger
3. Matching Agents werden geweckt
4. Agent erhaelt: Event-Daten + Memory-Kontext + Instructions
5. Agent plant Aktionen (LLM-Call)
6. IF approvalRequired: Aktion als Vorschlag speichern -> Notification
7. ELSE: Aktion ausfuehren via Tool-System
8. Ergebnis in Episodic Memory speichern
9. Activity tracken fuer Analytics
10. Notification an User (optional)
```

### 42.4 Agent Builder UI

**Frontend:** `frontend/src/components/AgentBuilderPage/`

```
AgentBuilderPage.tsx
  - AgentList          // Liste aller Agents mit Status
  - AgentEditor        // Agent erstellen/bearbeiten
    - TriggerSelector  // Trigger-Typ + Konfiguration
    - InstructionField // Natuerlichsprachliche Anweisung
    - ToolSelector     // Welche Tools erlaubt
    - SafetySettings   // Approval, Rate Limits
  - AgentMonitor       // Live-Status + Logs
  - AgentTemplates     // Vorgefertigte Agent-Templates
```

**Vorgefertigte Templates:**
1. **Email-Triage Agent** - Sortiert, kategorisiert, erstellt Tasks aus Action Items
2. **Meeting-Prep Agent** - Briefing vor jedem Termin
3. **Research Agent** - Recherchiert neue Ideen automatisch
4. **Daily Briefing Agent** - Morgen-Zusammenfassung
5. **Follow-Up Agent** - Erinnert an offene Aufgaben
6. **Code Review Agent** - Prueft GitHub PRs

### 42.5 Safety & Governance

```
AgentSafety
  - approvalGates: ActionType[]   // Welche Aktionen brauchen Bestaetigung
  - tokenBudget: number           // Max Tokens pro Tag
  - actionBudget: number          // Max Aktionen pro Tag
  - auditLog: AgentAction[]       // Vollstaendiges Audit-Log
  - killSwitch: boolean           // Sofort-Stopp
  - escalation: 'notify' | 'block' | 'ask'  // Bei Unsicherheit
```

### 42.6 DB Migration

```sql
-- agent_definitions (pro Schema)
CREATE TABLE agent_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  instructions TEXT NOT NULL,
  triggers JSONB NOT NULL DEFAULT '[]',
  tools TEXT[] NOT NULL DEFAULT '{}',
  context VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  approval_required BOOLEAN DEFAULT false,
  max_actions_per_day INTEGER DEFAULT 50,
  token_budget_daily INTEGER DEFAULT 100000,
  template_id VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- agent_executions (erweitert bestehende Tabelle)
ALTER TABLE agent_executions ADD COLUMN IF NOT EXISTS
  agent_definition_id UUID REFERENCES agent_definitions(id),
  trigger_type VARCHAR(50),
  trigger_data JSONB,
  actions_taken JSONB DEFAULT '[]',
  approval_status VARCHAR(20) DEFAULT 'auto_approved',
  approved_at TIMESTAMPTZ,
  tokens_used INTEGER DEFAULT 0;

-- agent_action_log (Audit Trail)
CREATE TABLE agent_action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agent_definitions(id),
  execution_id UUID,
  action_type VARCHAR(50) NOT NULL,
  action_input JSONB,
  action_output JSONB,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 42.7 API Endpoints

```
POST   /api/:context/agents                    - Agent erstellen
GET    /api/:context/agents                    - Agents auflisten
GET    /api/:context/agents/:id                - Agent-Details
PUT    /api/:context/agents/:id                - Agent aktualisieren
DELETE /api/:context/agents/:id                - Agent loeschen
POST   /api/:context/agents/:id/start          - Agent starten
POST   /api/:context/agents/:id/stop           - Agent stoppen
GET    /api/:context/agents/:id/logs           - Ausfuehrungs-Logs
GET    /api/:context/agents/:id/stats          - Agent-Statistiken
POST   /api/:context/agents/:id/approve/:execId - Aktion genehmigen
POST   /api/:context/agents/:id/reject/:execId  - Aktion ablehnen
GET    /api/:context/agents/templates          - Verfuegbare Templates
POST   /api/:context/agents/from-template      - Agent aus Template erstellen
```

---

## Phase 43: GraphRAG + Smart Email (P1 Quick Wins)

### 43.1 GraphRAG Integration

**Ziel:** Knowledge Graph und RAG zu einem System verbinden.

**Aenderungen:**
- `enhanced-rag.ts` erweitern: Vor Vector-Search den Knowledge Graph traversieren
- Graph-Context als zusaetzliches Signal im Re-Ranking nutzen
- Multi-Hop-Ergebnisse in RAG-Results einbeziehen

```
GraphRAG Pipeline:
1. Query analysieren
2. Knowledge Graph: relevante Entities + Relationen finden
3. Graph-Kontext extrahieren (verbundene Ideen, Beziehungstypen)
4. HyDE + Vector Search (wie bisher)
5. Graph-basiertes Re-Ranking: Ideen mit Graph-Naehe bevorzugen
6. Cross-Encoder Re-Ranking (wie bisher)
7. Ergebnisse mit Graph-Kontext anreichern
```

**Dateien:**
- `backend/src/services/graph-rag.ts` (NEU) - GraphRAG Orchestrator
- `backend/src/services/enhanced-rag.ts` - Integration Point
- `backend/src/services/knowledge-graph/graph-core.ts` - getSuggestedConnections nutzen

### 43.2 Auto Email Summarize

**Ziel:** Jeder Email-Thread bekommt automatisch eine KI-Zusammenfassung.

**Aenderungen:**
- `email-ai.ts` erweitern: `autoSummarizeThread(context, threadId)`
- Bei jeder neuen Email im Thread: Summary aktualisieren
- Summary in `emails.ai_summary` Spalte speichern
- Frontend: Summary ueber jeder Konversation anzeigen

### 43.3 Ask My Inbox

**Ziel:** "Was hat Sarah ueber das Q3 Budget gesagt?"

**Aenderungen:**
- `backend/src/services/email-search.ts` (NEU) - Natuerlichsprachliche Email-Suche
- RAG-Pipeline auf Email-Inhalte anwenden
- Als Chat-Tool registrieren: `ask_inbox`

### 43.4 Personal Voice Model

**Ziel:** KI schreibt im Stil des Users.

**Aenderungen:**
- `backend/src/services/voice-profile.ts` (NEU) - Schreibstil-Analyse
- Analysiert: gesendete Emails, Chat-Nachrichten, Notizen
- Extrahiert: Satzlaenge, Formalitaet, Vokabular, Gruesse, Emojis
- Speichert als Style-Profile in Long-Term Memory
- Injiziert in alle Draft-Generation System-Prompts

---

## Phase 44: MCP Ecosystem (P1)

### 44.1 MCP Server Expansion

**Ziel:** Alle 17+ Tools ueber MCP verfuegbar machen.

**Aenderungen an `backend/src/mcp/server.ts`:**
- Bestehend: create_idea, search_ideas, get_suggestions, chat, get_related_ideas (5)
- Neu: web_search, fetch_url, execute_code, github_search, github_create_issue, github_repo_info, analyze_project, get_project_summary, ask_inbox, create_task, create_event, send_email (12+)

### 44.2 MCP Client

**Ziel:** ZenAI kann externe MCP Server anbinden.

**Neue Dateien:**
- `backend/src/services/mcp-client.ts` - MCP Client SDK Integration
- `backend/src/routes/mcp-connections.ts` - CRUD fuer MCP-Verbindungen
- `frontend/src/components/MCPConnectionsPage.tsx` - UI fuer MCP-Verwaltung

**Unterstuetzte externe MCP Server:**
- GitHub (Repos, Issues, PRs)
- Slack (Messages, Channels)
- Google Drive (Docs, Sheets)
- Linear (Issues, Projects)
- Notion (Databases, Pages)

---

## Phase 45: Life OS Completion (P2)

### 45.1 Push Proactive AI

**Ziel:** Proaktive Vorschlaege als Web Push Notifications.

**Aenderungen:**
- `proactive-suggestions.ts` -> Notification-System anbinden
- `push-notifications.ts` erweitern um Proactive-Kategorie
- Trigger: Meeting-Prep, Ueberfaellige Tasks, Wichtige Emails
- Smart Frequency: Max 5/Tag, Quiet Hours respektieren

### 45.2 Habits & Streaks

**DB Migration:**
```sql
CREATE TABLE habits (
  id UUID PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  frequency VARCHAR(20) NOT NULL, -- daily, weekly, custom
  frequency_config JSONB,          -- { days: [1,3,5] } etc.
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  total_completions INTEGER DEFAULT 0,
  last_completed_at TIMESTAMPTZ,
  context VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE habit_completions (
  id UUID PRIMARY KEY,
  habit_id UUID REFERENCES habits(id),
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);
```

**API:**
```
GET    /api/:context/habits           - Liste
POST   /api/:context/habits           - Erstellen
PUT    /api/:context/habits/:id       - Aktualisieren
DELETE /api/:context/habits/:id       - Loeschen
POST   /api/:context/habits/:id/complete - Abschliessen
GET    /api/:context/habits/streaks   - Streak-Uebersicht
```

### 45.3 Gamification Layer

```sql
CREATE TABLE user_xp (
  id UUID PRIMARY KEY,
  context VARCHAR(20) NOT NULL,
  total_xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  streak_days INTEGER DEFAULT 0,
  badges JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**XP-Quellen:**
- Idea erstellt: 10 XP
- Task erledigt: 20 XP
- Habit completed: 15 XP
- Streak-Bonus: streak_days * 5 XP
- Learning abgeschlossen: 25 XP
- Agent erstellt: 50 XP

### 45.4 Health Metrics

```sql
CREATE TABLE health_metrics (
  id UUID PRIMARY KEY,
  metric_type VARCHAR(50) NOT NULL, -- sleep, exercise, mood, weight, water
  value NUMERIC NOT NULL,
  unit VARCHAR(20),
  notes TEXT,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  context VARCHAR(20) DEFAULT 'personal'
);
```

### 45.5 Emotionale Intelligenz

**Datei:** `backend/src/services/emotion-detector.ts`
- Text-basierter Emotion-Classifier auf jede User-Message
- Erkennt: Frustration, Verwirrung, Begeisterung, Dringlichkeit, Neutralitaet
- Passt System-Prompt dynamisch an (kuerzere Antworten bei Frustration, Schritt-fuer-Schritt bei Verwirrung)
- Speichert emotionale Arc in Episodic Memory

---

## Phase 46-50: Langfristige Vision

### Phase 46: Multi-User & Teams
- WebSocket-Server fuer Real-Time Presence
- User/Team/Organization Model
- CRDT fuer Canvas Collaborative Editing
- Team-Agents die workspace-uebergreifend arbeiten

### Phase 47: Ambient Context
- Browser-Extension fuer Tab-Capture
- Electron Desktop Companion fuer Screen-Capture
- Automatische Indexierung in Screen Memory
- "Was habe ich gestern gesehen?" Suche

### Phase 48: Advanced Agent Capabilities
- Agent-zu-Agent Kommunikation (A2A Protokoll)
- Agent-Learning aus Feedback (Reinforcement)
- Agent-Marketplace (Community-Templates)
- Cross-Context Agent Collaboration

### Phase 49: Enterprise Features
- SSO/SAML Integration
- Compliance Dashboard
- Data Residency Options
- SLA Monitoring
- White-Label Option

### Phase 50: Intelligence Layer
- Predictive Analytics (was wird der User als naechstes brauchen)
- Autonomous Goal Planning (Agent setzt sich eigene Ziele)
- Multi-Modal Input (Video-Analyse, Audio-Streams)
- Computer Use Agent (wenn Technologie reif)

---

## Implementierungs-Reihenfolge (diese Session)

| # | Task | Aufwand | Dateien |
|---|------|---------|---------|
| 1 | GraphRAG Service | S | graph-rag.ts (NEU), enhanced-rag.ts |
| 2 | Push Proactive Notifications | S | proactive-suggestions.ts, push-notifications.ts |
| 3 | Agent Runtime Engine | M | agent-runtime.ts, agent-triggers.ts (NEU) |
| 4 | Agent DB Migration | S | phase42_agents.sql (NEU) |
| 5 | Agent API Routes | M | agents.ts (NEU Route) |
| 6 | Agent Templates | S | agent-templates.ts (NEU) |
| 7 | Tests | M | agent-runtime.test.ts, graph-rag.test.ts |

---

*ZenAI - Enterprise AI Platform*
*Copyright 2026 Alexander Bering / ZenSation Enterprise Solutions*
