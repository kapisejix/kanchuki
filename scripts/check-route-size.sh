#!/usr/bin/env bash
# Route-module size guard — keeps apps/api/src/routes/* maintainable
#
# Added 2026-08-04 after splitting admin.ts (3125 lines) and checkout.ts
# (1092 lines) into domain modules (commit 912090e). This guard exists so
# the split stays effective: any future route file that creeps past the
# limit fails CI and must be split again into domain modules.
#
# Usage:
#   bash scripts/check-route-size.sh
#   Exit code 0 = clean, 1 = violations found
#
# Run from project root. Called by CI (see .github/workflows/ci.yml).

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
HAS_ERROR=0

# ─── Limit (lines) ──────────────────────────────────────────────────────────
# ~800: large enough for a single coherent route module, small enough that
# a codebase newcomer can actually read the whole file in one sitting.
MAX_LINES=800

ROUTES_DIR="apps/api/src/routes"

# ─── Grandfathered files ───────────────────────────────────────────────────
# The five files that once exceeded MAX_LINES (billing.ts, growth-campaigns.ts,
# passport.ts, public-retailers.ts, retailers-social.ts) were split into domain
# modules on 2026-09-03 — the allowlist is now empty. If a route file creeps
# past the limit again, split it into domain modules — never re-add a ceiling.

echo -e "${YELLOW}📏 Route-size guard: checking ${ROUTES_DIR}/**/*.ts stays under ${MAX_LINES} lines...${NC}"

# shellcheck disable=SC2044  # find output is safe here (paths contain no spaces on CI)
for file in $(find "$ROUTES_DIR" -name '*.ts' -not -name '*.test.ts'); do
  lines=$(wc -l < "$file" | tr -d ' ')
  if [ "$lines" -gt "$MAX_LINES" ]; then
    echo -e "${RED}  ✖ VIOLATION: ${file} is ${lines} lines (limit ${MAX_LINES})${NC}"
    echo -e "${RED}    → Split this route module into domain modules under ${ROUTES_DIR}/.${NC}"
    HAS_ERROR=1
  fi
done

# ─── Summary ────────────────────────────────────────────────────────────────
echo ""
if [ "$HAS_ERROR" -eq 0 ]; then
  echo -e "${GREEN}✅ Route-size guard passed — no route file exceeds ${MAX_LINES} lines.${NC}"
else
  echo -e "${RED}❌ Route-size guard FAILED — split the oversized file(s) above.${NC}"
fi

exit $HAS_ERROR
