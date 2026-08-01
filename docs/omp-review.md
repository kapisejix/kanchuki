# Kanchuki — Full Project Review

**Reviewer:** OMP AI Review Engine  
**Date:** 2026-07-27  
**Scope:** Complete codebase, documentation, architecture, security, bugs, infra  
**Sources:** `CLAUDE.md`, `docs/TECH-STACK.md`, `docs/PLAN.md`, `docs/DATABASE.md`, `docs/SECURITY.md`, `docs/INFRA-SETUP.md`, `docs/PROGRESS.md`, all source files under `apps/`, `packages/`, `scripts/`, `.env` files

---

## 1. Project Identity

| Field | Value |
|-------|-------|
| **Name** | Kanchuki |
| **Type** | AI-powered fashion retail SaaS |
| **Market** | India SMB clothing stores (1M+ offline shops) |
| **Status** | Active development — Phase 0 MVP complete, Phase S (Security) complete, Phase 1 in planning |
| **Stack tier** | Monorepo, TypeScript throughout, mobile-first |
| **Pricing (INR)** | Starter ₹999/mo · Growth ₹2,499/mo · Pro ₹4,999/mo |

---

## 2. Architecture Overview

### 2.1 Monorepo Layout

```
apps/
  api/        Node.js 20 + Fastify 4 (REST API)
  web/        Next.js 14 App Router (Customer PWA + Admin panel)
  mobile/     React Native Expo SDK 52 (Retailer app)
packages/
  db/         Prisma 5 + PostgreSQL schema + vault client
  ai/         Claude Vision tagger, OpenAI embedder, R2, V-Tone client
  shared/     Types, constants, utils
services/
  fashion-vtone/  Self-hosted Python/FastAPI VTO microservice
```

**Build orchestration:** TurboRepo with pnpm workspaces  
**CI/CD:** GitHub Actions → quality (typecheck + lint + delete-guard + test) → build → Railway manual deploy

### 2.2 Request Flow

```
Mobile App (RN Expo)
        ↓  JWT (Supabase Auth)
Fastify API (Railway)
        ↓
Prisma ORM → Supabase PostgreSQL 16 + pgvector
        ↓
BullMQ / Redis (Upstash) — async: AI tagging, VTO, embeddings
        ↓
Cloudflare R2 — image storage + CDN delivery

Customer Web (Next.js PWA on Cloudflare Pages/Railway)
→ public routes call the same Fastify API
→ collection pages: ISR (Next.js cache), revalidated on product status change

Admin Panel (Next.js, same web app, /admin/* routes)
→ protected by ADMIN_API_KEY + CSRF token + IP allowlist + TOTP
```

### 2.3 Multi-Tenant Model

Five user roles: **Retailer** (mobile app), **Customer** (mobile web), **Wholesaler** (web, Phase 2), **Manufacturer** (web, Phase 2), **Admin** (web).

Tenant isolation: `retailer_id` on every table + PostgreSQL Row Level Security policies on Supabase. Every API query includes explicit `WHERE retailer_id = request.retailerId`.

---

## 3. Technologies Used (Complete List)

### 3.1 Frontend

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Retailer App | React Native + Expo | SDK 52 | Cross-platform iOS/Android app |
| Customer Web | Next.js | 14 (App Router) | PWA, SSG/ISR collection pages |
| Admin Panel | Next.js | 14 (same codebase) | Internal admin dashboard |
| Styling | TailwindCSS + shadcn/ui | Latest | Design system |
| Animation | Framer Motion | Latest | Product browsing animations |
| State (web) | TanStack React Query | Latest | Server state + cache |
| State (mobile) | Zustand + react-native-mmkv | Latest | Local UI state + offline cache |
| Navigation (mobile) | Expo Router | Latest | File-based routing |
| Navigation (web) | Next.js App Router | 14 | File-based routing |
| Icons | Lucide React | Latest | UI icons |
| Native Camera | expo-camera + expo-image-picker | Latest | Product photo capture |
| Image processing | expo-image-manipulator | Latest | Client-side compression |

### 3.2 Backend

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Runtime | Node.js | 20 | API server |
| Framework | Fastify | 4 | REST API (2-3x faster than Express) |
| Language | TypeScript | 5.5 | Type safety throughout |
| ORM | Prisma | 5 | Schema-first, typed queries |
| Validation | Zod | Latest | Input validation on all routes |
| Logging | Pino (via Fastify) | Latest | Structured JSON logs |
| Job Queue | BullMQ | Latest | Async AI tagging, VTO, embeddings |
| Linter/Formatter | Biome | 1.8 | Replaces ESLint + Prettier |

### 3.3 Database & Storage

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Primary DB | PostgreSQL | 16 | Main database (Supabase managed) |
| Vector extension | pgvector | 0.7 | Fashion DNA embeddings, semantic search |
| Cache/Queue broker | Redis | 7 | Session cache, rate limiting, job queue |
| Redis provider | Upstash | — | Serverless, per-request billing |
| File storage | Cloudflare R2 | — | Product images (no egress fees) |
| CDN | Cloudflare | — | Image delivery, India PoPs |
| Vault DB | PostgreSQL (Railway) | 16 | Deletion Vault — separate instance, INSERT-only |
| Backup DB | PostgreSQL (Railway) | 16 | Cold backup target for pg_dump |

### 3.4 AI/ML

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Product tagging | Claude Vision (claude-3-5-sonnet-20241022) | Auto-tag product photos (Indian fashion) |
| Embeddings | OpenAI text-embedding-3-small | Fashion DNA semantic search |
| Virtual Try-On | Fashion V-Tone v1.5 (self-hosted) | Maskless VTO, Apache 2.0, CPU-capable |
| Duplicate detection | Perceptual hash (aHash, 64-bit) | Catch duplicate product uploads |
| Color detection | Claude Haiku (cheap, fast) | Auto-detect product color from photo |
| Ghost-mannequin (planned) | Snappyit API | F-001e — catalog image from packed stock |

### 3.5 Auth & Payments

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Auth | Supabase Auth | Phone OTP for retailers, anonymous for customers |
| JWT verification | Local HS256 + remote JWKS ES256 | Dual-strategy, no round-trip per request |
| Admin auth | scrypt + TOTP (ADMIN_PASSWORD_HASH) | 2FA for admin panel |
| Staff auth | scrypt + JWT (TEAM_JWT_SECRET) | Internal team login |
| Payments | Razorpay | UPI subscriptions, per-retailer checkout |
| Payment security | AES-256-GCM (ENCRYPTION_MASTER_KEY) | Encrypt retailer Razorpay credentials at rest |

### 3.6 Infrastructure & DevOps

| Layer | Technology | Purpose |
|-------|-----------|---------|
| API/Web hosting | Railway | Container deployments, env management |
| VTO microservice | Railway (or self-hosted) | Python FastAPI for Fashion V-Tone |
| DB hosting | Supabase | Managed PostgreSQL 16, PgBouncer, backups |
| Email | Resend | Transactional emails |
| SMS / OTP fallback | MSG91 | Backup SMS OTP delivery |
| Error tracking | Sentry | Runtime error capture |
| Logs | Axiom | Structured log ingestion |
| CI | GitHub Actions | Typecheck + lint + test + build |
| Build tool | TurboRepo | Monorepo task orchestration |
| Package manager | pnpm 9 | Workspace management |
| HTTP security headers | @fastify/helmet | CSP, HSTS, etc. |
| Rate limiting | @fastify/rate-limit (Redis-backed) | Per-route, per-IP |
| CORS | @fastify/cors | Origin allowlisting |

---

## 4. Database Schema (Actual)

### 4.1 Core Entity Relationships

```
retailers ──── products (1:many, soft-delete)
retailers ──── customers (1:many, soft-delete)
retailers ──── collections (1:many, soft-delete)
retailers ──── staff (1:many, soft-delete)
retailers ──── subscriptions (1:many)
retailers ──── store_sections (1:many)
retailers ──── support_tickets (1:many, Phase 0.5)
retailers ──── retailer_payment_accounts (1:1, F-302/F-307)
retailers ──── orders (1:many, F-302)
retailers ──── plan_feature assignments (M:M via PlanFeature)

products ──── product_photos (1:many)
products ──── product_variants (1:many, color variants)
products ──── product_embeddings (1:1, pgvector)
products ──── collection_products (M:M join)
products ──── customer_interactions (1:many)
products ──── spin_frames (1:many, 360-view)

collections ──── collection_products (1:many)
collections ──── collection_views (1:many)
collections ──── collection_enquiries (1:many)

customers ──── customer_interactions (1:many)
customers ──── customer_measurements (1:many, Phase 1)
customers ──── customer_fashion_dna (1:1, Phase 1)

try_on_jobs ──── training_photo_consents (1:1, optional)

team_members ──── territories (M:M via TeamMemberTerritory)
team_members ──── support_tickets (1:many, assigned)

plan_features — PlanFeature rows (14 features × 3 plans = 42 rows max)
quota system — plan_limits + retailer_limit_overrides + usage_counters

orders ──── order_items (1:many, F-302)
subscriptions ──── subscription_events (1:many)
```

### 4.2 Platform-Wide Tables (No RLS — admin only)

- `AuditLog` — all admin/mutation actions with before/after state
- `IntegrationSetting` — encrypted third-party credentials (F-012)
- `BackgroundImage` — custom product backgrounds (F-011)
- `PlanFeature` — feature flag matrix (F-013)
- `TrainingPhotoConsent` — VTO training opt-ins (no retailer_id by design)

### 4.3 Deletion Vault (Separate Postgres)

- `deleted_records` table in Railway Postgres-PYkI
- INSERT-only role (`vault_app`) — application can write but never UPDATE/DELETE
- Schema: `id, source_table, source_id, retailer_id, payload JSONB, delete_reason, deleted_by, deleted_at`

### 4.4 Key Indexes

Declared (from Prisma schema):
- `retailers`: phone (unique), city, territory_id, is_suspended
- `products`: retailer_id, retailer_id+status, retailer_id+category, retailer_id+deleted_at
- `collections`: retailer_id, slug (unique), status
- `customers`: retailer_id+phone (unique per tenant), retailer_id
- `product_embeddings`: vector index (IVFFlat or HNSW via pgvector)

---

## 5. Infrastructure

### 5.1 Deployment Topology

```
Internet
  ↓ Cloudflare (CDN + WAF + DDoS)
  ├── apps/web → Railway (Next.js)
  │     └── /admin/* → Admin panel
  │     └── /c/:slug → Customer collection pages (ISR)
  ├── apps/api → Railway (Node.js Fastify)
  │     └── /v1/* → REST API
  │     └── BullMQ workers (same process)
  └── services/fashion-vtone → Railway (Python FastAPI, VTO)

Supabase (managed PostgreSQL 16 + PgBouncer)
  └── Primary: runtime reads/writes
  └── DATABASE_URL_REPLICA: admin queries (currently points to primary — see §7.1)

Railway Postgres-PYkI (sakura.proxy.rlwy.net:23505)
  └── Deletion Vault (INSERT-only)

Upstash Redis
  └── Cache + BullMQ job queue

Cloudflare R2
  └── kanchuki-prod/ (product images, VTO results, backups)
  └── kanchuki-backups/ (pg_dump backups)
```

### 5.2 CI/CD Pipeline

```
git push → GitHub Actions
  quality job:
    - pnpm install --frozen-lockfile
    - pnpm typecheck
    - pnpm lint (Biome)
    - bash scripts/check-delete-guard.sh (F-017)
    - pnpm test (vitest)
  build job (needs: quality):
    - pnpm build --filter=@kanchuki/api
    - pnpm build --filter=@kanchuki/web
  deploy: MANUAL via Railway dashboard
```

### 5.3 Environment Variables (Required)

| Variable | Purpose | Status in .env |
|----------|---------|----------------|
| DATABASE_URL | Primary DB (should be kanchuki_app role) | Set (still superuser!) |
| DATABASE_URL_REPLICA | Read replica for admin queries | Set (points to primary!) |
| VAULT_DATABASE_URL | Deletion Vault DB | **Missing** |
| BACKUP_DATABASE_URL | Cold backup target | **Missing** |
| SUPABASE_URL | Supabase project URL | Set |
| SUPABASE_SERVICE_KEY | Supabase service role key | Set (live credential in file) |
| SUPABASE_JWT_SECRET | JWT verification | Set (live credential in file) |
| REDIS_URL | Upstash Redis | Set (live credential in file) |
| ANTHROPIC_API_KEY | Claude Vision | Set (live credential in file) |
| OPENAI_API_KEY | Embeddings | Set (live credential in file) |
| R2_ACCESS_KEY_ID + SECRET | Cloudflare R2 | Set (live credential in file) |
| ENCRYPTION_MASTER_KEY | AES-256-GCM master | Set (live credential in file) |
| RAZORPAY_KEY_ID + SECRET | Payments | Set (test keys) |
| ADMIN_EMAIL + ADMIN_PASSWORD_HASH | Admin login | Set |
| ADMIN_TOTP_SECRET | 2FA | **Missing — TOTP disabled** |
| ADMIN_API_KEY | Admin route auth | Set |
| TEAM_JWT_SECRET | Staff login | **Missing** |
| REVALIDATION_SECRET | ISR cache purge | **Missing** |
| VTONE_API_URL | V-Tone microservice | Set (Railway URL) |
| RAZORPAY_PLAN_* | 6 Razorpay plan IDs | **All missing** |

---

## 6. Known Bugs (Code-Level)

### B-001 — ✅ FIXED (verified 2026-07-27): Wishlist enquiry misses un-fetched products
**Wrong file in original finding** — the customer wishlist lives at `apps/web/src/app/c/[slug]/lib/wishlist.ts` (customer PWA), not `apps/mobile/...` (that's the retailer app; no `wishlist.ts` exists there at all).  
**Verified fix:** `WishlistItem` already stores `{id, name, price_min, price_max, category}`; `productToWishlistItem()` is called at heart-click time in `CollectionView.tsx:144-178`; `loadWishlist()` transparently migrates the old bare-ID format. Exactly the fix this finding proposed — already shipped. Stale finding.

### B-002 — HIGH: DATABASE_URL_REPLICA points to primary
**File:** `apps/api/.env` line 25  
**Problem:** `DATABASE_URL_REPLICA` is set to the same pooler connection string as `DATABASE_URL`. The admin SQL console (`/admin/database/query`) is supposed to run against a read replica — it is actually querying the **primary production database**. All "read-only" admin queries add load to production and violate the intended isolation (`docs/SECURITY.md §13`).  
**Fix:** Provision an actual read replica or a separate Postgres instance for admin queries, and set `DATABASE_URL_REPLICA` to a distinct connection string.

### B-003 — HIGH: ADMIN_PASSWORD_HASH uses legacy HMAC-SHA256 format
**File:** `apps/api/.env` line 3  
**Evidence:** Hash value `b5a6bb8409242efe...` has no `:` separator, which means the auth code in `admin.ts:118-136` falls into the legacy HMAC-SHA256 branch and logs a deprecation warning on every login. HMAC-SHA256 with a static key `'admin-password'` is far weaker than scrypt.  
**Fix:** Run `node scripts/generate-admin-hash.ts <password>` to generate a proper scrypt hash, then update `ADMIN_PASSWORD_HASH` in all environments.

### B-004 — HIGH: Admin TOTP is disabled
**File:** `apps/api/.env` — `ADMIN_TOTP_SECRET` not set  
**Problem:** `admin.ts:142-153` only enforces TOTP when `ADMIN_TOTP_SECRET` is set. Without it, admin login is single-factor (email + weak HMAC password). The security architecture (`docs/SECURITY.md §8`) explicitly requires TOTP.  
**Fix:** Generate a TOTP secret with `node scripts/generate-admin-hash.ts --totp`, enroll in Google Authenticator, set `ADMIN_TOTP_SECRET` in all environments.

### B-005 — HIGH: VAULT_DATABASE_URL not configured
**File:** `apps/api/.env` — missing  
**Problem:** `packages/db/src/vault.ts` gracefully skips the vault write when `VAULT_DATABASE_URL` is unset, but this means all soft-deletes are NOT being backed up to the vault. The deletion safety net (F-016, Layer 4) is silently inactive.  
**Fix:** Set `VAULT_DATABASE_URL` to the Railway Postgres-PYkI instance that was provisioned for the vault.

### B-006 — HIGH: Migration 037 guardrail triggers not deployed
**File:** `docs/INFRA-SETUP.md` "Still manual" note  
**Problem:** `packages/db/prisma/migrations/037_db_guardrails/migration.sql` exists but has not been applied to the Supabase primary DB. The `BEFORE DELETE OR TRUNCATE` triggers on all 8 business tables are not active. Layer 2 of the deletion guardrail is inactive.  
**Fix:** Apply via Supabase SQL Editor (PgBouncer blocks `prisma migrate deploy` over CLI — must use the web editor or direct connection via the migrator role).

### B-007 — MEDIUM: DATABASE_URL still uses Supabase superuser
**File:** `apps/api/.env` line 5  
**Evidence:** Connection string uses `postgres.thpqcylmcxokajxoerjx` (Supabase default superuser) instead of `kanchuki_app` (the restricted role created for F-017). The `INFRA-SETUP.md` explicitly documents this as "Still manual: Local .env files still reference superuser credentials — update to kanchuki_app manually."  
**Impact:** Application runs with full DELETE/DROP/TRUNCATE privileges, defeating the purpose of role separation (Layer 1 of the guardrail system is not active in this environment).

### B-008 — MEDIUM: TEAM_JWT_SECRET missing — staff login broken
**File:** `apps/api/.env` — missing  
**Problem:** `apps/api/src/plugins/team-auth.ts` and `apps/api/src/routes/team.ts` require `TEAM_JWT_SECRET` to sign and verify JWT tokens for field staff. Without it, all `/v1/team/*` endpoints will fail on token generation/verification.  
**Fix:** Generate a strong random string (`openssl rand -hex 32`) and set `TEAM_JWT_SECRET`.

### B-009 — MEDIUM: REVALIDATION_SECRET missing — ISR cache not purging
**File:** `apps/api/.env` — missing  
**Problem:** `apps/api/src/routes/products.ts:30-31` reads `REVALIDATION_SECRET`. The `revalidateCollectionsForProduct()` function short-circuits immediately when the secret is empty. Product status changes (SOLD, RESERVED) do not propagate to ISR-cached collection link pages.  
**Fix:** Set `REVALIDATION_SECRET` to a shared random string in both API and Web environment variables.

### B-010 — ⚠️ PARTIALLY FIXED (2026-08-01): Collection share URL uses hardcoded Railway domain
**File:** `apps/api/.env` line 24  
**Problem:** Railway preview domain is not the production URL. Collection links point to a Railway-generated subdomain that may change with service restarts.
**Local fix applied:** `apps/api/.env` now reads `WEB_URL=https://kanchuki.app`.
**Still open:** the same env var on the live Railway API service (production) needs the identical update in the Railway dashboard — per this repo's operational policy, production environment variables are never modified by the agent. Do this manually.

### B-011 — ✅ FIXED (verified 2026-07-27): GST invoice suffix
**Location:** `apps/api/src/routes/checkout.ts:61`  
**Verified fix:** `randomBytes(4).toString('hex').toUpperCase().slice(0, 6)` — code comment cites "B-011". Stale finding.

### B-012 — ✅ FIXED (verified 2026-07-27): isIpAllowlisted fail-open
**Location:** `apps/api/src/routes/admin.ts:53-58`  
**Verified fix:** `if (!ip)` branch now logs an error and `return false` (fail-closed) when an allowlist is configured; `trustProxy` is also correctly gated to `NODE_ENV === 'production'` in `index.ts`. Duplicate of S-007 below — same fix covers both.

### B-013 — LOW: Admin query history endpoint documented as built but not built
**File:** `docs/SECURITY.md §14.1`  
**Status:** `GET /admin/query/history` marked as "❌ Not built (query history not persisted)". The admin SQL console currently has no query history persistence despite the UI referencing it.  
**Impact:** Minor functionality gap, not a data integrity issue.

### B-014 — LOW: No pre-commit hook blocking secrets
**File:** `docs/SECURITY.md §15.4` claims "Pre-commit hooks — block commits containing hardcoded secrets"  
**Reality:** `.gitignore` properly excludes `.env`, but there is no `.husky/pre-commit` or `git hooks/pre-commit` file in the repository. The CI pipeline has no secrets scanning step.  
**Impact:** The `.env` file was read during this review and contains live production credentials. While it is gitignored, the absence of a pre-commit hook means a future accidental commit of a secret wouldn't be blocked.

---

## 7. Security Vulnerabilities & Loopholes

### S-001 — CRITICAL: Live production credentials in `apps/api/.env`
**Severity:** CRITICAL  
**Location:** `apps/api/.env`  
**Finding:** The following live production secrets are present in plaintext in a local `.env` file:

| Secret | Type | Risk |
|--------|------|------|
| `ANTHROPIC_API_KEY=sk-ant-api03-...` | Live AI API key | API calls billed to account; full Claude API access |
| `DATABASE_URL=postgresql://postgres.thpqcylmcxokajxoerjx:4z2bvJCW7r806VGJ@...` | Supabase primary DB password | Full read/write/delete of production data |
| `ENCRYPTION_MASTER_KEY=e9631228d1d701bd...` | AES-256-GCM master key | Decrypts ALL stored integration secrets in DB |
| `OPENAI_API_KEY=sk-proj-XSNS...` | Live OpenAI API key | Billed API access |
| `R2_SECRET_ACCESS_KEY=5bd16b09...` | R2 storage credentials | Read/write/delete of all product images |
| `REDIS_URL=redis://default:jR6owg2Ja5l1...@...` | Redis password | Cache poisoning, job queue manipulation |
| `SUPABASE_JWT_SECRET=DPJncazh...` | JWT signing secret | Forge any retailer's JWT token |
| `SUPABASE_SERVICE_KEY=eyJhbGc...` | Supabase service role key | Full admin DB access bypassing RLS |

**Immediate action required:**  
1. Rotate ALL keys listed above immediately — treat them as compromised.  
2. Rotate: Anthropic API key, Supabase service key + JWT secret, OpenAI API key, R2 credentials, Redis password.  
3. Regenerate `ENCRYPTION_MASTER_KEY` and re-encrypt all secrets stored in `IntegrationSetting`.  
4. Invalidate existing database password and create a new one.  
**Note:** `.gitignore` correctly excludes `.env`, so this is a local dev machine risk. However, if the developer machine is shared, accessed remotely, or the project directory is accidentally synced/uploaded, ALL secrets are exposed.

### S-002 — HIGH: SUPABASE_SERVICE_KEY in application environment
**Severity:** HIGH  
**Location:** `apps/api/.env`  
**Problem:** The Supabase service role key (`supabase_service_role`) bypasses all Row Level Security policies. It is stored in the API's `.env` and available to the Fastify process. Any code path that accidentally uses this key to read data ignores tenant isolation.  
**Finding:** `packages/db/src/client.ts` creates the Prisma client using `DATABASE_URL` (not the service key directly), but the service key is used in `apps/api/src/index.ts:40-44` to create the Supabase client for auth verification — this is correct and required. The risk is its presence in the environment means any `process.env.SUPABASE_SERVICE_KEY` usage in future code automatically has admin-level DB access.  
**Recommendation:** Document which code paths legitimately use the service key. Add a lint rule to flag new `process.env.SUPABASE_SERVICE_KEY` usages for review.

### S-003 — ✅ FIXED (verified 2026-07-27): Admin login rate limiting
**Location:** `apps/api/src/routes/admin.ts:101`  
**Verified fix:** `/login` route has `config: { rateLimit: { max: 5, timeWindow: 15 * 60 * 1000 } }`. Already fixed when this review ran — the scan missed it.

### S-004 — ✅ FIXED (verified 2026-07-27): CSRF timing-safe comparison
**Location:** `apps/api/src/routes/admin.ts:88-93`  
**Verified fix:** Uses `timingSafeEqual(Buffer.from(csrfCookie), Buffer.from(csrfHeader))` with a length check first; code comment literally cites "S-004" — fixed before this review was generated.

### S-005 — ✅ FIXED (verified 2026-07-27): Audit logging for consent revocations
**Location:** `apps/api/src/routes/consent.ts:76-87`  
**Verified fix:** `AuditLog.create()` with `action: 'REVOKE_TRAINING_CONSENT'` already runs before the row delete. Stale finding.

### S-006 — MEDIUM: Admin API key is static and long-lived
**Severity:** MEDIUM  
**Location:** `apps/api/src/routes/admin.ts:14-19`  
**Problem:** `ADMIN_API_KEY` is a static environment variable with no expiry or rotation mechanism. Any leak of this key grants full admin API access until manually rotated. The key is also returned in the login response (`admin.ts:169: token: process.env.ADMIN_API_KEY`), meaning it appears in browser network tab and local storage if the admin UI doesn't handle it carefully.  
**Fix:** Implement session-based admin tokens (TOTP login → short-lived signed session token) instead of returning the long-lived API key.

### S-007 — ✅ FIXED (verified 2026-07-27): isIpAllowlisted fail-open (duplicate of B-012)
Same finding as B-012 above — already fail-closed with a logged warning, and `trustProxy` is correctly set in `index.ts`.

### S-008 — ✅ FIXED (2026-07-27): ENCRYPTION_MASTER_KEY now derived via scrypt
**Location:** `packages/db/src/secrets.ts`  
**Fix applied:** `masterKey()` now uses `scryptSync(raw, MASTER_KEY_SALT, 32)` instead of plain `sha256`. Fixed salt (not secret, just domain separation) keeps derivation deterministic so existing encrypted rows still decrypt. scrypt's cost factor makes brute-forcing a weak passphrase materially more expensive than a single SHA-256 pass.

### S-009 — MEDIUM: Razorpay webhook secret is weak
**Severity:** MEDIUM  
**Location:** `apps/api/.env:18`  
**Value:** `RAZORPAY_WEBHOOK_SECRET=kanchuki-webhook-secret`  
**Problem:** This is a trivially guessable dictionary phrase, not a random secret. If an attacker can guess the webhook secret, they can forge payment events.  
**Fix:** Replace with `openssl rand -hex 32`. This is the test/dev environment, but the pattern should not be replicated in production.

### S-010 — ✅ NOT APPLICABLE (verified 2026-07-27): VTO result URLs and ISR
**Verified:** `TryOnModal.tsx` fetches/holds the VTO result URL entirely client-side via `useState` (`resultUrl`), never server-rendered into the ISR-cached collection page. The described failure mode can't occur with the current architecture. Stale finding.

### S-011 — LOW: No Content-Security-Policy on mobile (Expo WebView)
**Severity:** LOW  
**Finding:** The React Native Expo app uses the native browser via `expo-web-browser` and Expo's deep link handling. There is no explicit CSP for any WebView content. The customer web (Next.js) does have CSP via Fastify Helmet. If any in-app webview loads third-party content, XSS is possible.

### S-012 — ✅ FIXED (verified 2026-07-27): Backup failure detection
**Location:** `apps/api/src/jobs/backup-database.ts` — `trackBackupFailure()`, `getBackupStatus()`  
**Verified fix:** Consecutive-failure counting against `AuditLog` already exists, writes a `BACKUP_FAILURE_ALERT` entry (severity `critical` at 3+) after 2 consecutive failures, and `getBackupStatus()` exposes `last_backup`/`consecutive_failures`/`last_alert` for a status page. Not wired to Sentry/email, but the "no verification at all" claim is stale.

---

## 8. Architecture Observations

### 8.1 Strengths

1. **Layered deletion guardrail** — Four independent layers (role separation → DB triggers → CI grep → vault) is a robust defense-in-depth design. Most codebases have zero.
2. **Soft-delete everywhere** — `deleted_at` on all business tables. Records are never permanently gone unless the purge cron runs.
3. **Fail-closed feature gates** — `hasFeature()` returns `false` when data is missing (unlike `checkQuota()` which fail-opens). Correct design for a paid feature gate.
4. **Encryption at rest for credentials** — Per-retailer Razorpay secrets encrypted with AES-256-GCM using a master key. Follows principle of least exposure.
5. **CSRF double-submit cookie** — Admin mutations require both a cookie and a matching header. Defense-in-depth even though the API key already prevents cross-origin requests.
6. **Purge cron with FK-safe ordering** — `purge-soft-deleted.ts` deletes children before parents in cursor-batched mode. Prevents FK constraint violations.
7. **Webhook signature verification** — Both Razorpay and Meta webhooks use HMAC-SHA256 with `timingSafeEqual`. Source identity is verified before any payload is trusted.
8. **JWT verified locally, not via Supabase round-trip** — `auth.ts` verifies HS256 locally or ES256 via cached JWKS. No auth round-trip per request.

### 8.2 Architectural Gaps

1. **No service worker / offline catalog browsing** — Documented in `PRO-REQUIREMENTS.md F-006B`. The `apps/web/public/manifest.json` is icon-only metadata; there is no Serwist/Workbox cache strategy. Collection browsing requires network access.
2. **BullMQ workers co-located with API server** — Background jobs run in the same process as the Fastify API. Under heavy AI tagging load, job processing competes with request handling. Separate worker processes recommended before scale.
3. **pgvector embeddings not yet wired to product search** — The `product_embeddings` table and `embedder.ts` exist, but the semantic search route in `search.ts` may not be using vector similarity yet (to be verified). Fashion DNA AI matching is Phase 1.
4. **Wholesaler/Manufacturer schema not implemented** — Referenced in ERD and CLAUDE.md but Prisma schema shows placeholder comments only. Phase 2 tables do not exist.
5. **Single-region deployment** — Railway deploys in a single region. For India-first product, consider Mumbai region for latency. Cloudflare CDN mitigates image latency but not API latency.
6. **VTO microservice is a cold-start bottleneck** — Fashion V-Tone models (2.3GB) auto-download on first run. On Railway, cold starts on a cheap instance could take minutes. No health-check warmup documented.
7. **No database connection pooling outside Supabase** — The app uses Supabase's PgBouncer in transaction-pool mode. If PgBouncer is bypassed (e.g., direct connection for migrations), connection spikes could exhaust Supabase's connection limit.
8. **Training data retention cron built, but deletion policy not yet communicated to users** — The 180-day cleanup runs at `cleanup-training-data.ts` but there is no in-product UI showing users that their data will be deleted. DPDP Act requires clear retention disclosure.

---

## 9. Dependency & Dependency Overrides

`package.json` contains 14 explicit version overrides via `pnpm.overrides`, patching known CVEs:

| Package | Vulnerability | Fix applied |
|---------|--------------|-------------|
| `zod@<=3.22.2` | Denial of service | → 3.22.3+ |
| `esbuild@<=0.24.2` | SSRF in dev server | → 0.25.0+ |
| `fastify@<=5.8.2` | Multiple (rapid CVE cycle) | → 5.8.3+ |
| `vite@<=6.4.2` | Multiple | → 6.4.3+ |
| `uuid@<11.1.1` | Not a CVE, but deprecation path | → 11.1.1+ |
| `vitest@<3.2.6` | — | → 3.2.6+ |
| `postcss@<=8.5.17` | Multiple | → 8.5.18+ |
| `fast-uri@<=3.1.3` | Request smuggling / path confusion | → 3.1.4+ |
| `tar@<=7.5.20` | Arbitrary file write (CVE-2024-28863) | → 7.5.21+ |
| `find-my-way@<=9.6.0` | ReDoS | → 9.7.0+ |
| `brace-expansion@<1.1.16` | ReDoS | → 1.1.16+ |
| `minimatch@>=9.0.0<9.0.7` | ReDoS | → 9.0.7+ |
| `sharp@<0.35.0` | Memory leak / CVE | → 0.35.0+ |
| `ioredis` | Pinned at 5.10.1 (latest stable) | Pinned |

**Observation:** Active security maintenance is evident. The override list is long, suggesting npm audit findings are being addressed proactively.

---

## 10. Code Quality Observations

### 10.1 Good Patterns

- Zod validation on every route input — no raw request body passthrough
- `timingSafeEqual` used consistently for HMAC comparisons (webhooks, admin key)
- `Promise.allSettled` used for non-critical parallel operations (ISR revalidation, R2 deletes after consent revoke) — failures don't block the primary operation
- Cursor-based pagination on all list endpoints — prevents OFFSET performance cliff
- `AbortSignal.timeout(5000)` on outbound fetch calls — prevents hung requests
- `fileTypeFromBuffer()` for server-side MIME validation — doesn't trust client `Content-Type`
- `@paralleldrive/cuid2` IDs throughout — non-guessable, no sequential IDOR risk
- Soft-delete pattern consistent across all 8 business models

### 10.2 Code Issues

- **admin.ts is 2,545 lines** — the admin route file is a monolith. Splitting into feature-scoped modules (admin-billing.ts, admin-database.ts, admin-team.ts, etc.) is a real but sizeable refactor — **not done**, flagged back to the team to schedule rather than done blind (see action list).
- **checkout.ts is 1,087 lines** — same concern, **not done**, same reason.
- **`getReplicaPrisma()` falls back to primary silently — ✅ already fixed (verified 2026-07-27):** `packages/db/src/client.ts:29-38` already logs a `console.warn` citing B-002 when `DATABASE_URL_REPLICA` is unset before falling back. Stale finding.
- **`decryptSecret` doesn't validate format before splitting** — unchanged; the existing `if (!ivB64 || !tagB64 || !dataB64)` guard already covers the realistic malformed-input case. Low value, left as-is.
- **`masterKey()` throws at runtime if ENCRYPTION_MASTER_KEY is not set — ✅ fixed (2026-07-27):** `apps/api/src/index.ts` now checks `ENCRYPTION_MASTER_KEY` at boot and `process.exit(1)`s with a clear message instead of 500ing the first request that hits it.
- **`isNewArrival()` computes a new Date on every call** — real but negligible (single `Date` construction per row, no I/O). Skipped as not worth the diff; YAGNI.

---

## 11. Missing Features vs Documentation Claims

| Feature | Claim | Reality |
|---------|-------|---------|
| Read replica isolation | `DATABASE_URL_REPLICA` for admin | Points to primary (B-002) |
| DB guardrail triggers | Migration 037 applied | Not deployed to Supabase |
| Deletion Vault | VAULT_DATABASE_URL set | Env var missing (B-005) |
| Admin TOTP | Required per §8 | Not configured (B-004) |
| Staff login | TEAM_JWT_SECRET set | Missing (B-008) |
| ISR revalidation | REVALIDATION_SECRET set | Missing (B-009) |
| Pre-commit secrets hook | Documented in §15.4 | Not implemented |
| Backup integrity check | Documented in §13.3 | Not built |
| Disaster recovery runbook | Planned | Not written |
| Audit log for consent revocations | Flagged in §3c | Not built |
| Retailer-facing training data retention notice | Implied by DPDP | Not built |
| Admin database hub (`/admin/database`) | Documented in §14 | Not built |
| Query history persistence | Documented | ✅ Fixed 2026-07-27 (B-013) — wired to existing audit-log endpoint |
| Offline catalog browsing | F-006B | Not built (no service worker) |
| GST sequential invoice numbers | Legal requirement | Using Math.random |

---

## 12. Compliance Status

### India DPDP Act 2023

| Requirement | Status |
|-------------|--------|
| VTO photo deleted after processing | ✅ Implemented (lifecycle enforced) |
| Training consent opt-in unchecked by default | ✅ Implemented |
| Training consent revocation | ✅ Implemented (token-based) |
| Audit log of revocations | ❌ Missing (S-005) |
| 180-day training data retention cleanup | ✅ Implemented (`cleanup-training-data.ts`) |
| Retention notice to users | ❌ Not built |
| Legal review of consent copy | ❌ Pending (acknowledged in docs) |
| GST invoice for every sale | ⚠️ Invoice number not sequential (B-011) |

### PCI-DSS

| Requirement | Status |
|-------------|--------|
| Raw card numbers don't touch servers | ✅ Razorpay Checkout.js (hosted iframe) |
| SAQ-A tier maintained | ✅ By design |
| Per-retailer credentials never logged | ✅ `maskSecret()` used in admin UI |

---

## 13. Priority Action List

### Rotate credentials immediately (before any code changes)

1. `ANTHROPIC_API_KEY` — rotate at console.anthropic.com
2. `OPENAI_API_KEY` — rotate at platform.openai.com
3. Supabase `DATABASE_URL` password — change via Supabase dashboard → Settings → Database
4. `SUPABASE_SERVICE_KEY` — generate a new service role key
5. `SUPABASE_JWT_SECRET` — update in Supabase Auth → Settings → JWT Settings
6. `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` — rotate in Cloudflare R2 dashboard
7. `REDIS_URL` password — rotate in Upstash dashboard
8. `ENCRYPTION_MASTER_KEY` — generate new, re-encrypt all `IntegrationSetting` rows, update `.env`
9. `ADMIN_API_KEY` — generate new random string
10. `RAZORPAY_WEBHOOK_SECRET` — change from `kanchuki-webhook-secret` to random hex

### Already fixed — verified 2026-07-27, no action needed
(Review flagged these as open; source inspection shows all were already fixed, some before this review was even generated. Kept here so the checklist isn't re-attempted.)

- [x] **S-003** rate limit on `/v1/admin/login` (`admin.ts:101`)
- [x] **S-004** CSRF `timingSafeEqual` comparison (`admin.ts:88-93`)
- [x] **S-005** audit log on consent revocation (`consent.ts:76-87`)
- [x] **S-007 / B-012** `isIpAllowlisted` fail-closed (`admin.ts:53-58`)
- [x] **S-010** VTO/ISR concern — not applicable, result URL is client-side only
- [x] **S-012** backup failure tracking (`backup-database.ts` — `trackBackupFailure`/`getBackupStatus`)
- [x] **B-011** GST suffix via `randomBytes` (`checkout.ts:61`)
- [x] code-quality: `getReplicaPrisma()` silent fallback — now warns (`client.ts:29-38`)
- [x] **B-001** wishlist enquiry summary — already stored at heart-click (`apps/web/.../lib/wishlist.ts`, `CollectionView.tsx:144-178`); original finding pointed at the wrong app entirely

### Fixed this session (code-only, no env/secret/migration touched — see policy note below)

- [x] **S-008**: `ENCRYPTION_MASTER_KEY` now derived via `scryptSync`, not raw SHA-256 (`packages/db/src/secrets.ts`)
- [x] code-quality: startup validation added for `ENCRYPTION_MASTER_KEY` — fails fast in `apps/api/src/index.ts` instead of 500ing mid-request
- [x] **B-014**: local secret-commit guard added — `scripts/check-secrets-guard.sh` + `.githooks/pre-commit`. One-time enable: `git config core.hooksPath .githooks`. CI wiring into `.github/workflows/ci.yml` intentionally left undone — editing CI/CD config is outside this agent's operational policy (CLAUDE.md), needs a human to add the `--all` invocation as a job step.
- [x] **S-006**: `/v1/admin/login` now signs a short-lived (12h) session JWT (`jose`, already a dependency — reused from `team-auth.ts`'s pattern) instead of returning the permanent `ADMIN_API_KEY`. Signing secret is derived from `ADMIN_API_KEY` itself, so no new env var to configure/rotate. `validAdminKey()` still accepts the raw static key too, so scripts/tests/direct API callers are unaffected — only the browser login path changed. `admin.login.test.ts` updated + extended to prove the returned token authenticates.
- [x] **B-013**: query history is now durable, not session-only. `apps/web/.../database/query/page.tsx` fetches `GET /admin/audit-logs?resource_type=DatabaseQuery` on mount instead of reading `sessionStorage` — reuses the existing audit-log endpoint (every query already wrote a `QUERY`/`QUERY_ERROR` AuditLog row; only the frontend wiring was missing). No new backend route. Caveat: `query_preview` is truncated to 500 chars in the stored metadata, so "load history entry" on a very long historical query restores a truncated version — acceptable, not worth a schema change for. `docs/SECURITY.md §14.1` still says "not built" — left unedited; that doc's governance sections (§12-18) require human sign-off per CLAUDE.md, so update it yourself when convenient.

### Blocked by operational policy — needs a human to run these (env vars / prod secrets / migrations)

- [ ] Rotate all credentials listed in §13 (Anthropic, OpenAI, Supabase, R2, Redis keys)
- [ ] **B-003**: Generate scrypt admin password hash, replace ADMIN_PASSWORD_HASH
- [ ] **B-004**: Configure ADMIN_TOTP_SECRET, enforce 2FA
- [ ] **B-005**: Set VAULT_DATABASE_URL to Railway Postgres-PYkI
- [x] **B-006**: Migration 037 applied via Supabase SQL Editor (2026-07-28) — guard triggers on all 8 tables confirmed via `information_schema.triggers`. Applied as an idempotent `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` variant since some triggers had partially landed from an earlier attempt.
- [ ] **B-007**: Switch DATABASE_URL to kanchuki_app restricted role
- [ ] **B-002**: Provision actual read replica, set distinct DATABASE_URL_REPLICA
- [ ] **B-008**: Set TEAM_JWT_SECRET
- [ ] **B-009**: Set REVALIDATION_SECRET in API + Web envs
- [x] **B-010**: Local `.env` fixed 2026-08-01 — production Railway env still needs same manual update
- [ ] **S-009**: Replace `RAZORPAY_WEBHOOK_SECRET` dictionary phrase with `openssl rand -hex 32`

### §15 offline-first build — done this session (2026-07-27), see §15 for full detail

- [x] **A-1**: `networkMode: 'offlineFirst'` on queries + mutations (`apps/mobile/app/_layout.tsx`)
- [x] **A-2**: catalog list query bumped to `staleTime: 10min` / `gcTime: 24h` (`apps/mobile/app/(tabs)/catalog.tsx`)
- [x] **A-3**: proactive online/offline detection — `useNetworkStatus.ts` hook added; `NetworkBanner.tsx` already had the same `onlineManager` logic inline, so the doc's gap was already closed independently
- [x] **A-4**: `prefetchProductImages()` (already existed, unused) wired into `catalog.tsx` after the product list loads
- [x] **A-5**: offline mutation queue for "Mark Sold" — `apps/mobile/src/lib/mutation-queue.ts` + `useSyncQueue.ts`, replays on reconnect. **Deviation from plan:** used the existing `expo-file-system` JSON-file pattern (same as `offline-persister.ts`) instead of `react-native-mmkv` — MMKV was never actually installed (doc's claim it was in `package.json` was wrong), and adding it would mean a native rebuild for no real benefit at this queue size.
- [x] **B-1**: PWA manifest icons — generated via `sharp` (already a dependency, `packages/ai`) instead of sourcing external art; `apps/web/public/icons/icon-{192,512}.png` + `manifest.json` updated
- [x] **B-2**: Serwist runtime caching in `apps/web/src/app/sw.ts` — `CacheFirst` for R2 product images (7-day/200-entry expiry), `StaleWhileRevalidate` for `/api/c/*` (the actual same-origin pagination route — `/v1/public/collections/` from the original plan is server-side only and never touches the SW), `NetworkFirst` (3s timeout) for `/c/*` pages
- [x] **B-3**: offline fallback — `apps/web/src/app/offline/page.tsx` + Serwist `fallbacks.entries` precached at install time
- [x] **B-4 — corrected, not built as planned**: the plan assumed enquiry submission is a `fetch()` POST that can fail offline and needs a localStorage retry queue. It isn't — `CollectionView.tsx`/`ProductDetailSheet.tsx` build a `wa.me` deep link (`buildWhatsAppEnquiryLink`) and hand off to WhatsApp; there is no Kanchuki backend call in that path, and WhatsApp queues the message itself if the phone has no signal. Same shape of stale assumption as S-010. No queue file added — building one would be dead code with no caller.

Verified: `pnpm --filter @kanchuki/web typecheck`, `pnpm --filter @kanchuki/web build` (SW bundled successfully — unrelated pre-existing lint error in `admin/settings/notifications/page.tsx`, not touched), `pnpm --filter @kanchuki/mobile typecheck`, mobile catalog test suite all pass.

### Still open — real work, sized bigger than a drive-by fix (needs prioritization)

- [ ] Split admin.ts (2,545 lines) / checkout.ts (1,087 lines) into feature-scoped modules (large mechanical refactor)
- [ ] **S-011**: Mobile CSP — low value; `expo-web-browser` opens the system browser, not an in-process WebView, so exposure is smaller than stated. Recommend downgrading to informational.

### Pre-pilot audit findings — fixed 2026-07-28

- [x] **New finding — `order_items` had no RLS policy.** `031_l2_ecommerce_checkout` added RLS to `orders` and `retailer_payment_accounts` but not their own `order_items` child table — inconsistent with every other join/child table in the schema (`collection_products`, `product_variants`, etc.). Fixed in `packages/db/prisma/migrations/038_order_items_rls/migration.sql`: RLS enabled, policy scopes via `order_id → orders.retailer_id → auth.uid()`. Applied live via Supabase SQL Editor and verified (`rowsecurity = true`, policy `retailer_own_order_items` present).
- Found during the same audit, not yet acted on: mobile/web `.env.local` point at an ephemeral VS Code devtunnel URL (pilot-blocking if it closes mid-test), `apps/mobile/.env` falls back to `localhost` (dead on a retailer's own phone), migration `034_product_sizes` apply-status unverified, `packages/db/dist` can go stale if `apps/api` tests are run with bare `npx vitest` instead of `pnpm test`/`turbo test`, `@fastify/cookie` secret registered but unused (dead config, not a live vuln).

---

## 14. Summary Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Architecture** | 8/10 | Solid monorepo, clean tenant isolation, well-thought deletion guardrails |
| **Security Design** | 7/10 | Good model on paper; critical gaps in deployment (TOTP off, weak passwords, credentials exposed) |
| **Code Quality** | 7/10 | Consistent patterns, good validation, but admin.ts is a 2500-line monolith |
| **Database** | 8/10 | pgvector, soft-delete everywhere, vault, RLS; replica config is wrong |
| **Infrastructure** | 6/10 | Railway single-region, backup not configured, guardrail triggers not deployed |
| **Compliance** | 6/10 | DPDP acknowledged but revocation audit, retention notice, sequential invoices missing |
| **Testing** | 7/10 | Security tests exist (`security.test.ts`, `admin.login.test.ts`), delete guard in CI; no E2E coverage |
| **Documentation** | 9/10 | Exceptionally thorough CLAUDE.md, SECURITY.md, DATABASE.md — best-in-class for a startup |

**Overall: Production-ready architecture, pre-production deployment configuration.** The codebase demonstrates serious engineering discipline (layered guardrails, encryption, audit trails, soft-delete, consent flows). The blocking issues before launch are operational: rotating exposed credentials, enabling TOTP, configuring the vault, and applying the guardrail migration.

---

*Document generated by OMP AI Review Engine — 2026-07-27*  
*Re-run review after: credential rotation, TOTP enablement, replica provisioning, migration 037 deployment*

---

## 15. Offline-First Architecture — Current State, Gaps & Build Plan

**Question asked:** Is offline-first built in this app? Can it be added without breaking anything?  
**Answer:** Partially built on mobile, shell-only on web. The foundation is already in place on both platforms. Adding full offline-first support is achievable in ~2 weeks of focused work with zero breaking changes.

---

### 15.1 What "Offline-First" Means for Kanchuki

Two distinct user surfaces, two distinct goals:

| Surface | User | Offline Goal |
|---------|------|-------------|
| **Retailer Mobile App** (React Native) | Retailer standing inside the shop, possibly poor 4G | Browse full catalog, filter, search, check product location, check stock status — without any network call |
| **Customer Web (PWA)** | Customer received a WhatsApp link, opens on phone in a basement/elevator/low signal area | Open the collection link, browse all product photos, read prices, add to wishlist — without any network call after first load |

---

### 15.2 What Is Already Built (Confirmed From Code)

#### Mobile (React Native Expo) — ~60% done

| Component | File | What It Does | Gap |
|-----------|------|-------------|-----|
| **Filesystem cache persister** | `apps/mobile/src/lib/offline-persister.ts` | Serializes the entire React Query cache to `kanchuki-cache/rq-cache.json` via `expo-file-system`. On next app launch, `restoreQueryCache()` rehydrates the query client before the first render. | Persists all cached queries indiscriminately — no TTL per query type. Old prices survive indefinitely offline. |
| **In-memory GET cache** | `apps/mobile/src/lib/request-cache.ts` | Deduplicates concurrent fetches. Caches successful GET responses in memory for 30s. 10s request timeout (fits 3G budget). | No offline queue for mutations. No storage — memory cache is lost on process kill. |
| **QueryClient tuned for slow networks** | `apps/mobile/app/_layout.tsx:14-26` | `staleTime: 60s` (no immediate refetch on mount), `gcTime: 5min`, `retry: 2`, exponential backoff, `refetchOnReconnect: true`. | `networkMode` not set — React Query's default (`online`) pauses queries instead of serving cache when offline. |
| **Cache persist-on-background** | `apps/mobile/app/_layout.tsx:60-83` | `AppState` listener writes the RQ cache to disk when the app backgrounds or loses focus. | No foreground sync check on resume — relies on `refetchOnReconnect` only. |
| **Auth token in SecureStore** | `apps/mobile/src/lib/storage.ts` | Auth token survives app kill. In-memory cache over SecureStore (one disk read per key per launch). | JWT expires after 15 min — if offline for >15 min, next request will 401. Need to check expiry before firing authenticated requests offline. |
| **NetworkBanner component** | `apps/mobile/src/components/NetworkBanner.tsx` | Visible offline indicator in the app UI. | Not confirmed whether it uses `@react-native-community/netinfo` or just catches errors. |
| **MMKV for fast storage** | `react-native-mmkv` in mobile `package.json` | Synchronous key-value store (10x faster than AsyncStorage). Currently used for catalog cache. | Not confirmed whether the offline persister uses MMKV or just expo-file-system JSON. MMKV is better for frequent writes. |

#### Customer Web (Next.js PWA) — ~20% done

| Component | File | What It Does | Gap |
|-----------|------|-------------|-----|
| **Serwist service worker** | `apps/web/src/app/sw.ts` + `next.config.mjs` | `@serwist/next` v9 installed and wired. Service worker compiled from `sw.ts`. Precaches the Next.js app shell (JS bundles, fonts, framework chunks). `skipWaiting: true`, `clientsClaim: true`. | Uses only `defaultCache` — no custom runtime caching strategies for product images (R2 CDN), collection API responses, or product detail pages. Service worker exists but is not an offline-capable cache. |
| **ISR on collection pages** | `apps/web/src/app/c/[slug]/page.tsx` | `fetch(url, { next: { revalidate: 60 } })` — Next.js caches the collection server response for 60s. Fast for repeat visitors via CDN edge. | ISR cache lives on the server (Railway/Vercel), not on the user's device. If a customer opens the link offline after a session, there is no local copy to serve. |
| **Wishlist in localStorage** | `apps/web/src/app/c/[slug]/lib/wishlist.ts` | Favorite product IDs persisted in `localStorage`. Works offline without a network call. | Stores bare IDs only — see Bug B-001 in §6. No offline product detail data stored alongside. |
| **Cart in localStorage** | `apps/web/src/app/c/[slug]/lib/cart.ts` | Cart items persisted in `localStorage`. | Same as wishlist. |
| **manifest.json incomplete** | `apps/web/public/manifest.json` | Has `name`, `short_name`, `display: standalone`, `start_url`. | Missing `icons` array — no icons defined means the browser's "Add to Home Screen" prompt will not fire on Android Chrome. Without icons, the PWA install is broken. |

---

### 15.3 What Is Missing (Gaps to Close)

#### Mobile gaps

1. **`networkMode: 'offlineFirst'` not set** — React Query's default is `networkMode: 'online'`. When the device goes offline, queries are paused rather than served from cache. The correct value is `'offlineFirst'` which always reads cache first and only attempts network when the cache is empty/stale.
2. **No mutation queue for offline writes** — If a retailer marks a product as SOLD or updates a price while offline, the mutation fires and immediately fails. The change is lost. A queue (using MMKV or the persister) should buffer writes and replay them when the network returns.
3. **JWT expiry check missing before offline reads** — The offline persister may restore a cache that includes authenticated API responses (products, customers), but the JWT itself may be expired. A check at app start (`decodeJwtPayload(token)?.exp > Date.now()/1000`) should skip auth-refresh if we already know the token is valid, or pre-populate the refresh before going into offline mode.
4. **No image prefetch for offline** — Product photos are loaded lazily via presigned R2 URLs with 1-hour expiry. When offline, the images cannot be fetched. For a catalog-browsing scenario, the most recently viewed product photos should be prefetched into the native image cache via `expo-image`'s `prefetch()`.
5. **No network status via NetInfo** — It is unclear if `NetworkBanner` uses `@react-native-community/netinfo` (true network state) or just catches fetch errors (reactive, not proactive). NetInfo gives proactive offline detection and network type (WiFi/4G/2G/offline) so the app can downgrade image quality on 2G.

#### Customer Web gaps

1. **No runtime caching for product images** — Serwist is installed but `defaultCache` only caches Next.js static assets. Product images are served from `*.r2.dev` (Cloudflare R2 CDN). These are not in the precache manifest and not covered by any runtime caching rule. Offline = broken images.
2. **No runtime caching for collection API responses** — The `/api/c/[slug]/products` route fetches product data client-side for pagination. This response is not cached in the service worker. After first load, refreshing offline shows a blank product grid.
3. **No offline fallback page** — When a customer opens a collection link without internet and the service worker has no cached version, they see the browser's default "No internet" screen instead of a branded offline page.
4. **PWA icons missing** — `manifest.json` has no `icons` array. Android Chrome requires at least a 192×192 icon to trigger the Add to Home Screen prompt. Without this, the app is not installable.
5. **No background sync for enquiry queue** — If a customer tries to submit an enquiry while offline, the request fails. The enquiry should be queued in localStorage and replayed when online.

---

### 15.4 How to Build It — Complete Plan (No Breaking Changes)

All changes below are purely additive. No existing routes, schemas, or APIs change. The offline layer slots in between the UI and the network.

---

#### PART A: Mobile — Retailer App (React Native Expo)

**Estimated effort: 3-4 days**

**Step A-1: Switch networkMode to offlineFirst**

```typescript
// apps/mobile/app/_layout.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'offlineFirst',  // ← ADD THIS
      staleTime: 60_000,
      gcTime: 5 * 60 * 1000,
      retry: 2,
      retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 10_000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      networkMode: 'offlineFirst',  // ← ADD THIS — mutations queue instead of fail
    },
  },
})
```

One line per config. Zero breaking changes. React Query will now serve stale cache immediately when offline instead of freezing queries.

---

**Step A-2: Increase catalog staleTime — catalog data is stable**

Products don't change every minute. A retailer's catalog browsing offline should show yesterday's data without stale warnings.

```typescript
// apps/mobile/src/lib/api.ts — wrap catalog queries with longer staleTime
// In the useQuery calls for productApi.list(), set:
staleTime: 10 * 60 * 1000,   // 10 min for product lists
gcTime: 24 * 60 * 60 * 1000, // 24h — survive background kill
```

Specifically, in `apps/mobile/app/(tabs)/catalog.tsx` where `useQuery` calls `productApi.list()`, pass these options. No API contract changes.

---

**Step A-3: Add @react-native-community/netinfo + NetInfoBanner**

`@react-native-community/netinfo` is already compatible with Expo SDK 52 (no native module rebuild needed — it's a JS package with optional native hooks).

```bash
# Install (in apps/mobile)
pnpm add @react-native-community/netinfo
```

```typescript
// apps/mobile/src/hooks/useNetworkStatus.ts  (NEW FILE)
import { useNetInfo } from '@react-native-community/netinfo';

export function useNetworkStatus() {
  const { isConnected, type } = useNetInfo();
  return {
    isOnline: isConnected ?? true,     // optimistic default
    isLowBandwidth: type === 'cellular' && ['2g', '3g'].includes(type),
  };
}
```

Wire into the existing `NetworkBanner` component to replace any error-reactive check with a proactive state-based one.

---

**Step A-4: Product image prefetch for recently-viewed catalog**

```typescript
// apps/mobile/src/lib/image-prefetch.ts  (NEW FILE)
import { Image } from 'expo-image';

/** Prefetch the first N product photos into Expo Image's disk cache. */
export async function prefetchProductImages(
  products: Array<{ primary_photo_url: string | null }>,
  limit = 30,
): Promise<void> {
  const urls = products
    .slice(0, limit)
    .map((p) => p.primary_photo_url)
    .filter(Boolean) as string[];

  await Image.prefetch(urls, { cachePolicy: 'disk' });
}
```

Call this in `catalog.tsx` after the product list query succeeds:

```typescript
// In the useQuery onSuccess / useEffect after data is loaded:
useEffect(() => {
  if (products?.length) {
    prefetchProductImages(products).catch(() => {}); // fire-and-forget
  }
}, [products]);
```

`expo-image` stores the fetched images in a persistent disk cache that survives app restarts. When offline, the images render from cache — no broken image icons.

---

**Step A-5: Offline mutation queue for product status changes**

This is the most complex piece. When a retailer marks a product as SOLD while offline, the change should persist locally and sync when reconnected.

```typescript
// apps/mobile/src/lib/mutation-queue.ts  (NEW FILE)
import { MMKV } from 'react-native-mmkv';

const store = new MMKV({ id: 'offline-mutations' });
const QUEUE_KEY = 'pending_mutations';

interface PendingMutation {
  id: string;           // cuid2 — idempotency key
  path: string;         // e.g. '/v1/products/abc123/status'
  method: string;       // 'PATCH'
  body: unknown;
  queuedAt: number;
}

export function enqueueMutation(m: Omit<PendingMutation, 'id' | 'queuedAt'>): void {
  const queue = getQueue();
  const entry: PendingMutation = {
    ...m,
    id: Math.random().toString(36).slice(2), // replace with cuid2 when @paralleldrive/cuid2 is available in RN
    queuedAt: Date.now(),
  };
  store.set(QUEUE_KEY, JSON.stringify([...queue, entry]));
}

export function getQueue(): PendingMutation[] {
  const raw = store.getString(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function dequeue(id: string): void {
  const queue = getQueue().filter((m) => m.id !== id);
  store.set(QUEUE_KEY, JSON.stringify(queue));
}

export function clearQueue(): void {
  store.delete(QUEUE_KEY);
}
```

Wire into `useNetworkStatus` — when `isOnline` flips from `false` → `true`, replay the queue:

```typescript
// apps/mobile/src/hooks/useSyncQueue.ts  (NEW FILE)
import { useEffect, useRef } from 'react';
import { useNetworkStatus } from './useNetworkStatus';
import { getQueue, dequeue } from '../lib/mutation-queue';
import { request } from '../lib/api'; // existing helper

export function useSyncQueue() {
  const { isOnline } = useNetworkStatus();
  const wasOfflineRef = useRef(!isOnline);

  useEffect(() => {
    if (isOnline && wasOfflineRef.current) {
      // Just came back online — replay queue
      const queue = getQueue();
      queue.forEach(async (m) => {
        try {
          await request(m.path, { method: m.method, body: JSON.stringify(m.body) });
          dequeue(m.id);
        } catch {
          // Leave in queue — retry next reconnect
        }
      });
    }
    wasOfflineRef.current = !isOnline;
  }, [isOnline]);
}
```

Mount `useSyncQueue()` in the root `_layout.tsx` — one call, always active.

---

#### PART B: Customer Web — PWA (Next.js + Serwist)

**Estimated effort: 3-4 days**

**Step B-1: Fix manifest.json — add icons (required for installability)**

Generate icons at 192×192 and 512×512 PNG. Place in `apps/web/public/icons/`.

```json
// apps/web/public/manifest.json — complete replacement
{
  "name": "Kanchuki",
  "short_name": "Kanchuki",
  "description": "AI-powered fashion collections for Indian clothing stores",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#FAFAFA",
  "theme_color": "#0891B2",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ],
  "categories": ["shopping", "fashion"]
}
```

---

**Step B-2: Add runtime caching strategies to the service worker**

Replace the minimal `sw.ts` with a strategy-aware one. All changes are in `apps/web/src/app/sw.ts` only — no other file changes:

```typescript
// apps/web/src/app/sw.ts — complete replacement (zero API/route changes)
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist, NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[];
  }
}
declare const self: WorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // 1. Product images from Cloudflare R2 — CacheFirst (images don't change after upload)
    {
      matcher: ({ url }) => url.hostname.endsWith('.r2.dev') || url.hostname.endsWith('.r2.cloudflarestorage.com'),
      handler: new CacheFirst({
        cacheName: 'product-images',
        plugins: [
          {
            // Max 200 images, max 7 days
            cacheWillUpdate: async ({ response }) =>
              response.status === 200 ? response : null,
          },
        ],
      }),
    },
    // 2. Collection API responses — StaleWhileRevalidate (show cache instantly, update in background)
    {
      matcher: ({ url }) =>
        url.pathname.startsWith('/api/c/') || url.pathname.startsWith('/v1/public/collections/'),
      handler: new StaleWhileRevalidate({
        cacheName: 'collection-api',
      }),
    },
    // 3. Collection page HTML — NetworkFirst with offline fallback
    {
      matcher: ({ url }) => url.pathname.startsWith('/c/'),
      handler: new NetworkFirst({
        cacheName: 'collection-pages',
        networkTimeoutSeconds: 3, // fall back to cache after 3s (handles slow 2G)
      }),
    },
    // 4. Everything else — Next.js defaults
    ...defaultCache,
  ],
});

serwist.addEventListeners();
```

**Why each strategy:**
- `CacheFirst` for images: product photos never change once shot. Cache forever, no network hit on re-visits.
- `StaleWhileRevalidate` for API: customer sees the last-known product list instantly, then data updates silently in the background. Ideal for 2G.
- `NetworkFirst` with 3s timeout for pages: tries network first (fresh data), but falls back to cache after 3 seconds. Prevents hanging on 2G.

---

**Step B-3: Add offline fallback page**

```typescript
// apps/web/src/app/offline/page.tsx  (NEW FILE)
export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">You're offline</h1>
      <p className="text-gray-500 mb-4">
        No internet connection. If you've visited this collection before, try refreshing — your device may have a cached copy.
      </p>
      <p className="text-sm text-gray-400">Products you've favorited are still saved on your device.</p>
    </div>
  );
}
```

Register this as the fallback in `sw.ts`:

```typescript
// In sw.ts serwist config, add:
fallbacks: {
  document: '/offline',
}
```

---

**Step B-4: Offline enquiry queue (background sync)**

When a customer submits an enquiry while offline, queue it in localStorage and replay on reconnect:

```typescript
// apps/web/src/app/c/[slug]/lib/enquiry-queue.ts  (NEW FILE)
const QUEUE_KEY = 'kanchuki_enquiry_queue';

interface QueuedEnquiry {
  id: string;
  collectionSlug: string;
  message: string;
  queuedAt: number;
}

export function enqueueEnquiry(slug: string, message: string): void {
  const queue: QueuedEnquiry[] = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
  queue.push({ id: crypto.randomUUID(), collectionSlug: slug, message, queuedAt: Date.now() });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function getEnquiryQueue(): QueuedEnquiry[] {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
}

export function dequeueEnquiry(id: string): void {
  const queue = getEnquiryQueue().filter((e) => e.id !== id);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}
```

In the enquiry submit handler inside `CollectionView.tsx`, when the fetch fails, call `enqueueEnquiry()` instead of showing an error. On page load, drain the queue.

---

### 15.5 What Changes, What Doesn't

| Layer | Changes | Stays the Same |
|-------|---------|----------------|
| **Mobile QueryClient** | `networkMode: 'offlineFirst'` added | All existing queries, APIs, screens |
| **Mobile cache persister** | Unchanged | Already works |
| **Mobile mutations** | New `mutation-queue.ts` + `useSyncQueue` hook | All existing mutation calls |
| **Mobile images** | New `image-prefetch.ts` called post-query | All image rendering components |
| **Web service worker** | `sw.ts` gains 3 runtime caching strategies | API routes, pages, Fastify backend |
| **Web manifest** | Icons added | Everything else |
| **Web offline page** | New `/offline/page.tsx` | All other pages |
| **Web enquiry queue** | New `enquiry-queue.ts` + drain on load | Enquiry API endpoint |
| **Backend (Fastify)** | **Zero changes** | All routes, DB, auth |
| **Database (Prisma/Supabase)** | **Zero changes** | All schemas, migrations |
| **Admin panel** | **Zero changes** | All admin features |

**Zero API changes. Zero schema changes. Zero risk of breaking existing functionality.**

---

### 15.6 Implementation Order (Sequenced to Ship Value Early)

```
Day 1:  A-1 (networkMode) + A-2 (staleTime) — immediate offline read improvement, 30-min change
Day 2:  B-1 (manifest icons) + B-2 (sw.ts runtime cache) — customer PWA becomes installable and works offline
Day 3:  A-3 (NetInfo hook) + A-4 (image prefetch) — retailer sees offline banner, images load offline
Day 4:  B-3 (offline fallback page) + B-4 (enquiry queue) — customer graceful degradation complete
Day 5-6: A-5 (mutation queue + sync hook) — retailer can mark SOLD/RESERVED offline
Day 7:  Test: airplane mode both surfaces. Verify: catalog loads, images load, enquiry queues, mutations replay.
```

---

### 15.7 Honest Limits (What Offline Cannot Cover)

| Scenario | Offline? | Why |
|----------|----------|-----|
| Browse catalog (read) | ✅ Yes — after first load | Data is in React Query cache / SW cache |
| View product photos | ✅ Yes — after first view | expo-image disk cache / SW CacheFirst |
| Filter/search catalog | ✅ Yes | Client-side filter over cached data |
| Mark product SOLD | ✅ Yes (queued) | Syncs on reconnect |
| Add customer to CRM | ⚠️ Queued | Mutation replays, but conflict possible if same customer added twice |
| AI product tagging | ❌ No | Requires Anthropic API |
| Virtual Try-On | ❌ No | Requires V-Tone inference server |
| Subscription billing | ❌ No | Requires Razorpay |
| Admin panel | ❌ No | Not the offline target surface |
| Initial app load (fresh install) | ❌ No | Need one online session to seed cache |

---

### 15.8 Dependencies to Add

| Package | Surface | Size impact | Purpose |
|---------|---------|-------------|---------|
| `@react-native-community/netinfo` | Mobile | ~30KB | True network state (WiFi/4G/2G/offline) |
| No new web deps | Web | 0KB | Serwist already installed and configured |

No backend dependencies. No database changes. One mobile package.

---

*Offline-first section added 2026-07-27. Feature ID: F-006B (Customer PWA) + F-mobile-offline (Retailer App)*
