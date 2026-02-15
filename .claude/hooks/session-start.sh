#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

# Backend: xlsx CDN may be unavailable, install remaining deps regardless
echo "Installing backend dependencies..."
cd "$PROJECT_DIR/backend"
if ! npm install 2>&1; then
  echo "WARN: backend npm install failed (likely xlsx CDN issue). Trying without xlsx..."
  # Temporarily remove xlsx, install remaining deps, then restore
  node -e "
    const pkg = require('./package.json');
    const orig = pkg.dependencies.xlsx;
    delete pkg.dependencies.xlsx;
    require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    require('fs').writeFileSync('.xlsx-dep-backup', orig);
  "
  npm install
  # Restore xlsx dependency
  node -e "
    const pkg = require('./package.json');
    const orig = require('fs').readFileSync('.xlsx-dep-backup', 'utf8');
    pkg.dependencies.xlsx = orig;
    require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    require('fs').unlinkSync('.xlsx-dep-backup');
  "
  echo "Backend deps installed (xlsx skipped due to CDN unavailability)."
fi

echo "Installing frontend dependencies..."
cd "$PROJECT_DIR/frontend"
npm install

echo "Installing website dependencies..."
cd "$PROJECT_DIR/website"
npm install

echo "Workspace setup complete."
