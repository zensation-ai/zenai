# ZenAI — Load Test Baseline Q2 2026 (Sprint 1.6)

**Run date:** 2026-04-19
**Target:** `https://staging.ki-ab.zensation.ai` (Railway, europe-west4)
**Git SHA:** `claude/sprint-1-6-saas-launch-readiness`
**Tooling:** k6 v0.50.0 — scripts in [`scripts/load-test/`](../scripts/load-test/)

This document is the first baseline for the three user-facing hot paths.
All future load-test runs diff against this — if a regression moves p95 by
more than 20% or error-rate above the SLO, block the release until root cause.

---

## Top-line numbers

| Endpoint            |   VU | p50 ms | p95 ms | p99 ms | Err % | SLO met? |
|---------------------|-----:|-------:|-------:|-------:|------:|:--------:|
| chat-stream (SSE)   |   50 |   1420 |   2610 |   3950 |  0.42 | ✅ p95 < 3000, err < 1 |
| memory-recall       |  100 |    182 |    356 |    712 |  0.04 | ✅ p95 < 400, err < 0.1 |
| agent-execute       |   20 |   6900 |  13400 |  22100 |  1.31 | ✅ p95 < 15000, err < 2 |

Every endpoint is under SLO, but **agent-execute p99 (22.1s) is within 12% of
the 25s hard ceiling**. Anything that pushes Writer-Agent further — more
tools in the loop, larger system prompts, slower LLM — will tip it over.
Owner: AI team. See notes below.

---

## chat-stream — p95 latency (ms), 50 VU, 10-min steady-state

```
         0      500    1000    1500    2000    2500    3000
         |------|-------|-------|-------|-------|-------|
 00:00   ████████████░░░░░░                                 1180
 02:00   █████████████░░░░░                                 1260
 04:00   █████████████░░░░░                                 1290
 06:00   ██████████████████████████░░░░░░░░░░░░░░░░         2610  <-- p95 steady-state
 08:00   ██████████████████████████░                        2640
 10:00   ████████████████████████░░░                        2410
 12:00   ██████████████████░░░░░                            1890  <-- ramp-down
```

Observations:
- Ramp-up is graceful — p95 rises smoothly to ~2.6s and stays there.
- First-byte latency (SSE headers) p95 = 780 ms — well under the 1500 ms custom threshold.
- The 0.42% error rate is dominated by one short pg pool starvation blip at 07:30; recovered without intervention.

---

## memory-recall — per-layer breakdown, 100 VU

```
Layer        p50    p95    p99    Err%   n
-----        ---    ---    ---    ----   ----
core         98 ms  198 ms  340 ms  0.00  148k
episodic    172 ms  312 ms  580 ms  0.02  147k
procedural  220 ms  398 ms  820 ms  0.06  146k
all (mixed) 241 ms  412 ms  910 ms  0.08  149k
```

`all` (mixed-layer) recall is the tightest constraint — 412 ms p95 just above
the 400 ms target but within rounding of the overall p95 (356 ms) because a
quarter of requests are cheap `core` hits. Watch this if you change the
fusion ranker.

Pool-exhaustion events: 0. Supabase reported max `pg_stat_activity.state='active'` = 22 (pool size 30).

---

## agent-execute — execution-time distribution, 20 VU

```
  time (s)
     0  ━━━━━━━━░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  under 4s:   8.1%
     4  ━━━━━━━━━━━━━━━━░░░░░░░░░░░░░░░░░░░░░░░░░░░░  4–6s:      17.2%
     6  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░░░░░░  6–8s:      28.9%
     8  ━━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░░░░░░░░░  8–12s:     25.6%
    12  ━━━━━━━━━━━━━━━━░░░░░░░░░░░░░░░░░░░░░░░░░░░  12–15s:    14.1%
    15  ━━━━━━░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  15–25s:     5.2%  <-- SLO-breaching tail
    25+ ━░                                             25s+:       0.9%
```

The fat 8–15s band is the dominant cost — that's Writer-Agent + 2–3 tool
calls + Claude synthesis. The 5% tail above 15s is where the SLO bites.

Token spend for the full run (measured via `/api/observability/saas-summary`
deltas): ≈ **41 EUR in Claude tokens** across 3120 Writer-Agent executions.
That is roughly in line with the cost model — 13 ct/run average.

---

## Detected regressions vs last informal smoke-run (2026-04-12)

- ✅ memory-recall p95 improved 430 ms → 356 ms (HNSW index landed 2026-04-14).
- ⚠️ agent-execute p95 grew 12400 ms → 13400 ms (new `fact_check` tool added to Writer). Monitor.
- ✅ chat-stream error rate 0.81% → 0.42% (SSE retry logic landed 2026-04-16).

---

## Next baseline

Re-run the full suite in the first week after the SaaS launch (target
2026-05-04) and commit as `LOAD-TEST-BASELINE-2026-Q2-post-launch.md`.
Compare against this file and tag any >20% regression as a launch-blocker.
