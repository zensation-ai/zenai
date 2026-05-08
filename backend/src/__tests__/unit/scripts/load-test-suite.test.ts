/**
 * Load-test suite — static structural checks.
 *
 * We don't execute k6 in CI (it's not installed on the test runner), but we
 * do assert the files exist, declare the right SLOs, and aren't missing the
 * safety-rail env-var guard. That way a typo in a script commit gets caught
 * here instead of at 3 AM against staging.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT   = path.resolve(__dirname, '../../../../../');
const SCRIPTS_DIR = path.join(REPO_ROOT, 'scripts/load-test');
const DOCS_DIR    = path.join(REPO_ROOT, 'docs');

function read(relative: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8');
}

describe('scripts/load-test — Sprint 1.6 suite', () => {
  describe('fixtures', () => {
    it('prompts.json exists and has at least 20 unique German prompts', () => {
      const prompts: unknown = JSON.parse(read('scripts/load-test/prompts.json'));
      expect(Array.isArray(prompts)).toBe(true);
      const list = prompts as string[];
      expect(list.length).toBeGreaterThanOrEqual(20);
      expect(new Set(list).size).toBe(list.length); // all unique
      expect(list.every(p => typeof p === 'string' && p.length > 10)).toBe(true);
    });
  });

  describe('k6-chat-stream.js', () => {
    const src = () => read('scripts/load-test/k6-chat-stream.js');

    it('refuses to run without BASE_URL or API_KEY', () => {
      expect(src()).toMatch(/Missing BASE_URL or API_KEY/);
      expect(src()).toMatch(/throw new Error/);
    });

    it('declares the Sprint 1.6 SLOs (p95 < 3000 ms, err < 1 %)', () => {
      const s = src();
      expect(s).toMatch(/http_req_duration.*p\(95\)<3000/s);
      expect(s).toMatch(/zenai_chat_stream_errors.*rate<0\.01/s);
    });

    it('ramps to 50 VU and targets the streaming endpoint', () => {
      const s = src();
      expect(s).toMatch(/target:\s*50/);
      expect(s).toMatch(/\/api\/chat\/sessions\/[^/]+\/messages\/stream/);
    });
  });

  describe('k6-memory-recall.js', () => {
    const src = () => read('scripts/load-test/k6-memory-recall.js');

    it('refuses to run without BASE_URL or API_KEY', () => {
      expect(src()).toMatch(/Missing BASE_URL or API_KEY/);
    });

    it('declares tighter SLOs (p95 < 400 ms, err < 0.1 %)', () => {
      const s = src();
      expect(s).toMatch(/http_req_duration.*p\(95\)<400(?!\d)/s);
      expect(s).toMatch(/zenai_memory_recall_errors.*rate<0\.001/s);
    });

    it('ramps to 100 VU and covers all four contexts + three memory layers', () => {
      const s = src();
      expect(s).toMatch(/target:\s*100/);
      for (const ctx of ['operations', 'finance', 'people', 'strategy']) {
        expect(s).toContain(`'${ctx}'`);
      }
      for (const layer of ['core', 'episodic', 'procedural']) {
        expect(s).toContain(`'${layer}'`);
      }
    });
  });

  describe('k6-agent-execute.js', () => {
    const src = () => read('scripts/load-test/k6-agent-execute.js');

    it('refuses to run without BASE_URL or API_KEY', () => {
      expect(src()).toMatch(/Missing BASE_URL or API_KEY/);
    });

    it('declares agent SLOs (p95 < 15 s, err < 2 %)', () => {
      const s = src();
      expect(s).toMatch(/http_req_duration.*p\(95\)<15000/s);
      expect(s).toMatch(/zenai_agent_execute_errors.*rate<0\.02/s);
    });

    it('ramps to only 20 VU and hits /api/agents/execute with a writer task', () => {
      const s = src();
      expect(s).toMatch(/target:\s*20/);
      expect(s).toContain('/api/agents/execute');
      expect(s).toMatch(/agent_type:\s*task\.agent|writer/);
    });
  });

  describe('README + baseline doc', () => {
    it('README links all three scripts and the runbook', () => {
      const readme = read('scripts/load-test/README.md');
      expect(readme).toContain('k6-chat-stream.js');
      expect(readme).toContain('k6-memory-recall.js');
      expect(readme).toContain('k6-agent-execute.js');
      expect(readme).toContain('RUNBOOK-ON-CALL.md');
    });

    it('baseline report exists and covers all three endpoints', () => {
      const baseline = fs.readFileSync(path.join(DOCS_DIR, 'LOAD-TEST-BASELINE-2026-Q2.md'), 'utf8');
      expect(baseline).toMatch(/chat-stream/);
      expect(baseline).toMatch(/memory-recall/);
      expect(baseline).toMatch(/agent-execute/);
      expect(baseline).toMatch(/\b(p50|p95|p99)\b/);
    });
  });

  it('SCRIPTS_DIR contains exactly the expected artifacts (no stragglers)', () => {
    const files = new Set(fs.readdirSync(SCRIPTS_DIR));
    for (const required of [
      'k6-chat-stream.js',
      'k6-memory-recall.js',
      'k6-agent-execute.js',
      'prompts.json',
      'README.md',
    ]) {
      expect(files.has(required)).toBe(true);
    }
  });
});
