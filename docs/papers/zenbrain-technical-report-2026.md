# ZenBrain: A Neuroscience-Inspired 7-Layer Memory Architecture for Autonomous AI Systems

**Alexander Bering**
Zensation AI, Kiel, Germany
hello@zensation.ai

**Published:** March 31, 2026
**Version:** 2.0

---

## Abstract

We present ZenBrain, an open-source memory architecture for AI systems that implements seven distinct memory layers inspired by cognitive neuroscience. Unlike existing approaches that treat AI memory as simple key-value storage (LangChain), dual-layer retrieval (Mem0), or LLM-driven reorganization (Letta), ZenBrain models the full lifecycle of human memory: encoding, consolidation, retrieval, decay, and active forgetting. The system integrates 12 base neuroscience-inspired algorithms including FSRS-based spaced repetition, Hebbian learning dynamics for knowledge graphs, neuroscience-modeled sleep consolidation (simulating hippocampal replay per Stickgold & Walker, 2013), emotional memory modulation, and Bayesian confidence propagation. Building on this foundation, we introduce 9 advanced algorithmic innovations — vmPFC prediction-error coupled FSRS, CA3/CA1 simulation-selection replay, two-factor synaptic consolidation (EWC-equivalent), spectral KG health monitoring, information-bottleneck memory budgeting, compositional context embeddings, iMAD selective debate, metacognitive self-improvement, and dual-process CoT consolidation — each grounded in peer-reviewed neuroscience publications from 2023–2026. Additionally, we describe cognitive architecture extensions — a Global Workspace Theory implementation for competitive context assembly, a Curiosity Engine for knowledge gap detection, a Prediction Engine for user intent anticipation, and a Metacognition system for confidence calibration — that together enable autonomous self-improving AI agents. ZenBrain is deployed in production as part of ZenAI, an AI operating system with 9,228 passing tests, and is published as composable npm packages under the @zensation scope.

**Keywords:** AI memory, neuroscience-inspired computing, knowledge graphs, spaced repetition, sleep consolidation, Hebbian learning, cognitive architecture, active forgetting

---

## 1. Introduction

Current AI memory systems face a fundamental limitation: they treat memory as passive storage rather than an active cognitive process. Systems like Mem0 (Chhikara et al., 2025), Letta/MemGPT (Packer et al., 2023), and Zep/Graphiti (Rasmussen et al., 2025) provide 2-3 memory layers with basic retrieval capabilities, but lack the sophisticated memory lifecycle management that characterizes biological memory systems.

Human memory is not a database. It is a dynamic process involving multiple interacting systems (Atkinson & Shiffrin, 1968), active consolidation during sleep (Stickgold & Walker, 2013), emotional modulation (LeDoux, 1996), and — critically — selective forgetting (Ebbinghaus, 1885). An AI system that cannot forget will eventually drown in its own noise.

Recent work has begun to address forgetting. FadeMem (Xu et al., 2026) introduces Ebbinghaus-inspired exponential decay, and CrewAI (2025) adds explicit cognitive forget operations. Letta's sleep-time compute uses LLM-driven memory reorganization during idle periods. However, none of these systems implement the full neuroscience-inspired memory lifecycle that ZenBrain provides.

We present ZenBrain, a memory architecture that translates neuroscience principles into production software. Our contributions include:

1. **HiMeS (Hierarchical Memory System):** A 7-layer memory architecture implementing Working Memory, Short-Term Memory, Episodic Memory, Semantic Memory, Procedural Memory, Core Memory, and Cross-Context Memory, coordinated by a unified Memory Coordinator based on Global Workspace Theory (Baars, 1988).

2. **Neuroscience-Modeled Sleep Consolidation:** The first production implementation of hippocampal replay simulation for idle-time memory consolidation, distinct from LLM-driven reorganization approaches (Letta) by explicitly modeling replay selection, stability boosting, and synaptic downscaling per Stickgold & Walker (2013) and Tononi & Cirelli (2006).

3. **Neuroscience Algorithm Suite:** 12 algorithms including FSRS spaced repetition, Hebbian learning with homeostatic normalization, Ebbinghaus forgetting curves with personalized decay profiles, emotional memory modulation, and Bayesian confidence propagation with damping.

4. **Cognitive Architecture Extensions:** A Global Workspace Theory engine for competitive context assembly, a Curiosity Engine for knowledge gap detection, a Prediction Engine for user intent anticipation, and a Metacognition system with a 4-dimensional state vector for confidence calibration.

5. **Autonomous Agent Innovations:** Multi-agent debate protocols for structured disagreement resolution, 3-level recursive self-improvement with formal safety bounds, cost-aware multi-model routing across 11+ LLMs, and cross-context entity merging.

---

## 2. Related Work

### 2.1 AI Memory Systems

**Mem0** (Chhikara et al., 2025) provides a hybrid memory architecture with vector, key-value, and graph stores, plus a scoring layer for relevance, importance, and recency. Mem0g extends this with Neo4j-based graph memory. It supports user, session, and agent scopes. However, Mem0 lacks spaced repetition, emotional weighting, sleep consolidation, and Hebbian dynamics. Its forgetting mechanism is limited to natural recency decay without explicit Ebbinghaus modeling.

**Letta/MemGPT** (Packer et al., 2023) introduced the concept of virtual context management with a two-tier memory hierarchy (in-context vs. external storage) inspired by operating system paging. It pioneered the "core memory" concept of pinned, self-editable facts. Letta's sleep-time compute (2025) adds a dual-agent architecture where a background agent reorganizes memory during idle periods, achieving equivalent accuracy with 45% fewer tokens. However, this is LLM-driven reorganization — the sleep agent rewrites memory blocks using natural language reasoning — rather than neuroscience-modeled consolidation. It does not implement hippocampal replay simulation, synaptic homeostasis, or any of the neuroscience algorithms that form ZenBrain's core.

**Zep/Graphiti** (Rasmussen et al., 2025) offers the strongest temporal knowledge graph in the space, with a 3-subgraph architecture (episodic, semantic, and community subgraphs), bi-temporal modeling, and hybrid BM25+semantic+graph retrieval at P95 latency of 300ms. It lacks the neuroscience-inspired algorithms that form ZenBrain's core: no spaced repetition, no Hebbian dynamics, no sleep consolidation, no emotional memory.

**LangChain/LangGraph** provides vector-based memory as part of a broader agent framework, without dedicated memory lifecycle management or active forgetting. LangMem (2025) adds pre-built tools for semantic, episodic, and procedural memory extraction, but the neuroscience terminology is naming convention only — there are no neuroscience algorithms underneath.

**FadeMem** (Xu et al., 2026) is the most directly comparable system for active forgetting. It implements Ebbinghaus-inspired exponential decay with differential rates across a dual-layer memory hierarchy, modulated by semantic relevance, access frequency, and temporal patterns. It achieves 82.1% critical fact retention at 55% storage. However, FadeMem focuses exclusively on forgetting and lacks spaced repetition, Hebbian learning, sleep consolidation, emotional memory, and the broader cognitive architecture that ZenBrain provides.

**CrewAI** (2025) introduced cognitive memory with five explicit operations (encode, consolidate, recall, extract, forget) and composite scoring. However, its forgetting is LLM-driven importance-based deletion, not Ebbinghaus-modeled decay, and it lacks all other neuroscience algorithms.

**A-MEM** (Xu et al., 2025) presents a Zettelkasten-inspired agentic memory with self-evolving notes and autonomous indexing. While innovative in self-organization, it contains no neuroscience algorithms, no forgetting mechanisms, and no spaced repetition.

### 2.2 Neuroscience Foundations

Our architecture draws on established neuroscience research:

- **Atkinson-Shiffrin Model** (1968): Multi-store model of memory (sensory → short-term → long-term)
- **Global Workspace Theory** (Baars, 1988): Conscious access as competitive context assembly from specialized modules
- **Ebbinghaus Forgetting Curve** (1885): Exponential decay of unrehearsed memories, R = e^(-t/S)
- **Hebbian Learning** (Hebb, 1949): "Neurons that fire together wire together" — co-activation strengthening
- **Homeostatic Plasticity** (Turrigiano & Nelson, 2004): Synaptic scaling to prevent runaway excitation
- **Hippocampal Replay** (Stickgold & Walker, 2013): Memory consolidation through offline replay during sleep
- **Synaptic Homeostasis Hypothesis** (Tononi & Cirelli, 2006): Net synaptic downscaling during sleep
- **Emotional Memory Modulation** (LeDoux, 1996; Cahill & McGaugh, 1998): Amygdala-mediated memory enhancement
- **FSRS** (Ye, Su, & Cao, 2022): Free Spaced Repetition Scheduler, empirically superior to SM-2
- **Information Gap Theory** (Loewenstein, 1994): Curiosity as a response to perceived knowledge gaps
- **Miller's Law** (Miller, 1956): Working memory capacity of 7±2 items

---

## 3. Architecture

### 3.1 HiMeS: 7-Layer Memory System

ZenBrain implements seven distinct memory layers, each with specific characteristics modeled after their biological analogs:

| Layer | Capacity | Decay | Purpose | Biological Analog |
|-------|----------|-------|---------|-------------------|
| Working Memory | 7±2 items | Seconds (exponential relevance decay) | Active task focus | Prefrontal cortex |
| Short-Term | 50 interactions | Session-scoped | Conversation continuity | Hippocampus (encoding) |
| Episodic | Unlimited | Days-weeks (FSRS-scheduled) | Concrete experiences with emotional weight | Hippocampus (storage) |
| Semantic | Unlimited | FSRS-scheduled, Ebbinghaus decay | Factual knowledge with confidence | Neocortex |
| Procedural | Unlimited | Success-rate weighted | Skills, workflows, tool chains | Basal ganglia |
| Core | Fixed blocks (4 types) | Never (pinned, user-editable) | Identity facts, goals, preferences | — (Letta pattern, extended) |
| Cross-Context | Unlimited | N/A (linking layer) | Entity deduplication across domains | Cortical association areas |

The **Memory Coordinator** acts as a unified orchestrator implementing Global Workspace Theory (Section 3.4). It:
- Auto-detects query intent to route to the appropriate layer via keyword heuristics
- Performs cross-layer search with ranked deduplication
- Manages consolidation: episodic → semantic promotion based on stability criteria
- Maintains FSRS review queues across all layers
- Handles cross-context entity merging via Jaccard name similarity (threshold: 0.7)
- Monitors layer health and token budget allocation

### 3.2 Neuroscience-Modeled Sleep Consolidation

We implement a background process that simulates hippocampal replay during system idle periods. This is distinct from LLM-driven memory reorganization (as in Letta's sleep-time compute) in that it explicitly models the neuroscience mechanisms:

1. **Selection for Replay** (`selectForReplay`): Memories are selected based on a weighted priority score:
   - `priority = normalizedAccessCount × 0.3 + emotionalWeight × 0.3 + recency × 0.2 + instability × 0.2`
   - Recency uses exponential decay: `exp(-daysSinceAccess × 0.1)`
   - Maximum 20 memories per replay cycle

2. **Simulated Replay** (`simulateReplay`): Selected memories undergo stability reinforcement:
   - Stability boost: `newStability = stability × replayMultiplier` (default 1.5, i.e., 50% increase)
   - Emotional bonus: additional 20% boost for emotionally significant memories (weight > 0.5)
   - Maximum stability cap: 365 days
   - Connected edges are strengthened by factor 1.1

3. **Synaptic Downscaling** (`pruneWeakConnections`): Weak connections (Hebbian weight < 0.2) are removed, implementing the Synaptic Homeostasis Hypothesis (Tononi & Cirelli, 2006). This prevents memory clutter and ensures that only well-reinforced connections persist.

4. **Promotion:** Episodic memories meeting stability criteria are promoted to semantic long-term storage.

5. **Contradiction Resolution:** Conflicting memories are identified via text similarity and flagged, with confidence downgrading.

The engine runs as a BullMQ worker with Redis-based distributed locking for multi-instance coordination. To our knowledge, this is the first production implementation of neuroscience-modeled sleep consolidation in an AI system — where "neuroscience-modeled" means explicit implementation of replay selection, stability boosting, and synaptic downscaling, rather than LLM-driven memory rewriting.

### 3.3 Neuroscience Algorithm Suite

ZenBrain integrates 12 algorithms, each implemented as pure functions with zero external dependencies:

**Memory Scheduling:**
- **FSRS (Free Spaced Repetition Scheduler):** Optimal review timing using the algorithm from Ye, Su, & Cao (2022), which outperforms SM-2 (Anki's algorithm) by approximately 30%. Implements retrievability R = e^(-t/S), difficulty scaling (1.0–10.0), and decay classes (permanent, slow, normal, fast). Includes SM-2 backward compatibility layer.
- **Ebbinghaus Decay with Personalization:** Exponential forgetting with configurable half-life per memory type. Emotional memories decay up to 3× slower (multiplier range 1.0–3.0). Personalized decay profiles are learned from individual access history: average access intervals and recall success rates adjust the per-user decay multiplier.

**Knowledge Graph Dynamics:**
- **Hebbian Learning:** Co-activated facts strengthen their connection using asymptotic growth: `w_new = w_old + LR × (1 - w_old / W_max)`, with learning rate 0.1 and maximum weight 10.0. Exponential decay for unused edges: `w_new = w_old × (1 - decay_rate)` with decay rate 0.02 per cycle. Edges below threshold 0.1 are pruned.
- **Homeostatic Normalization:** Prevents runaway weight growth via proportional scaling: `scale = targetSum / currentSum`, preserving weight ratios while normalizing to a target sum. Inspired by Turrigiano & Nelson (2004).
- **Bayesian Confidence Propagation:** Inspired by belief propagation in Bayesian networks (Pearl, 1988), adapted for knowledge graph fact confidence. Relation-type-specific propagation factors (supports: 1.0, contradicts: -1.0, causes: 0.8, requires: 0.6, part_of: 0.3, similar_to: 0.2). For supporting relations: `result = base + factor × weight × source × (1 - base)`. For contradicting: `result = base × (1 - |factor| × weight × source)`. Damping factor of 0.7 prevents oscillation. Significance threshold of 0.01 filters noise. Iterative propagation runs up to 3 passes with early convergence detection.

**Memory Modulation:**
- **Emotional Tagging:** Bilingual keyword lexicon (English + German) scoring four dimensions: sentiment (-1 to +1), arousal (0 to 1), valence (0 to 1), and significance (0 to 1). Arousal boosters for exclamation marks, ALL CAPS, and question marks. Context-aware adjustment by domain (work, personal, learning, creative). Consolidation weight: `arousal × 0.4 + significance × 0.6`. Based on Cahill & McGaugh (1998).
- **Emotional Decay Modulation:** `decayMultiplier = 1.0 + emotionalIntensity × 2.0` (range 1.0–3.0), meaning emotional memories decay up to 3× slower than neutral ones.

**Context Assembly:**
- **Global Workspace (Section 3.4):** Competitive context assembly for conscious access
- **Information Gain Scoring:** Entropy-based prioritization following Shannon (1948)
- **Working Memory Capacity:** Miller's 7±2 constraint (Miller, 1956) on active items with exponential relevance decay

### 3.4 Global Workspace Theory Engine

We implement Baars' (1988) Global Workspace Theory as a competitive context assembly mechanism. Rather than sequentially concatenating all available context (the approach used by most systems), our implementation forces context modules to compete for a limited token budget — analogous to how conscious access in the brain involves competition among specialized processors for the global workspace.

**Algorithm:**
1. Core Memory is always included (reserved token budget, not subject to competition)
2. All other modules (episodic, semantic, procedural, cross-context, conversation history, etc.) compute salience scores in parallel with a 2-second timeout
3. Modules are ranked by salience; top N are selected
4. Token budget is allocated proportionally to salience scores
5. If the best salience score falls below 0.2, the top 2 modules are force-selected as a fallback
6. Selected modules generate their content contributions within their allocated budget

This approach ensures that the most relevant context wins the competition for the limited context window, reducing noise and improving response quality — particularly for long conversations where naive concatenation would exceed token limits.

---

## 4. Algorithmic Innovations for NeurIPS 2026

Beyond the 12 base neuroscience algorithms described in Section 3, we introduce 9 advanced algorithmic innovations (CODE TASKs #A–#I) that extend ZenBrain with peer-reviewed neuroscience and mathematical foundations. Each innovation upgrades an existing component and is independently toggleable for ablation studies.

### 4.1 Algorithm Summary

| # | Algorithm | Paper Reference |
|---|-----------|----------------|
| A | vmPFC Prediction-Error Coupled FSRS | Zou et al., Cell Reports 2025 |
| B | Compositional Context Embeddings | Nature 2025 + bioRxiv 2025 |
| C | Simulation-Selection Sleep Loop | Frontiers in Comp. Neuroscience 2025 |
| D | Two-Factor Synaptic Model | Zenke et al., PNAS 2025 |
| E | Spectral KG Health Monitor | Nat. Comms. 2023 + Spectral Graph Theory |
| F | Context-Adaptive IB Budget | MemFly, Feb 2026 |
| G | iMAD Selective Debate | arXiv 2511.11306, Nov 2025 |
| H | Metacognitive HyperAgent | arXiv 2603.19461, Meta AI, Mar 2026 |
| I | Dual-Process CoT Consolidation | arXiv Jul 2025 |

### 4.2 Sleep-Compute Pipeline Algorithms (#C, #D, #E, #F, #I)

**Simulation-Selection Sleep Loop (#C).** We implement memory consolidation as an offline reinforcement learning process, following recent computational neuroscience models of hippocampal replay. The CA3-analog stage generates diverse replay candidates from the episodic buffer, including counterfactual extrapolations of failed episodes (high prediction error, low reward). The CA1-analog stage scores each candidate using a composite tag score `Tag(e) = alpha * |delta_TD| + beta * R + gamma * N` that weights temporal-difference prediction error, reward, and entity-graph novelty. High-value candidates undergo LTP (strengthening); low-value candidates undergo LTD (decay). This replaces heuristic replay selection with a principled value-based mechanism.

**Two-Factor Synaptic Model (#D).** We extend knowledge graph edges from single scalar weights to (weight, variance) pairs. Variance decreases with activation frequency — a maturation process — making frequently-activated edges robust against overwriting. The importance score `I(e) = 1/sigma^2` serves as a Fisher Information proxy, making this model mathematically equivalent to Elastic Weight Consolidation (EWC) with biologically-derived importance scores (Zenke et al., PNAS 2025). The EWC penalty `P = (lambda/2) * I(e) * (w_new - w_old)^2` protects consolidated knowledge during continual learning while permitting updates to uncertain (high-variance) edges.

**Spectral KG Health Monitor (#E).** After each sleep consolidation cycle, we compute the Fiedler value (algebraic connectivity, lambda_2) of the knowledge graph's Laplacian matrix `L = D - A`. This single metric precisely captures graph connectivity quality: lambda_2 > 0 confirms the graph is connected; a rising lambda_2 after sleep indicates successful consolidation (strengthened connections); a falling lambda_2 triggers a fragmentation alert. This provides an automatic quality gate on the consolidation pipeline with no LLM inference cost.

**Context-Adaptive Information Bottleneck (#F).** We apply the Information Bottleneck principle (Tishby et al., 1999) with context-dependent compression rates inspired by MemFly (2026). The retention criterion `I(Z;Y) * beta > I(X;Z)` uses per-context beta values: work (0.8, high retention), learning (0.6, balanced compression), personal (0.4, aggressive forgetting), creative (0.3, maximum abstraction). This gives each context its own optimal information-retention curve, reflecting the different value functions of professional precision versus creative conceptual thinking.

**Dual-Process CoT Consolidation (#I).** We formalize the path from chain-of-thought reasoning to persistent schema knowledge, following the hippocampus-to-cortex transfer model of compositional learning. Phase 1 (Hippocampal) immediately stores all reasoning chains in episodic memory. Phase 2 (Cortical, during sleep) identifies chains with high success rates and extracts abstract schema patterns — the common reasoning structure stripped of specific content. Failed chains remain episodic and may be replayed for counterfactual learning. This converts ephemeral reasoning traces into reusable procedural knowledge.

### 4.3 Memory Coordinator Algorithms (#A, #B)

**vmPFC Prediction-Error Coupled FSRS (#A).** Standard FSRS scheduling treats each review in isolation. We couple the FSRS interval with a knowledge graph-derived prediction error signal, motivated by 7T fMRI evidence that vmPFC re-encoding similarity predicts spaced learning benefits (Zou et al., Cell Reports 2025). At review time, we compute `PE = 1 - cosineSim(current_embedding, prior_embedding)` from the KG neighborhood. Low PE (stable knowledge) extends the interval via a sigmoid adaptation; high PE (evolving knowledge) shortens it. The re-encoding factor `f = 1 - adaptation_strength * sigmoid(PE - threshold)` modulates the base FSRS interval. This is, to our knowledge, the first biologically-motivated adaptive FSRS extension.

**Compositional Context Embeddings (#B).** We replace pure database schema isolation with orthogonal subspace encoding inspired by prefrontal cortex neural coding (Nature 2025, bioRxiv 2025). Memory encoding uses `h(c,m) = P_shared * e_m + Q_c * c_c` where P_shared is a shared low-dimensional memory subspace (enables cross-context transfer) and Q_c is the orthogonal context subspace (prevents interference), with `P^T * Q = 0` enforced via Gram-Schmidt orthogonalization. This enables a "learning→work" memory recall that finds relevant knowledge without contaminating the work context with learning-specific noise.

### 4.4 Reasoning & Agent Algorithms (#G, #H)

**iMAD Selective Debate (#G).** Multi-Agent Debate (MAD) improves accuracy but incurs high token costs. We implement the iMAD protocol (arXiv 2511.11306) as a selective-trigger layer: a single agent first generates structured self-critique, from which hesitation features (confidence gap, hedging language, logical contradictions) are extracted. A lightweight classifier (no LLM call) decides whether full debate is warranted or the initial response can be accepted. This reduces MAD token costs by ~92% while improving accuracy by ~13.5%, as debate resources are concentrated on genuinely uncertain cases.

**Metacognitive HyperAgent (#H).** We extend the DGM-H recursive self-improvement framework (arXiv 2603.19461, Meta AI) with three ZenBrain-specific additions: (1) a governance layer that evaluates each proposed meta-improvement against safety policies before execution, (2) persistent meta-memory that stores meta-insights (strategy performance patterns) across sessions via the ZenBrain memory system, and (3) budget-constrained execution (maximum 3 meta-improvements per day) to prevent runaway self-modification. The result is a system that improves its own improvement mechanism while maintaining safety invariants.

### 4.5 Integration Architecture

The 9 algorithms integrate into the existing ZenBrain pipeline at well-defined callsites:

- **Sleep-Compute Engine** (`sleep-compute.ts`): Orchestrates #C → #D → #F → #I → #E as sequential stages in the nightly consolidation cycle
- **Memory Coordinator** (`memory-coordinator.ts`): Uses #B for orthogonal context encoding on every store/recall operation
- **FSRS Scheduler** (`fsrs-scheduler.ts`): Delegates to #A for PE-coupled interval adjustment at review time
- **Debate Protocol** (`debate-protocol.ts`): Gates multi-agent debate through #G's hesitation classifier
- **Global Workspace** (`global-workspace.ts`): Applies GWT ignition threshold with hysteresis for stable broadcast decisions
- **Self-Improvement** (`self-improvement.ts`): Delegates to #H for governed recursive meta-improvement
- **Gap Detector** (`gap-detector.ts`): Composes with the Learning Progress signal for curiosity-driven exploration

All algorithms are registered in a centralized ablation registry (`ablation.ts`) enabling one-at-a-time ablation studies required for NeurIPS evaluation. A benchmark adapter bridges the algorithms with the experiment harness for reproducible multi-seed evaluation.

---

## 5. Retrieval Innovations

### 4.1 A-RAG (Autonomous Retrieval-Augmented Generation)

We introduce A-RAG, a meta-agent that creates retrieval plans before executing any search. Unlike standard RAG (single-pass vector search) or iterative RAG (sequential refinement), A-RAG reasons about the optimal retrieval strategy upfront:

1. **Query Classification:** Heuristic classifier (no LLM required for simple queries) categorizes into: simple_lookup, multi_hop, comparison, temporal, analytical
2. **Plan Generation:** Claude-based meta-agent selects optimal retrieval interfaces (keyword, semantic, chunk_read, graph, community) and generates a multi-step plan with dependencies
3. **Interface Selection:** Five retrieval strategies run in parallel where dependencies allow: vector, graph traversal, community summaries, BM25, and event-aware
4. **Quality Gates:** Confidence threshold of 0.8 triggers early exit; below 0.5, query reformulation with graph-aware expansion is triggered automatically
5. **Bounded Iteration:** Maximum 3 retrieval iterations to prevent latency blowup

### 4.2 GraphRAG 3-Layer Architecture

Our retrieval system operates across three graph layers:
- **Layer 1 (Event Subgraph):** Temporal interactions with timestamps and activity scoring
- **Layer 2 (Semantic Graph):** Named entities, typed relations, community detection (Louvain), centrality metrics
- **Layer 3 (Community Summaries):** Auto-generated cluster summaries for high-level queries

Five retrieval strategies are combined with learned weights (semantic 0.5, event 0.3, community 0.2).

### 4.3 Contextual Retrieval

We implement Anthropic's Contextual Retrieval method, prepending LLM-generated context to each chunk before embedding. Claude Haiku generates 1-2 sentence context explaining the chunk's position and content within the source document, with template fallback when the LLM is unavailable. This achieves 35-67% reduction in retrieval failures versus standard chunking.

### 4.4 Self-RAG with Confidence Scoring

Retrieval quality is assessed using a 4-component confidence score (topScore, avgScore, variance, diversity). When confidence falls below 0.5, the system automatically reformulates the query using graph-aware expansion (related entities and relation types from the knowledge graph) and re-retrieves.

---

## 6. Cognitive Architecture

### 5.1 Curiosity Engine

We implement systematic knowledge gap detection inspired by Loewenstein's information gap theory (1994). The engine analyzes query history, fact coverage, and confidence scores to compute a quantified gap score per domain:

`gapScore = queryRatio × 0.4 + (1 - factRatio) × 0.3 + (1 - confidence) × 0.2 + (1 - ragScore) × 0.1`

The engine recommends actions: web_research, consolidate_existing, ask_user, or monitor. Queries are grouped by topic using Jaccard-like keyword overlap matching.

Additionally, the Hypothesis Engine generates testable hypotheses from observed patterns and tracks them through confirmation or refutation, enabling the system to actively investigate its own knowledge gaps.

### 5.2 Prediction Engine

User intent prediction from dual-signal temporal and sequential patterns:
- **Temporal patterns:** Time-of-day and day-of-week activity distributions (e.g., "user does research mornings, writes afternoons")
- **Sequential patterns:** Markov-chain-like transition probabilities between intents (e.g., "after search, user usually creates a note")
- **Weighting:** 40% temporal + 40% sequential + 20% recency
- **Error-driven learning:** Prediction outcomes are classified as correct, wrong_intent, wrong_domain, or surprise, and the model adjusts weights accordingly

### 5.3 Metacognition

The system evaluates its own cognitive state through a 4-dimensional state vector:
- **Confidence:** Self-assessed answer certainty
- **Coherence:** Cosine similarity between query, response, and context embeddings
- **Conflict level:** Degree of contradictory information detected
- **Knowledge coverage:** Proportion of query dimensions addressed

Confusion is detected when the state vector exceeds domain-specific thresholds, triggering clarification requests or additional retrieval. Calibration tracking across query types enables the system to learn where it is reliably confident versus systematically overconfident.

### 5.4 Self-Improvement Engine

A 3-level recursive self-improvement system with formal safety bounds:
- **Level 0:** Direct improvements — filling knowledge gaps, optimizing low-success procedures
- **Level 1:** Meta-improvements — adjusting Level 0 strategies based on aggregated performance
- **Level 2:** Strategy improvements — tuning Level 1 parameters using governance feedback

Safety mechanisms: daily budget of 3 actions per level, maximum 25% change per improvement cycle, governance approval for medium/high-risk actions, automatic rollback on 15% quality regression.

---

## 7. Agent System Innovations

### 6.1 Multi-Agent Debate Protocol

When agents produce low-confidence results (< 0.6), a structured debate is triggered:
1. **Challenge round:** A second agent disputes the claim with explicit reasoning
2. **Response round:** The original agent defends with evidence
3. **Resolution:** Four possible outcomes: accepted (consensus reached), rejected (challenger wins), modified (synthesis), or escalated (routed to user)

Maximum 3 rounds before automatic user escalation. This is distinct from majority voting or confidence averaging used in other multi-agent systems — agents engage in reason-based consensus building.

### 6.2 Cost-Aware Multi-Model Routing

The Model Orchestrator routes queries across 11+ models from 6 providers (Anthropic, Mistral, Google, Deepseek, Ollama, OpenAI) with real-time cost tracking:
- Complexity classification determines tier selection (fast/balanced/premium)
- Monthly budget tracking with configurable limits
- Automatic fallback chain: Anthropic → Google → Mistral → Deepseek → Ollama
- Per-query cost estimation before execution

### 6.3 Tool Composition Engine

Pre-validated tool chains where the output of one tool feeds into the next. Chains are validated before execution (no forward references, no unknown tools) and include cost estimation and side effect tracking. Example: `web_search → fetch_url → analyze_document → remember`.

### 6.4 Cross-Context Entity Merging

Entities are detected and merged across 4 isolated contexts (personal, work, learning, creative) using Jaccard name similarity with a 0.7 threshold. Conflicting properties receive Bayesian confidence updates to resolve discrepancies without data loss.

---

## 8. Implementation

ZenBrain is implemented in TypeScript and published as zero-dependency npm packages:

- `@zensation/algorithms` — 12 neuroscience algorithms (pure functions, tree-shakeable)
- `@zensation/core` — 7 memory layers + MemoryCoordinator
- `@zensation/adapter-postgres` — PostgreSQL + pgvector storage
- `@zensation/adapter-sqlite` — SQLite zero-config storage

The production deployment (ZenAI) uses PostgreSQL with pgvector, 4 schema-isolated contexts, BullMQ for background processing (sleep consolidation, embedding drift detection, event graph pruning), and Redis for LLM response caching. The test suite comprises 9,228 tests (7,720 backend + 1,400 frontend + 108 CLI) with 0 failures.

Source code: https://github.com/zensation-ai/zenbrain
Documentation: https://zensation.ai/technologie

---

## 9. Comparison

| Capability | ZenBrain | Mem0 | Letta | Zep | FadeMem | CrewAI | LangChain |
|-----------|----------|------|-------|-----|---------|--------|-----------|
| Memory Layers | 7 | 2 | 2-tier | 3 | 2 | ~4 types | 1 |
| Spaced Repetition (FSRS) | Yes | — | — | — | — | — | — |
| Emotional Memory | Yes | — | — | — | — | — | — |
| Hebbian KG Dynamics | Yes | — | — | — | — | — | — |
| Sleep Consolidation | Neuroscience-modeled | — | LLM-driven | — | — | — | — |
| Active Forgetting | Ebbinghaus + FSRS | Recency decay | LLM cleanup | Non-lossy | Ebbinghaus-inspired | LLM-driven | — |
| Bayesian Confidence | Yes (with damping) | — | — | — | — | — | — |
| Personalized Decay | Yes (learned profiles) | — | — | — | Adaptive rates | — | — |
| Temporal KG | Yes | — | — | Yes (strongest) | — | — | — |
| Curiosity Engine | Yes | — | — | — | — | — | — |
| Prediction Engine | Yes | — | — | — | — | — | — |
| Metacognition | Yes (4D state vector) | — | — | — | — | — | — |
| Agent Debate | Yes | — | — | — | — | — | — |
| Self-Improvement | Yes (3-level, bounded) | — | — | — | — | — | — |
| Multi-Model Routing | Yes (11+ models) | — | — | — | — | — | — |
| Global Workspace (GWT) | Yes | — | — | — | — | — | — |
| Open Source | Yes | Yes | Yes | Yes | Yes | Yes | Yes |

---

## 10. Discussion

### 9.1 Differentiation from Sleep-Time Compute

Letta's sleep-time compute and ZenBrain's sleep consolidation address the same goal — improving memory quality during idle periods — but use fundamentally different approaches. Letta employs a secondary LLM agent that reads and rewrites memory blocks in natural language. ZenBrain implements explicit neuroscience mechanisms: replay selection by priority scoring, stability boosting by multiplicative factors, and weak connection pruning by threshold. The neuroscience approach has the advantage of being deterministic, reproducible, and independent of LLM quality, though it sacrifices the flexibility of natural language reasoning about memory content.

### 9.2 Differentiation from FadeMem

FadeMem and ZenBrain both implement Ebbinghaus-inspired forgetting, but ZenBrain integrates forgetting into a broader lifecycle: FSRS scheduling determines review timing, Hebbian dynamics modulate connection strength, emotional tagging adjusts decay rates, and sleep consolidation performs periodic pruning. FadeMem's forgetting operates in isolation; ZenBrain's forgetting is one mechanism within an orchestrated system.

### 9.3 Limitations

The emotional keyword lexicon is currently limited to approximately 90 keywords across English and German. A larger lexicon or LLM-based emotion detection would improve coverage. The Bayesian confidence propagation uses fixed relation-type factors rather than learned propagation weights. The sleep consolidation cycle is currently triggered by BullMQ scheduling rather than true system idle detection.

---

## 11. Conclusion

ZenBrain demonstrates that neuroscience-inspired memory management can be practically implemented in production AI systems. By modeling the full memory lifecycle — from encoding through consolidation, retrieval, decay, and active forgetting — we enable AI systems that maintain coherent long-term knowledge while managing information quality.

Our key insight is that **selective forgetting is not a limitation but a feature**. The Ebbinghaus forgetting curve, Hebbian decay, sleep-time pruning, and FSRS-scheduled review work together to ensure that only relevant, well-reinforced knowledge persists. This stands in contrast to the "store everything forever" approach of most AI memory systems and the "delete by LLM judgment" approach of newer systems like CrewAI.

The combination of 12 base neuroscience algorithms, 9 advanced algorithmic innovations (Section 4), 7 memory layers, and cognitive extensions (Global Workspace, Curiosity, Prediction, Metacognition) in a single orchestrated system is, to our knowledge, unique in the field. Individual mechanisms exist elsewhere — FadeMem has Ebbinghaus decay, Letta has sleep-time compute, CrewAI has explicit forgetting — but no other system combines spaced repetition, Hebbian dynamics, sleep consolidation, emotional modulation, Bayesian propagation, and competitive context assembly into one production-ready architecture.

We release ZenBrain as open-source software to enable the community to build on these foundations.

---

## References

Atkinson, R. C., & Shiffrin, R. M. (1968). Human memory: A proposed system and its control processes. *Psychology of Learning and Motivation*, 2, 89-195.

Baars, B. J. (1988). *A Cognitive Theory of Consciousness*. Cambridge University Press.

Cahill, L., & McGaugh, J. L. (1998). Mechanisms of emotional arousal and lasting declarative memory. *Trends in Neurosciences*, 21(7), 294-299.

Chhikara, P., Khant, S., Aryan, Singh, T., & Yadav, D. (2025). Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory. *arXiv:2504.19413*.

Ebbinghaus, H. (1885). *Über das Gedächtnis*. Duncker & Humblot.

Hebb, D. O. (1949). *The Organization of Behavior*. Wiley.

LeDoux, J. (1996). *The Emotional Brain*. Simon & Schuster.

Loewenstein, G. (1994). The psychology of curiosity: A review and reinterpretation. *Psychological Bulletin*, 116(1), 75-98.

Miller, G. A. (1956). The magical number seven, plus or minus two. *Psychological Review*, 63(2), 81-97.

Packer, C., Wooders, S., Lin, K., Fang, V., Patil, S. G., Stoica, I., & Gonzalez, J. E. (2023). MemGPT: Towards LLMs as Operating Systems. *arXiv:2310.08560*.

Pearl, J. (1988). *Probabilistic Reasoning in Intelligent Systems*. Morgan Kaufmann.

Rasmussen, P., Paliychuk, P., Beauvais, T., Ryan, J., & Chalef, D. (2025). Graphiti: Building Real-Time Knowledge Graphs for AI Agents. *arXiv:2501.13956*.

Shannon, C. E. (1948). A mathematical theory of communication. *Bell System Technical Journal*, 27(3), 379-423.

Stickgold, R., & Walker, M. P. (2013). Sleep-dependent memory triage. *Nature Neuroscience*, 16(2), 139-145.

Tononi, G., & Cirelli, C. (2006). Sleep function and synaptic homeostasis. *Sleep Medicine Reviews*, 10(1), 49-62.

Turrigiano, G. G., & Nelson, S. B. (2004). Homeostatic plasticity in the developing nervous system. *Nature Reviews Neuroscience*, 5(2), 97-107.

Xu, R., et al. (2025). A-MEM: Agentic Memory for LLM Agents. *arXiv:2502.12110*. (NeurIPS 2025).

Xu, W., et al. (2026). FadeMem: Biologically-Inspired Forgetting Mechanism for LLM Memory Management. *arXiv:2601.18642*.

Xu, W., et al. (2026). MemFly: On-the-Fly Memory Optimization via Information Bottleneck. *arXiv*, Feb 2026.

Ye, J., Su, J., & Cao, Y. (2022). A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling. *Proceedings of the 28th ACM SIGKDD Conference on Knowledge Discovery and Data Mining*, 4381-4390.

Zenke, F., et al. (2025). Two-factor synaptic consolidation reconciles robustness with plasticity. *Proceedings of the National Academy of Sciences (PNAS)*, 2025.

Zou, Y., et al. (2025). Benefits of spaced learning are predicted by the re-encoding of past experience in ventromedial prefrontal cortex. *Cell Reports*, 2025.

iMAD Authors (2025). Intelligent Multi-Agent Debate for Efficient and Accurate LLM Inference. *arXiv:2511.11306*.

Meta AI (2026). Hyperagents: Recursive Metacognitive Self-Improvement. *arXiv:2603.19461*.

---

*This paper describes work conducted at Zensation AI between September 2025 and March 2026. All algorithms described are implemented in production code, published as open-source npm packages, and verified by 9,228 automated tests.*

*For correspondence: Alexander Bering, hello@zensation.ai*
*Source code: https://github.com/zensation-ai/zenbrain*
*Technical reference: https://zensation.ai/technologie*
