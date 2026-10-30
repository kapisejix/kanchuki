# Quota: reserve at enqueue, refund in the job (RC-102 follow-up)

**Status:** spec approved 2026-10-27. **Step 1 (AI Studio Shoot) BUILT, not applied or deployed:** migration `144_quota_reservations` written (owner applies it first), `reserveJobQuota` / `refundJobQuota` / `markJobQuotaSpent` in `lib/quota.ts`, `products-studio.ts` reserves before the enqueue, `jobs/studio-shoot.ts` marks spent or refunds in `finally`, studio worker `failed` hook as stalled backup. The route keeps its early `checkQuota` as a fail-fast read, so the error order did not change (finding 5's "move the check" became "add the reserve before the enqueue"). **Steps 2-4 BUILT 2026-10-27 (code + tests, uncommitted):** `reserveCustomerJobQuota` / `refundCustomerJobQuota` / `markCustomerJobQuotaSpent`, My Style analyze (route + job), retailer/shopper try-on (route + job, findings 3, 4, 6; `pendingTryOns` and `getEnforcedQuota`'s `reserved` arg deleted), `failed`-hook backups for try-on and My Style, and the sibling `growth-social-templates` `/generate` enqueuer (found by security review; reserves + refunds like `products-studio`). **Migration 144 applied in prod 2026-10-27 (owner, "Success. No rows returned"; table existence not re-queried).** **Sweep BUILT 2026-10-27:** `jobs/quota-reservation-sweep.ts`, hourly at :40, settles `RESERVED` rows older than 6 h (SPENT if the job left a paid result, else refunded; My Style always refunded). **Not built:** tagging (left on purpose). Sweep untested against real Postgres. Nothing run against real Postgres. My Style note: the per-account lock already serialized same-account requests, so its gain is smaller than try-on's; it was moved for one mechanism and so a cleared/unusable read refunds through the same table. The migration SQL below is the design; the file in `packages/db/prisma/migrations/144_quota_reservations/` is the built form (adds an `id` PK, `IF NOT EXISTS`, FK cascades and the RLS block).
**Why:** RC-102 made `reserveQuota` (one atomic `INSERT .. ON CONFLICT .. WHERE count + n <= limit`) and moved every caller whose check and spend sit in one request. These flows check in the route and spend later in a BullMQ job, so two requests can both pass the check before either job runs.

## Flows still check-then-increment

| Flow | Check (route/job) | Spend (job) | Resource |
|---|---|---|---|
| AI Studio Shoot | `products-studio.ts:110` `checkQuota`, FIRST thing after the configured-check, before body/style/photo validation | `jobs/studio-shoot.ts:222` `incrementUsage` after success (`.catch` log) | `STUDIO_SHOOT` |
| Try-on (retailer) | `products-tryon.ts:347-348` `checkQuota(.., 1 + pendingTryOns)` | `jobs/tryon.ts:226` `incrementUsage` | `TRY_ON_GENERATION` |
| Try-on (shopper) | `products-tryon.ts:350` `checkCustomerQuota` | `jobs/tryon.ts:230` `incrementCustomerUsage` | customer `TRY_ON_GENERATION` |
| My Style analyze | `public-my-style-analyze.ts` `checkCustomerQuota` | `jobs/my-style-analyze.ts` `incrementCustomerUsage` | customer `STYLE_ANALYSIS` |
| AI tagging | `jobs/tag-product.ts:29` `checkQuota(.., reserveAiCredits())` runs INSIDE the job (not at enqueue); `catalog-import` pre-checks | `lib/ai-usage.ts` `recordAiUsage` -> `incrementUsage(.., credits_per_call)` per provider call | `AI_TAGGING_CALL` |

## Findings that change the first draft of this spec

1. **No single BullMQ hook sees every terminal failure.** Both handlers (`handleStudioShoot`, `handleTryOn`) `return` after writing a failed status on most failure paths: studio (photo gone, no source URL, provider answered `status !== 'ready'`, the common "model said no" case), try-on (photo expired/empty, product gone, unsupported category, no product photo, queued job already `DISCARDED`). BullMQ counts a returned handler as COMPLETED, so `worker.on('failed')` (registered at `jobs/index.ts:569/573`) never fires for them; it fires only for the `throw new Error(message)` in the catch, plus a job that exhausts its stalled count. A refund hung on `failed` alone would leak a slot on every soft failure.
2. **Therefore the refund point is the handler itself:** `let spent = false; try { ...; spent = true at the old increment site } finally { if (!spent) await refundByJobId(job_id) }`. That covers return and throw. `worker.on('failed')` is a backup for a stalled-out job, calling the same idempotent refund. The hourly sweep is the last resort (process died, no handler ran).
3. **Try-on's "spent" point is right after `generateTryOn` returns**, not at the COMPLETED write: the old code incremented even when `claimed.count === 0` (consent withdrawn or discarded mid-run) because the GPU ran. Keep that. The early `DISCARDED` return before any GPU call and every `markFailed` before `generateTryOn` must refund.
4. **Try-on's `pendingTryOns` has to go.** `products-tryon.ts:347` adds recent PENDING rows to the check because usage was only counted on success. Once a reservation sits in the counter at enqueue, adding PENDING again double counts. Same for the screen: `getEnforcedQuota(.., reserved = pendingTryOns)` (`products-tryon.ts:188-191`, RC-073) must stop passing `reserved`. Missing this makes every in-flight try-on cost 2 slots.
5. **Studio's check must move.** `checkQuota` sits before validation, so a reserve there needs a refund on ~10 later throws. Reserve instead immediately before `addStudioShootJob` (after style, plan, photo, size and gating checks), refund if `addStudioShootJob` throws. Same pattern as `products-crud` in RC-102.
6. **Try-on route ordering:** reserve after the photo is read and sniffed (step 6), before `tryOnJob.create`. Failure points to refund: `create` throws, `putTryOnPhoto` returns false (route already marks the row FAILED and throws 503), `addTryOnJob` throws. A shopper job reserves two counters; if the second is refused the first must be refunded, and the order should be customer first (cheapest to refuse) then retailer.
7. **Tagging does not fit "reserve at enqueue".** The check runs in the job, jobs retry (`attempts: 3` on the tagging/embedding queues, `jobs/index.ts:80-92`), and the spend is provider-weighted per call. Leave tagging on check-then-increment (as the first draft recommended) and say so in RC-102. My Style analyze (`attempts: 1`, flat spend) is a clean fit with the customer pair.
8. **Try-on and My Style hold the wearer photo in process memory** (`lib/tryon-photo-store.ts`), so an API restart between enqueue and run turns the job into the "photo expired" `markFailed` path: it refunds through finding 2, no sweep needed for that case.
9. `addStudioShootJob` / `addTryOnJob` pass no BullMQ `jobId` and no `attempts`, so BullMQ's own id is auto and attempts default to 1. The idempotency key is therefore the payload `job_id` (studio: a cuid with no DB row, Redis status only; try-on: `tryon_<cuid>`, which is also the `try_on_jobs` PK), never BullMQ's id.

## Design

1. **Reserve at enqueue** with `reserveQuota` (retailer) or a `reserveCustomerQuota` twin (same single-statement shape on `customer_usage_counters`), taking the payload `job_id` as an extra argument.
2. **Reservation row in the same statement as the counter bump** (one CTE, so it stays atomic):
   ```sql
   WITH bump AS (
     INSERT INTO usage_counters (id, retailer_id, resource_type, period_start, count, updated_at)
     VALUES ($id, $retailer, $type::"QuotaResourceType", $start, $n, now())
     ON CONFLICT (retailer_id, resource_type, period_start)
     DO UPDATE SET count = usage_counters.count + $n, updated_at = now()
     WHERE usage_counters.count + $n <= $limit
     RETURNING 1
   )
   INSERT INTO quota_reservations (id, job_id, retailer_id, resource_type, period_start, amount)
   SELECT $res_id, $job_id, $retailer, $type::"QuotaResourceType", $start, $n FROM bump
   ```
   Zero rows inserted = over limit (402), counter untouched. A duplicate `(job_id, resource_type)` hits the partial unique index and fails the whole statement, so a retried enqueue cannot reserve twice.
3. **The job never increments.** Spent is the absence of a refund.
4. **Refund, idempotent by job id:**
   ```sql
   WITH r AS (
     UPDATE quota_reservations SET state = 'REFUNDED', refunded_at = now()
     WHERE job_id = $job_id AND resource_type = $type AND state = 'RESERVED'
     RETURNING retailer_id, resource_type, period_start, amount
   )
   UPDATE usage_counters u SET count = GREATEST(u.count - r.amount, 0), updated_at = now()
   FROM r WHERE u.retailer_id = r.retailer_id AND u.resource_type = r.resource_type
     AND u.period_start = r.period_start
   ```
   Running it twice (handler `finally` then `failed` hook then sweep) decrements once.
5. **Sweep** (hourly, maintenance queue): `RESERVED` rows older than the longest job timeout whose status row says terminal-failed, or with no live BullMQ job, get the same refund. For try-on the truth is `try_on_jobs.status`; for studio it is the Redis status key, which expires, so studio needs the reservation row to carry `state` updates from the handler on success (`SPENT`) so "still RESERVED and old" reliably means "never finished".
6. **Spent marking:** on success the handler sets `state = 'SPENT'` (one UPDATE, best effort). A row left `RESERVED` after the timeout is refunded by the sweep; a successful job whose SPENT write failed would be refunded wrongly, so the SPENT write goes before the status write that makes the result visible, and its failure is logged loudly. This is the one new failure mode the design adds.

## Migration (proposed, NOT applied; owner applies, number is a placeholder)

```sql
-- NNN_quota_reservations.sql
CREATE TABLE quota_reservations (
  id                   TEXT PRIMARY KEY,
  job_id               TEXT NOT NULL,
  retailer_id          TEXT REFERENCES retailers(id) ON DELETE CASCADE,
  customer_account_id  TEXT REFERENCES customer_accounts(id) ON DELETE CASCADE,
  resource_type        "QuotaResourceType" NOT NULL,
  period_start         TIMESTAMP(3) NOT NULL,
  amount               INTEGER NOT NULL CHECK (amount > 0),
  state                TEXT NOT NULL DEFAULT 'RESERVED' CHECK (state IN ('RESERVED','SPENT','REFUNDED')),
  created_at           TIMESTAMP(3) NOT NULL DEFAULT now(),
  refunded_at          TIMESTAMP(3),
  CHECK ((retailer_id IS NOT NULL) <> (customer_account_id IS NOT NULL))
);
-- A shopper try-on reserves BOTH a retailer row and a customer row for one job_id, so
-- uniqueness is per scope (two partial indexes), not on job_id alone:
CREATE UNIQUE INDEX quota_reservations_retailer_uq ON quota_reservations (job_id, resource_type) WHERE retailer_id IS NOT NULL;
CREATE UNIQUE INDEX quota_reservations_customer_uq ON quota_reservations (job_id, resource_type) WHERE customer_account_id IS NOT NULL;
CREATE INDEX quota_reservations_sweep_idx ON quota_reservations (created_at) WHERE state = 'RESERVED';
ALTER TABLE quota_reservations ENABLE ROW LEVEL SECURITY;  -- per the RLS convention; policy set to be written with the app role
GRANT SELECT, INSERT, UPDATE ON quota_reservations TO kanchuki_app;  -- no DELETE (RC-049); sweep only updates
```
Open point for the real migration: decide whether a retailer-scoped `kanchuki_app` policy is needed or the table is service-only like `usage_counters`. Check `docs/DATABASE.md` and the RLS convention before writing it.

## Rollout

- One flow per PR: studio-shoot first (single provider call, simplest failure paths, no `pending` coupling), then My Style analyze + customer twin, then retailer try-on last (findings 3, 4, 6 touch the route, the job, and the quota screen together).
- Tests per flow: reserve once at enqueue; enqueue failure refunds; every `return`-failure path in the handler refunds exactly once; a thrown failure refunds exactly once even when the `failed` hook and `finally` both run; success does not refund; try-on withdrawn-mid-run does NOT refund; queued-DISCARDED refunds.
- The quota screen change (finding 4) needs its own test with an in-flight reservation to prove it is not counted twice.

## Not verified

None of this was run, no SQL was executed against Postgres (the CTE forms are untested; the atomicity claim rests on single-statement semantics, not a measured race). Not read yet: `jobs/my-style-analyze.ts` and `public-my-style-analyze.ts` end to end (the My Style row above is from the earlier grep only), the studio status route's fallback path, and where the queues are constructed (no `defaultJobOptions` was found in `jobs/index.ts`, so attempts = 1 is inferred, not confirmed).
