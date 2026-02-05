/**
 * Performance Benchmarking Script
 * Tests all major operations and measures their performance
 *
 * Run with: npm run benchmark
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.API_URL || 'http://localhost:3000';

interface BenchmarkResult {
  operation: string;
  avgMs: number;
  minMs: number;
  maxMs: number;
  runs: number;
  target: string;
  status: 'pass' | 'fail' | 'warning';
}

const results: BenchmarkResult[] = [];

async function measureOperation(
  name: string,
  operation: () => Promise<unknown>,
  runs: number = 3,
  targetMs: number
): Promise<BenchmarkResult> {
  const times: number[] = [];

  console.log(`\n⏱️  Benchmarking: ${name}`);

  for (let i = 0; i < runs; i++) {
    const start = Date.now();
    try {
      await operation();
      const elapsed = Date.now() - start;
      times.push(elapsed);
      process.stdout.write(`  Run ${i + 1}: ${elapsed}ms\n`);
    } catch (error: unknown) {
      console.log(`  Run ${i + 1}: ERROR - ${error instanceof Error ? error.message : String(error)}`);
      times.push(-1);
    }
  }

  const validTimes = times.filter(t => t > 0);
  const avg = validTimes.length > 0
    ? Math.round(validTimes.reduce((a, b) => a + b, 0) / validTimes.length)
    : -1;
  const min = validTimes.length > 0 ? Math.min(...validTimes) : -1;
  const max = validTimes.length > 0 ? Math.max(...validTimes) : -1;

  let status: 'pass' | 'fail' | 'warning' = 'pass';
  if (avg === -1) {
    status = 'fail';
  } else if (avg > targetMs * 2) {
    status = 'fail';
  } else if (avg > targetMs) {
    status = 'warning';
  }

  const result: BenchmarkResult = {
    operation: name,
    avgMs: avg,
    minMs: min,
    maxMs: max,
    runs: validTimes.length,
    target: `< ${targetMs}ms`,
    status
  };

  results.push(result);
  return result;
}

async function runBenchmarks() {
  console.log('🚀 Personal AI System - Performance Benchmark');
  console.log('='.repeat(50));
  console.log(`API URL: ${API_URL}`);
  console.log(`Time: ${new Date().toISOString()}`);

  // 1. Health Check
  await measureOperation(
    'Health Check',
    async () => {
      const res = await axios.get(`${API_URL}/api/health`);
      if (res.data.status !== 'healthy' && res.data.status !== 'degraded') {
        throw new Error('Unhealthy');
      }
    },
    3,
    100 // Target: 100ms
  );

  // 2. Text Structuring (LLM)
  await measureOperation(
    'Text Structuring (Mistral)',
    async () => {
      await axios.post(`${API_URL}/api/voice-memo/text`, {
        text: 'Ich habe eine Idee für ein neues Feature: Ein Dashboard das alle meine Ideen visualisiert.'
      });
    },
    3,
    5000 // Target: 5s (first run is slower due to model loading)
  );

  // 3. Semantic Search
  await measureOperation(
    'Semantic Search (2-Stage)',
    async () => {
      const res = await axios.post(`${API_URL}/api/ideas/search`, {
        query: 'KI Projekt Ideen',
        limit: 10
      });
      return res.data;
    },
    5,
    2000 // Target: 2s (includes embedding generation)
  );

  // 4. List Ideas
  await measureOperation(
    'List Ideas',
    async () => {
      await axios.get(`${API_URL}/api/ideas`);
    },
    5,
    100 // Target: 100ms
  );

  // 5. Knowledge Graph Stats
  await measureOperation(
    'Knowledge Graph Stats',
    async () => {
      await axios.get(`${API_URL}/api/knowledge-graph/stats`);
    },
    5,
    100 // Target: 100ms
  );

  // 6. Get Suggestions
  await measureOperation(
    'Get Suggested Connections',
    async () => {
      const ideas = await axios.get(`${API_URL}/api/ideas`);
      if (ideas.data.ideas && ideas.data.ideas.length > 0) {
        await axios.get(`${API_URL}/api/knowledge-graph/suggestions/${ideas.data.ideas[0].id}`);
      }
    },
    3,
    500 // Target: 500ms
  );

  // Print Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 BENCHMARK RESULTS');
  console.log('='.repeat(50));

  const statusEmoji = {
    pass: '✅',
    warning: '⚠️',
    fail: '❌'
  };

  console.log('\n| Operation | Avg | Min | Max | Target | Status |');
  console.log('|-----------|-----|-----|-----|--------|--------|');

  for (const r of results) {
    const avgStr = r.avgMs === -1 ? 'ERROR' : `${r.avgMs}ms`;
    const minStr = r.minMs === -1 ? '-' : `${r.minMs}ms`;
    const maxStr = r.maxMs === -1 ? '-' : `${r.maxMs}ms`;
    console.log(`| ${r.operation.padEnd(25)} | ${avgStr.padEnd(8)} | ${minStr.padEnd(6)} | ${maxStr.padEnd(6)} | ${r.target.padEnd(8)} | ${statusEmoji[r.status]} |`);
  }

  // Overall Status
  const passed = results.filter(r => r.status === 'pass').length;
  const warnings = results.filter(r => r.status === 'warning').length;
  const failed = results.filter(r => r.status === 'fail').length;

  console.log('\n' + '='.repeat(50));
  console.log(`SUMMARY: ${passed} passed, ${warnings} warnings, ${failed} failed`);

  // Compare with targets from Optimierungen_Global.md
  console.log('\n📈 vs. Optimization Targets:');
  console.log('----------------------------');

  const structureResult = results.find(r => r.operation.includes('Structuring'));
  const searchResult = results.find(r => r.operation.includes('Search'));

  if (structureResult && structureResult.avgMs > 0) {
    const target = 2000; // 2s target
    const ratio = (structureResult.avgMs / target * 100).toFixed(0);
    console.log(`LLM Structuring: ${structureResult.avgMs}ms (Target: ${target}ms) - ${ratio}% of target`);
  }

  if (searchResult && searchResult.avgMs > 0) {
    const _target = 75; // 75ms target for pure search
    console.log(`Semantic Search: ${searchResult.avgMs}ms (Target includes embedding: ~1-2s)`);
  }

  console.log('\n✅ Benchmark complete!');
}

// Run benchmarks
runBenchmarks().catch(console.error);
