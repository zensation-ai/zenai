/**
 * k6 load test — agent execute endpoint.
 *
 * Target: POST /api/agents/execute (Writer-Agent task).
 * Shape: 20 VU (agents are expensive), 2-min ramp-up, 10-min steady-state.
 * SLO: p95 < 15 s, error_rate < 2 %.
 *
 * Run:
 *   k6 run --env BASE_URL=https://staging.example.com --env API_KEY=... k6-agent-execute.js
 *
 * Agent execution is the most expensive path we operate — every run burns
 * several Claude turns plus tool-use. We keep VU count low so this test
 * does not single-handedly drain the LLM budget. Treat the p95 SLO as a
 * ceiling, not a target: regressions here usually show up in cost before
 * they show up in latency.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL;
const API_KEY  = __ENV.API_KEY;

if (!BASE_URL || !API_KEY) {
  throw new Error('Missing BASE_URL or API_KEY — refusing to run. See scripts/load-test/README.md.');
}

const TASKS = [
  {
    goal: 'Schreibe einen kurzen Release-Note-Entwurf für ein neues Onboarding-Feature.',
    agent: 'writer',
    context: 'operations',
  },
  {
    goal: 'Fasse drei Strategy-Notizen zu einem Executive Summary zusammen.',
    agent: 'writer',
    context: 'strategy',
  },
  {
    goal: 'Erstelle einen Wochenbericht aus den letzten Finance-Memos.',
    agent: 'writer',
    context: 'finance',
  },
  {
    goal: 'Formuliere einen Follow-up-Entwurf an einen wichtigen Kontakt.',
    agent: 'writer',
    context: 'people',
  },
];

const agentErrors   = new Rate('zenai_agent_execute_errors');
const agentLatency  = new Trend('zenai_agent_execute_latency_ms');
const agentAttempts = new Counter('zenai_agent_execute_attempts');

export const options = {
  scenarios: {
    agent_execute: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m',  target: 20 },
        { duration: '10m', target: 20 },
        { duration: '1m',  target: 0  },
      ],
      gracefulRampDown: '1m',
    },
  },
  thresholds: {
    http_req_duration:           ['p(95)<15000'],
    zenai_agent_execute_errors:  ['rate<0.02'],
    zenai_agent_execute_latency_ms: ['p(95)<15000', 'p(99)<25000'],
  },
};

export default function () {
  const task = TASKS[Math.floor(Math.random() * TASKS.length)];
  const url  = `${BASE_URL}/api/agents/execute`;

  agentAttempts.add(1);

  const res = http.post(
    url,
    JSON.stringify({
      goal: task.goal,
      agent_type: task.agent,
      context: task.context,
      mode: 'single',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      timeout: '30s',
      tags: { agent: task.agent, context: task.context },
    },
  );

  const ok = check(res, {
    'status is 2xx': r => r.status >= 200 && r.status < 300,
    'body has execution id': r => {
      try {
        const body = JSON.parse(r.body);
        return typeof body.data?.execution_id === 'string' || typeof body.execution_id === 'string';
      } catch {
        return false;
      }
    },
  });

  if (!ok) agentErrors.add(1);
  else     agentErrors.add(0);

  agentLatency.add(res.timings.duration);

  // Long think-time: agents are expensive, avoid hammering.
  sleep(Math.random() * 5 + 5);
}
