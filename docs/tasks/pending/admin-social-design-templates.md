# Admin-managed Social Design Templates + Paid AI Custom-Prompt Templates

**Status:** 🟨 **Merged to `main` (PR #243, `aab29697`) and deployed; migrations 153–155 applied by owner.** Decisions D1–D7 settled; T1–T4 built 2026-11-04; per-slide headline/offer text (migration 153) + multi-slot designs in the scheduler + **T5 paid AI tier (migrations 154/155, dark)** built 2026-11-05; none browser/device-tested; `social_templates` code retired 2026-11-05 (table kept); T5 gaps built 2026-11-05 (see BUILD-LOG); T6 starter pack built 2026-11-05 (10 designs, seed not run). **Update 2026-11-16:** `AI_CUSTOM_TEMPLATE` `plan_limits` rows are set (Starter 100 / Growth 200 / Pro 300 per month, from the owner's output); the Plan Features row is labelled "AI Custom Designs"; no `plan_features` row read back, so the tier is still treated as OFF; no real FLUX run yet.
**Origin:** owner review of `/admin/social-templates` (2026-11-04). Page is a read-only monitor of retailer-made rows; no sample templates exist; the AI generate path never saves its result (see §2).
**Owner decisions needed:** §9.

---

## 1. Goal

Two tiers, one picker in the retailer app:

| Tier | Who makes the design | Cost to retailer | How the post is made |
| --- | --- | --- | --- |
| **Free — Design Templates** | Kanchuki admin uploads/creates (background art + placeholder layout) | Free (plan-gated) | Retailer picks template → picks product(s) → server **fills variables** (product image, name, price, shop name, logo, phone, offer text) → composited with `sharp` → posts to FB/IG |
| **Paid — AI Custom Template** | Retailer's own **prompt** ("Diwali gold frame, mannequin on left, bold sale text") | Paid (credits / quota) | AI generates the background/scene for the prompt, product is composited on it, same variable fill, same publish path |

Both end in the **existing Composer / Scheduler publish path** (F-031 / F-043) — no new publishing code.

## 2. What exists today (verified in code, 2026-11-04)

| Piece | Where | Reuse? |
| --- | --- | --- |
| Hardcoded sharp templates: `white_price`, `new_arrival`, `festival_frame`, `logo_corner`, `collage_cover` | `apps/api/src/lib/schedule-render.ts` (`styleItemNow`, `resolvePostImages`), ids in `SCHEDULE_SLIDE_TEMPLATES` / `SCHEDULE_COVER_STYLES` (`@kanchuki/shared`) | **Yes — this is the render engine to generalise** |
| Template picker routes | `apps/api/src/routes/retailers/retailers-social/retailers-social-schedule-style.ts` (`GET /me/social/schedule/templates`, style item/post/plan) | Yes — registry becomes DB-backed |
| Admin-owned catalog pattern (DRAFT/PUBLISHED/HIDDEN + `plans[]` + `sort_order`) | `post_templates` (migration 091) — **text only** (caption + hashtags) | Pattern yes; table no (text-only) |
| Retailer AI image templates | `social_templates` (migration 069), `growth-social-templates.ts`, mobile `growth/templates.tsx`, admin `/admin/social-templates` | **Broken**, see below |
| FLUX/Kontext studio-shoot pipeline + quota reserve/refund | `lib/studio-shoot.ts`, `reserveJobQuota` / `refundJobQuota` | Yes for paid tier |

### Known defects in the current `social_templates` flow (fix or retire — decision D1)

1. `POST /growth/social-templates/:id/generate` queues a studio-shoot job **without the template id**; nothing writes `image_url`, `caption`, `hashtags` back to `social_templates`. Result: mobile shows "No image generated yet" forever; Share / Copy / Edit-caption never appear.
2. No code generates the caption/hashtags the empty-state promises.
3. Mobile "Copy Text" imports `Clipboard` from `react-native` (removed in RN 0.81; `expo-clipboard` already installed). Error is swallowed by an empty `catch`.
4. Hashtag save drops tags typed without `#`; Android `Share.share({url})` ignores `url`.
5. Admin "Occasions" stat counts the null-occasion group.

## 3. Is it doable? — Yes

All pieces exist except (a) a data-driven template format and (b) an admin editor. No new infra, no new vendor for the free tier (sharp + `fonts-dejavu-core` already in the API image). Paid tier reuses FLUX + quota machinery.

## 4. Design — Free tier

### 4.1 Template format (data, not code)

A template = **background asset** + **ordered layers**. Stored as JSON so a new design needs no deploy.

```jsonc
{
  "canvas": { "w": 1080, "h": 1350 },           // 4:5 IG; also 1080x1080, 1080x1920
  "background": { "r2_key": "templates/diwali-gold-01/bg.png" },
  "layers": [
    { "type": "image",  "var": "product_image", "x": 90, "y": 220, "w": 900, "h": 900, "fit": "contain" },
    { "type": "text",   "var": "product_name",  "x": 90, "y": 1140, "w": 900, "size": 56, "font": "serif", "color": "#FFFFFF", "align": "left", "maxLines": 2 },
    { "type": "text",   "var": "price",         "x": 90, "y": 1230, "size": 64, "color": "#FFD27A", "format": "inr" },
    { "type": "image",  "var": "shop_logo",     "x": 900, "y": 40,  "w": 140, "h": 140, "fit": "contain" },
    { "type": "text",   "var": "shop_name",     "x": 90, "y": 60,   "size": 40, "color": "#FFFFFF" },
    { "type": "text",   "var": "custom_text",   "x": 90, "y": 130,  "size": 36, "maxLen": 40 }
  ]
}
```

**Variables (closed list, server-filled):** `product_image`, `product_name`, `price` (paise → ₹, `inrFromPaise`), `mrp`, `discount_pct`, `sku`, `fabric`, `shop_name`, `shop_logo`, `shop_phone`, `shop_city`, `store_url`, `custom_text` (retailer types), `offer_text` (retailer types).
Multi-product templates: `layers[].index` selects the Nth product (collage = 4 / 6 slots).

### 4.2 Schema (new, additive migration — owner applies)

`design_templates` — mirror `post_templates` conventions:

| Column | Type | Note |
| --- | --- | --- |
| id, name, description | text | |
| status | `PostTemplateStatus` enum (reuse) | DRAFT/PUBLISHED/HIDDEN |
| plans | `SubscriptionPlan[]` | `[]` = nobody |
| occasion | text | Diwali, Navratri, Wedding, General… (feeds filter) |
| format | enum `SQUARE` / `PORTRAIT_4_5` / `STORY_9_16` | |
| product_slots | int | 1, 4, 6 |
| spec | jsonb | §4.1 |
| background_key, thumbnail_key | text | R2, validated by `verifyUpload()` |
| sort_order, usage_count | int | |
| created_at, updated_at | timestamp | |

RLS + DELETE grant: follow the RLS convention (every retailer-facing table needs RLS) and RC-049/RC-162 — **a migration that relies on hard delete must GRANT DELETE to `kanchuki_app`, or the route 500s with 42501**; prefer soft-hide (`status = HIDDEN`) and skip DELETE entirely.

### 4.3 Render engine

- New `apps/api/src/lib/design-render.ts`: `renderDesign(spec, vars) → Buffer` using `sharp` (composite for images, SVG `<text>` overlay for text so fonts/wrapping are deterministic).
- Keep the five built-ins working: migrate them into `design_templates` rows seeded by an owner-run script, **or** leave them as code and register as `kind: BUILTIN` — decision D2.
- Hard limits (RC-141): `MAX_IMAGE_PIXELS` via `limitInputPixels` on every decode; text length caps; escape all variable text (RC-040/RC-077 — SVG is HTML-like).
- Fonts: bundle 4–6 OFL fonts (one Devanagari, e.g. Noto Sans Devanagari) in the API image; a template may only name a bundled font. Hindi text must render (Key Constraint: regional UI).
- Render-at-publish (F-043 pattern) so price is current; a `preview` endpoint renders now.

### 4.4 Admin UI (`/admin/social-templates` becomes two tabs)

1. **Design Library** (new): grid of templates with status/plan badges; Create / Edit / Publish / Hide.
2. **Editor** — Phase 1 = form + JSON-lite: upload background PNG (≥1080 px), pick format, add layers from the variable list with x/y/size/colour, **live preview** using a sample product (button calls the preview endpoint). Phase 2 (only if needed) = drag-drop canvas (Konva/Fabric — new dep, defer).
3. **Retailer AI Templates** (the current page, renamed) — keep as monitor until D1 resolved.

Admin API: `GET/POST/PUT /v1/admin/design-templates`, `POST /:id/preview`, `POST /upload-url` (presign **with `content_length`**, RC-080), `PUT /:id/status`. Guard: `adminAuthPreHandler`; classify under `ADMIN_TIER` in `packages/shared/src/constants/admin-access.ts` (RC-034 — one list, not three). Audit-log writes.

### 4.5 Retailer flow (mobile)

Create Post composer + Scheduler gain a **"Design" step**:
`Pick design (filter by occasion/format)` → `Pick product(s)` → `Edit text vars (custom_text/offer_text; others auto)` → `Preview` → `Post / Schedule`.
Routes: `GET /v1/retailers/me/designs` (PUBLISHED ∩ plan), `POST /v1/retailers/me/designs/:id/render` (preview), then the existing publish endpoints accept `design_template_id` + `vars` per item (extend `ScheduledPostItem.template_id` semantics or add `design_template_id`; decide in D2).
Logo missing → hide the layer, never render a broken box. Product has no photo → block with a plain message.

## 5. Design — Paid tier (AI custom prompt)

1. Retailer types a prompt (≤ 300 chars) + picks format + product. Prompt is **sanitised and wrapped** server-side in a fixed system template (no raw passthrough — prompt-injection posture, RC-079); reject URLs, brand names, people-likeness requests.
2. Server reserves quota **first** (`reserveJobQuota`, new resource `AI_CUSTOM_TEMPLATE`, add to `METERED` in `lib/quota.ts` per RC-103 so "no row" = 0, not unlimited), enqueues a BullMQ job, refunds on failure (RC-102 pattern). Never call the model synchronously in a handler (CLAUDE.md §7).
3. Job: generate the **background/scene** with the product-conditioned pipeline used by AI Studio Shoot (FLUX Kontext), then run the same variable fill (§4.3) on top so price/logo/shop name stay exact (AI must never render price text — it garbles digits).
4. **Persist the result** (the bug in §2.1): write `image_r2_key` to a retailer-owned row, return via status poll, show in picker as "My AI designs". Option: "Save as reusable template" stores the prompt + chosen background for reuse with other products.
5. Billing: depends on `ai-credit-billing-model.md` (credit unit not decided). Until then gate by plan feature `AI_CUSTOM_TEMPLATE` + monthly quota in Admin → Plan Limits, and **seed the limit rows before deploy** (RC-103 owner step).
6. Content safety + Play policy: show "Report this AI content" (`ReportAiContent`, F-110 pattern); log the prompt in `ai_usage_logs`; DPDP — no customer photos in prompts.

## 6. Build order (each step shippable alone)

| # | Task | Output |
| --- | --- | --- |
| T1 | Fix/retire defects §2 (Clipboard → `expo-clipboard`, hashtag parse, null-occasion stat) + decision D1 | No dead UI |
| T2 | `design_templates` migration + render engine + unit tests (golden-image hash per built-in) | `renderDesign()` |
| T3 | Admin API + Design Library tab + form editor + live preview + seed 8–10 starter designs | Admin can create/upload |
| T4 | Retailer API + composer/scheduler "Design" step (mobile) | Free tier live behind plan flag |
| T5 | Paid AI custom prompt: quota resource, job, persist, picker, report button | Paid tier behind flag |
| T6 | Starter pack content (§7) × 3 formats | Content |
| T7 | Docs: CLAUDE.md index row, BUILD-LOG, PRO-REQUIREMENTS, DATABASE.md, `admin-access.ts` | Docs track commits (rule 10) |

## 7. Starter template catalogue (for T6)

Per-product: White + price strip · New Arrival badge · Sale % badge · Limited stock · Back in stock.
Festival frames: Diwali · Navratri · Eid · Karwa Chauth · Wedding season · Rakhi · Holi · Independence Day.
Multi-product: Collage 4/6 · "Under ₹X" · Fabric spotlight · Look of the day.
Shop: Store intro (logo corner) · Visit-us / location card.
Formats: IG 1:1 / 4:5, Story 9:16, WhatsApp Status 9:16, FB 1.91:1.

Look references (layout/mood only, not to copy): Visme Diwali sale posts, Kapwing Diwali, Canva WhatsApp Status, Simplified clothing-sale statuses.
**Licensing:** admin must create original art or use licensed/CC0 assets — do not upload Canva/Visme templates.

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| Admin uploads copyrighted art | Policy note in editor; upload limited to Super Admin / Admin |
| SVG text injection / XSS | Escape every variable; SVG rasterised by sharp, never served raw |
| Long/Hindi text overflows | `maxLines`/`maxLen`, auto-shrink to min size, then ellipsis; test with Devanagari |
| Render cost on scheduler tick | Render at publish, cap 1080 px, cache per (template, product, price, vars) hash |
| Paid tier spend runaway | Reserve-first quota, `METERED`, route rate limit, hourly `ai-spend-alert` already exists |
| AI garbles price digits | AI renders scene only; text always composited by sharp |
| Migration unapplied before deploy (RC-160) | Owner applies first; boot-time schema check already live |

## 9. Decisions needed from owner

| ID | Question | Recommendation |
| --- | --- | --- |
| D1 | Keep `social_templates` (retailer AI table) or retire it and replace with §5? | Retire; §5 supersedes it. **Done 2026-11-05 (code only):** API route, mobile `growth/templates.tsx`, client methods and the admin monitor are gone; the `social_templates` table, `SocialTemplateType` enum and `SOCIAL_TEMPLATES` plan key stay (no destructive migration; owner decides when to drop). Admin page moved to `/admin/design-templates`. |
| D2 | Move the 5 built-in sharp templates into `design_templates`, or keep as code? | Keep as code + register as BUILTIN; avoids regression risk in F-043. |
| D3 | Editor: form + live preview (Phase 1) or drag-drop canvas now? | Form first; canvas only if admin finds it painful. |
| D4 | Paid tier pricing unit — credits (needs `ai-credit-billing-model.md`) or flat monthly quota per plan? | Flat quota now, credits later. |
| D5 | Free tier plan gate — all plans or Growth/Pro only? | Starter gets 3 designs, Growth/Pro all. |
| D6 | Who may create designs — Super Admin only or ADMIN tier too? | `ADMIN_TIER` (per RC-161 tiers). |
| D7 | Who supplies original art for the starter pack? | Owner/designer; AI-generated backgrounds acceptable if no text is baked in. |

## 10. Acceptance (when built)

- Admin uploads a background, places 6 variables, previews with a real product, publishes → appears for an eligible retailer within one refresh.
- Retailer posts a Diwali design with product name, ₹ price, logo and shop name to FB + IG in ≤ 4 taps; Hindi `custom_text` renders correctly.
- Hidden/Draft designs invisible to retailers; plan gate enforced server-side.
- Paid prompt tier: refused at 0 quota, charged once, refunded on provider failure, result saved and re-openable.
- Tests: golden-image render per template, escaping/overflow cases, quota reserve/refund, route authz (retailer A cannot render with retailer B's product — RC-138/139 `assertOwnProducts` pattern).
- Device acceptance (none run yet as of 2026-11-14): `docs/tasks/pending/design-templates-device-test.md` — retailer picker, scheduler design step, AI design.
- Mobile `tsc` clean; **not device-tested until run on a real phone** (state this honestly in BUILD-LOG).

## AI poster styles (2026-11-17)

Spec `docs/superpowers/specs/2026-11-17-ai-poster-styles-design.md`; owner steps `docs/runbooks/ai-poster-styles-owner-steps.md`. Built on branch `feat/ai-poster-styles`, NOT merged; migration 164 (`design_templates.ai_prompt`) NOT applied; nothing run against real FLUX; no device test; no browser check of the admin editor; EAS build needed. Unverified: whether FLUX leaves empty space for text, 9:16 / 1.91:1 crops, real provider.
