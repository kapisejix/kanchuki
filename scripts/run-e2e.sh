#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# Kanchuki E2E Test Runner
# Runs the full E2E test suite: starts services → seeds → tests
#
# Usage:
#   npm run test:e2e                # Full E2E (includes try-on)
#   npm run test:e2e -- --skip-tryon  # Skip try-on tests
#   npm run test:e2e -- --api http://localhost:3001
# ─────────────────────────────────────────────────────────────────

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$PROJECT_ROOT/apps/api"
API_URL="http://localhost:3001"
API_PID=""
PASSED=0
FAILED=0

# ── Parse args ──────────────────────────────────────────────────────
EXTRA_ARGS=()
for arg in "$@"; do
  if [[ "$arg" == --api=* ]]; then
    API_URL="${arg#*=}"
  else
    EXTRA_ARGS+=("$arg")
  fi
done

# ── Step functions ──────────────────────────────────────────────────

step() {
  echo -e "\n${CYAN}═══ $1 ═══${NC}"
}

pass() {
  echo -e "  ${GREEN}✅ $1${NC}"
  ((PASSED++))
}

fail() {
  echo -e "  ${RED}❌ $1${NC}"
  ((FAILED++))
}

info() {
  echo -e "  ${YELLOW}ℹ️  $1${NC}"
}

# ── Cleanup handler ─────────────────────────────────────────────────

cleanup() {
  echo ""
  if [ -n "$API_PID" ]; then
    info "Stopping API server (PID: $API_PID)..."
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
    pass "API server stopped"
  fi
  echo ""
  if [ "$FAILED" -gt 0 ]; then
    echo -e "${RED}❌ E2E tests: $PASSED passed, $FAILED failed${NC}"
    exit 1
  else
    echo -e "${GREEN}🎉 E2E tests: ALL $PASSED PASSED!${NC}"
    exit 0
  fi
}
trap cleanup EXIT INT TERM

# ── Start ───────────────────────────────────────────────────────────

echo ""
echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   🚀 Kanchuki E2E Test Runner        ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
echo ""
echo "  Project:  $PROJECT_ROOT"
echo "  API URL:  $API_URL"
echo "  Args:     ${EXTRA_ARGS[*]:-(none)}"
echo ""

# ── Step 1: Check dependencies ────────────────────────────────────

step "Prerequisites"

if ! command -v node &>/dev/null; then
  fail "Node.js not found"
  exit 1
fi
pass "Node.js $(node --version)"

if ! command -v pnpm &>/dev/null; then
  fail "pnpm not found"
  exit 1
fi
pass "pnpm $(pnpm --version)"

# ── Step 2: Check / Start API ─────────────────────────────────────

step "API Server"

if curl -sf "$API_URL/health" >/dev/null 2>&1; then
  pass "API server already running at $API_URL"
else
  info "Starting API server..."
  cd "$API_DIR"
  npx tsx src/index.ts &
  API_PID=$!
  cd "$PROJECT_ROOT"

  # Wait for API to be healthy (up to 45s)
  for i in $(seq 1 15); do
    sleep 3
    if curl -sf "$API_URL/health" >/dev/null 2>&1; then
      pass "API server started at $API_URL"
      break
    fi
    if [ "$i" -eq 15 ]; then
      fail "API server failed to start within 45s"
      exit 1
    fi
    info "Waiting for API... ($((i * 3))s)"
  done
fi

# ── Step 3: Seed test retailer ─────────────────────────────────────

step "Seed Test Retailer"

cd "$API_DIR"
SEED_OUTPUT=$(npx tsx "$PROJECT_ROOT/scripts/seed-credits.ts" 2>&1) || true
cd "$PROJECT_ROOT"

if echo "$SEED_OUTPUT" | grep -q "Updated"; then
  pass "Test retailer seeded with credits"
  echo "$SEED_OUTPUT" | while IFS= read -r line; do
    echo "    $line"
  done
elif echo "$SEED_OUTPUT" | grep -q "not found"; then
  info "Test retailer not yet created — will be created by E2E test"
  info "Run without seeding, E2E test will skip try-on if credits are 0"
else
  info "Seed output: $(echo "$SEED_OUTPUT" | tail -1)"
fi

# ── Step 4: Run E2E tests ─────────────────────────────────────────

step "Run E2E Tests"

cd "$API_DIR"
if [ ${#EXTRA_ARGS[@]} -gt 0 ]; then
  npx tsx "$PROJECT_ROOT/scripts/e2e-test.ts" "${EXTRA_ARGS[@]}" 2>&1
else
  npx tsx "$PROJECT_ROOT/scripts/e2e-test.ts" 2>&1
fi
EXIT_CODE=$?
cd "$PROJECT_ROOT"

if [ "$EXIT_CODE" -eq 0 ]; then
  pass "E2E test suite completed"
else
  fail "E2E test suite had failures"
fi

# Cleanup happens via trap
