# AI Product-Photo Feature — Full Requirements Review & My Thoughts

**Date:** 2026-08-07 (final review)
**Companion file:** `ai-photo-final-report-2026-08-07.html` — the same content as a visual, self-contained report (opens in any browser, images embedded).
**Source research:** `ghost-mannequin-and-ai-photo-edit-status-solution-2026-08-07.md` (status + solution), `multi-photo-catalog-pipeline-2026-08-07.md` and `ghost-mannequin-research.md` (prior sessions), plus fresh live trials this session (CLI demo + real API trial against your WhatsApp photos).

---

## 1. What you asked for (the requirement set, restated)

1. **Capture flow:** in product-add, the camera opens; the team clicks **1–5 photos** of the product.
2. **Minimum selection:** the team **must pick at least 3** of those shots.
3. **Per-photo options:** **crop** and **remove-background** controls after selection.
4. **Auto-professional output:** the system removes the background and adds a professional background so the picked photos look like proper catalog shots.
5. **Ghost-mannequin / AI image-edit feature status:** you asked what actually exists today and what it can and cannot do.
6. **Implicit hard rule (yours, and the right one):** the garment itself — print, color, embroidery — must not be altered by the AI.

## 2. What the team actually produces (the input reality, from your 14 real photos)

- **Hanging shots:** garments on a **grey mannequin bust**, on **hangers** against a **cracked/plastered wall** with nail holes and chalk numbers, or on a **wall hook**. Redmi **watermark + timestamp** burned into the corners. Garment fills only ~45–55% of the frame.
- **Folded shots:** suits folded on a **wrinkled bedsheet** (sheet creases dominate), **brand tags still stapled on**, slightly angled top-down.
- **Desired-output samples (4):** professional, styled brand photos (wooden hangers with props, moody backdrops) — measured and classified as **mood board**, not a literal scene to clone.

## 3. What already exists (status recap, all verified this session)

| Piece | Status |
|---|---|
| `scripts/batch-clean-photos.py` — bg removal, backdrop swap, shadow, shine, crop, ghost-mannequin gap-fill (rembg + LaMa, ₹0, no API key) | ✅ **Built & working** (re-verified on your photos + via the live API) |
| Python + rembg + LaMa in the production Docker image | ✅ Wired (needs Railway rebuild to be live) |
| Admin test page `/admin/photo-cleanup-test` + API route | ✅ Live (admin-only) |
| On-model demo (self-hosted V-Tone) | ⚠️ Works but **32 min/image on CPU** — demos only |
| Snappyit ghost-mannequin integration | ☠️ **Dead** — vendor has no public API (this caused the old key error) |
| Anything retailer-facing in product-add | ❌ **Not wired** — the whole flow is net-new |

## 4. Requirements analysis — what's right, and the two corrections that matter

### Right, keep as-is
- **Camera → 1–5 → pick ≥3 → crop/remove-BG → professional output:** well-formed and buildable. ~80% of the machinery exists; the gap is wiring + segmentation.
- **Fidelity-first:** segmentation + composite (background swap) never touches garment pixels. This is the single most important design rule, and the reason the ₹0 rembg path is safe where generative models are not.
- **Multi-photo per product:** your `Product.photos[]` model already supports 3+ images per product — no schema change.

### Correction 1 — "combine 3 photos into one" is the wrong mental model
Real techniques that fuse multiple shots (exposure fusion, focus stacking) need near-pixel-aligned tripod shots, not 3–5 handheld phone photos from different angles. No commercial product-photo tool fuses angles into one image; Amazon/Shopify treat each angle as a **separate catalog image**.
**What to build instead:** the team picks 3+ keepers (front, back, detail); **each** gets cleaned independently into its own catalog image; the sharpest is auto-flagged primary (Laplacian blur-score, a few lines, ₹0). This matches how your customer-facing carousel already works.

### Correction 2 — the 4 sample outputs are mood board, not spec
They're styled brand photos with props/plants/furniture. Cloning that scene is a much harder, more expensive generation task **and** risks violating your fidelity rule (more generative surface = more drift on embroidery). The cheap professional path gets you their *look* (clean, garment-forward, soft studio light) without the props. If staged scenes are ever wanted, they're a separate opt-in "premium listing" feature.

### Scope correction 3 — "ghost mannequin" as currently built has a ceiling
The built ghost-mannequin mode only fills **backdrop-colored hollow gaps** (e.g. a low neckline showing a plain wall through it). It does **not** remove a mannequin/hanger of a different color — proven live this session (pixel-identical to plain composite on your mannequin shot). True invisible-mannequin quality needs either SAM2-based hardware removal (₹0, build it) or a paid service. Set expectations accordingly.

## 5. My thoughts — the recommendations

1. **Build SAM2 + LaMa masked inpainting as item #1.** Every remaining failure mode from the live trial (mannequin bust + stand, hanger + hook, bedsheet remnants, props) is a *segmentation* problem — rembg segments by saliency, not identity, and can't separate touching objects. SAM2 is promptable ("click the hanger, not the garment"), free, CPU-capable, and closes the biggest gap between your photos and professional output.
2. **Default ₹0, pay only for the rare exception.** The existing F-023 AI-credit meter is the exact billing rail for any paid step. Photoroom API ($0.02 ≈ ₹1.7/image) and Claid (~₹3–10) are the two candidates for a paid trial against your embroidered pieces — not wired until the A/B is done.
3. **The cheapest lever is a better raw photo.** A live garment-guide overlay + on-device blur/exposure check + two one-line staff rules ("hook slightly out of the silhouette", "remove stapled tags") shrinks the hard cases so the AI rarely has to work. Zero cost, big effect.
4. **Mobile-only, in product-add.** There is no retailer web app; a desktop fallback is a new surface with no users. Ship the flow exactly as you described it.
5. **Don't build:** self-hosted diffusion for "boutique" repaints (V-Tone proved 26–32 min/image on your CPU box), multi-image fusion, staged-scene generation in the default path, Snappyit (dead), Remove.bg (overpriced for what it does).

## 6. The build plan (agreed order)

| # | Item | Why | Est. |
|---|---|---|---|
| 1 | **SAM2 hanger/mannequin/bedsheet removal** + LaMa masked inpaint in the pipeline | Closes every failure mode the live trial found; ₹0/image | ~1 week |
| 2 | **Retailer capture screen** (camera guide overlay, blur/exposure check, pick ≥3, crop / remove-BG / backdrop options) | The flow you described; all options already exist in the script | ~1 week |
| 3 | **API wiring + F-023 credit metering + audit** | Makes it retailer-facing with the same billing rails as AI tagging | ~3 days |
| 4 | **Photoroom vs Claid A/B trial** (free tiers) on real embroidered pieces | Settles the paid exception path + Claid's real price | ~1 day (spike) |

## 7. Cost fit (₹999 / ₹2,499 / ₹4,999 plans)

- Default path: **₹0 per product** — absorbs into any plan.
- Paid exception path: ~₹2–16/image, metered as addon — should be a minority of photos after SAM2 + staff guidance.
- On-model premium (Kolors @ ~₹5.8/image): future upsell, not plan cost.

## 8. Honest risks & expectations

- **SAM2 is the make-or-break item:** if it can't cleanly separate hardware on heavily-embroidered garments, the paid exception path carries more load than hoped. Evaluate on a real batch before committing (acceptance criteria: mannequin+stand gone, hanger+hook gone, sheet corners clean, props excluded).
- **"Professional" has a ceiling without staging:** the default path yields clean, flat-backdrop catalog shots — the look of your samples, minus props. That's what ₹0 buys.
- **Ghost-mannequin expectations:** Tier-B approximation quality at best from the self-hosted path; true studio ghost-mannequin needs the 2-photo technique or a paid service.
- **Deployment:** the Dockerfile Python/rembg/LaMa wiring exists but needs a Railway rebuild; verify before assuming production is live.

## 9. What I need from you to start

- Green light on the 4-item build order (or overrides — the decisions in §5 are defaults).
- A batch of ~20 more real photos across your categories for the SAM2 evaluation baseline.
- Confirmation that the 4 sample outputs are mood-board only (assumed, not yet confirmed by you).
