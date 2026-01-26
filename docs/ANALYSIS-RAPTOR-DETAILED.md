# RAPTOR: Detaillierte Technische Analyse

## Was ist RAPTOR?

**RAPTOR** = **R**ecursive **A**bstractive **P**rocessing for **T**ree-**O**rganized **R**etrieval

### Das Kernkonzept

```
Traditionelles RAG:
┌─────────────────────────────────────────────────────────────┐
│  [Doc1] [Doc2] [Doc3] [Doc4] [Doc5] [Doc6] ... [DocN]       │
│     ↓      ↓      ↓      ↓      ↓      ↓         ↓         │
│  [Emb1] [Emb2] [Emb3] [Emb4] [Emb5] [Emb6] ... [EmbN]      │
│                           │                                 │
│                    Flat Vector Search                       │
│                           ↓                                 │
│                    Top-K Ergebnisse                         │
└─────────────────────────────────────────────────────────────┘

RAPTOR:
┌─────────────────────────────────────────────────────────────┐
│                     [L0: Root Summary]                      │
│                     "Alle meine Ideen..."                   │
│                            │                                │
│            ┌───────────────┼───────────────┐                │
│            │               │               │                │
│     [L1: Cluster A]  [L1: Cluster B] [L1: Cluster C]        │
│     "KI & Tech..."   "Business..."   "Personal..."          │
│            │               │               │                │
│       ┌────┼────┐     ┌────┼────┐     ┌────┼────┐           │
│       │    │    │     │    │    │     │    │    │           │
│    [L2] [L2] [L2]  [L2] [L2] [L2]  [L2] [L2] [L2]           │
│       │    │    │     │    │    │     │    │    │           │
│    [Leaf Ideas] ...  [Leaf Ideas] ... [Leaf Ideas]          │
│                                                             │
│              Multi-Level Vector Search                      │
│              (Collapsed Tree Approach)                      │
└─────────────────────────────────────────────────────────────┘
```

### Wissenschaftliche Ergebnisse

| Benchmark | Standard RAG | RAPTOR | Verbesserung |
|-----------|--------------|--------|--------------|
| **QuALITY** (Multi-Hop) | 62% | 82% | **+20% absolut** |
| NarrativeQA | 76% | 83% | +7% |
| QASPER | 71% | 78% | +7% |

**Quelle**: [arXiv:2401.18059](https://arxiv.org/abs/2401.18059) - ICLR 2024

---

## Aktueller Stand in KI-AB

### Was bereits existiert

```
┌─────────────────────────────────────────────────────────────┐
│                    KI-AB Current RAG                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐                                        │
│  │ Enhanced RAG    │ ← Orchestriert alles                   │
│  └────────┬────────┘                                        │
│           │                                                 │
│  ┌────────┴────────────────────────────────────┐            │
│  │                                             │            │
│  ▼                                             ▼            │
│  ┌─────────────────┐              ┌─────────────────┐       │
│  │     HyDE        │              │  Agentic RAG    │       │
│  │ (Hypothetische  │              │ (5 Strategien)  │       │
│  │  Dokumente)     │              │                 │       │
│  └────────┬────────┘              └────────┬────────┘       │
│           │                                │                │
│           └───────────────┬────────────────┘                │
│                           ▼                                 │
│              ┌─────────────────────┐                        │
│              │ Cross-Encoder       │                        │
│              │ Re-Ranking          │                        │
│              └─────────────────────┘                        │
│                                                             │
│  Zusätzlich:                                                │
│  ✅ Knowledge Graph (14 Relation-Typen)                     │
│  ✅ Topic Clustering (K-Means, 2-Level)                     │
│  ✅ Semantic Cache                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Datenbank-Schema (aktuell)

```sql
-- Haupttabelle
ideas (
  id UUID,
  title, summary, raw_transcript,
  embedding vector(768),        ← Flache Struktur
  context (personal|work),
  ...
)

-- Existierende Hierarchie (2-Level)
idea_topics (
  id UUID,
  name, description,
  centroid_embedding vector(768),
  idea_count INTEGER
)

idea_topic_memberships (
  topic_id UUID,
  idea_id UUID,
  membership_score FLOAT
)

-- Knowledge Graph
idea_relations (
  source_id, target_id,
  relation_type,               ← 14 Typen
  strength FLOAT
)
```

### Was fehlt für RAPTOR

| Komponente | Aktuell | Für RAPTOR benötigt |
|------------|---------|---------------------|
| Hierarchie-Tiefe | 2 Level | 5-10 Level |
| Node-Summaries | Nur User-Input | LLM-generiert pro Cluster |
| Parent-Child Links | Indirekt (Topics) | Explizit (Tree) |
| Collapsed Tree Index | ❌ | ✅ Alle Level durchsuchbar |
| Incremental Updates | ❌ | ✅ Bei neuen Ideen |

---

## RAPTOR Implementation für KI-AB

### Neue Datenbank-Tabellen

```sql
-- Hierarchische Knoten
CREATE TABLE raptor_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(20) NOT NULL,

  -- Hierarchie
  level INTEGER NOT NULL,           -- 0 = Leaf (Idee), 1+ = Cluster
  parent_id UUID REFERENCES raptor_nodes(id),
  is_leaf BOOLEAN DEFAULT false,

  -- Inhalt
  title VARCHAR(500),
  summary TEXT,                     -- LLM-generiert
  embedding vector(768),

  -- Metriken
  coherence_score FLOAT,            -- Intra-Cluster Ähnlichkeit
  idea_count INTEGER DEFAULT 0,

  -- Meta
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Welche Ideen gehören zu welchem Knoten
CREATE TABLE raptor_memberships (
  node_id UUID REFERENCES raptor_nodes(id) ON DELETE CASCADE,
  idea_id UUID REFERENCES ideas(id) ON DELETE CASCADE,
  membership_score FLOAT DEFAULT 1.0,
  PRIMARY KEY (node_id, idea_id)
);

-- Indices für Performance
CREATE INDEX idx_raptor_parent ON raptor_nodes(parent_id);
CREATE INDEX idx_raptor_level ON raptor_nodes(level);
CREATE INDEX idx_raptor_context ON raptor_nodes(context);
CREATE INDEX idx_raptor_embedding ON raptor_nodes
  USING hnsw (embedding vector_cosine_ops);
```

### Neue Services

#### 1. `raptor-clustering.ts`

```typescript
/**
 * Hierarchisches Clustering für RAPTOR Tree
 */

import { kmeans } from 'ml-kmeans';
import { generateEmbedding } from '../utils/ollama';

interface ClusterResult {
  clusters: Array<{
    centroid: number[];
    members: string[];  // idea IDs
    coherence: number;
  }>;
}

/**
 * Bottom-Up Clustering
 * Startet mit Ideen, gruppiert rekursiv nach oben
 */
export async function buildClusterHierarchy(
  ideas: Array<{ id: string; embedding: number[] }>,
  options: {
    minClusterSize: number;    // Default: 3
    maxClusterSize: number;    // Default: 10
    targetClusters?: number;   // Wenn nicht gesetzt: sqrt(n)
  }
): Promise<ClusterResult> {
  const n = ideas.length;

  // Zu wenige Ideen für Clustering
  if (n < options.minClusterSize * 2) {
    return { clusters: [{
      centroid: calculateCentroid(ideas.map(i => i.embedding)),
      members: ideas.map(i => i.id),
      coherence: 1.0
    }]};
  }

  // K-Means Clustering
  const k = options.targetClusters || Math.ceil(Math.sqrt(n));
  const embeddings = ideas.map(i => i.embedding);

  const result = kmeans(embeddings, k, {
    initialization: 'kmeans++',
    maxIterations: 100,
  });

  // Ergebnisse gruppieren
  const clusters: ClusterResult['clusters'] = [];

  for (let i = 0; i < k; i++) {
    const members = ideas
      .filter((_, idx) => result.clusters[idx] === i)
      .map(idea => idea.id);

    if (members.length >= options.minClusterSize) {
      const memberEmbeddings = members.map(id =>
        ideas.find(i => i.id === id)!.embedding
      );

      clusters.push({
        centroid: result.centroids[i],
        members,
        coherence: calculateCoherence(memberEmbeddings),
      });
    }
  }

  return { clusters };
}

function calculateCentroid(embeddings: number[][]): number[] {
  const dim = embeddings[0].length;
  const centroid = new Array(dim).fill(0);

  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      centroid[i] += emb[i] / embeddings.length;
    }
  }

  return centroid;
}

function calculateCoherence(embeddings: number[][]): number {
  if (embeddings.length < 2) return 1.0;

  const centroid = calculateCentroid(embeddings);
  let totalSim = 0;

  for (const emb of embeddings) {
    totalSim += cosineSimilarity(emb, centroid);
  }

  return totalSim / embeddings.length;
}
```

#### 2. `raptor-summarization.ts`

```typescript
/**
 * LLM-basierte Zusammenfassungen für RAPTOR Cluster
 */

import { generateClaudeResponse } from './claude';

const CLUSTER_SUMMARY_PROMPT = `Du fasst eine Gruppe von Ideen zusammen.

IDEEN:
{ideas}

Erstelle eine prägnante Zusammenfassung (2-3 Sätze), die:
1. Das gemeinsame Thema identifiziert
2. Die wichtigsten Aspekte nennt
3. Den Wert der Gruppe beschreibt

Format:
{
  "title": "Kurzer Titel (3-5 Wörter)",
  "summary": "Zusammenfassung (2-3 Sätze)",
  "keywords": ["keyword1", "keyword2", "keyword3"]
}`;

export async function generateClusterSummary(
  ideas: Array<{ title: string; summary: string }>,
  level: number
): Promise<{ title: string; summary: string; keywords: string[] }> {
  const ideasText = ideas
    .map((idea, i) => `${i + 1}. ${idea.title}: ${idea.summary}`)
    .join('\n');

  const prompt = CLUSTER_SUMMARY_PROMPT.replace('{ideas}', ideasText);

  const response = await generateClaudeResponse(
    'Du bist ein Experte für Informationssynthese.',
    prompt,
    { maxTokens: 300, temperature: 0.3 }
  );

  // JSON extrahieren
  const match = response.match(/\{[\s\S]*\}/);
  if (match) {
    return JSON.parse(match[0]);
  }

  // Fallback
  return {
    title: `Cluster Level ${level}`,
    summary: response.substring(0, 200),
    keywords: [],
  };
}
```

#### 3. `raptor-builder.ts`

```typescript
/**
 * RAPTOR Tree Builder
 * Erstellt und aktualisiert die hierarchische Struktur
 */

export interface RaptorBuildResult {
  treeId: string;
  levels: number;
  totalNodes: number;
  leafCount: number;
  buildTimeMs: number;
}

export async function buildRaptorTree(
  context: AIContext,
  options: {
    minClusterSize?: number;
    maxLevels?: number;
    forceRebuild?: boolean;
  } = {}
): Promise<RaptorBuildResult> {
  const startTime = Date.now();
  const { minClusterSize = 3, maxLevels = 5 } = options;

  logger.info('Building RAPTOR tree', { context, options });

  // 1. Alle Ideen mit Embeddings laden
  const ideas = await loadIdeasWithEmbeddings(context);

  if (ideas.length < minClusterSize * 2) {
    logger.info('Not enough ideas for RAPTOR tree', { count: ideas.length });
    return { treeId: '', levels: 0, totalNodes: 0, leafCount: ideas.length, buildTimeMs: 0 };
  }

  // 2. Alte Daten löschen (wenn Rebuild)
  if (options.forceRebuild) {
    await deleteExistingTree(context);
  }

  // 3. Level 0: Leaf Nodes (Ideen selbst)
  const leafNodes = await createLeafNodes(ideas, context);

  // 4. Rekursiv nach oben clustern
  let currentLevel = leafNodes;
  let level = 1;
  let totalNodes = leafNodes.length;

  while (currentLevel.length > 1 && level <= maxLevels) {
    logger.debug('Building RAPTOR level', { level, nodeCount: currentLevel.length });

    // Clustern
    const clusters = await buildClusterHierarchy(
      currentLevel.map(n => ({ id: n.id, embedding: n.embedding })),
      { minClusterSize, maxClusterSize: 10 }
    );

    // Zusammenfassungen generieren
    const newLevelNodes: RaptorNode[] = [];

    for (const cluster of clusters.clusters) {
      // Ideen für Summary laden
      const memberIdeas = await loadIdeasForNodes(cluster.members);

      // LLM Summary generieren
      const summary = await generateClusterSummary(memberIdeas, level);

      // Embedding für Summary
      const embedding = await generateEmbedding(
        `${summary.title} ${summary.summary}`
      );

      // Node erstellen
      const node = await createRaptorNode({
        context,
        level,
        title: summary.title,
        summary: summary.summary,
        embedding,
        coherence: cluster.coherence,
        childIds: cluster.members,
      });

      newLevelNodes.push(node);
      totalNodes++;
    }

    currentLevel = newLevelNodes;
    level++;
  }

  // 5. Root Node erstellen (falls mehrere Top-Level Nodes)
  if (currentLevel.length > 1) {
    await createRootNode(currentLevel, context);
    totalNodes++;
  }

  const buildTimeMs = Date.now() - startTime;

  logger.info('RAPTOR tree built', {
    context,
    levels: level,
    totalNodes,
    leafCount: ideas.length,
    buildTimeMs,
  });

  return {
    treeId: `raptor_${context}_${Date.now()}`,
    levels: level,
    totalNodes,
    leafCount: ideas.length,
    buildTimeMs,
  };
}

/**
 * Inkrementelles Update bei neuer Idee
 */
export async function updateRaptorTreeIncremental(
  ideaId: string,
  context: AIContext
): Promise<void> {
  // 1. Idee laden
  const idea = await loadIdeaWithEmbedding(ideaId);

  // 2. Nächsten Cluster finden (Level 1)
  const nearestCluster = await findNearestCluster(idea.embedding, context, 1);

  if (!nearestCluster) {
    // Neuen Leaf Node erstellen
    await createLeafNode(idea, context);
    return;
  }

  // 3. Membership hinzufügen
  await addToCluster(nearestCluster.id, ideaId);

  // 4. Coherence prüfen
  const newCoherence = await recalculateCoherence(nearestCluster.id);

  // 5. Wenn Coherence zu niedrig, Re-Clustering triggern
  if (newCoherence < 0.5) {
    await schedulePartialRebuild(nearestCluster.id);
  }

  // 6. Parent-Nodes nach oben aktualisieren
  await propagateUpdateUpward(nearestCluster.id);
}
```

#### 4. `raptor-retrieval.ts`

```typescript
/**
 * RAPTOR-basierte Retrieval Strategie
 */

export interface RaptorRetrievalResult {
  results: Array<{
    id: string;
    title: string;
    summary: string;
    score: number;
    level: number;      // 0 = Idee, 1+ = Cluster
    isLeaf: boolean;
  }>;
  levels: {
    overview: string[];   // High-level summaries
    details: string[];    // Leaf ideas
  };
}

/**
 * Collapsed Tree Search
 * Sucht über alle Ebenen gleichzeitig
 */
export async function collapsedTreeSearch(
  query: string,
  context: AIContext,
  options: {
    maxResults?: number;
    includeLevels?: number[];  // Welche Ebenen durchsuchen
  } = {}
): Promise<RaptorRetrievalResult> {
  const { maxResults = 10 } = options;

  // 1. Query embedden
  const queryEmbedding = await generateEmbedding(query);

  // 2. Über alle Ebenen suchen
  const results = await queryContext(
    context,
    `SELECT
       id, title, summary, level, is_leaf,
       1 - (embedding <=> $1) as similarity
     FROM raptor_nodes
     WHERE context = $2
     ORDER BY embedding <=> $1
     LIMIT $3`,
    [`[${queryEmbedding.join(',')}]`, context, maxResults * 2]
  );

  // 3. Ergebnisse gruppieren
  const overview: string[] = [];
  const details: string[] = [];

  for (const row of results.rows) {
    if (row.level > 0) {
      overview.push(row.id);
    } else {
      details.push(row.id);
    }
  }

  return {
    results: results.rows.map(r => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      score: parseFloat(r.similarity),
      level: r.level,
      isLeaf: r.is_leaf,
    })).slice(0, maxResults),
    levels: { overview, details },
  };
}

/**
 * Hierarchical Traversal
 * Top-Down durch den Baum navigieren
 */
export async function hierarchicalTraversal(
  query: string,
  context: AIContext,
  options: {
    startLevel?: number;  // Default: höchste Ebene (Root)
    maxDepth?: number;    // Wie tief traversieren
  } = {}
): Promise<RaptorRetrievalResult> {
  const { maxDepth = 3 } = options;

  const queryEmbedding = await generateEmbedding(query);
  const results: RaptorRetrievalResult['results'] = [];

  // 1. Root finden
  let currentNodes = await findRootNodes(context);

  // 2. Top-Down traversieren
  for (let depth = 0; depth < maxDepth && currentNodes.length > 0; depth++) {
    // Beste Matches auf aktueller Ebene
    const scored = await scoreNodes(currentNodes, queryEmbedding);
    const best = scored.filter(n => n.score > 0.5).slice(0, 3);

    results.push(...best);

    // Kinder der besten Nodes holen
    currentNodes = await getChildNodes(best.map(n => n.id));
  }

  return {
    results,
    levels: {
      overview: results.filter(r => r.level > 0).map(r => r.id),
      details: results.filter(r => r.level === 0).map(r => r.id),
    },
  };
}
```

---

## Kosten-Analyse

### Implementierungskosten (Einmalig)

| Komponente | Tage | Komplexität |
|------------|------|-------------|
| DB Schema & Migrations | 1-2 | Niedrig |
| Clustering Service | 2-3 | Mittel |
| Summarization Service | 2-3 | Mittel |
| Tree Builder | 2-3 | Hoch |
| Incremental Updates | 1-2 | Mittel |
| Retrieval Integration | 2-3 | Mittel |
| Scheduler Integration | 1 | Niedrig |
| Tests | 2-3 | Mittel |
| **Gesamt** | **13-20 Tage** | - |

### API-Kosten (Laufend)

| Operation | Frequenz | Claude Calls | Kosten |
|-----------|----------|--------------|--------|
| **Initial Build** | Einmalig | ~50-100 | ~$5-10 |
| **Nightly Rebuild** | Täglich | ~20-50 | ~$2-5/Tag |
| **Incremental Update** | Pro neue Idee | 1-3 | ~$0.01-0.03 |
| **Monatliche Kosten** | | | **~$60-150/Monat** |

### Vergleich: RAPTOR vs. Alternativen

| Aspekt | Aktuell (Enhanced RAG) | RAPTOR | Simples Topic Enhancement |
|--------|------------------------|--------|---------------------------|
| Implementierung | ✅ Fertig | 13-20 Tage | 2-3 Tage |
| API-Kosten/Monat | ~$0 | ~$60-150 | ~$5-10 |
| Überblicks-Fragen | ❌ | ✅✅✅ | ✅ |
| Detail-Suche | ✅✅✅ | ✅✅ | ✅✅ |
| Multi-Hop Reasoning | ✅ (Knowledge Graph) | ✅✅ | ✅ |
| Wartungsaufwand | Niedrig | Hoch | Niedrig |

---

## Wann lohnt sich RAPTOR?

### JA - RAPTOR implementieren wenn:

1. **>500 Ideen** pro Context
2. **Überblicks-Fragen** sind häufig ("Was sind meine Hauptthemen?")
3. **Multi-Hop Reasoning** über viele Dokumente wichtig
4. **Budget** für ~$100/Monat API-Kosten vorhanden
5. **Zeit** für 2-3 Wochen Implementierung vorhanden

### NEIN - RAPTOR überspringen wenn:

1. **<200 Ideen** - Flache Suche reicht
2. **Detail-Fokus** - Meiste Fragen sind spezifisch
3. **Knowledge Graph** deckt Beziehungen ab
4. **Budget-sensitiv** - $100/Monat ist signifikant
5. **Time-to-Market** ist kritisch

---

## Empfehlung für KI-AB

### Kurzfristig: Topic Enhancement (Simpler Ansatz)

```typescript
// Nutze existierende topic_clustering, erweitere um Summaries
// 2-3 Tage Aufwand, ~$10/Monat

// Neuer Endpoint: GET /api/:context/topics/overview
{
  "topics": [
    {
      "name": "KI & Machine Learning",
      "summary": "LLM-generierte Zusammenfassung...",
      "ideaCount": 15,
      "topIdeas": ["id1", "id2", "id3"]
    }
  ]
}
```

### Mittelfristig: RAPTOR evaluieren

- Wenn Nutzer >500 Ideen haben
- Wenn "Überblick"-Features gewünscht werden
- Wenn Budget verfügbar ist

### Langfristig: Vollständiges RAPTOR

- Wenn System skaliert
- Wenn Multi-Tenant
- Wenn Enterprise-Features gewünscht

---

## Fazit

**RAPTOR ist eine mächtige Technologie, aber für KI-AB aktuell Over-Engineering.**

| Faktor | Bewertung |
|--------|-----------|
| Technischer Wert | ⭐⭐⭐⭐⭐ (5/5) |
| ROI für KI-AB aktuell | ⭐⭐ (2/5) |
| Implementierungsaufwand | Hoch (2-3 Wochen) |
| Laufende Kosten | Mittel (~$100/Monat) |
| **Empfehlung** | **Später, wenn >500 Ideen** |

**Alternative**: Einfaches Topic-Summary Feature als 80/20-Lösung.
