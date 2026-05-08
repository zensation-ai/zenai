#!/usr/bin/env bash
# build_neurips_submission.sh — Build NeurIPS 2026 anonymous-mode submission
# package from docs/papers/latex/arxiv-bundle/.
#
# IMPORTANT: arxiv-bundle/zenbrain.tex is a synced VIEW of the master
# docs/papers/latex/zenbrain-submission.tex (with preprint-mode toggle +
# real author block). After ANY edit to zenbrain-submission.tex, sync via:
#   cp docs/papers/latex/zenbrain-submission.tex docs/papers/latex/arxiv-bundle/zenbrain.tex
# then toggle preprint mode + un-comment the real \author{} block in the copy.
# The bib must also be synced: cp docs/papers/latex/zenbrain.bib docs/papers/latex/arxiv-bundle/zenbrain.bib
#
# What it does:
#   1. Copy arxiv-bundle/ → build/neurips-submission/
#   2. Toggle \usepackage[preprint]{neurips_2025} → \usepackage{neurips_2025}
#      (anonymous double-blind mode with line numbers)
#   3. Compile via tectonic
#   4. Verify page-cap: §7 Discussion must start on or before page 9
#   5. Verify anonymity: no leak of "Bering" / "Zensation" / author email
#      (excludes false-positive "Alexander F. Hoffman" coauthor citation)
#   6. Verify file completeness (sty, bbl, figures, tables)
#   7. Print final summary + Submission-PDF location
#
# Usage:
#   bash docs/papers/scripts/build_neurips_submission.sh
#   # → build/neurips-submission/zenbrain.pdf  (NeurIPS-ready)
#
# Requires: tectonic, pdfinfo (poppler-utils), pdftotext

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SOURCE="$REPO/docs/papers/latex"
SRC_TEX="zenbrain-submission.tex"
BUILD="$REPO/build/neurips-submission"
TEX="$BUILD/zenbrain.tex"
PDF="$BUILD/zenbrain.pdf"

red()    { printf '\033[0;31m%s\033[0m\n' "$*"; }
green()  { printf '\033[0;32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[0;33m%s\033[0m\n' "$*"; }
bold()   { printf '\033[1m%s\033[0m\n' "$*"; }

bold "=== NeurIPS-Submission-Builder ==="
echo "Source:  $SOURCE"
echo "Build:   $BUILD"
echo

# 1. Tool check
for tool in tectonic pdfinfo pdftotext; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    red "ERROR: $tool not installed"
    [ "$tool" = "tectonic" ] && echo "  Install: brew install tectonic"
    [ "$tool" = "pdfinfo" ] && echo "  Install: brew install poppler"
    [ "$tool" = "pdftotext" ] && echo "  Install: brew install poppler"
    exit 1
  fi
done

# 2. Clean + copy from master
rm -rf "$BUILD"
mkdir -p "$BUILD"
# Copy submission.tex as zenbrain.tex (canonical name) + deps
cp "$SOURCE/$SRC_TEX" "$TEX"
cp "$SOURCE/zenbrain.bib" "$BUILD/zenbrain.bib"
cp "$SOURCE/neurips_2025.sty" "$BUILD/neurips_2025.sty"
cp -R "$SOURCE/tables" "$BUILD/tables"
cp -R "$SOURCE/figures" "$BUILD/figures"
green "✓ Source copied (master: $SRC_TEX)"

# 3. Verify anonymous mode (default in submission.tex; no toggle needed)
ACTIVE_PKG=$(grep "^[^%]*neurips_2025" "$TEX" | head -1)
if echo "$ACTIVE_PKG" | grep -q "preprint"; then
  red "ERROR: Master submission.tex is in preprint mode! Should be anonymous default."
  echo "  Active line: $ACTIVE_PKG"
  echo "  Fix: edit zenbrain-submission.tex, comment out '\\usepackage[preprint]{neurips_2025}', un-comment '\\usepackage{neurips_2025}'"
  exit 1
fi
green "✓ Anonymous mode active: $ACTIVE_PKG"

# 3b. Verify Anonymous author block is active (defensive)
if grep -q "^\\\\author{Alexander Bering" "$TEX"; then
  red "ERROR: Master has un-anonymized \\author{} active. Fix in zenbrain-submission.tex:"
  echo "  Comment out the Bering author block, un-comment \\author{Anonymous}"
  exit 1
fi
green "✓ Author block: anonymous"

# 4. Compile
echo
echo "Compiling…"
cd "$BUILD"
if ! tectonic -X compile zenbrain.tex 2>&1 | tail -5; then
  red "ERROR: tectonic compile failed"
  exit 1
fi
green "✓ Compiled"

# 5. Verify page-cap
PAGES=$(pdfinfo "$PDF" | awk '/Pages:/{print $2}')
echo
echo "PDF: $PAGES pages total"

DISCUSSION_PAGE=""
for p in 7 8 9 10 11 12; do
  if pdftotext -f "$p" -l "$p" "$PDF" - 2>/dev/null | grep -q "^7 Discussion"; then
    DISCUSSION_PAGE="$p"
    break
  fi
done

if [ -z "$DISCUSSION_PAGE" ]; then
  red "ERROR: §7 Discussion not found on pages 7-12; main text overflow!"
  exit 1
fi

if [ "$DISCUSSION_PAGE" -le 9 ]; then
  green "✓ §7 Discussion on page $DISCUSSION_PAGE — page-cap respected (≤ 9)"
else
  red "✗ §7 Discussion on page $DISCUSSION_PAGE — PAGE-CAP BROKEN (must be ≤ 9)"
  yellow "   Submit to NeurIPS will be rejected."
  exit 1
fi

# 6. Verify anonymity
LEAKS=$(pdftotext "$PDF" - 2>/dev/null \
  | grep -i "alexander\.bering\|alexander bering\|zensation\|@icloud\|@zensation" \
  | grep -v "Hoffman" || true)

if [ -n "$LEAKS" ]; then
  red "✗ Author info LEAKED in anonymous PDF:"
  echo "$LEAKS"
  exit 1
fi
green "✓ Anonymity check: no author-info leak"

# 6b. Verify no broken cross-references (`??` or LaTeX warnings)
BROKEN_REFS=$(pdftotext "$PDF" - 2>/dev/null | grep -cE '\?\?' || true)
if [ "${BROKEN_REFS:-0}" -gt 0 ]; then
  red "✗ Broken references found in PDF: $BROKEN_REFS occurrences of '??'"
  pdftotext "$PDF" - 2>/dev/null | grep -nE '\?\?' | head -5
  exit 1
fi
green "✓ Cross-references: no broken \\ref / \\cite (0 occurrences of '??')"

# 7. File completeness
echo
echo "Submission files:"
for f in zenbrain.tex zenbrain.pdf zenbrain.bib neurips_2025.sty; do
  if [ -e "$BUILD/$f" ]; then
    SIZE=$(wc -c < "$BUILD/$f" | tr -d ' ')
    echo "  ✓ $f ($SIZE bytes)"
  else
    yellow "  ⚠ $f missing"
  fi
done
[ -d "$BUILD/figures" ] && echo "  ✓ figures/ ($(find "$BUILD/figures" -type f | wc -l | tr -d ' ') files)"
[ -d "$BUILD/tables" ] && echo "  ✓ tables/ ($(find "$BUILD/tables" -type f | wc -l | tr -d ' ') files)"

echo
bold "=== READY for NeurIPS Submission ==="
echo "PDF: $PDF"
echo "Pages: $PAGES (main text §1-§7 fits on 9 pages, rest is appendix)"
echo
echo "Next steps:"
echo "  1. Open $PDF and visually verify"
echo "  2. Upload to OpenReview (NeurIPS 2026 submission portal)"
echo "  3. Verify Author Statement, Funding, Competing Interests are correctly redacted"
