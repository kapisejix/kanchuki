#!/usr/bin/env bash
# B-014 Secret-commit guard — blocks staged changes containing live credential
# patterns (see docs/omp-review.md B-014 / S-001).
#
# Pattern-based, same approach as scripts/check-delete-guard.sh. Not a
# replacement for a real secret scanner (gitleaks/trufflehog) — a cheap net
# that catches the exact key formats this repo has already leaked once.
#
# Usage:
#   bash scripts/check-secrets-guard.sh          # scans staged diff (pre-commit use)
#   bash scripts/check-secrets-guard.sh --all     # scans full tracked tree (CI use)
#   Exit code 0 = clean, 1 = violations found

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
HAS_ERROR=0

PATTERNS=(
  'sk-ant-api[0-9]{2}-'      # Anthropic API key
  'sk-proj-[A-Za-z0-9]'      # OpenAI project key
  'AKIA[0-9A-Z]{16}'         # AWS/R2 access key ID
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  'postgres(ql)?://[^:]+:[^@/[:space:]]+@'  # DB URL with inline password
)

# Docs/examples that intentionally contain placeholder credentials, not real ones.
EXCLUDE_PATHS=(':(exclude)*.md' ':(exclude).env.example' ':(exclude)scripts/*.sql')

if [ "${1:-}" = "--all" ]; then
  SOURCE="tracked tree"
  DIFF=$(git grep -InE -e "${PATTERNS[0]}" $(printf -- '-e %q ' "${PATTERNS[@]:1}") -- . "${EXCLUDE_PATHS[@]}" 2>/dev/null || true)
else
  SOURCE="staged diff"
  DIFF=$(git diff --cached -U0 -- . "${EXCLUDE_PATHS[@]}" | grep -E '^\+[^+]' || true)
fi

echo -e "${YELLOW}Secret guard: scanning ${SOURCE}...${NC}"

for pattern in "${PATTERNS[@]}"; do
  hits=$(echo "$DIFF" | grep -E -e "$pattern" || true)
  if [ -n "$hits" ]; then
    echo -e "${RED}  VIOLATION: pattern '${pattern}' matched:${NC}"
    echo "$hits" | sed 's/^/    /'
    HAS_ERROR=1
  fi
done

if [ "$HAS_ERROR" -eq 0 ]; then
  echo -e "${GREEN}Secret guard passed — no known credential patterns found.${NC}"
else
  echo -e "${RED}Secret guard FAILED — remove the credential above before committing.${NC}"
fi

exit $HAS_ERROR
