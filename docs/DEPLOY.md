# Kanchuki — Deployment Guide

**Target:** Railway (api.kanchuki.app + kanchuki.app)  
**Stack:** Node.js 20 · pnpm · Turborepo · PostgreSQL 16 · Redis  
**Why Railway (host comparison + mobile app store launch steps):** `docs/HOSTING-AND-APP-STORE-GUIDE.md`

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
