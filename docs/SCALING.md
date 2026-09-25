# Kanchuki — Scaling Plan

**Version:** 1.0
**Trigger for this doc:** retailer asked (2026-07-29) whether current stack holds 1M retailers / 5M customers + real daily active load, or needs upgrade first. Answer: MVP stack holds MVP scale (50–500 retailers). It does **not** hold the 1M/5M target as deployed today. This doc specs the gap.

---

## 1. Current State (as of 2026-07-29)

| Layer | Current | Source |
|---|---|---|
| DB | Supabase Postgres 16 + pgvector, single primary | `docs/database/DATABASE.md` |
| Read replica | Code path exists (`packages/db/src/client.ts`, `DATABASE_URL_REPLICA`), **not provisioned** — admin queries hit primary | `client.ts:20-36` |
| Connection pooling | None configured — no PgBouncer/Supabase pooler wired into `DATABASE_URL` | grep, no hits |
| Deletion vault DB | Code + triggers built (F-016/F-017), `VAULT_DATABASE_URL` **unset in prod** — vault writes silently skip | CLAUDE.md, `vault.ts:28-30` |
| API hosting | Railway, single service, no autoscale config in repo | CLAUDE.md tech stack |
| Rate limiting | `@fastify/rate-limit`, global 200 req/min | `apps/api/src/index.ts:82-88` |
| Redis | Single instance, used for BullMQ job queue + likely cache | `apps/api/src/jobs/index.ts` |
| Indexes | ~60 composite indexes, all retailer-scoped (`retailer_id` first column pattern) | `packages/db/prisma/schema.prisma`, 1300 lines |
| RLS | Enforced per-retailer table | [[kanchuki-rls-convention]] |
| Load testing | None found in repo | — |

**Verdict:** security/data-isolation foundation is sound (RLS, guardrail triggers, audit log, vault design). Scaling foundation is MVP-shaped — single DB primary, single API instance, no pooler, no replica live.

---

## 2. Target Definition

Before sizing infra, pin down what "1M retailers / 5M customers + DAU" actually means — cost and design differ wildly by answer:

| Question | Needs answer before scoping |
|---|---|
| DAU as % of 1M retailers? (industry SaaS norm: 5–20% DAU/total) | Assume 10% → 100K retailer DAU as planning baseline |
| Customer-side traffic pattern — collection links are public/anonymous, not logged-in sessions | 5M customers ≠ 5M authenticated sessions; treat as public read traffic |
| Peak concurrency vs total accounts | Total accounts drive DB storage sizing; concurrency drives API/connection sizing |
| Rollout timeline — day-1 or 18-month ramp? | Ramp changes whether this is "upgrade now" or "phase into Plan.md Phase 2/3" |

**This doc assumes a phased ramp** (matches `docs/PLAN.md` Phase 2/3 horizon), not a day-1 requirement. Flag if wrong.

---

## 3. Bottleneck Analysis

### 3.1 Database

- **Connection exhaustion.** Supabase direct Postgres connections are capped by plan tier (free/pro tiers: dozens, not thousands). Every Fastify instance + every serverless/edge caller opening its own conn pool will exhaust this fast under concurrent load. **Fix: Supabase pooler (port 6543, transaction mode / PgBouncer) in `DATABASE_URL` before any horizontal API scaling.**
- **Single primary for all reads+writes.** Admin dashboards, reporting queries (`/team/reporting/*`, activity feeds), and retailer-facing traffic all hit one primary. `DATABASE_URL_REPLICA` path already exists in code — just needs a provisioned replica and env var set.
- **Compute tier.** Supabase shared-compute tiers throttle hard under sustained write load (product uploads, AI tagging writes, collection views). At 100K+ DAU, dedicated compute tier is required, not optional.
- **pgvector at scale.** Fashion DNA / embedding search (Phase 1, planned) on 5M customer rows needs an ANN index (ivfflat/hnsw) — flat scan won't hold. Not yet built, but design it in from the start when Fashion DNA lands.

### 3.2 API / Compute

- Railway single-service deployment has no horizontal autoscale in-repo. Need either Railway's scaling config (multiple replicas + load balancer) or move to a platform with native autoscale (Railway supports this — it's a config gap, not a platform gap).
- Rate limit is in-process (`@fastify/rate-limit` default store) — **must move to Redis-backed store** once running >1 API instance, or each instance enforces its own 200/min independently (effective limit = 200 × instance count, defeats the purpose).

### 3.3 Redis

- Single instance = single point of failure for job queue (BullMQ) + cache. At scale, needs Sentinel or managed cluster (Upstash/Redis Cloud both work with Railway). Not urgent at 100K DAU, becomes urgent past that.

### 3.4 Storage/CDN

- Cloudflare R2 + Cloudflare CDN already chosen — this layer scales fine as-is, no action needed.

### 3.5 Security at scale

- Deletion vault: provision the actual second Postgres instance, set `VAULT_DATABASE_URL`. Currently a documented-but-dormant control — soft-deletes aren't landing anywhere.
- DB guardrail triggers (F-017) are DB-level, scale with Postgres itself — no additional work needed.
- No load/pen test on record — before onboarding real volume, run both (see §5).

---

## 4. Phased Scaling Plan

### Phase A — Pre-10K retailers (do now, cheap, unblocks everything else)
1. Wire Supabase connection pooler into `DATABASE_URL` (transaction mode).
2. Provision `DATABASE_URL_REPLICA`, route admin/reporting reads through existing `packages/db/src/client.ts` replica client.
3. Provision vault Postgres instance, set `VAULT_DATABASE_URL`, confirm `vault.test.ts` suite runs (currently self-skips when unset).
4. Move rate-limit store to Redis (`@fastify/rate-limit` supports a Redis store option) — do this *before* running >1 API instance, not after.

### Phase B — 10K–100K retailers
5. Railway: multi-instance API behind LB, or equivalent autoscale config.
6. Supabase: upgrade to dedicated compute tier sized to sustained write load (product/photo uploads dominate).
7. Redis: move to managed HA (Sentinel/cluster).
8. Add DB query monitoring (Supabase built-in + `pg_stat_statements`) — catch slow queries before they page someone.

### Phase C — 100K–1M retailers
9. Re-evaluate Postgres vertical ceiling — at this range, consider read-replica fan-out per region or partitioning hot tables (`Product`, `CollectionView`, `CustomerInteraction`) by `retailer_id` hash or `created_at` range.
10. CDN/edge caching for public collection-link reads (`/c/*`) — high fan-out, mostly-read, good cache candidate (already has `NetworkFirst` SW caching client-side per F-006B; server-side edge cache is the next step).
11. Fashion DNA pgvector index tuning (ivfflat/hnsw) if Phase 1 has landed by this point.

### Not urgent until concurrency, not account count, demands it
- Multi-region DB — India-only market, single AP-South region (already Supabase `ap-south-1`) is correct for years.
- Sharding — Postgres vertical + replica fan-out covers this range; don't build sharding speculatively.

---

## 5. Load & Security Testing (do before Phase B, not after)

- **Load test:** simulate realistic mix — retailer photo uploads (write-heavy), collection-link views (read-heavy, public/anonymous), AI search queries. Tools: k6 or Artillery against a staging Supabase branch, not prod.
- **Security test:** existing suites (`security.test.ts`, `admin.login.test.ts`) cover functional auth paths — they are not a substitute for a load-driven pen test. Run those regression suites per CLAUDE.md rule 8/9 on every checkout/auth change regardless of this plan.

---

## 6. What NOT to do

- Don't add sharding, multi-region, or a separate read-model service now — no evidence of need yet, adds ops burden for a problem that doesn't exist at current 50-retailer pilot scale.
- Don't pick a new DB engine — Postgres + pgvector holds the full target range with the phased upgrades above.
- Don't build this reactively under load — Phase A items are cheap and should land before the next onboarding push, independent of when 1M is actually reached.

---

## 7. Open Questions (need answers before Phase B sizing is final)

1. DAU/total-account ratio assumption (§2) — confirm or correct.
2. Rollout timeline — is Phase C a real near-term target or multi-year?
3. Budget ceiling for dedicated Supabase compute + Redis HA — affects tier choice in Phase B.

---

## Load Testing (§7A.5)

> Merged from the former `docs/references/guides/load-testing.md`.


Two k6 scripts under `scripts/load/k6/` simulate the mix `docs/SCALING.md` §5
asks for: retailer photo uploads (write-heavy), collection-link views
(read-heavy, anonymous), and AI search queries. Guarded by
`apps/api/src/routes/load-test.test.ts` (54 tests) — see that file's header
for why a load-test script needs its own CI guard.

**Run these against a staging Supabase branch / staging API deployment,
never production.** `mix.js` refuses `kanchuki.app` / `kanchuki.com` hosts
with no override flag — see "Safety rails" below.

#### 1. Prerequisites

Install k6 v0.50+ (the scripts use `http.expectedStatuses`, added in v0.50;
on an older binary the scripts still run, they just can't distinguish a
429 from any other non-2xx in the response callback — the `rate_limited`
counter still works either way):

```powershell
winget install k6              # Windows
choco install k6                # Windows (Chocolatey)
brew install k6                 # macOS
```

Or skip the install and run via Docker:

```bash
docker run --rm -i -e LOADTEST_BASE_URL=https://<staging-api> \
  grafana/k6 run - < scripts/load/k6/storefront.js
```

To validate a script without running it (checks syntax + that `k6/*` imports
resolve, without sending a single request):

```bash
k6 inspect scripts/load/k6/storefront.js
```

#### 2. Getting a bearer token (for `retailer.js` only)

`retailer.js` needs a real Supabase access token in `Authorization: Bearer
<token>` (`apps/api/src/plugins/auth.ts` — it's a bearer token, not a
cookie). Two ways to get one on staging:

- **§7A.3's Apple-review OTP bypass**, if `REVIEW_PHONE` + `REVIEW_OTP` are
  set on the staging deployment: `POST /v1/auth/otp/send` with that phone,
  then `POST /v1/auth/otp/verify` with the fixed `REVIEW_OTP` code returns
  `access_token` in the response body.
- **A real staging retailer login** via MSG91/Supabase OTP, same two routes.

Either way, `retailer.js`'s `setup()` calls `GET /v1/retailers/me` with the
token before spending the run on it, and fails immediately (not with a wall
of 401s) if the token is missing, expired, or not a retailer.

#### 3. Running the scripts

```bash
# Anonymous, read-heavy — storefront / product grid / product detail / etc.
k6 run -e LOADTEST_BASE_URL=https://<staging-api> scripts/load/k6/storefront.js

# Authenticated — retailer product list, profile, categories, upload presign
k6 run \
  -e LOADTEST_BASE_URL=https://<staging-api> \
  -e LOADTEST_BEARER=<access_token> \
  scripts/load/k6/retailer.js
```

##### Env matrix

| Var | Required by | Default | Notes |
|---|---|---|---|
| `LOADTEST_BASE_URL` | both | — | Throws if unset/unparseable/production. |
| `LOADTEST_RATE` | both | `180`/min | Hard-capped at 180 by `mix.js`; a value ≥ the API's 200/min limiter throws. |
| `LOADTEST_DURATION` | both | `3m` | k6 duration string. |
| `LOADTEST_SEARCH` | `storefront.js` | unset (off) | `=1` adds `POST /v1/public/search` to the mix — costs one OpenAI embedding call per hit, no cache (`packages/ai/src/embedder.ts`). Never in the default mix. |
| `LOADTEST_BEARER` | `retailer.js` | — | Supabase access token. Script fails in `setup()` without one, before any load is generated. |

#### 4. The 200/min-per-IP ceiling

`apps/api/src/index.ts` registers `@fastify/rate-limit` globally: `max: 200,
timeWindow: '1 minute'`, keyed on `request.ip`. It is a literal — **no env
override today, and this load-test work deliberately did not add one** (it's
a security control; making it configurable is a decision for the owner, not
a side effect of a load-test script).

One k6 process from one machine is one IP, so every route in a run shares
that single 200/min budget — `storefront.js` and `retailer.js` **must not
run concurrently against the same host**, they'd split one budget. The
scripts cap themselves at 180/min for headroom and refuse anything higher.

To measure real concurrency beyond 200/min, you need one of:

- **Multiple generators, multiple IPs** — run the same script from several
  machines/regions (or k6 Cloud/other distributed runners) against the same
  staging host.
- **An env-overridable limiter on staging** — a code change to
  `apps/api/src/index.ts`'s rate-limit config, staging-only, scoped and
  reviewed on its own; not part of this script.

#### 5. Reading the results

- Per-endpoint numbers are tagged: `http_req_duration{endpoint:storefront}`,
  `{endpoint:retailer_products}`, etc. — k6's end-of-run summary breaks out
  every tag value.
- `rate_limited` (a custom Counter) counts 429s separately from
  `http_req_failed`. **A non-zero `rate_limited` invalidates the run** — it
  means you measured the limiter, not the API. Its threshold
  (`rate_limited: ['count<1']`) fails the run automatically when this
  happens; don't read a rate-limited run's other numbers as if they were
  clean.
- `checks` tracks per-request assertions (route not 404, not 5xx, etc.) —
  `rate>0.99` is the pass bar.
- `http_req_duration` thresholds: `p(95)<1500ms`, `p(99)<3000ms`.

#### 6. Safety rails

- **Production is refused, no override flag.** `mix.js`'s `PROD_HOSTS =
  ['kanchuki.app', 'kanchuki.com']`, matched on hostname + subdomain
  (`api.kanchuki.app` is caught, a lookalike like
  `kanchuki.app.evil.example` is not falsely blocked). There's no
  `LOADTEST_ALLOW_PROD` — an escape hatch here is one typo from hitting
  live retailers.
- **The two scripts share one IP's rate budget — never run them
  concurrently against the same host.**
- **Nothing is ever uploaded to R2 and no product is ever created.**
  `retailer.js` calls `POST /v1/products/upload-url` (the presign) but never
  follows with a PUT to the signed URL — that would write a real object into
  the staging bucket. Neither script ever hits `POST /v1/products`.

#### 7. What is deliberately not measured, and why

| Route/family | Why excluded | How to measure it on purpose |
|---|---|---|
| `POST /v1/products` | `products-crud.ts` calls `addTaggingJob()` unconditionally on every create — a scripted loop would buy a Claude Vision call per request. Banned by the guard test by exact route shape. | Run a small, manually-bounded batch by hand against staging, watching the AI provider's usage dashboard — never loop it. |
| `retag`, `studio-shoot`, `detect-color`, `pro-cleanup` | Each buys a model call or heavy CPU (LaMa inpainting, FLUX/Gemini generation) per request. | Same — hand-run a bounded batch, don't script it. |
| `spin-video`, `bulk-delete`, `/purge` | Destructive or resource-heavy; nothing a load test needs to exercise. | N/A. |
| `/v1/admin/*` | Admin surfaces aren't part of the retailer/customer load profile §5 asks for, and most mutate state. | Out of scope for this script; write a separate admin-specific script if that's ever the question. |
| `/v1/auth/*`, `/v1/public/passport/otp*` | SMS dispatch (MSG91, real cost + real delivery) and Redis side effects per call. | Mint one token by hand (see §2) and reuse it for the whole run — that's exactly what `retailer.js` does. |
| `/v1/public/stylist` | AI chat, per-message model call. | Not covered by this script. |
| `POST /v1/public/search` | Embeds every query, no cache — bills per request. | Opt-in only, via `LOADTEST_SEARCH=1`; never in the default mix. |

#### 8. This is not a penetration test

`docs/SCALING.md` §5 says so explicitly. This measures throughput and
latency under a realistic traffic *shape*, not security posture. For that,
see `apps/api/src/routes/security.test.ts` and
`apps/api/src/routes/admin.login.test.ts` (CLAUDE.md rules 8–9 keep both
running on every auth/checkout change).
