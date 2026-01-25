# Post-Merge Aufgaben - KI-Führungsposition 2026

## Branch

```
claude/review-dev-status-cTMoD
```

## PR erstellen (von deinem Rechner)

```bash
git fetch origin
git checkout claude/review-dev-status-cTMoD

# PR erstellen
gh pr create --title "feat: KI-Führungsposition 2026 - Memory, Thinking & Knowledge Graph" --body-file PR_DESCRIPTION.md
```

---

## Nach dem Merge: Pflicht-Aufgaben

### 1. Datenbank-Migrationen ausführen

**Standard PostgreSQL:**
```bash
psql -U postgres -d personal_ai -f backend/src/db/migrations/012_episodic_memory.sql
psql -U postgres -d personal_ai -f backend/src/db/migrations/013_knowledge_graph_temporal.sql
```

**Docker:**
```bash
docker exec -i ai-brain-postgres psql -U postgres -d personal_ai < backend/src/db/migrations/012_episodic_memory.sql
docker exec -i ai-brain-postgres psql -U postgres -d personal_ai < backend/src/db/migrations/013_knowledge_graph_temporal.sql
```

**Erwartete Ausgabe:**
```
============================================
Phase 1 Migration Verification:
  episodic_memories table:    OK
  working_memory_sessions:    OK
  thinking_chains table:      OK
  HNSW indexes:               OK
============================================

============================================
Phase 3 Migration Verification:
  Temporal columns:          OK
  relation_history:          OK
  auto_discovery_queue:      OK
  discovered_patterns:       OK
  mv_graph_statistics:       OK
============================================
```

---

## Empfohlene Aufgaben

### 2. Cron-Jobs einrichten

Füge diese Jobs zu deinem Scheduler hinzu (z.B. node-cron, pg_cron, oder system cron):

```typescript
// In deiner scheduler.ts oder ähnlich:
import {
  applyGraphDecay,
  processDiscoveryQueue,
  runGraphEvolutionCycle
} from './services/knowledge-graph';

// Alle 15 Minuten: Auto-Discovery Queue verarbeiten
cron.schedule('*/15 * * * *', async () => {
  await processDiscoveryQueue();
});

// Täglich um 3:00 Uhr: Kompletter Evolution-Zyklus
cron.schedule('0 3 * * *', async () => {
  await runGraphEvolutionCycle('personal');
  await runGraphEvolutionCycle('work');
});
```

### 3. Integration in bestehende Logik

**Extended Thinking mit Dynamic Budget:**
```typescript
// Alt:
const result = await generateWithExtendedThinking(systemPrompt, userPrompt, options);

// Neu (empfohlen):
import { generateWithDynamicThinking } from './services/claude/extended-thinking';
const result = await generateWithDynamicThinking(systemPrompt, userPrompt, context, {
  useDynamicBudget: true,
  storeChain: true,  // Lernt aus erfolgreichen Chains
});
```

**Episodic Memory bei wichtigen Interaktionen:**
```typescript
import { episodicMemory } from './services/memory';

// Nach wichtiger Interaktion:
await episodicMemory.recordEpisode(
  userId,
  context,
  'conversation',
  'Wichtiges Gespräch über Projektplanung',
  { relatedIdeas: [ideaId1, ideaId2] }
);
```

**Auto-Discovery für neue Ideen:**
```typescript
import { queueForDiscovery } from './services/knowledge-graph';

// Nach Erstellen einer neuen Idee:
await queueForDiscovery(newIdeaId, context, 8);  // Priorität 8 = hoch
```

---

## Test-Checkliste

- [ ] `npx tsc --noEmit` - Keine TypeScript-Fehler
- [ ] Migration 012 erfolgreich
- [ ] Migration 013 erfolgreich
- [ ] Backend startet ohne Fehler
- [ ] Episodic Memory funktioniert
- [ ] Working Memory funktioniert
- [ ] Dynamic Thinking Budget funktioniert
- [ ] Knowledge Graph Decay funktioniert
- [ ] Auto-Discovery Queue funktioniert

---

## Implementierte Features

### Phase 1: HiMeS 4-Layer Memory
| Layer | Service | Funktion |
|-------|---------|----------|
| 1 | Working Memory | 7±2 Slots, Spreading Activation |
| 2 | Episodic Memory | Konkrete Erfahrungen, Emotionen |
| 3 | Short-Term | Existierend (Conversation Memory) |
| 4 | Long-Term | Existierend (PostgreSQL + Vectors) |

### Phase 2: Extended Thinking Dynamic Budget
- 8 Task-Typ-Klassifikationen
- Komplexitätsanalyse
- Lernen aus erfolgreichen Thinking Chains
- Spezialisierte Funktionen (Business, Architecture, Synthesis, Problem-Solving)

### Phase 3: Knowledge Graph Evolution
- Temporal Edges (valid_from, valid_until)
- Decay + Reinforcement Mechanik
- Auto-Discovery via Embedding-Ähnlichkeit
- LLM-gestützte Relation-Klassifikation
- Pattern Learning (Co-Occurrence, Temporal Sequences)

---

*Erstellt: 2026-01-25*
*Branch: claude/review-dev-status-cTMoD*
