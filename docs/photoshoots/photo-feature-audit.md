# Photo Feature Audit: Kanchuki E-Commerce Platform

## Overview

This document provides a comprehensive audit of the four photo-related systems in the Kanchuki platform:
1. Ghost Mannequin / Photo Cleanup (Python sidecar)
2. Virtual Try-On (Fashion V-Tone v1.5)
3. AI Studio Shoots (F-032 Phase A, FLUX Kontext [pro])
4. Product Gallery (web frontend component)

---

## 1. Feature Audits

### 1.1 Ghost Mannequin / Photo Cleanup

**Location:** `services/photo-cleanup/` (Python FastAPI sidecar on port 8001)

**Core Functionality:**
- Background removal using `rembg` (onnxruntime CPU) 
- Hanger/mannequin removal using SAM2 (Segment Anything Model)
- Ghost-mannequin hollow-region filling using LaMa inpainting
- Optional tight crop, blur (portrait mode), shine enhancement
- Ghost-mannequin mode composites the product without a mannequin

**Authentication:** Shared-secret via `X-Cleanup-Key` header (`CLEANUP_SHARED_SECRET`)

**Architecture:**
- Deployed as a dedicated sidecar on Hetzner CX43 box (16 GB RAM)
- Python stack (~2.2 GB RSS peak: rembg + torch/SAM2 + LaMa loaded together)
- API container (Railway, 2 GB) has no Python — communicates via HTTP
- **Serialization**: Single-threaded pipeline via `threading.Lock` to keep memory bounded
- Two execution modes: sidecar service (production) or local python exec (dev fallback)

**API Endpoint:**
- `POST /clean` — multipart/form-data with `photo` (required), optional `background`, `remove_hardware`, `ghost_mannequin`, `tight_crop`, `crop`, `prompt_points`, `prompt_excludes`, `blur`
- Returns `output` (stdout/stderr) and `image_b64` (base64-encoded JPEG)
- `GET /health` — pipeline readiness + GPU availability

**Data Flow:**
1. API fetches photo + background via SSRF-safe fetch (`ssrfSafeFetch` + `readCappedBuffer`)
2. POSTs bytes as multipart to sidecar `/clean`
3. Sidecar runs Python subprocess with the pipeline
4. Returns processed image base64 + stdout output

---

### 1.2 Virtual Try-On

**Location:** `packages/ai/src/tryon.ts` + `apps/api/src/routes/tryon.ts`

**Core Functionality:**
- Fashion V-Tone v1.5 (Apache 2.0 licensed, maskless, CPU-capable)
- Generates virtual try-on images by compositing garment onto person
- Two initiation flows:
  - **Shopkeeper-initiated:** `POST /try-on/initiate` (customer photo already on R2)
  - **Customer-initiated:** `POST /try-on/remote` (customer uploads photo via web)
- Multi-piece outfits: sequential V-Tone calls (tops → bottoms)
- Category mapping: `resolveVtoneCategory()` maps Kanchuki categories to V-Tone categories (`tops`, `bottoms`, `one-pieces`)
- Unsupported categories: `Dupatta` (draping physics not supported for MVP)

**Architecture:**
- V-Tone service owns port 8000 on same Hetzner box
- API queries V-Tone via `getVtoneApiUrl()` + shared secret (`VTONE_SHARED_SECRET`)
- Job status polling via GET endpoints: `/try-on/jobs/:id`, `/try-on/remote/:id`
- Results stored in R2 under `tryon-results/` prefix
- Quota system: STARTER=0, GROWTH=100/mo, PRO=500/mo try-on credits

**API Endpoints:**
- `POST /try-on/initiate` — shopkeeper starts try-on with customer photo R2 key
- `POST /try-on/remote` — customer initiates from web (base64 data URL, 15MB limit)
- `GET /try-on/jobs/:id` / `GET /try-on/remote/:id` — poll job status + result
- `GET /try-on/jobs` / `GET /try-on/jobs` — list retailer's try-on jobs

**Data Flow (Shopkeeper-Initiated):**
1. Retailer uploads customer photo to R2 → gets presigned URL
2. `POST /try-on/initiate` → creates `TryOnJob` record (status: QUEUED) → queues BullMQ job
3. Worker calls V-Tone API → returns result URL → downloads → saves to R2 → updates job status to COMPLETED
4. Customer polls `GET /try-on/jobs/:id` until COMPLETED → gets `result_url`

**Data Flow (Customer-Initiated):**
1. Customer uploads photo via web → data URL in request body
2. Same flow as above after job creation, but customer photo URL is stored directly

---

### 1.3 AI Studio Shoots (F-032 Phase A)

**Location:** `apps/api/src/lib/studio-shoot.ts`, `apps/api/src/jobs/studio-shoot.ts`, `apps/api/src/routes/products/products-studio.ts`

**Core Functionality:**
- FLUX Kontext [pro] via Black Forest Labs API for template-based background replacement
- 4 presets (no free-text prompts):
  - `white_studio` — clean white backdrop, soft even lighting
  - `warm_luxury` — warm beige backdrop, premium lighting
  - `gold_festive` — gold-tone festive backdrop (Diwali/wedding)
  - `flat_lay` — neutral textured flat-lay surface, top-down shot
- "Own the subject, not the scene" — product pixels preserved, only background generated
- Asynchronous via BullMQ queue `kanchuki-studio-shoot`
- Retailer polls status endpoint until ready/failed

**BFL Contract (verified 2026-08-13):**
- Submit: `POST https://api.bfl.ai/v1/flux-kontext-pro` with `x-key` header (NOT Authorization/Bearer)
  - Body: `{ prompt, input_image, aspect_ratio? }`
  - `input_image`: base64 or public URL, ≤20MB/20MP
  - Response: `{ id, polling_url }`
- Poll: `GET <polling_url>` with same `x-key`
  - Status: `Pending | Processing | Ready | Error | Failed | Content Moderated`
  - Ready: `result.sample` = signed URL, valid 10 minutes only
  - Must download + re-serve from R2, never link directly
- Limits: 24 active tasks (6 for kontext-max); 429 when exceeded; 402 = out of credits.

**Architecture:**
- BFL API key stored as env var `BFL_API_KEY`
- Concurrency limited to 3 simultaneous jobs (`STUDIO_SHOOT_CONCURRENCY = 3`) to stay under BFL's 24-task cap
- BullMQ queue: `kanchuki-studio-shoot`
- Job does: verify ownership → generate via FLUX → download compress → upload to new R2 key → create ProductPhoto row (is_primary: false, metadata carries studio provenance) → write job status to Redis
- Status TTL: 30 minutes in Redis
- Polling endpoint: `GET /products/:id/photos/:photoId/studio-shoot/status?job_id=`
- Plan gate: Growth/Pro only; STARTER gets 402 FEATURE_UNAVAILABLE

**API Endpoints:**
- `POST /products/:id/photos/:photoId/studio-shoot` — enqueue generation job, returns 202 + job_id
- `GET /products/:id/photos/:photoId/studio-shoot/status` — poll status, returns processing/ready/failed + optionally photo data

**Data Flow:**
1. Retailer taps "Studio shoot" on product photo → picks template → `POST` enqueues BullMQ job
2. Job worker: verifies photo ownership → calls `generateStudioImage(template, inputImageUrl)` 
3. BFL submit + poll loop (up to 2 min timeout)
4. On Ready: downloads signed result URL (10-min validity), compresses ≤80KB, uploads to new R2 key under `retailers/{retailerId}/products/{productId}/studio/`
5. Creates new ProductPhoto row (is_primary: false, metadata: {studio: {job_id, template, source_photo_id, generated_at}})
6. Writes `status: ready` + `photo_id` + `url` to Redis
7. Retailer polls status endpoint → gets ready status + new photo URL → can promote to primary

---

### 1.4 Product Gallery

**Location:** `apps/web/src/app/c/[slug]/components/ProductGallery.tsx`

**Core Functionality:**
- Swipeable photo carousel with variant color chips
- Fullscreen lightbox viewer
- Variant color chips tap → scrolls to variant's photo
- Sold/reserved ribbons and status display
- Navigation arrows (hidden during fullscreen)
- Touch swipe navigation (threshold: 50px)
- Counter display (current/total)

**Architecture:**
- Pure client component (lives on page that is a server component)
- `useMemo` computes `slides` array from `photos` + `variants` (deduped, variants last)
- Touch events: `handleTouchStart` / `handleEnd` with 50px threshold
- `swipedRef` debounces click → fullscreen opening (350ms timeout)
- Color chips rendered as flexible wrap with color swatches
- Fullscreen lightbox with escape-key close, arrow navigation, touch swipe

**Key Features:**
- Image priority loading for first slide
- `animate-gallery-fade` keyframe animation (0.25s ease-in-out)
- Sold: grayscale + opacity-80; Reserved: amber tint
- Color chip: rounded pill with color swatch badge + label
- Fullscreen: black background, close on overlay click or Escape key
- Accessibility: aria-labels on all interactive elements, focus-visible rings

---

## 2. Functionality Analysis & Data Flow

### 2.1 Cross-System Data Flow Diagram

```
                                     ┌─────────────────────┐
                                     │  Retailer Admin UI  │
                                     └───────┬─────┬───────┘
                                             │     │
                                         ✏️ Edit    📸 Capture
                                             │     │
             ┌─────────────────────────────────────────────────────────────┐
             │                    Product Media                           │
             └─────────────────────────────────────────────────────────────┐
                    │               │               │
       ┌────────▼─────┐  ┌────────▼─────┐  ┌────────▼─────┐
       │Photo Cleanup │  │Virtual Try-On│  │Studio Shoots │
       │(Ghost Mannequin)│ │(V-Tone)     │ │(FLUX Kontext)│
       └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
            │                  │              │
            │                  │              │
            ▼                  ▼              ▼
     ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
     │Cleaned Product img │  │Try-on Result img   │  │Studio Result img    │
     │(R2: ghost-mannequin)│  │(R2: tryon-results/)│  │(R2: studio/)        │
     └─────────────────────┘  └─────────────────────┘  └─────────────────────┘
            │                  │              │
            │                  │              │
            ▼                  ▼              ▼
     ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
     │Product Gallery (web)│  │Customer Try-on UI   │  │Retailer Studio UI   │
     │(swipeable carousel) │  │(TryOnModal)         │  │(studio-shoot picker)│
     └─────────────────────┘  └─────────────────────┘  └─────────────────────┘
```

### 2.2 Interaction Patterns

1. **Product → Photo Cleanup → Product Gallery:**
    - Raw product photo → `/clean` endpoint → ghost-mannequin removed → cleaned image stored in R2 → displayed in Product Gallery
    - The gallery displays the cleaned image; if hardware (hanger/mannequin) needs removal, photo cleanup is the first step

2. **Product → Virtual Try-On → Customer UI:**
    - Product photo + customer photo → V-Tone API → try-on result → stored in R2 → customer polls status → displays in TryOnModal
    - Two initiation paths: shopkeeper (via admin) or customer (via web collection page)
    - Multi-piece outfits use sequential V-Tone calls (tops → bottoms)

3. **Product → AI Studio Shoots → Product Gallery (new photos):**
    - Product photo → template selection → FLUX Kontext → studio background generated → new ProductPhoto row created (is_primary: false) → retailer can promote to primary → gallery displays all photos including studio version
    - Original photo always preserved; studio result is a new tap away

4. **Product Gallery → (Triggers) All Three Systems:**
    - Gallery displays photos from any of the three pipelines
    - User taps "Try on" → TryOnModal opens → customer photo upload → V-Tone flow
    - User taps "Studio shoot" → studio template picker → BFL async job → new studio photo appears in gallery
    - User taps "Cleanup" → photo cleanup sidecar → ghost-mannequin removed → updated photo in gallery

### 2.3 Data Persistence Pattern

All three backend systems (photo cleanup, try-on, studio shoots) follow a **new-row-preserves-old** pattern:

| System | Source Preserved | Result Storage | Can Promote to Primary? |
|--------|-----------------|----------------|------------------------|
| Photo Cleanup | Original photo kept | Replaces original in R2 (overwrite) or new file | Yes, via re-upload |
| Virtual Try-On | Original product + customer photos | New `tryon-results/{jobId}/result.jpg` | Yes, via PATCH set-as-primary |
| AI Studio Shoots | Original product photo | **New** ProductPhoto row (is_primary: false) | Yes, via existing PATCH promotion flow |

This pattern ensures the original is always one tap away while edited versions can be promoted.

---

## 3. Comparative Research: Industry Best Practices vs Current Implementation

### 3.1 Ghost Mannequin / Photo Cleanup

**Industry Best Practices:**
- **Background removal:** Modern e-commerce uses AI-powered automatic background removal (Adobe Product Photography, Shopify's free BG remover). Industry standard is <5s for CPU, <1s for GPU.
- **Hanger/mannequin removal:** SAM2 (Segment Anything Model 2) is state-of-the-art for object removal. Competitors use similar AI inpainting approaches.
- **Ghost-mannequin workflow:** Industry standard is two-step: (1) capture on mannequin, (2) AI removes mannequin and fills hollow region. Some platforms (Zalando, ASOS) offer this as a post-processing service.
- **Authentication:** Shared-secret model is common for sidecar services (AWS-esque internal APIs). More secure than API keys for same-origin services.

**Current Kanchuki Implementation Analysis:**
- ✅ Uses SAM2 + LaMa — state-of-the-art combination for hanger removal + fill
- ✅ Serialized pipeline prevents OOM on limited hardware (16 GB box, ~2.2 GB peak)
- ✅ Shared-secret auth is appropriate for sidecar-to-API communication
- ✅ Sidecar separation keeps heavy Python off the main API container
- ⚠️ **Timeout:** 600s (10 min) timeout may be excessive; typical BG removal takes 5-30s. However, SAM2 + LaMa cold starts can be slow.
- ⚠️ **Local dev fallback:** Warning that local python exec is degraded; production Railway Docker no longer has python3. This creates a deployment risk.
- ⚠️ **No progressive/enhanced mode:** No option for faster-but-lower-quality mode for low-priority images.

**References:**
- SAM2: "Segment Anything Model 2" (Meta CVPR 2024) — state-of-the-art segment anything
- LaMa: "Simple Inpainting Research with Markov Autoencoders" — efficient image inpainting
- rembg: CPU-optimized background removal using onnxruntime

---

### 3.2 Virtual Try-On

**Industry Best Practices:**
- **Maskless try-on:** V-Tone's maskless approach is modern — avoids error-prone manual mask generation. Industry shift toward "image-to-image" translation without explicit segmentation masks.
- **Category mapping:** Proper categorization (tops/bottoms/one-pieces) is critical for multi-piece outfits. Saree/Lehenga handled as special cases is industry-appropriate for Indian ethnic wear.
- **Quota/credit system:** Monthly try-on credits per plan (Starter/Growth/Pro) is standard SaaS pattern.
- **Polling over streaming:** Polling job status (2s intervals) is simpler and more reliable than keeping SSE/websocket connections open for long-running generation.

**Current Kanchuki Implementation Analysis:**
- ✅ Maskless V-Tone v1.5 — no explicit mask needed, simplifies workflow
- ✅ Multi-piece chain (tops→bottoms) handles suits, lehenga, saree correctly
- ✅ Category exclusions (Dupatta) prevent incorrect try-on attempts
- ✅ Quota system with monthly resets (F-010 UsageCounter) — corrects the previous lifetime-credits bug
- ✅ Two initiation paths cover both shopkeeper and customer scenarios
- ⚠️ **Timeout tuning:** 30 min timeout measured at ~52s/step × 30 steps = 26 min on shared CPU. This is generous but may cause premature abort on busy boxes.
- ⚠️ **No GPU option detection:** Always uses CPU; no automatic fallback or different timeout based on available hardware.
- ⚠️ **Remote flow data URL limit:** 15MB body limit is reasonable but could reject very high-res customer photos.

**References:**
- V-Tone: Self-hosted, Apache 2.0, maskless approach — differentiates from commercial try-on APIs (V model, Alibaba TryOn)
- Indian ethnic wear category mapping: Specific to Kanchuki's target market (Indian fashion e-commerce)

---

### 3.3 AI Studio Shoots (F-032 Phase A)

**Industry Best Practices:**
- **Template-only generation:** Fixed prompts/presets avoid unpredictable AI outputs. Industry trend toward "style presets" rather than free-text prompts for product photography (IKEA, Amazon product images).
- **Subject preservation:** "Own the subject, not the scene" is the key principle. FLUX Kontext excels at this vs. Stable Diffusion inpainting.
- **Concurrency limiting:** BFL's 24-active-task cap requires per-API-key worker concurrency control. Industry pattern: rate-limited worker pools.
- **Result expiration:** 10-minute signed URLs prevent hotlinking and force re-download — security best practice.
- **Plan gating:** AI features behind plan tiers (Starter/Growth/Pro) is standard SaaS monetization.

**Current Kanchuki Implementation Analysis:**
- ✅ **Template-only** — 4 presets with fixed prompts, no free-text. Prevents "flat pasted" look and unpredictable results.
- ✅ **Subject preservation prompts** — instruct AI to keep product pixels identical + blend lighting/shadows.
- ✅ **Concurrency: 3** — stays well under BFL's 24-task cap. Safe for shared API key.
- ✅ **10-min URL validity** — signed URLs downloaded + re-served from R2. Never expose BFL URLs directly.
- ✅ **New photo row** (is_primary: false, metadata carries provenance) — original preserved, retailer can promote.
- ✅ **Plan gating** — Growth/Pro only, STARTER gets 402. Monetization aligned with usage.
- ⚠️ **Polling interval: 1s** — very frequent. Could be optimized to 2-3s initial, exponential backoff on later polls to reduce API load.
- ⚠️ **No progress indication** — Redis status only has 3 states (processing/ready/failed). No percentage or ETA.
- ⚠️ **Timeout: 120s** — may be insufficient for cold starts or large images. Demo uses 180s. Should match the longest expected generation.
- ⚠️ **No credit/metering** — generation cost is tracked via audit log/metadata but no real-time credit consumption display for retailers.

**References:**
- BFL FLUX Kontext docs: `docs.bfl.ml/kontext/kontext_image_editing`
- "Own the subject, not the scene" principle from product photography AI best practices
- SaaS plan tiering: Standard pattern (Starter/Growth/Pro)

---

### 3.4 Product Gallery

**Industry Best Practices:**
- **Swipe carousel:** 3-7 photos standard. Touch swipes preferred over arrows on mobile.
- **Variant color chips:** Click/tap to filter by color. Should show unavailable colors as disabled/greyed.
- **Lightbox/fullscreen:** Modal overlay, Escape to close, arrow navigation, touch swipe.
- **Lazy loading:** Only load visible images first, load rest on scroll/visibility.
- **Accessibility:** ARIA labels, focus management, color contrast.

**Current Kanchuki Implementation Analysis:**
- ✅ **Swipe threshold: 50px** — reasonable, prevents accidental swipes
- ✅ **Swipe debounce: 350ms** — prevents click-after-swipe from opening fullscreen
- ✅ **Color chips** — rounded pills with color swatches, sold indicator (red text), SOLD chips disabled + greyed (fixed 2026-08-21)
- ✅ **Fullscreen lightbox** — Escape key close, arrow navigation, touch swipe, black overlay
- ✅ **Sold/reserved ribbons** — clear visual indicators (red/amber badges)
- ✅ **Counter display** — current/total slide numbers
- ✅ **Lazy loading** (fixed 2026-08-21) — `loading="lazy"` on non-priority slide images + all thumbnails.
- ⚠️ **No intersectional preloading** — variant photos could preload when near current slide.
- ⚠️ **Aspect ratio fixed** — 3:4 ratio may not suit all product types (square products, long garments).
- ⚠️ **No loading state** for variant photos when tapping color chips (though skeleton spinners could be added).

**References:**
- Apple Human Interface Guidelines: Photo selection and browsing
- Google Material Design: Carousel and image gallery patterns
- Accessibility WCAG: Focus management in modals, aria-labels

---

## 4. Recommended Improvements

### 4.1 Ghost Mannequin / Photo Cleanup

| Priority | Recommendation | Rationale |
|----------|----------------|-----------|
| **High** | Add fast/slow quality mode | Allow retailers to choose between quick preview (lower quality) vs. production-grade output. Reduces average latency for browse-time use cases. |
| **High** | Pre-warm Python pipeline | Keep a warm subprocess running to avoid cold-start delays. Current serialization means first run of each session loads all models. |
| **Medium** | Add concurrent-safe local fallback | Instead of just a warning, make local python exec work with proper environment detection. Document the exact Python/SAM2/LaMa versions needed. |
| **Low** | Add progress WebSocket/events | Instead of sync endpoint, could return job ID and poll status (like try-on/studio shoots). Improves API responsiveness. |
| **Low** | Support WebP input/output | Modern formats reduce bandwidth. Add `--input-format` and `--output-format` flags to the Python script. |

### 3.2 Virtual Try-On

| Priority | Recommendation | Rationale |
|----------|----------------|-----------|
| **High** | Add GPU detection & auto-fallback | Detect if GPU available on V-Tone box, adjust timeout and possibly use different API endpoint. Currently always CPU with fixed 30min timeout. |
| **Medium** | Implement exponential backoff polling | Start at 2s, double to 4s, 8s, 16s max. Reduces API load during long generations. |
| **Low** | Add try-on preview expiration UI | Current 24h expiry not visually indicated in TryOnModal until late stage. Add countdown timer. |
| **Low** | Support more categories | Currently excludes Dupatta. If draping physics can be approximated, add with warning label. |

### 3.3 AI Studio Shoots

| Priority | Recommendation | Rationale |
|----------|----------------|-----------|
| **High** | Increase polling interval with backoff | Start at 1s for first 10 polls, then 3s, 5s, 10s, 15s. Reduces BFL API load and 429 errors. |
| **High** | Add progress/ETA to Redis status | Store generation progress percentage or estimated completion time. Improves retailer UX when polling. |
| **High** | Add credit consumption tracking | Track BFL credit cost per generation in job metadata. Display remaining quota on retailer dashboard. |
| **Medium** | Add image size validation before submit | Reject images >20MP or >20MB before BFL submit. Avoids wasted API calls on oversized inputs. |
| **Medium** | Add cold-start awareness | First generation per worker may be slower. Add 15-30s buffer to timeout on first generation per worker. |
| **Low** | Add before/after comparison UI | Show original photo side-by-side with generated result in status endpoint. Helps retailer assess quality. |
| **Low** | Support webp input | BFL accepts base64; validate and convert input to optimal format before submit. |

### 3.4 Product Gallery

| Priority | Recommendation | Rationale |
|----------|----------------|-----------|
| ~~High~~ ✅ | ~~Add lazy loading for variant photos~~ | Done 2026-08-21 — `loading="lazy"` on non-priority images + thumbnails. |
| ~~High~~ ✅ | ~~Add color chip disabled state~~ | Done 2026-08-21 — SOLD chips get `disabled` + `opacity-50 cursor-not-allowed`. |
| **Medium** | Add intersectional preloading | When user swipes near next/prev photos, preload those images. Improves perceived performance. |
| **Medium** | Make aspect ratio responsive | Instead of fixed 3:4, use `aspect-ratio: 3/4 min(640px / var(width), 1fr)` or allow per-product aspect ratio. |
| **Low** | Add loading skeleton for fullscreen | Show spinner or placeholder during image load in lightbox, especially on slow connections. |
| ~~Low~~ ✅ | ~~Add ARIA live region for status changes~~ | Done 2026-08-21 — `sr-only aria-live="polite"` span announces slide index + color. |

---

## 5. Summary

The Kanchuki platform's four photo-related systems demonstrate a well-thought-out architecture for an Indian ethnic wear e-commerce platform. Key strengths include:

1. **Proper separation of concerns** — heavy Python (photo cleanup, try-on) runs in sidecars or dedicated containers, keeping API lean
2. **Appropriate authentication** — shared secrets for sidecars, plan-gated access for AI features
3. **New-row-preserves-old data pattern** — originals always available, edited versions can be promoted
4. **Template-only AI studio shoots** — avoids unpredictable outputs, aligns with industry best practices
5. **Comprehensive quota/credit system** — monthly resets fix the lifetime-credits bug

Areas for improvement across all systems:

1. **Polling optimization** — all three async systems (try-on, studio shoots, photo cleanup) use fixed-interval polling; exponential backoff would reduce API load
2. **Progress/ETA visibility** — retailers benefit from knowing generation status beyond just "processing/ready/failed"
3. **Concurrency awareness** — especially for BFL studio shoots (stay under 24-task cap) and V-Tone timeouts (detect GPU vs CPU)
4. **Modern format support** — WebP/WebM for reduced bandwidth
5. **Loading/lazy loading** — Product Gallery and other UI components could benefit from deferred image loading

The platform's Indian ethnic wear focus (Saree, Lehenga, Kurti, etc.) is well-served by the category mappings and special-case handling (Dupatta exclusion from try-on, multi-piece chain for suits/lehenga). The overall architecture is sound and follows credible SaaS AI product patterns.

---

## Implementation Tasks

See [Photo Feature Implementation Tasks](../tasks/photo-feature-implementation-tasks.md) for a detailed list of recommended improvements and their priorities.