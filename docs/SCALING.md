# Kanchuki — Scaling Plan

**Version:** 1.0
**Trigger for this doc:** retailer asked (2026-07-29) whether current stack holds 1M retailers / 5M customers + real daily active load, or needs upgrade first. Answer: MVP stack holds MVP scale (50–500 retailers). It does **not** hold the 1M/5M target as deployed today. This doc specs the gap.

---

## 1. Current State (as of 2026-07-29)

| Layer | Current | Source |
|---|---|---|
| DB | Supabase Postgres 16 + pgvector, single primary | `docs/DATABASE.md` |
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
