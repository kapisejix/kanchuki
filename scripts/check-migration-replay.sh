#!/usr/bin/env bash
# Replays packages/db/prisma/migrations on an EMPTY Postgres (RC-159).
#
# Needs DATABASE_URL pointing at a THROWAWAY pgvector database on localhost.
# Fails if any migration other than the KNOWN ones below fails, so a new
# migration that breaks replay is caught at review time.
#
# KNOWN = migrations that already fail on an empty DB (RC-159). They are marked
# applied and skipped so the rest of the history is still checked. Delete an
# entry here when its migration is fixed.
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL to a throwaway localhost pgvector database}"
case "$DATABASE_URL" in
  *@localhost[:/]*|*@127.0.0.1[:/]*) ;;
  *) echo "refusing: DATABASE_URL is not localhost" >&2; exit 2 ;;
esac

# "migration::error text it must fail with". A pinned migration failing any other way is a new bug.
KNOWN=(
  '009_revocation_token::column "revocation_token" of relation "training_photo_consents" already exists'
  '015_public_write_rls_hardening::schema "extensions" does not exist'
)
hits=0
prisma() { pnpm --filter @kanchuki/db exec prisma "$@"; }

# Supabase pieces the history assumes. No privileges: grants/RLS are created, not exercised.
stub=$(mktemp)
trap 'rm -f "$stub"' EXIT
cat > "$stub" <<'SQL'
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','kanchuki_app','kanchuki_purge'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I', r);
    END IF;
  END LOOP;
END $$;
SQL
prisma db execute --file "$stub" --schema prisma/schema.prisma

# deploy stops at the first failure: up to one pass per known failure, then a clean pass.
for _ in 1 2 3; do
  if out=$(prisma migrate deploy 2>&1); then
    echo "$out" | tail -3
    break
  fi
  hit=""
  for k in "${KNOWN[@]}"; do
    if grep -qF "${k%%::*}" <<<"$out" && grep -qF "${k#*::}" <<<"$out"; then hit="${k%%::*}"; break; fi
  done
  if [ -z "$hit" ]; then
    echo "$out" >&2
    echo "FAIL: a migration outside the known RC-159 set (or a known one with a different error) failed to replay" >&2
    exit 1
  fi
  echo "known RC-159 failure, marking applied: $hit"
  prisma migrate resolve --applied "$hit"
  hits=$((hits + 1))
done

# A pin that no longer fails means its migration was fixed: drop it from KNOWN.
if [ "$hits" -ne "${#KNOWN[@]}" ]; then
  echo "FAIL: ${#KNOWN[@]} known failures pinned but only $hits occurred; remove the fixed one(s) from KNOWN" >&2
  exit 1
fi

# Must be clean now (also catches the loop running out of passes).
prisma migrate deploy >/dev/null
echo "replay OK"

# Informational only: drift between the replayed DB and schema.prisma (RC-159: 84 at 2026-10-31).
prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script \
  | grep -c ';' | sed 's/^/schema drift lines (info, not gated): /' || true
