# Kanchuki — Build Log (part 5 of 6)

> Continuation of [`../BUILD-LOG.md`](../BUILD-LOG.md) — split 2026-09-26 to stay under the 150k-char doc limit. Full chronological detail, same as before, just split by size. Sections in this part run from "BUILT 2026-09-22 — Retailer affiliate referral program (T1–T3) + purge-grant audit (RC-029, RC-030, RC-031)" to "2026-09-24 (launch §7A.6) — retailer-facing photo retention / no-training notice".

---

## BUILT 2026-09-22 — Retailer affiliate referral program (T1–T3) + purge-grant audit (RC-029, RC-030, RC-031)

> **Superseded in part, same day:** **T4** landed later (see §2026-09-22 (T4) at the foot of this file),
> so the "T4–T10 not started" status below describes *this* section's session, not the current state.
> Current status is in **CLAUDE.md** row 76. T6–T10 remain unstarted (T4 and T5 have since landed — see the foot of this file).

Spec: `docs/tasks/referral-program-retailer-affiliate.md`. Retailer → retailer: an existing paying
retailer earns a recurring commission for bringing another retailer onto Kanchuki. §10 of that spec
says to build **T1 (schema) first and stop**; T1–T3 are done, **T4–T10 are not started.**

**`apps/mobile` and `apps/web` (customer PWA) are untouched — 0 files.** The Play Console review in
flight is unaffected. Every tracked edit below is an insertion.

### T1 — schema + migration `109_referral_program` (not applied)

| File | Change |
|---|---|
| `packages/db/prisma/schema.prisma` | `ReferralSettings` / `ReferralCode` / `ReferralConversion` / `ReferralPayout` + `PayoutStatus` / `PayoutCadence` / `ReferredBonusType` / `ConversionStatus`; back-relations on `Retailer` |
| `packages/db/prisma/migrations/109_referral_program/migration.sql` | 4 enums + 4 tables, 12 `CHECK` constraints, indexes, the singleton seed row, and `GRANT DELETE` to `kanchuki_purge` |
| `apps/api/src/jobs/purge-soft-deleted.ts`, `purge-retailer-now.ts` | the three new tables swept **before** `DELETE FROM retailers` |
| `scripts/setup-role-separation.sql` | the three new tables added to the purge grant list |
| `docs/DATABASE.md` | new "Retailer referral / affiliate program" section |

**Owner decisions applied (asked before writing the migration, because both are expensive after it
is applied):** singleton `referral_settings` row (not per-tier), `ON DELETE RESTRICT` on all three
retailer FKs, and payouts never deleted — status only.

**The RESTRICT choice is load-bearing and is why T1 touched the jobs at all.** It makes all three
tables retailer *children*, and this repo has shipped that bug twice: `product_attributes` /
`social_accounts` got RESTRICT FKs, were missing from the purge list, and made `DELETE FROM retailers`
throw an FK violation that rolled back the **whole** transaction — the cron silently did nothing.
Either half alone reproduces it. `referral_settings` is exempt (global singleton).

**Fields beyond the spec's T1 sketch, each audited and most trimmed** — the criterion being *removing it
leaves a money/audit invariant unrepresentable and needs a later migration on a financial table*.
Kept: `payout_id` (`REVERSED` must be able to find the conversions a batch settled, and `status` is
only auditable if it agrees with the transitions), `idempotency_key` (uniqueness cannot be safely
retrofitted once rows exist), `qualified_at` / `clawed_back_at` / `paid_at`, `failure_reason`,
`PayoutStatus.PROCESSING` / `REVERSED`, `BonusType.NONE` (**required**, not extra — the CHECK forbids
`value = 0` for a real type, so "no referred-side bonus" is otherwise inexpressible), `Cadence.MANUAL`,
`is_active` (a flag means **no** hard-delete path on `referral_codes`, removing an RC-004/RC-028 class
rather than guarding it). Trimmed: `period_start` / `period_end` (redundant once `payout_id` links
the conversions, and the only thing forcing the `period_ordered` CHECK), `razorpayx_status` (raw
provider blob; our status + `failure_reason` + the lookup-able id cover diagnosis),
`clawback_reason` (free text for T9's undesigned tool), `deactivated_at` (unpaired timestamp on a
toggle).

**Names avoid the removed engine entirely.** The 082 teardown dropped `referrals`,
`referral_credits`, `partner_referrals` and the enums `ReferralCreditStatus` / `PartnerReferralStatus`;
none of those identifiers is reused. It is also distinct from F-018's *internal-team* codes
(`TeamMember.referral_code` → `retailers.onboarded_by_id`) — separate ledgers, and onboarding's
existing "Referral Code (Optional)" field is F-018 staff attribution, **not** this feature.

### T2 — admin settings API + screen

| File | Change |
|---|---|
| `apps/api/src/routes/admin/admin-referral.ts` | `GET` + `PUT /v1/admin/referral-settings` |
| `apps/api/src/routes/admin/index.ts`, `routes/admin.ts` | export **and** `await server.register(...)` |
| `apps/web/src/app/admin/referral-settings/page.tsx` | the settings form |
| `apps/web/src/app/admin/components/Sidebar.tsx` | `Referral Program` entry under Reports & Finance |
| `admin-referral.test.ts`, `referral-settings/__tests__/page.test.tsx`, `Sidebar.test.tsx` | 17 + 10 tests, plus a nav→route pair guard |

"CRUD on the settings row" for a singleton seeded by the migration reads as GET + PUT. **`D` is
deliberately absent** — no hard-delete path on the table at all, which is what the owner's
"never delete, status only" decision bought.

**Server-side validation, three layers:** zod bounds per field (commission 0–100, duration 1–120,
qualify 0–365 …); enum-like columns validated against the exact set the consuming tasks branch on, so
a `'CASHBACK'` bonus is **rejected rather than stored and ignored** (RC-027); and the migration's
`CHECK` constraints mirrored in `crossFieldError()`, evaluated against the **merged** state so a
partial PUT still cannot land an impossible pairing — naming the setting to fix instead of surfacing a
Postgres 23514.

**Only changed fields are written, and that is load-bearing twice.** The screen diffs against the
stored row and the API diffs again ("no change" is a no-op with no audit entry), so resubmitting an
untouched form cannot trip validation or churn a row (the RC-010 shape). `buildPatch` also forces the
bonus **value** in when only its *unit* changed: 2 months and 2 paise are the same numeral, so
comparing numbers alone would call it unchanged and silently reinterpret the stored figure.

### Purge-grant audit — the part that was not the referral feature

Auditing `scripts/setup-role-separation.sql` against the schema produced two findings, both fixed
(details + prevention lessons in `docs/root-cause/root-cause issues.md`):

| ID | Finding | Fix |
|---|---|---|
| RC-029 | **RC-028's fix does not work.** It moved the promotions delete onto `kanchuki_purge`, but no file anywhere — script or migration — ever granted that role `DELETE` on `promotions`. The route compiles, ships and looks right while the delete still 500s. | migration `110_promotions_purge_grant` (`prisma migrate deploy` applies it; the hand-run script is not on any deploy path) + the same grant in the script |
| RC-030 | **7 tables strand rows on retailer deletion.** `campaigns`, `campaign_sends`, `promotions`, `consent_events`, `customer_recently_viewed`, `customer_wishlist_items`, `customer_interactions` declare `retailer_id` as a bare scalar with no FK, so nothing cascades and nothing errors — the rows simply survive. Two are not even granted. 6 of 13 bare-`retailer_id` models are purged; 7 are not. | **Fixed** — all 7 swept in **both** jobs + 6 new grants in `scripts/setup-role-separation.sql` (`promotions` in migration `110`), with the **schema-driven completeness guard** that made the class possible in the first place. Then the four `customer_*`/`consent_*` sweeps **still deleted nothing**: they have RLS enabled and no policy named the backend roles, and RLS filters instead of raising. That turned out to be repo-wide — **23 of the 32** purge-path tables are RLS-enabled and **no policy in the schema named `kanchuki_app`/`kanchuki_purge`**; access worked only via `pg_class_ownercheck` (the purge role is a member of each table's owning role). Fixed by migration `111_backend_role_rls_policies` (`FOR ALL`, both roles — `FOR DELETE` would have left every batch-`SELECT` empty) + `purge-rls-policy.test.ts` (derives the set in both directions) + opt-in `purge-rls-live.test.ts`. |

The reported staleness was also real and is pruned: **9 names in the purge grant list had been
dropped by migration 082** (`product_spin_frames`, `order_items`, `orders`, `try_on_jobs`,
`try_on_usage_logs`, `customer_measurements`, `customer_fashion_dna`, `size_charts`,
`size_chart_rows`). A `GRANT` naming a missing relation is a hard error, so the script aborted at that
statement before its own verification `SELECT`s ran. One near-miss worth recording:
**`customer_interactions` was also dropped by 082 and re-created by migration 100** (F-037 Phase 1), so
a grep-082's-drops fix would have deleted it and broken the newest feature on the list — the
re-creation was checked, not just the drop. It was originally removed from the list in this session and
**restored**, because nothing deletes it and a privilege reduction nobody asked for is also a change.
`docs/INFRA-SETUP.md` carried a third copy of the same list with 3 dead names; fixed, and pointed at
the script as the one authority so the two stop drifting.

Also added: `apps/api/src/jobs/purge-soft-deleted.test.ts` — the cron had **no** test file, so the
test for T1's three tables would otherwise have left the cron half unguarded while the admin half
(`purge-retailer-now.test.ts`) was covered. Its assertions are the invariants, not the call count:
children before `DELETE FROM retailers`; `referral_conversions` swept for **`referred_id` too** (a
conversion is a child of *both* retailers, so a missing referred-side sweep makes purging a referred
shop fail on the referrer's leftover row); `referral_payouts` before `referral_conversions`
(`ON DELETE SET NULL` is another write on the child, so the other order can deadlock two concurrent
deletes); no unscoped table delete; the 15-day predicate inline where each sweep actually lives; and
`app.allow_hard_delete` set in the **same** transaction as every delete (it is per-connection, so a
SET and its DELETE landing on different pooled connections makes the guardrail refuse the delete).

**RC-030's cleanup — and the guard the class needed from the start.** All seven bare-`retailer_id`
tables are now swept by **both** jobs (`purgeChildren('campaign_sends'… )` etc. in the cron,
`DELETE FROM campaign_sends WHERE retailer_id = $1` in the admin hard-delete), with six new grants in
`scripts/setup-role-separation.sql` and `promotions` already carried by migration `110`. Each deletion
site is commented with the rule that matters: a **declared** FK fails loudly when a sweep misses it (the
FK violation rolls the whole transaction back, which is why the `product_attributes` /
`social_accounts` omissions were caught at all), while a **denormalised** `retailer_id` fails
**silently** — Postgres neither cascades nor errors, so the rows simply outlive the shop with no owner.
That asymmetry is the whole root cause.

The guard is the part that stops it recurring, and it is deliberately **not** a list of seven names:
`purge-soft-deleted.test.ts` → `RC-030 — every bare-\`retailer_id\` table has a purge decision` reads
`schema.prisma` at run time, collects every model whose `retailer_id` is a bare scalar (no `Retailer`
relation), computes cascade reachability **from the schema's own `onDelete: Cascade` relations** to a
fixpoint, and fails naming any table either job misses. Cascade reachability is computed rather than
allowlisted because of `product_videos` — the one existing counter-example, and the reason the
asymmetry between the two jobs is not a bug: it needs no cron delete because its `product_id` FK to
`products` (migration 055) already carries it away when products are purged, and the admin path deletes
it explicitly. A test asserting "all seven names present" would relearn nothing one refactor later; this
one fails the moment a new bare-`retailer_id` model appears with no purge decision. **Falsified three
ways:** dropping the `promotions` sweep from the cron fails with `expected [ 'promotions' ] to deeply
equal []`; adding a bare-`retailer_id` model to the schema fails **both** jobs with
`expected [ 'test_orphan_table' ]`; and a counter-test asserts `BARE_RETAILER_MODELS.length >= 7` so a
broken schema parse cannot make the guard pass vacuously. `purge-retailer-now.test.ts` also asserts all
seven deletes are issued **before** the retailer row.

**Verification:** API **1078/1078** (83 files, and the spec §11-required `security.test.ts` +
`admin.login.test.ts` run explicitly — 15/15) · web **319/319** (41 files) · `apps/api` + `packages/db` +
`apps/web` `tsc --noEmit` clean · `apps/web` `next lint` clean · **Biome clean on every changed
`apps/api` / `packages/db` file** (that is the surface CI governs — `apps/api`'s lint script is
`biome check src/`, while `apps/web` lints with `next lint`, so the web admin pages are outside the
Biome gate and carry a dirty baseline: the two siblings of the new screen hold **25** errors and 5
warnings between them) · `check-delete-guard.sh` passes · migration 109 diffed **byte-identical**
against Prisma's own `migrate diff` output (61/61 lines) · grant list checked in **both** directions
(every name exists — 24/24; every table the 7 purge-role consumers delete is granted — 24/24) ·
Guards falsified rather than assumed: removing a referral delete from either job fails with a precise
message; swapping the enum checks for `z.string()` fails exactly the 2 RC-027 tests; making the diff
send every field fails **7**.

**On the web files' Biome diagnostics, stated precisely rather than claimed clean.** `git show
HEAD:` versions of `Sidebar.tsx` and `Sidebar.test.tsx` carry the **same 5** diagnostics after this
change as before it, so nothing was added. The new `page.tsx` ends at **1 error + 1 warning**: the
error is `process.env['NEXT_PUBLIC_API_URL']` (biome's `useLiteralKeys`), which is the repo's own
convention — 68 files use the bracket form including all three sibling admin pages on the identical
line — so it was deliberately left rather than diverging from every other admin screen; the warning is
`useExhaustiveDependencies: load`, which adding would re-run the fetch on every render (`load` is
recreated each render) and which the sibling page also carries. Two real fixes were applied to the new
file: `biome check --fix` (import order, formatting) and an explicit `type="button"` on both
buttons — no `<form>` wraps them today, so the implicit-submit hazard is latent rather than live, but
it costs nothing to remove.

**Not done / owner-side:** migrations **109, 110 and 111 are not applied** (admin dashboard, per
CLAUDE.md) · `scripts/setup-role-separation.sql` is applied by hand and carries the `promotions` grant
only for from-scratch environments · **T4–T10 not started** *(T4 landed later the same day — see the
T4 section at the foot of this file)* · **affiliate links earn nothing yet** — T3
mints and returns a code, but the `?ref=` capture on `/for-retailers` is T4, so no conversion can be
recorded. CLAUDE.md index row + the RC rows were added with explicit owner approval (Operational
Control Policy).

**T3 blocker, recorded so it is not rediscovered:** `generateReferralCode()` already exists **twice** —
live for F-018 staff codes in `team-helpers.ts`, and a stale orphan in `growth-helpers.ts` — and
onboarding's "Referral Code (Optional)" field is F-018 *staff* attribution. T3 has to disambiguate the
two before it writes any code, or a retailer's affiliate code and a marketing agent's attribution code
will collide in the same namespace. **(Resolved when T3 landed — see the T3 section below, which found
the collision was already live in the web app, not just a naming risk.)**

### T3 — referral code + shareable link (2026-09-22, later)

**The blocker was understated, and answering it properly changed the link scheme.** Three findings from
grepping the live flows rather than the docs:

| # | Finding | Consequence |
|---|---|---|
| 1 | **`?ref=` already carries the F-018 staff namespace.** `apps/web/src/app/survey/SurveyForm.tsx` shares `https://kanchuki.com/for-retailers?ref={staffCode}` on WhatsApp today. | The two namespaces meet at ONE param and ONE landing. They must be separated by the code's **shape**, not by which code path read them — a single entry point is exactly the case where "look up one table, then the other" hands attribution to whichever runs first. |
| 2 | **`/join?ref=…`, the link the spec sketched, would 404 every referral.** `apps/web/src/app/join/page.tsx` is the staff-invite bridge (`?token=…`) and calls `notFound()` without a token. | The link points at `/for-retailers` — the page F-018 links already use. No new route, no second link-shortener. |
| 3 | **The wanted `KAN-XXXXXX` shape already existed as dead code.** An orphan `generateReferralCode()` in `growth-helpers.ts` (roadmap C, deleted by migration 082's teardown) with an ambiguity-free alphabet. | Relocated to `lib/referral-codes.ts` instead of re-invented, so there is one definition rather than two. Its orphaned `parseReferralCode` went with it. |

**The separation, and why it holds.** Affiliate = `KAN-XXXXXX` (no I/L/O/0/1 — these are read aloud off WhatsApp screenshots). F-018 = `[0-9A-Z]{6}` from `Math.random().toString(36)`, which **cannot produce a hyphen**. So one character separates them, and `classifyReferralCode()` branches on shape — never on lookup order. Two halves make it hold: the generator's shape, pinned by a **source contract** test (the generator is in a route module whose import chain reaches the admin router and Redis clients, so reading its source beats dragging that into a unit test), and a **guard on the hand-editable path** — the F-018 field is `z.string().min(4).max(20)`, so a typed `KAN-XXXXXX` would otherwise sit in the affiliate namespace and shadow a real attribution. That is why `team-members.ts` now refuses a hyphen, with a message naming the reservation.

**Falsification caught a real hole in the first version of that guard**, which is the part worth
keeping. The guard checked only for a hyphen — so relaxing the pattern to `-?` let `KAN7F3QMP` into the
staff field while classification sent it to the affiliate ledger: the separation rested entirely on a
detail nothing prevented from changing. The guard now refuses the hyphen-dropped shape too, and a test
asserts that a hyphen-stripped minted code is neither `AFFILIATE` nor `STAFF`. `KAN001` — the existing
F-018 fixture — still classifies `STAFF`, because `0` and `1` are absent from the affiliate alphabet;
that case is why the guard could not simply reserve the `KAN` prefix.

**Endpoint:** `GET /v1/retailers/me/referral-code` — fetch-or-mint, idempotent (re-minting would break
every link already shared), reconciling a concurrent first request to the winner's code instead of
minting a second (`retailer_id` is unique, so one insert wins; the loser re-reads — the social
composer's `createOrReconcilePost` shape), and retrying on a `code` collision. `link` is **built, never
stored** — derived from `WEB_URL` + the code, so changing the base URL or landing path cannot go stale
per-retailer.

**Two decisions worth naming.** (i) The code is **not** the store slug, despite §4.3's example: the slug
is *mutable* (the §30 store-URL rename sync), so attribution stored against it would break on rename;
the code is its own immutable identifier and the *generation pattern* is what got reused. (ii) No
endpoint resolves a typed code to a shop. That is a code-enumeration oracle — 456,976 candidates is
minutes of requests, and the answer is a list of who is in the program. Resolution returns only inside
T4's server-side signup write.

**Verification:** API **1121/1121** (85 files, +43) · web **319/319** · `tsc --noEmit` clean ×3 ·
Biome clean on all changed `apps/api` files · `check-delete-guard.sh` + `check-route-size.sh` pass ·
**`apps/mobile` 0 files**. Guards falsified four ways, each hitting exactly its target: dropping the
aggregator `register()` call fails the wiring test (a passing route test would not have — the module
still registers fine on its own, which is precisely how RC-025 shipped a 404); removing the P2002
re-read fails 3 tests; making the namespace refine a no-op fails the 422 test; and making the hyphen
optional failed **nothing** until the missing assertion was added — see above.

**Not verified:** the screen is unit-tested, not visually checked in a browser — the repo's precedent
for admin pages (`suits-designs/__tests__/page.test.tsx`). The 10 tests do assert the rendered values
come from the API fixture (37% / 9mo / 45d / ₹123.45), so a hardcoded default would fail them.

---

## BUILT 2026-09-22 (later still) — RC-030 RLS half: the purge path's access to 50 RLS tables rested on an ownership accident

**Migration `111_backend_role_rls_policies` · `purge-rls-policy.test.ts` · opt-in `purge-rls-live.test.ts`**

### The finding that reframed the problem

The previous entry closed with "4 of the 7 new sweeps may affect 0 rows silently — a PII call to settle".
Settling it inverted the diagnosis. The question was whether the purge role bypasses RLS; the answer is
that it has no `BYPASSRLS` **and no policy either**, so it bypasses via `pg_class_ownercheck` —
`kanchuki_purge` is a member of `kanchuki_app`, and for any table `kanchuki_app` **owns**, Postgres
treats both as owners and skips RLS.

| Measured | Value |
|---|---|
| Tables with `ENABLE ROW LEVEL SECURITY` | **50** |
| Policies naming `kanchuki_app` or `kanchuki_purge` | **0** — every policy targets `authenticated` / `anon` (PostgREST) |
| Purge-path tables that are RLS-enabled | **23 of 32** (`products`, `customers`, `collections`, `retailers`, `subscriptions`, `staff`, `audit_logs`…) |
| Roles with `BYPASSRLS` | **0** — `ALTER ROLE … BYPASSRLS` appears nowhere |

So the four tables were never special, and "add a policy for the four" would have been a fix aimed at
the symptom. The backend's access to **all 50** tables depends on which role happened to run each
migration — an accident nobody documented, verified, or controlled. The honest statement is that the
30-day cron and the admin hard-delete have always worked *by luck*, and RC-030 is simply where it first
bit.

### Why a policy, and why `FOR ALL`

`ALTER ROLE … BYPASSRLS` needs superuser, so it could only ever be hand-applied in the SQL Editor and
could never ride `prisma migrate deploy` — **RC-029's failure exactly** (a fix that lives only in a
hand-run script). It would also silently cover future tables and leave no trace in the schema, which is
how this class hides. A per-table policy is ordinary DDL, applied by the deploy path.

`FOR ALL`, not `FOR DELETE`, is the trap this migration exists to avoid. `purgeTable()` selects a batch
of ids and breaks out of its loop when the batch is empty; `fetchR2Keys()` selects the R2 keys before
the rows go; `purgeChildren()` scopes its `DELETE` through `SELECT id FROM retailers`. Under a
`DELETE`-only policy **every one of those `SELECT`s still returns 0 rows**, so the sweep would keep
silently deleting nothing *while a policy sat there making it look fixed*. Phase B of the live test
executes precisely that non-fix and shows the row surviving it.

`USING (true)` is a filter, not a widening: the policy names only the two backend roles, it is
`PERMISSIVE` so it ORs with the `authenticated`/`anon` policies rather than replacing them, and RLS
cannot grant a privilege — `kanchuki_app` still has no `DELETE`, because the `REVOKE` in
`scripts/setup-role-separation.sql` is checked **before** RLS is consulted. The migration is guarded on
both roles existing and each table still existing (a `CREATE POLICY` naming a missing role is a hard
error that would abort `migrate deploy` in a brand-new environment, where migrations run before the
hand-run role script) and is idempotent, so a later teardown cannot break it.

### The two guards

`purge-rls-policy.test.ts` (static, runs in CI) re-derives the required set from `schema.prisma` + the
migration history + both job sources and fails if migration 111's array drifts in **either** direction
— a missing entry is a sweep that silently does nothing, a stale one is RC-029 returning. It also pins
`FOR ALL`, both role names and the two guards. It carries a floor on every derived set, so a broken
parse cannot make it pass vacuously; it pins the **unquoted**-identifier case (`DELETE FROM
ai_usage_logs` in the hard-delete job, which an earlier quoted-only regex silently dropped from the
required set); and it strips comments first, because both job files *discuss* dropped tables in prose.

`purge-rls-live.test.ts` is the executed proof, opt-in via `PURGE_RLS_TEST_DATABASE_URL` — no test in
this repo touches a real database, and this failure is **semantic**, so a static check cannot settle
it. It lifts the `CREATE POLICY` statement **out of the migration file** (so it cannot drift from what
will run) and, on scratch tables with real RLS and the real privilege split, shows per table: (A) no
policy → `SELECT` sees 0, `DELETE` affects 0, **no error**, row survives; (B) a `FOR DELETE` policy →
still 0 and 0, row survives; (C) migration 111's policy → sweep sees the row and it goes. A fifth case
proves the cron's `audit_logs` **insert** raises 42501 without a policy — a loud failure, unlike the
deletes, and a dependency on the same policy.

**Verification:** API **1132 passed / 5 skipped** (86 files + 1 skipped — the skip is this round's
opt-in live test) · web **319/319** (41 files) · `tsc --noEmit` clean ×3 · `biome check src/` clean on
every changed file · `check-delete-guard.sh` passes · **`apps/mobile` 0 files** · the static
guard **falsified seven ways**: drop `customer_interactions` from the array → missing + four-tables
checks; an invented `user_sessions` entry → the stale check; `FOR ALL`→`FOR DELETE` → the `FOR ALL`
check; drop `kanchuki_app` from the policy → the roles check; remove the role guard → the deploy-safety
check; unscope the idempotency check → the `schemaname` assertion; and a second `CREATE POLICY` earlier
in the file → the "exactly one DDL to lift" check **plus** the two assertions that read the DDL, which
is the pointed lesson: those two did not catch the drift on their own, they failed only because they
were now reading the wrong statement. Files restored byte-clean after each. The live test's
extraction regex was verified to yield the real DDL, so a bad parse cannot make the owner's first live
run fail for the wrong reason.

**One pre-existing test flake fixed rather than re-reported** (`retired-tryon-guard.test.ts`, flagged
last session as "passes standalone, occasionally flakes in the full suite"). This time it failed the
suite outright with `Test timed out in 5000ms` — and the cause is real, not environmental noise:
`loadSources()` re-walked `apps` + `packages` + `scripts` and re-read every code file **on every call**,
and several tests call it. Standalone the whole file runs in ~0.5s and it passed 3/3; under 87 parallel
files the first synchronous walk exceeds the 5s default. Two lines: the walk is now memoised (nothing
in the scan mutates the result and the files cannot change mid-run) and that one test carries an
explicit 30s budget, budgeted for contention rather than because the walk is slow. No assertion was
weakened — the file is 8/8 before and after, and the suite went green.

**Not done / owner-side:** migration **111 is not applied** (admin dashboard, per CLAUDE.md) · the live
test has **never been executed** — no local Postgres, no DB harness, no docker-compose in this repo, so
it is committed as opt-in and is the owner's first run · `scripts/setup-role-separation.sql` was **not**
changed for the policies (they belong in the migration; the script keeps the ownership note pointing at
it) · the 26 other RLS-enabled tables still rely on the ownership accident — out of scope only because
nothing in the purge path touches them.

## BUILT 2026-09-22 (T4) — Affiliate referral capture at signup, riding the field F-018 already owns

> **Superseded in part, same day:** **T5** landed later (see §2026-09-22 (T5) at the foot of this
> file), so the "T5–T10 are untouched" status below describes *this* section's session. **T6–T10
> remain unbuilt — nothing pays out yet.**

Spec: `docs/tasks/referral-program-retailer-affiliate.md` §7 T4. Turns a code a signing-up retailer
entered into a `pending` `ReferralConversion`, and gives the referred store its side of the deal.
**T5–T10 were untouched at this point, so nothing paid out yet** — T4 records a conversion and no code
consumed it. *(T5 landed later the same day — see the foot of this file.)*

**`apps/mobile` and customer web: 0 files changed.** The Play Console review in flight is unaffected.

| File | Change |
|---|---|
| `apps/api/src/lib/referral-conversions.ts` | **new** — `applyReferralCapture()`, `addCalendarMonths()`, the four guards, the reward application |
| `apps/api/src/lib/referral-settings.ts` | **new** — one reader for the `referral_settings` singleton (extracted from `admin-referral.ts`, which becomes its second consumer) |
| `apps/api/src/routes/retailers/retailers-profile.ts` | the capture hooked into `PUT /me`, after the update, non-fatal |
| `apps/api/src/routes/admin/admin-referral.ts` | `FLAT_DISCOUNT` refused by name (`UNIMPLEMENTED_BONUS_TYPES`); `BONUS_TYPES` narrowed and exported |
| `apps/web/src/app/admin/referral-settings/page.tsx` | `FLAT_DISCOUNT` no longer selectable; a legacy row holding it still **renders** it, disabled and labelled |
| `referral-conversions.test.ts` · `referral-settings.test.ts` · `retailers-profile.test.ts` | **new** — 32 + 3 + 8 tests |
| `admin-referral.test.ts` | +4 — the schema-derived enum guard |
| `.../referral-settings/__tests__/page.test.tsx` | +2 — the narrowing, and the legacy row it must still show |

### The capture point already existed, which is the whole reason there is no mobile change

`UpdateRetailerSchema.referral_code` is **F-018's** self-serve salesperson code, and the route already
resolves it against `TeamMember` → `onboarded_by_id`. So an affiliate code typed into the existing
"Referral Code (Optional)" onboarding field has been **arriving at the API and being silently dropped**
since F-018 shipped. T4 adds a second, shape-decided destination to a value that already travels — no
client change, no new endpoint, no second link. The field maximises the surface a bad build could spoil
(one field, one save) and minimises the client work, which is exactly the trade the Play review needs.

**Three things research changed about the spec's T4, all decided with the owner before coding:**

1. **The `?ref=` cookie was NOT built.** There is no retailer signup/onboarding form on the web — every
   `shop_name` match is an admin or shopper page — so the link's CTA leaves for the app and a cookie
   would have been a hook with no consumer that reads it. **RC-025's exact shape**, and the second time
   this spec has avoided it (§0 records the first, at T3). Manual code entry is the mechanism that
   completes today; the cookie is a follow-up **only if** a web signup ever exists.
2. **Self-referral checks phone + GSTIN, not bank account.** The spec asks for "same
   GSTIN/phone/bank account" and `Retailer` has **no bank-account column**. The missing third check is
   stated in the code, the spec and here rather than implied to exist.
3. **`FLAT_DISCOUNT` removed from the settings.** T2 had made it selectable from day one, and nothing
   in this repo discounts a Razorpay charge or a GST invoice — so choosing it stored a term that never
   reaches the store. **RC-027 one layer up** (a config value the code silently drops). Now: the API
   refuses it with a message naming the reason, the admin screen stops offering it (while still
   rendering a legacy row that holds it — a `<select>` with no matching `<option>` renders blank, which
   would hide the stored term from the operator), and a test derives the full PostgreSQL enum from
   `schema.prisma` and fails if a member is neither implemented nor listed as unimplemented.

### Four guards, one per way the program could pay the wrong actor

| Guard | Mechanism, not just the outcome |
|---|---|
| **Shape decides the ledger** | A staff code returns `NOT_AFFILIATE` and the affiliate table is **never queried** — asserted on `referralCode.findUnique` not having been called, because a status assertion passes even if the lookup happened and lost a race to the right answer. A hyphen-dropped `KAN7F3QMP` is `INVALID_CODE`, never looked up: it is staff-shaped too, so a lookup-order implementation would quietly search the wrong table first. |
| **Self-referral** | By id, phone, or case/whitespace-insensitive GSTIN. Two **blank** GSTINs are *not* the same shop — `gstin` is nullable and a blank is legitimate for an unregistered store, so without that check every unregistered store is "the same shop". Refused silently to the client (a referral code is one field of a general save, and throwing would block a shop saving its own name over a code it can remove) but **audited**, unlike a typo — an abuse attempt and a mistyped code must not look the same in the data. |
| **One attribution, staff wins** | A shop a marketing agent already onboarded (`onboarded_by_id` set) never also becomes an affiliate conversion. Owner decision. |
| **Idempotency** | `referred_id` is UNIQUE and that constraint *is* the gate — not a `findFirst` check, which loses to a concurrent double-submit. `P2002` is the idempotent success case, and the reward is applied **inside the transaction that failed**, so neither a conversion without its bonus nor a bonus twice is reachable. |

`addCalendarMonths()` is calendar months, not `days * 30`, and moves to the 1st before setting the
month: `Jan 31 + 1 month` naively lands on **Mar 3**, silently granting a month and two days. It never
extends from a lapsed trial — the bonus is worth the same applied on day 1 or day 20, so the base is
whichever is later.

### RC-032 — a defect in T4, found and fixed before it was committed

The route comment promised "a referral problem never fails the profile save"; `applyReferralCapture()`
**throws by design** (a captured-then-lost referral is a referrer never paid) and the call site was a
bare `await` with no `catch`. Since migrations are applied **by hand from the admin dashboard** while
code deploys **on push**, there was a window in which any retailer typing a referral code during
onboarding would have got a **500 on the profile save and been blocked from finishing**. Every check
was green: `prisma.referralCode` typechecks (the schema declares the table), a mocked client passes,
and a 500 on the profile save reads as a validation bug. The fix holds both halves at once — the route
catches, logs the underlying error, and reports `CAPTURE_FAILED` **as data**: non-fatal *and* not
silent, because swallowing it would convert a visible outage into an invisible lost referral.

**Verification:** API **1180 passed / 5 skipped** (89 files, +47 tests; the skips are the opt-in RLS
live test) · web **321/321** (41 files, +2) · `tsc --noEmit` clean ×3 · `biome check` clean on all 8
changed `apps/api` files · `next lint` clean · `check-delete-guard.sh` passes · **`apps/mobile` 0
files** · **guard falsified seven ways**, each failing for the right reason with the offending value
named: add `CREDIT_NOTE` to the enum → `expected [ 'CREDIT_NOTE' ] to deeply equal []`; drop
`FLAT_DISCOUNT` from the refusal list → both the unhandled-member check and the route's
`/not available/` message check; rename it to a stale key → the stale-entry check too; make
`FLAT_DISCOUNT` selectable again → the web select check; restore `throw error` in the route's catch →
`expected 500 to be 200`; drop the one-attribution check → `expected 'RECORDED' to be
'ALREADY_ATTRIBUTED'` in both the lib and route suites; add a fallback constant to the settings loader
→ `expected "spy" to be called with arguments: [ { data: {} } ]`. Files restored byte-clean after each.

**Two test-side corrections of my own, both from mocking rather than from the product:** the first
`addCalendarMonths` cases pinned the evaluation instant *after* the date being extended, so the
documented "count from now" rule correctly applied and my expectations were wrong; and the route test's
first fake DB returned fixed objects regardless of the writes, which made the post-bonus assertion
untestable and the `data` assertions lie. Fixed by making the fake stateful. One **product** correction
came out of the same failure: `applyReferralCapture` accepted an injected `now` for `qualifies_at` while
the bonus read wall-clock time, so one transaction contained two different referral moments — the bonus
then became the only part of the operation a caller could not pin. `now` is now threaded through.

**Not done / owner-side:** migrations **109, 110 and 111 are still not applied** (admin dashboard) ·
**T6–T10 unbuilt — no affiliate link earns anything yet**, stated in the spec, PRO-REQUIREMENTS and
CLAUDE.md rather than left to the endpoint's existence to imply *(T5 landed later the same day — see the
foot of this file)* · the `?ref=` cookie capture (only
meaningful once a web signup exists) · the super-admin path-list gap for
`/v1/admin/referral-settings` (pre-existing, shared with `/v1/admin/commission`; T2 matched its sibling
rather than diverging).

---

## BUILT 2026-09-22 (T5) — Referral qualification cron: `pending` → `qualified` / `clawed_back`

Spec: `docs/tasks/referral-program-retailer-affiliate.md` §7 T5. **T6–T10 are still unbuilt, so this
job still earns nobody anything** — it moves a conversion into the state T6 will accrue from, and no
code consumes that state yet. **`apps/mobile`: 0 files.**

| File | What it is |
|---|---|
| `apps/api/src/jobs/referral-qualify.ts` (new) | `handleReferralQualify()` + the pure `decideQualification()` gate |
| `apps/api/src/jobs/referral-qualify.test.ts` (new) | 24 cases: the gate's whole branch table, the CAS write payload, per-row isolation, one-query paid lookup, cron wiring |
| `apps/api/src/jobs/index.ts` | worker `case 'referral-qualify'` + repeat `0 2 * * *` on the maintenance queue |

### The day count is deliberately NOT in this job

`qualifies_at` is stamped at **signup** by T4 from `qualify_days`, and the schema says exactly that
("computed at signup by T4 and enforced nightly by T5"). So the spec's requirement — *read the window
from settings, not a literal `30`* — is satisfied one layer up, and re-deriving it here would create a
second answer to "when is this due?". The consequence is recorded rather than hidden: an admin editing
`qualify_days` affects conversions created **after** the edit, because `qualifies_at` is the record of
the terms in effect when the referral happened — the same snapshot discipline as
`commission_base_amount`. A **source-scan guard** (with comments stripped, because the file's own
header explains the rule it enforces) fails if T5 ever gains a `qualify_days` reference or imports the
settings loader.

### The gate — "paid + active for the window", literally

| Condition | Outcome |
|---|---|
| `Retailer.deleted_at` set | `CLAWED_BACK` · `REFERRED_DELETED` |
| no `SubscriptionPayment` with `status = 'success'` | stays `PENDING` · `NOT_PAID` |
| `Retailer.is_suspended` | stays `PENDING` · `SUSPENDED` |
| payment **and** an `ACTIVE` subscription **and** active store | **`QUALIFIED`** |
| payment, no `ACTIVE`, but a `CANCELLED` subscription | `CLAWED_BACK` · `REFERRED_CHURNED_AFTER_PAYMENT` |
| payment, `PAST_DUE` only | stays `PENDING` · `PAST_DUE_REVIEW` |

**Two orderings are load-bearing and each has a test that fails if it is swapped.** The terminal check
precedes the never-paid check, so a soft-deleted store is clawed back instead of being re-scanned
forever; and the never-paid check precedes the churn branch, so a store that abandoned a **free trial**
lands in `PENDING` rather than in an irreversible `CLAWED_BACK` — there is no value to claw back, and if
it resubscribes inside its window the referrer is still paid.

**Two deliberate non-clawbacks.** `is_suspended` and `PAST_DUE` stay `PENDING`, because both are
**recoverable** — F-015 ships an unsuspend, and dunning has card retries — while `CLAWED_BACK` is
**irreversible** (the CHECK permits no documented reverse transition). Writing an irreversible status
from a reversible state would let an admin's temporary suspension end a referral permanently. The cost
is that a store which never pays leaves its conversion `PENDING` indefinitely; nothing accrues and
nothing is owed, so it is inert — and it is **counted** in the run summary rather than left invisible.

### What it writes, and the two fields it must never write

`commission_base_amount` ← `Subscription.amount_inr` of the newest `ACTIVE` subscription. That column is
**paise** per the schema, the same unit as this one — there is deliberately no `* 100`, which is the
mistake that would multiply every payout by 100 without failing anything. `qualified_at` /
`clawed_back_at` are written here and nowhere else.

- **Not `paid_at`.** It is the date the *referrer was paid out* (T7), not the date the referred store
  paid us, and the DB CHECK forbids it on a `QUALIFIED` row. The column name invites precisely the wrong
  write and the constraint is the only place that says so — so the test asserts the key's **absence**
  from the payload.
- **Not `commission_accrued`.** T6's column, per the schema (*"written by T6"*).

### Idempotency is a compare-and-swap, not a read-then-write

Every transition is `updateMany` with `status: 'PENDING'` in the `WHERE`, inside the same transaction as
its audit row. Two overlapping runs — or the nightly cron plus a manual trigger — cannot both move a
row; the loser sees `count: 0` and is reported as `raced`, not as an error. A read-then-write version
passes every single-threaded test and double-transitions in production. Failures are isolated per row,
so one broken store cannot abandon the night's remaining work (counted **and** logged, because a silent
error here is a referral that quietly never qualifies). Paid status is resolved in **one** grouped query
per page rather than one per candidate.

### RC-033 — a pre-existing billing collapse that T5's clawback now rests on

`billing-webhook.ts` maps **both** `subscription.cancelled` **and** `subscription.completed` to
`status: 'CANCELLED'` — so *"finished its paid term"* and *"churned"* are the same row, and the same
statement stamps `cancelled_at` and nulls `razorpay_subscription_id`, destroying the evidence of which
event actually arrived. T5 is the first consumer to make a **consequential** decision on `CANCELLED`.

The T5 decision **stays correct**: the gate is sustained paid **and** active *through* the window, and a
completed subscription is not active, so `CLAWED_BACK` is right either way. What is lost is the audit
distinction. The fix is a schema change plus a webhook remap plus a backfill — i.e. **billing**, the
revenue path — so it is **recorded and deferred**, not silently patched from inside a referrals task.

### Refunds still have no data source

Nothing in this repo ever writes `SubscriptionPayment.status = 'refunded'`. T5 therefore implements the
**churn half only** of the spec's clawback; the refund half is not built. A refund check reading a value
nothing produces is a guard that can never fire.

### Verification

API **1204/1204** (91 files, +24) · web **321/321** · `tsc --noEmit` clean ×3 · Biome clean on all 3
changed files · `check-delete-guard.sh` passes · **`apps/mobile`: 0 files**.

**Guard falsified nine ways**, each restored byte-clean afterwards: drop `status: 'PENDING'` from the
CAS `WHERE` → the CAS test; add `paid_at: now` → the never-write-`paid_at` test; add
`commission_accrued` → the same test; `amount_inr * 100` → 3 tests; let the never-paid gate win over the
terminal one → 2 tests; let the churn branch fire without a payment → the never-paid-cancellation test;
`throw error` instead of `errors++` → the per-row isolation test; remove the worker `case` → the wiring
test; remove the cron `add` → the scheduling test.

**Two test-side corrections of my own:** the reachability assertion's expected array was in the wrong
sort order (`'T' < '_'`, so `NOT_PAID` precedes `NO_ACTIVE_SUBSCRIPTION`), and the source-scan guard
tripped on the job's own header comment explaining the rule it checks — fixed by stripping comments
before scanning, since the correct fix is never to delete the explanation.

**Three unrelated suites failed the first full run and passed the second** (`auth-otp-bypass`,
`retailers-whatsapp-catalog`, `discover-stores`) — all three pass in isolation, so they are the
load-sensitive flake class, not this change. Run 2 was 1204/1204. (Not fixed here: it is a test-infra
issue, distinct from the `retired-tryon-guard` timeout flake fixed earlier the same day.)

**Not done / owner-side:** migrations **109, 110, 111 still not applied** · **T6–T10 unbuilt — no
affiliate link earns anything yet**, stated here, in the spec, PRO-REQUIREMENTS and CLAUDE.md rather
than left to the job's existence to imply · RC-033's billing fix · the refund half of the clawback · the
super-admin path-list gap for `/v1/admin/referral-settings`.

---

## 2026-09-23 — Admin access boundary: three drifted lists → one shared, derivation-guarded list (RC-034) + a stale bench assertion (RC-035)

**Commit:** *(this session)* · **RC-034**, **RC-035** · Zero `apps/mobile` files.

### What was actually open

The rule "this admin surface needs Super Admin" existed in three hand-maintained
places that nobody had ever compared:

| Surface | List | Enforced? |
|---|---|---|
| `apps/api/src/routes/admin-auth.ts` | 8 segments | **yes** — the only boundary |
| `apps/web/src/app/admin/layout.tsx` | 14 prefixes | page access only |
| `apps/web/src/app/admin/components/Sidebar.tsx` | 14 entries | cosmetic |

Measured: **eight** surfaces the web UI hides were reachable by a plain ADMIN key —
`commission` (the 3% payout ledger), `addon-purchases`, `ai-usage`, `audit-log`,
`plan-features`, `plan-limits`, `resource-packs`, `storage-report` — plus
`referral-settings`, which was in the Sidebar *only*, so it was hidden from the nav yet
both directly navigable **and** callable. `plan-pricing` (what every retailer is charged),
`invoices` (tax documents) and `database/deletion-vault` (hard-deletes retailer/customer
data) were in **no list at all**. `payments` was in the API list while matching no route,
so it protected nothing.

The enforcement failed **open**: `path.startsWith(...)` against a fixed set means a route
nobody remembered to add is *reachable*, not *refused*. No error, no log — the surface is
simply open. Adding an admin route was a security decision that defaulted to "public".

And it was invisible from any single file: the panel *looked* correct, because the Sidebar
hid those entries and the layout rendered "Access Restricted". Only the API enforced
anything, and only for its eight segments.

### Why the fix is a shared list **and** a guard

One list now backs all three surfaces (`packages/shared/src/constants/admin-access.ts`), so a
surface is protected everywhere by construction instead of in whichever places somebody
edited. Matching is on the whole first path segment after `/admin/`, never a bare
`startsWith` — otherwise `/admin/commission-x` matches `commission` — and query strings,
hashes and case are normalised, so `/v1/admin/COMMISSION?x=1` cannot slip past.

But a shared list only fixes today's holes. Because the runtime check fails open **by
design**, the property that matters — *every registered admin route has been classified* —
cannot live in runtime code. It lives in `apps/api/src/routes/admin-access.test.ts`, which
**derives** the segment set from the route and page sources and fails until each one is
classified as super-admin-only or standard-admin. Adding an admin route now forces a
decision instead of silently defaulting to public.

Two design details carried the weight:

- **Everything is classified, including the permitted.** `STANDARD_ADMIN_ADMIN_SEGMENTS`
is not decoration: without it the guard can only ask "is this sensitive?" — an open-ended
question whose lazy answer is "no". With both lists present the question becomes "which of
these two is it?", and the failure names the segment nobody decided about.
- **Failures point at the source.** The derivation maps each segment to the file that
declares it, so the error says ``alerts  ←  apps/api/src/routes/admin-settings/notifications.ts``
rather than just naming a string.

### The dead entries, and why they were dead

Six entries protected nothing, and the reason is worth recording: **those files are named
after the feature, but the first path segment is the parent prefix.**

| Entry | Real routes | Actual first segment |
|---|---|---|
| `theme` | `/settings/theme` | `settings` |
| `catalog-promo` | `/settings/catalog-upload-promo` | `settings` |
| `rate-limits` | `/settings/rate-limits` | `settings` |
| `notifications` | `/settings/notifications` | `settings` |
| `ticket-reporting` | `/reporting/tickets` | `reporting` |

`settings` was already in the list, so four of them were redundant rather than harmful —
but a list keyed on filenames is a list that cannot be verified by reading it, which is the
same defect one level down. The guard's **dead-entry assertion** is what keeps this from
recurring: if a surface returns later, the completeness assertions force a fresh decision.

### Verification

- `admin-access.test.ts` **11/11**, falsified three ways, each isolated:
  - removing a gated entry (`referral-settings`) → failed, naming the path;
  - adding a new admin route file (`/falsify-probe`) → failed, naming the file;
  - reintroducing the old `startsWith` semantics → failed the sibling assertion
    (`/admin/commission-x` must **not** match `commission`).
- **API 1215/1215**, **web 321/321**, `tsc` clean in `apps/api` + `apps/web` + `packages/shared`,
  F-017 delete-guard passed.
- The 12 Biome errors reported on the changed files are the **Windows checkout artifact**
  (`* text=auto eol=lf`): all staged blobs measure **0 CR**, so the commit is LF and CI-clean.
- `apps/mobile`: **0 files**.

### RC-035 — found while running the gates, not part of this change

A fresh `@kanchuki/shared` build turned the web suite red on
`studioEngineCost('grok_imagine')`: the test asserted `null` while the committed table says
`usd: 0.04`. It had been **green because `packages/shared/dist` is gitignored and stale** — the
test was resolving `@kanchuki/shared` to an older table than the source. The rule under test
("an unverified price never becomes a number") was correct; the *example* had gone stale. The
assertion now names engines that are `usd: null` today (`vton_kontext`, `vton_gemini`), so it
tests the property rather than one row. Recorded as RC-035 rather than fixed silently, because
the class — *an assertion pinned to a mutable data row, masked by a build artifact* — is the
kind that returns.

### Flagged, not decided

> **→ Superseded 2026-09-24** — both of the entries below were locked down; see
> [§2026-09-24](#2026-09-24--rc-034-follow-up-team-members--reports-locked-to-super-admin) at the foot
> of this file. Kept verbatim as the record of what was decided at the time.

Two segments are classified standard-admin, matching their **pre-change reachability**, with an
in-file note and the one-line change to lock them down:

- **`team-members`** — staff/sales-team account management (invite + edit members; via
  `/v1/team/*`, not `/v1/admin/*`). Credential-adjacent, so it is worth an owner's eye.
- **`reports`** — `/admin/reports/gst` is tax data, but its only fetches are `/v1/admin/gst/*`,
  and `gst` **is** gated, so a standard admin sees an empty report rather than the figures.

### Still open (owner-side)

- **Migrations `109`/`110`/`111` not applied** (admin dashboard) — the referral tables and the
  RLS policies do not exist in prod until they are.
- **The opt-in `purge-rls-live.test.ts` has still never executed** — no test in this repo touches
  a real database, and RLS denies by *filtering*, so a broken policy and a working one pass every
  static check. This is the one claim in the referral feature resting on reasoning, not measurement.
- **Why the gap existed at all is still open:** the Segment RC-034 list is now exhaustive by
  construction, but the same "three lists" pattern may exist for other cross-surface rules.
  Treat any rule duplicated per-surface as a candidate.

---

## 2026-09-23 (later) — T6: referral commission accrual — monthly installments, owner money decisions recorded, ledger made self-auditing

**Commit:** *(this session)* · **Zero `apps/mobile` files** · Spec §7 T6 (`docs/tasks/referral-program-retailer-affiliate.md`).

### What shipped

- **Migration `112_referral_accrual_columns`** (not applied): three T6-owned columns on
  `referral_conversions` — `commission_monthly_paise` (frozen per-installment amount),
  `accrued_months` (installments EARNED), `accrued_through_period` (last earned month, the
  idempotency cursor) — plus four CHECK constraints that make the ledger self-auditing:
  `accrued_months = 0` ⟺ no cursor ⟺ no frozen amount; PENDING rows can never accrue;
  and `commission_accrued = accrued_months × commission_monthly_paise`, so if the job ever
  writes the three inconsistently the UPDATE fails rather than the ledger lying quietly.
- **`apps/api/src/jobs/referral-accrue.ts`** — the accrual job, registered as
  `referral-accrue` on the maintenance queue, daily **`15 2 * * *`** (after T5's 02:00
  qualification, before the 02:30 backfill). Pure decision function (`decideAccrual`,
  exported like T5's) + compare-and-swap writes with the audit row in the same transaction.
- **`schema.prisma`** — the three columns documented on `ReferralConversion` with the
  writer map extended.

### The four owner money decisions (2026-09-23 — none were in the spec text; asked before coding)

1. **Base = T5's qualification snapshot.** `commission_base_amount` is never re-read; a
   mid-cycle plan change moves nothing.
2. **Monthly, on the same daily cron.** One installment per IST calendar month (the §42
   Commission Tracker business calendar).
3. **Only paid months earn.** An installment accrues only for a month with ≥1 successful
   `SubscriptionPayment`. An unpaid month is **skipped, never clawed back** — the same
   installment number stays available for the next paying month — and the program runs
   until `duration_months` installments have **earned**, regardless of wall-time. The
   anchor for month 1 is the store's **first successful payment**: trial months are not
   month 1 (the owner's rule — "after the trial the retailer starts paying us, then we
   pay the referrer; if the retailer stops paying, no payment to the referral account").
4. **The monthly amount freezes at first earn** (`base × commission_pct`, snapshotted).
   An admin editing `commission_pct` cannot reprice earned months in either direction.

### Design: why columns, not a parallel ledger table

The spec said "copy the §42 ledger pattern — parallel table". §42 stores only mutating
expense rows because its monthly figure is computed on the fly; here every conversion
already carries its own accrual, so the monthly rollup **is** the row — a second table
would have been a duplicate of `commission_accrued` needing its own reconciliation. The
pattern worth copying was §42's **IST period semantics**, not its storage.

### Mechanics worth knowing

- The walk starts after the last earned month (or at the first payment month) and moves
  forward one calendar month at a time; a paid month EARNs, an unpaid month is walked past
  without consuming the installment.
- A month only earns once it has **fully ended** (IST) — nobody can know a running
  month's payment picture.
- At most **one** installment per conversion per run — a backlog drains over successive
  nights instead of bursting in one run.
- A 60-consecutive-unpaid-month ceiling parks genuinely dead referrals so the nightly
  walk stays bounded; the counter is per-run and re-arms if the store ever pays again.
- **PAID rows keep accruing** — a payout settles part of the ledger, it does not end the
  program (examining QUALIFIED rows only would pay a 12-month program exactly once).
  For the same reason this job never touches `paid_at`: on a PAID row that timestamp is
  the referrer's payout history, not the accrual timeline.
- Writes are compare-and-swap — `status` + `accrued_months` + `accrued_through_period`
  all in the WHERE, audit row (`REFERRAL_COMMISSION_ACCRUED`) in the same transaction —
  so overlapping runs cannot double-credit and a failed audit rolls the credit back.
- A QUALIFIED/PAID row whose store has no successful payment is a data-integrity throw
  (unreachable through T5's gate), not a silent DONE; the settings singleton missing is a
  loud error naming migration 109, not a hardcoded fallback (RC-027 rule: no silent
  defaults, no code constants).

### Verification

- `referral-accrue.test.ts` **29/29**: full-payload `toEqual` (any extra field — `paid_at`,
  `payout_id`, `commission_base_amount` — turns red), CAS-WHERE assertion, audit-in-
  transaction, IST boundary arithmetic (18:29:59Z is still August), freeze both directions,
  every decision branch, one-installment-per-run, settings read at call time, missing
  singleton fails loudly, cron-wiring source scans (registration + `15 2` ordering +
  `paid_at`-never-written + never re-deriving the base from the subscription).
- **Falsified 6 ways, each caught for the right reason:** (1) cursor dropped from the CAS
  WHERE → the WHERE assertion failed; (2) walk restarting at the first payment month → 4
  cursor tests failed; (3) freeze removed → the reprice test failed; (4) audit moved
  outside the transaction → 4 tests including the tx-scoped audit assertion; (5) `paid_at`
  sneaked into the payload → 6 tests incl. the source scan; (6) hardcoded settings
  fallback → the missing-singleton test failed. (One falsification attempt was itself
  vacuous — adding a comment after `return true` — and was replaced by moving the audit
  genuinely outside the transaction; a falsification that changes nothing proves nothing.)
- Full API suite **1244/1249** (5 pre-existing skips) · API + web `tsc` clean · Biome clean
  on all touched files · `@kanchuki/shared` rebuilt (no source change; RC-035 hygiene).

### Still open (owner-side)

- Migrations **109/110/111/112 not applied** (admin dashboard) — T6's columns and CHECKs
  do not exist in prod until 112 lands, and nothing runs until 109 does. Apply 112 **with**
  the referral batch.
- **T7–T10 unbuilt — still nothing pays out.** T6 grows the ledger; T7 (RazorpayX)
  settles it.

## 2026-09-23 (later) — F-038 T7: RazorpayX payout job + webhook + self-serve payout accounts

| What | Detail |
|---|---|
| Feature | T7 of the Retailer Affiliate Referral Program (`docs/tasks/referral-program-retailer-affiliate.md` §7 T7) — the first task that actually pays a referrer. Owner decisions recorded before coding (spec §7 T7): (1) self-serve Bank/UPI entry by retailers; (2) UPI = VPA fund account (explained to owner); (3) TDS/GST admin-configurable, defaults OFF until the CA conversation; (4) monthly cadence anchored on the **30th** (cron `30 2 30 * *` — February carries to March 30). |
| Migrations | **113_referral_payout_accounts** — one row per retailer (unique `retailer_id`), RazorpayX identifiers only (`contact_id`, `fund_account_id`, type, masked display); raw bank/UPI details never persisted; CHECKs force a details/type pairing and an active row to carry a fund account; `GRANT DELETE` to `kanchuki_purge`; no RLS enabled (schema-owned, backend-only writes) so no policy owed. **114_referral_tax_columns** — `tds_enabled`/`tds_pct`/`gst_applicable`/`gst_pct` on `referral_settings` (defaults OFF), `tds_paise` on `referral_payouts` (default 0). **Both not applied** (admin dashboard, with 109–112). |
| Payout client | `apps/api/src/lib/razorpayx.ts` — Contacts, Fund Accounts (VPA + bank_account), Payouts. Basic auth from `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` (RazorpayX uses the same keys as Razorpay Payments on the standard account). Every call bounded by an explicit AbortSignal timeout (RC-011), failures sanitized via `failureReasonFrom` (≤500 chars, non-Error throws become a generic line). Payouts always send `X-Payout-Idempotency` (RazorpayX made it mandatory 2025-03-15) with the **stored** claim key — same key + same body returns the original payout, never a second one. |
| Settlement | `apps/api/src/lib/referral-payout-settle.ts` — `settlePayout(payoutRowId, mappedStatus, failureReason?)` is the **single settlement path**: imported by both the job's reconciliation step and the webhook route. PAID → CAS `updateMany` stamps `paid_at` + `PAID` ONLY on conversions still attached to that batch; FAILED/REVERSED → release the claim (`payout_id → NULL`) so the money re-pools next run. `paid_at` still has exactly ONE writer in the codebase (source-scanned). |
| Job | `apps/api/src/jobs/referral-payout.ts` — cron `30 2 30 * *`, registered `referral-payout` in the maintenance switch. Per run: (1) re-submit crashed PENDING rows with the same idempotency key; (2) reconcile in-flight batches by fetching their RazorpayX state; (3) per referrer compute `unsettled = Σ commission_accrued − Σ payouts(PENDING/PROCESSING/PAID)` — FAILED/REVERSED excluded so their claim auto-releases; (4) gate on `payout_min_amount` + a live payout account; (5) CLAIM in one transaction — create `referral_payouts` PENDING with a **pre-generated** key (`refpo-` + `crypto.randomBytes(12)` → 30 chars, within RazorpayX's 40 cap; a create-then-update placeholder would collide on the UNIQUE `idempotency_key` under overlapping claims) + CAS-attach QUALIFIED/PAID conversions with `payout_id IS NULL` + audit row; (6) SUBMIT outside the transaction — a failed submit settles FAILED so money is never stranded in PENDING. TDS: RazorpayX receives **net = gross − TDS**; `amount_paise` stays gross and `tds_paise` snapshots, so withheld tax can never be re-paid next cycle. MANUAL cadence skips the cron (T9's future admin trigger pays on demand). |
| Webhook | `apps/api/src/routes/webhooks/razorpayx-payout.ts` — `POST /v1/public/webhooks/razorpayx-payout`, no JWT, HMAC signature against its **own** `RAZORPAYX_WEBHOOK_SECRET` (sharing the payments webhook secret would couple rotation), replay-window guard, duplicate deliveries tolerated (settlement is idempotent by CAS). processed→PAID, failed/rejected/canceled→FAILED, reversed→REVERSED; an unrecognized status is logged and ignored — never guessed with money. Registered in `apps/api/src/index.ts`. |
| Retailer routes | `apps/api/src/routes/retailers/retailers-payout-account.ts` — `GET/PUT /v1/retailers/me/payout-account` (UPI/VPA or bank). PUT creates the RazorpayX Contact + Fund Account at save time and persists only ids + masked display. Registered in the retailers barrel + aggregator. Form UI is T8 (Play-review-gated); T9 admin entry is the interim path. **Zero `apps/mobile` files.** |
| Purge sweep | `referral_payout_accounts` added to BOTH purge jobs before `DELETE FROM retailers` (RC-030 discipline); migration 113 grants `kanchuki_purge` DELETE. `purge-rls-policy.test.ts` derivation still passes (table has no RLS, no policy owed). |
| Tests | `apps/api/src/jobs/referral-payout.test.ts` **49/49** — branch tables (unsettled math, TDS netting, min-amount gate, MANUAL skip, status mapping incl. unrecognized→null), mechanism assertions (conversions stay QUALIFIED until the webhook; claim WHERE is a CAS; net = gross − tds), webhook handler coverage, source scans (cron on the 30th; `settlePayout` imported not redefined; `paid_at` one writer; webhook registered with `/v1`). **Every new guard falsified — 7 falsifications, each caught for the right reason.** Full API suite **1293 passed / 5 skipped**; tsc clean; Biome clean. |
| Still open | Migrations 109–114 not applied (owner, admin dashboard). RazorpayX account/keys + `RAZORPAYX_WEBHOOK_SECRET` not provisioned (owner). T8 mobile (Play-review-gated), T9 admin monitoring (also the interim payout-account entry), T10 final checklist. |

## 2026-09-23 (later) — T9 Admin Referral Monitoring + shared payout-account save path

**Feature:** F-038 Retailer Affiliate Referral Program, task T9 (`docs/tasks/referral-program-retailer-affiliate.md` §7). Zero `apps/mobile` files (Play-review constraint holds — 8 tasks, still not one mobile file).

| Piece | Detail |
|---|---|
| **Admin API** | `routes/admin/admin-referral-monitor.ts`, mounted at `/v1/admin/referral/*`, registered in **both** the barrel and `admin.ts` (RC-025): `GET overview` (program totals), `GET leaderboard` (per-referrer conversions + accrued/paid-out/unsettled), `GET export` (CSV, §42 pattern), `POST payout/trigger` → `handleReferralPayout('manual')` (the MANUAL-cadence path; the `30 2 30 * *` cron untouched), `POST conversions/:id/clawback` (CAS-WHERE on `CLAWBACK_ELIGIBLE_STATUSES` **imported from T5's module** — one set, no drift; refuses PAID so money can't leave twice; in-tx audit row), `GET retailers/:id/conversions` (detail drawer), `GET/PUT retailers/:id/payout-account` (admin interim entry until T8's form). |
| **Shared save path** | The payout-account save logic was **extracted** from the retailer route into `lib/referral-payout-account-save.ts`; both the retailer self-serve route and the admin route call it, so RazorpayX Contact/Fund-Account creation and masking cannot diverge between the two callers. |
| **Access** | `referral` classified **super-admin-only** in `packages/shared/src/constants/admin-access.ts` (money + irreversible clawback, same tier as `commission`/`referral-settings`); RC-034's derivation test now demands the classification; `@kanchuki/shared` rebuilt (RC-035 discipline). Web: `apps/web/src/app/admin/referral/page.tsx` + Sidebar entry. |
| **Caught mid-build** | Draft bug: the leaderboard passed `payout_id === null`-filtered conversions into `computeUnsettledPaise`, which **double-subtracts claimed money** — claimed conversions cancel out on both sides of the accrued−committed identity, so the job passes the full set. Fixed to pass the full set; pinned by a mechanism test. |
| **Falsification** | 5 falsifications, each caught for the right reason — and **F5 exposed a vacuous guard live**: restating the unsettled formula inline was behaviorally equivalent today and the scan regex didn't match the restated shape. The guard was strengthened (uniqueness assert of `computeUnsettledPaise` + brace-depth `.reduce` token check on the unsettled line) and re-falsified to red before restore. |
| **Tests** | 30/30 route tests (T9's suite), retailers-referral 8/8; full API suite **1323 passed / 5 skipped**; web **321 passed**; API + web tsc clean; Biome clean. |
| **Runbook** | `docs/runbooks/razorpayx-referral-setup.md` — owner steps: RazorpayX activation, key provisioning, `RAZORPAYX_WEBHOOK_SECRET`, migration batch 109–114, and the post-apply verification table. |
| **Still open** | Migrations 109–114 unapplied (owner); T8 blocked on Play review; T10 final §11 checklist. |

## 2026-09-23 (latest) — §11 Regression checklist run against T1–T7 + T9 → caught a double-pay race (RC-036)

The spec's §11 Regression / Root-Cause Checklist was run now, not deferred to T10. Every row checked against the actual code; result table recorded in the spec. **One row caught a real money bug.**

**The bug (RC-036 — full entry in the root-cause tracker):** the RC-015 row ("any submit-once action needs a ref-guard, not just state") had been mentally filed as a mobile concern — but its **server half** applied to T7's own payout run. `handleReferralPayout` reads the per-run unsettled amount **outside** the claim transaction and sizes the batch from that pre-read figure. Under overlap (manual trigger + cron, or two manual triggers — the web button's guard is React state, exactly the RC-015 shape), both runs read `unsettled`, both create PENDING batches; the CAS (`payout_id IS NULL`) makes the loser attach **zero** conversions, but the loser's batch already says `amount_paise = <stale full figure>` and `submitPayoutRow` pays what the batch says — real money with no ledger conversion behind it, and no CHECK violation anywhere to notice.

**The fix (inside the claim tx):**
1. Re-sum what **this batch actually attached** (`tx.referralConversion.aggregate` by `payout_id`). Zero attached → `EmptyClaimError` unwinds the tx exactly as Postgres's rollback would, caught by the outer handler into a new `skipped_concurrent` summary counter — the loser is a clean no-op, the winner's batch is authoritative.
2. Partial claim (`claimedGross < grossPaise`) → resize `batch.amount_paise`/`tds_paise` (via `splitTds` re-applied) to what the batch actually holds. Audit metadata, stored row and submitted amount all derive from `batch.amount_paise`, so ledger and payment cannot disagree.

**Verification:** job suite 51/51 with two new mechanism tests — empty claim → `skipped_concurrent=1`, no `createPayout`, zero surviving batch rows; partial claim → RazorpayX receives 15000 (the tx's own re-sum), never the stale 60000. Both falsified: removing the throw → red (`skipped_concurrent` 0 ≠ 1); disabling the resize → red (`amount: 60000` submitted). The mock `$transaction` gained **real rollback semantics** (snapshot + restore on throw) — without it the loser's batch row survived the tx throw and the test would have asserted the mock's limitation rather than the DB's behavior. Full API **1325/1330** (5 skips), tsc + Biome clean.

**Clean rows (verified, not assumed):** RC-028/004 (zero referral DELETEs via main client; both purge jobs sweep all 4 tables before `DELETE FROM retailers` on the `kanchuki_purge` role), RC-025 (all referral routes grep-registered in barrel + aggregator + index.ts + webhook at `/v1`), RC-026 (`res.ok` on every fetch in the admin screen), RC-027 (zod enums + bounded TDS/GST + `mapRazorpayxStatus` never guesses), RC-011 (`AbortSignal.timeout` on every RazorpayX call), RC-008 (web `LeaderRow` mirrors API `LeaderboardRow` field-for-field), RC-003/009 (`apiError()` surfaces the real error), RC-010 (`changedKeys()` — unchanged fields are a no-op), RC-007/012/013 (zero references to the migration-082-removed customer-referral feature; `ReferralReward` is new T4 vocabulary), RC-024/019 (client-component screen, plain fetch, no cache-warm assertions). RC-014/023/022/017 are T8-deferred (mobile), recorded as such. CI gates: security.test.ts + admin.login.test.ts 15/15, mobile 107/107, tsc clean across api/web/mobile.

## 2026-09-23 (T10 closure + migrations applied — feature code-complete)

| | |
|---|---|
| **What** | F-038 declared **code-complete**: T10 discharged (the §11 checklist was its content — run in the prior commit, all rows recorded in the spec). Owner confirmed **migrations 109–114 applied directly in the Supabase SQL Editor** on 2026-09-23. The `_prisma_migrations` table does NOT have rows for 109–114 (Supabase SQL Editor writes no runner records) — noted in the runbook so the next migration-baseline audit doesn't flag phantom drift. |
| **Doc sweep** | PRO-REQUIREMENTS §35 heading + task rows + Open line → T1–T10 built, T8 deferred (Play review), migrations applied. Runbook: migration steps marked done, remaining RazorpayX steps left live. Spec §0 status → built + §13 note. DATABASE.md "not applied" lines cleared. CLAUDE.md rows 76/78/79 "not applied" clauses removed. |
| **Still open** | **T8** (retailer Refer & Earn mobile screen) — hard-blocked until Play Console review clears, then needs the owner's go-ahead per the mobile constraint. **RazorpayX provisioning** (activation, keys, `RAZORPAYX_WEBHOOK_SECRET`) — runbook `docs/runbooks/razorpayx-referral-setup.md`. **`purge-rls-live.test.ts`** — still never executed against a real Postgres. **`_prisma_migrations` rows for 109–114** — absent; reconcile before the next schema-baseline audit. |
| **CA conversation** | TDS settings (`tds_enabled`/`tds_pct`) exist and are admin-editable — talk to the CA before flipping them on (§194H/194J thresholds for recurring payouts). |

## 2026-09-24 — RC-034 follow-up: `team-members` + `reports` locked to Super Admin

**Board:** `docs/tasks/pending/post-referral-cleanup-and-launch.md` §3 · **Commit:** *(this task)* · zero `apps/mobile` files · no migration.

RC-034 shipped with two classifications deliberately **flagged, not decided** — `team-members` and `reports` stayed standard-admin, matching their pre-change reachability, each carrying an in-file note with the one-line change that would close it. This entry is that decision, taken the other way.

| Piece | Detail |
|---|---|
| Move | Both segments joined `SUPER_ADMIN_ONLY_ADMIN_SEGMENTS`: `reports` under *tax and legal documents* (`/admin/reports/gst` is tax data), `team-members` under *credentials and provider configuration* (staff/sales-team accounts — invite + edit). Both in-file notes deleted. |
| Web (nav + page) | Closed **by construction, not by a second list**: `Sidebar.tsx` filters through `isSuperAdminOnlyAdminPath(href)` and `layout.tsx` renders "Access Restricted" on the same predicate, so Team Members / Overview / GST Reports hide *and* refuse together. No web code change was needed — the shared list is the change. |
| Consequence, checked | Every child of the *Reports & Finance* group is super-admin-only now (`reports` was its last standard-admin entry), so the Sidebar drops the whole group for a plain ADMIN. Asserted in the test rather than left to be discovered. |
| Pinned by tests | `admin-access.test.ts` gained a case asserting `/admin/team-members`, `/admin/team-members/anything`, `/admin/reports`, `/admin/reports/gst` and `/v1/admin/reports` are gated — a *forward* pin, so a later edit that moves either segment back fails there instead of silently reopening the page. `Sidebar.test.tsx` gained two cases pinning the nav for `role: 'ADMIN'` (restricted links gone, *Support Tickets* still present) and `role: 'SUPER_ADMIN'` (all three present). |
| Falsification | Both new guards driven red before restore: moving the two segments back to the standard list fails the API case **1 failed / 11 passed** — the completeness assertions stayed green, so the failure is the decision and not the derivation — and fails the nav case with the rendered `Team Members` link in the diff. |
| Verification | `pnpm --filter @kanchuki/shared build` first (RC-035 discipline: `dist` is gitignored), then `admin-access.test.ts` **12/12**, `admin.login.test.ts` **9/9**, `Sidebar.test.tsx` **10/10**. |
| Residual, deliberately open | Both pages fetch their **data** from `/v1/team/*`, which the shared list does not cover: `teamAuthPreHandler` accepts any valid admin key and grants it unscoped Super Admin, so a plain-ADMIN caller still reaches `/v1/team/members` and `/v1/team/reporting/*`. **The pages are closed; the routes are not.** Recorded as a scope note in `admin-access.ts` and left as its own decision — the `ADMIN` role is currently latent (`signAdminSession` always signs `SUPER_ADMIN`, and `TeamRole` has no `ADMIN` member), and `POST /members` deliberately lets managers create their own agents, so blanket-gating `/v1/team/*` would remove a shipped capability rather than close a hole. |
| Not in this entry | `?ref=` capture, refunds and RC-033 are the next board sections; `_prisma_migrations` reconciliation and the `studio_styles` engine picks are owner actions. |

---

## 2026-09-24 (later) — the intermittent `admin-referral-monitor` failure under the full parallel suite: a timeout was poisoning the NEXT test's fixture (RC-039)

**Commit:** *(this task)* · **test-infra only — no production file touched, no migration.** Found while running the suite repeatedly for the §4/§5A work, where the same file failed once and passed on rerun.

The symptom named a money bug that did not exist:

```
FAIL ... > GET /referral/overview > excludes FAILED batches from committed money
AssertionError: expected 30000 to be +0
```

That test seeds one **FAILED** `20_000` payout and asserts `paid_out_paise === 0`; it read `30_000` — the *other* overview test's **PAID** row. Reading it as a route bug is the natural move, and it is wrong at both ends: the route never sums FAILED batches, and the number it was accused of was never in its input.

| Piece | Detail |
|---|---|
| Trigger | This was the only file of 96 that built its app per test via `await Promise.all([import('fastify'), import('.../error-handler.js')])` — the whole module graph pulled at test time. Cheap alone; on a saturated worker it exceeded vitest's 5s ceiling. Now static imports, like every other suite. |
| Amplifier (the real defect) | The prisma stand-in was **one** module-level object and `beforeEach(resetState)` *swapped its arrays*. Vitest abandoning a timed-out test does not cancel its promises, so `build()` resolved afterwards, the abandoned continuation ran its seeds, and — sharing the same object identity as the next test's fixture — they landed **in the next test**. |
| Fix, half 1 (ownership) | The fixture became `let state: Fixture`, replaced whole by `resetState()` (`state = makeState()`), and every test that touches it binds its own at the top: `const st = freshState()`. A late write now reaches an object the next test cannot see, at any timing. **Shipped alone first, and it changed nothing** — binding `const st = state` while `resetState` still cleared arrays in place makes `st` and `state` the same object, so `st.payouts` resolves to whatever the next `beforeEach` just installed. |
| Fix, half 2 (retiring) | `afterEach(retireState)` freezes the retired fixture's arrays, so a late write **throws** in the abandoned promise chain instead of landing silently. This was also shipped first, alone, tested — and did **not** stop the flake: it froze arrays the next `beforeEach` immediately replaces. |
| Guards | **F6** replays the mechanism deterministically: abandoned and next fixtures must be different objects, the late write must throw, and the next fixture must still be empty. **F7** source-scans that no test body writes the shared pointer. **F8a/F8b** pin what F6 structurally cannot see — that `retireState` is *wired* to `afterEach`. |
| Two guard defects, both found only by running the mutant | (1) **F7 located itself by a literal filename**, so injecting a bare `state.payouts.push(…)` into a *copy* of the file left it green — it had scanned the original; now `fileURLToPath(import.meta.url)`. (2) **F8b exists because deleting `afterEach(retireState)` left the suite 32/32 green** — F6 calls `retireState()` itself, so the test that was supposed to protect the hook could not see its removal. The F6 comment claimed otherwise; the experiment disproved the comment, and the comment now records the measurement. |
| Falsification | **(A)** `resetState` back to clearing arrays on one shared object → F6 + F8b red, `expected [] not to be []` (the message itself shows one array). **(B)** `afterEach(retireState)` deleted → F8b red alone (`expected false to be true`), F6 correctly green. **(C)** a bare `state.payouts.push(…)` in a test body → F7 red, naming the call. |
| Verification | `admin-referral-monitor.test.ts` **34/34** (32 + F8a/F8b + the rewritten F7). Full API suite **1353 passed / 5 skipped, 0 failed — twice consecutively** in the default parallel run. `tsc` + biome clean. |
| Stress, and what it found instead | Two full suites run **concurrently** (the condition that caused the original timeout): the monitor file stayed green in both, and two *other* files timed out — `lib/studio-shoot.test.ts > runs both orders …` (both runs) and `routes/admin.login.test.ts > rejects missing email` (one run). Both are plain `Test timed out in 5000ms`, neither has a shared fixture. Measured solo: studio-shoot's test takes **4557 ms of a 5000 ms ceiling** (a 443 ms margin), admin.login's takes 1092 ms. So the trigger class is suite-wide and lives on the *other* side of the fix: **the leak needs a timeout, so the durable answer is no test sitting near the ceiling** — an explicit timeout on the two slow tests, not a larger global one (which would also hide a genuinely hung test). |
| Residual, stated | The mock reads the *current* fixture, so an abandoned continuation that drives a route handler could still mutate a row object inside the next test's fixture if two tests shared a row id. Narrower than the fixed leak (it requires a timeout *and* an id collision) and it is exactly why the slow-test margin above is the real remaining item. |

---

## 2026-09-24 (later still) — the contention failures the RC-039 stress run exposed: explicit per-test timeouts on the tests that pay real poll sleeps

**Commit:** *(this task)* · test-infra only (`apps/api/src/lib/studio-shoot.test.ts`, `apps/api/src/routes/admin.login.test.ts`) · no production file, no migration.

The stress run above cleared `admin-referral-monitor` and failed **two other files** — `lib/studio-shoot.test.ts` (in both concurrent runs) and `routes/admin.login.test.ts` (one) — all `Test timed out in 5000ms`, no shared fixture in either. Both are the same trigger class from the other side of the RC-039 fix: **the leak needs a timeout, so the durable answer is that no test sits near the ceiling.**

| Piece | Detail |
|---|---|
| `studio-shoot` — slow by construction, not by accident | The suite has no timers of its own; it drives the real generation loop, so every mocked poll response costs a real production `POLL_INTERVALS_MS` sleep (`studio-shoot.ts`: `1_000` for the first ten attempts). Measured: one mocked `Processing` → `Ready` = **1016 ms** (exactly the 1 s sleep), a two-step pipeline (reference → try-on → scene) ≈ **3.0 s**, the A/B order comparisons ≈ **4.5 s** — leaving the slowest a **443 ms** margin against the 5 s default. A slower CI box reaches that with no contention at all. |
| `studio-shoot` — scope | `const PIPELINE_TEST_TIMEOUT_MS = 30_000` (≈6.5× the slowest measurement) applied to the **11** tests measured ≥1 s; the other 22 stay on the default so a hang there still fails at 5 s. A real hang in a guarded test still fails: the loop's own deadline is 180 s (`POLL_TIMEOUT_MS`). |
| `admin.login` — and the measurement that changed the story | First run of the file put `rejects missing email` at 1449 ms and the whole file at 4970 ms; the next three fresh runs put the same test at **403 / 462 / 480 ms** with everything else under 300 ms. So the slow number was **load, not the test's own work** — the 1092 ms and 1449 ms sightings were both taken while the box was still busy from a parallel run. It is the first test, so it carries the cold start (`adminRoutes` barrel, scrypt constants, Fastify `register` + `ready`) on top of a ~50 ms assertion. |
| `admin.login` — scope | `const COLD_START_TEST_TIMEOUT_MS = 15_000` on **that test only** (~30× its warm measurement). Stated in the comment rather than hidden: a reorder moves the cold start to a new first test, so the durable fix is one app built in `beforeAll` — not done here. |
| Proof the guards are load-bearing, not decorative | Contention is not reproducible on demand on this box (see below), so the guards were tested against a deliberately tiny **global** default instead, which a per-test option must override: `--testTimeout=1000` on `studio-shoot` → **33/33 pass**, which is only possible if the 3–4.5 s tests are running under their own 30 s guard; `--testTimeout=100` on the login test (`-t`) → **passes** at ~450 ms. Ignoring the option fails both. Pre-fix evidence is the concurrent run itself: the two files reported `Test timed out in 5000ms` there. |
| Harness honesty | The double-suite harness is marginal on this machine: the first attempt completed (and produced the failures above), the second killed one instance mid-run with `Serialized Error: { code: 'ERR_IPC_CHANNEL_CLOSED' }`. That is why the deterministic global-default proof replaced a second contention run rather than being skipped. |
| Verification | `studio-shoot` **33/33** · `admin.login` **9/9** · full API **1353 passed / 5 skipped (1358), 0 failed** · `tsc` + biome clean. |
| Durable alternative, flagged not done | Making the poll interval injectable would let those tests run with no real sleep at all — roughly **34 s of the suite's wall clock**, since the file currently spends ~34 s inside tests. That is a production-code change; the timeout above was the requested, minimal fix. |

## 2026-09-24 (latest) — §6 hardcoded lists → DB: done

| Item | Change |
|---|---|
| 6.5–6.7 | Premise corrected: catalog-size limits have **no DB table** (`plan_limits` = per-period quotas). Prices → `plan_pricing` via new `apps/web/src/lib/plan-pricing.ts` (per-plan fallback; the old in-page helper crashed on partial rows); limits → shared `PLAN_LIMITS` everywhere (admin billing, pricing page, admin plan-change route via new shared `orUnlimited`). Admin billing was mislabelling the `PRODUCT_UPLOAD` quota as catalog size. Stale prices fixed: pricing metadata + comparison row (₹999), `for-retailers` (₹999/₹2,499/₹4,999 + "Annual plans save 20%"), admin `plan-features` labels. |
| 6.2 / 6.3 | Mobile `growth/templates.tsx`: studio styles from `/products/studio-styles` (stale hardcoded ids 422'd at generate after the migration-101 collapse), festivals from `/growth/festivals` + `General`. Ships with the next EAS build. |
| 6.4 | Admin social-templates filter from `stats.by_occasion`; removed the groupBy `take: 10` (it also capped the stat count). |
| 6.9 | `RegionalFilters` deleted — dead end to end (never rendered; the API never read `regional`). |
| 6.10 | Skipped — `SUBTYPE_KEYWORDS` is search vocabulary; category names would inject noise hints. |
| 6.11 | `hsn_rules` table (migration **117, not applied**) + admin API/screen; keywords not regex; the code list is the fallback. |
| 6.12 | Fifth `999999` straggler (`admin-retailers-detail.ts`) → `PLAN_LIMITS`. |

Side fix: the mobile global `@kanchuki/shared` mock now spreads the real module (its export whitelist broke the RC-011 smoke on `isPlanEnded`). **Owner to verify:** migration 074 seeded `plan_pricing` at ₹999/₹2,499/₹4,999 and no later migration updates it — if an admin never edited those rows, prod charges and now displays those prices, not ₹4,999/₹9,999/₹14,999. Tests: API 1365/1370 (5 skipped), web 323/323, mobile 107/107, tsc ×3 clean.

**Follow-up (same day):** prod prices verified via `GET api.kanchuki.app/v1/public/pricing` → ₹4,999 / ₹9,999 / ₹14,999 (the 074 seed rows were edited in Admin). Owner decision: the static `PLAN_PRICING` constant is **deleted** — `plan_pricing` is the only source; API throws `PLAN_PRICE_MISSING` on a missing row, web hides the number when the API is down. New `billing-pricing.test.ts` pins both paths. Migration **116 applied** (owner); **117 pending**.

## 2026-09-24 (launch §7A.1–§7A.2) — storefront JSON-LD on all four surfaces + RC-040 stored-XSS fix

**Commit:** *(this task)* · `apps/web` only (+ docs). No migration, no API change, no `apps/mobile` file.

| Piece | Detail |
|---|---|
| §7A.1 — sitemap | **Already built; the board's path was wrong.** It is `apps/web/src/app/sitemap.xml/route.ts` (chunked index via `generateSitemaps`, 10k URLs/file) + `apps/web/src/app/sitemap/[id]/route.ts`, backed by `apps/web/src/lib/sitemap.ts` (every live store + Google **image-sitemap** extensions on product photos), pinned by `apps/web/src/app/__tests__/sitemap.test.ts`. Ticked, nothing built. |
| §7A.2 — JSON-LD | New `apps/web/src/app/[store]/lib/store-seo.ts`: `buildStoreDescription`, `storeOgImage`, `localBusinessLd`, `productLd`, `itemListLd`, `ldJson`. Wired into **four** surfaces: `/{store}` + `/{store}/categories` (already had `generateMetadata` + `LocalBusiness`) and — new — `ItemList` on `/{store}/{collection}`, `Product`/`Offer` on `/{store}/{collection}/product/{productId}`. Offer is emitted only with a price (Google rejects a Product offer without one); `SOLD` → `OutOfStock`; a price range → `AggregateOffer`; store `url`/product `url` from a single `SITE_URL` (same `NEXT_PUBLIC_SITE_URL` default as the rest of the app). |
| **RC-040 — stored XSS** | The two shipped pages passed **`JSON.stringify`** straight into `dangerouslySetInnerHTML` on `<script type="application/ld+json">`. `JSON.stringify` is not an HTML escaper — it leaves `<` as-is — and the HTML parser ends a script element at the first **`</script`** (case-insensitive). A retailer `shop_name` (saved once at onboarding, served to every visitor) containing `</script>` therefore closed the tag and ran markup on the storefront origin: **stored XSS**, on every page carrying that JSON-LD. Invisible because every prod store is well-formed and the output *looks* escaped (full of `\"`/`\\`); the `biome-ignore lint/security/noDangerouslySetInnerHtml: … no user input` comment asserted safety in the exact spot the lint rule had flagged. |
| RC-040 fix | One helper, `ldJson = JSON.stringify(data).replace(/</g, String.raw`\u003c`)`, at **all four** sites (the two new ones never shipped unescaped). Escaping every `<` also covers `<script`/`<!--`; `>`/`&` are not needed because only `<` starts the sequences that end a script element. The `biome-ignore` stays — the sink is still a sink; the data is now escaped rather than trusted. |
| The fix's own near-miss | The first written form was `'\u003c'` with **one** backslash — a JS escape for the literal `<`, i.e. a no-op that diffs identically to the correct form. `store-seo.test.ts` was run before commit and went red on exactly this, which is why the escape is now a `String.raw` template (no escape-processing layer) and the test asserts the **absence of `</script>` in the output string**, not merely that the page renders. |
| Tests | `store-seo.test.ts` **3/3** — escape arm asserts `</script>` absent **and** `JSON.parse(out).name` equals the original raw value (escaping must not change the value); plus Offer/AggregateOffer/no-offer/SOLD and `ItemList` positions+URLs. **Falsified:** `ldJson` → bare `JSON.stringify` turns the escape arm red, the other two stay green. Web **326/326**, web `tsc --noEmit` clean. |

## 2026-09-24 (launch §7A.3) — Apple App Review OTP bypass (`REVIEW_PHONE` / `REVIEW_OTP`)

**Commit:** *(this task)* · `apps/api` only (+ `.env.example`, docs). No migration, no mobile build, no client-visible flag.

An App Store reviewer cannot receive an Indian SMS — their SIM is foreign and the real path depends on DLT-registered delivery. This adds a **FIXED phone + FIXED code** demo login, distinct from the existing `OTP_TEST_BYPASS` (which accepts *any* 6-digit code).

| Piece | Detail |
|---|---|
| Gate | **Both** `REVIEW_PHONE` and `REVIEW_OTP` must be set. Unset either one and `isReviewLogin()` is `false` for every phone — the branch is unreachable, which is the production default and why this is safe to ship before a review exists. |
| `/otp/send` | For the review phone, returns the existing `bypass: true` shape **without calling MSG91** — the app then skips its native widget and shows the code field. No `path=` marker, no phone in any log. |
| `/otp/verify` | Accepts **exactly** `REVIEW_OTP` (`timingSafeEqual`, length pre-check), never “any 6 digits”. Checked **before** `OTP_TEST_BYPASS`, so a review phone that also appears in `OTP_TEST_PHONES` still has to produce the fixed code. Wrong code → the standard 401 `INVALID_OTP`; no session, no retailer row. The one operator log that would print the phone is skipped on this path. |
| Never logged | Asserted by test, not by convention: `auth-review-bypass.test.ts` spies `console.log` **and** `console.error` and fails if either the review phone or the code appears in any call. |
| Security review (pre-merge) | Off by default (two independent vars); constant-time compare (leaks neither the code nor its length); phone must equal `REVIEW_PHONE` after normalisation; review-before-test-bypass precedence pinned; **blast radius stated** — while both vars are set, anyone who learns phone+code signs in as a demo account with no live store, so both vars are removed once approved. API service env only; no DB, no mobile, no client-visible flag. |
| Tests | New `auth-review-bypass.test.ts` **10/10** (send on/off, wrong code, review-vs-test precedence, malformed `REVIEW_OTP` disables it, no-log spy). **Falsified:** relaxing the code check to `!otp` turns both wrong-code arms red. Gates: `security.test.ts` **6/6**, `admin.login.test.ts` **9/9**, `auth-otp-bypass` **11/11**, `auth-msg91` **12/12**, `auth-staff-invite` **10/10**, `msg91-otp` **23/23**; API `tsc --noEmit` clean; Biome clean. |
| Owner action | Set `REVIEW_PHONE` + `REVIEW_OTP` on the Railway **API** service before submitting to review; remove both after approval. Documented in `.env.example`. |

## 2026-09-24 (launch §7A.4) — disaster-recovery runbook

**Commit:** *(this task)* · docs only. New `docs/SECURITY.md (Disaster Recovery Runbook section)`.

| Piece | Detail |
|---|---|
| Inventory first | Every store of state, its backup story and the loss impact: Supabase Postgres (the business — PITR), R2 (photos — **no confirmed versioning**), Redis (**ephemeral by design**), the Railway deletion-vault Postgres, Railway containers (rebuilt from GitHub), Hetzner V-Tone, and secrets. RPO ≤24 h / RTO ≤4 h stated with the caveat that both are **plan-dependent on the owner's Supabase tier** — asserted as an owner action, not as a fact. |
| A — database | Bad-migration roll-forward preferred; restore **to a new instance, verify, then repoint** (never restore over live); PITR with a timestamp; the `password authentication failed` → `<role>.<project_ref>` pooler gotcha; vault is INSERT-only, never "fix" it by granting SELECT. Calls out the **`_prisma_migrations` gap** (083–089, 063/104–117 applied by hand) so a `migrate deploy` on a restored DB does not silently re-apply or skip. |
| B — deploy | Railway **Redeploy the last known-good deployment**, the **"Deployed via GitHub"** check ("via CLI" = someone ran `railway up`), and the **domain-target-port 502** (`x-railway-fallback: true` on every path) fixed via `railway domain update --port`. |
| C/E — storage + hosts | R2 loss: DB keeps the keys, so recover metadata rather than hiding missing objects; `NEXT_PUBLIC_*` changes need a **web rebuild**. Region table for Railway / Supabase / Upstash / Cloudflare / Hetzner. |
| D — Redis | Nothing to restore, two things to re-register: OTP/rate-limit state rebuilds itself, and **repeatable-job schedules must be reconciled** (a changed cron var can leave a duplicate schedule in Redis — the `CATALOG_SYNC_CRON` warning, generalized). Also records that the lazyConnect handshake race is fixed, so a first-request failure is not re-diagnosed as a timeout bug. |
| F — rotation order | Dependency-ordered: DB creds → Supabase service key/JWT → R2 → Redis → payment/messaging/AI providers (RazorpayX and payments webhook secrets kept **separate** so rotating one never forces the other) → auth/JWT secrets (`REVALIDATION_SECRET` on **both** services) → review/test bypasses. Ends with the per-service-variable grep that catches a half-rotated value. |
| Honesty | A **known-gaps** table names what this runbook cannot promise: R2 versioning unconfirmed, Supabase retention plan-dependent, no read replica (B-002), `_prisma_migrations` gaps, vault backup retention, secrets only in Railway + password manager. Post-incident checklist routes code/process causes into a new `RC-###`. |

## 2026-09-24 (launch §7A.6) — retailer-facing photo retention / no-training notice

**Commit:** *(this task)* · `apps/web` + docs. No migration, no `apps/mobile` file, no build needed.

| Piece | Detail |
|---|---|
| The item's premise was wrong | It asked for a **training-photo** retention/deletion notice. There are no training photos: the consent-gated training collection was removed 2026-08-31 (`chore/remove-unwanted-features`, migration **082**) — `training_photo_consents`, the `training-data/` R2 prefix, the 180-day cleanup cron and the revocation-token flow are all gone (SECURITY.md §3b/§3c). A notice about them would describe a feature that does not exist — the RC-025/RC-038 shape (a contract in prose, nothing behind it). |
| What the notice says instead | The true and stronger statement: **“We do not use your photos to train AI models”**, then what photos *are* used for (tagging / background / studio / promo video / publishing), that AI providers are contracted not to train on the data either, that the old programme was **removed on 31 August 2026**, and how long a photo is kept and how to delete it. |
| Placement | `apps/web/src/app/privacy/page.tsx` → new section *“Product photos and AI training”*; page date bumped to 2026-09-24. Chosen because the app's **Settings → Legal → Privacy Policy** row already opens `${WEB_URL}/privacy` (`apps/mobile/app/settings/index.tsx`), so retailers reach it with **no EAS build** — and it is the surface `notice-versions.ts` sends DPDP data-rights replies to. A new mobile screen was rejected: it cannot reach anyone until the next build. A standalone `/privacy/photos` page was rejected: one policy, one URL. |
| Facts, each re-checkable | Provider no-training terms — `docs/SECURITY.md`. Removal date — migration 082. Purge window — `PURGE_AFTER_DAYS = 15` (`apps/api/src/jobs/purge-soft-deleted.ts`), **verified**, which is what the page already said; the “30-day purge cron” label in `INFRA-SETUP.md` names the old cron, not the window. Recorded in a table so a change to the constant visibly invalidates the copy. |
| Guard test | New `apps/web/src/app/privacy/__tests__/page.test.tsx` **5/5** — renders the server page and pins the no-training sentence, the dedicated section, the 15-day figure + `privacy@kanchuki.app` deletion route, the removal date, and the **absence** of a stale training-consent promise. **Falsified:** deleting the `<strong>We do not use…</strong>` sentence turns the first arm red. Web **331/331**, web `tsc --noEmit` clean. |
| Legal handoff | `docs/SECURITY.md (Photo Retention Notice section)` — the verbatim copy, the placement reasoning, the fact→source table, and a 5-question review checklist for **§7B.1**. It flags the most likely real gap rather than burying it: **our 15-day purge is ours — a provider's own log/cache retention is a separate schedule**, which is the question to settle with counsel. |

