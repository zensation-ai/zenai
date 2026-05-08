# Reproducing ZenAI Experiment Results

This guide explains how to reproduce all experimental results from the ZenBrain paper (Zenodo DOI: 10.5281/zenodo.19353663).

## Prerequisites

- Node.js 20+ (tested with v20.11, v22.x)
- npm 10+
- No external API keys required (all experiments are self-contained)
- No database or Redis required

## Quick Start

```bash
# Clone and install
git clone https://github.com/zensation-ai/zenai
cd zenai
npm install
cd backend && npm install

# Run all experiments (< 2 minutes)
npm run experiments

# Or use the script directly
../scripts/run-experiments.sh
```

## Experiment Suites

### 1. PMA Benchmark Suite (`pma-benchmark.test.ts`)

Evaluates 6 Predictive Memory Architecture algorithms:

| Algorithm | Metric | Expected Range |
|-----------|--------|----------------|
| NeuromodulatorEngine | Mean tonic drift | < 0.15 |
| NeuromodulatorEngine | DA-5HT opposition | Negative correlation |
| ReconsolidationEngine | PE-mode accuracy | >= 0.95 |
| ReconsolidationEngine | Contradiction detection | 1.0 |
| TripleCopyMemory | 7d retention vs Ebbinghaus | Triple > Ebbinghaus |
| TripleCopyMemory | 30d retention vs Ebbinghaus | Triple >> Ebbinghaus |
| PriorityMap | NDCG@10 | > 0.7 |
| PriorityMap | Amygdala fast-path | Score >= 0.5 |
| StabilityProtector | False-positive rate | < 0.30 |
| MetacognitiveMonitor | Bias precision | > 0.6 |
| MetacognitiveMonitor | Bias recall | > 0.6 |

```bash
cd backend
npx jest --testPathPattern="experiments/pma-benchmark" --verbose
```

### 2. Ablation Study (`ablation-study.test.ts`)

One-at-a-time ablation of all 15 neuroscience algorithms:

- **Baseline**: Full system with all 15 algorithms enabled
- **15 single-algorithm removals**: Each algorithm disabled individually
- **No PMA**: Only 9 NeurIPS algorithms (6 PMA disabled)
- **No Algorithms**: Bare system with all algorithms disabled

Metrics: Memory Retention, Retrieval Precision@5, Quality Proxy (Retention x P@5)

Statistical tests: Wilcoxon signed-rank (paired), Cohen's d effect sizes

```bash
cd backend
npx jest --testPathPattern="experiments/ablation-study" --verbose
```

### 3. Competitive Comparison (`competitive-comparison.test.ts`)

Three system configurations on identical synthetic data:

| System | Description | Equivalent to |
|--------|-------------|---------------|
| Static RAG | Pure vector similarity, no memory lifecycle | Mem0, Zep |
| Simple Memory | Vector + Ebbinghaus decay, no neuromodulation | Letta/MemGPT |
| Full ZenAI | All 15 algorithms active | ZenBrain |

Metrics: P@5, R@5, MRR, per-category and per-difficulty breakdowns

```bash
cd backend
npx jest --testPathPattern="experiments/competitive-comparison" --verbose
```

## Seeds and Reproducibility

All experiments use 10 fixed seeds with the Mulberry32 PRNG:

```
42, 123, 456, 789, 1024, 2048, 3072, 4096, 5120, 6144
```

Results are fully deterministic. The same seeds produce identical outputs across platforms (tested on macOS ARM64, Linux x86_64).

## Output Format

Each experiment produces JSON output captured between marker lines:

```
--- PMA_BENCHMARK_RESULTS_JSON ---
[{ "algorithm": "...", "metric": "...", "mean": 0.123, ... }]
--- END_PMA_BENCHMARK_RESULTS ---
```

The `run-experiments.sh` script automatically extracts these into:

```
docs/papers/results/
├── pma-benchmark.json           # PMA algorithm benchmarks
├── ablation-study.json          # 15-algorithm ablation
├── competitive-comparison.json  # 3-system comparison
└── summary.csv                  # Unified CSV for all experiments
```

## Mapping Results to Paper Tables

| Result File | Paper Table | Description |
|-------------|-------------|-------------|
| `pma-benchmark.json` | Table 6 | PMA Retention Comparison |
| `ablation-study.json` | Table 7 | Full 15-Algorithm Ablation |
| `competitive-comparison.json` | Table 8 | Competitive Comparison |
| `summary.csv` | — | Unified data export |

## Statistical Protocol

- 10 independent runs per configuration (10 seeds)
- 95% bootstrap confidence intervals (1,000 resamples)
- Wilcoxon signed-rank test for paired comparisons
- Cohen's d effect sizes
- Bonferroni correction for multiple comparisons

## Troubleshooting

**Tests timeout**: Increase Jest timeout in `jest.config.js` or run individual suites.

**Different Node.js version**: Results should be identical across Node.js 20+. If you observe differences, check for floating-point behavior changes.

**Missing dependencies**: Run `npm install` in the `backend/` directory.

## Compute Requirements

- **Hardware**: Any machine with 4+ GB RAM
- **Time**: < 2 minutes total for all 3 experiment suites
- **Network**: No network access required (all experiments are offline)
- **Cost**: $0 (no API calls)

## Optional: External Memory Baselines (Mem0 / Letta / A-Mem + LLM-Judge)

The TS experiments above are self-contained. For the paper's baseline comparison
against published memory systems, we ship a Python harness under
`experiments/baselines/`. This step is **optional** and is *not* required for the
core PMA / ablation / competitive-real results.

### Prerequisites

- Python 3.11+
- `pip install -r experiments/baselines/requirements.txt` (each adapter is optional)
- For LLM-as-Judge: `ANTHROPIC_API_KEY` set in the environment

### Steps

```bash
# 1. Emit the LoCoMo subset for the Python harness
cd experiments
npx tsx scripts/dump-locomo.ts --facts 600 --queries 40

# 2. Run baselines + optional LLM-Judge
cd baselines
python run_baselines.py \
    --baselines mem0,letta,a-mem \
    --seeds 42,123,456 \
    --judge --judge-delay 0.5

# 3. Regenerate LaTeX tables (picks up competitive-baselines.json)
cd ..
npx tsx scripts/generate-tables.ts
```

### Files produced

| File | Description |
|---|---|
| `docs/papers/results/baseline-<name>.json` | Per-baseline metrics + per-query retrieved ids |
| `docs/papers/results/judge-<name>.json` | Per-query Claude judge scores (0–5 + rationale) |
| `docs/papers/results/competitive-baselines.json` | Merged summary used by the LaTeX generator |
| `docs/papers/latex/tables/competitive-baselines.tex` | External-baselines table for the paper |

### Judge model

Default is `claude-sonnet-4-6`. Override via `ZENAI_JUDGE_MODEL` or `--judge-model`.
The judge is prompt-engineered for integer 0-5 Likert scores with a one-sentence
rationale; replies that fail to parse are recorded per-query as errors without
aborting the run.

### Tests (no API calls)

```bash
# TS experiment suites
cd backend && npm test -- --testPathPatterns=experiments

# Python judge unit tests (fake Anthropic client, no network)
python experiments/baselines/test_llm_judge.py
```

## Real LoCoMo Benchmark (paper Table 8, combined)

The subset above (`--facts 600 --queries 40`) is a keyword-overlap-derived
synthetic subset. For the NeurIPS paper's headline comparison, we additionally
evaluate all systems on the **full LoCoMo corpus** (1,986 queries across 5
categories) using the original evidence-derived gold fact ids. Both harnesses
read the *same* flat JSON dump, so ZenBrain, Mem0, Letta and A-Mem are judged on
identical inputs.

### Prerequisites

- Everything from the previous section, plus:
- A real embedding provider for ZenBrain:
  - **Ollama** (recommended, free, local): `ollama pull nomic-embed-text` + `OLLAMA_URL=http://localhost:11434`
  - **OpenAI**: `OPENAI_API_KEY` set
- For Mem0: `OPENAI_API_KEY` (Mem0 calls OpenAI internally by default)
- For Letta: a running Letta server on `localhost:8283` (`letta server`)
- For A-Mem: `pip install git+https://github.com/agiresearch/A-mem.git@main`

### Pipeline

```bash
# 1. Download raw LoCoMo (one-time, ~6 MB)
cd experiments
./scripts/download-locomo.sh

# 2. Emit the flat real-dataset dump used by BOTH harnesses
npx tsx scripts/dump-locomo.ts --source real
# → experiments/data/locomo-real.json (5,882 facts, 1,986 queries)

# 3. Smoke-test adapters (skips whatever isn't installed)
cd baselines
python smoke_adapters.py
# → exit 0 when every installed adapter can ingest/query/reset

# 4a. ZenBrain on real LoCoMo (writes competitive-locomo-real.json)
cd ../../backend
OLLAMA_URL=http://localhost:11434 \
  npx jest --testPathPatterns="competitive-locomo-real" --no-coverage

# 4b. Mem0 / Letta / A-Mem + LLM-Judge on real LoCoMo
cd ../experiments/baselines
python run_baselines.py \
    --dataset real \
    --seeds 42,123,456 \
    --baselines mem0,letta,a-mem \
    --judge --judge-model claude-sonnet-4-6 --judge-delay 1.0

# 5. Regenerate LaTeX tables (includes the combined table)
cd ..
npx tsx scripts/generate-tables.ts
# → docs/papers/latex/tables/competitive-combined.tex
```

### Files produced

| File | Description |
|---|---|
| `experiments/data/locomo-real.json` | Flat dump shared by both harnesses (1,986 queries) |
| `docs/papers/results/competitive-locomo-real.json` | ZenBrain / StaticRAG / SimpleMemory on real LoCoMo (TS harness) |
| `docs/papers/results/competitive-baselines.json` | Mem0 / Letta / A-Mem on real LoCoMo (Python harness) |
| `docs/papers/results/judge-<name>.json` | Per-query Claude scores (0–5) per baseline |
| `docs/papers/latex/tables/competitive-combined.tex` | **Paper Table 8** — all systems + Wilcoxon markers + Judge |

### Expected cost and wall time

Full paper-grade pass (3 seeds × 1,986 queries, Sonnet judge): ~10 minutes and
**$0.30–$0.50** in API charges. For final paper numbers swap in
`--judge-model claude-opus-4-6` (~$2–3 per pass — see
[`judge-validation-notes.md`](results/judge-validation-notes.md) for the
rationale and validation protocol).

### CI safety (what runs offline with no keys)

| Layer | Behavior when dependencies are missing |
|---|---|
| TS `competitive-locomo-real` Jest suite | Skips cleanly (file-existence check + `hasRealProvider()` pre-flight) |
| Python `run_baselines.py --dataset real` | Each baseline individually reports `ImportError` in its JSON slot; exit code 0 |
| `generate-tables.ts` | Logs "skipping competitive-combined (no JSON)" and continues |
| `test_llm_judge.py` / `test_adapters.py` | Use in-process fake SDKs; 24 tests pass with no API key |
