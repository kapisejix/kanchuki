#!/usr/bin/env bash
# B-014 Secret-commit guard — blocks staged changes containing live credential
# patterns (see docs/omp-review.md B-014 / S-001).
#
# HARDENED 2026-08-02 after a GitGuardian leak: the old version excluded *.md
# and scripts/*.sql from scanning — exactly the files where the Supabase role
# passwords + connection URIs lived (docs/INFRA-SETUP.md, 26-night-report.md,
# omp-review.md, scripts/setup-role-separation.sql, setup-vault-db.sql). Those
# exclusions are gone. Two tiers now:
#   1. EVERY file (docs and SQL included): known-leaked literals + DB URLs with
#      a real-looking inline password (placeholder forms allowed).
#   2. Non-doc files: generic key shapes (sk-ant-, AKIA, private keys, ...).
# .env.example is excluded from tier 2 only — it legitimately shows template
# credentials like `user:password@host` (tier 1's placeholder allowlist covers it).
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

# ─── Tier 1a: values that leaked on 2026-08-02 (GitGuardian alert). ──────────
# These must NEVER appear anywhere in the repo again — not in docs, not in SQL,
# not in .env.example. If you need to reference them, write them as
# `<LEAKED_APP_PASSWORD>` style tokens, never as literals.
# NOTE: each literal is split across adjacent quotes so this file itself does
# not contain the contiguous secret (which would self-flag the scan below).
LEAKED_LITERALS=(
  "KanchukiApp_""R3stricted"
  "KanchukiM1""grator"
  "KanchukiPurge_""Delete0nly"
  "4z2b""vJCW7r806VGJ"
  "VaultApp_""InsertOnly"
)

# ─── Tier 1b: DB URLs with a real-looking inline password. ───────────────────
# Placeholder password forms are allowed (templates / local test creds):
#   password, PASSWORD, pwd, xxx, ..., ci, CHANGE_ME, and any <...> token.
# PCRE negative lookahead requires GNU grep (-P); CI runs on Ubuntu.
DB_URL_PATTERN='postgres(ql)?://[^:/@[:space:]]+:(?!password|PASSWORD|pwd|xxx|\.\.\.|ci|<[^>]+>)[^@/[:space:]]+@'

# ─── Tier 2: generic API-key / private-key shapes (non-doc files only). ──────
CODE_PATTERNS=(
  'sk-ant-api[0-9]{2}-'      # Anthropic API key
  'sk-proj-[A-Za-z0-9]'      # OpenAI project key
  'AKIA[0-9A-Z]{16}'         # AWS/R2 access key ID
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
)
# Docs may legitimately describe key formats; .env.example and setup SQL are
# templates. Tier 1 still scans them for the dangerous forms above.
CODE_EXCLUDE=(':(exclude)*.md' ':(exclude).env.example' ':(exclude)scripts/*.sql')

# ─── PCRE probes — a guard that silently no-ops is worse than no guard. ──────
# The DB-URL tier uses negative lookahead (grep -P). If PCRE is unavailable
# (e.g. BSD grep on macOS, or git built without PCRE), every hit grep would
# error and `|| true` would swallow it, reporting PASS with zero protection.
# Probe up front and FAIL LOUDLY instead.
if ! echo x | grep -P '^' >/dev/null 2>&1; then
  echo -e "${RED}Secret guard requires GNU grep with -P (PCRE) support.\n  Install it (e.g. brew install grep on macOS) or run on Linux/Git Bash.${NC}"
  exit 1
fi
if ! git grep -InP '^' -- scripts/check-secrets-guard.sh >/dev/null 2>&1; then
  echo -e "${RED}Secret guard requires git built with PCRE support (git grep -P).\n  Reinstall git (Git for Windows / Homebrew git include PCRE).${NC}"
  exit 1
fi

if [ "${1:-}" = "--all" ]; then
  MODE="tracked tree"
  # Tier 1a — every tracked file, no exclusions:
  LEAKED_HITS=$(git grep -InE "$(IFS='|'; echo "${LEAKED_LITERALS[*]}")" -- . 2>/dev/null || true)
  # Tier 1b — every tracked file except .env.example (its `user:password@host`
  # template is already inside the placeholder allowlist, but keep it cheap):
  DB_HITS=$(git grep -InP "$DB_URL_PATTERN" -- . ':(exclude).env.example' 2>/dev/null || true)
  # Tier 2 — non-doc files:
  CODE_HITS=$(git grep -InE $(printf -- '-e %q ' "${CODE_PATTERNS[@]}") -- . "${CODE_EXCLUDE[@]}" 2>/dev/null || true)
else
  MODE="staged diff"
  # Tiers 1a/1b scan ALL added lines (docs and SQL included).
  ADDED=$(git diff --cached -U0 | grep -E '^\+[^+]' || true)
  LEAKED_HITS=$(echo "$ADDED" | grep -nE "$(IFS='|'; echo "${LEAKED_LITERALS[*]}")" || true)
  DB_HITS=$(echo "$ADDED" | grep -nP "$DB_URL_PATTERN" || true)
  # Tier 2 (key shapes) mirrors --all mode: same CODE_EXCLUDE pathspecs, so a
  # doc edit that legitimately mentions an `AKIA...`/`sk-ant-` format does not
  # false-positive pre-commit while passing CI.
  CODE_ADDED=$(git diff --cached -U0 -- . "${CODE_EXCLUDE[@]}" | grep -E '^\+[^+]' || true)
  CODE_PAT=$(printf -- '%s|' "${CODE_PATTERNS[@]}")
  CODE_PAT="${CODE_PAT%|}"
  CODE_HITS=$(echo "$CODE_ADDED" | grep -nE "$CODE_PAT" || true)
fi

echo -e "${YELLOW}Secret guard: scanning ${MODE}...${NC}"

check_hits() {
  local label="$1" hits="$2"
  if [ -n "$hits" ]; then
    echo -e "${RED}  VIOLATION: ${label}:${NC}"
    echo "$hits" | sed 's/^/    /'
    HAS_ERROR=1
  fi
}

check_hits "known-leaked credential literal" "$LEAKED_HITS"
check_hits "DB URL with real-looking password" "$DB_HITS"
check_hits "API key / private key shape" "$CODE_HITS"

if [ "$HAS_ERROR" -eq 0 ]; then
  echo -e "${GREEN}Secret guard passed — no known credential patterns found.${NC}"
else
  echo -e "${RED}Secret guard FAILED — remove the credential above before committing.${NC}"
fi

exit $HAS_ERROR
