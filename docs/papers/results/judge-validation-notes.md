# LLM-as-Judge Validation Notes

> Scope: how we validate that `experiments/baselines/llm_judge.py` produces
> reliable retrieval-quality scores on real LoCoMo retrievals, and which
> Claude model to pick for each use case.

## What the judge does

`judge_run(facts, queries, retrievals, cfg)` asks Claude to grade each
query's top-k retrieved facts on an integer 0–5 Likert scale with a short
rationale. It is intentionally **complementary** to P@5 / NDCG@5 — those
metrics only reward exact `relevantIds` overlap, while the judge also
credits semantically correct retrievals that happen to miss the
keyword-derived gold ids. For the NeurIPS paper we report **both**.

Rubric (see `JUDGE_SYSTEM_PROMPT` in `llm_judge.py`):

| Score | Meaning |
|-------|---------|
| 0 | Retrieved facts are completely unrelated to the query |
| 1 | At most one fact loosely topical; nothing actually answers the query |
| 2 | Facts touch the topic but don't contain the answer |
| 3 | Partial answer present, key information missing |
| 4 | Answer essentially present, with minor gaps or noise |
| 5 | Answer clearly and completely supported by retrieved facts |

Temperature is fixed to `0.0` for reproducibility; `max_tokens=200` is
enough for the score + a one-sentence rationale.

## Model recommendations

| Model | Use case | ~Cost / LoCoMo-10 full pass (1,986 queries) |
|-------|----------|---------------------------------------------|
| `claude-sonnet-4-6` (default) | Dev iteration, acceptance checks, reproducibility sweeps | **$0.30–0.50** |
| `claude-opus-4-6` | Final paper numbers, inter-model agreement check | $2–3 |
| `claude-haiku-4-5-20251001` | Fastest/cheapest sanity check before a Sonnet run | $0.05–0.10 |

Rationale for defaults:

- **Sonnet-4-6 as default**: Matches published inter-rater agreement against
  human annotators within one Likert point on summarization-style judge
  tasks, at ~1/6th the cost of Opus. Good enough for the per-baseline
  comparisons that drive the paper's headline claims.
- **Opus-4-6 for final table**: Re-run after the ablations converge. If
  Opus and Sonnet rankings agree, we report Sonnet numbers (cheaper,
  reproducible). If they disagree materially, investigate before publishing.
- **Haiku-4-5 as cheap gate**: Use for the first run after changing a
  prompt or adapter to catch obvious regressions before paying for Sonnet.

Change the default via env var:
```bash
export ZENAI_JUDGE_MODEL=claude-opus-4-6
```
or pass `--judge-model` to `run_baselines.py`.

## Validation protocol

1. **Scale check** — On LoCoMo-real with seeds `42,123,456`, scores should
   cluster in a sensible range per system. Adversarial (unanswerable) queries
   should average `≤ 2.0` across systems; single-hop queries should average
   `≥ 3.0` for systems that retrieve anything. If every system gets ~0 or
   every system gets ~5, the judge is not discriminating.

2. **Ordering consistency** — Judge ranking of (Mem0, Letta, A-Mem, ZenBrain)
   should agree with the P@5 ranking **on non-adversarial queries**, up to
   one position. Large disagreements are a signal to inspect the rationales
   (they are saved to `docs/papers/results/judge-<name>.json`).

3. **Oracle upper bound** — `_extract_retrievals_from_baseline` falls back
   to scoring the gold ids themselves when raw retrievals aren't stored.
   This "oracle" score sets an upper bound: if the best baseline scores
   within 0.5 Likert points of the oracle, retrieval is near-saturation for
   the rubric and further numerical gains are not meaningful.

4. **Rationale spot-check** — Read 10 random rationales per baseline. They
   should reference concrete facts (names, dates, places) rather than vague
   meta-commentary ("the facts are related to the query"). Vague rationales
   indicate a degenerate run.

5. **Per-category breakdown** — Break scores out by LoCoMo category
   (`single-hop`, `multi-hop`, `temporal`, `open-domain`, `adversarial`).
   Temporal queries are the hardest — expect 0.5–1.0 Likert-point drop vs
   single-hop across all systems. Adversarial queries should reward
   **empty retrievals** (score 5 when the system correctly retrieved
   nothing); current rubric scores them 0 for empty, which is a known
   bias we call out in the paper.

## Reproducing the validation pass

The judge is invoked end-to-end via `run_baselines.py --judge`:

```bash
# Small validation pass (seed=42, sonnet-4-6, 40 queries → ~2 minutes, < $0.02)
cd experiments/baselines
python run_baselines.py \
    --dataset real \
    --seeds 42 \
    --baselines mem0,letta,a-mem \
    --judge --judge-model claude-sonnet-4-6 --judge-delay 1.0

# Full paper-grade pass (3 seeds, 1,986 queries, ~$3 with opus)
python run_baselines.py \
    --dataset real \
    --seeds 42,123,456 \
    --judge --judge-model claude-opus-4-6 --judge-delay 1.0
```

Judge results land in:
- `docs/papers/results/judge-mem0.json`
- `docs/papers/results/judge-letta.json`
- `docs/papers/results/judge-a-mem.json`

The merged `docs/papers/results/competitive-baselines.json` picks up each
baseline's `aggregate.{mean,ci_low,ci_high,normalized_mean}` into a
compact `judge` block that the LaTeX table generator consumes.

## Offline validation

Live API calls are **not** part of CI. `test_llm_judge.py` covers prompt
construction, reply parsing, aggregation, and error handling with a fake
`Anthropic` client (9 tests). Adapter wiring around the judge is covered
by `test_adapters.py` (15 tests, fully monkey-patched SDKs). Both suites
pass offline with no API key.

## Known limitations

- **Position bias**: Within a single top-k list the judge may over-weight
  the first-ranked fact. We mitigate by scoring the full top-5 (not top-1)
  and reporting mean-per-query, not mean-per-fact.
- **Self-consistency**: Not a guarantee — two passes with temperature=0
  are usually within ±0.1 Likert points on the aggregate, but individual
  queries can shift by 1 point. Use the 95% bootstrap CI in the aggregate
  block to gauge stability.
- **Cost scaling**: A full 3-seed × 3-baseline × 1,986-query Opus pass
  costs ~$9. For paper revisions keep Sonnet in the loop and only rerun
  Opus when the table actually ships.
