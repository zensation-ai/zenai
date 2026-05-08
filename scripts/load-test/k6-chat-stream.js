/**
 * k6 load test — chat streaming endpoint.
 *
 * Target: /api/chat/sessions/:id/messages/stream (SSE).
 * Shape: 50 VU, 5-min ramp-up, 10-min steady-state.
 * SLO: p95 < 3000 ms, error_rate < 1 %.
 *
 * Run:
 *   k6 run --env BASE_URL=https://staging.example.com --env API_KEY=... k6-chat-stream.js
 *
 * NEVER against production without explicit approval — LOAD_TEST_MODE
 * on the server flips trace sampling to 100 %, which will blow up the
 * observability bill if it is pointed at production traffic.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL;
const API_KEY = __ENV.API_KEY;
const SESSION_ID = __ENV.SESSION_ID || 'load-test-session';

if (!BASE_URL || !API_KEY) {
  throw new Error('Missing BASE_URL or API_KEY — refusing to run. See scripts/load-test/README.md.');
}

const prompts = new SharedArray('prompts', () => JSON.parse(open('./prompts.json')));

const streamErrors = new Rate('zenai_chat_stream_errors');
const firstByteMs = new Trend('zenai_chat_stream_first_byte_ms');

export const options = {
  scenarios: {
    chat_stream: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m',  target: 50 }, // ramp-up
        { duration: '10m', target: 50 }, // steady-state
        { duration: '1m',  target: 0  }, // ramp-down
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_duration:           ['p(95)<3000'],
    zenai_chat_stream_errors:    ['rate<0.01'],
    zenai_chat_stream_first_byte_ms: ['p(95)<1500'],
  },
};

export default function () {
  const prompt = prompts[Math.floor(Math.random() * prompts.length)];
  const url = `${BASE_URL}/api/chat/sessions/${SESSION_ID}/messages/stream`;

  const start = Date.now();
  const res = http.post(
    url,
    JSON.stringify({ message: prompt, context: 'operations' }),
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-API-Key': API_KEY,
      },
      timeout: '30s',
    },
  );

  const ok = check(res, {
    'status is 200': r => r.status === 200,
    'sse body received': r => typeof r.body === 'string' && r.body.length > 0,
  });

  if (!ok) streamErrors.add(1);
  else     streamErrors.add(0);

  firstByteMs.add(Date.now() - start);

  sleep(Math.random() * 2 + 1);
}
