# OTP Login Issue — 2026-08-22

## What you reported

> Stuck on OTP login. Real phone number OTP not working. Demo phone and its OTP not working. Want 2 ways to log in: real phone number (real OTP), and demo phone numbers (OTP visible in Railway log, so testing works without real SMS).

Railway log you pasted:
```
Invalid `prisma.collection.findFirst()` invocation:
ConnectorError(... "invalid input value for enum \"CollectionStatus\": \"HIDDEN\"" ...)
fetchCollection(install.php): API returned 500
```

## Root causes found (2 separate bugs)

### 1. Demo phone dead — self-inflicted, same-day commit

`OTP_TEST_BYPASS` (the only demo-login mechanism that ever existed) was **deleted** in commit `d8efc68` at 19:47 the same day you hit this, with the message *"Removed OTP_TEST_BYPASS (production-only now)"*. An earlier commit that same session (`ec37132`, 18:20) had tried a different demo mechanism (fall back to Supabase's own OTP when Redis has no entry) — that got reverted an hour later in the same commit that removed the bypass. Net result before this fix: **zero demo-login path existed** in `apps/api/src/routes/auth.ts`.

### 2. Real phone — SMS blocked by carrier (account-side, not code)

MSG91 sender ID is **not DLT-registered** (confirmed earlier this project, see `CLAUDE.md`). India requires TRAI DLT registration for every transactional sender ID — MSG91 accepts the send request (`type:"success"`) but the carrier silently drops the SMS before it reaches the phone. This is an **account/paperwork issue, not a bug** — takes 2-7 working days once submitted.

However: `apps/api/src/lib/msg91-otp.ts:167` already logs the generated code to Railway on every send:
```
[otp] Generated OTP for +91<phone>: <code>
```
So real-number login was already recoverable by reading the code off the log — but a same-day code bug (dual MSG91 + Supabase send, mismatched OTPs on verify) made even that path fail intermittently until `d8efc68` fixed it (see below).

### Unrelated noise in your pasted log

`invalid input value for enum "CollectionStatus": "HIDDEN"` is **not an OTP bug**. It's `prisma.collection.findFirst()` on the public collection-share page (`fetchCollection`). Root cause, **confirmed live via Supabase MCP** (`execute_sql` against the prod `thpqcylmcxokajxoerjx` project, 2026-08-22): the live `CollectionStatus` enum has exactly `ACTIVE`, `EXPIRED`, `ARCHIVED` — no `HIDDEN`. Migration `064_ab_variant_collections` never ran.

Checked `_prisma_migrations` directly: the last migration recorded as applied is `048_product_shadow`, finished `2026-08-10 08:53 UTC`. Everything from `049` onward (26 migration folders, through `074`) is **unrecorded in migration history** — but several of their target tables (`campaigns`, `referrals`, `suppliers`, `bookings`, `partners`, `festival_backgrounds`, `lookbooks`, `social_templates`, `channel_syncs`, `plan_pricing`, `product_reviews`, `store_reviews`) **already exist live**. That means most of that range was applied some other way (`prisma db push`, or manual SQL) without ever being recorded — the table-creation half landed, but ALTER-only follow-up migrations on top of those tables (like `064`, which only adds an enum value + 3 columns to the already-existing `campaigns` table) got silently skipped. Confirmed directly: `campaigns` in prod has none of `064`'s 3 new columns either.

**This is not a simple "run migrate deploy" fix** — `prisma migrate deploy` will try to `CREATE TABLE` things that already exist and error out. See `docs/database/database-22-August.md` for the reconciliation steps.

## What was fixed

**Code (`apps/api/src/routes/auth.ts`):**
- Removed the same-day dual-send bug (MSG91 send + Supabase send both firing, generating two different OTPs, verify always failing when it fell to Supabase) — commit `d8efc68`, already landed before this session started.
- Restored a demo-login bypass, redesigned as an **env-list whitelist** instead of the original "phone must already exist as a Supabase auth user" mechanism (that required pre-creating each tester in the Supabase dashboard — too much clicking for 12-21 numbers):
  - `OTP_TEST_BYPASS=1` — kill switch, must be `"1"` or bypass never engages (safe default: unset = off)
  - `OTP_TEST_PHONES=9000000001,9000000002,...` — comma-separated bare 10-digit numbers
  - Listed phones: `/otp/send` returns `"OTP sent"` without calling MSG91; `/otp/verify` accepts **any** 6-digit code and mints a session; a soft-deleted retailer row for that phone gets revived instead of returning `409 ACCOUNT_DELETED`
  - Unlisted phones: completely unaffected — real MSG91/Redis path, unchanged

**Docs:** `.env.example` — documented both vars with a security warning (never set `OTP_TEST_BYPASS` on the real production deployment).

**Tests:** `apps/api/src/routes/auth-otp-bypass.test.ts` — 6 new tests (bypass send/verify, non-whitelisted phone unaffected, flag-off = no bypass, soft-delete revive). Full suite: 27/27 green, `tsc --noEmit` clean.

**Not fixed (needs you, not code):**
- `CollectionStatus` enum — needs migration reconciliation (see `docs/database/database-22-August.md`), not a plain `migrate deploy`. Blocked from running this myself — project's `CLAUDE.md` operational policy: *"NEVER Allowed: Run database migrations — only from admin dashboard with approval."*
- Railway env vars for the bypass — also blocked (*"NEVER Allowed: Modify production environment variables"*). You set `OTP_TEST_BYPASS` / `OTP_TEST_PHONES` on the Railway API service yourself.
- DLT sender-ID registration — MSG91 dashboard, not a code task at all.

## Best solution going forward

1. **Now (testing phase):** `OTP_TEST_BYPASS=1` + `OTP_TEST_PHONES=<your 12-21 numbers>` on Railway. Demo login works for those numbers with any code typed in.
2. **Real numbers during testing:** read the code from the Railway log line (`[otp] Generated OTP for +91<phone>: <code>`) until DLT lands.
3. **DLT registration:** submit via MSG91 dashboard → Sender ID → DLT registration now, in parallel — 2-7 working days, unblocks real SMS delivery for everyone, not just you.
4. **Go-live (1-2 months out, per your plan):** delete `OTP_TEST_BYPASS` and `OTP_TEST_PHONES` from Railway. Zero code change needed — `ensureSupabaseSession` already find-or-creates the Supabase auth user for any phone, so the same demo numbers flow through the real OTP path with no data migration if you ever reuse them for real.
5. **Separately:** reconcile prod migration history (26 migrations, `049`→`074`, unrecorded — most tables already exist, so this needs `prisma migrate resolve --applied` per already-landed migration before `migrate deploy` runs the real gaps like `064`) to clear the `CollectionStatus` crash — unrelated to OTP but was surfaced by the same log dump. Full plan in `docs/database/database-22-August.md`.

## Files touched
- `apps/api/src/routes/auth.ts`
- `.env.example`
- `apps/api/src/routes/auth-otp-bypass.test.ts` (new)

Not committed as of this writing.
