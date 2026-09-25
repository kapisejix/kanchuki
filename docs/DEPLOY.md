# Kanchuki — Deployment Guide

**Target:** Railway (api.kanchuki.app + kanchuki.app)  
**Stack:** Node.js 20 · pnpm · Turborepo · PostgreSQL 16 · Redis  
**Why Railway (host comparison + mobile app store launch steps):** `docs/references/guides/hosting-and-app-store.md`

---

## Prerequisites

| Resource | Required For | Where to Get |
|----------|-------------|--------------|
| Railway account | Hosting | [railway.app](https://railway.app) |
| GitHub repo | CI/CD | Already connected |
| Supabase project | Auth | [supabase.com](https://supabase.com) |
| Cloudflare R2 bucket | Image storage | [cloudflare.com](https://cloudflare.com) |
| Upstash Redis | Queue + Cache | [upstash.com](https://upstash.com) |
| Razorpay account | Subscriptions | [razorpay.com](https://razorpay.com) |
| (None — V-Tone runs on CPU alongside API server) | Self-hosted Fashion V-Tone v1.5 (~$0.0003/try-on on CPU) | — |

---

## Step 1: Create Railway Project

1. Go to [Railway Dashboard → New Project](https://railway.app/new)
2. Select **Deploy from GitHub repo**
3. Choose your Kanchuki repository
4. Railway will detect the monorepo — **do not** let it auto-create services yet

## Step 2: Create Services

Create **two separate services** within the project:

### Service 1: API (`@kanchuki/api`)

1. **Railway Dashboard → New → Add a service → GitHub repo**
2. Set **Root Directory** to `.` (repo root)
3. Add environment variable: `NIXPACKS_TURBO_APP_NAME=@kanchuki/api`
4. Add all required env vars (see [Environment Variables](#environment-variables) below)

### Service 2: Web (`@kanchuki/web`)

1. **Railway Dashboard → New → Add a service → GitHub repo**
2. Set **Root Directory** to `.` (repo root)
3. Add environment variable: `NIXPACKS_TURBO_APP_NAME=@kanchuki/web`
4. Add all required env vars (see [Environment Variables](#environment-variables) below)

> **Why root directory `.`?** Both services depend on workspace packages
> (`@kanchuki/shared`, `@kanchuki/db`, `@kanchuki/ai`). Setting root to `.`
> lets Railway access the full monorepo. The `NIXPACKS_TURBO_APP_NAME` env var
> tells Turborepo which package to build for each service.

---

## Step 3: Set Up PostgreSQL + Redis

### Database (via Railway's PostgreSQL plugin)

1. **Railway Dashboard → New → Database → PostgreSQL**
2. Copy the `DATABASE_URL` from the plugin's **Connect** tab
3. Add a connection pooler URL:
   - The plugin provides both direct and pooled URLs
   - Use the pooled URL as `DATABASE_URL_POOLER` for the API service
4. Run initial migration (from local machine after Railway PostgreSQL is running):
   ```bash
   # Replace with actual Railway DATABASE_URL from the PostgreSQL plugin
   DATABASE_URL="<railway-db-url>" pnpm db:migrate
   ```
   Or push the schema directly:
   ```bash
   DATABASE_URL="<railway-db-url>" pnpm --filter @kanchuki/db db:push
   ```

### Redis (via Upstash — not available as Railway plugin)

1. Create a free Redis database at [upstash.com](https://upstash.com)
2. Copy the `REDIS_URL` (format: `redis://default:password@host:port`)
3. Add as env var to the **API** service only

---

## Step 4: Configure Supabase Auth

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Get your project URL and `service_role` key from **Project Settings → API**
3. Configure **Auth → Settings** in Supabase dashboard:
   - Enable phone auth (SMS/OTP)
   - Add Railway API URL to redirect URLs: `https://api.kanchuki.app`
   - Add Railway Web URL: `https://kanchuki.app`

---

## Step 5: Set Up Cloudflare R2

1. Create an R2 bucket at [cloudflare.com](https://cloudflare.com)
2. Generate API tokens with **Object Read & Write** permissions
3. Configure a custom domain or use the public R2.dev URL

---

## Step 6: Configure Razorpay

1. Create a Razorpay account at [razorpay.com](https://razorpay.com)
2. Get API Key ID and Key Secret from **Settings → API Keys**
3. Set up webhook endpoint: `https://api.kanchuki.app/v1/billing/webhook`
   - Subscribe to events: `subscription.activated`, `subscription.charged`,
     `subscription.halted`, `subscription.cancelled`, `subscription.completed`
4. Create plan IDs in Razorpay dashboard for each plan/period combo

---

## Environment Variables

### API Service (`@kanchuki/api`)

```bash
# Required
NODE_ENV=production
PORT=3001
# ⚠️ Supabase pooler usernames MUST be <role>.<project_ref> — bare `kanchuki_app`
# is rejected with "password authentication failed". Example:
#   DATABASE_URL=postgresql://kanchuki_app.thpqcylmcxokajxoerjx:<pw>@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DATABASE_URL="postgresql://..."
DATABASE_URL_POOLER="postgresql://..."
# F-017: scoped purge-role URL — read ONLY by the 30-day purge cron
# (apps/api/src/jobs/purge-soft-deleted.ts via getPurgePrisma()). Role:
# kanchuki_purge — DELETE on the purge tables only, no DDL. Without this var
# the cron falls back to the main client and fails with permission denied.
PURGE_DATABASE_URL="postgresql://kanchuki_purge...@aws-1-ap-south-1.pooler.supabase.com:5432/postgres"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_KEY="..."
REDIS_URL="redis://..."

# Cloudflare R2
R2_ACCOUNT_ID=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_BUCKET_NAME="kanchuki-prod"
R2_PUBLIC_URL="https://pub-xxx.r2.dev"

# AI APIs
ANTHROPIC_API_KEY="..."
OPENAI_API_KEY="..."

# Meta (F-031 social publishing + Phase II WhatsApp catalog sync)
# getSecret-first: these can be set as IntegrationSetting rows (admin panel) or env vars.
META_APP_ID=""                          # Meta for Developers App ID
META_APP_SECRET=""                      # App Secret — signs webhook payloads (X-Hub-Signature-256)
META_WHATSAPP_BUSINESS_ACCOUNT_ID=""    # WABA ID (numeric) — owns the product catalog
META_WEBHOOK_SECRET=""                  # Webhook verify token (GET handshake, see below)
CATALOG_SYNC_CRON="0 5 * * *"           # Daily full-sync cron (UTC, 5-field); default 5:00 AM

# Virtual Try-On (Fashion V-Tone v1.5 — runs on CPU, ~$0.0003/try-on)
# Deploy the V-Tone microservice: see services/fashion-vtone/
VTONE_API_URL="http://localhost:8000"

# Razorpay
RAZORPAY_KEY_ID="rzp_live_xxx"
RAZORPAY_KEY_SECRET="..."
RAZORPAY_WEBHOOK_SECRET="..."

# URLs
API_URL="https://api.kanchuki.app"
WEB_URL="https://kanchuki.app"

# Admin access
ADMIN_API_KEY="generate-a-random-secret-key"

# Razorpay plan IDs (created in Razorpay dashboard)
RAZORPAY_PLAN_STARTER_MONTHLY="plan_xxx"
RAZORPAY_PLAN_STARTER_ANNUAL="plan_xxx"
RAZORPAY_PLAN_GROWTH_MONTHLY="plan_xxx"
RAZORPAY_PLAN_GROWTH_ANNUAL="plan_xxx"
RAZORPAY_PLAN_PRO_MONTHLY="plan_xxx"
RAZORPAY_PLAN_PRO_ANNUAL="plan_xxx"

# Monitoring (optional)
SENTRY_DSN=""
AXIOM_TOKEN=""
AXIOM_DATASET="kanchuki-prod-logs"

# Turborepo — tells Railway which package to build
NIXPACKS_TURBO_APP_NAME=@kanchuki/api
```

### Web Service (`@kanchuki/web`)

```bash
# Required
NODE_ENV=production
NEXT_PUBLIC_API_URL="https://api.kanchuki.app"
NEXT_PUBLIC_SITE_URL="https://kanchuki.app"

# Turborepo
NIXPACKS_TURBO_APP_NAME=@kanchuki/web
```

> **Note:** `NEXT_PUBLIC_*` vars are baked into the JS bundle at build time.
> If they change, the web service must rebuild.

---

## Step 7: Configure Domains

1. **API:** Railway Dashboard → API Service → Settings → Domains
   - Add `api.kanchuki.app` (or your subdomain)
   - Update your DNS to point to Railway

2. **Web:** Railway Dashboard → Web Service → Settings → Domains
   - Add `kanchuki.app` (your main domain)
   - Update your DNS

---

## Step 8: Verify Deployment

### Health Check

```bash
curl https://api.kanchuki.app/health
# → { "status": "ok", "ts": 1700000000000 }
```

### Landing Page

```bash
curl -s https://kanchuki.app | head -5
# → Should return HTML with Kanchuki landing page
```

### Public Endpoints

```bash
# Public stats
curl https://api.kanchuki.app/v1/public/stats
# → { "data": { "total_products": 0, ... } }

# Public collection (once created)
curl https://kanchuki.app/c/your-collection-slug
```

---

## CI/CD Pipeline

The CI workflow (`.github/workflows/ci.yml`) runs on every push/PR:

| Job | What it does |
|-----|-------------|
| `quality` | TypeScript check, lint, unit tests |
| `build` | Production build of API + Web (verifies code compiles for deploy) |

### ⚠️ DEPLOYMENT RULE: GitHub-Only — NO Local `railway up`

**ALL production deploys MUST come from GitHub. Never run `railway up` from a local machine.**

Why: `railway up` from a laptop ships whatever is on *that machine* — not what's on GitHub.
If the local copy is stale, the deploy ships stale code. Every past "why isn't my change live"
incident traced back to a local `railway up` that overwrote the GitHub-deployed version.

**The correct deployment flow is:**
1. Push code to GitHub `main` (via PR merge or direct push)
2. Railway detects the push (Settings → Source → GitHub repo connected)
3. Builds only the changed services (via `watchPatterns` in `railway.json`)
4. Runs `pnpm build --filter=@kanchuki/api` (or `web`)
5. Starts with `node apps/api/dist/index.js` (API) or `pnpm --filter @kanchuki/web start` (web)
6. Health check passes → traffic routed to new version

Railway's dashboard confirms the deploy source: **"Deployed via GitHub"** = correct,
**"Deployed via CLI / railway up"** = someone ran it locally (wrong).

### Manual Deploy (Dashboard Only)

If you need to redeploy without a code change (e.g., env var update):
1. Go to Railway Dashboard → Service → **Redeploy** button
2. This re-runs the build from the **last GitHub commit** — not from any local folder

**DO NOT use:**
```bash
# ❌ NEVER run these — they ship local files, not GitHub code:
npx railway up --service @kanchuki/api
npx railway up --service @kanchuki/web
railway up --detach --environment production
```

### Railway GitHub Integration Setup

For Railway to auto-deploy from GitHub:
1. Railway Dashboard → Project → **Settings** → **Source**
2. Ensure **GitHub** is connected and the correct repo/branch (`main`) is selected
3. Enable **Deploy on Push** (auto-deploy when code is pushed to `main`)
4. Each service should have its **Root Directory** set to `.` (repo root)
5. Verify: push a small change to `main` and check Railway's Deployments tab —
   it should say **"Deployed via GitHub"**, not "Deployed via CLI"

> **Note:** Next.js `output: 'standalone'` is intentionally disabled. The
> standalone mode causes a "Cannot read properties of null (reading 'useContext')"
> error during static generation with pnpm monorepos (Next.js 14.2.x known issue).
> Railway's Nixpacks builder keeps the full `node_modules` in the deployment
> image, so `pnpm --filter @kanchuki/web start` (which runs `next start`) works
> correctly.

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| Build fails — `@kanchuki/shared` not found | pnpm workspace not hoisted | Ensure root `pnpm-workspace.yaml` exists and `NIXPACKS_TURBO_APP_NAME` is set |
| Build fails — TypeScript errors | Stale lockfile | Run `pnpm install --frozen-lockfile` locally, commit updated `pnpm-lock.yaml` |
| API crashes on start | Missing env var | Check Railway dashboard → Service → Variables for required vars |
| DB connection refused | DATABASE_URL not set correctly | Use Railway PostgreSQL plugin's provided URL |
| 502 Bad Gateway | Health check failing | Check `startCommand` in `railway.json` — ensure path is correct |
| 502 Bad Gateway — **every** path (`/`, static assets, `/c/{slug}`), with `x-railway-fallback: true` in the response | **Service domain target port ≠ app's listening port** (see §Troubleshooting below) | `railway domain list --service <name>` to compare; `railway domain update --port <PORT> <domain-id> --service <name>` to fix |
| Prisma schema mismatch | Migrations not run | Run `pnpm exec prisma migrate deploy` from the API service |
| Changes not live after push to main | Railway not connected to GitHub, or someone deployed from local | Check Railway Deployments tab: "Deployed via GitHub" = good, "Deployed via CLI" = someone ran `railway up` locally. Fix: Railway Settings → Source → connect GitHub repo, enable auto-deploy. **NEVER run `railway up` from a local machine.** |
| Stale code on production | Local `railway up` overwrote GitHub deploy | Railway Settings → Source → ensure GitHub is connected. Run `git log --oneline -1` on the machine to check if code is current. Deploy from GitHub only. |

### 502 on every path — domain target port vs Railway `$PORT` mismatch

**Symptom:** the whole web service is down, not just one route. `curl` returns HTTP 502
with `{"status":"error","code":502,"message":"Application failed to respond"}`
and a `x-railway-fallback: true` header — Railway's edge can't reach the container at
all (the fallback is served by the edge, so it is fast, ~0.6–0.8s, and every path
including `/robots.txt` and `/_next/static/*` fails).

**Root cause (incident 2026-08-01):** the app's listening port and the service
domain's *target port* drifted apart.

- Railway injects a `$PORT` env var per service. The web `start` script listens on it:
  `next start -p ${PORT:-3000}` (commit `c30e46e` — previously it hardcoded `-p 3000`,
  which itself broke the healthcheck and killed deploys).
- The **service domain** was created with a fixed target port (3000) that no longer
  matched the injected `$PORT` (8080). The container starts fine (logs show
  "Ready in 247ms" on `localhost:8080`, no crash loop) but the edge routes to 3000 →
  every request 502s.
- The **API service** is unaffected because it sets an explicit `PORT=3001` service
  variable; the **web service has no `PORT` variable**, so it follows Railway's
  injected `$PORT` and can drift from a domain created earlier.

**How to diagnose:**

```bash
railway status                          # service shows ● Online but site is down
railway domain list --service <name>    # shows the domain's target Port
railway logs --service <name> -n 100    # shows the app's actual listening port
# e.g. "- Local: http://localhost:8080" in the web logs → app is on 8080
```

**How to fix (no redeploy needed):**

```bash
railway domain update --port <actual-port> <domain-id> --service <name>
# e.g. railway domain update --port 8080 6911637d-... --service magnificent-liberation
```

Then verify: `curl -I https://<domain>/api/health` should return 200.

**Prevention:** give the web service an explicit `PORT` service variable (mirroring the
API's `PORT=3001`) so the listening port can't drift from the domain's target port,
or re-check the domain's target port after any change to the `start` command.

---

---

## Deploy Fashion V-Tone v1.5 Try-On Service on Railway

Fashion V-Tone v1.5 self-hosted virtual try-on (~$0.0003/try-on on CPU, Apache 2.0 licensed).

### Prerequisites

- Railway project with API service already deployed (see steps above)
- R2 bucket with credentials (already configured for API service)
- GitHub repo connected to Railway

### Step 1: Add V-Tone as a Railway Service

1. **Railway Dashboard → New → Add a service → GitHub repo**
2. Select the same Kanchuki repo
3. Set **Root Directory** to `.` (repo root)
4. Railway will detect the `services/fashion-vtone/railway.json` config automatically
5. **Do NOT** start with a template — Railway will build from the Dockerfile

### Step 2: Add Environment Variables

In the Railway dashboard for the V-Tone service, add these env vars (reuse the same R2 creds as your API service):

```bash
# R2 (same as API service — for uploading try-on results)
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=kanchuki-prod
R2_PUBLIC_URL=https://pub-xxx.r2.dev

# Port (Railway sets this automatically)
PORT=8000

# Optional: increase download timeout for large images
DOWNLOAD_TIMEOUT=60
```

> **Note:** No `VTONE_DEVICE` env var needed — it defaults to CPU on Railway's CPU tier.
> No `VTONE_WEIGHTS_DIR` env var needed — weights auto-download to HuggingFace cache.

### Step 3: Deploy

Once the env vars are set, Railway will automatically start building the Docker image.

**First build will be slow (~10-15 min):**
- Installing `fashn-vton` from GitHub source (~3 min)
- Downloading model weights on **first container start** (~2.3 GB, ~3-5 min)
  - The first cold start will hit the `start_period` health check timeout (300s)
  - **The service will appear unhealthy** for ~3-5 min while weights download — this is normal
  - After the initial download, subsequent restarts are instant (weights cached)

**Check deployment progress:**
```bash
# Get the Railway-generated URL from the dashboard (Settings → Domains)
curl https://your-vtone-service.railway.app/health
```

Expected response when ready:
```json
{"status": "ok", "pipeline_loaded": true, "device": "cpu", "gpu_available": false}
```

### Step 4: Wire to API Service

Once the V-Tone service is healthy, copy its Railway-generated URL:
- Dashboard → V-Tone Service → Settings → Domains → `*.railway.app` URL

Add this URL as `VTONE_API_URL` to your **API** service's environment variables:

```bash
VTONE_API_URL=https://your-vtone-service.railway.app
```

This connects the API's `triggerTryOn()` function to the deployed V-Tone engine.

### Step 5: Test

```bash
# Quick health check through the API
curl https://api.kanchuki.app/health

# Or test V-Tone directly with the test script
node --env-file=.env services/fashion-vtone/test-tryon.mjs
# If local test images exist (test_person.jpg, test_garment.jpg), they'll be
# auto-uploaded to R2 and sent through V-Tone
```

### Quick Start (Local Dev)

```bash
cd services/fashion-vtone
pip install -r requirements.txt
pip uninstall -y onnxruntime-gpu; pip install onnxruntime  # CPU only
python app.py
```

The server starts on port 8000. Set `VTONE_API_URL=http://localhost:8000` in your `.env`.

### Docker (Local)

```bash
cd services/fashion-vtone
docker build -t kanchuki-vton -f Dockerfile .
cd ../..
docker run -d -p 8000:8000 \
  -e R2_ENDPOINT="..." \
  -e R2_ACCESS_KEY_ID="..." \
  -e R2_SECRET_ACCESS_KEY="..." \
  -e R2_BUCKET_NAME="kanchuki-prod" \
  kanchuki-vton
```

### Configuration Reference

| Env Var | Default | Description |
|---------|---------|-------------|
| `VTONE_DEVICE` | auto (CPU on Railway) | Set to `cuda` for GPU inference |
| `VTONE_WEIGHTS_DIR` | `./weights` | Model weights cache directory |
| `DOWNLOAD_TIMEOUT` | 30 | Image download timeout (seconds) |
| `R2_ENDPOINT` | — | Cloudflare R2 S3 endpoint (from R2_ACCOUNT_ID) |
| `R2_ACCESS_KEY_ID` | — | R2 access key |
| `R2_SECRET_ACCESS_KEY` | — | R2 secret key |
| `R2_BUCKET_NAME` | — | R2 bucket name |
| `R2_PUBLIC_URL` | — | Public URL prefix for R2 objects |
| `PORT` | 8000 | HTTP port |

### Hardware Options

| Hardware | Try-ons/hr | Cost/hr | Cost/try-on |
|----------|-----------|---------|-------------|
| CPU (4+ cores) | ~60-120 | $0 (shared with API server) | ~$0.0003 |
| NVIDIA L4 | ~120-360 | $0.44 | ~$0.001-0.004 |

### Notes

- Models auto-download from Hugging Face on first run (~2.3 GB total)
- No GPU required — CPU inference works well for Phase 0/MVP scale
- Maskless architecture — no background removal preprocessing needed
- First cold start: ~5-10 min (model download). Subsequent starts: < 30s
- CatVTON code was fully removed from the project on 2026-07-16

### Production Checklist (add to existing checklist)

- [ ] V-Tone Railway service created and healthy
- [ ] `VTONE_API_URL` added to API service environment variables
- [ ] Test try-on completed successfully with a real photo

---

## Deploy WhatsApp Native Catalog Sync (Phase II)

Retailers with the **Growth/Pro** `WHATSAPP_CATALOG_SYNC` feature can push their
product catalog into WhatsApp Business (visible in the business profile chat, no
app needed). The API syncs products via the Meta Graph Catalog API; edits/status
changes auto-enqueue incremental syncs; an admin page (`/admin/whatsapp-catalog`)
monitors health.

### Step 1: Add the Meta environment variables

Add the `META_*` vars above to the **API** service. They are
`getSecret`-first — the admin panel's Integrations settings can hold them as
IntegrationSetting rows instead, but env vars work identically.

- `CATALOG_SYNC_CRON` — optional. The daily reconciliation full-sync schedule
  (standard 5-field cron expression, UTC), default `0 5 * * *` (5:00 AM — 30
  minutes after the R2 image-compression pass, before India store hours).
  ⚠️ Changing this on a live deployment creates a **new** BullMQ repeat
  schedule — remove the old `catalog-daily-full-sync` repeatable job from Redis
  (or wipe the repeat set) if the run time should move rather than duplicate.

- `META_WHATSAPP_BUSINESS_ACCOUNT_ID` — the numeric WABA ID from Meta Business
  Suite → WhatsApp → Business Account settings.
- `META_WEBHOOK_SECRET` — any long random string. This is the **verify token**
  you enter in the Meta dashboard below (NOT the signature secret).
- `META_APP_ID` + `META_APP_SECRET` — the Meta for Developers app. The app
  secret is what Meta uses to sign webhook POSTs (`X-Hub-Signature-256`).

### Step 2: Configure the webhook in the Meta dashboard

1. Open **Meta for Developers** → your app → **WhatsApp** → **Configuration** →
   **Webhook**.
2. Callback URL:

   ```
   https://api.kanchuki.app/v1/public/webhooks/whatsapp-catalog
   ```

3. Verify token: paste `META_WEBHOOK_SECRET`.
4. Meta sends a GET handshake (`hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`);
   the API echoes the challenge back when the token matches.
5. Subscribe to the **WhatsApp Business Account** object — the catalog update
   fields (`catalog_item_added/updated/deleted`, availability changes).

> **Signature contract:** Meta signs every webhook POST with
> `X-Hub-Signature-256: sha256=<HMAC-SHA256(raw body, META_APP_SECRET)>`. The API
> verifies against the **app secret** (timing-safe, fail-closed) — the
> `META_WEBHOOK_SECRET` is only used for the GET handshake verify token.

### Step 3: Retailer setup + first sync

1. Retailer connects their own WhatsApp Business API account (Settings →
   WhatsApp Business API — bring-your-own token).
2. Settings → **WhatsApp Native Catalog** → toggle **Sync to WhatsApp Catalog**
   (optionally pick categories) → **Sync Now**. The catalog is created on their
   WABA on first sync.
3. Product edits, status changes and deletes auto-sync afterwards; the admin
   panel (`/admin/whatsapp-catalog`) can force a full sync per retailer.

### Production Checklist (add to existing checklist)

- [ ] `META_APP_ID` / `META_APP_SECRET` / `META_WHATSAPP_BUSINESS_ACCOUNT_ID` / `META_WEBHOOK_SECRET` set on the API service
- [ ] Webhook callback URL + verify token configured in Meta for Developers
- [ ] WABA subscribed to the WhatsApp Business Account catalog fields
- [ ] A test retailer connected + synced, item visible in WhatsApp Business

---

## Production Checklist

- [ ] Custom domain configured (api.kanchuki.app + kanchuki.app)
- [ ] SSL certificate issued automatically by Railway
- [ ] Supabase Auth configured for production (phone OTP enabled)
- [ ] R2 bucket set to public-read for product images
- [ ] Razorpay webhook pointing to production API URL
- [ ] ADMIN_API_KEY set and stored securely
- [ ] Database automated backups enabled (Railway PostgreSQL addon)
- [ ] Logging enabled (Axiom or Railway logs)
- [ ] Rate limiting configured (`@fastify/rate-limit` already wired)
- [ ] CI passing on main branch
- [ ] V-Tone v1.5 deployed (CPU or GPU)

---

## Hosting & App Store Launch Guide

> Merged from the former `docs/references/guides/hosting-and-app-store.md`.


Brief reference: where to host web (frontend + admin), where to host API/DB, and steps to launch mobile app on Play Store + App Store. Cheap vs best comparison included. No implementation steps here — see `docs/DEPLOY.md` for the actual Railway deploy commands (already locked-in choice).

---

#### 1. What needs hosting

| Piece | What it is | Notes |
|---|---|---|
| Web frontend (customer PWA + marketing site) | Next.js 14 app, `apps/web` | SSR needed, not static-only |
| Web admin panel | Same Next.js app, `apps/web/src/app/admin/*` | Not a separate deploy — same service as web frontend |
| Backend API | Node.js + Fastify, `apps/api` | Needs long-running server (not serverless-only) |
| Retailer mobile app | React Native (Expo), `apps/mobile` | Not "hosted" — built + submitted to app stores |
| Database | PostgreSQL 16 + pgvector | Supabase (primary) |
| Deletion Vault DB | Separate Postgres, INSERT-only | Currently Railway Postgres |
| Redis | Cache/queue/session | Upstash |
| Image storage | Cloudflare R2 | Object storage, not a "server" |
| VTO engine | Fashion V-Tone v1.5, CPU-only | Self-hosted alongside API, currently Railway |

---

#### 2. Web frontend + admin — hosting comparison

Admin panel lives inside the same Next.js app, so it hosts on the same service — no separate cost/step.

| Host | Cost (small scale) | Fit for Next.js SSR | Notes |
|---|---|---|---|
| **Railway** (current pick) | ~$5–20/mo | Good | Already wired, one project hosts API+Web+DB together, simplest ops for a 2-service monorepo |
| **Vercel** | Free tier, then ~$20/mo (Pro) | Best-in-class (built by Next.js authors) | Fastest SSR/ISR, but pricier at scale, no built-in Postgres/Redis — you'd still need Supabase+Upstash |
| **Cloudflare Pages/Workers** | Cheapest at scale (generous free tier) | Good, needs Next-on-Cloudflare adapter | Best India latency (Cloudflare edge PoPs), but SSR adapter adds setup friction |
| **Render** | ~$7–25/mo | Good | Similar to Railway, slightly less polished DX |

**Recommendation:** stay on Railway (already deployed, zero migration cost, one dashboard for API+Web+DB). Reconsider Vercel only if SSR latency becomes a real complaint — not now, MVP traffic doesn't need it.

---

#### 3. Backend API — hosting comparison

| Host | Cost (small scale) | Notes |
|---|---|---|
| **Railway** (current pick) | ~$5–20/mo | Same project as Web, PostgreSQL/Redis plugins available, good India-adjacent latency via Singapore region |
| **Render** | ~$7–25/mo | Comparable, free tier sleeps (bad for API — cold starts kill mobile app UX) |
| **Fly.io** | Pay-as-you-go, cheap at low scale | Good global edge placement, more ops knowledge needed (Dockerfile-first) |
| **DigitalOcean App Platform** | ~$5–12/mo | Predictable pricing, less automatic than Railway |
| Raw VPS (Hetzner/DO Droplet) | Cheapest ($4–6/mo) | You manage everything — Docker, SSL, restarts, monitoring. Not worth it pre-PMF |

**Recommendation:** Railway. Cheapest-that's-actually-cheap is a VPS, but the ops overhead isn't worth it until traffic/cost forces the move — revisit only past ~500 active retailers.

---

#### 4. Database, Cache, Storage — already decided, no change needed

- **Primary DB:** Supabase Postgres (includes Auth + pgvector) — free tier covers MVP, paid tier ~$25/mo when needed.
- **Deletion Vault DB:** separate Railway Postgres instance, INSERT-only role — already provisioned (`docs/references/guides/infra-setup.md`).
- **Redis:** Upstash — free tier covers MVP queue/cache volume.
- **Image storage:** Cloudflare R2 — cheapest object storage with zero egress fees (important since product photos get viewed a lot).

These are already the cheap-and-best picks for this project size — no comparison needed.

---

#### 5. Mobile app — this is NOT a "hosting" decision

React Native/Expo apps aren't hosted on a server the way a website is. Two separate things happen:

1. **The app binary** gets built (via Expo Application Services / EAS Build, cloud build service, ~$0–29/mo depending on build volume) and submitted to Google Play + Apple App Store as a package.
2. **The app's backend** is just your existing API (Railway) — the mobile app talks to `api.kanchuki.app` like the web app does. No separate mobile server needed.

**EAS (Expo Application Services)** is the standard path: handles code signing, builds, and store submission from one CLI, without needing a Mac for iOS builds. Free tier has monthly build limits; paid plan (~$29/mo) removes queue waits — fine to start free.

---

#### 6. Launching on Google Play Store (Android)

| Step | What to do | Cost/time |
|---|---|---|
| 1. Google Play Console account | Register as developer (individual or org) | $25 one-time fee |
| 2. App listing | Title, description, screenshots (min 2, phone + optional tablet), feature graphic, privacy policy URL (required — host a simple page) | Free |
| 3. Content rating questionnaire | Fill in Play Console — determines age rating | Free |
| 4. Data safety form | Declare what data the app collects (photos, phone number for OTP, KYC docs — **no location since 2026-08-10**). Required — Google checks this against actual app behavior | Free |
| 5. Build production binary | EAS Build produces a signed `.aab` (Android App Bundle) | Included in EAS |
| 6. Upload + internal testing track | Upload the `.aab`, test with a small internal group first | Free |
| 7. Submit for review | Move to production track, submit | Free |
| 8. Review time | Typically 1–3 days for new apps (can be longer for first submission) | — |

Total hard cost: **$25 one-time**. Everything else is free/time.

> **Consolidated launch checklist with exact Data Safety + content-rating answers, permissions, closed-testing steps, and the target-API deadline:** `docs/references/guides/play-store-launch-checklist.md`

---

#### 7. Launching on Apple App Store (iOS)

| Step | What to do | Cost/time |
|---|---|---|
| 1. Apple Developer Program enrollment | Individual or Organization (org needs D-U-N-S number, takes longer) | **$99/year** |
| 2. App Store Connect listing | Name, description, screenshots (per device size — iPhone 6.7", 6.5", iPad if supported), privacy policy URL, privacy "nutrition label" (data collection disclosure) | Free |
| 3. Build production binary | EAS Build produces a signed `.ipa` — no Mac needed, EAS handles Apple certs/provisioning | Included in EAS |
| 4. TestFlight beta (recommended) | Upload build, test with internal/external testers before public release — catches rejections early | Free, part of the process |
| 5. Submit for App Review | Submit via App Store Connect | Free |
| 6. Review time | Typically 1–3 days, first submission sometimes longer; Apple's review is stricter than Google's — expect at least one rejection round for things like missing privacy details or demo account for login-gated apps | — |
| 7. Demo account for reviewers | Since retailer app needs phone OTP login, provide Apple reviewers a way in (test phone number with fixed OTP, or a reviewer bypass) — **without this, near-guaranteed rejection** | Plan this before submitting |

Total hard cost: **$99/year**.

---

#### 8. Cost summary — cheapest path to "live on both stores + hosted"

| Item | Cheapest viable option | Monthly-equivalent cost |
|---|---|---|
| Web + Admin + API hosting | Railway | ~$10–20/mo combined |
| Database | Supabase free tier | $0 (until scale) |
| Redis | Upstash free tier | $0 |
| Image storage | Cloudflare R2 | ~$0–2/mo at MVP volume |
| Mobile builds | EAS free tier | $0 (limited monthly builds) |
| Google Play | One-time | $25 once |
| Apple Developer | Annual | $99/year (~$8.25/mo) |
| **Total to launch** | — | **~$15–30/mo + $124 one-time-ish** |

This matches what's already locked in `CLAUDE.md`'s Tech Stack table — no change recommended, this doc is the "why," not a new decision.

---

## Infrastructure Setup — Vault DB & Role Separation

> Merged from the former `docs/references/guides/infra-setup.md`.


**Date:** July 26, 2026 (updated after actual execution)  
**Scope:** F-016 (Deletion Vault) + F-017 (DB Guardrails)

> ✅ **Both items completed 2026-07-26.** This guide now documents what was done and the remaining manual steps.
>
> **Completed:** Vault DB provisioned on Railway Postgres-PYkI (`sakura.proxy.rlwy.net:23505`) with INSERT-only `vault_app` role. `kanchuki_app` and `kanchuki_migrator` roles created on Supabase. `VAULT_DATABASE_URL` and `DATABASE_URL` updated in Railway env vars. Vault Prisma client generated. Vault permission test passes.
>
> **Still manual:** Migration 037 guardrail triggers not yet applied (needs Supabase SQL Editor — PgBouncer blocks CLI direct connect). Local `.env` files still reference superuser credentials — update to `kanchuki_app` manually.

---

#### Item 1: Provision the Vault Postgres Instance (F-016)

The Deletion Vault needs its own Postgres database — a separate instance from your primary Supabase DB.

> ✅ **Completed:** Used existing Railway Postgres-PYkI instance (`sakura.proxy.rlwy.net:23505`).

##### Step 1: Create a Railway Postgres

1. Open [Railway Dashboard](https://railway.app/dashboard)
2. Click **New Project** → **Provision PostgreSQL**
3. Name it `kanchuki-vault-db`
4. Wait for provisioning (30–60 seconds)
5. Railway will show the connection string — it looks like:
   ```
   postgresql://postgres:password@host:5432/railway
   ```
6. **Copy this connection string** — you'll need it below

##### Step 2: Connect and Create the INSERT-only Role

**Option A — Railway CLI** (recommended if you have it installed):
```bash
railway connect kanchuki-vault-db
# This opens a tunnel to localhost:PORT
# Then in another terminal:
psql postgresql://postgres:password@localhost:PORT/railway
```

**Option B — psql directly** (if Railway exposes the endpoint):
```bash
psql "postgresql://postgres:password@host:5432/railway"
```

Once connected, run:

```sql
CREATE ROLE vault_app WITH LOGIN PASSWORD '<VAULT_PASSWORD>';
GRANT CONNECT ON DATABASE "railway" TO vault_app;
GRANT USAGE ON SCHEMA public TO vault_app;

CREATE TABLE IF NOT EXISTS deleted_records (
  id            TEXT PRIMARY KEY,
  source_table  TEXT NOT NULL,
  source_id     TEXT NOT NULL,
  retailer_id   TEXT,
  payload       JSONB NOT NULL,
  delete_reason TEXT,
  deleted_by    TEXT,
  deleted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deleted_records_source
  ON deleted_records (source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_deleted_records_retailer
  ON deleted_records (retailer_id);

GRANT INSERT ON deleted_records TO vault_app;
REVOKE SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON deleted_records FROM vault_app;
```

**Verify** (all should pass):
```sql
SELECT has_table_privilege('vault_app', 'deleted_records', 'INSERT'); -- → true
SELECT has_table_privilege('vault_app', 'deleted_records', 'SELECT');  -- → false
SELECT has_table_privilege('vault_app', 'deleted_records', 'UPDATE');  -- → false
SELECT has_table_privilege('vault_app', 'deleted_records', 'DELETE');  -- → false
```

##### Step 3: Set VAULT_DATABASE_URL

**Locally** — add to `apps/api/.env` and `packages/db/.env`:
```bash
VAULT_DATABASE_URL=postgresql://vault_app:<VAULT_PASSWORD>@host:5432/railway
```

**Railway (production)** — add to the API service's environment variables:
| Variable | Value |
|----------|-------|
| `VAULT_DATABASE_URL` | `postgresql://vault_app:<VAULT_PASSWORD>@host:5432/railway` |

> **Note:** Use the `vault_app` credentials (INSERT-only), not the Railway default superuser.

##### Step 4: Generate the Vault Prisma Client

```bash
cd E:/Kanchuki/packages/db
set VAULT_DATABASE_URL=postgresql://vault_app:<VAULT_PASSWORD>@host:5432/railway
npx prisma generate --schema=prisma/vault-schema.prisma
```

This creates the vault client at `packages/db/src/generated/vault/`.

##### Step 5: Run the Vault Permission Test

```bash
cd E:/Kanchuki/packages/db
set VAULT_DATABASE_URL=postgresql://vault_app:<VAULT_PASSWORD>@host:5432/railway
npx vitest run src/vault.test.ts --reporter=verbose
```

Expected output:
```
✓ vault INSERT-only constraint
  ✓ UPDATE is rejected with a database permission error
  ✓ DELETE is rejected with a database permission error
```

##### Step 6: Deploy & Restart

After setting `VAULT_DATABASE_URL` in Railway, Railway will auto-restart the API service. The vault writes are now active — every soft-delete (product, customer, collection, retailer) writes a full-payload snapshot to the vault DB.

---

#### Item 2: Run Role-Separation SQL (F-017)

This creates `kanchuki_app` (restricted, no DELETE) and `kanchuki_migrator` (full privileges, human-only) roles in your Supabase project.

##### Step 1: Open Supabase SQL Editor

1. Go to [Supabase Dashboard](https://supabase.com/dashboard/projects)
2. Select your project (`thpqcylmcxokajxoerjx` — the project ref, i.e. the suffix in the pooler URLs below; confirm on the dashboard's **Connect** tab if unsure)
3. Click **SQL Editor** in the left sidebar
4. Click **New Query**

##### Step 2: Paste and Run the SQL

Open `scripts/setup-role-separation.sql` and paste into the SQL Editor, OR copy directly:

> The canonical, idempotent version lives in **`scripts/setup-role-separation.sql`** — paste that file into the SQL Editor. It is safe to re-run over the existing setup (the 2026-07-26 roles already exist; re-running applies the sequence grants). Equivalent inline:

```sql
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_app') THEN CREATE ROLE kanchuki_app WITH LOGIN PASSWORD '<APP_PASSWORD>'; END IF; END $$;
GRANT CONNECT ON DATABASE postgres TO kanchuki_app;
GRANT USAGE ON SCHEMA public TO kanchuki_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO kanchuki_app;
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM kanchuki_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO kanchuki_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kanchuki_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO kanchuki_app;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_migrator') THEN CREATE ROLE kanchuki_migrator WITH LOGIN PASSWORD '<MIGRATOR_PASSWORD>' INHERIT; END IF; END $$;
GRANT kanchuki_app TO kanchuki_migrator;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO kanchuki_migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO kanchuki_migrator;

-- Third role: the 30-day purge cron (narrow-scoped DELETE, no DDL).
-- The cron cannot use kanchuki_app (DELETE revoked) or kanchuki_migrator
-- (human-only) — this is the sanctioned middle ground.
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanchuki_purge') THEN CREATE ROLE kanchuki_purge WITH LOGIN PASSWORD '<PURGE_PASSWORD>' INHERIT; END IF; END $$;
GRANT kanchuki_app TO kanchuki_purge;
GRANT DELETE ON TABLE products, product_variants, product_photos, product_embeddings, collections, collection_products, collection_views, collection_enquiries, customers, customer_interactions, retailers, staff, store_sections, product_categories, usage_counters TO kanchuki_purge;
-- This inline copy lists only the 2026-08-02 tables. Tables created later
-- carry their own purge grant in the migration that creates them (084 adds
-- social_posts/social_accounts/product_attributes/product_videos/
-- quota_addon_purchases, 099 adds staff_invites, 109 adds referral_*), and
-- scripts/setup-role-separation.sql holds the full current set — treat that
-- file as the source of truth for this list.
-- ⚠️ Every name above must be an existing table: a GRANT naming a dropped one
-- aborts the rest of the block. Three such names had been left here by
-- migration 082's teardown (customer_measurements, customer_fashion_dna,
-- try_on_usage_logs) and were removed 2026-09-22.
```

**Verify:**
```sql
SELECT rolname, rolsuper FROM pg_roles WHERE rolname LIKE 'kanchuki_%';
-- Should show 3 rows — kanchuki_app, kanchuki_migrator, kanchuki_purge

SELECT has_table_privilege('kanchuki_app', 'products', 'DELETE'); -- → false
SELECT has_table_privilege('kanchuki_migrator', 'products', 'DELETE'); -- → true
SELECT has_table_privilege('kanchuki_purge', 'products', 'DELETE'); -- → true (purge role only)
SELECT has_table_privilege('kanchuki_purge', 'products', 'TRUNCATE'); -- → false (no DDL)
```

##### Step 3: Update DATABASE_URL

> ⚠️ **Pooler usernames include the project ref.** Supabase's pooler rejects the
> bare `kanchuki_app` username with `password authentication failed` — the
> username must be `<role>.<project_ref>`, e.g. `kanchuki_app.thpqcylmcxokajxoerjx`.
> Substitute your project's ref if it differs.

**Locally** — update `apps/api/.env`:
```
# BEFORE:
DATABASE_URL=postgresql://postgres.thpqcylmcxokajxoerjx:<SUPERUSER_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true

# AFTER:
DATABASE_URL=postgresql://kanchuki_app.thpqcylmcxokajxoerjx:<APP_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

Also update `packages/db/.env` (direct connection, no pooler):
```
# BEFORE:
DATABASE_URL=postgresql://postgres.thpqcylmcxokajxoerjx:<SUPERUSER_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres

# AFTER:
DATABASE_URL=postgresql://kanchuki_app.thpqcylmcxokajxoerjx:<APP_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres
```

**Railway (production)** — update the `DATABASE_URL` env var on the API service:
| Variable | New Value |
|----------|-----------|
| `DATABASE_URL` | `postgresql://kanchuki_app.thpqcylmcxokajxoerjx:<APP_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true` |

**Optional** — add a migrator URL (only used by the admin migration-trigger button):
| Variable | Value |
|----------|-------|
| `DATABASE_URL_MIGRATOR` | `postgresql://kanchuki_migrator.thpqcylmcxokajxoerjx:<MIGRATOR_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres` |

> ⚠️ `DATABASE_URL_MIGRATOR` should NOT be set as a regular env var — only provide it when the admin needs to trigger a migration, or use it interactively via `prisma migrate deploy`.

**Purge cron** — add a scoped purge URL (read ONLY by the 30-day purge cron in `apps/api/src/jobs/purge-soft-deleted.ts`, never by request traffic):
| Variable | Value |
|----------|-------|
| `PURGE_DATABASE_URL` | `postgresql://kanchuki_purge.thpqcylmcxokajxoerjx:<PURGE_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres` |

> Without `PURGE_DATABASE_URL` the purge cron falls back to the main client and fails nightly with `permission denied` (kanchuki_app has no DELETE). The `kanchuki_purge` role is created by the Step 2 SQL above.

##### Step 4: Apply Migration 037 (Guardrail Triggers)

Now that the restricted roles exist, apply the BEFORE DELETE triggers:

```bash
cd E:/Kanchuki/packages/db
# Use the MIGRATOR URL (kanchuki_app can't run DDL)
set DATABASE_URL=postgresql://kanchuki_migrator.thpqcylmcxokajxoerjx:<MIGRATOR_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres
npx prisma migrate deploy
```

##### Step 5: Verify Everything Works

Test that a DELETE is blocked via the API connection:
```bash
# This should FAIL — kanchuki_app has no DELETE privilege
psql "postgresql://kanchuki_app.thpqcylmcxokajxoerjx:<APP_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres" -c "DELETE FROM products WHERE id = 'nonexistent';"
# Expected: ERROR: permission denied for table products
```

Test that the guardrail trigger also blocks:
```bash
# Even through the migrator role, the trigger blocks without session flag
psql "postgresql://kanchuki_migrator.thpqcylmcxokajxoerjx:<MIGRATOR_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres" -c "DELETE FROM products WHERE id = 'nonexistent';"
# Expected: ERROR: Hard delete blocked by guardrail trigger on products (F-017)

# The purge role has DELETE but is still blocked by the trigger without the flag
psql "postgresql://kanchuki_purge.thpqcylmcxokajxoerjx:<PURGE_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres" -c "DELETE FROM products WHERE id = 'nonexistent';"
# Expected: ERROR: Hard delete blocked by guardrail trigger on products (F-017)
# (The purge cron sets SET app.allow_hard_delete = 'true' itself inside each tx.)
```

---

#### The Guardrail Layers After Setup

```
Layer 4 ─ Deletion Vault ── Separate DB, INSERT-only, independent backup
Layer 3 ─ CI grep guard ─── scripts/check-delete-guard.sh (already active)
Layer 2 ─ DB triggers ───── prevent_hard_delete() on 8 business tables
Layer 1 ─ Role separation ── kanchuki_app can't DELETE/DROP/TRUNCATE
```

After both items are complete, run the CI guard to confirm nothing is broken:
```bash
cd E:/Kanchuki
bash scripts/check-delete-guard.sh
# Expected: PASSED
```

Then restart the API to use the new restricted role, and verify the admin dashboard's `/admin/database/status` page shows green health checks for guardrails.

---

## Meta Dashboard Setup — Facebook One-Tap Login (retailer app)

> Merged from the former `docs/references/guides/meta-facebook-login-setup.md`.


**Status:** operator runbook. Everything here is Meta-dashboard / Play-Console work —
no code change is needed for the login itself. The code side is already shipped
(see `docs/tasks/done/social-connect-native.md`).
**Last verified against the repo:** 2026-09-12.
**Why this exists:** "Connect Facebook" kept returning to the login screen. The code
bug behind that is fixed (RC-018), but a correct client cannot complete a login
that Meta rejects — and Meta rejects it for configuration reasons that are
invisible from inside the app. This is the list of them.

> Meta renames dashboard labels periodically. The **paths** below were correct when
> written; if a label has moved, the section still describes what you are looking
> for. When in doubt, use the app-scoped deep links in §2.

---

#### 0. The short version

Three things cause "still not connected", in order of how often they bite:

| # | Cause | Where it's fixed |
|---|-------|------------------|
| 1 | The signing key hash of the **installed** app isn't registered | §3 — and read the Play App Signing trap, it is the usual real answer |
| 2 | The Facebook app isn't installed on the test device, so the SDK has nothing to hand off to | §9 |
| 3 | The Meta app is in Development mode and the test account has no role | §7 |

Meta's own error for (1) is `Invalid key hash` — but the Android SDK often just
returns **no access token** instead of surfacing it, which the app reports as:

```
Facebook returned no access token. This usually means the Android release key
hash / bundle ID is not registered on the Meta app, or the app is not in Live mode.
```

That message is accurate. Treat it as "go do §3".

---

#### 1. Facts you need in hand

Already in the repo — do not re-derive these:

| Thing | Value | Source |
|---|---|---|
| Meta **App ID** | `1758308975480748` | `apps/mobile/app.json` → `react-native-fbsdk-next` plugin |
| App ID scheme | `fb1758308975480748` (must be `fb` + App ID) | same |
| Android package | `app.kanchuki.retailer` | `apps/mobile/app.json` → `android.package` |
| iOS bundle ID | `app.kanchuki.retailer` | `apps/mobile/app.json` → `ios.bundleIdentifier` |
| Web URL (for redirects) | `https://kanchuki.app` | `WEB_URL` — `docs/DEPLOY.md:164` |
| Server secrets | `META_APP_ID`, `META_APP_SECRET` | read by `apps/api/src/lib/meta-graph.ts:117` from the F-012 secrets table / env |

The **Client Token** lives at Settings → Advanced → Client token, and is already
pasted into `app.json` as `clientToken`. If you ever change Meta apps, five things
must change together — `appID`, `clientToken`, `scheme`, and `META_APP_ID` +
`META_APP_SECRET` on the API service. Miss any one and the SDK logs into one app
while the server exchanges tokens against another, which surfaces as
`Failed to obtain a long-lived token`.

> `META_APP_SECRET` is a real secret: server-side only, never in `app.json`, never
> in a doc. The client token is not — it ships inside the app binary by design.

---

#### 2. Open the right app

The app that already holds `META_APP_ID` / `META_APP_SECRET`:

```
https://developers.facebook.com/apps/1758308975480748/
```

If that URL 404s, you are either signed into the wrong Facebook account or the
app has been deleted — stop and resolve that first, because every step below
writes to a specific app and a second app is how the token-exchange mismatch from
§1 happens.

---

#### 3. Register the key hash (do this first)

Meta will not let the Android SDK complete a login unless the **SHA-1 of the
certificate that signed the installed APK** is registered on the Meta app.

##### ⚠️ The Play App Signing trap — read before generating anything

If the app on your phone was installed from **Play Console** (internal /
closed / open testing — which is how the testers get it), Google **re-signs** it.
The certificate on that installed app is **Play's App Signing key**, *not* your
upload keystore. Registering only your upload keystore's hash produces exactly
the reported symptom: build is correct, code is correct, login never completes.

**Register both.** They are different values and Meta accepts a list:

| Hash to register | Where it comes from | Needed for |
|---|---|---|
| **Play App Signing key** SHA-1 | Play Console → your app → **Release → Setup → App signing** → "App signing key certificate" → SHA-1 certificate fingerprint | every install that came from Play Console ← **the one that's been missing** |
| **Upload keystore** SHA-1 | the `release.jks` the CI workflow signs with (steps below) | locally-built release APKs / AABs, and `eas build` artifacts sideloaded directly |
| **Debug keystore** SHA-1 | `~/.android/debug.keystore` (alias `androiddebugkey`, store & key password `android`) | `expo run:android` dev builds on your machine |

The upload keystore value is already extracted below. **The Play App Signing value
cannot be derived from this repo** — it is Google's key, readable only from Play
Console (or from an APK Play installed on a device). That is the one to go and get.

##### The upload keystore's key hash — already extracted

```
SHA-1:          16:3B:21:32:B6:DB:00:C4:0D:AF:04:2F:ED:10:3D:8D:87:CC:AF:45
META KEY HASH:  FjshMrbbAMQNrwQv7RA9jYfMr0U=
```

Paste the **META KEY HASH** value. Verified 2026-09-12 two ways that agree exactly:
by reading the local EAS keystore, and by inspecting the signature block of the
`.aab` artifact from CI run `34619372677` (versionCode 3) — so this is the key that
signed what is on Play, not just what is on disk. See
`docs/PLAY-STORE-RELEASES.md` § Verified provenance.

> Both local files — `apps/mobile/@s.numbhraal__kanchuki.jks` and
> `…_OLD_1.jks` — hold the **same** certificate. The `_OLD_1` name suggests a
> rotation that never happened; nothing extra needs registering for it.

##### Regenerating it (or hashing any other key)

```bash
# The common case: convert a hex SHA-1 (Play Console, `eas credentials`) to
# Meta's format. No keystore, no JDK required.
node scripts/meta-android-key-hash.mjs --sha1 "AB:CD:EF:..."

# Read the certificate straight out of a JKS — no password, no JDK
node scripts/meta-android-key-hash.mjs --keystore apps/mobile/@s.numbhraal__kanchuki.jks

# From an APK (needs the Android SDK build-tools + a JDK for apksigner)
node scripts/meta-android-key-hash.mjs --apk app-release.apk
```

The script prints the hex **and** the Meta value, and self-checks the result two
ways (Node's X.509 fingerprint, and that the certificate is genuinely self-signed)
so a misread container can't silently produce a wrong hash.

**Why it can read a JKS without the password:** in a JKS the certificate chain is
stored as plaintext DER — only the private key bytes are encrypted. The signing
certificate is public data. That matters here because the Android builds run in CI
and a dev machine often has **no JDK at all**, so `keytool` may not be available.

If you prefer raw `keytool`:

```bash
# Materialise the same keystore CI signs with (it is write-only as a GH secret,
# so use your local EAS copy — verified to be the same key)
keytool -list -v -keystore apps/mobile/@s.numbhraal__kanchuki.jks -alias <alias>  # copy the SHA1 line
```

> The CI workflow uses `ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` /
> `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD`
> (`.github/workflows/android-release.yml:54-88`).

##### Pasting it in

**Product → Facebook Login → Settings**, or **Settings → Basic → Android**
(depending on how the app was created) → **Key hashes** → paste → **Save changes**.

No rebuild is needed — the hash is sent by the client at login and validated
server-side by Meta, so an already-installed build picks up the new entry. Retry
the connect; a force-stop first is harmless insurance against stale in-process SDK
state.

##### Verifying which key signed a shipped `.aab`

Worth doing whenever "which build is on Play" is in question — it answers it from the
artifact itself, with no Play Console access. A JAR signature block is named after
the **first 8 characters of the signing alias**, so the check starts for free:

```bash
# 1. The signature file name tells you the alias. For this project it is
#    META-INF/F8DE0ED2.RSA  ← matches alias f8de0ed2… from the keystore.
unzip -l app-release.aab | grep -i 'META-INF/.*\.\(RSA\|DSA\|EC\)'

# 2. Read the certificate out of that signature block
unzip -p app-release.aab 'META-INF/*.RSA' > signer.pkcs7
openssl pkcs7 -inform DER -in signer.pkcs7 -print_certs -out certs.pem
openssl x509 -in certs.pem -noout -fingerprint -sha1

# 3. Compare with the keystore's own certificate
node scripts/meta-android-key-hash.mjs --keystore apps/mobile/@s.numbhraal__kanchuki.jks
```

Identical SHA-1 on both sides means the shipped artifact was signed by that key. If
they differ, the keystore you are hashing is **not** the one CI signed with — stop
and find the real one before registering anything with Meta.

Download a run's artifact with
`gh run download <run-id> -n app-release-aab -D <dir>` (see
`docs/PLAY-STORE-RELEASES.md` for run IDs).

> `unzip` may not be present in Git Bash on Windows; any zip tool works — the point
> is step 1, which needs no crypto at all.

---

#### 4. Register the platforms

**Settings → Basic → Add platform.**

**Android**
- Google Play Package Name: `app.kanchuki.retailer`
- Class Name: leave blank (only used by older SDK integrations)
- Key Hashes: every hash from §3

**iOS**
- Bundle ID: `app.kanchuki.retailer`
- iPhone Store ID / iPad Store ID: blank until App Store listing exists

> Save the package name and **every** key hash in the same step. A package entry
> with a partial hash list is the most common way to end up with logins that work
> on one machine or one install and fail on every other.

---

#### 5. Facebook Login product settings

**Products → Facebook Login → Settings:**

| Toggle | Set to | Why |
|---|---|---|
| Client OAuth Login | **On** | nothing works without it |
| Web OAuth Login | **On** | only needed for the web-OAuth fallback path — turn it on so Expo Go development still has a path |
| Embedded Browser OAuth Login | **On** | the SDK's own WebView dialog is what you get when the Facebook app isn't installed (§9). With this off, that fallback doesn't render at all |
| Login from Devices | Off | TV/console flow, irrelevant |
| Force Web OAuth Reauthentication | Off | leaving it **On** is what makes Facebook re-ask for the password every single time — it defeats one-tap by design |
| Use Strict Mode for redirect URIs | On (fine) | only affects the web flow; our redirect URI is an exact https URL, so strict mode is safe |
| Enforce HTTPS | On | same |

**Valid OAuth Redirect URIs** — add both, exactly:

```
https://kanchuki.app/social/connect
https://kanchuki.app/social/connect/callback
```

Those are the two the API actually sends. `defaultOAuthRedirect()`
(`retailers-social-connect.ts:28`) builds the first; the web callback page uses
the second (`retailers-social-connect.ts:350`). **A custom scheme is rejected by
Meta** — `kanchuki://oauth/callback` produces Meta's generic "Sorry, something
went wrong" page, which is why the redirect is an https URL the platform owns
even for the mobile app. Do not add a `kanchuki://` URI here; the deep link back
into the app is a client-side hop that Meta never sees.

> The native one-tap flow (§9) does **not** use a redirect URI at all. These two
> exist only so the Expo Go fallback and the web connect page keep working.

---

#### 6. Settings → Basic — compliance fields

Meta blocks App Review (and sometimes the login dialog itself) until these are
filled. These pages already exist on the deployed web app:

| Field | Value |
|---|---|
| Privacy Policy URL | `https://kanchuki.app/privacy` |
| Terms of Service URL | `https://kanchuki.app/terms` |
| User Data Deletion → Instructions URL | `https://kanchuki.app/account-deletion` |
| App Category | Business and pages / Shopping |
| App Icon | 1024×1024 |
| Business Use / Data Use Checkup | complete the questionnaire; Meta re-asks annually and silently blocks login when it lapses |

The data-deletion field is the one most often left blank — it must be a URL that
explains *how a user asks Kanchuki to delete their data*, not a callback endpoint.

---

#### 7. Roles and App Mode

**App Roles → Roles** (also reachable as **App Roles → Test Users**):

- Add every Facebook account that will test as **Tester** (or **Developer**/**Admin**).
- The account must accept the invitation — an unaccepted invitation behaves exactly
  like no role, and login fails with `No Facebook Pages found on this account…`
  even when the account clearly administers a Page.

**App Mode** (top bar toggle):

| Mode | Effect |
|---|---|
| **Development** | Only accounts with a role on the app can complete login. Correct while testing. |
| **Live** | Anyone can. Required before real retailers connect. |

Stay in Development until §8 lands, but make sure every tester account is listed —
this is the second-most-common cause of the reported symptom.

---

#### 8. App Review — the publish permissions

Until these are granted with **Advanced Access**, connects succeed only for role
accounts. This is the step that takes calendar time (~1–3 days per submission,
sometimes longer), so start it early.

The app requests these on every Facebook login
(`apps/mobile/src/lib/facebook-auth.ts`):

| Permission | Why it's needed | Where in App Review |
|---|---|---|
| `public_profile` | baseline, no review needed | — |
| `pages_show_list` | list the Pages the retailer manages, so we can pick one to publish to | **Advanced** |
| `pages_read_engagement` | read Page/engagement data for the analytics surfaces | **Advanced** |
| `pages_manage_posts` | actually publish the product/collection post to the Page | **Advanced** |
| `business_management` | required by Graph to read Pages through the Business asset API | **Advanced** |
| `instagram_basic` | resolve the IG Professional account linked to the Page | **Advanced** (only if IG publishing is in scope) |
| `instagram_content_publish` | publish to the linked IG account | **Advanced** (same) |

**Before submitting:** record a screencast of the real flow (Settings → Social
Media → Connect → Facebook app opens → approve → "Connected! Linked &lt;Page&gt;" →
post a product → it appears on the Page). Meta rejects submissions that describe
the permission without demonstrating it. Also fill **App Review → Permissions and
Features** with the reviewer instructions box (test account credentials, or state
that role accounts are provided).

---

#### 9. The device — what actually makes it *one-tap*

The SDK's Android default login behaviour is `NATIVE_WITH_FALLBACK`: try the
Facebook app, else fall back to the SDK's own WebView dialog.

**If the Facebook app is not installed on the test device, the fallback is not a
bug — it is the only path available, and it will ask for an email and password.**

So: **install the Facebook app on the test device and sign into it** before
testing connect. Then the flow is a single "Continue as &lt;name&gt;" tap, and the
app is not involved in the authentication at all.

If you want to *prove* which behaviour ran, the SDK exposes it —
`LoginManager.setLoginBehavior('native_only')` forces the Facebook app only
(`'native_with_fallback'` | `'native_only'` | `'web_only'`, see
`react-native-fbsdk-next` `src/FBLoginManager.ts`). With `native_only`, a device
without the Facebook app fails loudly instead of quietly showing a password form,
which is a useful diagnostic but a worse shipping default — leave the code as-is
unless you are deliberately isolating this.

---

#### 10. Verifying each layer independently

Do not test "does connect work" as one opaque thing. Each layer is separately
observable, and knowing which one broke is the whole point of this doc.

| Layer | How to check | Pass looks like |
|---|---|---|
| Meta app has the right ID | `apps/mobile/app.json` `appID` === `META_APP_ID` on the API service | identical strings |
| Keystore hash registered | `keytool -list -v` vs Play Console app-signing cert, both compared against Meta's Key Hashes list | all present in Meta |
| SDK loaded | tap Connect in an EAS/dev build; Expo Go → `FacebookAuthUnavailable` → web fallback | no `Facebook SDK could not be loaded in this build` error |
| Native login returned a token | the app's red banner text | no `Facebook returned no access token` |
| Server accepted the token | `GET /v1/retailers/me/social/accounts` | a `FACEBOOK` row with the Page name |
| Page token usable | post a product → open the Page in Facebook | the post is there |

Failure text maps to a layer — the connect screens show the **real** API error in
a red banner (not a generic Alert), so the banner text is the diagnostic:

| Banner / error code | Layer | Fix |
|---|---|---|
| `Facebook returned no access token…` | key hash / App Mode | §3, §7 |
| `Invalid key hash` (SDK text) | key hash | §3 |
| `App not active` (SDK text) | App Mode | §7 — app is in Dev mode and this account has no role |
| `Facebook SDK failed to initialise: …` | `app.json` plugin config | plugin block appID/clientToken/scheme, then rebuild (§1) |
| `Social publishing is not configured yet` (503) | server | `META_APP_ID` / `META_APP_SECRET` not set on the API service |
| `Failed to obtain a long-lived token` | app mismatch | server `META_APP_ID`/`_SECRET` belong to a different Meta app than the SDK logged into |
| `NO_PAGES_FOUND` (404) | roles / Pages | the FB account admins no Page, **or** it has no role on the app (§7) |
| `NO_PAGE_TOKEN` (502) | permissions declined | re-connect and grant all permissions — the consent screen hides per-permission toggles behind "Edit access" |
| `NO_IG_FOUND` (404) | IG account setup | the Page has no linked IG **Professional** account; link one, then retry |
| `Facebook login was cancelled` | nothing | the retailer backed out of the dialog |

Error codes come from `apps/api/src/routes/retailers/retailers-social/retailers-social-connect.ts`.

---

#### 11. What this doc cannot fix

- **Code bugs in the login attempt itself** — RC-018 (`LoginManager.logOut()`
  before every login, which forced the credentials form every time) is already
  fixed in `apps/mobile/src/lib/facebook-auth.ts`. If the installed app predates
  that commit you will still see the old behaviour no matter how correct the
  dashboard is. Confirm the build first: the footer at the bottom of Settings
  reads `BUILD <7-char-sha>` with `<channel> · <YYYY-MM-DD HH:MM UTC>` beneath it,
  and tapping it copies `build <7-char-sha> · ci · <UTC>` — check that SHA against
  the `android-release.yml` run you downloaded the `.aab` from.
- **A build without the native SDK** — Expo Go has no `react-native-fbsdk-next`.
  It falls back to the web OAuth flow by design. Test one-tap on an EAS or
  Play-installed build only.
- **WhatsApp / Messaging permissions** — unrelated; see
  `docs/tasks/pending/whatsapp-managed-sending.md`.

---

#### 12. Checklist

Copy into the task tracker; tick in order.

- [ ] Confirmed `https://developers.facebook.com/apps/1758308975480748/` is the app holding `META_APP_ID`
- [ ] Upload keystore hash `FjshMrbbAMQNrwQv7RA9jYfMr0U=` added to Meta Key Hashes (§3 — already extracted)
- [ ] **Play App Signing certificate SHA-1 → base64, added to Meta Key Hashes**
- [ ] Debug keystore SHA-1 added (for `expo run:android`)
- [ ] Android platform: package `app.kanchuki.retailer`
- [ ] iOS platform: bundle `app.kanchuki.retailer`
- [ ] Facebook Login → Client OAuth Login **On**
- [ ] Facebook Login → Embedded Browser OAuth Login **On**
- [ ] Facebook Login → **Force Web OAuth Reauthentication Off**
- [ ] Valid OAuth Redirect URIs: `/social/connect` + `/social/connect/callback` (https, no `kanchuki://`)
- [ ] Settings → Basic: Privacy Policy, Terms, **Data Deletion Instructions** URLs set
- [ ] Data Use Checkup completed
- [ ] Every tester account added as a **role** and has **accepted**
- [ ] App Review submitted for `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `business_management` (+ `instagram_basic`, `instagram_content_publish` if IG is in scope)
- [ ] Facebook app installed and signed in on the test device
- [ ] Install the build containing the RC-018 fix, then confirm Settings → build-info footer shows the expected commit
- [ ] Tap Connect Facebook → single "Continue as …" tap → "Connected! Linked &lt;Page&gt;"
- [ ] Flip App Mode to **Live** once App Review is approved

---

#### 13. Related

| Doc | Covers |
|---|---|
| `docs/tasks/done/social-connect-native.md` | the code/architecture side — flow, files, API routes, error-code map |
| `docs/root-cause/root-cause issues.md` | RC-016 / RC-018 — why connect looped back to the login screen |
| `docs/references/history/sessions/2026-09-11-otp-fb-aistudio-lint.md` | the session that diagnosed it, incl. build-provenance footer |
| `docs/PLAY-STORE-RELEASES.md` | versionCode release log — which `.aab` went to which track |
| `docs/references/history/reports/launch-readiness-audit.md` | pre-launch gate this setup is an input to |
