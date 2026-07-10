# Kanchuki — Deployment Guide

**Target:** Railway (api.kanchuki.app + kanchuki.app)  
**Stack:** Node.js 20 · pnpm · Turborepo · PostgreSQL 16 · Redis

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
| GPU cloud (RunPod/Vast) | Self-hosted CatVTON try-on (~$0.005/try-on) | [runpod.io](https://runpod.io) |

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
DATABASE_URL="postgresql://..."
DATABASE_URL_POOLER="postgresql://..."
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

# Virtual Try-On (CatVTON self-hosted — primary, ~$0.005/try-on)
# Deploy separately: see services/tryon/README.md for GPU cloud setup
CATVTON_API_URL="http://your-tryon-server:8000"

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

**Deploy to Railway** happens automatically via Railway's GitHub integration:
1. Push to `main`/`master`
2. Railway detects the push
3. Builds only the changed services (via `watchPatterns` in `railway.json`)
4. Runs `pnpm build --filter=@kanchuki/api` (or `web`)
5. Starts with `node apps/api/dist/index.js` (API) or `pnpm --filter @kanchuki/web start` (web)
6. Health check passes → traffic routed to new version

> **Note:** Next.js `output: 'standalone'` is intentionally disabled. The
> standalone mode causes a "Cannot read properties of null (reading 'useContext')"
> error during static generation with pnpm monorepos (Next.js 14.2.x known issue).
> Railway's Nixpacks builder keeps the full `node_modules` in the deployment
> image, so `pnpm --filter @kanchuki/web start` (which runs `next start`) works
> correctly.

### Manual Deploy Trigger

```bash
# If you need to redeploy without a code change:
# 1. Go to Railway Dashboard
# 2. Service → Settings → Redeploy
# Or use Railway CLI:
npx railway up --service @kanchuki/api
npx railway up --service @kanchuki/web
```

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| Build fails — `@kanchuki/shared` not found | pnpm workspace not hoisted | Ensure root `pnpm-workspace.yaml` exists and `NIXPACKS_TURBO_APP_NAME` is set |
| Build fails — TypeScript errors | Stale lockfile | Run `pnpm install --frozen-lockfile` locally, commit updated `pnpm-lock.yaml` |
| API crashes on start | Missing env var | Check Railway dashboard → Service → Variables for required vars |
| DB connection refused | DATABASE_URL not set correctly | Use Railway PostgreSQL plugin's provided URL |
| 502 Bad Gateway | Health check failing | Check `startCommand` in `railway.json` — ensure path is correct |
| Prisma schema mismatch | Migrations not run | Run `pnpm exec prisma migrate deploy` from the API service |

---

---

## Optional: Deploy CatVTON Try-On Service

CatVTON self-hosted GPU server for virtual try-on (~$0.005/try-on).

### Option A: RunPod (Serverless, recommended)

1. Create a [RunPod account](https://runpod.io) and add funds ($10 minimum)
2. Go to **Serverless → Endpoints → New Endpoint**
3. Fill in:
   - **Name:** `kanchuki-tryon`
   - **Docker Image:** `ghcr.io/kapisejix/kanchuki-tryon:<git-sha>` — CI pushes both `:latest` and `:<git-sha>`. Pin the template to the SHA tag and update it on every deploy; RunPod caches `:latest` on workers and won't re-pull it on its own.
   - **Container Disk:** 50GB (model is ~10GB)
   - **GPU Type:** L4 (24GB) — good balance of speed & cost ($0.44/hr)
   - **Max Workers:** 2
   - **Idle Timeout:** 60s
   - **Endpoint Timeout:** 120s (CatVTON takes ~35s per request)
4. **Deploy** → wait for **Active** status (~5 min)
5. Copy the endpoint URL: `https://{runpod-id}-8000.proxy.runpod.net`
6. Set as `CATVTON_API_URL` env var in your API service: `https://api.runpod.ai/v2/{endpoint_id}`

> The Docker image is built automatically by the CI workflow
> (`.github/workflows/docker-tryon.yml`) when `services/tryon/` changes.
> To trigger a manual build: GitHub → Actions → "Build & Push CatVTON" → "Run workflow".

### Option B: Docker (own GPU server)

```bash
# Build the Docker image
cd services/tryon
docker build -t kanchuki-tryon -f Dockerfile .

# Run with GPU
cd ../..
R2_ENDPOINT=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
  R2_BUCKET_NAME=... R2_PUBLIC_URL=... \
  docker compose -f services/tryon/docker-compose.yml up -d
```

Test the deployment:
```bash
curl http://localhost:8000/health
# → { "status": "ok", "model_loaded": true, "gpu_available": true }

# Warm the model (avoids cold-start on first real request)
curl -X POST http://localhost:8000/warmup
```

### Cost Comparison

| Volume | CatVTON (self-hosted) |
|--------|----------------------|
| 100 try-ons/mo | ~$1.50 |
| 500 try-ons/mo | ~$7.30 |
| 2000 try-ons/mo | ~$29 |

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
- [ ] CatVTON deployed (L4 GPU on RunPod)
