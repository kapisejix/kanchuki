#!/usr/bin/env bash
# F-017 Database Guardrails — CI grep guard
#
# Layer 3 of the guardrail system (see docs/SECURITY.md §19.3):
# Blocks PRs that introduce raw `.delete()` calls on business Prisma models
# outside the allowlisted paths.
#
# Allows:
# - Soft-delete via deleted_at = new Date() (preferred, intended pattern)
# - Deliberate single-record hard-delete via /products/:id/purge (retailer-triggered)
# - Dev-only seed cleanup (seed.ts)
# - The 30-day purge cron (once built)
#
# Usage:
#   bash scripts/check-delete-guard.sh
#   Exit code 0 = clean, 1 = violations found
#
# Run from project root. Called by CI (see .github/workflows/ci.yml).

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
HAS_ERROR=0

# ─── Business models that must never be hard-deleted from application code ───
BUSINESS_MODELS=(
  "product"
  "productVariant"
  "customer"
  "retailer"
  "collection"
  "staff"
  "order"
)

# ─── Allowlisted file paths where hard deletes are permitted ────────────────
# These are deliberate, user-triggered, or dev-only operations.
ALLOWLIST=(
  "apps/api/src/jobs/purge-soft-deleted.ts"
)

# ─── Files to exclude entirely from the search ──────────────────────────────
# node_modules/ - generated code (type declarations, etc.)
# seed.ts - dev-only, cleans up before seeding
EXCLUDE_DIRS=(
  "node_modules/"
)

BUILD_EXCLUDE=""
for dir in "${EXCLUDE_DIRS[@]}"; do
  BUILD_EXCLUDE="$BUILD_EXCLUDE --exclude-dir=$dir"
done

echo -e "${YELLOW}🔍 F-017 Guardrail check: scanning for raw .delete() calls on business models...${NC}"

# ─── Check 1: Raw .delete() or .deleteMany() calls on business models ──────
for model in "${BUSINESS_MODELS[@]}"; do
  while IFS= read -r line; do
    if [ -z "$line" ]; then
      continue
    fi

    file=$(echo "$line" | cut -d: -f1)

    # Check if file is in the allowlist
    allowed=false
    for allowed_file in "${ALLOWLIST[@]}"; do
      if [ "$file" = "$allowed_file" ]; then
        allowed=true
        break
      fi
    done

    # Skip dev-only seed file
    if echo "$file" | grep -q "/seed\.ts$"; then
      continue
    fi

    # Skip the product purge endpoint (deliberate, user-triggered, single-record)
    if echo "$file" | grep -q "routes/products\.ts$"; then
      continue
    fi

    if [ "$allowed" = false ]; then
      echo -e "${RED}  ✖ VIOLATION: ${line}${NC}"
      echo -e "${RED}    → Hard delete on '${model}' is forbidden in this file.${NC}"
      echo -e "${RED}    → Use soft-delete (deleted_at = new Date()) instead.${NC}"
      HAS_ERROR=1
    fi
  done < <(grep -rn "prisma\.${model}\.delete(\|prisma\.${model}\.deleteMany(" --include="*.ts" $BUILD_EXCLUDE apps/ packages/ 2>/dev/null || true)
done

# ─── Check 2: Danger - deleteMany WITHOUT a where clause ────────────────────
# Only flag deleteMany({}) or deleteMany() (no args) — these would delete ALL
# rows matching the implied filter (or all rows if no filter at all).
# Legitimate deleteMany with a proper where clause ({ where: ... }) are allowed.
echo ""
echo -e "${YELLOW}🔍 F-017 Guardrail check: checking for dangerously broad deleteMany calls...${NC}"

while IFS= read -r line; do
  if [ -z "$line" ]; then
    continue
  fi

  file=$(echo "$line" | cut -d: -f1)

  # Skip allowlisted and dev-only files
  if echo "$file" | grep -q "/seed\.ts$"; then
    continue
  fi
  if echo "$file" | grep -q "routes/products\.ts$"; then
    continue
  fi

  # Extract just the deleteMany(...) call to check for a where clause
  code=$(echo "$line" | cut -d: -f2- | xargs)
  
  # Flag deleteMany() with no arguments at all
  if echo "$code" | grep -q "deleteMany(\s*)" && ! echo "$code" | grep -q "deleteMany({"; then
    echo -e "${RED}  ✖ DANGER: ${line}${NC}"
    echo -e "${RED}    → deleteMany() with no arguments would delete ALL rows!${NC}"
    HAS_ERROR=1
    continue
  fi
  
  # Flag deleteMany({}) with an empty object (no where clause)
  if echo "$code" | grep -q "deleteMany({\s*})"; then
    echo -e "${RED}  ✖ DANGER: ${line}${NC}"
    echo -e "${RED}    → deleteMany({}) with no where clause would delete ALL rows!${NC}"
    HAS_ERROR=1
  fi
done < <(grep -rn "\.deleteMany(" --include="*.ts" $BUILD_EXCLUDE apps/ packages/ 2>/dev/null || true)

# ─── Check 3: Raw destructive SQL in .sql files outside migrations ────────
echo ""
echo -e "${YELLOW}🔍 F-017 Guardrail check: scanning for raw destructive SQL outside migrations...${NC}"

while IFS= read -r line; do
  if [ -z "$line" ]; then
    continue
  fi

  file=$(echo "$line" | cut -d: -f1)

  # Skip migration files
  if echo "$file" | grep -q "prisma/migrations/"; then
    continue
  fi

  echo -e "${RED}  ✖ VIOLATION: ${line}${NC}"
  echo -e "${RED}    → Destructive SQL outside migration directory.${NC}"
  HAS_ERROR=1
done < <(grep -rni "DELETE FROM\|DROP TABLE\|TRUNCATE\|DROP INDEX\|ALTER TABLE.*DROP" --include="*.sql" $BUILD_EXCLUDE apps/ packages/ scripts/ 2>/dev/null || true)

# ─── Summary ────────────────────────────────────────────────────────────────
echo ""
if [ "$HAS_ERROR" -eq 0 ]; then
  echo -e "${GREEN}✅ F-017 Guardrail check passed — no hard-delete violations found.${NC}"
else
  echo -e "${RED}❌ F-017 Guardrail check FAILED — fix violations above.${NC}"
fi

exit $HAS_ERROR
