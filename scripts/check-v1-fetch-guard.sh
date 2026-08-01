#!/usr/bin/env bash
# Web-origin /v1/ fetch guardrail — CI grep guard
#
# Blocks PRs that add a RELATIVE /v1/ fetch to the web app.
#
# Why: the web app has no /v1 routes or rewrites (confirmed during the
# 2026-08-01 checkout incident). A client-side `fetch('/v1/...')` therefore
# 404s on the web origin — silently. This is what hid "Add to Cart" for
# checkout-enabled retailers until the flow was re-routed through the
# /api/* proxy layer. See docs/PRO-REQUIREMENTS.md F-302 and the proxy
# routes under apps/web/src/app/api/.
#
# What this flags (the bug class):
#   fetch('/v1/...')        fetch("/v1/...")        fetch(`/v1/...`)
#   axios.get('/v1/...')    new URL('/v1/...')      script src="/v1/..."
#
# What this ALLOWS (correct today):
#   fetch(`${API_URL}/v1/...`)   — absolute; interpolation precedes /v1/
#   fetch(`/api/c/${slug}/...`)  — web-origin proxy route, not /v1/
#   https://checkout.razorpay.com/v1/checkout.js — external absolute URL
#
# Usage:
#   bash scripts/check-v1-fetch-guard.sh
#   Exit code 0 = clean, 1 = violations found
#
# Run from project root. Called by CI (see .github/workflows/ci.yml).

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
HAS_ERROR=0

echo -e "${YELLOW}🔍 Guardrail check: scanning for relative /v1/ fetches in the web app...${NC}"

# ─── Files to exclude entirely from the search ──────────────────────────────
# .next/      - generated build output
# __tests__/  - test fixtures legitimately mock these exact URLs
EXCLUDE_DIRS=(
  "node_modules/"
  ".next/"
  "__tests__/"
)

BUILD_EXCLUDE=""
for dir in "${EXCLUDE_DIRS[@]}"; do
  BUILD_EXCLUDE="$BUILD_EXCLUDE --exclude-dir=$dir"
done

# ─── Check 1: /v1/ immediately preceded by an opening quote/backtick ────────
# Catches `'/v1/`, `"/v1/"`, `` `/v1/ `` but NOT `` `${API_URL}/v1/ `` (the
# char before /v1/ is '}' there) and NOT `https://.../v1/` (char before is '/').
# Test files matching .test.ts(x) are also excluded (mocks/fixtures).
while IFS= read -r line; do
  if [ -z "$line" ]; then
    continue
  fi

  # Skip test files (vitest fixtures may deliberately reference /v1/ URLs)
  if echo "$line" | grep -qE '\.test\.(ts|tsx|js|jsx):'; then
    continue
  fi

  # Skip comment lines — historical/explainer comments legitimately mention
  # the broken pattern (e.g. "previously fetched `/v1/...`"). Only actual
  # code strings are violations.
  #
  # Skip when the line CONTENT (after the `file:line:` grep prefix) is a
  # `//` comment, i.e. starts with `//` after optional indentation. This
  # catches every comment shape ("// ... `/v1/...`", "  // ...") while
  # never matching code lines — a code line like `const a = '//cdn...';`
  # starts with a quote, not `//`, so a real `fetch('/v1/...')` later on
  # the same line is still flagged.
  if echo "$line" | sed 's/^[^:]*:[0-9]*://' | grep -qE '^\s*//'; then
    continue
  fi

  echo -e "${RED}  ✖ VIOLATION: ${line}${NC}"
  echo -e "${RED}    → Relative /v1/ fetch on the web origin will 404.${NC}"
  echo -e "${RED}    → Use an absolute URL (apiUrl/API_URL from @/lib/apiUrl)${NC}"
  echo -e "${RED}      or route through an /api/* web proxy (see apps/web/src/app/api/).${NC}"
  HAS_ERROR=1
done < <(
  grep -rnE "['\"\`]/v1/" \
    --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
    $BUILD_EXCLUDE apps/web/src 2>/dev/null || true
)

# ─── Summary ────────────────────────────────────────────────────────────────
echo ""
if [ "$HAS_ERROR" -eq 0 ]; then
  echo -e "${GREEN}✅ /v1/ guardrail check passed — no relative /v1/ fetches found.${NC}"
else
  echo -e "${RED}❌ /v1/ guardrail check FAILED — fix violations above.${NC}"
fi

exit $HAS_ERROR
