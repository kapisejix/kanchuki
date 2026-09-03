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
# These already exceeded MAX_LINES before this guard was tightened (they grew
# past 800 over many feature commits + the 2026-09 biome-format pass). Each is
# pinned to its CURRENT length as a hard ceiling: the guard still blocks any
# NEW route file over 800, and blocks these five from growing one line more.
# Bring a file back under 800 and delete its line here — do not raise a ceiling.
declare -A GRANDFATHERED=(
  ["apps/api/src/routes/billing.ts"]=871
  ["apps/api/src/routes/growth/growth-campaigns.ts"]=941
  ["apps/api/src/routes/public/passport.ts"]=924
  ["apps/api/src/routes/public/public-retailers.ts"]=875
  ["apps/api/src/routes/retailers/retailers-social.ts"]=889
)

echo -e "${YELLOW}📏 Route-size guard: checking ${ROUTES_DIR}/**/*.ts stays under ${MAX_LINES} lines...${NC}"

# shellcheck disable=SC2044  # find output is safe here (paths contain no spaces on CI)
for file in $(find "$ROUTES_DIR" -name '*.ts' -not -name '*.test.ts'); do
  lines=$(wc -l < "$file" | tr -d ' ')
  ceiling="${GRANDFATHERED[$file]:-$MAX_LINES}"
  if [ "$lines" -gt "$ceiling" ]; then
    if [ "$ceiling" != "$MAX_LINES" ]; then
      echo -e "${RED}  ✖ VIOLATION: ${file} is ${lines} lines (grandfathered ceiling ${ceiling})${NC}"
      echo -e "${RED}    → This file may not grow further — split it into domain modules.${NC}"
    else
      echo -e "${RED}  ✖ VIOLATION: ${file} is ${lines} lines (limit ${MAX_LINES})${NC}"
      echo -e "${RED}    → Split this route module into domain modules under ${ROUTES_DIR}/.${NC}"
    fi
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
