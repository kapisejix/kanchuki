# Kanchuki — Technology Stack

**Version:** 1.0  
**Date:** June 2026  
**Status:** Locked for MVP

---

## Decision Principles

1. **Ship fast** — No over-engineering. Use managed services. Skip DevOps complexity.
2. **India-first** — Choose providers with low-latency India PoPs.
3. **TypeScript throughout** — One language across API, web, tooling.
4. **Cost-aware** — Every AI API call costs money. Design for cost control.
5. **Mobile-first** — 80%+ of target users are on Android smartphones.

---

## Full Stack at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                      KANCHUKI STACK                          │
├─────────────────────────────────────────────────────────────┤
│  Retailer Mobile App     │  React Native (Expo SDK 52)       │
│  Customer Web            │  Next.js 14 (App Router, PWA)     │
│  Admin Panel             │  Next.js 14 (same repo)           │
├─────────────────────────────────────────────────────────────┤
│  API                     │  Node.js 20 + Fastify 4            │
│  Background Jobs         │  BullMQ + Redis                    │
│  Real-time               │  SSE (Server-Sent Events)          │
├─────────────────────────────────────────────────────────────┤
│  Database                │  PostgreSQL 16 + pgvector 0.7      │
│  Cache / Queue           │  Redis 7 (Upstash)                 │
│  File Storage            │  Cloudflare R2                     │
│  CDN                     │  Cloudflare (free tier)            │
├─────────────────────────────────────────────────────────────┤
│  Auth                    │  Supabase Auth (Phone OTP)         │
│  Payments                │  Razorpay                          │
│  Email                   │  Resend                            │
│  SMS Fallback            │  MSG91                             │
├─────────────────────────────────────────────────────────────┤
│  AI Tagging              │  Claude Vision (claude-3-5-sonnet) │
│  Embeddings              │  OpenAI text-embedding-3-small     │
│  VTO Engine              │  CatVTON (self-hosted)             │
│  WhatsApp                │  Meta Cloud API (Phase 2)          │
├─────────────────────────────────────────────────────────────┤
│  Hosting (API + Web)     │  Railway                           │
│  DB Hosting              │  Supabase (managed PostgreSQL)     │
│  Monitoring              │  Axiom (logs) + Sentry (errors)    │
│  CI/CD                   │  GitHub Actions                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Layer-by-Layer Decisions

### 1. Retailer Mobile App: React Native (Expo)

**Choice:** React Native with Expo SDK 52  
**Why:**
- Cross-platform: Android + iOS from one codebase
- Expo Camera module: native camera access, image compression built-in
- TypeScript native
- OTA updates via EAS Update (fix bugs without app store re-review)
- Large community, fast hiring

**Key Libraries:**
- `expo-camera` — product photo capture
- `expo-image-picker` — gallery import
- `expo-image-manipulator` — client-side compression (target < 500KB)
- `@tanstack/react-query` — server state, cache, offline support
- `zustand` — local UI state
- `react-native-mmkv` — fast local storage (catalog cache for offline)
- `nativewind` — TailwindCSS for React Native
- `expo-router` — file-based navigation
- `@gorhom/bottom-sheet` — action sheets

**Android min SDK:** API 28 (Android 9) — covers 95%+ of Indian market  
**Target:** Google Play Store (primary), App Store (secondary)

---

### 2. Customer Web: Next.js 14 (App Router)

**Choice:** Next.js 14 with App Router  
**Why:**
- Collection link pages are SSG/ISR — fast load, great SEO
- PWA support: customers can install to home screen optionally
- No app store needed for customers (zero friction)
- Vercel Edge Network / Cloudflare Pages for fast India delivery

**Key Libraries:**
- `next/image` — auto-optimized product images
- `@tanstack/react-query` — client-side data fetching
- `framer-motion` — smooth product browsing animations
- `tailwindcss` — styling
- `shadcn/ui` — component base
- `lucide-react` — icons

**Deployment:** Cloudflare Pages (not Vercel) — free tier, India CDN PoPs  
**PWA:** Yes — customers can add to home screen, offline view of last visited collection

---

### 3. API: Node.js 20 + Fastify 4

**Choice:** Fastify over Express  
**Why:**
- 2-3x faster than Express (important for image processing routes)
- Schema-based validation with Zod integration
- TypeScript first
- Plugin architecture (auth, rate limiting, multipart)

**Structure:** Monorepo (one repo, multiple packages)
```
apps/
  api/          # Fastify backend
  web/          # Next.js customer web + admin
  mobile/       # React Native app
packages/
  db/           # Prisma schema + client
  shared/       # Types, constants, utils
  ai/           # AI client wrappers
```

**Key Packages:**
- `fastify` + `@fastify/multipart` — file uploads
- `prisma` — ORM (schema-first, TypeScript types)
- `ioredis` — Redis client
- `bullmq` — job queue (AI tagging, embeddings, VTO)
- `zod` — validation
- `pino` — structured logging

---

### 4. Database: PostgreSQL 16 + pgvector

**Choice:** PostgreSQL on Supabase (managed)  
**Why:**
- pgvector extension: Fashion DNA embeddings stored natively
- Row-level security: tenant isolation without app-layer complexity
- Supabase: managed, backups, point-in-time recovery, free tier for MVP
- JSONB: flexible product metadata without rigid schema migration per field

**pgvector use cases:**
- Product embeddings: semantic search ("pink cotton wedding suit")
- Customer Fashion DNA: preference vector per customer
- Similarity matching: "products similar to this one"

**Schema details:** See `docs/DATABASE.md`

**Connection:** Prisma ORM + connection pooling via PgBouncer (Supabase built-in)

---

### 5. Cache + Queue: Redis (Upstash)

**Choice:** Upstash Redis (serverless, per-request billing)  
**Why:**
- No Redis server to manage
- Works well with Railway + Cloudflare Workers
- BullMQ compatible (uses standard Redis)

**Cache uses:**
- Session tokens (15min TTL)
- AI tagging results (24h TTL — same image → same result)
- Collection view counts (flush to DB every 5 minutes)
- Rate limiting (per-retailer API limits)

**Queue uses (BullMQ):**
- AI product tagging jobs (async, webhook callback)
- Embedding generation jobs
- VTO processing jobs (Phase 1)
- WhatsApp message send jobs (Phase 2)

---

### 6. File Storage: Cloudflare R2

**Choice:** Cloudflare R2  
**Why:**
- No egress fees (critical — high image volume)
- Cloudflare CDN integration native
- S3-compatible API (easy to migrate if needed)
- Free tier: 10GB storage, 10M reads/month

**Image organization:**
```
r2://kanchuki-prod/
  retailers/{retailer_id}/products/{product_id}/{uuid}.webp
  collections/{collection_id}/cover.webp
  tryon-results/{result_id}.webp  (ephemeral — 24h TTL)
  customer-photos/{session_id}.webp  (ephemeral — deleted after VTO)
```

**Image pipeline:**
- Upload → R2 presigned URL (direct from app, bypass API)
- Post-upload webhook → API → queue tagging job
- Serve via Cloudflare CDN with auto-format (WebP)

---

### 7. Auth: Supabase Auth

**Choice:** Supabase Auth (Phone OTP)  
**Why:**
- Phone OTP: retailer doesn't need email, just their mobile number
- Built-in JWT, refresh tokens
- Works with Supabase PostgreSQL RLS
- India SMS OTP via integrated provider

**Auth flows:**
- Retailer: Phone → OTP → JWT
- Customer: No auth (anonymous collection link browsing) OR phone OTP for favorites sync
- Admin: Email + password

---

### 8. Payments: Razorpay

**Choice:** Razorpay  
**Why:**
- Best Indian payment gateway
- UPI (primary payment method for Indian SMBs)
- Subscription billing built-in
- Webhook for payment events
- INR native, no forex complexity
- GST invoice generation (partial — we generate our own for full control)

**Subscription flow:**
- Retailer selects plan → Razorpay checkout (UPI/card)
- Webhook confirms payment → activate plan in DB
- Monthly renewal: Razorpay recurring mandate
- Annual plan: upfront payment with 20% discount

---

### 9. AI — Product Auto-Tagging

**Choice:** Claude Vision API (claude-3-5-sonnet-20241022)  
**Why:**
- Best understanding of Indian fashion terminology
- Structured JSON output with tool use
- High accuracy on mixed Hindi-English labels
- Reasonable cost: ~$0.01-0.02 per product image

**Prompt strategy:**
- System prompt: "You are an expert in Indian ethnic fashion. Analyze this product image..."
- Tool definition: `extract_product_attributes` with full field schema
- Temperature: 0 (deterministic extraction)
- Fallback: claude-3-haiku (cheaper, slightly lower accuracy)

**Cost control:**
- Cache results by image hash (same photo → cached tags)
- Batch process during off-peak hours
- Budget cap per retailer per month

---

### 10. AI — Semantic Search (Embeddings)

**Choice:** OpenAI `text-embedding-3-small`  
**Why:**
- 1536-dim, compatible with pgvector
- $0.00002/1K tokens — cheapest viable option
- Good multilingual (English + Hindi transliteration)

**Embedding strategy:**
- Product embedding = concatenate all text fields → embed → store in `products.embedding` vector column
- Query embedding = user query text → embed → cosine similarity search
- Refresh embedding when product tags are edited

---

### 11. Virtual Try-On: CatVTON (Self-Hosted)

**Choice (Revised June 2026 — Cost Optimization):**  
**CatVTON (self-hosted Python microservice)**  

**Why CatVTON:**
- **~$0.005/try-on** on an L4 GPU ($0.44/hr)
- Open-source (CC BY-NC-SA 4.0 — verify commercial terms)
- Single-UNet architecture: simpler, fewer failure points, runs on <8GB VRAM
- 1024×768 output resolution, ~35 seconds per try-on
- Can be fine-tuned for Indian ethnic wear via LoRA
- No API dependency — full control over uptime, latency, cost

**Deployment:**
- Python/FastAPI microservice in `services/tryon/`
- Containerized with Docker
- Runs on RunPod/Jarvis Labs L4 GPU ($0.44/hr, serverless billing)
- ~90 try-ons per GPU-hour → **$0.005 per try-on**

**GPU Requirements:**
| GPU | VRAM | Cost/hr | Try-ons/hr | Cost/try-on |
|-----|------|---------|-----------|-------------|
| RTX 3060 (used) | 12GB | — (one-time ₹15K) | ~100 | ~₹0 (free after purchase) |
| NVIDIA L4 (cloud) | 24GB | $0.44 | ~90 | ~$0.005 |
| NVIDIA T4 (cloud) | 16GB | $0.20 | ~45 | ~$0.004 |

**Path to better Indian ethnic wear quality:**
1. Deploy CatVTON as-is (works well for kurtis, suits, gowns)
2. Collect 200-500 Indian garment photos from real product uploads
3. Run LoRA fine-tuning for sarees, lehengas, unstitched suits
4. Swap model weights — no app code changes needed

**Cost comparison:**
| Method | Cost per try-on | Monthly (1000 try-ons) |
|--------|----------------|----------------------|
| **CatVTON self-hosted** | **$0.005/ try-on** | **$5 (₹400) for 1000 try-ons** |
| Replicate IDM-VTON | ~$0.02 (₹1.6) | $20 (₹1,600) |

---

### 11b. Body Measurement Estimation: MediaPipe Pose (Phase 1)

**Choice:** Google MediaPipe Pose (`mediapipe` + `opencv-python`, Python)  
**Why:**
- Free, runs locally/on-server — no per-call API cost (unlike VTO), doesn't touch try-on credit budget
- 33-point body landmark detection from front + back photo
- Combined with user-entered height (scale reference) → derives bust/waist/hip/inseam via landmark distance × scale factor

**Manual path (inch-tape) remains primary/default** — photo path is Phase 1 add-on behind feature flag, not MVP-blocking.

**Accuracy:** ±3–5cm typical (2D single-angle limitation). Existing alternatives (Bodygram, 3DLOOK) considered but skipped for MVP — MediaPipe is free and sufficient for fit-hinting, not sizing-guarantee.

**Schema:** See `CustomerMeasurement` in `docs/DATABASE.md`

---

### 12. WhatsApp: Meta Cloud API (Phase 2)

**Choice:** Meta WhatsApp Cloud API (official)  
**Why:**
- Official API — no ban risk (unlike unofficial APIs)
- Direct connection — no intermediary cost
- Free first 1000 conversations/month per business

**Cost pass-through:**
- Marketing messages: ₹0.38/conversation (Meta rate)
- Utility messages: ₹0.11/conversation
- Service messages: ₹0.06/conversation
- Passed through to retailer via add-on billing

---

### 13. Monitoring

| Tool | Purpose |
|------|---------|
| **Sentry** | Error tracking (React Native + API + Next.js) |
| **Axiom** | Structured logs (Fastify pino → Axiom) |
| **Checkly** | Uptime monitoring + API health checks |
| **Prometheus + Grafana** | (Phase 1) Performance metrics |

---

### 14. CI/CD: GitHub Actions → Railway

**Pipeline:**
1. Push to main branch
2. Run tests (vitest + playwright)
3. Run type check (tsc --noEmit)
4. Run lint (ESLint + Biome)
5. Build Docker image
6. Deploy to Railway (API + Web)
7. EAS build (mobile — separate workflow on release tag)

---

## Cost Projections (MVP, 50 retailers)

| Service | Units | Monthly Cost |
|---------|-------|-------------|
| Supabase (DB) | Pro plan | ₹2,000 |
| Railway (API + Web) | 1GB RAM | ₹1,500 |
| Upstash Redis | < 10K commands/day | ₹800 |
| Cloudflare R2 | 50GB storage, 1M reads | ₹0 (free tier) |
| Claude Vision API | 50 retailers × 50 uploads/mo = 2,500 calls | ₹3,500 |
| OpenAI Embeddings | 2,500 products | ₹200 |
| Supabase Auth | SMS OTP (50 retailers × 2 OTP/mo) | ₹500 |
| Sentry | Developer plan | ₹1,500 |
| Resend (email) | Free tier | ₹0 |
| **Total** | | **~₹10,000/month** |

**At 50 retailers on Starter plan (₹999 × 50 = ₹49,950 MRR), infra cost is ~20% — healthy margin.**

---

## Skills Used in This Project

See `docs/SKILLS-AND-MCP.md` for the full list. Key skills:
- `fastapi-patterns` / `backend-patterns` — API design
- `react-patterns` / `frontend-patterns` — web UI
- `postgres-patterns` — DB schema + query optimization
- `security-and-hardening` — auth, data privacy
- `database-migrations` — schema evolution
- `api-design` — REST contract
- `deployment-patterns` — Railway + CI/CD
- `error-handling` — resilient AI pipelines
- `observability-and-instrumentation` — logs + metrics
