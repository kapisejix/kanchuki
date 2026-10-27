# Quota: reserve at enqueue, refund in the job (RC-102 follow-up)

**Status:** proposal only, nothing built. Owner approval needed before any of it.
**Why:** RC-102 made `reserveQuota` (one atomic `INSERT .. ON CONFLICT .. WHERE count + n <= limit`) and moved every caller whose check and spend sit in one request. These flows check in the route and spend later in a BullMQ job, so two requests can both pass the check before either job runs.

## Flows still check-then-increment

| Flow | Check (route/job) | Spend (job) | Resource |
|---|---|---|---|
| AI Studio Shoot | `products-studio.ts` `checkQuota` at enqueue | `jobs/studio-shoot.ts` `incrementUsage` after success (`.catch` log) | `STUDIO_SHOOT` |
| Try-on (retailer) | `products-tryon.ts` `checkQuota(.., 1 + pending)` | `jobs/tryon.ts` `incrementUsage` after success | `TRY_ON_GENERATION` |
| Try-on (shopper) | `checkCustomerQuota` | `jobs/tryon.ts` `incrementCustomerUsage` | customer `TRY_ON_GENERATION` |
| My Style analyze | `public-my-style-analyze.ts` `checkCustomerQuota` | `jobs/my-style-analyze.ts` `incrementCustomerUsage` | customer `STYLE_ANALYSIS` |
| AI tagging | `jobs/tag-product.ts` `checkQuota(.., reserveAiCredits())` (and `catalog-import` pre-checks) | `lib/ai-usage.ts` `recordAiUsage` -> `incrementUsage(.., credits_per_call)` per provider call | `AI_TAGGING_CALL` |

Try-on already counts PENDING rows in its check (`1 + pending`, RC-073), which narrows the window but is a read, not a lock.

## Design

1. **Reserve at enqueue.** The route calls `reserveQuota` (retailer) or a new `reserveCustomerQuota` twin (same single-statement shape on `customer_usage_counters`) before `queue.add`. Over limit -> 402 as today. If `queue.add` throws, refund immediately in the route.
2. **The job never increments again.** It only refunds on failure. This replaces the "increment after success, swallow the error" pattern, so a failed job can no longer leave an unrecorded success either.
3. **Idempotency key = job id.** Add a `quota_reservations` table (`job_id` PK, `retailer_id`/`customer_account_id`, `resource_type`, `period_start`, `amount`, `state` RESERVED | REFUNDED). Reserve inserts the row in the same transaction as the counter bump; refund is `UPDATE .. SET state='REFUNDED' WHERE job_id=$1 AND state='RESERVED'` and only decrements the counter when that update touched a row. BullMQ retries and a double-delivered failure then refund at most once, which the in-memory `refund()` closure used in-request cannot promise across processes.
4. **Refund points.** In the job: any terminal failure (attempts exhausted, `UnrecoverableError`, caller-side discard such as the try-on consent withdrawal). Not on a retryable failure that will run again: the reservation stays attached to the job id. A job that expires or is removed from the queue needs the sweep below.
5. **Sweep.** Hourly job: `RESERVED` rows whose BullMQ job is gone or terminal-failed and older than the longest job timeout get refunded. This also covers a process dying between reserve and refund, the drift RC-102 documents for the in-request callers.
6. **AI tagging is different.** Its spend is weighted by the provider that actually served the call (`credits_per_call`), unknown at enqueue. Options: reserve the worst-case `reserveAiCredits()` at enqueue and refund the difference after the call; or leave tagging on check-then-increment and accept the overshoot because it is bounded by the retry queue's concurrency. Recommend the second until measured, and say so in RC-102.

## Rollout

- One flow per PR, studio-shoot first (single provider call, simplest failure path), then retailer try-on, then the customer pair, tagging last or never.
- Migration for `quota_reservations` is owner-applied. Add the DELETE-grant consideration up front (RC-049): refunds are updates, not deletes, so `kanchuki_app` needs no new grant; the sweep also updates only.
- Tests per flow: reserve once at enqueue; `queue.add` failure refunds; terminal job failure refunds exactly once even when the failure handler runs twice; retryable failure does not refund; success does not refund.

## Not verified

None of this was run. The BullMQ failure hooks (`failed` event vs the processor's own catch) and whether try-on's discard path already has one place that sees every terminal state need reading before the table design is final.
