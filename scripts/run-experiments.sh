#!/usr/bin/env bash
# ============================================================================
# ZenAI Experiment Runner — Reproducible Benchmark Suite
#
# Runs all PMA experiment suites and captures results as JSON/CSV
# for paper tables (Zenodo v5).
#
# Usage:
#   ./scripts/run-experiments.sh          # Run all experiments
#   ./scripts/run-experiments.sh --quick  # Quick validation (1 seed)
#
# Output:
#   docs/papers/results/pma-benchmark.json
#   docs/papers/results/ablation-study.json
#   docs/papers/results/competitive-comparison.json
#   docs/papers/results/summary.csv
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RESULTS_DIR="$ROOT_DIR/docs/papers/results"
BACKEND_DIR="$ROOT_DIR/backend"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Parse args
QUICK=false
if [[ "${1:-}" == "--quick" ]]; then
  QUICK=true
  echo -e "${YELLOW}Running in quick validation mode (reduced seeds)${NC}"
fi

# Ensure results directory
mkdir -p "$RESULTS_DIR"

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE} ZenAI Experiment Suite — Reproducibility   ${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo "Root:    $ROOT_DIR"
echo "Results: $RESULTS_DIR"
echo "Date:    $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo ""

# Check dependencies
if ! command -v node &> /dev/null; then
  echo -e "${RED}Error: Node.js not found. Install Node.js 20+.${NC}"
  exit 1
fi

echo -e "${GREEN}Node.js: $(node --version)${NC}"
echo ""

# Install dependencies if needed
if [ ! -d "$BACKEND_DIR/node_modules" ]; then
  echo -e "${YELLOW}Installing backend dependencies...${NC}"
  cd "$BACKEND_DIR" && npm install
fi

# ─── Helper: Run experiment and extract JSON ───────────────────────────

run_experiment() {
  local name="$1"
  local pattern="$2"
  local marker_start="$3"
  local marker_end="$4"
  local output_file="$5"

  echo -e "${BLUE}━━━ Running: $name ━━━${NC}"
  local start_time
  start_time=$(date +%s)

  local raw_output
  raw_output=$(cd "$BACKEND_DIR" && npx jest \
    --testPathPattern="$pattern" \
    --verbose \
    --forceExit \
    --no-coverage \
    2>&1) || true

  local end_time
  end_time=$(date +%s)
  local duration=$((end_time - start_time))

  # Extract JSON between markers
  local json
  json=$(echo "$raw_output" | sed -n "/$marker_start/,/$marker_end/p" | grep -v "$marker_start" | grep -v "$marker_end") || true

  if [ -n "$json" ]; then
    echo "$json" > "$output_file"
    echo -e "${GREEN}  ✓ Results saved to $output_file (${duration}s)${NC}"
  else
    echo -e "${YELLOW}  ⚠ No JSON output captured. Saving raw output for inspection.${NC}"
    echo "$raw_output" > "${output_file%.json}.raw.txt"
  fi

  # Check for test failures
  if echo "$raw_output" | grep -q "Tests:.*failed"; then
    echo -e "${RED}  ✗ Some tests failed. Check raw output.${NC}"
    echo "$raw_output" | grep -E "^(FAIL|Tests:)" || true
  else
    echo -e "${GREEN}  ✓ All tests passed (${duration}s)${NC}"
  fi

  echo ""
}

# ─── Run Experiments ───────────────────────────────────────────────────

echo -e "${BLUE}Running 3 experiment suites...${NC}"
echo ""

# 1. PMA Benchmark Suite
run_experiment \
  "PMA Benchmark Suite (6 algorithms)" \
  "experiments/pma-benchmark" \
  "--- PMA_BENCHMARK_RESULTS_JSON ---" \
  "--- END_PMA_BENCHMARK_RESULTS ---" \
  "$RESULTS_DIR/pma-benchmark.json"

# 2. Ablation Study
run_experiment \
  "Ablation Study (15 algorithms)" \
  "experiments/ablation-study" \
  "--- ABLATION_STUDY_RESULTS_JSON ---" \
  "--- END_ABLATION_STUDY_RESULTS ---" \
  "$RESULTS_DIR/ablation-study.json"

# 3. Competitive Comparison
run_experiment \
  "Competitive Comparison (3 systems)" \
  "experiments/competitive-comparison" \
  "--- COMPETITIVE_COMPARISON_RESULTS_JSON ---" \
  "--- END_COMPETITIVE_COMPARISON_RESULTS ---" \
  "$RESULTS_DIR/competitive-comparison.json"

# ─── Generate Summary CSV ─────────────────────────────────────────────

echo -e "${BLUE}━━━ Generating summary CSV ━━━${NC}"

cat > "$RESULTS_DIR/summary.csv" << 'CSVHEADER'
experiment,algorithm,metric,mean,std,ci95_low,ci95_high,notes
CSVHEADER

# Parse PMA benchmark results
if [ -f "$RESULTS_DIR/pma-benchmark.json" ]; then
  node -e "
    const data = JSON.parse(require('fs').readFileSync('$RESULTS_DIR/pma-benchmark.json', 'utf8'));
    for (const r of data) {
      const ci = r.ci95 || [0, 0];
      console.log([
        'pma-benchmark', r.algorithm, r.metric,
        r.mean.toFixed(6), r.std.toFixed(6),
        ci[0].toFixed(6), ci[1].toFixed(6),
        ''
      ].join(','));
    }
  " >> "$RESULTS_DIR/summary.csv" 2>/dev/null || echo "  (PMA benchmark parsing skipped)"
fi

# Parse ablation study results
if [ -f "$RESULTS_DIR/ablation-study.json" ]; then
  node -e "
    const data = JSON.parse(require('fs').readFileSync('$RESULTS_DIR/ablation-study.json', 'utf8'));
    for (const r of data) {
      console.log([
        'ablation', r.config, 'quality',
        r.qualityProxy.mean.toFixed(6), r.qualityProxy.std.toFixed(6),
        r.qualityProxy.ci95[0].toFixed(6), r.qualityProxy.ci95[1].toFixed(6),
        'deltaQ=' + (r.deltaQuality * 100).toFixed(2) + '%'
      ].join(','));
    }
  " >> "$RESULTS_DIR/summary.csv" 2>/dev/null || echo "  (Ablation parsing skipped)"
fi

# Parse competitive comparison results
if [ -f "$RESULTS_DIR/competitive-comparison.json" ]; then
  node -e "
    const data = JSON.parse(require('fs').readFileSync('$RESULTS_DIR/competitive-comparison.json', 'utf8'));
    for (const r of data) {
      console.log([
        'competitive', r.system, 'precision5',
        r.precision5.mean.toFixed(6), r.precision5.std.toFixed(6),
        r.precision5.ci95[0].toFixed(6), r.precision5.ci95[1].toFixed(6),
        ''
      ].join(','));
      console.log([
        'competitive', r.system, 'mrr',
        r.mrr.mean.toFixed(6), r.mrr.std.toFixed(6),
        r.mrr.ci95[0].toFixed(6), r.mrr.ci95[1].toFixed(6),
        ''
      ].join(','));
    }
  " >> "$RESULTS_DIR/summary.csv" 2>/dev/null || echo "  (Competitive parsing skipped)"
fi

echo -e "${GREEN}  ✓ Summary CSV: $RESULTS_DIR/summary.csv${NC}"
echo ""

# ─── Final Report ─────────────────────────────────────────────────────

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE} Experiment Suite Complete                   ${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo "Results directory: $RESULTS_DIR"
echo ""
ls -la "$RESULTS_DIR/" 2>/dev/null || true
echo ""
echo -e "${GREEN}All results are deterministic (seeded PRNG, seeds: 42..6144).${NC}"
echo -e "${GREEN}Compare your results against published values in the paper.${NC}"
echo ""
echo "To populate paper tables, copy JSON values from:"
echo "  - $RESULTS_DIR/pma-benchmark.json     → Table 6 (PMA Retention)"
echo "  - $RESULTS_DIR/ablation-study.json     → Table 7 (Full Ablation)"
echo "  - $RESULTS_DIR/competitive-comparison.json → Table 8 (Competitive)"
