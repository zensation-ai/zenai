# KI-AB: Strategischer Ausbauplan 2026

## Vision: Führende Personal AI Brain Architektur

---

## Teil 1: Führende Bereiche - Ausbau & Polish

---

### 1. EXTENDED THINKING SYSTEM

**Aktueller Stand:** Top 5% - 128k Token Budget implementiert

**Ziel:** Vollständige Ausschöpfung des Extended Thinking Potentials

#### 1.1 Thinking Budget Optimization

**Datei:** `backend/src/services/claude/extended-thinking.ts`

```typescript
// AKTUELL: Statisches Budget
const { thinkingBudget = 10000 } = options;

// AUSBAU: Dynamisches Budget basierend auf Task-Komplexität
interface ThinkingBudgetStrategy {
  taskType: TaskType;
  baseTokens: number;
  complexityMultiplier: number;
  maxTokens: number;
}

const BUDGET_STRATEGIES: Record<TaskType, ThinkingBudgetStrategy> = {
  'simple_structuring': {
    taskType: 'simple_structuring',
    baseTokens: 2000,
    complexityMultiplier: 1.0,
    maxTokens: 5000,
  },
  'complex_analysis': {
    taskType: 'complex_analysis',
    baseTokens: 15000,
    complexityMultiplier: 1.5,
    maxTokens: 40000,
  },
  'multi_document_synthesis': {
    taskType: 'multi_document_synthesis',
    baseTokens: 25000,
    complexityMultiplier: 2.0,
    maxTokens: 80000,
  },
  'strategic_planning': {
    taskType: 'strategic_planning',
    baseTokens: 40000,
    complexityMultiplier: 2.5,
    maxTokens: 128000,
  },
};

// Komplexitäts-Analyse vor dem Call
function analyzeComplexity(input: string, context: AIContext): ComplexityScore {
  return {
    documentCount: countDocuments(input),
    questionDepth: analyzeQuestionDepth(input),
    crossReferenceNeed: detectCrossReferences(input),
    temporalComplexity: detectTemporalReferences(input),
    score: calculateOverallComplexity(),
  };
}

function calculateDynamicBudget(
  taskType: TaskType,
  complexity: ComplexityScore
): number {
  const strategy = BUDGET_STRATEGIES[taskType];
  const adjusted = strategy.baseTokens * complexity.score * strategy.complexityMultiplier;
  return Math.min(adjusted, strategy.maxTokens);
}
```

#### 1.2 Thinking Chain Persistence

**Neue Datei:** `backend/src/services/claude/thinking-chain.ts`

```typescript
// Speichere Thinking-Chains für Lernzwecke
interface ThinkingChain {
  id: string;
  sessionId: string;
  taskType: TaskType;
  inputHash: string;
  thinkingContent: string;
  thinkingTokensUsed: number;
  responseQuality: number; // 0-1, aus Feedback
  createdAt: Date;
}

// Schema
const THINKING_CHAIN_TABLE = `
CREATE TABLE IF NOT EXISTS thinking_chains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(100) NOT NULL,
  task_type VARCHAR(50) NOT NULL,
  input_hash VARCHAR(64) NOT NULL,
  thinking_content TEXT NOT NULL,
  thinking_tokens_used INTEGER NOT NULL,
  response_quality DECIMAL(3,2),
  embedding vector(768),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_thinking_task_type (task_type),
  INDEX idx_thinking_quality (response_quality DESC),
  INDEX idx_thinking_embedding (embedding vector_cosine_ops)
);
`;

// Retrieval: Finde ähnliche erfolgreiche Thinking-Chains
async function findSimilarSuccessfulChains(
  input: string,
  taskType: TaskType,
  minQuality: number = 0.8
): Promise<ThinkingChain[]> {
  const inputEmbedding = await generateEmbedding(input);

  return await query(`
    SELECT * FROM thinking_chains
    WHERE task_type = $1
      AND response_quality >= $2
    ORDER BY embedding <=> $3
    LIMIT 3
  `, [taskType, minQuality, formatForPgVector(inputEmbedding)]);
}

// Nutze erfolgreiche Patterns als Priming
async function primeWithSuccessfulPatterns(
  input: string,
  taskType: TaskType
): Promise<string> {
  const similarChains = await findSimilarSuccessfulChains(input, taskType);

  if (similarChains.length === 0) return '';

  return `
[ERFOLGREICHE DENKSTRATEGIEN FÜR ÄHNLICHE AUFGABEN]
${similarChains.map((chain, i) => `
Strategie ${i + 1} (Qualität: ${chain.responseQuality}):
${extractKeyInsights(chain.thinkingContent)}
`).join('\n')}

Nutze diese Strategien als Inspiration, aber entwickle eigenständige Gedanken.
`;
}
```

#### 1.3 Thinking Quality Feedback Loop

```typescript
// API Endpoint für Thinking-Feedback
// POST /api/thinking/feedback
interface ThinkingFeedback {
  thinkingChainId: string;
  wasHelpful: boolean;
  qualityRating: 1 | 2 | 3 | 4 | 5;
  specificFeedback?: string;
}

async function recordThinkingFeedback(feedback: ThinkingFeedback): Promise<void> {
  const normalizedQuality = feedback.qualityRating / 5;

  await query(`
    UPDATE thinking_chains
    SET response_quality = $2,
        feedback_text = $3,
        feedback_at = NOW()
    WHERE id = $1
  `, [feedback.thinkingChainId, normalizedQuality, feedback.specificFeedback]);

  // Trigger: Re-Analyse der Budget-Strategien
  await analyzeAndOptimizeBudgetStrategies();
}

// Wöchentliche Optimierung der Budget-Strategien
async function analyzeAndOptimizeBudgetStrategies(): Promise<void> {
  const stats = await query(`
    SELECT task_type,
           AVG(thinking_tokens_used) as avg_tokens,
           AVG(response_quality) as avg_quality,
           CORR(thinking_tokens_used, response_quality) as token_quality_correlation
    FROM thinking_chains
    WHERE created_at > NOW() - INTERVAL '7 days'
      AND response_quality IS NOT NULL
    GROUP BY task_type
  `);

  // Passe Strategien an basierend auf Korrelation
  for (const stat of stats.rows) {
    if (stat.token_quality_correlation > 0.3) {
      // Mehr Tokens = bessere Qualität -> erhöhe Budget
      BUDGET_STRATEGIES[stat.task_type].baseTokens *= 1.1;
    } else if (stat.token_quality_correlation < -0.1) {
      // Mehr Tokens hilft nicht -> reduziere Budget
      BUDGET_STRATEGIES[stat.task_type].baseTokens *= 0.9;
    }
  }
}
```

#### 1.4 Extended Thinking für spezifische Use-Cases

```typescript
// Spezialisierte Extended Thinking Funktionen

// 1. Strategic Business Analysis
async function analyzeBusinessOpportunity(
  opportunity: string,
  context: AIContext
): Promise<BusinessAnalysis> {
  const profile = await getBusinessProfile(context);

  return await generateWithExtendedThinking(
    `Du bist ein erfahrener Business-Stratege.

[UNTERNEHMENSKONTEXT]
${profile.businessModel}
${profile.currentChallenges}
${profile.competitiveAdvantages}

Analysiere systematisch:
1. Market Fit
2. Competitive Landscape
3. Resource Requirements
4. Risk Assessment
5. Implementation Roadmap`,

    opportunity,
    { thinkingBudget: 50000, maxTokens: 8000 }
  );
}

// 2. Technical Architecture Review
async function reviewArchitectureDecision(
  decision: string,
  codeContext: string
): Promise<ArchitectureReview> {
  return await generateWithExtendedThinking(
    `Du bist ein Senior Software Architect.

Analysiere diese Architekturentscheidung:
- Skalierbarkeit
- Wartbarkeit
- Performance-Implikationen
- Security-Bedenken
- Alternative Ansätze
- Migrationspfad`,

    `ENTSCHEIDUNG: ${decision}\n\nKONTEXT:\n${codeContext}`,
    { thinkingBudget: 40000, maxTokens: 6000 }
  );
}

// 3. Multi-Document Synthesis
async function synthesizeDocuments(
  documents: Document[],
  synthesisGoal: string
): Promise<Synthesis> {
  const docsText = documents.map(d =>
    `[${d.title}]\n${d.content}`
  ).join('\n\n---\n\n');

  return await generateWithExtendedThinking(
    `Du synthetisierst mehrere Dokumente zu einer kohärenten Analyse.

ZIEL: ${synthesisGoal}

Identifiziere:
- Gemeinsame Themen
- Widersprüche
- Wissenslücken
- Handlungsempfehlungen`,

    docsText,
    { thinkingBudget: 80000, maxTokens: 10000 }
  );
}
```

---

### 2. HIMES MEMORY ARCHITECTURE

**Aktueller Stand:** Top 5% - 3-Layer System mit Konsolidierung

**Ziel:** Biologisch akkurateres Memory System mit verbesserter Retrieval-Qualität

#### 2.1 Episodic Memory Layer (NEU)

**Neue Datei:** `backend/src/services/memory/episodic-memory.ts`

```typescript
// Episodisches Gedächtnis: Speichert konkrete Erlebnisse/Interaktionen
// Biologisches Vorbild: Hippocampus-Episodic Memory

interface Episode {
  id: string;
  timestamp: Date;
  context: AIContext;

  // Was passierte
  trigger: string;          // User Input
  response: string;         // AI Response

  // Emotionaler Kontext (aus Sprache inferiert)
  emotionalValence: number; // -1 (negativ) bis +1 (positiv)
  emotionalArousal: number; // 0 (ruhig) bis 1 (aufgeregt)

  // Räumlich-zeitlicher Kontext
  temporalContext: {
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    dayOfWeek: string;
    isWeekend: boolean;
  };

  // Verknüpfungen
  linkedEpisodes: string[]; // Ähnliche Episoden
  linkedFacts: string[];    // Extrahierte Fakten

  // Retrieval-Statistiken
  retrievalCount: number;
  lastRetrieved: Date | null;
  retrievalStrength: number; // Decay-basiert

  // Embedding für Similarity Search
  embedding: number[];
}

// Schema
const EPISODIC_MEMORY_TABLE = `
CREATE TABLE IF NOT EXISTS episodic_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context VARCHAR(50) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  trigger TEXT NOT NULL,
  response TEXT NOT NULL,

  emotional_valence DECIMAL(3,2) DEFAULT 0,
  emotional_arousal DECIMAL(3,2) DEFAULT 0.5,

  time_of_day VARCHAR(20),
  day_of_week VARCHAR(20),
  is_weekend BOOLEAN,

  linked_episodes UUID[] DEFAULT '{}',
  linked_facts UUID[] DEFAULT '{}',

  retrieval_count INTEGER DEFAULT 0,
  last_retrieved TIMESTAMPTZ,
  retrieval_strength DECIMAL(5,4) DEFAULT 1.0,

  embedding vector(768),

  INDEX idx_episodic_context (context),
  INDEX idx_episodic_time (timestamp DESC),
  INDEX idx_episodic_emotional (emotional_valence, emotional_arousal),
  INDEX idx_episodic_embedding (embedding vector_cosine_ops)
);
`;

class EpisodicMemoryService {
  // Speichere neue Episode
  async store(
    trigger: string,
    response: string,
    context: AIContext
  ): Promise<Episode> {
    const embedding = await generateEmbedding(`${trigger} ${response}`);
    const emotional = await this.analyzeEmotionalContent(trigger, response);
    const temporal = this.getTemporalContext();

    // Finde ähnliche Episoden für Verlinkung
    const similar = await this.findSimilarEpisodes(embedding, context, 3);

    const episode = await query(`
      INSERT INTO episodic_memories (
        context, trigger, response,
        emotional_valence, emotional_arousal,
        time_of_day, day_of_week, is_weekend,
        linked_episodes, embedding
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      context, trigger, response,
      emotional.valence, emotional.arousal,
      temporal.timeOfDay, temporal.dayOfWeek, temporal.isWeekend,
      similar.map(e => e.id), formatForPgVector(embedding)
    ]);

    return episode.rows[0];
  }

  // Emotionale Analyse via Claude (schnell)
  private async analyzeEmotionalContent(
    trigger: string,
    response: string
  ): Promise<{ valence: number; arousal: number }> {
    const result = await claudeClient.messages.create({
      model: 'claude-haiku-3',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: `Analysiere emotional (JSON):
Input: "${trigger.substring(0, 200)}"
Response: "${response.substring(0, 200)}"
{"valence": -1 bis 1, "arousal": 0 bis 1}`
      }]
    });

    return JSON.parse(extractText(result));
  }

  // Retrieval mit Decay & Emotional Priming
  async retrieve(
    query: string,
    context: AIContext,
    options: EpisodicRetrievalOptions = {}
  ): Promise<Episode[]> {
    const {
      limit = 5,
      emotionalFilter,
      temporalFilter,
      minStrength = 0.1,
    } = options;

    const queryEmbedding = await generateEmbedding(query);

    let sql = `
      SELECT *,
             1 - (embedding <=> $2) as semantic_similarity,
             retrieval_strength *
               POWER(0.95, EXTRACT(DAYS FROM NOW() - timestamp)) as decayed_strength
      FROM episodic_memories
      WHERE context = $1
        AND retrieval_strength >= $3
    `;

    const params: any[] = [context, formatForPgVector(queryEmbedding), minStrength];

    // Emotional Filter
    if (emotionalFilter) {
      sql += ` AND emotional_valence BETWEEN $${params.length + 1} AND $${params.length + 2}`;
      params.push(emotionalFilter.minValence, emotionalFilter.maxValence);
    }

    // Temporal Filter
    if (temporalFilter?.timeOfDay) {
      sql += ` AND time_of_day = $${params.length + 1}`;
      params.push(temporalFilter.timeOfDay);
    }

    sql += ` ORDER BY semantic_similarity * decayed_strength DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query(sql, params);

    // Update Retrieval Stats
    await this.updateRetrievalStats(result.rows.map(e => e.id));

    return result.rows;
  }

  // Retrieval Strength Update (Spacing Effect)
  private async updateRetrievalStats(episodeIds: string[]): Promise<void> {
    // Spacing Effect: Strength erhöht sich mehr bei längeren Abständen
    await query(`
      UPDATE episodic_memories
      SET retrieval_count = retrieval_count + 1,
          retrieval_strength = LEAST(
            1.0,
            retrieval_strength +
              0.1 * POWER(0.9, retrieval_count) *
              GREATEST(0.1, EXTRACT(DAYS FROM NOW() - COALESCE(last_retrieved, timestamp)) / 30)
          ),
          last_retrieved = NOW()
      WHERE id = ANY($1)
    `, [episodeIds]);
  }

  // Memory Consolidation: Episodic -> Semantic
  async consolidateToSemantic(context: AIContext): Promise<ConsolidationResult> {
    // Finde starke, häufig abgerufene Episoden
    const strongEpisodes = await query(`
      SELECT * FROM episodic_memories
      WHERE context = $1
        AND retrieval_count >= 3
        AND retrieval_strength >= 0.5
        AND NOT EXISTS (
          SELECT 1 FROM long_term_facts f
          WHERE f.source_episode_id = episodic_memories.id
        )
      ORDER BY retrieval_strength DESC
      LIMIT 20
    `, [context]);

    // Extrahiere Fakten via Claude
    const factsExtracted: PersonalizationFact[] = [];

    for (const episode of strongEpisodes.rows) {
      const facts = await this.extractFactsFromEpisode(episode);
      factsExtracted.push(...facts);

      // Markiere Episode als konsolidiert
      await query(`
        UPDATE episodic_memories
        SET linked_facts = array_cat(linked_facts, $2)
        WHERE id = $1
      `, [episode.id, facts.map(f => f.id)]);
    }

    return {
      episodesProcessed: strongEpisodes.rows.length,
      factsExtracted: factsExtracted.length,
    };
  }
}
```

#### 2.2 Working Memory Enhancement

**Datei:** `backend/src/services/memory/working-memory.ts`

```typescript
// Working Memory: Aktiver Kontext während einer Aufgabe
// Biologisches Vorbild: Prefrontal Cortex Working Memory

interface WorkingMemorySlot {
  id: string;
  type: 'goal' | 'constraint' | 'fact' | 'hypothesis' | 'intermediate_result';
  content: string;
  priority: number;     // 0-1, höher = wichtiger
  activation: number;   // 0-1, decay über Zeit
  addedAt: Date;
  lastAccessed: Date;
}

interface WorkingMemoryState {
  sessionId: string;
  slots: WorkingMemorySlot[];
  capacity: number;     // Max Slots (default: 7 +/- 2)
  currentGoal: string;
  subGoals: string[];
}

class WorkingMemoryService {
  private states: Map<string, WorkingMemoryState> = new Map();

  // Konfiguration: Miller's Law (7 +/- 2)
  private readonly DEFAULT_CAPACITY = 7;
  private readonly DECAY_RATE = 0.05;  // Pro Sekunde Inaktivität
  private readonly MIN_ACTIVATION = 0.1;

  // Initialisiere Working Memory für Session
  initialize(sessionId: string, goal: string): WorkingMemoryState {
    const state: WorkingMemoryState = {
      sessionId,
      slots: [],
      capacity: this.DEFAULT_CAPACITY,
      currentGoal: goal,
      subGoals: [],
    };

    // Goal als ersten Slot
    state.slots.push({
      id: generateId(),
      type: 'goal',
      content: goal,
      priority: 1.0,
      activation: 1.0,
      addedAt: new Date(),
      lastAccessed: new Date(),
    });

    this.states.set(sessionId, state);
    return state;
  }

  // Füge Item zu Working Memory hinzu
  async add(
    sessionId: string,
    type: WorkingMemorySlot['type'],
    content: string,
    priority: number = 0.5
  ): Promise<WorkingMemorySlot> {
    const state = this.getState(sessionId);

    // Decay existierende Slots
    this.applyDecay(state);

    // Prüfe Kapazität
    if (state.slots.length >= state.capacity) {
      // Entferne Slot mit niedrigster Activation * Priority
      this.evictLowestSlot(state);
    }

    const slot: WorkingMemorySlot = {
      id: generateId(),
      type,
      content,
      priority,
      activation: 1.0,
      addedAt: new Date(),
      lastAccessed: new Date(),
    };

    state.slots.push(slot);
    return slot;
  }

  // Aktiviere Slot (wenn referenziert)
  activate(sessionId: string, slotId: string): void {
    const state = this.getState(sessionId);
    const slot = state.slots.find(s => s.id === slotId);

    if (slot) {
      slot.activation = Math.min(1.0, slot.activation + 0.3);
      slot.lastAccessed = new Date();

      // Spreading Activation: Ähnliche Slots auch aktivieren
      this.spreadActivation(state, slot);
    }
  }

  // Spreading Activation zu ähnlichen Slots
  private async spreadActivation(
    state: WorkingMemoryState,
    sourceSlot: WorkingMemorySlot
  ): Promise<void> {
    const sourceEmbedding = await generateEmbedding(sourceSlot.content);

    for (const slot of state.slots) {
      if (slot.id === sourceSlot.id) continue;

      const slotEmbedding = await generateEmbedding(slot.content);
      const similarity = cosineSimilarity(sourceEmbedding, slotEmbedding);

      if (similarity > 0.5) {
        // Aktiviere proportional zur Ähnlichkeit
        slot.activation = Math.min(1.0, slot.activation + similarity * 0.15);
      }
    }
  }

  // Generiere Kontext-String für Claude
  generateContextString(sessionId: string): string {
    const state = this.getState(sessionId);
    this.applyDecay(state);

    // Sortiere nach Activation * Priority
    const sorted = [...state.slots].sort((a, b) =>
      (b.activation * b.priority) - (a.activation * a.priority)
    );

    // Formatiere für System Prompt
    const parts: string[] = [];

    parts.push(`[AKTUELLES ZIEL]\n${state.currentGoal}`);

    if (state.subGoals.length > 0) {
      parts.push(`[TEILZIELE]\n${state.subGoals.map((g, i) => `${i + 1}. ${g}`).join('\n')}`);
    }

    const constraints = sorted.filter(s => s.type === 'constraint');
    if (constraints.length > 0) {
      parts.push(`[CONSTRAINTS]\n${constraints.map(c => `- ${c.content}`).join('\n')}`);
    }

    const facts = sorted.filter(s => s.type === 'fact');
    if (facts.length > 0) {
      parts.push(`[RELEVANTE FAKTEN]\n${facts.map(f => `- ${f.content}`).join('\n')}`);
    }

    const hypotheses = sorted.filter(s => s.type === 'hypothesis');
    if (hypotheses.length > 0) {
      parts.push(`[HYPOTHESEN]\n${hypotheses.map(h => `- ${h.content}`).join('\n')}`);
    }

    const results = sorted.filter(s => s.type === 'intermediate_result');
    if (results.length > 0) {
      parts.push(`[ZWISCHENERGEBNISSE]\n${results.map(r => `- ${r.content}`).join('\n')}`);
    }

    return parts.join('\n\n');
  }

  // Decay anwenden
  private applyDecay(state: WorkingMemoryState): void {
    const now = new Date();

    for (const slot of state.slots) {
      const secondsInactive = (now.getTime() - slot.lastAccessed.getTime()) / 1000;
      const decay = Math.exp(-this.DECAY_RATE * secondsInactive);

      // Goals decayen langsamer
      const decayMultiplier = slot.type === 'goal' ? 0.5 : 1.0;
      slot.activation = Math.max(
        this.MIN_ACTIVATION,
        slot.activation * Math.pow(decay, decayMultiplier)
      );
    }

    // Entferne Slots unter Minimum (außer Goals)
    state.slots = state.slots.filter(s =>
      s.type === 'goal' || s.activation >= this.MIN_ACTIVATION
    );
  }

  // Eviction bei Kapazitätsüberschreitung
  private evictLowestSlot(state: WorkingMemoryState): void {
    // Finde Slot mit niedrigstem Score (nie Goal evicten)
    const candidates = state.slots.filter(s => s.type !== 'goal');

    if (candidates.length === 0) return;

    candidates.sort((a, b) =>
      (a.activation * a.priority) - (b.activation * b.priority)
    );

    const toEvict = candidates[0];
    state.slots = state.slots.filter(s => s.id !== toEvict.id);

    // Optional: Speichere evicted Slot in Short-Term Memory
    // für spätere Wiederherstellung
  }
}
```

#### 2.3 Memory Coordinator Enhancement

**Datei:** `backend/src/services/memory/memory-coordinator.ts` (Erweiterung)

```typescript
// Erweiterte Memory Koordination mit allen 4 Memory-Typen

interface EnhancedPreparedContext {
  // Basis
  sessionId: string;
  systemEnhancement: string;

  // Working Memory (aktiver Fokus)
  workingMemory: {
    goal: string;
    activeSlots: WorkingMemorySlot[];
  };

  // Episodic Memory (relevante Erlebnisse)
  episodicMemory: {
    relevantEpisodes: Episode[];
    emotionalTone: number;
  };

  // Short-Term Memory (Session-Kontext)
  shortTermMemory: {
    recentMessages: Message[];
    conversationSummary: string;
    preloadedIdeas: PreloadedIdea[];
  };

  // Long-Term Memory (Wissen & Muster)
  longTermMemory: {
    facts: PersonalizationFact[];
    patterns: FrequentPattern[];
    relevantInteractions: SignificantInteraction[];
  };

  // Statistiken
  stats: {
    workingMemorySlots: number;
    episodesRetrieved: number;
    shortTermInteractions: number;
    longTermFacts: number;
    totalContextTokens: number;
  };
}

class EnhancedMemoryCoordinator {
  private workingMemory: WorkingMemoryService;
  private episodicMemory: EpisodicMemoryService;
  private shortTermMemory: ShortTermMemoryService;
  private longTermMemory: LongTermMemoryService;

  async prepareContext(
    sessionId: string,
    userQuery: string,
    context: AIContext,
    options: MemoryOptions = {}
  ): Promise<EnhancedPreparedContext> {
    const {
      includeEpisodic = true,
      includeLongTerm = true,
      maxContextTokens = 8000,
      emotionalPriming = true,
    } = options;

    // 1. Working Memory aktualisieren
    const workingState = this.workingMemory.getOrInitialize(sessionId, userQuery);

    // Extrahiere implizite Constraints/Facts aus Query
    const extracted = await this.extractFromQuery(userQuery);
    for (const item of extracted) {
      await this.workingMemory.add(sessionId, item.type, item.content, item.priority);
    }

    // 2. Parallel: Alle Memory-Typen abrufen
    const [episodic, shortTerm, longTerm] = await Promise.all([
      includeEpisodic
        ? this.episodicMemory.retrieve(userQuery, context, {
            limit: 5,
            emotionalFilter: emotionalPriming
              ? await this.inferEmotionalContext(userQuery)
              : undefined,
          })
        : Promise.resolve([]),

      this.shortTermMemory.getEnrichedContext(sessionId),

      includeLongTerm
        ? this.longTermMemory.retrieve(context, userQuery)
        : Promise.resolve(null),
    ]);

    // 3. Kontext zusammenbauen mit Token-Budget
    const systemEnhancement = await this.buildEnhancedSystemPrompt({
      workingMemory: workingState,
      episodic,
      shortTerm,
      longTerm,
      maxTokens: maxContextTokens,
    });

    // 4. Episodic Emotional Tone berechnen
    const emotionalTone = episodic.length > 0
      ? episodic.reduce((sum, e) => sum + e.emotionalValence, 0) / episodic.length
      : 0;

    return {
      sessionId,
      systemEnhancement,
      workingMemory: {
        goal: workingState.currentGoal,
        activeSlots: workingState.slots,
      },
      episodicMemory: {
        relevantEpisodes: episodic,
        emotionalTone,
      },
      shortTermMemory: {
        recentMessages: shortTerm.recentMessages,
        conversationSummary: shortTerm.conversationSummary,
        preloadedIdeas: shortTerm.preloadedIdeas,
      },
      longTermMemory: {
        facts: longTerm?.facts || [],
        patterns: longTerm?.patterns || [],
        relevantInteractions: longTerm?.relevantInteractions || [],
      },
      stats: {
        workingMemorySlots: workingState.slots.length,
        episodesRetrieved: episodic.length,
        shortTermInteractions: shortTerm.recentMessages.length,
        longTermFacts: longTerm?.facts.length || 0,
        totalContextTokens: this.estimateTokens(systemEnhancement),
      },
    };
  }

  // System Prompt mit allen Memory-Quellen
  private async buildEnhancedSystemPrompt(sources: {
    workingMemory: WorkingMemoryState;
    episodic: Episode[];
    shortTerm: EnrichedContext;
    longTerm: LongTermRetrievalResult | null;
    maxTokens: number;
  }): Promise<string> {
    const sections: { title: string; content: string; priority: number }[] = [];

    // 1. Working Memory (höchste Priorität)
    sections.push({
      title: 'AKTIVER FOKUS',
      content: this.workingMemory.generateContextString(sources.workingMemory.sessionId),
      priority: 1.0,
    });

    // 2. Episodic Memory (mittlere Priorität)
    if (sources.episodic.length > 0) {
      sections.push({
        title: 'ÄHNLICHE FRÜHERE GESPRÄCHE',
        content: sources.episodic.map(e =>
          `[${formatDate(e.timestamp)}] ${e.trigger.substring(0, 100)}... → ${e.response.substring(0, 150)}...`
        ).join('\n'),
        priority: 0.7,
      });
    }

    // 3. Long-Term Facts (mittlere Priorität)
    if (sources.longTerm?.facts.length) {
      sections.push({
        title: 'BEKANNTES ÜBER DEN NUTZER',
        content: sources.longTerm.facts.map(f => `- ${f.content}`).join('\n'),
        priority: 0.8,
      });
    }

    // 4. Patterns (niedrigere Priorität)
    if (sources.longTerm?.patterns.length) {
      sections.push({
        title: 'ERKANNTE MUSTER',
        content: sources.longTerm.patterns.map(p => `- ${p.pattern}`).join('\n'),
        priority: 0.5,
      });
    }

    // 5. Conversation Summary (wenn vorhanden)
    if (sources.shortTerm.conversationSummary) {
      sections.push({
        title: 'BISHERIGES GESPRÄCH',
        content: sources.shortTerm.conversationSummary,
        priority: 0.6,
      });
    }

    // Token-Budget einhalten
    return this.fitToTokenBudget(sections, sources.maxTokens);
  }

  // Intelligentes Token-Budget Management
  private fitToTokenBudget(
    sections: { title: string; content: string; priority: number }[],
    maxTokens: number
  ): string {
    // Sortiere nach Priorität
    sections.sort((a, b) => b.priority - a.priority);

    let result = '\n\n=== PERSÖNLICHER KONTEXT ===\n';
    let usedTokens = this.estimateTokens(result);

    for (const section of sections) {
      const sectionText = `\n[${section.title}]\n${section.content}\n`;
      const sectionTokens = this.estimateTokens(sectionText);

      if (usedTokens + sectionTokens <= maxTokens) {
        result += sectionText;
        usedTokens += sectionTokens;
      } else if (usedTokens + 100 < maxTokens) {
        // Kürze Section um ins Budget zu passen
        const availableTokens = maxTokens - usedTokens - 50;
        const truncated = this.truncateToTokens(section.content, availableTokens);
        result += `\n[${section.title}]\n${truncated}...\n`;
        break;
      }
    }

    result += '\nBerücksichtige diesen Kontext bei deiner Antwort.';
    return result;
  }
}
```

---

### 3. AGENTIC RAG SYSTEM

**Aktueller Stand:** Top 10% - Self-Reflection + Query Reformulation

**Ziel:** Multi-Strategy Orchestration mit Learning

#### 3.1 Strategy Learning System

**Neue Datei:** `backend/src/services/rag/strategy-learning.ts`

```typescript
// Lerne welche Retrieval-Strategien für welche Query-Typen am besten funktionieren

interface StrategyPerformance {
  strategyId: string;
  queryType: QueryType;
  queryEmbedding: number[];

  // Metriken
  retrievalTime: number;
  resultsCount: number;
  avgRelevance: number;
  userSatisfaction: number | null;  // Aus Feedback

  // Kontext
  context: AIContext;
  timestamp: Date;
}

type QueryType =
  | 'factual'           // "Was ist X?"
  | 'temporal'          // "Letzte Woche...", "Gestern..."
  | 'comparative'       // "Vergleiche X und Y"
  | 'exploratory'       // "Zeig mir alles über..."
  | 'relational'        // "Was hängt mit X zusammen?"
  | 'aggregative';      // "Wie viele...", "Zusammenfassung..."

// Schema
const STRATEGY_PERFORMANCE_TABLE = `
CREATE TABLE IF NOT EXISTS rag_strategy_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id VARCHAR(50) NOT NULL,
  query_type VARCHAR(50) NOT NULL,
  query_embedding vector(768),

  retrieval_time_ms INTEGER NOT NULL,
  results_count INTEGER NOT NULL,
  avg_relevance DECIMAL(4,3) NOT NULL,
  user_satisfaction DECIMAL(3,2),

  context VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_strategy_perf (strategy_id, query_type),
  INDEX idx_strategy_satisfaction (user_satisfaction DESC NULLS LAST)
);
`;

class StrategyLearner {
  // Query-Typ klassifizieren
  async classifyQueryType(query: string): Promise<QueryType> {
    const queryLower = query.toLowerCase();

    // Pattern-basierte Klassifikation
    if (/^(was|wer|wo|wann|wie viel|wie viele)\s/i.test(query)) {
      return 'factual';
    }
    if (/heute|gestern|letzte|diese woche|diesen monat|vor \d/i.test(query)) {
      return 'temporal';
    }
    if (/vergleich|unterschied|versus|vs\.?|oder/i.test(query)) {
      return 'comparative';
    }
    if (/zeig|liste|überblick|alles über|sammlung/i.test(query)) {
      return 'exploratory';
    }
    if (/zusammenhang|verbind|bezug|related|ähnlich/i.test(query)) {
      return 'relational';
    }
    if (/zusammenfassung|insgesamt|statistik|analyse/i.test(query)) {
      return 'aggregative';
    }

    // Fallback: LLM-basierte Klassifikation
    return await this.classifyWithLLM(query);
  }

  // Beste Strategie-Reihenfolge für Query-Typ
  async getOptimalStrategyOrder(
    queryType: QueryType,
    context: AIContext
  ): Promise<string[]> {
    // Lade historische Performance
    const performance = await query(`
      SELECT strategy_id,
             AVG(avg_relevance) as avg_relevance,
             AVG(COALESCE(user_satisfaction, avg_relevance)) as weighted_score,
             COUNT(*) as sample_count
      FROM rag_strategy_performance
      WHERE query_type = $1
        AND context = $2
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY strategy_id
      HAVING COUNT(*) >= 5
      ORDER BY weighted_score DESC
    `, [queryType, context]);

    if (performance.rows.length >= 3) {
      // Genug Daten: Nutze gelernte Reihenfolge
      return performance.rows.map(r => r.strategy_id);
    }

    // Fallback: Default Reihenfolgen pro Query-Typ
    return this.getDefaultOrder(queryType);
  }

  // Default Strategie-Reihenfolgen
  private getDefaultOrder(queryType: QueryType): string[] {
    const defaults: Record<QueryType, string[]> = {
      'factual': ['semantic', 'keyword', 'hybrid'],
      'temporal': ['temporal', 'semantic', 'keyword'],
      'comparative': ['semantic', 'graph', 'keyword'],
      'exploratory': ['hybrid', 'graph', 'semantic'],
      'relational': ['graph', 'semantic', 'hybrid'],
      'aggregative': ['keyword', 'semantic', 'temporal'],
    };
    return defaults[queryType];
  }

  // Performance aufzeichnen
  async recordPerformance(
    strategyId: string,
    queryType: QueryType,
    query: string,
    metrics: {
      retrievalTime: number;
      resultsCount: number;
      avgRelevance: number;
    },
    context: AIContext
  ): Promise<void> {
    const queryEmbedding = await generateEmbedding(query);

    await query(`
      INSERT INTO rag_strategy_performance (
        strategy_id, query_type, query_embedding,
        retrieval_time_ms, results_count, avg_relevance,
        context
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      strategyId, queryType, formatForPgVector(queryEmbedding),
      metrics.retrievalTime, metrics.resultsCount, metrics.avgRelevance,
      context
    ]);
  }

  // User Feedback integrieren
  async recordFeedback(
    queryId: string,
    satisfaction: number  // 1-5 Scale
  ): Promise<void> {
    const normalized = satisfaction / 5;

    await query(`
      UPDATE rag_strategy_performance
      SET user_satisfaction = $2
      WHERE id = $1
    `, [queryId, normalized]);
  }
}
```

#### 3.2 Multi-Hop Reasoning

**Erweitere:** `backend/src/services/agentic-rag.ts`

```typescript
// Multi-Hop Reasoning für komplexe Queries

interface HopResult {
  hop: number;
  query: string;
  results: RetrievalResult[];
  reasoning: string;
  nextHopNeeded: boolean;
  nextHopQuery?: string;
}

async function multiHopRetrieval(
  originalQuery: string,
  context: AIContext,
  maxHops: number = 3
): Promise<MultiHopResult> {
  const hops: HopResult[] = [];
  let currentQuery = originalQuery;
  let allResults: RetrievalResult[] = [];

  for (let hop = 1; hop <= maxHops; hop++) {
    // 1. Retrieval für aktuellen Hop
    const hopResults = await this.retrieve(currentQuery, context, {
      maxIterations: 2,  // Weniger Iterationen pro Hop
      minConfidence: 0.6,
    });

    // 2. Deduplizieren mit bisherigen Ergebnissen
    const newResults = hopResults.results.filter(r =>
      !allResults.some(existing => existing.id === r.id)
    );

    allResults.push(...newResults);

    // 3. Reasoning: Brauchen wir noch einen Hop?
    const reasoning = await this.reasonAboutHop(
      originalQuery,
      currentQuery,
      allResults,
      hop
    );

    hops.push({
      hop,
      query: currentQuery,
      results: newResults,
      reasoning: reasoning.explanation,
      nextHopNeeded: reasoning.needsMoreInfo,
      nextHopQuery: reasoning.suggestedQuery,
    });

    // 4. Abbruch oder nächster Hop
    if (!reasoning.needsMoreInfo || !reasoning.suggestedQuery) {
      break;
    }

    currentQuery = reasoning.suggestedQuery;
  }

  return {
    originalQuery,
    hops,
    finalResults: this.reRankResults(originalQuery, allResults),
    totalHops: hops.length,
  };
}

// Reasoning über Hop-Notwendigkeit
private async reasonAboutHop(
  originalQuery: string,
  currentQuery: string,
  results: RetrievalResult[],
  hop: number
): Promise<{
  needsMoreInfo: boolean;
  explanation: string;
  suggestedQuery?: string;
}> {
  const prompt = `
Analysiere ob diese Suchergebnisse die ursprüngliche Frage vollständig beantworten.

URSPRÜNGLICHE FRAGE: "${originalQuery}"
AKTUELLE SUCHE (Hop ${hop}): "${currentQuery}"

GEFUNDENE ERGEBNISSE:
${results.slice(0, 5).map((r, i) => `${i + 1}. ${r.title}: ${r.summary}`).join('\n')}

Antworte als JSON:
{
  "needsMoreInfo": boolean,
  "explanation": "Warum brauchen wir mehr/keine Info",
  "suggestedQuery": "Falls needsMoreInfo=true: Nächste Suchanfrage"
}

WICHTIG: Wenn die Frage Beziehungen oder Zusammenhänge erfragt,
prüfe ob wir tatsächlich die verbundenen Konzepte gefunden haben.
`;

  return await queryClaudeJSON(
    'Du analysierst Suchergebnisse für Multi-Hop Reasoning',
    prompt
  );
}
```

#### 3.3 Hybrid Reranking mit Cross-Encoder Simulation

```typescript
// Simulierter Cross-Encoder via Claude

async function crossEncoderRerank(
  query: string,
  results: RetrievalResult[],
  topK: number = 10
): Promise<RetrievalResult[]> {
  if (results.length <= topK) return results;

  // Batch-Reranking via Claude
  const prompt = `
Bewerte die Relevanz jedes Dokuments für die Suchanfrage.
Gib einen Score von 0.0 bis 1.0.

SUCHANFRAGE: "${query}"

DOKUMENTE:
${results.slice(0, 20).map((r, i) => `
[${i + 1}] ${r.title}
${r.summary}
`).join('\n')}

Antworte als JSON Array:
[
  {"index": 1, "relevance": 0.95, "reason": "Direkter Match"},
  ...
]
`;

  const rankings = await queryClaudeJSON<Array<{
    index: number;
    relevance: number;
    reason: string;
  }>>(
    'Du bist ein präziser Relevanz-Bewerter',
    prompt
  );

  // Merge Scores
  const reranked = results.map((result, idx) => {
    const ranking = rankings.find(r => r.index === idx + 1);
    return {
      ...result,
      crossEncoderScore: ranking?.relevance || result.score,
      crossEncoderReason: ranking?.reason,
    };
  });

  // Sortiere nach Cross-Encoder Score
  return reranked
    .sort((a, b) => b.crossEncoderScore - a.crossEncoderScore)
    .slice(0, topK);
}
```

---

### 4. KNOWLEDGE GRAPH SYSTEM

**Aktueller Stand:** Top 10% - 13 Relation Types + Multi-Hop

**Ziel:** Dynamische Graph-Evolution mit Reasoning

#### 4.1 Temporal Knowledge Graph

**Neue Datei:** `backend/src/services/knowledge-graph/temporal-graph.ts`

```typescript
// Zeitliche Dimension für Knowledge Graph

interface TemporalEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: RelationType;

  // Zeitliche Gültigkeit
  validFrom: Date;
  validTo: Date | null;  // null = noch gültig

  // Temporale Eigenschaften
  temporalType: 'permanent' | 'temporary' | 'recurring' | 'evolving';

  // Stärke über Zeit
  initialStrength: number;
  currentStrength: number;
  strengthHistory: Array<{ date: Date; strength: number }>;

  // Metadaten
  createdAt: Date;
  lastUpdated: Date;
  updateCount: number;
}

// Schema Erweiterung
const TEMPORAL_EDGE_COLUMNS = `
ALTER TABLE knowledge_connections ADD COLUMN IF NOT EXISTS
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_to TIMESTAMPTZ,
  temporal_type VARCHAR(20) DEFAULT 'permanent',
  initial_strength DECIMAL(4,3),
  strength_history JSONB DEFAULT '[]';
`;

class TemporalKnowledgeGraph {
  // Erstelle Edge mit temporaler Awareness
  async createEdge(
    sourceId: string,
    targetId: string,
    relationType: RelationType,
    options: {
      strength: number;
      temporalType?: TemporalEdge['temporalType'];
      validUntil?: Date;
    }
  ): Promise<TemporalEdge> {
    const {
      strength,
      temporalType = 'permanent',
      validUntil,
    } = options;

    // Prüfe ob Edge bereits existiert
    const existing = await this.findEdge(sourceId, targetId, relationType);

    if (existing) {
      // Update statt Neuanlage
      return await this.updateEdge(existing.id, {
        strength,
        temporalType,
        validUntil,
      });
    }

    return await query(`
      INSERT INTO knowledge_connections (
        source_idea_id, target_idea_id, relation_type,
        strength, initial_strength,
        temporal_type, valid_from, valid_to
      ) VALUES ($1, $2, $3, $4, $4, $5, NOW(), $6)
      RETURNING *
    `, [sourceId, targetId, relationType, strength, temporalType, validUntil]);
  }

  // Edge-Stärke Decay
  async applyStrengthDecay(): Promise<void> {
    // Täglicher Cron Job
    await query(`
      UPDATE knowledge_connections
      SET strength = GREATEST(0.1, strength * 0.995),
          strength_history = strength_history ||
            jsonb_build_array(jsonb_build_object(
              'date', NOW()::text,
              'strength', strength * 0.995
            ))
      WHERE temporal_type IN ('temporary', 'evolving')
        AND valid_to IS NULL
        AND updated_at < NOW() - INTERVAL '1 day'
    `);
  }

  // Verstärke Edge bei Nutzung
  async reinforceEdge(edgeId: string, amount: number = 0.1): Promise<void> {
    await query(`
      UPDATE knowledge_connections
      SET strength = LEAST(1.0, strength + $2),
          update_count = update_count + 1,
          updated_at = NOW(),
          strength_history = strength_history ||
            jsonb_build_array(jsonb_build_object(
              'date', NOW()::text,
              'strength', LEAST(1.0, strength + $2),
              'reason', 'reinforced'
            ))
      WHERE id = $1
    `, [edgeId, amount]);
  }

  // Query mit temporaler Filterung
  async queryAtTime(
    nodeId: string,
    pointInTime: Date,
    options: { depth?: number; relationTypes?: RelationType[] } = {}
  ): Promise<GraphSnapshot> {
    const { depth = 2, relationTypes } = options;

    let sql = `
      WITH RECURSIVE graph AS (
        -- Startknoten
        SELECT
          $1::uuid as node_id,
          0 as depth,
          ARRAY[$1::uuid] as path

        UNION ALL

        -- Traversierung
        SELECT
          CASE
            WHEN kc.source_idea_id = g.node_id THEN kc.target_idea_id
            ELSE kc.source_idea_id
          END as node_id,
          g.depth + 1,
          g.path || CASE
            WHEN kc.source_idea_id = g.node_id THEN kc.target_idea_id
            ELSE kc.source_idea_id
          END
        FROM graph g
        JOIN knowledge_connections kc ON
          (kc.source_idea_id = g.node_id OR kc.target_idea_id = g.node_id)
        WHERE g.depth < $2
          AND kc.valid_from <= $3
          AND (kc.valid_to IS NULL OR kc.valid_to >= $3)
          AND NOT (CASE
            WHEN kc.source_idea_id = g.node_id THEN kc.target_idea_id
            ELSE kc.source_idea_id
          END = ANY(g.path))
    `;

    const params: any[] = [nodeId, depth, pointInTime];

    if (relationTypes && relationTypes.length > 0) {
      sql += ` AND kc.relation_type = ANY($${params.length + 1})`;
      params.push(relationTypes);
    }

    sql += `
      )
      SELECT DISTINCT i.*, g.depth
      FROM graph g
      JOIN ideas i ON i.id = g.node_id
      ORDER BY g.depth, i.created_at DESC
    `;

    const nodes = await query(sql, params);
    const edges = await this.getEdgesForNodes(
      nodes.rows.map(n => n.id),
      pointInTime
    );

    return { nodes: nodes.rows, edges, queryTime: pointInTime };
  }

  // Graph Evolution Analysis
  async analyzeEvolution(
    nodeId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<GraphEvolution> {
    // Snapshots zu verschiedenen Zeitpunkten
    const snapshots: GraphSnapshot[] = [];
    const interval = (toDate.getTime() - fromDate.getTime()) / 10; // 10 Snapshots

    for (let i = 0; i <= 10; i++) {
      const time = new Date(fromDate.getTime() + interval * i);
      snapshots.push(await this.queryAtTime(nodeId, time, { depth: 2 }));
    }

    // Analyse der Veränderungen
    return {
      nodeId,
      period: { from: fromDate, to: toDate },
      snapshots,

      // Metriken
      nodesAdded: this.countNewNodes(snapshots),
      nodesRemoved: this.countRemovedNodes(snapshots),
      edgesAdded: this.countNewEdges(snapshots),
      edgesRemoved: this.countRemovedEdges(snapshots),
      avgStrengthChange: this.calculateAvgStrengthChange(snapshots),

      // Insights
      growthRate: this.calculateGrowthRate(snapshots),
      centralityShift: this.analyzeCentralityShift(snapshots),
      clusteringChange: this.analyzeClusteringChange(snapshots),
    };
  }
}
```

#### 4.2 Automatic Relationship Discovery

```typescript
// Automatische Entdeckung neuer Beziehungen

class RelationshipDiscovery {
  // Finde potenzielle neue Beziehungen
  async discoverPotentialRelationships(
    context: AIContext,
    limit: number = 20
  ): Promise<PotentialRelationship[]> {
    // 1. Finde Ideen ohne/mit wenigen Verbindungen
    const isolatedIdeas = await query(`
      SELECT i.id, i.title, i.summary, i.embedding,
             COUNT(kc.id) as connection_count
      FROM ideas i
      LEFT JOIN knowledge_connections kc ON
        kc.source_idea_id = i.id OR kc.target_idea_id = i.id
      WHERE i.context = $1 AND i.is_archived = false
      GROUP BY i.id
      HAVING COUNT(kc.id) < 3
      ORDER BY i.created_at DESC
      LIMIT 50
    `, [context]);

    const potentialRelationships: PotentialRelationship[] = [];

    // 2. Für jede isolierte Idee: Finde ähnliche
    for (const idea of isolatedIdeas.rows) {
      const similar = await query(`
        SELECT i.id, i.title, i.summary,
               1 - (i.embedding <=> $2) as similarity
        FROM ideas i
        WHERE i.id != $1
          AND i.context = $3
          AND i.is_archived = false
          AND 1 - (i.embedding <=> $2) > 0.6
        ORDER BY i.embedding <=> $2
        LIMIT 5
      `, [idea.id, formatForPgVector(idea.embedding), context]);

      // 3. Analysiere potenzielle Beziehungen
      for (const candidate of similar.rows) {
        // Prüfe ob Beziehung bereits existiert
        const exists = await this.relationshipExists(idea.id, candidate.id);
        if (exists) continue;

        // Klassifiziere Beziehungstyp
        const classification = await this.classifyRelationship(idea, candidate);

        if (classification.confidence > 0.6) {
          potentialRelationships.push({
            sourceId: idea.id,
            sourceTitle: idea.title,
            targetId: candidate.id,
            targetTitle: candidate.title,
            suggestedType: classification.type,
            confidence: classification.confidence,
            reasoning: classification.reasoning,
            semanticSimilarity: candidate.similarity,
          });
        }
      }
    }

    // Sortiere nach Confidence
    return potentialRelationships
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);
  }

  // Beziehungstyp klassifizieren
  private async classifyRelationship(
    source: { title: string; summary: string },
    target: { title: string; summary: string }
  ): Promise<{
    type: RelationType;
    confidence: number;
    reasoning: string;
  }> {
    const prompt = `
Analysiere die Beziehung zwischen diesen zwei Ideen:

IDEE A: "${source.title}"
${source.summary}

IDEE B: "${target.title}"
${target.summary}

Mögliche Beziehungstypen:
- similar_to: Thematisch ähnlich
- builds_on: A baut auf B auf
- contradicts: A widerspricht B
- supports: A unterstützt B
- enables: A ermöglicht B
- part_of: A ist Teil von B
- depends_on: A hängt von B ab
- alternative_to: A ist Alternative zu B
- extends: A erweitert B
- implements: A implementiert B
- caused_by: A wird verursacht durch B
- precedes: A geht B voraus
- follows: A folgt auf B

Antworte als JSON:
{
  "type": "relation_type",
  "confidence": 0.0-1.0,
  "reasoning": "Kurze Begründung",
  "bidirectional": boolean
}
`;

    return await queryClaudeJSON(
      'Du analysierst konzeptuelle Beziehungen',
      prompt
    );
  }

  // Batch-Erstellung nach User-Review
  async createApprovedRelationships(
    approvedRelationships: Array<{
      sourceId: string;
      targetId: string;
      type: RelationType;
    }>
  ): Promise<void> {
    for (const rel of approvedRelationships) {
      await this.temporalGraph.createEdge(
        rel.sourceId,
        rel.targetId,
        rel.type,
        { strength: 0.8, temporalType: 'permanent' }
      );
    }
  }
}
```

#### 4.3 Graph-Based Reasoning

```typescript
// Reasoning über den Knowledge Graph

class GraphReasoning {
  // Finde Erklärungspfade zwischen zwei Konzepten
  async findExplanationPath(
    sourceId: string,
    targetId: string,
    maxDepth: number = 4
  ): Promise<ExplanationPath | null> {
    // BFS für kürzesten Pfad
    const path = await query(`
      WITH RECURSIVE paths AS (
        SELECT
          source_idea_id as current,
          target_idea_id as next,
          relation_type,
          strength,
          ARRAY[source_idea_id, target_idea_id] as path,
          ARRAY[relation_type] as relations,
          1 as depth
        FROM knowledge_connections
        WHERE source_idea_id = $1 OR target_idea_id = $1

        UNION ALL

        SELECT
          p.next,
          CASE WHEN kc.source_idea_id = p.next THEN kc.target_idea_id
               ELSE kc.source_idea_id END,
          kc.relation_type,
          kc.strength,
          p.path || CASE WHEN kc.source_idea_id = p.next THEN kc.target_idea_id
                         ELSE kc.source_idea_id END,
          p.relations || kc.relation_type,
          p.depth + 1
        FROM paths p
        JOIN knowledge_connections kc ON
          kc.source_idea_id = p.next OR kc.target_idea_id = p.next
        WHERE p.depth < $3
          AND NOT (CASE WHEN kc.source_idea_id = p.next THEN kc.target_idea_id
                        ELSE kc.source_idea_id END = ANY(p.path))
      )
      SELECT path, relations, depth
      FROM paths
      WHERE $2 = ANY(path)
      ORDER BY depth
      LIMIT 1
    `, [sourceId, targetId, maxDepth]);

    if (path.rows.length === 0) return null;

    // Lade Details für alle Knoten im Pfad
    const nodeIds = path.rows[0].path;
    const nodes = await query(`
      SELECT id, title, summary FROM ideas WHERE id = ANY($1)
    `, [nodeIds]);

    // Generiere natürlichsprachliche Erklärung
    const explanation = await this.generateExplanation(
      nodes.rows,
      path.rows[0].relations
    );

    return {
      path: nodeIds,
      relations: path.rows[0].relations,
      nodes: nodes.rows,
      depth: path.rows[0].depth,
      explanation,
    };
  }

  // Natürlichsprachliche Erklärung generieren
  private async generateExplanation(
    nodes: Array<{ id: string; title: string; summary: string }>,
    relations: RelationType[]
  ): Promise<string> {
    const pathDescription = nodes.map((node, i) => {
      if (i === 0) return `"${node.title}"`;
      const relation = relations[i - 1];
      const relationText = this.relationToText(relation);
      return `${relationText} "${node.title}"`;
    }).join(' ');

    return `Der Zusammenhang: ${pathDescription}`;
  }

  // Relation zu lesbarem Text
  private relationToText(relation: RelationType): string {
    const mapping: Record<RelationType, string> = {
      'similar_to': 'ist ähnlich zu',
      'builds_on': 'baut auf',
      'contradicts': 'widerspricht',
      'supports': 'unterstützt',
      'enables': 'ermöglicht',
      'part_of': 'ist Teil von',
      'depends_on': 'hängt ab von',
      'alternative_to': 'ist Alternative zu',
      'extends': 'erweitert',
      'implements': 'implementiert',
      'caused_by': 'wird verursacht durch',
      'precedes': 'geht voraus',
      'follows': 'folgt auf',
      'related_tech': 'ist technisch verwandt mit',
    };
    return mapping[relation] || 'verbindet mit';
  }

  // Finde Widersprüche im Graph
  async findContradictions(context: AIContext): Promise<Contradiction[]> {
    // Finde 'contradicts' Beziehungen
    const contradictions = await query(`
      SELECT
        s.id as source_id, s.title as source_title, s.summary as source_summary,
        t.id as target_id, t.title as target_title, t.summary as target_summary,
        kc.strength, kc.created_at
      FROM knowledge_connections kc
      JOIN ideas s ON s.id = kc.source_idea_id
      JOIN ideas t ON t.id = kc.target_idea_id
      WHERE kc.relation_type = 'contradicts'
        AND s.context = $1
        AND kc.valid_to IS NULL
      ORDER BY kc.strength DESC
    `, [context]);

    // Analysiere jeden Widerspruch
    const analyzed: Contradiction[] = [];

    for (const row of contradictions.rows) {
      const analysis = await this.analyzeContradiction(row);
      analyzed.push({
        ...row,
        analysis,
      });
    }

    return analyzed;
  }

  // Widerspruch analysieren
  private async analyzeContradiction(
    contradiction: any
  ): Promise<ContradictionAnalysis> {
    const prompt = `
Analysiere diesen Widerspruch:

IDEE A: "${contradiction.source_title}"
${contradiction.source_summary}

WIDERSPRICHT

IDEE B: "${contradiction.target_title}"
${contradiction.target_summary}

Analysiere:
1. Was genau widerspricht sich?
2. Kann einer der Standpunkte unter bestimmten Bedingungen richtig sein?
3. Gibt es eine Synthese oder Auflösung?

JSON:
{
  "conflictType": "factual|methodological|scope|temporal|perspective",
  "coreConflict": "Was widerspricht sich genau",
  "conditionalValidity": "Unter welchen Bedingungen ist was richtig",
  "possibleResolution": "Mögliche Synthese oder Auflösung",
  "resolutionConfidence": 0.0-1.0
}
`;

    return await queryClaudeJSON(
      'Du analysierst konzeptuelle Widersprüche',
      prompt
    );
  }
}
```

---

### 5. MCP INTEGRATION

**Aktueller Stand:** Early Adopter - 5 Tools implementiert

**Ziel:** Vollständige Ecosystem-Integration

#### 5.1 Erweiterte Tool-Palette

**Datei:** `backend/src/mcp/tools/` (Neue Tools)

```typescript
// Erweiterte MCP Tools

// Tool: Deep Analysis
const DEEP_ANALYSIS_TOOL: MCPTool = {
  name: 'deep_analysis',
  description: 'Tiefgehende Analyse mit Extended Thinking',
  inputSchema: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: 'Thema für tiefe Analyse'
      },
      analysisType: {
        type: 'string',
        enum: ['strategic', 'technical', 'creative', 'research'],
        description: 'Art der Analyse',
      },
      context: {
        type: 'string',
        enum: ['personal', 'work'],
      },
      thinkingBudget: {
        type: 'number',
        description: 'Token-Budget für Extended Thinking (max 128000)',
        default: 30000,
      },
    },
    required: ['topic', 'analysisType'],
  },
};

// Tool: Knowledge Graph Query
const KNOWLEDGE_GRAPH_TOOL: MCPTool = {
  name: 'explore_connections',
  description: 'Erkunde Verbindungen im Wissensgraphen',
  inputSchema: {
    type: 'object',
    properties: {
      startingPoint: {
        type: 'string',
        description: 'Idee-ID oder Suchbegriff als Startpunkt',
      },
      depth: {
        type: 'number',
        description: 'Tiefe der Exploration (1-4)',
        default: 2,
      },
      relationTypes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Zu folgende Beziehungstypen (optional)',
      },
      visualize: {
        type: 'boolean',
        description: 'Graph-Visualisierung generieren',
        default: false,
      },
    },
    required: ['startingPoint'],
  },
};

// Tool: Memory Query
const MEMORY_QUERY_TOOL: MCPTool = {
  name: 'query_memory',
  description: 'Durchsuche das Langzeitgedächtnis nach Fakten und Patterns',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Suchanfrage für Memory',
      },
      memoryTypes: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['facts', 'patterns', 'episodes', 'interactions'],
        },
        description: 'Zu durchsuchende Memory-Typen',
      },
      timeRange: {
        type: 'object',
        properties: {
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
        },
        description: 'Zeitlicher Filter',
      },
    },
    required: ['query'],
  },
};

// Tool: Draft Generation
const DRAFT_GENERATION_TOOL: MCPTool = {
  name: 'generate_draft',
  description: 'Generiere Entwürfe (E-Mail, Artikel, Proposal, etc.)',
  inputSchema: {
    type: 'object',
    properties: {
      draftType: {
        type: 'string',
        enum: ['email', 'article', 'proposal', 'document', 'presentation_outline'],
      },
      topic: {
        type: 'string',
        description: 'Thema oder Anweisung für den Draft',
      },
      recipient: {
        type: 'string',
        description: 'Empfänger (für E-Mails)',
      },
      tone: {
        type: 'string',
        enum: ['formal', 'casual', 'persuasive', 'informative'],
        default: 'formal',
      },
      includeIdeas: {
        type: 'array',
        items: { type: 'string' },
        description: 'Idee-IDs zur Integration',
      },
      length: {
        type: 'string',
        enum: ['short', 'medium', 'long'],
        default: 'medium',
      },
    },
    required: ['draftType', 'topic'],
  },
};

// Tool: Multi-Hop Search
const MULTI_HOP_SEARCH_TOOL: MCPTool = {
  name: 'deep_search',
  description: 'Multi-Hop Suche mit automatischer Query-Erweiterung',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Komplexe Suchanfrage',
      },
      maxHops: {
        type: 'number',
        description: 'Maximale Suchtiefe (1-5)',
        default: 3,
      },
      includeExplanation: {
        type: 'boolean',
        description: 'Erklärungspfade einschließen',
        default: true,
      },
    },
    required: ['query'],
  },
};

// Tool: Contradiction Finder
const CONTRADICTION_FINDER_TOOL: MCPTool = {
  name: 'find_contradictions',
  description: 'Finde Widersprüche in deinem Wissen',
  inputSchema: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        enum: ['all', 'recent', 'topic'],
        description: 'Suchbereich',
      },
      topic: {
        type: 'string',
        description: 'Thema (wenn scope=topic)',
      },
      includeResolutions: {
        type: 'boolean',
        description: 'Lösungsvorschläge generieren',
        default: true,
      },
    },
  },
};

// Alle erweiterten Tools
export const EXTENDED_MCP_TOOLS: MCPTool[] = [
  // Existierende
  CREATE_IDEA_TOOL,
  SEARCH_IDEAS_TOOL,
  GET_SUGGESTIONS_TOOL,
  CHAT_TOOL,
  GET_RELATED_IDEAS_TOOL,

  // Neue
  DEEP_ANALYSIS_TOOL,
  KNOWLEDGE_GRAPH_TOOL,
  MEMORY_QUERY_TOOL,
  DRAFT_GENERATION_TOOL,
  MULTI_HOP_SEARCH_TOOL,
  CONTRADICTION_FINDER_TOOL,
];
```

#### 5.2 MCP Resources Erweiterung

```typescript
// Erweiterte MCP Resources

export const EXTENDED_MCP_RESOURCES: MCPResource[] = [
  // Existierende
  { uri: 'kiab://ideas/{id}', name: 'Individual Idea', mimeType: 'application/json' },
  { uri: 'kiab://ideas', name: 'Recent Ideas', mimeType: 'application/json' },
  { uri: 'kiab://drafts/{id}', name: 'Draft', mimeType: 'text/plain' },
  { uri: 'kiab://context/{name}', name: 'Context Data', mimeType: 'application/json' },

  // Neue Resources
  {
    uri: 'kiab://graph/{nodeId}',
    name: 'Knowledge Graph Node',
    description: 'Wissensgraph-Knoten mit Verbindungen',
    mimeType: 'application/json',
  },
  {
    uri: 'kiab://graph/{nodeId}/visual',
    name: 'Knowledge Graph Visualization',
    description: 'SVG-Visualisierung des lokalen Graphen',
    mimeType: 'image/svg+xml',
  },
  {
    uri: 'kiab://memory/facts',
    name: 'Known Facts',
    description: 'Gespeicherte Fakten über den Nutzer',
    mimeType: 'application/json',
  },
  {
    uri: 'kiab://memory/patterns',
    name: 'Behavioral Patterns',
    description: 'Erkannte Verhaltensmuster',
    mimeType: 'application/json',
  },
  {
    uri: 'kiab://analytics/evolution',
    name: 'Idea Evolution',
    description: 'Entwicklung der Ideen über Zeit',
    mimeType: 'application/json',
  },
  {
    uri: 'kiab://suggestions/proactive',
    name: 'Proactive Suggestions',
    description: 'Aktuelle proaktive Vorschläge',
    mimeType: 'application/json',
  },
];
```

---

## Teil 2: Implementierungsreihenfolge

### Phase 1: Extended Thinking Excellence (Woche 1-2)

```
□ 1.1 Dynamic Budget System
  ├── TaskType Detection
  ├── Complexity Analysis
  └── Budget Calculation

□ 1.2 Thinking Chain Persistence
  ├── DB Schema
  ├── Storage Service
  └── Retrieval for Priming

□ 1.3 Feedback Loop
  ├── API Endpoint
  ├── Quality Recording
  └── Budget Optimization Cron
```

### Phase 2: Memory System Evolution (Woche 3-4)

```
□ 2.1 Episodic Memory Layer
  ├── Schema & Service
  ├── Emotional Analysis
  ├── Retrieval mit Decay
  └── Consolidation Pipeline

□ 2.2 Working Memory
  ├── Slot Management
  ├── Spreading Activation
  └── Context Generation

□ 2.3 Memory Coordinator Integration
  ├── 4-Layer Orchestration
  ├── Token Budget Management
  └── Priority-based Pruning
```

### Phase 3: Agentic RAG Enhancement (Woche 5-6)

```
□ 3.1 Strategy Learning
  ├── Query Classification
  ├── Performance Tracking
  └── Adaptive Ordering

□ 3.2 Multi-Hop Reasoning
  ├── Hop Orchestration
  ├── Result Merging
  └── Explanation Generation

□ 3.3 Cross-Encoder Reranking
  ├── Batch Evaluation
  └── Score Integration
```

### Phase 4: Knowledge Graph Expansion (Woche 7-8)

```
□ 4.1 Temporal Knowledge Graph
  ├── Schema Migration
  ├── Temporal Queries
  └── Evolution Analysis

□ 4.2 Automatic Discovery
  ├── Isolation Detection
  ├── Relationship Classification
  └── Batch Creation UI

□ 4.3 Graph Reasoning
  ├── Explanation Paths
  ├── Contradiction Detection
  └── Resolution Suggestions
```

### Phase 5: MCP Ecosystem (Woche 9-10)

```
□ 5.1 Extended Tools
  ├── Deep Analysis Tool
  ├── Graph Query Tool
  ├── Memory Query Tool
  ├── Draft Generation Tool
  ├── Multi-Hop Search Tool
  └── Contradiction Finder Tool

□ 5.2 Extended Resources
  ├── Graph Resources
  ├── Memory Resources
  └── Analytics Resources

□ 5.3 Claude Desktop Integration
  └── Updated mcp-config.json
```

---

## Teil 3: Erfolgsmetriken

### Extended Thinking

| Metrik | Aktuell | Ziel |
|--------|---------|------|
| Avg. Thinking Tokens | ~10k | Dynamisch 2k-80k |
| Quality Score (User) | N/A | >4.2/5 |
| Budget Efficiency | N/A | >0.8 |

### Memory System

| Metrik | Aktuell | Ziel |
|--------|---------|------|
| Context Relevance | ~70% | >85% |
| Memory Retrieval Precision | ~65% | >80% |
| Episodic Recall Accuracy | N/A | >75% |

### Agentic RAG

| Metrik | Aktuell | Ziel |
|--------|---------|------|
| Retrieval MRR@10 | ~0.65 | >0.80 |
| Query Success Rate | ~75% | >90% |
| Avg. Hops Needed | N/A | <2.5 |

### Knowledge Graph

| Metrik | Aktuell | Ziel |
|--------|---------|------|
| Avg. Connections/Idea | ~2.3 | >4.0 |
| Auto-Discovery Precision | N/A | >70% |
| Explanation Path Success | N/A | >80% |

---

## Zusammenfassung

Dieser Plan fokussiert sich auf die **fünf führenden Bereiche** und macht sie noch stärker:

1. **Extended Thinking** → Dynamisches Budget + Learning Loop
2. **Memory Architecture** → Episodic Memory + Working Memory
3. **Agentic RAG** → Strategy Learning + Multi-Hop
4. **Knowledge Graph** → Temporal + Auto-Discovery + Reasoning
5. **MCP Integration** → 11 Tools + 10 Resources

**Keine Ablenkungen. Keine "Nice-to-haves". Nur Exzellenz in den Kernbereichen.**

---

*Dokument erstellt: 25. Januar 2026*
*Für: KI-AB Leadership Team*
