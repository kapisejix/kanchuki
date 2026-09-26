#!/usr/bin/env bash
# Root-cause tracker guard — the command that re-derives the "owed" list
#
# Added 2026-09-26 (RC-046). The tracker already had two hand-written `comm`
# checks in docs/root-cause/README.md for the entry<->CLAUDE.md-row invariant,
# but the section that listed "RC IDs referenced in commits with no entry yet"
# (the owed list) was prose that nothing re-derived. It went stale: it listed
# RC-028…RC-038 as owed for days after every one of those branches had merged
# and every entry had landed. A list nothing re-derives drifts; this is the
# command that re-derives it.
#
# It checks four things (all must hold):
#   1. every `## RC-###` entry has a row in the CLAUDE.md tracker table
#   2. every CLAUDE.md row has an entry
#   3. the entry set is contiguous RC-001..RC-<max> (no gaps)
#   4. the owed list is empty, and the README's owed section agrees with that
#
# Usage:
#   bash scripts/check-root-cause-tracker.sh   (or: pnpm check:root-cause)
#   Exit code 0 = clean, 1 = violations found
#
# Run from project root. Check 4 reads git history, so it wants a FULL clone:
# a shallow one fails closed with instructions rather than passing silently.
# CI wiring (checkout `fetch-depth: 0` + this line) is owner-only — see the
# separate note in docs/root-cause/README.md.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
HAS_ERROR=0

# The tracker is split across two files; the ID set is one set across both.
RC_FILES=(
  "docs/root-cause/root-cause issues.md"
  "docs/root-cause/root-cause issues (part 2, RC-030 and older).md"
)
README="docs/root-cause/README.md"
TABLE="CLAUDE.md"
# The README's owed section must carry exactly this when the owed list is empty.
MARKER='**Currently: none.**'

for f in "${RC_FILES[@]}" "$README" "$TABLE"; do
  if [ ! -f "$f" ]; then
    echo -e "${RED}✖ required file missing: $f${NC}"
    exit 1
  fi
done

# ─── Derive the two sets ─────────────────────────────────────────────────────
entries() {
  cat "${RC_FILES[@]}" \
    | grep -oE '^## RC-[0-9]+' \
    | sed 's/## //' \
    | sort -u \
    | grep -v '^$' || true
}
rows() {
  awk '/^\| RC-[0-9]+ \|/{print $2}' "$TABLE" \
    | sort -u \
    | grep -v '^$' || true
}

ENTRIES="$(entries)"
ROWS="$(rows)"

echo -e "${YELLOW}🔍 Root-cause tracker guard: re-deriving the ID sets...${NC}"

# ─── Check 1/2: entry <-> row, both directions ───────────────────────────────
missing_rows="$(comm -23 <(printf '%s\n' "$ENTRIES") <(printf '%s\n' "$ROWS"))"
if [ -n "$missing_rows" ]; then
  echo -e "${RED}  ✖ entry with no CLAUDE.md tracker row:${NC}"
  printf '%s\n' "$missing_rows" | sed 's/^/      /'
  echo -e "${RED}    → add the row to the RC table in CLAUDE.md (rule 4).${NC}"
  HAS_ERROR=1
fi

orphan_rows="$(comm -13 <(printf '%s\n' "$ENTRIES") <(printf '%s\n' "$ROWS"))"
if [ -n "$orphan_rows" ]; then
  echo -e "${RED}  ✖ CLAUDE.md row with no entry:${NC}"
  printf '%s\n' "$orphan_rows" | sed 's/^/      /'
  echo -e "${RED}    → the row points at an entry that does not exist.${NC}"
  HAS_ERROR=1
fi

# ─── Check 3: contiguous RC-001..max (a gap is a missing row, not a gap) ─────
max="$(printf '%s\n' "$ENTRIES" | sed 's/RC-0*//' | sort -n | tail -1)"
if [ -n "$max" ]; then
  n=1
  while [ "$n" -le "$max" ]; do
    id="$(printf 'RC-%03d' "$n")"
    if ! printf '%s\n' "$ENTRIES" | grep -qx "$id"; then
      echo -e "${RED}  ✖ gap in the ID set: $id is missing from RC-001..RC-$(printf '%03d' "$max")${NC}"
      HAS_ERROR=1
    fi
    n=$((n + 1))
  done
fi

# ─── Check 4: the owed list — the half that used to be prose ─────────────────
# "Owed" = an RC ID a commit message names, with no tracker entry. That is the
# rule-4 failure: the commit landed, the entry did not. The list is derived,
# never written, so it cannot drift.
if [ "$(git rev-parse --is-shallow-repository 2>/dev/null || echo unknown)" != "false" ]; then
  echo -e "${RED}  ✖ shallow clone — cannot read commit history to derive the owed list.${NC}"
  echo -e "${YELLOW}    → re-run from a full clone, or set checkout \`fetch-depth: 0\` in CI.${NC}"
  HAS_ERROR=1
else
  referenced="$(git log --pretty=%B | grep -oE 'RC-[0-9]+' | sort -u | grep -v '^$' || true)"
  owed="$(comm -23 <(printf '%s\n' "$referenced") <(printf '%s\n' "$ENTRIES"))"
  if [ -n "$owed" ]; then
    echo -e "${RED}  ✖ RC IDs named in commits with NO tracker entry (the owed list):${NC}"
    printf '%s\n' "$owed" | sed 's/^/      /'
    echo -e "${RED}    → each ID above is spoken for. Add its entry + CLAUDE.md row${NC}"
    echo -e "${RED}      and list it in the README's owed section until it lands.${NC}"
    HAS_ERROR=1
  elif ! grep -qF "$MARKER" "$README"; then
    echo -e "${RED}  ✖ the owed list is empty, but the README does not say so.${NC}"
    echo -e "${RED}    → set the owed section to ${MARKER} — a hand-written${NC}"
    echo -e "${RED}      list there is exactly what drifts (RC-046).${NC}"
    HAS_ERROR=1
  fi
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
if [ "$HAS_ERROR" -eq 0 ]; then
  echo -e "${GREEN}✅ Root-cause tracker guard passed — entries/rows consistent, ID set contiguous, owed list empty.${NC}"
else
  echo -e "${RED}❌ Root-cause tracker guard FAILED — fix the violations above.${NC}"
fi

exit $HAS_ERROR
