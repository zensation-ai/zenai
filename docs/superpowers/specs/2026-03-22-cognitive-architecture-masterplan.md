# ZenAI Cognitive Architecture Masterplan

> **Von Phase 125 bis 140+ — Der Weg zur kognitiven KI**
> Erstellt: 2026-03-22 | Autor: Claude + Alexander Bering
> Status: DESIGN — Awaiting Approval

---

## Executive Summary

ZenAI transformiert sich von einem LLM-Wrapper mit Datenbank zu einer **kognitiven Architektur** — einem System das kumulativ lernt, antizipiert, seine eigenen Grenzen kennt und autonom handelt.

**Alles ohne eigene Modelle.** Claude API bleibt die zentrale Intelligenz. Was wir bauen ist die *Orchestrierungsschicht* — das Nervensystem um das Gehirn (Claude) herum.

### Architektur-Prinzip

```
┌─────────────────────────────────────────────────┐
│           META-KOGNITION (Saule 6)              │
│   Selbstbeobachtung, Kalibrierung, Grenzen      │
├────────────┬────────────┬───────────────────────┤
│ NEUGIER(5) │ AGENTEN(3) │   OUTPUT (4)          │
│ Hypothesen │ Autonom    │ Docs, CLI, Code       │
│ Luecken    │ Persistent │ PowerPoint, Excel     │
│ Exploration│ Debatte    │ Terminal-Agent         │
├────────────┴────────────┴───────────────────────┤
│           REASONING ENGINE (Saule 2)            │
│  Vor/Nach-Claude-Logik, Faktencheck, GWT        │
├─────────────────────────────────────────────────┤
│           DEEP MEMORY (Saule 1)                 │
│  Hebbian, FSRS, Bayesian, Cross-Context         │
└─────────────────────────────────────────────────┘
```

**Bottom-Up:** Jede Schicht baut auf der darunter auf. Memory ist das Fundament.
**Parallel:** In jeder Phase wird die primaere Saeule vertieft + sekundaere Saeulen bekommen Verbesserungen.

### Forschungsgrundlage

| Konzept | Quelle | Anwendung in ZenAI |
|---------|--------|---------------------|
| Hebbian Learning | MuninnDB, Hebbian-Mind MCP | Knowledge Graph Co-Aktivierung |
| FSRS Algorithm | Open Spaced Repetition Project | Ersetzt SM-2 fuer Memory Decay |
| Bayesian Belief Propagation | Pearl (1982), pybbn | Confidence durch Knowledge Graph |
| Global Workspace Theory | Baars (1988), Frontiers 2024 | Kompetitives Context Assembly |
| Intrinsic Curiosity Module | Pathak et al. 2017, arxiv 2505.17621 | Knowledge Gap Detection |
| Active Inference | Friston, pymdp | Prediction Error als Neugier-Signal |
| Letta/MemGPT v2 | Letta Docs 2026 | Pinned Core Memory Blocks |
| FSRS | Jarrett Ye, open-spaced-repetition | 20-30% weniger Reviews als SM-2 |
| Metacognitive Monitoring | Steyvers & Peters 2025, ReMA NeurIPS 2025 | Calibration + Confusion Detection |
| Context Engineering | Anthropic 2025 (Write/Select/Compress/Isolate) | Agent Context Isolation |

---

## Phase 125: Hebbian Knowledge Graph + FSRS Memory

> **Primaer:** Memory (Saeule 1)
> **Sekundaer:** Reasoning (Confidence Propagation)
> **Geschaetzte Dauer:** 1 Session (4-6h)

### Ziel
Das Knowledge Graph wird neuronal — Verbindungen staerken sich durch Nutzung, schwaechen sich durch Vernachlaessigung. SM-2 Spaced Repetition wird durch den modernen FSRS-Algorithmus ersetzt.

### 125.1: Hebbian Edge Dynamics

**Datei:** `backend/src/services/knowledge-graph/hebbian-dynamics.ts` (NEU)

**Algorithmus — Asymptotische Hebbian-Saettigung (inspiriert von Oja's Normalisierungsprinzip):**
```
new_weight = old_weight + LEARNING_RATE * (1 - old_weight / MAX_WEIGHT)
```
> Hinweis: Dies ist eine logistische Saettigungsformel, nicht Oja's Rule im strengen Sinne
> (die `Δw = η * x * (y - w*x)` lautet). Wir verwenden das Normalisierungsprinzip
> (asymptotischer Cap bei MAX_WEIGHT) aus Oja's Arbeit, nicht die exakte Formel.
- `LEARNING_RATE = 0.1` (konfigurierbar)
- `MAX_WEIGHT = 10.0` (asymptotische Grenze)
- Diminishing Returns: Starke Verbindungen wachsen langsamer

**Co-Aktivierungs-Tracking:**
- Bei jeder Query: Welche Entities erscheinen zusammen in Retrieval-Ergebnissen?
- Bei jeder Antwort: Welche Entities werden gemeinsam in der Antwort referenziert?
- Speicherung: `entity_coactivations` Tabelle (entity_a_id, entity_b_id, count, last_coactivated)
- Post-Query-Hook: `recordCoactivation(entityIds[])` — inkrementiert Count + staerkt Edge via Oja's Rule

**Time-basierter Decay:**
- BullMQ Scheduled Job: taeglich `hebbian-decay` Queue
- Formel: `new_weight = weight * (1 - DECAY_RATE)` mit `DECAY_RATE = 0.02` (2% pro Tag)
- Edges unter `MIN_WEIGHT = 0.1` werden geloescht (Pruning)

**Homoeoestatische Normalisierung:**
- Pro Entity: Summe aller ausgehenden Edge-Weights wird auf `TARGET_SUM = 50.0` normalisiert
- Verhindert dass populaere Entities den Graph dominieren
- Laeuft als Teil des taetiglichen Decay-Jobs

**Anti-Hebbian Komponente:**
- Entities die haeufig einzeln aktiviert werden OHNE gemeinsame Aktivierung: Edge-Weight sinkt schneller
- Formel: Wenn Entity A in 10 Queries vorkommt aber nur 1x mit Entity B → Anti-Hebbian Penalty auf A-B Edge

**DB-Migration:** `phase125_hebbian.sql`
```sql
-- Pro Schema (personal, work, learning, creative):
ALTER TABLE {schema}.entity_relations
  ADD COLUMN IF NOT EXISTS hebbian_weight FLOAT DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS coactivation_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_coactivated TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS {schema}.entity_coactivations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_a_id UUID NOT NULL,
  entity_b_id UUID NOT NULL,
  coactivation_count INTEGER DEFAULT 1,
  last_coactivated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_a_id, entity_b_id)
);
CREATE INDEX idx_coactivations_entities ON {schema}.entity_coactivations(entity_a_id, entity_b_id);
```

### 125.2: FSRS Spaced Repetition (ersetzt SM-2)

**Datei:** `backend/src/services/memory/fsrs-scheduler.ts` (NEU, ersetzt Ebbinghaus-Logik in `ebbinghaus-decay.ts`)

**FSRS-Kernmodell (3 Variablen pro Fakt):**
- **Difficulty (D):** Intrinsische Schwierigkeit, 0-10 Skala. Initial: 5.0. Update nach jedem Recall.
- **Stability (S):** Speicherstaerke (wie langsam die Erinnerung verfaellt). Hoeheres S = langsamerer Verfall.
- **Retrievability (R):** Aktuelle Abrufwahrscheinlichkeit: `R = e^(-t/S)` wobei t = Zeit seit letztem Review.

**Scheduling-Algorithmus:**
```
Naechster Review wenn R < TARGET_RETENTION (Default: 0.9)
→ t_next = -S * ln(TARGET_RETENTION)
```
Beispiel: S=10 Tage, Target=0.9 → naechster Review in ~1.05 Tagen

**Parameter-Update nach Recall-Event:**
```
Erfolgreicher Recall:
  S_new = S * (1 + e^(Difficulty) * (11 - D) * S^(-0.2) * (e^(0.3 * (1-R)) - 1))
  D_new = D - 0.1 * (Grade - 3)  // Grade 1-5, 3 = neutral

Fehlgeschlagener Recall (RAG-Miss bei bekanntem Thema):
  S_new = S * max(0.5, 0.2 * D^(-0.4) * (S + 1)^(0.2) * (e^(0.02 * (1-R)) - 1))
  D_new = D + 0.1
```

**Integration mit bestehendem System:**
- `learned_facts` bekommt 3 neue Spalten: `fsrs_difficulty`, `fsrs_stability`, `fsrs_next_review`
- Sleep Compute (Phase 63): Verwendet FSRS statt Ebbinghaus fuer Pre-Loading-Entscheidungen
- Retrieval-Events: Jede erfolgreiche Fact-Nutzung in RAG = "successful recall" → Update S, D

**SM-2 → FSRS Migrations-Formel (fuer bestehende Fakten):**
```
// Bestehende SM-2 stability (in Tagen, Range 0.1-365) → FSRS-Variablen:
fsrs_stability = existing_stability  // Direkte Uebernahme (gleiche Einheit)
fsrs_difficulty = 10 - (existing_stability / 365 * 8)  // Hohe Stability → niedrige Difficulty
                                                       // Range: 2.0 (sehr stabil) bis 10.0 (fragil)
fsrs_next_review = NOW() + INTERVAL (fsrs_stability * ln(1/0.9)) days
                                                       // Naechster Review basierend auf Target 0.9

// Fakten ohne SM-2 Daten (stability IS NULL):
fsrs_stability = 1.0     // Default: 1 Tag
fsrs_difficulty = 5.0    // Default: mittel
fsrs_next_review = NOW() // Sofort schedulen
```

**Caller-Migration fuer ebbinghaus-decay.ts:**
- `long-term-memory.ts` importiert `updateStability()` → wird auf `fsrs-scheduler.updateFSRSState()` umgeleitet
- `ltm-consolidation.ts` importiert `getRetentionProbability()` → wird auf `fsrs-scheduler.getRetrievability()` umgeleitet
- `sleep-compute.ts` Worker → direkt auf FSRS umgestellt
- `ebbinghaus-decay.ts` bleibt als Thin Wrapper (deprecated) fuer 1 Phase, wird in Phase 126 entfernt

**Recall-Event-Erkennung:**
- **Instrumentierung:** Post-Response-Hook in `streaming.ts` (nach `content_block_stop` Event)
- **Erfolg:** Fakt wird von RAG retrieved UND im Claude-Response referenziert (Entity-Match-Pruefung)
- **Fehler:** User fragt nach Thema X, Fakt zu X existiert, wurde aber NICHT retrieved (RAG-Miss)
- **Partial:** Fakt retrieved aber nicht in Antwort genutzt (passiver Recall)
- **Datei fuer Hook:** Aenderung in `backend/src/services/claude/streaming.ts` (Post-Response Recall Tracker)

**DB-Migration (Teil von `phase125_hebbian.sql`):**
```sql
ALTER TABLE {schema}.learned_facts
  ADD COLUMN IF NOT EXISTS fsrs_difficulty FLOAT DEFAULT 5.0,
  ADD COLUMN IF NOT EXISTS fsrs_stability FLOAT DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS fsrs_next_review TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX idx_facts_next_review ON {schema}.learned_facts(fsrs_next_review)
  WHERE is_active = true;
```

### 125.3: Bayesian Confidence Propagation

**Datei:** `backend/src/services/knowledge-graph/confidence-propagation.ts` (NEU)

**Algorithmus (Pearl's Belief Propagation, vereinfacht):**

Jeder Fakt hat eine `base_confidence` (aus Quellenzuverlaessigkeit, Haeufigkeit, Aktualitaet).

Propagation ueber Edges (alle 8 Relation-Typen):
```
supports:       P(B|A) = P(B_base) + w * P(A) * (1 - P(B_base))       // Staerkung
contradicts:    P(B|A) = P(B_base) * (1 - w * P(A))                    // Schwaechung
causes:         P(B|A) = P(B_base) + w * P(A) * 0.8 * (1 - P(B_base)) // Starke Staerkung (kausaler Link)
requires:       P(B|A) = P(B_base) + w * P(A) * 0.6 * (1 - P(B_base)) // Moderate Staerkung (Voraussetzung)
part_of:        P(B|A) = P(B_base) + w * P(A) * 0.3 * (1 - P(B_base)) // Schwache Staerkung (Teil-Ganzes)
similar_to:     P(B|A) = P(B_base) + w * P(A) * 0.2 * (1 - P(B_base)) // Minimale Staerkung (Aehnlichkeit)
created_by:     // Keine Confidence-Propagation (Autoren-Info, nicht epistemisch)
used_by:        // Keine Confidence-Propagation (Nutzungs-Info, nicht epistemisch)

Multiple Quellen (Log-Odds Addition fuer supports/contradicts):
  L(B) = log(P(B_base) / (1-P(B_base))) + SUM(log(w_i * P(A_i) / (1 - w_i * P(A_i))))
  P(B_final) = sigmoid(L(B))
```

**Ausführung:**
- Iterativ: Max 3 Passes ueber den Graph (konvergiert bei kleinen Graphen)
- Damping: `update = 0.7 * new + 0.3 * old` fuer Stabilitaet bei Zyklen
- Trigger: Nach jedem Fakt-Insert/Update + als Teil von Sleep Compute
- Cache: Propagierte Confidence wird auf Fakten gespeichert (nicht bei jeder Query neu berechnet)

**DB-Migration:**
```sql
ALTER TABLE {schema}.learned_facts
  ADD COLUMN IF NOT EXISTS propagated_confidence FLOAT,
  ADD COLUMN IF NOT EXISTS confidence_sources JSONB DEFAULT '[]';
```

### 125.4: Sekundaer-Verbesserungen

**Reasoning (Saeule 2):**
- Propagierte Confidence fliesst in RAG-Scoring ein: `final_score = rag_score * 0.7 + propagated_confidence * 0.3`
- ConfidenceBadge (Frontend) zeigt jetzt propagierte statt nur RAG-Confidence

**Agenten (Saeule 3):**
- Agent Orchestrator bekommt `hebbianBoost`: Wenn Agent A und Agent B oft zusammen erfolgreich sind, werden sie haeufiger als Team eingesetzt

### Neue Dateien Phase 125
| Datei | LOC (geschaetzt) | Zweck |
|-------|-------------------|-------|
| `backend/src/services/knowledge-graph/hebbian-dynamics.ts` | ~250 | Hebbian Edge Strengthening + Decay + Normalization |
| `backend/src/services/memory/fsrs-scheduler.ts` | ~200 | FSRS Algorithm (Difficulty, Stability, Retrievability) |
| `backend/src/services/knowledge-graph/confidence-propagation.ts` | ~180 | Bayesian Belief Propagation |
| `backend/sql/migrations/phase125_hebbian.sql` | ~60 | DB-Migration (3 ALTERs + 1 CREATE pro Schema) |
| Tests: 3 Test-Dateien | ~300 | Hebbian + FSRS + Bayesian Tests |

### Aenderungen an bestehenden Dateien
| Datei | Aenderung |
|-------|-----------|
| `enhanced-rag.ts` | Propagated confidence in scoring |
| `sleep-compute.ts` | FSRS statt Ebbinghaus fuer Pre-Loading |
| `ebbinghaus-decay.ts` | Deprecation-Marker, Thin Wrapper delegiert an FSRS |
| `long-term-memory.ts` | Import-Umleitung: `updateStability()` → `fsrs-scheduler.updateFSRSState()` |
| `ltm-consolidation.ts` | Import-Umleitung: `getRetentionProbability()` → `fsrs-scheduler.getRetrievability()` |
| `streaming.ts` | Post-Response Recall-Event Hook (Erfolg/Fehler/Partial Detection) |
| `hybrid-retriever.ts` | Hebbian weights in graph traversal |
| `graph-builder.ts` | Co-activation tracking nach Entity-Extraktion |
| `workers.ts` | `hebbian-decay` Queue + Worker |
| `job-queue.ts` | Neue Queue registrieren |

### Tests (geschaetzt: ~80)
- Hebbian: Co-activation, Oja's Rule, Decay, Normalization, Anti-Hebbian, Pruning (25)
- FSRS: Scheduling, Parameter-Update, Migration von SM-2, Recall-Events (25)
- Bayesian: Propagation, Damping, Multiple Sources, Contradictions (20)
- Integration: RAG mit Hebbian+FSRS+Bayesian (10)

---

## Phase 126: Pinned Core Memory + Cross-Context Merging

> **Primaer:** Memory (Saeule 1)
> **Sekundaer:** Agenten (Shared Memory Upgrade)
> **Geschaetzte Dauer:** 1 Session (4-6h)

### Ziel
Letta/MemGPT-Muster: Strukturierte Speicherbloecke die IMMER im Claude-Kontext sind. Plus: Fakten die in mehreren Kontexten existieren werden zusammengefuehrt.

### 126.1: Pinned Core Memory Blocks

**Konzept (aus Letta-Forschung):**
Statt dynamisches Context Assembly pro Query → fixe, immer-sichtbare Memory-Bloecke die der Agent selbst editiert.

**Datei:** `backend/src/services/memory/core-memory.ts` (NEU)

**Block-Typen:**
```typescript
interface CoreMemoryBlock {
  id: string;
  blockType: 'user_profile' | 'current_goals' | 'preferences' | 'working_context';
  content: string;        // Max 2000 chars pro Block
  lastUpdated: Date;
  updatedBy: 'user' | 'agent' | 'system';
  version: number;
}
```

**4 Standard-Bloecke (immer im System-Prompt):**

1. **user_profile** (~500 chars): Wer ist der User? Rolle, Expertise, Kommunikationsstil.
   - Initial: Leer. Wird durch Interaktion gefuellt.
   - Agent-Tool: `core_memory_update('user_profile', 'neuer Inhalt')`

2. **current_goals** (~500 chars): Was arbeitet der User gerade? Aktive Projekte, Deadlines.
   - Automatisch aus Tasks + Calendar befuellt
   - Agent kann manuell aktualisieren

3. **preferences** (~500 chars): Wie will der User angesprochen werden? Sprache, Detailgrad, Formalitaet.
   - Lernt aus Feedback (Phase 100 memory_self_editing)
   - Persistiert in DB

4. **working_context** (~500 chars): Aktueller Gespraechsfokus. Was wurde gerade besprochen?
   - Automatisch aus letzten 3 Messages extrahiert
   - Ersetzt teils Working Memory Slots

**Token-Budget:** 4 Bloecke x ~150 Tokens = ~600 Tokens. Fest reserviert im System-Prompt.

**Warum besser als aktuelles Working Memory:**
- Working Memory hat 7 Slots mit Activation-Decay → komplexe Verwaltung, aber Bloecke koennen "rausfallen"
- Core Memory ist IMMER da → Claude vergisst nie wer der User ist, selbst bei langen Sessions
- Working Memory bleibt fuer kurzfristige Task-Informationen (komplementaer, nicht ersetzend)

**Integration in Streaming Pipeline:**
```
System Prompt = [
  CORE_MEMORY_BLOCKS (600 Tokens, IMMER),
  Working Memory Slots (dynamisch),
  Context Engine V2 Output (dynamisch),
  RAG Results (dynamisch),
  Chat History (Rest)
]
```

**Konkreter Injektionspunkt:**
- `backend/src/services/claude/streaming.ts` → `buildSystemPrompt()` oder aequivalente Funktion
- `backend/src/utils/token-budget.ts` → `assembleContextWithBudget()` bekommt neuen Parameter `coreMemoryBlocks`
- Core Memory Blocks werden VOR dem dynamischen Budget-Allocation eingefuegt (reservierte 600 Tokens)
- `backend/src/routes/general-chat.ts` → Core Memory Blocks laden via `getCoreMemoryBlocks(userId, context)`

**Neue Tools fuer Claude:**
- `core_memory_read(block_type)` — Aktuellen Inhalt eines Blocks lesen
- `core_memory_update(block_type, new_content)` — Block-Inhalt ersetzen (mit Versionierung)
- `core_memory_append(block_type, text)` — Text an Block anhaengen

**DB-Migration:**
```sql
CREATE TABLE IF NOT EXISTS {schema}.core_memory_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  block_type VARCHAR(50) NOT NULL,
  content TEXT DEFAULT '',
  version INTEGER DEFAULT 1,
  updated_by VARCHAR(20) DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, block_type)
);
```

### 126.2: Cross-Context Entity Merging

**Problem:** "Claude" in `personal` und "Claude" in `work` sind dasselbe Entity, werden aber getrennt gespeichert. Der User erwaehnt seinen Chef "Michael" in `personal` (als Freund) und `work` (als Vorgesetzter) — das System erkennt nicht dass es dieselbe Person ist.

**Datei:** `backend/src/services/memory/cross-context-merger.ts` (NEU)

**Algorithmus:**
1. **Candidate Detection:** Embedding-Similarity > 0.88 UND Name-Overlap > 80% ueber Context-Grenzen
2. **Merge-Score:** `similarity * 0.5 + name_overlap * 0.3 + temporal_proximity * 0.2`
3. **Merge-Typen:**
   - **Hard Merge** (Score > 0.95): Automatisch — gleiche Entity, verschiedene Aspekte
   - **Soft Merge** (Score 0.85-0.95): Vorschlag an User via Smart Suggestion
   - **Ignore** (Score < 0.85): Wahrscheinlich verschiedene Entities

**Cross-Context Links:**
```sql
CREATE TABLE public.cross_context_entity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_context VARCHAR(20) NOT NULL,
  source_entity_id UUID NOT NULL,
  target_context VARCHAR(20) NOT NULL,
  target_entity_id UUID NOT NULL,
  merge_type VARCHAR(20) DEFAULT 'soft', -- hard, soft
  merge_score FLOAT,
  confirmed_by VARCHAR(20), -- user, system
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Nutzung:** Wenn User in `work` nach "Michael" fragt, werden auch `personal`-Fakten ueber Michael geladen (mit niedrigerer Prioritaet). Core Memory Block `user_profile` enthaelt cross-context Wissen.

### 126.3: Sekundaer-Verbesserungen

**Agenten (Saeule 3):**
- Shared Memory bekommt Core Memory Blocks: Jeder Agent im Team sieht dieselben Bloecke
- Agent-spezifische Blocks: Researcher bekommt `research_findings` Block, Writer bekommt `draft_outline` Block

**Output (Saeule 4):**
- Core Memory `preferences` Block speichert Dokumenten-Praeferenzen (Sprache, Formalitaet, Format)

### Neue Dateien Phase 126
| Datei | LOC (geschaetzt) | Zweck |
|-------|-------------------|-------|
| `backend/src/services/memory/core-memory.ts` | ~300 | Core Memory CRUD + Tool-Definitions |
| `backend/src/services/memory/cross-context-merger.ts` | ~250 | Cross-Context Entity Detection + Linking |
| `backend/sql/migrations/phase126_core_memory.sql` | ~40 | core_memory_blocks + cross_context_entity_links |
| Tests: 2 Dateien | ~200 | Core Memory + Cross-Context Tests |

### Tests (geschaetzt: ~60)
- Core Memory: CRUD, Versionierung, Token-Limit, Tool-Integration (20)
- Cross-Context: Candidate Detection, Merge-Scoring, Hard/Soft Merge, Retrieval (25)
- Integration: Core Memory in Streaming Pipeline, Agent Shared Memory (15)

---

## Phase 127: Global Workspace Theory — Kompetitives Context Assembly

> **Primaer:** Reasoning (Saeule 2)
> **Sekundaer:** Memory (Salience Scoring), Meta-Kognition (erste Signale)
> **Geschaetzte Dauer:** 1 Session (4-6h)

### Ziel
Aktuell: Context Assembly ist linear — IMMER Working Memory + IMMER RAG + IMMER Procedures. Das ist ineffizient und verschwendet Tokens.

Neu: **Kompetitives Context Assembly** nach Global Workspace Theory. Subsysteme "bewerben" sich um Platz im Claude-Kontext. Nur die relevantesten gewinnen.

### 127.1: Salience-basiertes Module System

**Datei:** `backend/src/services/reasoning/global-workspace.ts` (NEU)

**Konzept:**
Jedes Memory/Reasoning-Subsystem ist ein "Spezialist-Modul" das eine Salience-Score fuer die aktuelle Query berechnet. Nur die Top-K Module bekommen Token-Budget.

**Module (8 Spezialisten):**
```typescript
interface WorkspaceModule {
  id: string;
  name: string;
  computeSalience(query: string, context: QueryContext): Promise<SalienceResult>;
  generateContent(query: string, tokenBudget: number): Promise<ModuleContent>;
  updateFromBroadcast(broadcastContent: BroadcastContent): Promise<void>;
}

interface SalienceResult {
  score: number;       // 0-1, wie relevant ist dieses Modul fuer die Query?
  confidence: number;  // 0-1, wie sicher ist das Modul ueber seine Relevanz?
  reasoning: string;   // Kurze Begruendung (fuer Debugging)
  estimatedTokens: number; // Wieviele Tokens wuerde der Content brauchen?
}
```

**Die 8 Module:**

| # | Modul | Was es liefert | Wann hohe Salience |
|---|-------|---------------|-------------------|
| 1 | WorkingMemoryModule | Aktive Slots | Immer mittel-hoch (aktiver Fokus) |
| 2 | CoreMemoryModule | Pinned Blocks | Immer hoch (User-Profil) |
| 3 | LongTermFactsModule | Relevante Fakten | Query matched bekannte Fakten |
| 4 | EpisodicMemoryModule | Vergangene Erfahrungen | User referenziert Vergangenes |
| 5 | RAGModule | Dokumenten-Chunks | Wissens-/Recherche-Fragen |
| 6 | ProceduralMemoryModule | How-To Sequenzen | User will etwas TUN |
| 7 | KnowledgeGraphModule | Entities + Relations | Konzeptuelle/relationale Fragen |
| 8 | CalendarContextModule | Termine + Tasks | Zeitbezogene Fragen |

**Selection-Broadcast-Zyklus:**

```
1. Query kommt rein
2. Alle 8 Module berechnen Salience PARALLEL (Promise.all, 2s Timeout)
3. Module werden nach Salience sortiert
4. Token-Budget wird Top-Down verteilt:
   - CoreMemory: IMMER (600 Tokens, reserviert)
   - Top 3-4 Module: Bekommen restliches Budget (nach Score gewichtet)
   - Rest: Bekommt nichts (spart Tokens)
5. Gewinner-Module generieren Content
6. Content wird an Claude gesendet
7. Nach Antwort: Broadcast an ALLE Module (auch Verlierer)
   → Module updaten ihren internen State basierend auf der Antwort
```

**Salience-Berechnung (pro Modul verschieden):**

Beispiel LongTermFactsModule:
```typescript
async computeSalience(query: string, context: QueryContext): Promise<SalienceResult> {
  // 1. Schnelle Keyword-Suche (BM25) — kein LLM-Call!
  const keywordHits = await bm25Search(query, context.aiContext, 5);

  // 2. Embedding-Similarity der Top-Hits
  const avgSimilarity = keywordHits.length > 0
    ? keywordHits.reduce((s, h) => s + h.score, 0) / keywordHits.length
    : 0;

  // 3. Salience = gewichtete Kombination
  const score = Math.min(1,
    avgSimilarity * 0.6 +
    (keywordHits.length / 5) * 0.3 +
    (context.recentFactUsage > 0 ? 0.1 : 0)
  );

  return { score, confidence: 0.8, reasoning: `${keywordHits.length} matching facts`, estimatedTokens: keywordHits.length * 80 };
}
```

**Warum besser als aktuelles System:**
- Aktuell: Context Engine V2 verwendet fixe Budget-Allokationen (system 2K, WM 2K, facts 3K, RAG 8K)
- Neu: Budget wird dynamisch nach Query-Relevanz verteilt
- Effekt: Finance-Fragen bekommen mehr Fakten, Code-Fragen mehr RAG, persoenliche Fragen mehr Episodic Memory
- Token-Einsparung: ~20-30% weniger Tokens bei gleicher Qualitaet (irrelevante Module werden ausgelassen)

### 127.2: Pre-Reasoning Query Analysis

**Datei:** `backend/src/services/reasoning/query-analyzer.ts` (NEU)

**Zweck:** BEVOR Claude aufgerufen wird, analysiert eine leichtgewichtige Schicht die Query:

```typescript
interface QueryAnalysis {
  intent: 'question' | 'task' | 'discussion' | 'creative' | 'recall';
  domain: string;          // finance, code, email, personal, general
  complexity: number;      // 0-1
  temporalReference: 'past' | 'present' | 'future' | null;
  entityMentions: string[];  // Erkannte Entities
  isFollowUp: boolean;     // Bezieht sich auf vorherige Nachricht?
  expectedOutputType: 'text' | 'code' | 'document' | 'list' | 'analysis';
  suggestedModules: string[]; // Welche GWT-Module sollten hoch scoren?
}
```

**Implementation:** Heuristisch (KEIN LLM-Call). Regex + Keyword-Matching + Entity-Lookup:
- `temporalReference`: "gestern", "letzte Woche", "naechsten Monat" → Datum-Erkennung
- `entityMentions`: Gegen bekannte Entities im Knowledge Graph matchen
- `isFollowUp`: Pronomen-Erkennung ("das", "er", "sie", "es" am Anfang)
- `domain`: Keyword-Sets pro Domain (existiert bereits in context-engine-v2.ts, wird extrahiert)

**Nutzen:** Die GWT-Module bekommen die QueryAnalysis als Input fuer ihre Salience-Berechnung. Kein extra LLM-Call, aber deutlich bessere Module-Selection.

### 127.3: Fact-Checking Layer (Post-Claude)

**Datei:** `backend/src/services/reasoning/fact-checker.ts` (NEU)

**Konzept:** NACH Claude's Antwort wird geprueft ob die Antwort bekannten Fakten widerspricht.

**Algorithmus:**
1. Extrahiere Behauptungen aus Claude's Antwort (Heuristik: Saetze mit Entities)
2. Suche nach widersprechenden Fakten in LTM + Knowledge Graph
3. Wenn Widerspruch gefunden (Confidence > 0.7):
   - Interne Korrektur: Claude wird nochmal gefragt mit dem widersprechenden Fakt als Kontext
   - ODER: ConfidenceBadge zeigt Warnung
4. Wenn kein Widerspruch: Behauptungen die bisher nicht bekannt waren → Kandidaten fuer neue Fakten

**Wichtig:** Dieser Check laeuft NICHT bei jeder Message. Nur wenn:
- Die Antwort faktische Behauptungen enthaelt (nicht bei Smalltalk, kreativen Texten)
- Die Behauptungen Entities referenzieren die im Knowledge Graph existieren
- Geschaetzter Mehraufwand: ~200ms (nur DB-Lookups, kein LLM-Call)

### 127.4: Sekundaer-Verbesserungen

**Memory (Saeule 1):**
- Module-Salience-Daten werden als Feedback an FSRS zurueckgefuettert (welche Fakten waren relevant?)
- Hebbian: GWT-Broadcast staerkt Co-Aktivierung der im Workspace aktiven Entities

**Meta-Kognition (Saeule 6, Vorbereitung):**
- QueryAnalysis speichert `complexity` und `domain` → spaeter fuer Calibration-Tracking

### Neue Dateien Phase 127
| Datei | LOC (geschaetzt) | Zweck |
|-------|-------------------|-------|
| `backend/src/services/reasoning/global-workspace.ts` | ~400 | GWT-Engine (Module-Registry, Selection, Broadcast) |
| `backend/src/services/reasoning/query-analyzer.ts` | ~200 | Heuristische Query-Analyse |
| `backend/src/services/reasoning/fact-checker.ts` | ~180 | Post-Response Fact Verification |
| `backend/src/services/reasoning/modules/` (8 Dateien) | ~800 | Ein Modul pro Spezialist |
| Tests: 4 Dateien | ~400 | GWT + Query Analyzer + Fact Checker + Integration |

### Tests (geschaetzt: ~100)
- GWT: Salience Scoring, Token-Budgeting, Timeout, Parallel Execution, Broadcast (30)
- Module: Je 5 Tests pro Modul (8 x 5 = 40)
- Query Analyzer: Intent, Domain, Temporal, Entity, FollowUp Detection (15)
- Fact Checker: Contradiction Detection, Threshold, New-Fact-Candidates (15)

---

## Phase 128: Chain-of-Thought Persistence + Inference Engine

> **Primaer:** Reasoning (Saeule 2)
> **Sekundaer:** Memory (Reasoning-Chains als neue Memory-Schicht)
> **Geschaetzte Dauer:** 1 Session (4-6h)

### Ziel
Aktuell: Claude denkt, gibt eine Antwort, und das Denken ist weg. Wir speichern Ergebnisse, nicht Denkprozesse.

Neu: **Reasoning-Chains werden persistent.** Wenn Claude einen mehrstufigen Gedankengang durchlaeuft, wird die Kette gespeichert — und spaeter fuer aehnliche Fragen wiederverwendet.

### 128.1: Reasoning Chain Store

**Datei:** `backend/src/services/reasoning/chain-store.ts` (NEU)

```typescript
interface ReasoningChain {
  id: string;
  query: string;                    // Original-Frage
  queryEmbedding: number[];         // Fuer Similarity-Search
  steps: ReasoningStep[];           // Einzelne Denkschritte
  conclusion: string;               // Finale Antwort
  confidence: number;               // Wie sicher war die Schlussfolgerung?
  domain: string;                   // Finance, Code, etc.
  usedFacts: string[];              // Welche Fakten flossen ein?
  usedTools: string[];              // Welche Tools wurden genutzt?
  userFeedback: number | null;      // 1-5 Rating (wenn gegeben)
  reusable: boolean;                // Kann diese Chain wiederverwendet werden?
  createdAt: Date;
  reuseCount: number;               // Wie oft wurde diese Chain wiederverwendet?
}

interface ReasoningStep {
  stepNumber: number;
  type: 'observation' | 'hypothesis' | 'inference' | 'verification' | 'conclusion';
  content: string;
  sourceFacts: string[];            // Welche Fakten stuetzen diesen Schritt?
  confidence: number;
}
```

**Wann wird eine Chain gespeichert?**
- Extended Thinking ist aktiv UND die Antwort besteht aus >3 logischen Schritten
- Agent-Execution mit >2 Tool-Calls (jeder Call = ein Step)
- User gibt explizites Feedback (Thumbs up = reusable:true)

**Wann wird eine Chain wiederverwendet?**
- Neue Query hat Embedding-Similarity > 0.85 zu einer gespeicherten Chain
- Chain hat confidence > 0.7 UND reusable = true
- Wiederverwendung: Chain wird als "vorheriger Denkprozess" in den Claude-Kontext eingefuegt
- Claude entscheidet ob die alte Chain noch gilt oder angepasst werden muss

### 128.2: Multi-Hop Inference Engine

**Datei:** `backend/src/services/reasoning/inference-engine.ts` (NEU)

**Erweitert bestehende Transitive Inference (Phase 48) zu einer echten Reasoning-Engine.**

**Inference-Typen:**

1. **Transitiv:** A→B, B→C ⇒ A→C (existiert bereits, wird verbessert)
   - Verbesserung: Confidence-Propagation statt feste Gewichte
   - Verbesserung: Bis zu 4-Hop statt nur 2-Hop

2. **Analogie:** A:B ≈ C:? — Wenn A und C aehnlich sind und A eine Beziehung zu B hat, dann hat C wahrscheinlich eine aehnliche Beziehung.
   - Implementation: Embedding-Similarity zwischen Entities + Relation-Pattern-Matching
   - Beispiel: "Python : Programmiersprache ≈ TypeScript : ?" → "Programmiersprache"

3. **Abduktion:** B ist wahr. A→B ist bekannt. ⇒ A ist wahrscheinlich (nicht sicher!) wahr.
   - Implementation: Backward-Chaining im Knowledge Graph
   - Confidence: Deutlich niedriger als Deduktion (0.3-0.5)
   - Nutzung: Hypothesen-Generierung fuer Curiosity-Engine (Phase 133)

4. **Negation:** A→B, B contradicts C ⇒ A ist inkompatibel mit C
   - Baut auf bestehender Contradiction Detection auf
   - Propagiert Inkompatibilitaet durch den Graphen

**Execution:**
- Inference-Engine laeuft als Teil von Sleep Compute (nicht in Echtzeit)
- Neue Inferenzen werden als `inferred_facts` mit Typ `inferred` gespeichert
- Confidence ist immer < Quell-Confidence (Unsicherheit waechst mit jedem Hop)

### 128.3: Sekundaer-Verbesserungen

**Memory (Saeule 1):**
- Reasoning Chains werden Teil der Memory-Hierarchie: "Wie habe ich ueber X nachgedacht?"
- FSRS scheduled Re-Evaluation von alten Chains (wurden sie durch neue Fakten invalidiert?)

**Agenten (Saeule 3):**
- Agents koennen Reasoning Chains als Vorlage nutzen: "Letztes Mal habe ich fuer einen aehnlichen Task so vorgegangen..."

### Neue Dateien Phase 128
| Datei | LOC (geschaetzt) | Zweck |
|-------|-------------------|-------|
| `backend/src/services/reasoning/chain-store.ts` | ~250 | Reasoning Chain Persistence + Retrieval |
| `backend/src/services/reasoning/inference-engine.ts` | ~350 | Multi-Hop Inference (Transitiv, Analogie, Abduktion, Negation) |
| `backend/sql/migrations/phase128_reasoning.sql` | ~40 | reasoning_chains + inferred_facts Tabellen |
| Tests: 2 Dateien | ~300 | Chain Store + Inference Engine |

---

## Phase 129: Autonome Agent Loops + Context Isolation

> **Primaer:** Agenten (Saeule 3)
> **Sekundaer:** Reasoning (Reducer-Driven State), Output (erste Tool-Chains)
> **Geschaetzte Dauer:** 1 Session (4-6h)

### Ziel
Aktuell: Agenten sind request-basiert. User schickt Nachricht → Agent antwortet → fertig.

Neu: **Persistente Agent Loops** die autonom arbeiten, und **Context Isolation** fuer bessere Qualitaet.

### 129.1: Persistent Agent Loop

**Datei:** `backend/src/services/agents/persistent-loop.ts` (NEU)

**Konzept:** Ein Agent der nicht auf eine Nachricht antwortet, sondern ein **Ziel** verfolgt — ueber mehrere Schritte, mit Pausen, ueber Stunden oder Tage.

```typescript
interface PersistentAgentTask {
  id: string;
  goal: string;                     // Was soll erreicht werden?
  plan: AgentPlan;                  // Zerlegter Plan (vom Agent selbst erstellt)
  currentStep: number;
  status: 'planning' | 'executing' | 'waiting_input' | 'paused' | 'completed' | 'failed';
  checkpoints: Checkpoint[];        // State nach jedem Schritt (Phase 54 Checkpoints erweitert)
  results: StepResult[];
  maxSteps: number;                 // Hard Limit (Default: 20)
  maxDurationMinutes: number;       // Hard Limit (Default: 60)
  createdAt: Date;
  lastActivityAt: Date;
}

interface AgentPlan {
  steps: PlannedStep[];
  estimatedDuration: string;
  requiredTools: string[];
  riskAssessment: 'low' | 'medium' | 'high';
}

interface PlannedStep {
  stepNumber: number;
  description: string;
  expectedOutput: string;
  tools: string[];
  dependsOn: number[];              // Welche Steps muessen vorher fertig sein?
  canParallelize: boolean;
}
```

**Agent Loop (inspiriert von Claude Code):**
```
1. User gibt Ziel ein ("Recherchiere X und schreibe einen Bericht")
2. Agent erstellt Plan (Claude Sonnet, 1 Call)
3. Plan wird User gezeigt → Approve/Edit/Reject
4. Fuer jeden Schritt:
   a. Agent laedt relevanten Kontext (GWT-Module)
   b. Agent fuehrt Schritt aus (Tool-Calls, Claude-Calls)
   c. Ergebnis wird als Checkpoint gespeichert
   d. Wenn waiting_input: Pausiere, frage User
   e. Wenn Fehler: Retry 1x, dann pausiere + frage User
5. Nach Abschluss: Ergebnis + Zusammenfassung
```

**Hintergrund-Execution:**
- BullMQ Queue: `persistent-agent` mit Concurrency 2
- Langzeit-Tasks laufen im Background, User bekommt SSE-Updates
- Bei Server-Restart: Checkpoints laden, ab letztem Step fortsetzen

### 129.2: Context Isolation per Agent (Anthropic-Pattern)

**Problem (aktuell):** Alle Agents im Team teilen denselben vollen Kontext. Das fuehrt zu:
- Token-Verschwendung (Researcher braucht keine E-Mail-History)
- Verwirrung (Writer sieht Researcher's interne Notizen als "Fakten")

**Loesung:** Jeder Agent bekommt einen isolierten, auf seine Rolle zugeschnittenen Kontext.

**Datei:** `backend/src/services/agents/context-isolator.ts` (NEU)

```typescript
interface IsolatedAgentContext {
  coreMemoryBlocks: CoreMemoryBlock[];     // IMMER (Phase 126)
  roleInstructions: string;                 // Rolle + Persona
  relevantFacts: LearnedFact[];             // Nur fuer diese Rolle relevante Fakten
  sharedResults: SharedResult[];            // Ergebnisse anderer Agents (gefiltert)
  toolSet: string[];                        // Nur erlaubte Tools
  tokenBudget: number;                      // Individuelles Budget
}
```

**Pro Rolle:**
- **Researcher:** RAG-heavy, Web-Tools, breiter Fakten-Kontext, 12K Budget
- **Writer:** Wenig RAG, viel Style-Kontext, Core Memory Preferences, 8K Budget
- **Reviewer:** Researcher + Writer Ergebnisse, Qualitaets-Kriterien, 6K Budget
- **Coder:** Code-Kontext, Project-Tools, Execute-Code, 10K Budget

### 129.3: Reducer-Driven State Management (LangGraph-Pattern)

**Problem (aktuell):** Shared Memory ist ein simpler Key-Value Store. Wenn zwei parallele Agents gleichzeitig schreiben, ueberschreibt der Letzte.

**Loesung:** Reducer-Funktionen definieren wie State-Updates gemergt werden.

**Datei:** Aenderung in `backend/src/services/memory/shared-memory.ts`

```typescript
type StateReducer = (currentState: any, update: any) => any;

const REDUCERS: Record<string, StateReducer> = {
  // Findings werden als Array gesammelt (kein Ueberschreiben)
  findings: (current, update) => [...(current || []), ...update],

  // Summary wird durch neuere Version ersetzt
  summary: (current, update) => update,

  // Confidence ist Maximum beider Werte
  confidence: (current, update) => Math.max(current || 0, update),

  // Errors werden akkumuliert
  errors: (current, update) => [...(current || []), ...update],
};
```

### 129.4: Multi-Turn Agent Debates

**Problem:** Aktuell: Researcher findet etwas → Writer schreibt → Reviewer sagt ja/nein. Kein echtes Hin-und-Her.

**Loesung:** Agenten koennen sich gegenseitig herausfordern.

**Datei:** `backend/src/services/agents/debate-protocol.ts` (NEU)

```typescript
interface DebateRound {
  challenger: string;    // Agent-Rolle die widerspricht
  claim: string;         // Die strittige Behauptung
  counterArgument: string;
  resolution: 'accepted' | 'rejected' | 'modified' | 'escalated_to_user';
}
```

**Ablauf:**
1. Agent A produziert Ergebnis
2. Agent B (Reviewer) identifiziert problematische Stellen
3. Agent A verteidigt oder korrigiert
4. Max 3 Runden, dann Entscheidung durch Orchestrator oder User

### Neue Dateien Phase 129
| Datei | LOC (geschaetzt) | Zweck |
|-------|-------------------|-------|
| `backend/src/services/agents/persistent-loop.ts` | ~400 | Persistent Agent Loop mit Plan + Checkpoints |
| `backend/src/services/agents/context-isolator.ts` | ~200 | Rollen-basierte Context-Filterung |
| `backend/src/services/agents/debate-protocol.ts` | ~200 | Multi-Turn Agent Debates |
| `backend/sql/migrations/phase129_persistent_agents.sql` | ~30 | persistent_agent_tasks Tabelle |
| Tests: 3 Dateien | ~300 | Loop + Isolation + Debates |

---

## Phase 130: Tool Composition + Dynamic Team Building

> **Primaer:** Agenten (Saeule 3)
> **Sekundaer:** Output (komplexe Ergebnisse), Reasoning (Tool-Chain-Planung)
> **Geschaetzte Dauer:** 1 Session (4-6h)

### Ziel
Agenten koennen Tools KETTEN: "Suche im Web → Analysiere die Ergebnisse → Schreibe eine Zusammenfassung → Sende per E-Mail". Und: Teams werden dynamisch zusammengestellt statt aus festen Templates.

### 130.1: Tool Composition Engine

**Datei:** `backend/src/services/agents/tool-composer.ts` (NEU)

**Konzept:** Tools haben deklarierte Inputs und Outputs. Die Engine plant automatisch Tool-Chains.

```typescript
interface ToolSignature {
  name: string;
  inputs: { name: string; type: string; required: boolean }[];
  outputs: { name: string; type: string }[];
  sideEffects: boolean;     // Sendet E-Mail, erstellt Datei, etc.
  estimatedDuration: number; // ms
  costTier: 'free' | 'cheap' | 'expensive';
}
```

**Chain-Planung:**
1. User beschreibt gewuenschtes Endergebnis
2. Claude Haiku bekommt Tool-Signatures und plant die Chain
3. Chain wird validiert (sind alle Outputs→Inputs kompatibel?)
4. Execution mit Intermediate-Result-Passing

**Beispiel-Chain:**
```
web_search("KI Trends 2026")
  → fetch_url(top_3_results)
  → analyze_document(fetched_content)
  → create_idea(analysis_summary)
  → draft_email(idea_link, recipient="team@company.com")
```

### 130.2: Dynamic Team Composition

**Datei:** `backend/src/services/agents/team-builder.ts` (NEU)

**Aktuell:** 4 feste Rollen (Researcher, Writer, Reviewer, Coder) + 8 feste Strategien.

**Neu:** Agent-Rollen werden dynamisch aus Identity-Templates (Phase 64) zusammengesetzt.

```typescript
interface DynamicTeamRequest {
  goal: string;
  constraints: string[];
  preferredApproach: 'fast' | 'thorough' | 'creative';
}

// Claude Haiku analysiert das Ziel und waehlt:
interface TeamComposition {
  agents: {
    role: string;           // Kann beliebig sein: "Data Analyst", "UX Researcher", etc.
    persona: string;        // Anweisungen fuer diesen Agenten
    tools: string[];        // Erlaubte Tools
    priority: number;       // Ausfuehrungsreihenfolge
  }[];
  workflow: 'sequential' | 'parallel' | 'debate';
  estimatedDuration: string;
}
```

**Vordefinierte Spezialisten-Bibliothek (erweiterbar):**
- Data Analyst: `execute_code`, `get_revenue_metrics`, `analyze_document`
- UX Researcher: `web_search`, `fetch_url`, `create_idea`
- Email Coordinator: `draft_email`, `ask_inbox`, `inbox_summary`
- Project Manager: `create_calendar_event`, `list_calendar_events`, Tasks-Tools
- Finance Advisor: `get_revenue_metrics`, `calculate`, `generate_business_report`

### Neue Dateien Phase 130
| Datei | LOC (geschaetzt) | Zweck |
|-------|-------------------|-------|
| `backend/src/services/agents/tool-composer.ts` | ~300 | Tool Chain Planning + Execution |
| `backend/src/services/agents/team-builder.ts` | ~250 | Dynamic Team Composition |
| Tests: 2 Dateien | ~200 | Composer + Team Builder |

---

## Phase 131: Document Generation Suite

> **Primaer:** Output (Saeule 4)
> **Sekundaer:** Agenten (Agent-driven Document Creation)
> **Geschaetzte Dauer:** 1 Session (4-6h)

### Ziel
ZenAI kann echte Dokumente erstellen: PowerPoint, Excel, PDF, Word. Nicht nur Text-Output, sondern editierbare Dateien.

### 131.1: Two-Step Document Generation

**Architektur-Prinzip:** Claude erzeugt strukturiertes JSON → deterministische Library erzeugt Datei.

**Datei:** `backend/src/services/documents/document-generator.ts` (NEU)

```typescript
interface DocumentRequest {
  type: 'pptx' | 'xlsx' | 'pdf' | 'docx';
  title: string;
  content: string;          // Freitext-Beschreibung ODER strukturierte Daten
  template?: string;        // Optional: Template-Name
  style?: DocumentStyle;    // Farben, Fonts, Branding
}

interface DocumentResult {
  filePath: string;         // Pfad zur generierten Datei
  fileSize: number;
  pageCount: number;
  downloadUrl: string;      // Temporaerer Download-Link (1h TTL)
}
```

**Step 1 — Claude generiert Struktur:**
```typescript
// Claude bekommt: "Erstelle eine Praesentation ueber KI-Trends"
// Claude gibt zurueck (structured output):
{
  "slides": [
    {
      "title": "KI-Trends 2026",
      "subtitle": "Eine Uebersicht",
      "layout": "title_slide"
    },
    {
      "title": "Trend 1: Agentic AI",
      "bullets": ["Autonome Agenten", "Tool-Use", "Multi-Agent"],
      "layout": "bullet_slide",
      "speakerNotes": "Hier die wichtigsten Punkte erlaeutern..."
    }
  ]
}
```

**Step 2 — Library generiert Datei:**

| Format | Library | npm Package |
|--------|---------|-------------|
| PowerPoint | PptxGenJS | `pptxgenjs` |
| Excel | ExcelJS | `exceljs` |
| PDF | pdfmake | `pdfmake` |
| Word | docx | `docx` |

### 131.2: Template-System

**Datei:** `backend/src/services/documents/templates/` (NEU, Verzeichnis)

**Vordefinierte Templates:**
- `business-report`: Executive Summary, Charts, Recommendations
- `project-proposal`: Problem, Solution, Timeline, Budget
- `meeting-minutes`: Attendees, Agenda, Decisions, Action Items
- `financial-summary`: Revenue, Expenses, Charts, Forecast
- `learning-summary`: Topics, Key Takeaways, Quiz, Resources

**Template-Struktur:**
```typescript
interface DocumentTemplate {
  id: string;
  name: string;
  type: 'pptx' | 'xlsx' | 'pdf' | 'docx';
  structure: SlideStructure[] | SheetStructure[] | PageStructure[];
  defaultStyle: DocumentStyle;
  requiredData: string[];   // Welche Daten muss Claude liefern?
}
```

### 131.3: Agent-Driven Document Creation

**Integration mit Agent-System:**
- Neues Tool: `create_document(type, title, content)` → Gibt Download-URL zurueck
- Agent kann im Persistent Loop: Recherchieren → Analysieren → Dokument erstellen
- Komplette Chains: "Erstelle eine Praesentation ueber Q1-Ergebnisse" →
  1. `get_revenue_metrics()` → Daten sammeln
  2. `generate_business_report()` → Analyse
  3. `create_document('pptx', ...)` → PowerPoint erstellen
  4. `draft_email(attachment_url, ...)` → Per E-Mail senden

### 131.4: Frontend Document Viewer

**Datei:** `frontend/src/components/DocumentViewer/DocumentViewer.tsx` (NEU)

- Preview im Browser (PDF inline, PPTX/XLSX als Preview-Bilder)
- Download-Button
- "Regenerate"-Button (neue Version mit anderem Stil)
- Integration in ArtifactPanel (neben Code, Markdown, Mermaid)

### Neue Dateien Phase 131
| Datei | LOC (geschaetzt) | Zweck |
|-------|-------------------|-------|
| `backend/src/services/documents/document-generator.ts` | ~300 | Central Document Generation Logic |
| `backend/src/services/documents/pptx-renderer.ts` | ~250 | PowerPoint via PptxGenJS |
| `backend/src/services/documents/xlsx-renderer.ts` | ~200 | Excel via ExcelJS |
| `backend/src/services/documents/pdf-renderer.ts` | ~200 | PDF via pdfmake |
| `backend/src/services/documents/docx-renderer.ts` | ~200 | Word via docx |
| `backend/src/services/documents/templates/` | ~400 | 5 Template-Definitionen |
| `backend/src/routes/documents-generate.ts` | ~100 | API Endpoints |
| `frontend/src/components/DocumentViewer/` | ~300 | Preview + Download UI |
| Tests: 5 Dateien | ~400 | Je Renderer + Integration |

### Neue Dependencies
```json
{
  "pptxgenjs": "^3.12",
  "exceljs": "^4.4",
  "pdfmake": "^0.2",
  "docx": "^9.2"
}
```

---

## Phase 132: CLI Agent — ZenAI im Terminal

> **Primaer:** Output (Saeule 4)
> **Sekundaer:** Agenten (Persistent Loop im Terminal), Memory (File-basierte Artefakte)
> **Geschaetzte Dauer:** 1 Session (4-6h)

### Ziel
`zenai` als Terminal-Befehl. Wie Claude Code, aber mit ZenAI's Memory, Knowledge Graph und Agent-System.

### 132.1: CLI Architecture

**Package:** `cli/` (neues Top-Level-Verzeichnis neben `frontend/` und `backend/`)

```
cli/
  src/
    index.ts            # Entry Point (zenai command)
    agent-loop.ts       # Single-threaded Agent Loop
    tools/              # CLI-spezifische Tools (File Read/Write/Edit)
    ui/                 # Terminal UI (ink oder blessed)
    context.ts          # Context Management (file-based artifacts)
  package.json
  tsconfig.json
```

**Agent Loop (Claude Code Pattern):**
```typescript
async function agentLoop(userMessage: string): Promise<void> {
  while (true) {
    const response = await claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      system: buildSystemPrompt(),  // Inkl. Core Memory Blocks
      messages: conversationHistory,
      tools: CLI_TOOLS,
    });

    // Wenn Claude Text ohne Tool-Calls gibt → Loop endet
    if (response.stop_reason === 'end_turn' && !hasToolUse(response)) {
      displayResponse(response);
      break;
    }

    // Tool-Calls ausfuehren
    for (const toolUse of extractToolUses(response)) {
      const result = await executeTool(toolUse);
      conversationHistory.push(toolResult(result));
    }
  }
}
```

**CLI-spezifische Tools:**
| Tool | Beschreibung |
|------|-------------|
| `read_file(path)` | Datei lesen |
| `write_file(path, content)` | Datei schreiben |
| `edit_file(path, old, new)` | Datei editieren (Search/Replace) |
| `list_files(pattern)` | Glob-basierte Dateisuche |
| `search_content(pattern)` | Grep-basierte Inhaltssuche |
| `run_command(cmd)` | Shell-Befehl ausfuehren (mit Bestaetigung) |
| `create_document(type, ...)` | Dokument generieren (Phase 131) |

**Plus ALLE bestehenden ZenAI-Tools** (memory, web_search, knowledge graph, etc.) — ueber Backend-API.

### 132.2: Hybride Architektur

**CLI kommuniziert mit Backend-API fuer:**
- Memory (Core Memory, LTM, Episodic, Procedural)
- Knowledge Graph
- RAG Pipeline
- Agent Teams
- Document Generation

**CLI hat LOKALE Tools fuer:**
- Filesystem-Zugriff (read, write, edit, glob, grep)
- Shell-Commands
- Git-Operationen
- Projekt-Analyse (lokal, ohne Backend)

**Vorteil:** Ein einziger Memory-Store fuer Web-UI UND CLI. Der User wechselt zwischen Terminal und Browser — ZenAI erinnert sich an beides.

### 132.3: Session-Persistenz via External Artifacts

**Anthropic-Pattern:** Fortschritt wird in Dateien gespeichert, nicht im Kontext.

```
.zenai/
  session.json          # Aktueller Session-State
  progress.md           # Was wurde bereits erledigt?
  plan.md               # Aktueller Plan
  findings/             # Gesammelte Recherche-Ergebnisse
```

Bei jedem neuen CLI-Start: Agent liest `.zenai/` und rekonstruiert Kontext.

### 132.4: Installation + Distribution

```bash
# Via npm (global)
npm install -g @zenai/cli

# Oder via Backend-API (Self-Hosted)
zenai --api-url https://ki-ab-production.up.railway.app --api-key xxx
```

### Neue Dateien Phase 132
| Datei | LOC (geschaetzt) | Zweck |
|-------|-------------------|-------|
| `cli/src/index.ts` | ~100 | CLI Entry Point + Argument Parsing |
| `cli/src/agent-loop.ts` | ~300 | Single-threaded Agent Loop |
| `cli/src/tools/filesystem.ts` | ~200 | File Read/Write/Edit/Glob/Grep |
| `cli/src/tools/shell.ts` | ~100 | Shell Command Execution |
| `cli/src/tools/backend-bridge.ts` | ~200 | API-Client fuer Backend-Tools |
| `cli/src/ui/terminal-ui.ts` | ~200 | Terminal Output Formatting |
| `cli/src/context.ts` | ~150 | .zenai/ Directory Management |
| `cli/package.json` | ~30 | Package Config |
| Tests: 3 Dateien | ~300 | Loop + Tools + Integration |

---

## Phase 133: Artificial Curiosity Engine

> **Primaer:** Neugier (Saeule 5)
> **Sekundaer:** Memory (Gap Detection), Reasoning (Hypothesis Generation)
> **Geschaetzte Dauer:** 1 Session (4-6h)

### Ziel
ZenAI wird neugierig. Nicht weil ein Event es triggert, sondern weil es LUECKEN in seinem Wissen erkennt und aktiv schliessen will.

### 133.1: Knowledge Gap Detection

**Datei:** `backend/src/services/curiosity/gap-detector.ts` (NEU)

**Konzept:** Das System vergleicht was es WEISS mit was der User FRAGT. Bereiche mit hoher Nachfrage aber niedrigem Wissen sind "Luecken".

**Algorithmus:**
```typescript
interface KnowledgeGap {
  topic: string;
  domain: string;
  queryCount: number;       // Wie oft wurde danach gefragt?
  factCount: number;        // Wie viele Fakten haben wir?
  avgConfidence: number;    // Durchschnittliche Confidence der vorhandenen Fakten
  avgRAGScore: number;      // Durchschnittliche RAG-Performance
  gapScore: number;         // Berechnet: hohe Nachfrage + niedriges Wissen = hoher Score
  suggestedAction: 'ask_user' | 'web_research' | 'consolidate_existing' | 'monitor';
}
```

**Gap-Score Berechnung:**
```
gapScore = (queryCount / maxQueries) * 0.4
         + (1 - factCount / maxFacts) * 0.3
         + (1 - avgConfidence) * 0.2
         + (1 - avgRAGScore) * 0.1
```

**Erkennung laeuft in Sleep Compute:**
1. Analysiere letzte 7 Tage Queries
2. Gruppiere nach Domain + Topic (TF-IDF Clustering)
3. Zaehle Fakten und Confidence pro Cluster
4. Berechne Gap-Scores
5. Top-5 Gaps → Smart Suggestions ("Soll ich mehr ueber X herausfinden?")

### 133.2: Information Gain Scoring (ICM-Adaptiert)

**Datei:** `backend/src/services/curiosity/information-gain.ts` (NEU)

**Konzept:** Messe den "Ueberraschungswert" von Retrieval-Ergebnissen. Hohe Ueberraschung = das System hat etwas Neues gelernt.

```typescript
interface InformationGainEvent {
  queryEmbedding: number[];
  retrievedEmbeddings: number[][];
  surpriseScore: number;          // 1 - avgCosineSimilarity(query, retrieved)
  noveltyScore: number;           // Wie viele retrieved Items waren NEU (nicht im Familiarity-Buffer)?
  informationGain: number;        // surprise * novelty
}
```

**Familiarity Buffer:**
- Sliding Window der letzten 500 Entity-Aktivierungen
- Items NICHT im Buffer bekommen Novelty-Bonus
- Implementierung: Redis Sorted Set mit Timestamp als Score

**Nutzung:**
- Hoher Information Gain bei einem Thema → Proactive Suggestion: "Ich habe etwas Ueberraschendes zu X gefunden"
- Tracking ueber Zeit: Welche Themen haben sinkenden Information Gain? → Das System "versteht" dieses Thema bereits gut

### 133.3: Hypothesis Generation

**Datei:** `backend/src/services/curiosity/hypothesis-engine.ts` (NEU)

**Konzept:** Basierend auf Knowledge Graph Patterns, generiert das System Hypothesen die es nicht verifizieren kann — und schlaegt Wege vor, sie zu pruefen.

**Quellen fuer Hypothesen:**

1. **Incomplete Patterns:** A→B, A→C, B→D... aber C→? fehlt.
   - Hypothese: "Wenn A mit B und C verwandt ist, und B mit D, hat C vielleicht auch eine Verbindung zu D?"

2. **Temporal Gaps:** Fakt X war bis Datum Y aktuell. Seitdem keine Updates.
   - Hypothese: "Hat sich X seit Y geaendert?"

3. **Contradiction Candidates:** Zwei Fakten mit ueberlappenden Entities aber unterschiedlichen Aussagen.
   - Hypothese: "Sind beide noch korrekt oder hat sich etwas geaendert?"

4. **Analogie-basiert:** (Aus Inference Engine, Phase 128)
   - A hat Eigenschaft X, B ist aehnlich wie A → "Hat B vielleicht auch Eigenschaft X?"

**Output:** Smart Suggestions mit Typ `knowledge_insight` oder neuem Typ `hypothesis`:
```
"Ich habe bemerkt dass du oft ueber TypeScript und Testing sprichst,
aber keine Fakten ueber Property-Based Testing hast.
Soll ich dazu recherchieren?"
```

### 133.4: Sekundaer-Verbesserungen

**Memory (Saeule 1):**
- Knowledge Gaps werden als spezielle Fakten gespeichert (Typ: `gap`, mit FSRS-Scheduling fuer Re-Evaluation)
- Hypothesen die bestaetigt werden → neue Fakten mit hoher Confidence

**Meta-Kognition (Saeule 6, Vorbereitung):**
- Gap Detection ist Meta-Kognition: "Was weiss ich NICHT?"
- Information Gain History → spaeter Teil des Capability Models

### Neue Dateien Phase 133
| Datei | LOC (geschaetzt) | Zweck |
|-------|-------------------|-------|
| `backend/src/services/curiosity/gap-detector.ts` | ~250 | Knowledge Gap Detection + Scoring |
| `backend/src/services/curiosity/information-gain.ts` | ~200 | ICM-adaptierte Surprise + Novelty Messung |
| `backend/src/services/curiosity/hypothesis-engine.ts` | ~300 | Hypothesis Generation aus Graph-Patterns |
| `backend/sql/migrations/phase133_curiosity.sql` | ~30 | knowledge_gaps + hypotheses Tabellen |
| Tests: 3 Dateien | ~300 | Gap + IG + Hypothesis Tests |

---

## Phase 134: Active Inference + Prediction Error

> **Primaer:** Neugier (Saeule 5)
> **Sekundaer:** Reasoning (Predictive Context Loading), Agenten (Proaktive Aktion)
> **Geschaetzte Dauer:** 1 Session (4-6h)

### Ziel
Das System SAGT VORAUS was der User als naechstes braucht — und LERNT aus Vorhersage-Fehlern.

### 134.1: Prediction Engine

**Datei:** `backend/src/services/curiosity/prediction-engine.ts` (NEU)

**Konzept (Statistisches User-Modell mit Prediction-Error-Learning):**
> Hinweis: Inspiriert von Friston's Active Inference (Minimierung von Vorhersage-Fehlern),
> aber implementiert als konventionelles statistisches Modell (Markov-Ketten + Zeitreihen),
> nicht als formales Free-Energy-Minimierungs-Framework.

Das System hat ein Modell des Users: "Um diese Uhrzeit, an diesem Wochentag, nach dieser Aktivitaet, fragt der User normalerweise nach X."

```typescript
interface UserPrediction {
  predictedIntent: string;          // Was wird der User wahrscheinlich wollen?
  predictedDomain: string;          // In welchem Bereich?
  predictedEntities: string[];      // Welche Entities werden relevant?
  confidence: number;
  basis: string[];                  // Worauf basiert die Vorhersage?
}

interface PredictionError {
  predicted: UserPrediction;
  actual: QueryAnalysis;            // Was der User tatsaechlich gefragt hat
  errorMagnitude: number;           // Wie weit daneben?
  learningSignal: string;           // Was koennen wir lernen?
}
```

**Vorhersage-Modell (kein ML, rein statistisch):**
1. **Zeitliche Muster:** Aggregiere Queries nach (timeOfDay, dayOfWeek, domain). "Montags morgens fragt der User meist nach E-Mails."
2. **Sequenzielle Muster:** Welche Query folgt typisch auf welche? (Bigram-Modell auf Intent-Ebene)
3. **Entity-Kontext:** Wenn Entity X kuerzlich aktiv war, welche verwandten Entities werden wahrscheinlich als naechstes gefragt? (Hebbian Graph, Phase 125)
4. **Kalender-Kontext:** Wenn ein Meeting in 30min ist, wird der User wahrscheinlich Vorbereitung brauchen.

**Prediction Error als Lern-Signal:**
- Niedriger Error: Alles wie erwartet → kein Update noetig
- Hoher Error: Ueberraschung → Modell updaten + Curiosity Signal ("Der User interessiert sich ploetzlich fuer etwas Neues!")
- Systematischer Error: Immer falsch bei Thema X → Knowledge Gap

### 134.2: Predictive Context Pre-Loading

**Integration in GWT (Phase 127):**

BEVOR der User seine naechste Nachricht schickt:
1. Prediction Engine berechnet wahrscheinlichsten naechsten Intent
2. GWT-Module pre-loaden relevanten Kontext (Redis-Cache)
3. Wenn der User dann tatsaechlich fragt → Cache Hit → schnellere Antwort

**Wenn die Vorhersage FALSCH war:**
- Cache wird verworfen
- Prediction Error wird gespeichert
- Modell wird aktualisiert

### 134.3: Sekundaer-Verbesserungen

**Agenten (Saeule 3):**
- Persistent Agents nutzen Predictions: "Der User wird wahrscheinlich die Ergebnisse meiner Recherche morgen fruehs brauchen → Ich bereite eine Zusammenfassung vor"

**Memory (Saeule 1):**
- Predictions werden zu Episodic Memory: "Ich habe vorhergesagt X, es kam Y" → System lernt ueber sich selbst

### Neue Dateien Phase 134
| Datei | LOC (geschaetzt) | Zweck |
|-------|-------------------|-------|
| `backend/src/services/curiosity/prediction-engine.ts` | ~350 | User Intent Prediction + Error Tracking |
| `backend/src/services/curiosity/pattern-tracker.ts` | ~200 | Zeitliche + Sequenzielle Pattern-Erkennung |
| `backend/sql/migrations/phase134_predictions.sql` | ~30 | prediction_history + user_patterns Tabellen |
| Tests: 2 Dateien | ~200 | Prediction + Pattern Tests |

---

## Phase 135-136: Meta-Kognition — Das Self-Model

> **Primaer:** Meta-Kognition (Saeule 6)
> **Sekundaer:** Alle anderen Saeulen (Meta-Kognition beobachtet alles)
> **Geschaetzte Dauer:** 2 Sessions (je 4-6h)

### Ziel
ZenAI bekommt ein **Modell seiner selbst**: Was kann ich gut? Wo bin ich unsicher? Wann sollte ich nachfragen statt raten? Wie gut bin ich kalibriert?

### 135: Metacognitive State Vector + Calibration

**Datei:** `backend/src/services/metacognition/state-vector.ts` (NEU)

```typescript
interface MetacognitiveState {
  // Pro-Response Metriken (aktualisiert nach jeder Antwort)
  confidence: number;        // RAG Confidence + Bayesian Propagation
  coherence: number;         // Similarity(query, context, response) — sind alle 3 aligned?
  conflictLevel: number;     // Anzahl widersprechender Fakten im Kontext
  knowledgeCoverage: number; // Anteil der Query-Entities die im Knowledge Graph existieren
  responseStability: number; // Variance bei Temperature-Sampling (optional, teuer)

  // Aggregierte Metriken (aktualisiert in Sleep Compute)
  calibrationScore: number;  // Stated Confidence vs. tatsaechliche User-Zufriedenheit
  domainStrengths: Record<string, number>; // Pro Domain: Durchschnitts-Qualitaet
  domainWeaknesses: Record<string, number>; // Domains mit niedriger Performance
  overconfidenceRate: number; // Wie oft "confident" aber falsch?
}
```

**Calibration Tracking:**
```
Fuer jede Antwort: speichere (stated_confidence, user_feedback)
Alle 7 Tage (Sleep Compute):
  Berechne Calibration: Gruppiere nach Confidence-Bins (0-0.2, 0.2-0.4, ...)
  Pro Bin: tatsaechliche Erfolgsrate (positive Feedback / total)
  Perfekte Calibration: stated 80% confident → 80% positives Feedback
  Overconfidence: stated 80% → nur 50% positives Feedback
  → Adjustiere Confidence-Darstellung im Frontend
```

**Confusion Detection + Help-Seeking:**
```typescript
function detectConfusion(state: MetacognitiveState): ConfusionLevel {
  if (state.conflictLevel > 2) return 'high';      // Viele Widersprueche
  if (state.knowledgeCoverage < 0.3) return 'high'; // Unbekanntes Terrain
  if (state.confidence < 0.4) return 'medium';      // Niedrige Confidence
  if (state.coherence < 0.5) return 'medium';       // Query und Kontext passen nicht
  return 'low';
}

// Bei Confusion:
// - 'high': "Ich bin mir unsicher bei diesem Thema. Soll ich nachfragen/recherchieren?"
// - 'medium': ConfidenceBadge zeigt Amber + "Einige Informationen koennten veraltet sein"
// - 'low': Normale Antwort
```

### 136: Capability Model + Self-Evaluation Loop

**Datei:** `backend/src/services/metacognition/capability-model.ts` (NEU)

**Capability Model:**
```typescript
interface CapabilityProfile {
  // Pro Domain (finance, code, email, personal, learning, creative)
  domains: Record<string, DomainCapability>;

  // Pro Tool
  toolProficiency: Record<string, ToolProficiency>;

  // Pro Task-Typ
  taskTypeSuccess: Record<string, number>; // Erfolgsrate

  // Globale Metriken
  avgResponseQuality: number;     // 1-5 (aus User-Feedback)
  totalInteractions: number;
  improvementTrend: number;       // Steigt die Qualitaet ueber Zeit?
}

interface DomainCapability {
  factCount: number;              // Wie viele Fakten in dieser Domain?
  avgConfidence: number;          // Durchschnittliche Fact-Confidence
  querySuccessRate: number;       // Anteil positiver Feedbacks
  lastImprovement: Date;          // Wann wurde diese Domain zuletzt besser?
  knownGaps: KnowledgeGap[];      // Aus Phase 133
}
```

**Self-Evaluation Loop:**
```
Nach jeder "wichtigen" Antwort (>3 Saetze, Tool-Use, oder Agent-Execution):
1. Evaluiere die Antwort gegen den MetacognitiveState
2. Wenn knowledgeCoverage < 0.5: Markiere als "teilweise informiert"
3. Wenn conflictLevel > 0: Erwaehne in der Antwort
4. Speichere (query, response_quality_estimate, metacognitive_state) in evaluation_log
5. Vergleiche spaeter mit User-Feedback → Calibration Update
```

**Frontend: Meta-Kognition Dashboard**

**Datei:** `frontend/src/components/MetacognitionDashboard/MetacognitionDashboard.tsx` (NEU)

- Calibration-Kurve (stated vs. actual confidence)
- Domain-Staerken/Schwaechen (Radar-Chart)
- Knowledge Gaps (aktive Luecken)
- Improvement-Trend (Quality ueber Zeit)
- "Was ich nicht weiss" Sektion (aktive Hypothesen + Gaps)

### Neue Dateien Phase 135-136
| Datei | LOC (geschaetzt) | Zweck |
|-------|-------------------|-------|
| `backend/src/services/metacognition/state-vector.ts` | ~250 | Metacognitive State Berechnung |
| `backend/src/services/metacognition/calibration.ts` | ~200 | Calibration Tracking + Correction |
| `backend/src/services/metacognition/capability-model.ts` | ~300 | Capability Profile + Self-Evaluation |
| `backend/src/routes/metacognition.ts` | ~100 | API Endpoints |
| `backend/sql/migrations/phase135_metacognition.sql` | ~50 | evaluation_log + capability_profiles |
| `frontend/src/components/MetacognitionDashboard/` | ~400 | Dashboard UI |
| Tests: 3 Dateien | ~300 | State + Calibration + Capability |

---

## Phase 137-138: Unified Feedback Revolution + Adaptive Behavior

> **Primaer:** Alle Saeulen (Integration)
> **Sekundaer:** Meta-Kognition (Feedback schliesst den Loop)
> **Geschaetzte Dauer:** 2 Sessions

### Ziel
Ein einheitliches Feedback-System das ALLE Subsysteme verbindet. User-Feedback fliesst automatisch in Memory, RAG, Agents, Curiosity und Meta-Kognition.

### 137: Unified Feedback Bus

**Datei:** `backend/src/services/feedback/feedback-bus.ts` (NEU)

```typescript
interface FeedbackEvent {
  id: string;
  type: 'response_rating' | 'fact_correction' | 'suggestion_action' |
        'tool_success' | 'document_quality' | 'agent_performance';
  source: string;            // Welches Subsystem?
  target: string;            // Was wird bewertet?
  value: number;             // -1 bis +1 (negativ bis positiv)
  details: Record<string, any>;
  timestamp: Date;
}
```

**Feedback-Routing:**
| Feedback-Typ | Wohin fliesst es? |
|-------------|-------------------|
| `response_rating` | Calibration (Phase 135), FSRS (Fact Stability), A-RAG Strategy Learning |
| `fact_correction` | LTM Update, Knowledge Graph Update, Confidence Reset |
| `suggestion_action` | Smart Suggestions Learning, Curiosity (Gap confirmed/denied) |
| `tool_success` | Procedural Memory, Tool Composer, Capability Model |
| `document_quality` | Template Learning, Agent Performance |
| `agent_performance` | Team Builder, Strategy Classifier |

### 138: Adaptive Behavior Engine

**Datei:** `backend/src/services/adaptive/behavior-engine.ts` (NEU)

**Konzept:** Das System passt sein Verhalten basierend auf akkumuliertem Feedback an.

**Adaptionen:**
1. **Antwort-Laenge:** User kuerzt oft → kuerzere Antworten. User fragt nach Details → laengere Antworten.
2. **Detailgrad:** User ist Experte in Domain X → weniger Erklaerungen. Anfaenger in Y → mehr Kontext.
3. **Proaktivitaet:** User akzeptiert Suggestions → mehr Suggestions. User dismisst → weniger.
4. **Tool-Praeferenzen:** User bevorzugt Code-Beispiele → Coder Agent haeufiger. User will Prosa → Writer.
5. **Sprach-Stil:** Formell vs. informell, deutsch vs. englisch, technisch vs. allgemein.

**Alle Adaptionen werden in Core Memory `preferences` Block gespeichert (Phase 126).**

### Neue Dateien Phase 137-138
| Datei | LOC (geschaetzt) | Zweck |
|-------|-------------------|-------|
| `backend/src/services/feedback/feedback-bus.ts` | ~250 | Zentraler Feedback-Router |
| `backend/src/services/feedback/feedback-aggregator.ts` | ~200 | Feedback-Statistiken pro Subsystem |
| `backend/src/services/adaptive/behavior-engine.ts` | ~300 | Adaptive Verhaltensentscheidungen |
| `backend/src/services/adaptive/style-learner.ts` | ~150 | Sprach-/Stil-Praeferenz-Learning |
| Tests: 3 Dateien | ~300 | Feedback + Adaptive Tests |

---

## Phase 139-140: Integration + Emergence

> **Primaer:** Alle Saeulen
> **Geschaetzte Dauer:** 2 Sessions

### 139: Cross-Pillar Optimization

**Alle Systeme arbeiten zusammen:**

```
User Query
  ↓
Query Analyzer (Phase 127) → QueryAnalysis
  ↓
Prediction Engine (Phase 134) pruefte: War das vorhergesagt?
  ↓
GWT Workspace (Phase 127) → Kompetitive Module Selection
  ↓
Core Memory (Phase 126) + Top-K Module Content
  ↓
Fact Checker (Phase 127) + Metacognitive State (Phase 135)
  ↓
Claude API Call (mit isoliertem Agent-Context falls Agent-Task)
  ↓
Post-Response:
  - Hebbian Update (Phase 125)
  - FSRS Recall Event (Phase 125)
  - Information Gain Tracking (Phase 133)
  - Prediction Error Calculation (Phase 134)
  - Calibration Update (Phase 135)
  - Feedback Bus Event (Phase 137)
  - GWT Broadcast (Phase 127)
```

### 140: Self-Improvement Pipeline

**Das System identifiziert und implementiert eigene Verbesserungen:**

1. Calibration-Daten → "Meine Finance-Antworten sind zu unsicher. Ich sollte proaktiv Finance-Wissen aufbauen."
2. Knowledge Gaps → Automatische Web-Recherche zu Top-3 Gaps (**ueber Governance-Queue, Phase 54** — erfordert User-Approval)
3. Procedural Optimization → "Dieses Tool-Chain-Pattern hat 90% Erfolg. Ich mache es zum Default."
4. Agent-Team-Learning → "Research+Writer funktioniert besser als Full-Team fuer kurze Aufgaben."

**Governance-Integration (kritisch):**
- Alle autonomen Aktionen (Web-Recherche, Default-Aenderungen) gehen durch Governance-Queue (Phase 54)
- `riskLevel: 'medium'` fuer Knowledge-Gap-Recherche → requiresApproval: true
- `riskLevel: 'low'` fuer Procedural-Optimization → auto-approve mit Audit-Log
- Anti-Feedback-Loop: Max 3 Self-Improvement-Aktionen pro Tag (verhindert unkontrollierte Selbstmodifikation)
- Homoeoestatische Begrenzung: Wenn Hebbian + Curiosity + Prediction Loops konvergieren auf kleine Entity-Menge → forciere Exploration in unterrepraesentierten Graph-Regionen

---

## Phasen-Uebersicht (Zusammenfassung)

| Phase | Primaer | Sekundaer | Neue Dateien | Geschaetzte Tests |
|-------|---------|-----------|-------------|-------------------|
| **125** | Hebbian KG + FSRS | Reasoning | ~5 + Migration | ~80 |
| **126** | Core Memory + Cross-Context | Agenten | ~4 + Migration | ~60 |
| **127** | GWT Context Assembly | Memory, Meta | ~12 + Tests | ~100 | **2 Sessions** |
| **128** | Chain-of-Thought + Inference | Memory | ~4 + Migration | ~80 |
| **129** | Persistent Agents + Isolation | Reasoning | ~5 + Migration | ~80 |
| **130** | Tool Composition + Teams | Output | ~4 | ~60 |
| **131** | Document Generation | Agenten | ~10 + Dependencies | ~80 | **2 Sessions** |
| **132** | CLI Agent | Memory, Agenten | ~8 (neues Package) | ~60 | **2 Sessions** |
| **133** | Curiosity Engine | Memory, Reasoning | ~5 + Migration | ~80 |
| **134** | Active Inference + Prediction | Reasoning, Agenten | ~4 + Migration | ~60 |
| **135-136** | Meta-Kognition | Alle | ~8 + Migration + Frontend | ~100 |
| **137-138** | Feedback + Adaptive | Alle | ~6 | ~80 |
| **139-140** | Integration + Emergence | Alle | ~4 | ~60 |
| **TOTAL** | | | **~89 neue Dateien** | **~980 neue Tests** |

## Abhaengigkeitsgraph

```
Phase 125 (Hebbian+FSRS) ──┬──→ Phase 127 (GWT) ────→ Phase 128 (Chains+Inference)
      ↓                    │          ↓                          ↓
Phase 126 (Core Memory) ──│──→ Phase 129 (Persistent Agents) → Phase 130 (Composition)
                           │          ↓                          ↓
                           │   Phase 131 (Documents) ────→ Phase 132 (CLI)
                           │
                           └──→ Phase 133 (Curiosity) ──→ Phase 134 (Prediction)
                                  ↑ (braucht auch 128)          ↓
                                                         Phase 135-136 (Meta-Kognition)
                                                              ↓
                                                    Phase 137-138 (Feedback+Adaptive)
                                                              ↓
                                                    Phase 139-140 (Integration)
```

**Kritischer Pfad:** 125 → 127 → 129 → 131 → 132 (Output-Track)
**Intelligence-Track:** 125 → 128 → 133 → 134 → 135 (benoetigt 125 + 128 vor 133)
**Hinweis:** Phase 133 (Curiosity) haengt von Phase 125 (Hebbian Co-Activation fuer Familiarity Buffer) UND Phase 128 (Inference Engine fuer Analogie-basierte Hypothesen) ab.

## Technologie-Stack Erweiterungen

### Neue npm Dependencies (Backend)
```json
{
  "pptxgenjs": "^3.12",    // PowerPoint Generation
  "exceljs": "^4.4",       // Excel Generation
  "pdfmake": "^0.2",       // PDF Generation
  "docx": "^9.2"           // Word Generation
}
```

### Neues Package (CLI)
```json
{
  "name": "@zenai/cli",
  "dependencies": {
    "@anthropic-ai/sdk": "latest",
    "ink": "^5.0",          // React-basierte Terminal UI
    "globby": "^14.0",      // File Globbing
    "chalk": "^5.0"         // Terminal Colors
  }
}
```

### Keine neuen Infrastructure-Kosten
- Alles laeuft auf bestehendem Railway Backend + Supabase + Redis
- Claude API Kosten steigen ~20-30% durch Background-Jobs (Curiosity, Sleep Compute, Predictions)
- Prompt Caching (Anthropic) reduziert Kosten um ~40% fuer repetitive Core Memory Blocks

## Risiken + Mitigations

| Risiko | Wahrscheinlichkeit | Mitigation |
|--------|-------------------|-----------|
| GWT zu langsam (8 parallele Module) | Mittel | 2s Timeout pro Modul, Fallback auf aktuelle lineare Pipeline |
| FSRS-Migration bricht bestehende Decay | Niedrig | Feature-Flag, A/B-Test, Rollback auf Ebbinghaus |
| CLI Security (Shell-Commands) | Hoch | Whitelist-basierte Command-Execution, User-Bestaetigung |
| Prediction Engine Over-fitting | Mittel | Min. 20 Datenpunkte pro Pattern, Regularisierung |
| Document Generation Layout-Probleme | Hoch | Einfache Templates starten, iterativ verbessern |
| Token-Kosten durch Background-Jobs | Mittel | Claude Haiku fuer alle Background-Tasks, Prompt Caching |

## Erfolgs-Metriken

| Metrik | Aktuell (Phase 124) | Ziel (Phase 140) |
|--------|---------------------|-------------------|
| Retrieval Accuracy (RAG) | ~75% | >90% (GWT + FSRS + Hebbian) |
| User Satisfaction (Feedback) | Kein Tracking | >4.0/5.0 (Calibrated) |
| Knowledge Gaps Detected | 0 | >5 pro Woche |
| Autonomous Tasks Completed | 0 | >10 pro Woche |
| Document Types Supported | 0 | 4 (PPTX, XLSX, PDF, DOCX) |
| CLI Usability | Non-existent | Comparable to Claude Code |
| Calibration Error | Unknown | <10% ECE |
| Prediction Accuracy | Non-existent | >60% Intent Prediction |

---

## Appendix A: Review-Korrekturen (Post-Review Fixes)

Die folgenden Punkte wurden nach dem Spec-Review ergaenzt:

### A.1: Phase 128 — Vector Column in Migration

Die `reasoning_chains` Tabelle muss `query_embedding` als `vector(1536)` Typ speichern, NICHT als JSONB:

```sql
CREATE TABLE IF NOT EXISTS {schema}.reasoning_chains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  query_embedding vector(1536),  -- NICHT JSONB!
  steps JSONB NOT NULL,
  conclusion TEXT,
  confidence FLOAT,
  domain VARCHAR(50),
  used_facts UUID[],
  used_tools TEXT[],
  user_feedback SMALLINT,
  reusable BOOLEAN DEFAULT false,
  reuse_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_chains_embedding ON {schema}.reasoning_chains
  USING hnsw (query_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
```

### A.2: Phase 131 — Document File Storage

Railway's Filesystem ist ephemeral. Generierte Dokumente muessen persistent gespeichert werden.

**Loesung: Supabase Storage (bereits im Stack):**
- Bucket: `generated-documents` (Private, kein Public Access)
- Upload nach Generierung: `supabase.storage.from('generated-documents').upload(path, buffer)`
- Signed URL fuer Download: 1h TTL, `supabase.storage.createSignedUrl(path, 3600)`
- Cleanup-Job: BullMQ taeglich, loescht Dateien aelter als 7 Tage

**Alternative falls Supabase Storage nicht verfuegbar:**
- Base64-Encoding in PostgreSQL BYTEA-Spalte (fuer kleine Dateien < 5MB)
- S3-kompatibel via Supabase (verwendet S3 Protokoll unter der Haube)

### A.3: Phase 127 — GWT Fallback-Strategie

Wenn GWT fehlschlaegt (alle Module Timeout, oder Gesamt-Salience zu niedrig):

```typescript
// global-workspace.ts
const GWT_FALLBACK_THRESHOLD = 0.2; // Wenn beste Salience < 0.2 → Fallback

async function assembleContext(query: string, context: QueryContext): Promise<AssembledContext> {
  try {
    const results = await Promise.allSettled(
      modules.map(m => withTimeout(m.computeSalience(query, context), 2000))
    );

    const bestSalience = Math.max(...results.filter(r => r.status === 'fulfilled').map(r => r.value.score));

    if (bestSalience < GWT_FALLBACK_THRESHOLD || results.every(r => r.status === 'rejected')) {
      // FALLBACK: Verwende die bestehende Pipeline (wird als Funktion erhalten, nicht entfernt)
      return assembleContextWithBudget(query, context); // Phase 63/99 Funktion bleibt erhalten
    }

    // Normal GWT Flow...
  } catch (error) {
    return assembleContextWithBudget(query, context); // Graceful Fallback
  }
}
```

**Wichtig:** `assembleContextWithBudget()` aus `token-budget.ts` wird NICHT entfernt. Sie bleibt als Fallback erhalten und wird erst in Phase 139 (Integration) offiziell deprecated.

### A.4: Phase 127 — GWT Integration in Chat-Pipeline

Die folgenden bestehenden Dateien werden in Phase 127 geaendert (fehlte in urspruenglicher Spec):

| Datei | Aenderung |
|-------|-----------|
| `backend/src/routes/general-chat.ts` | `assembleContextWithBudget()` Call → `globalWorkspace.assembleContext()` Call |
| `backend/src/routes/general-chat-handlers.ts` | Gleiche Aenderung fuer Handler-Varianten |
| `backend/src/services/claude/streaming.ts` | System-Prompt-Build nutzt GWT-Output statt feste Sektionen |
| `backend/src/utils/token-budget.ts` | Bleibt erhalten als Fallback (nicht deprecated in Phase 127) |

### A.5: Phase 127 — GWT Latenz-Mitigation

8 parallele Module-Queries addieren ~100-500ms Latenz (p50-p99) VOR dem Claude-Call.

**Mitigationen:**
1. **Cache:** Module-Salience wird fuer identische Queries 30s gecacht (Redis)
2. **Early-Exit:** Wenn CoreMemoryModule + ein weiteres Modul innerhalb 500ms > 0.8 Salience haben → restliche Module abbrechen
3. **Lazy Module Init:** Module die in den letzten 100 Queries nie > 0.3 Salience hatten → werden nicht aufgerufen (Adaptive Pruning)
4. **Messung:** GWT-Latenz wird als Custom Metric getracked (`gwtAssemblyDuration` in observability/metrics.ts)

### A.6: Phase 133 — Knowledge Gap State Machine

Knowledge Gaps haben einen Lifecycle (fehlte in Phase 137 Feedback-Routing):

```typescript
type GapStatus = 'detected' | 'confirmed' | 'investigating' | 'resolved' | 'dismissed';

// Feedback-Routing (Phase 137):
// suggestion_action = 'accepted' auf gap-Suggestion → gap.status = 'confirmed' → Queue fuer Investigation
// suggestion_action = 'dismissed' auf gap-Suggestion → gap.status = 'dismissed' (24h Cooldown)
// User liefert neue Fakten zu Gap-Topic → gap.status = 'resolved'
```

### A.7: Phase 125 — FSRS Varianten-Hinweis

> Die FSRS-Implementation in diesem Spec ist eine **FSRS-inspirierte Variante** mit hand-gestimmten
> Parametern, nicht die originale FSRS-5 mit ML-optimierten Gewichten (w[0..17]).
> Fuer die erste Iteration ist dies ausreichend. In Phase 137 (Feedback Revolution) koennen die
> Parameter basierend auf tatsaechlichen Recall-Daten kalibriert werden.

### A.8: Korrigierte Dauer-Schaetzungen

| Phase | Urspruenglich | Korrigiert | Begruendung |
|-------|--------------|-----------|-------------|
| 127 (GWT) | 1 Session | **2 Sessions** | 12+ Dateien, fundamentale Pipeline-Aenderung |
| 131 (Documents) | 1 Session | **2 Sessions** | 4 neue Dependencies, File Storage, Frontend |
| 132 (CLI) | 1 Session | **2 Sessions** | Neues Package, ink/blessed Learning Curve |
| Alle anderen | 1 Session | 1 Session | Realistisch |
| **TOTAL** | ~16 Sessions | **~19 Sessions** | +3 Sessions fuer komplexe Phasen |
