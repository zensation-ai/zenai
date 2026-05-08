/**
 * k6 load test — memory recall endpoint.
 *
 * Target: POST /api/:context/memory/recall (mixed core + episodic + procedural).
 * Shape: 100 VU, 2-min ramp-up, 10-min steady-state.
 * SLO: p95 < 400 ms, error_rate < 0.1 %.
 *
 * Run:
 *   k6 run --env BASE_URL=https://staging.example.com --env API_KEY=... k6-memory-recall.js
 *
 * Memory recall is the hottest path in the product — every chat turn hits it.
 * A regression here is immediately user-visible; that's why the SLO is much
 * tighter than chat-stream.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL;
const API_KEY = __ENV.API_KEY;

if (!BASE_URL || !API_KEY) {
  throw new Error('Missing BASE_URL or API_KEY — refusing to run. See scripts/load-test/README.md.');
}

const CONTEXTS = ['operations', 'finance', 'people', 'strategy'];
const LAYERS = ['core', 'episodic', 'procedural', 'all'];
const QUERIES = [
  'letzte Meetings mit dem CTO',
  'offene Follow-ups aus dieser Woche',
  'Notizen zum SaaS-Launch',
  'Kontakte aus dem Finance-Team',
  'Strategy-Entscheidungen aus Q1',
  'Ideen mit Priorität hoch',
  'Cashflow-Notizen März',
  'gelernte Prozeduren für Onboarding',
  'pinned Core-Facts zum Launch',
  'Erinnerungen an Stand-up-Outcomes',
];

const recallErrors  = new Rate('zenai_memory_recall_errors');
const recallLatency = new Trend('zenai_memory_recall_latency_ms');

export const options = {
  scenarios: {
    memory_recall: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m',  target: 100 },
        { duration: '10m', target: 100 },
        { duration: '1m',  target: 0   },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_duration:            ['p(95)<400'],
    zenai_memory_recall_errors:   ['rate<0.001'],
    zenai_memory_recall_latency_ms: ['p(95)<400', 'p(99)<800'],
  },
};

export default function () {
  const context = CONTEXTS[Math.floor(Math.random() * CONTEXTS.length)];
  const layer   = LAYERS[Math.floor(Math.random() * LAYERS.length)];
  const query   = QUERIES[Math.floor(Math.random() * QUERIES.length)];

  const url = `${BASE_URL}/api/${context}/memory/recall`;
  const res = http.post(
    url,
    JSON.stringify({ query, layer, limit: 10 }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      timeout: '5s',
      tags: { layer, context },
    },
  );

  const ok = check(res, {
    'status is 200': r => r.status === 200,
    'body has results': r => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.data?.results) || Array.isArray(body.results) || body.success === true;
      } catch {
        return false;
      }
    },
  });

  if (!ok) recallErrors.add(1);
  else     recallErrors.add(0);

  recallLatency.add(res.timings.duration);

  // Realistic think-time between recalls: 200–600 ms (mimics chat-turn cadence).
  sleep(Math.random() * 0.4 + 0.2);
}
