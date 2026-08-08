# Ghost Mannequin + AI Product-Photo Edit — Feature Status, Requirements Review & Solution Report

**Date:** 2026-08-07 (rev 2)
**Status:** Research + status report. No production code was changed. A **fresh demo run** of the existing cleanup pipeline was executed locally against 3 of your real team photos (see §2.3) so the "status" section is evidence, not memory.
**Related docs:** `docs/photo-feature/ghost-mannequin-research.md` (2026-08-06 — why the Snappyit integration is dead), `docs/photo-feature/multi-photo-catalog-pipeline-2026-08-07.md` (earlier today — prior research on the same queries).
**Revision note (rev 2, per your request):** this revision **reviews** `multi-photo-catalog-pipeline-2026-08-07.md` and **merges its findings + queries into this report** so there is one complete reference. What changed: the commit-level status table, the detailed photo/reference analysis, the gpt-image-1/Gemini generative options, the capture-UX depth (ML Kit), the resources inventory, and the earlier source list are now folded in (§0 explains what was kept, what was superseded, and the two pricing/priority reconciliations).

---

## 0. Review of the earlier research doc (`multi-photo-catalog-pipeline-2026-08-07.md`) — what survives, what changed

| Earlier doc's claim | Verdict after this session | Action in this report |
|---|---|---|
| Status table verified via `git log` (commits `3a3f863` → `9f843f3`) | ✅ Confirmed accurate | Incorporated in full (§2.1) |
| "Railway has no Python" note in CLAUDE.md is stale (Dockerfile commit `bf42d28` baked Python+rembg+LaMa in) | ✅ Confirmed — but needs a Railway **rebuild** to be live | Kept (§2.1) |
| Ghost-mannequin mode only fills *backdrop-colored* gaps; can't remove a differently-colored mannequin/hanger | ✅ **Re-proven with fresh numbers this session** (14.6% grey survives on your mannequin shot, §2.3) | Kept + upgraded (§2.3) |
| Your 4 output samples are mood-board references (stock/marketing photos), not literal spec | ✅ Confirmed; I additionally measured them (dimensions/file sizes) | Kept, enriched (§3.3) |
| "Combine 3+ photos into one image" is the wrong mental model (exposure fusion needs aligned shots) | ✅ Confirmed | Kept (§4) |
| Segmentation+composite over generative repaint for fidelity | ✅ Confirmed — this is the single most important design rule | Kept (§5.5) |
| SAM2 = "follow-up research item, not committed" | ⚠️ **Upgraded to core build item** — the demo run is direct evidence of the failure it fixes, and it's the difference between "clean" and "your photo minus the mannequin" | Upgraded (§5.1) |
| Claid.ai ≈ ₹10/image | ⚠️ **Reconciled:** this session's pricing research says ~$0.036–0.059/credit ≈ ₹3–5 (1 credit per bg removal). Exact price needs a paid-trial quote | Range presented (§5.2) |
| Generative fallback = gpt-image-1 (masked) / Gemini Flash Image | ✅ Good options, kept — **but only as the metered exception path**, now that SAM2+LaMa covers the common case at ₹0 | Kept (§5.3) |
| 3 open questions | ✅ Kept + expanded to 5 (§9) | Merged |

---

## 1. Executive summary (read this if you read nothing else)

1. **The AI photo-edit engine you asked about already exists and works** — background removal, backdrop replacement, shadow, shine, crop, and a *partial* ghost-mannequin (hollow-gap fill) are all built and running in `scripts/batch-clean-photos.py`. **But it is an admin-only test tool.** It is NOT in the retailer's product-add flow, has no per-retailer quota/billing, and cannot do what your 8 sample photos actually need most: **removing the mannequin, hanger, hook, and watermark** that are physically touching the garment. My fresh demo run proved that (14.6% of the "cleaned" output is still grey mannequin/hanger plastic — see §2.3).
2. **Your requirements, restated honestly:** camera → 1–5 shots → pick ≥3 → crop/remove-BG → each kept photo comes out clean and professional (new background, no clutter), NOT "3 photos fused into one" (that's not a real technique — each kept photo becomes its own cleaned catalog image, which your product model already supports via `Product.photos[]`). Your 4 "output" samples are mood-board/art-direction references (styled lifestyle shots with props) — chasing that exact look is a much harder and more expensive generation task than "clean this garment photo."
3. **Cheapest professional path (recommended):** keep the free self-hosted engine (rembg + LaMa, **₹0/image**) as the default for every photo; add **SAM2** (Meta's Segment Anything 2, free, CPU-capable) to finally kill the mannequin/hanger problem; and reserve a **paid hosted API** only for the rare case that's still too hard. Photoroom API ($0.02 ≈ ₹1.7/image) and Claid.ai (~₹3–10/image, fashion-specialized) are the two worth testing; gpt-image-1 (masked, ~₹1.7–16) is the generative fallback for stuck overlap cases. Full pricing table in §5.
4. **The flow you described maps 1:1 onto building blocks that 80% already exist.** The net-new work is: a retailer-facing capture screen (camera guide + blur check), wiring the existing Python script into the product-add flow with the existing AI-credit metering (F-023), and adding SAM2-based hanger/mannequin removal. Nothing needs a GPU, and nothing needs a new third-party dependency you haven't already budgeted for.

---

## 2. Status of the "ghost mannequin" and "edit product image using AI" feature

Verified against `git log` and by reading the code, not from docs (this project has a documented doc-staleness pattern — memory entry "doc staleness pattern").

### 2.1 What is built and actually works today

| Date | Commit | Piece | Status |
|---|---|---|---|
| 2026-08-05/06 | `3a3f863` | Standalone `scripts/batch-clean-photos.py` (rembg bg-removal + composite onto color/backdrop + shadow + shine, or `--blur` portrait mode) wired into an **admin-only test page** (`/admin/photo-cleanup-test`) | ✅ Real, working — re-verified this session on your photos (3/3 cleaned) |
| 2026-08-06 | `bf42d28` | **Python + rembg + simple-lama-inpainting baked into the production API Docker image** (`apps/api/Dockerfile`). This makes the old "Railway has no Python" note stale — but a Railway **rebuild** is required for it to be live, not just a git push | ✅ Wired (deploy pending) |
| 2026-08-06 | `0c66a7f` | `--ghost-mannequin` mode: fills backdrop-colored hollow regions (neckline/sleeve holes showing the wall through them) with local LaMa inpainting, no API key. **Confirmed limitation:** does NOT remove a mannequin neck/stand/hanger of a *different color* than the backdrop | ✅ Built — limitation re-confirmed this session (§2.3) |
| 2026-08-06 | `23efa22` | Fixed dev-environment bug (wrong Python binary silently picked) | ✅ |
| 2026-08-07 | `9f843f3` | Optional `--crop` rect param + drag-rect picker on the admin page — isolates the subject before segmentation when a second garment/prop touches it | ✅ Built |
| — | Admin page "On model" button (V-Tone) | Self-hosted Fashion V-Tone on Hetzner CX43 + `apps/api/src/jobs/admin-tryon.ts` | ⚠️ Works end-to-end but **32 min/image on CPU** — admin demos only, unusable at catalog scale (§5.4) |

### 2.2 What is dead / broken

| Piece | Status |
|---|---|
| **Snappyit ghost-mannequin integration** (`packages/ai/src/snappyit.ts`, `apps/api/src/jobs/ghost-mannequin.ts`) | ☠️ **Dead on arrival.** Snappyit has no public developer API at all (the endpoint was inferred/guessed, never verified — the file's own comment admits it). This caused the old `SNAPPYIT_API_KEY is not configured` error on the admin page. Recommend deleting the files + stale UI wiring; they can only ever error. |
| V-Tone for catalog-scale use | ⚠️ Wrong tool (try-on, not ghost mannequin) + wrong speed (CPU 32 min/image, single-request-blocking). Keep for admin demos only. |

### 2.3 Fresh evidence: I ran the current pipeline on your real photos

To make the status concrete instead of theoretical, I copied 3 of your actual team photos into `scripts/demo/2026-08-07-status/input/` and ran the existing script:

- `shot1-mannequin.jpg` (garment on the translucent grey mannequin bust — your 4.33 PM batch)
- `shot2-hanger.jpg` (garment on a hanger on the wall hook — your 4.33 PM batch)
- `shot3-folded.jpg` (folded suit on the wrinkled bedsheet — your 5.39 PM batch)

**Result:** all 3 cleaned successfully in composite mode (`out-composite/`), plus ghost-mannequin mode on the mannequin shot (`out-ghost/`). **Open these files yourself and compare** — they're the honest "before → what today's tool does" picture.

Pixel-level sanity check (my measurement, automated):

| Output | Foreground coverage | Grey "plastic/hanger" pixels inside foreground |
|---|---|---|
| `shot1-mannequin` composite | 35.5% | **14.6%** ⚠️ |
| `shot1-mannequin` ghost mode | 35.6% | **14.3%** ⚠️ |
| `shot2-hanger` composite | 51.1% | 9.6% ⚠️ |
| `shot3-folded` composite | 46.0% | 7.4% |

**Interpretation (matches the documented limitation, now confirmed on your photos):** the grey mannequin torso, hanger, and hook **survive the cutout** — rembg segments by saliency, not by identity, and can't separate a hanger touching the garment from the garment. The ghost-mannequin flag doesn't help here because it only fills *backdrop-colored* gaps, and your hangers are a *different color* than the wall. This is the single biggest gap between "your team's photo" and "the professional look you want" — and it's exactly what SAM2 (§5.1) fixes.

### 2.3a Demo verdict — is this good enough to build on? (2026-08-07, browser-verified + pixel-corroborated)

A headless-browser visual inspection of the gallery (`scripts/demo/2026-08-07-status/gallery.html`) plus automated pixel stats produced this verdict:

| Check | Result | Verdict |
|---|---|---|
| Background replacement (cracked wall/bedsheet → flat backdrop) | Backdrop border std-dev 2.2 vs 11–51 on raws; uniform color confirmed visually | ✅ **Production-worthy** |
| Camera watermark/timestamp removal | 0.00% corner residue on all hanging shots (was 96–98% on raws) | ✅ **Complete** |
| Cutout edges | Visually clean/smooth with soft drop shadow; embroidery/tassel detail kept | ✅ Good |
| Garment fidelity | Edge-energy (detail proxy) *rose* 10→20–33 after shine — detail enhanced, not smoothed | ✅ Good |
| Mannequin/hanger/hook removal | Mannequin bust + floor stand survive: 32.7% grey in top band, 40.3% bottom band of shot1 output; black hanger + hook still visible on shot2 | ❌ **The SAM2 gap — build item #1** |
| Ghost-mannequin mode on these photos | 2% subtle pixel diff vs composite (invisible at scale, no artifacts) — effectively a **no-op** because the mannequin/hanger occupy the hollows instead of the backdrop | ⚠️ Only matters for garments shot on a plain backdrop with genuine hollow gaps |
| Folded-on-bedsheet case | Cleaner than hanging shots but bedsheet remnant survives in corners (31.6% corner residue) — sheet pixels touching the garment get kept as "foreground" | ⚠️ Needs SAM2/crop too |

**Bottom line:** the composite *mechanics* — backdrop swap, watermark kill, edge quality, garment fidelity, shadow/shine — are solid enough to build on **as-is**. What is NOT good enough is the *segmentation* for hardware-on-garment shots, which is precisely the SAM2 + LaMa masked-inpaint upgrade (§5.1, build item #1). The as-built ghost-mannequin mode should be relabeled/expected to only help backdrop-colored hollow gaps (e.g. a low neckline against a plain studio backdrop), not hanger/mannequin shots.

### 2.3b Live API trial — the admin page's own backend, 7 combos, real photos (2026-08-07)

Beyond the CLI demo, the **actual admin API** (`POST /v1/admin/photo-cleanup/run` + presign uploads — the exact calls the admin page makes) was driven end-to-end against 4 real WhatsApp photos with 7 option combos (driver: `scripts/demo/2026-08-07-admin-trial/trial.py`, full per-run table + numbers in `summary.md`). All 7 succeeded — CSRF → presign → upload → script → R2 write → ≤80KB compress, no crashes. Results are **browser-verified AND pixel-measured**: every finding below was confirmed visually in the rendered gallery (`scripts/demo/2026-08-07-admin-trial/gallery.html`).

| Combo | What it proved | Verdict |
|---|---|---|
| Composite on mannequin shot | Mannequin **bust + floor stand survive** (37% grey top band, 47% bottom); backdrop clean, watermark gone | ❌ The SAM2 gap, on the real API |
| Ghost-mannequin mode (same shot) | Pixel-identical to composite (36.5% vs 37.1% grey) — **no-op** | ⚠️ Only fills backdrop-colored gaps; not for hanger/mannequin photos |
| Composite on hanger shot | **Hanger + wall hook survive** (20% grey top band); watermark gone | ❌ SAM2 gap |
| Blur mode (keeps own bg) | Background blurred but **camera watermark/timestamp still visible** — by design, but useless for watermarked raws | ⚠️ Needs crop-first or composite |
| Composite on folded shot | **Bedsheet remnant survives** in corners (48.5% residue) — sheet touching garment kept as foreground | ❌ Needs mask/SAM2 |
| Composite + crop on folded shot | **Crop works** — sheet grey drops 23%→6%, garment fills frame | ✅ Feature as designed |
| Composite with mood-board bg on wooden-hanger+props shot | **Wooden hanger + vases + plants all kept** as foreground; busy backdrop + touching props = unsupported | ❌ Guidance: no props touching garment; SAM2 for the rest |

**Verdict of the live trial:** the admin photo-cleanup plumbing is production-worthy (all 7 combos ran clean, watermark removal and backdrop swap work, ≤80KB wiring holds). **Every remaining failure mode is a segmentation problem, not an infra problem** — and each one is exactly what SAM2 + masked inpainting targets (§5.1). Two harness quirks were triage-ruled as non-bugs: Cloudflare error-1010 blocks Python's default User-Agent on `*.r2.dev` downloads (browsers always send a real UA — the page is unaffected), and the CSRF pair must be minted per process (the page does this automatically).

Also visible in the raws (from the vision analysis of all 8 photos): the **Redmi watermark + timestamp burned into the bottom corners** (needs cropping, which the existing `--crop` handles), the garment filling only ~45–55% of frame height (capture-guide fix, §8), and **brand tags still stapled on the folded pieces** (staff instruction + crop, cheapest possible fix).

### 2.4 The gap, precisely

| Requirement from your brief | Today's tool | Gap |
|---|---|---|
| Click 1–5 pics in the product-add camera | Not wired at all — admin page only | **Net-new** retailer-facing capture screen |
| Pick at least 3 | N/A | Selection UI in the capture flow |
| Crop option | ✅ `--crop` exists (admin page) | Port to mobile flow |
| Remove background | ✅ rembg (free, works) | Port to mobile flow |
| Add professional background | ✅ composite onto flat color / backdrop image | Port to mobile flow |
| Remove mannequin / hanger / hook / watermark from the photo | ❌ Confirmed failing (see §2.3) | **SAM2 + masked inpaint** (§5.1) |
| Make it look "professional/boutique" | ⚠️ Flat backdrop + shine ≠ styled lifestyle scene | Decide: clean-catalog look (cheap, recommended) vs staged-scene look (expensive, §5.4) |

---

## 3. Your requirements — reviewed and restated

### 3.1 The flow you described (verbatim intent)

> When adding a new product: camera opens → team clicks 1–5 pics of the product → they pick **at least 3** → they get a **crop / remove-BG** option → the system removes BG and adds a background so the minimum-3 clicked photos look professional.

**Verdict: this is a well-formed, buildable spec.** Each step is either already-built or a small net-new mobile screen. See the mapping table in §2.4 and the phased plan in §5.6.

### 3.2 What your team actually clicks — all 8 photos analyzed

**Batch 1 (4.33 PM) — garments on hangers/mannequin:**
- Garment on translucent **grey mannequin bust** (hanger + wall hook visible) — the turquoise kurta
- Garments on **hangers** against a cracked off-white wall (maroon anarkali, yellow suit, pink suit) — the wall itself has old nail holes, chalk numbers and staining; background is the dominant visual noise
- One shot is a styled **wooden-hanger + vases + lavender** scene (this one is *already* close to the professional look — the odd one out)
- All carry the **Redmi Note 8 Pro watermark + timestamp** (burned in bottom-left/bottom-right)
- Garment fills ~45–55% of frame (well under the ~85% industry guidance); flat daylight lighting is actually fine — that part needs no AI

**Batch 2 (5.39 PM) — folded/unstitched suit pieces:**
- Folded on a **wrinkled white bedsheet** (sheet creases + shadows are the main distraction)
- **Brand tags still stapled on** (sometimes covering the embroidery you'd want visible)
- Slightly angled top-down, not perfectly flat — mild keystoning
- Same watermark/timestamp

### 3.3 Your 4 "output" samples — verified, measured, and classified as mood board

| File (in your Downloads) | Size | What the analysis concluded |
|---|---|---|
| `ee190198793cb52cfee9d447f04af1e0.jpg` | 1086×1448 | Styled wooden-hanger/plant/vase lifestyle shot (softly lit wall, ceramic vase, lavender bouquet) |
| `4386faa5eaf45770d94a21d8e0e5a118.jpg` | 750×1000 | Moodier backdrop / editorial shot |
| `7962014913ff046e0d1bdc5657b0f57e.jpg` | 1080×1350 | Styled linen/ad-style shot |
| `ca2b6ca19e5f8c889194c7d0e2133314.jpg` | 743×1280 | Mannequin bust against distressed wallpaper backdrop (with a horse-head sculpture prop) |

**Honest read (same conclusion as the earlier doc, now with measurements):** these are **art-direction / mood-board references** from other apparel brands, not a literal "make MY products look like THIS scene" spec. They feature props, plants, and furniture. Recreating *that exact look* is a fundamentally harder (and more expensive, less controllable) generation task than "clean the garment photo up," and it conflicts with the requirement you care most about: **the garment's actual print/embroidery must not be altered** (generative models drift on fine patterns — saree borders, zari work, bootis). The professional-but-cheap path (§5) targets the *look and feel* of those samples (clean, well-lit, garment-forward) without cloning their props.

### 3.4 Restated as testable requirements (acceptance criteria for the build)

1. **Remove/replace** the busy real-world backdrop (cracked wall, bedsheet) with a clean flat color or simple repeatable studio backdrop — **never alter garment pixels** (segmentation+composite, not generative repaint — the single most important fidelity-safety property for a fashion catalog).
2. **Remove foreground hardware:** mannequin, hanger, hook, stapled tags, watermark. (Crop covers simple cases; SAM2 + masked inpaint covers overlap cases. This is the hard requirement.)
3. **Straighten framing:** garment fills more of the frame; dead space + watermark cropped out.
4. **Fidelity is non-negotiable:** AI steps must not change print/color/embroidery. Any generative step needs a mask so only non-garment pixels change.
5. **Pick ≥3 of 3–5 shots** → each kept photo becomes its **own** cleaned catalog image (front, back, detail), one auto-flagged as primary/thumbnail. No pixel-fusion of multiple angles (see §4).
6. Per-photo options after selection: **crop**, **remove-BG + background** (flat color or retailer-chosen backdrop image), **shine/contrast**. All three already exist in the script.
7. Runs inside the existing **AI-credit metering** (F-023 `AI_TAGGING_CALL`-style quota + addon top-up), so the platform never eats unbudgeted AI cost.

---

## 4. The design question you should not build wrong: "combine 3 photos into one"

**No — not as literal pixel fusion.** Techniques that fuse multiple shots into one better image (exposure fusion, Mertens et al.; focus stacking) require near-pixel-aligned shots — a tripod-mounted bracketed exposure sequence, not 3–5 handheld phone photos from different angles and distances. No commercial product-photo tool fuses angle shots into one image; Amazon/Shopify's multi-photo guidance treats each angle as a **separate catalog image** (front, back, detail, worn).

What "click 3–5, pick ≥3" should produce, and what your data model already supports (`Product.photos[]` is already multi-photo — this is also what the 2026-08-03 photo-slider fix was built around):
- **You (the retailer) pick the 3+ keepers** — a person decision, zero AI cost.
- Each kept photo gets cleaned independently → 3+ professional catalog images per product, exactly how your customer-facing carousel already works.
- The sharpest/best-centered one is auto-flagged primary via **blur-variance (Laplacian) + exposure-histogram scoring** — a few lines, no ML model, runs on-device instantly.

If you later want a literal "front view + embroidery close-up inset in one hero image," that's a templated collage (a distinct, much smaller feature) — not this pipeline.

---

## 5. Solution options — what's professional but cheaper for retailers

Three tiers, cheapest first. Every price converted at ₹83/$1. **All options below keep the garment pixels untouched (masked/segmentation-based) except where explicitly flagged as generative.**

### 5.1 Tier 1 — Self-hosted, ₹0 per image (the current engine + one upgrade)

| Step | Tool | Cost | Notes |
|---|---|---|---|
| Background removal + composite + shadow + shine | `rembg` (already built) | ₹0 | Works today on your photos |
| **Remove mannequin/hanger/hook that touches the garment** | **SAM2** (Meta Segment Anything 2 — free, open, promptable: "click the hanger, not the garment") + LaMa inpaint of the masked region | ₹0 (CPU-feasible for this small model; your existing `simple-lama-inpainting` already runs on CPU) | **This is the upgrade that closes your biggest gap** (§2.3). The earlier doc flagged it as follow-up research; the fresh demo evidence makes it the core build item. Evaluate on a real batch of your photos before committing |
| Ghost-mannequin hollow fill (neckline/sleeve gaps) | LaMa (already built, `--ghost-mannequin`) | ₹0 | Works for backdrop-colored gaps only |

- **Reference:** SAM2 — https://github.com/facebookresearch/sam2 · IOPaint/LaMa — https://github.com/Sanster/IOPaint · rembg — https://github.com/danielgatis/rembg
- **Honest quality ceiling:** a clean, flat-backdrop, garment-forward catalog image — the *look* of your sample outputs minus the props. This is genuinely the tier the $7–35/month consumer tools sell.

### 5.2 Tier 2 — Cheap hosted API for the hard leftover cases (pay-per-image, only when Tier 1 isn't enough)

| Service | Price/image | Free tier | Ethnic-wear quality | Best for |
|---|---|---|---|---|
| **Photoroom API** | **$0.02 (≈₹1.7)** bg-removal / $0.10 (≈₹8.3) edit API | 1,000 trial calls | Excellent on pleats/threadwork | Cheapest managed fallback; also sells a **ghost-mannequin tool** (https://www.photoroom.com/tools/ghost-mannequin) |
| **Claid.ai** (fashion API) | ~$0.036–0.059/credit (≈₹3–5), 1 credit per bg removal — earlier doc said ~₹10; **confirm with a paid trial** | 50 free credits | **Best-in-class for zari/brocade/sequins** (https://claid.ai/fashion) | The one to trial if your embroidered pieces need more edge fidelity than rembg gives |
| **Pixelcut API** | $0.05 (≈₹4.3)/image | credit packs from $10 | Good; occasional edge artifacts on tassels | Also has an automated ghost-mannequin generator |
| Remove.bg | $0.20–0.23 (≈₹17–20) | 50 previews | Weaker on sheer/net sarees | ❌ Overpriced vs modern alternatives — avoid |
| Canva API / Cloudinary | n/a / bundled | — | — | ❌ Wrong architecture (no clean pay-per-image bg API) |

**Recommendation:** default everything to Tier 1 (₹0). Keep **one** Tier-2 key (Photoroom first, Claid as the fashion-quality A/B) wired behind the **existing F-023 AI-credit meter** for the flagged hard cases (e.g., a hanger overlapping the garment that SAM2 still can't cleanly separate, or a retailer who insists on an instant result). Even at 500 photos/month for a Growth retailer, if the paid path were used on *every* photo it'd be ₹850–4,150/month — too much for flat plans; as an *exception path* it's a rounding error.

### 5.3 Tier 2b — Generative masked-inpaint fallback (the earlier doc's recommendation, kept as the *last resort*)

| Option | Cost/image (₹) | Garment-fidelity risk | Fit |
|---|---|---|---|
| **OpenAI gpt-image-1** | ₹1.7 (low) – ₹16 (high) | **Lower risk** — true **mask-based inpainting** (edit only masked pixels, rest untouched byte-for-byte). Deprecates Oct 2026, successor live — re-check before committing | Best generative primitive for "remove ONLY the mannequin-stand pixels, leave the garment alone." Use masked, never prompt-only |
| **Gemini 2.5 Flash Image ("nano banana")** | ~₹3.2 | **Real risk** — prompt-only edit, no mask input, can "re-imagine" adjacent regions; known to drift on fine pattern/text. Retires Oct 2026, successor exists — re-check pricing | Cheapest, but needs a locked-down prompt + a before/after comparison check; not for embroidery-heavy garments without a mask |

With SAM2+LaMa in Tier 1 covering the common overlap case at ₹0, this tier should almost never fire — keep it wired (same F-023 meter) as the escape hatch, not the default.

### 5.4 Tier 3 — Managed ghost-mannequin / on-model services (optional premium add-on, not the default)

| Service | Price | What it does | Notes |
|---|---|---|---|
| Photoroom ghost mannequin tool | part of Pro/Max (~$10–13/mo + credits) | Automates invisible-mannequin look from one photo | Consumer/API hybrid |
| Kaptured.AI | ~$19–29/mo tiers | Fashion-specific ghost mannequin + catalog pipelines | https://www.kaptured.ai/best/ghost-mannequin-tools/ |
| ZMO.ai | ~$19–29/mo + API | AI models + ghost mannequin at scale | Good pose variety |
| **Kolors Virtual Try-On via fal.ai** | **$0.07 (≈₹5.8)/generation** | Garment → photo of model wearing it | Strong on ethnic wear (good Asian-apparel dataset); API: https://fal.ai/models/fal-ai/kling/v1-5/kolors-virtual-try-on |
| Fashn.ai API | ~$0.075 (≈₹6.2)/generation | Same category, industry standard | https://fashn.ai |
| Your self-hosted V-Tone (Hetzner) | €12/mo box you already pay | Same category | **32 min/image CPU** — admin demos only, not catalog |

**Where this fits your brief:** "on-model" is *not* what you asked for (you asked for the garment photo itself to look professional). But if a customer-facing hero shot of a model wearing the piece ever becomes a premium listing feature, Kolors@$0.07 is the cheapest credible path — **do not** scale V-Tone for this. Keep it out of the default product-add flow; it's the "₹999-plus" upsell tier.

### 5.5 What NOT to do (ruled out, with reasons)

- **Self-host diffusion for "make it boutique" repainting on CPU** — you already measured V-Tone at 26–32 min/image on the CX43. Diffusion on CPU is the same wall regardless of task. Use hosted APIs for anything generative.
- **Literal 3-photo pixel fusion** — not a real technique for handheld phone shots (§4).
- **Recreate the staged prop scenes from your 4 samples** — much harder + higher fidelity risk; a separate opt-in "premium listing" feature if ever wanted.
- **Snappyit** — dead vendor, delete the code.
- **Remove.bg / Canva API** — overpriced or wrong architecture (§5.2 table).
- **Prompt-only (unmasked) generative edits on garment pixels** — this is how embroidery gets hallucinated away. Mask or don't generate.

### 5.6 Recommended architecture (hybrid, cost-ordered)

```
Retailer product-add camera (net-new screen)
  ├─ 1–5 shots + live garment guide frame (improves raws — §8)
  ├─ pick ≥3 keepers (person decision, ₹0)
  ├─ on-device blur/exposure check before accept (₹0)
  └─ per-photo options: crop | remove-BG + backdrop | shine   ← script already does all 3
        │
        ▼
  API job (wired like the admin page, but retailer-facing + quota-gated)
  ├─ rembg cutout → composite onto flat color / retailer's chosen backdrop   ← ₹0, default
  ├─ SAM2 prompt to separate & remove hanger/mannequin → LaMa inpaint mask    ← ₹0 (new build)
  ├─ watermark/dead-space auto-crop                                        ← ₹0
  ├─ flag "still has overlap" → optional paid masked call (Photoroom/Claid/gpt-image-1)  ← ~₹2–16, metered via F-023 credits
  └─ each kept photo saved to Product.photos[], primary auto-picked          ← already-supported model
```

**Cost per product (3 kept photos):** ₹0 default path · ₹6–48 worst case if every photo needs the paid fallback (should be rare). Your existing plans (₹999/₹2,499/₹4,999) absorb ₹0 comfortably; the metered exception path uses the same addon top-up rails as AI tagging.

---

## 6. Cost math against your existing plans (₹999 / ₹2,499 / ₹4,999 per month)

| Path | Per image | Per product (3 kept) | 200 products/month |
|---|---|---|---|
| Default (rembg + SAM2 + LaMa, self-hosted) | ₹0 | ₹0 | ₹0 |
| Paid fallback on every photo (never should happen) | ₹1.7–16 | ₹5–48 | ₹1,000–9,600 → too much for flat plans, fine metered as addon |
| On-model premium (Kolors, optional) | ₹5.8 | — | ₹1,160/month as a premium listing upsell, not plan cost |

Rule: **default ₹0, exception path metered** — the same answer F-023 already implemented for AI tagging. Never bake per-photo AI cost into flat plan pricing.

---

## 7. What resources do we need (inventory, not a build plan)

**Already have, reusable as-is:**
- `scripts/batch-clean-photos.py` — bg removal, composite, shine, blur, crop, ghost-mannequin hollow fill (verified again this session)
- Python + rembg + LaMa in the production Docker image (needs a Railway rebuild to go live)
- Admin photo-cleanup page as a working reference UI + API route + R2 upload plumbing
- F-023 AI provider registry + credit/quota metering (`checkQuota` / `reserveAiCredits` / addon top-up) — the exact rails for billing any paid step
- `Product.photos[]` multi-photo model, `compressImageForUpload` (≤80KB client compression, built 2026-08-06), `expo-camera` (already a dep — used by the F-025 barcode scanner)
- The Hetzner CX43 box (if you ever want the self-hosted LaMa/SAM2 off the API container)

**Net-new if we build this (small, no new vendors):**
1. Retailer-facing capture screen in the mobile product-add flow: live garment guide overlay + on-device blur/exposure check + "pick ≥3" + crop / remove-BG / backdrop options (mirror of the admin page, but mobile + quota-gated)
2. SAM2-based hanger/mannequin separation + LaMa masked inpaint (the §2.3 gap) — evaluate on a real batch of your photos first
3. API wiring: retailer product-add calls the cleanup job (reuse the admin route's `runPython` machinery, add quota gating + audit logging)
4. Optional: one Tier-2 API key (Photoroom or Claid) wired behind the AI-credit meter for the flagged exception path

**Explicitly not needed:** any GPU, any new self-hosted diffusion infra, any multi-image fusion library, any lifestyle-scene model.

**About "no dev skills installed" — tooling answer:** nothing extra is required to *build* this; the project's existing stack (React Native/Expo + Fastify API + Python script) covers it. For *design quality* of the new capture screen, the project's `impeccable` design-review skill and the mobile design tokens (`apps/mobile/tailwind.config.js`, `COLORS` module) are the right tools, and the existing screens (`product/add.tsx`, `product/bulk.tsx`) are the patterns to copy. No new library is needed for the UI; SAM2 is the only new model dependency.

---

## 8. Capture-flow UX — the cheapest lever in the whole pipeline

A better raw photo needs less AI cleanup, at zero cost. What's wrong with your 8 samples (garment too small in frame, watermark included, angled top-down for folded pieces) is fixable at capture time:

1. **Live camera overlay** — a garment-shaped guide frame (like a passport-photo or document-scanner guide box) nudging staff to fill more of the frame and shoot straight-on. Borrow the *pattern* from document-scanner SDKs (`VNDocumentCameraViewController`-style live guide + reject-and-reprompt), not the library — garments aren't rectangular so edge-detection doesn't transfer directly; it's a thin custom layer.
2. **On-device quality check before accepting** — blur via Laplacian variance (a few lines, no ML model) + basic exposure-histogram check; reject-and-reprompt. Note: Google ML Kit (free, on-device, natural fit for React Native) has object/pose detection but **no built-in blur detector** — that piece is a small custom implementation layered on top, same effort class as the existing `compressImageForUpload` step.
3. **Pick ≥3 keepers** — your described flow, zero AI cost.
4. **Per-photo options** — crop / remove-BG + backdrop / shine (all already in the script).

Plus two one-line staff instructions that cost nothing: **shoot with the hook/hanger slightly out of the garment's silhouette**, and **remove the stapled brand tags before shooting**.

---

## 9. Open questions — answered with recommended decisions (recorded 2026-08-07)

Per your request these were answered by the AI with recommendations. **Every answer is a default you can override — say the word and the plan changes.**

1. **Hanger/mannequin removal — ANSWER: build SAM2 AND ship the one-line staff instruction (both, not either/or).** The instruction ("shoot with the hook/hanger slightly out of the garment's silhouette; remove stapled tags before shooting") is free and shrinks the hard-case set going forward. But SAM2 is needed regardless: all 8 of your existing sample photos already have hardware touching the garment, so an instruction alone can't save them. SAM2 + LaMa masked inpaint is a ~1-week build, ₹0/image, CPU-feasible on the existing box. **Implication:** this becomes build item #1.
2. **Backdrop — ANSWER: retailer-choosable from the existing Background Images library, defaulting to one brand backdrop.** The library already exists (admin-managed, `is_active` flag) and the composite code path is identical for a fixed color or a library image, so offering choice costs nothing extra. The brand default keeps the catalog consistent when a retailer doesn't pick. **Implication:** reuse the existing background-images admin UI as-is.
3. **The 4 sample outputs — ANSWER: confirmed mood-board only (art direction, not a literal spec).** They set the style — clean, garment-forward, soft studio light — but the pipeline targets "clean catalog image," not "recreate the staged scene." The prop/lifestyle look is a separate opt-in **"premium listing"** feature (Photoroom AI models / Kolors at ~₹5.8–6.2/image), explicitly out of the default product-add flow.
4. **Where the feature lives — ANSWER: mobile retailer app product-add flow only.** There is no retailer web app today (the web PWA is customer-facing); a desktop fallback would be a brand-new surface with zero existing users. Ship mobile-first, exactly matching the flow you described. **Implication:** scope = one new capture screen + API wiring + quota gating.
5. **Paid fallback key — ANSWER: yes, trial before wiring.** Both vendors have free tiers (Photoroom 1,000 trial calls; Claid 50 free credits). Trial both against the real photos in `scripts/demo/2026-08-07-status/input/` — especially the embroidered teal/maroon pieces — and pick on edge fidelity. The trial also settles Claid's real per-image price (₹3–5 vs the earlier doc's ₹10). **Implication:** one small A/B spike before any paid key is committed; until then the ₹0 Tier-1 path covers everything.

**Result:** with these answers the §5.6 architecture is confirmed. Build order: (1) SAM2+LaMa hardware removal, (2) capture screen with guide + blur check + pick-3, (3) API wiring + F-023 credit metering, (4) optional Photoroom/Claid A/B trial for the exception path.

---

## 10. Sources & references

**This project (read these too):**
- `docs/photo-feature/ghost-mannequin-research.md` — Snappyit dead-integration proof + IOPaint/LaMa tier analysis (2026-08-06)
- `docs/photo-feature/multi-photo-catalog-pipeline-2026-08-07.md` — prior same-day research; reviewed and merged into this report (see §0)
- `scripts/batch-clean-photos.py` — the existing engine (verified again this session)
- Demo outputs: `scripts/demo/2026-08-07-status/` (input / out-composite / out-ghost)

**Background-removal / enhancement APIs:**
- Photoroom API pricing: https://www.photoroom.com/api/pricing · ghost mannequin tool: https://www.photoroom.com/tools/ghost-mannequin
- Claid.ai pricing + fashion API: https://claid.ai/api-pricing · https://claid.ai/fashion
- Pixelcut API: https://developer.pixelcut.ai · remove.bg: https://www.remove.bg/pricing

**Ghost mannequin automation:**
- Kaptured.AI ghost-mannequin tool guide: https://www.kaptured.ai/best/ghost-mannequin-tools/
- IOPaint (LaMa/PowerPaint, self-hosted): https://github.com/Sanster/IOPaint
- SAM2 (promptable segmentation): https://github.com/facebookresearch/sam2 · https://ai.meta.com/sam2/

**On-model / virtual try-on:**
- Kolors Virtual Try-On on fal.ai ($0.07/gen): https://fal.ai/models/fal-ai/kling/v1-5/kolors-virtual-try-on
- Fashn.ai (VITON comparison + API): https://fashn.ai · https://fashn.ai/blog/comparing-the-top-4-open-source-virtual-try-on-viton-models
- Photoroom AI fashion models: https://help.photoroom.com/en/articles/12891197-show-clothing-on-ai-fashion-models-web-app
- ZMO.ai: https://www.zmo.ai

**Generative masked-inpaint options (from the earlier doc):**
- Gemini API pricing (Flash Image): https://ai.google.dev/gemini-api/docs/pricing · OpenAI image generation API: https://openai.com/index/image-generation-api/ · gpt-image-1 pricing breakdown: https://gate.ai/blog/gpt-image-1-openai-specs-pricing-api-use-cases
- Photoroom vs Gemini comparison: https://www.photoroom.com/blog/photoroom-vs-gemini

**General:**
- Amazon product photography guide: https://www.junglescout.com/resources/articles/amazon-product-photography/
- E-commerce product photography guide (framing/lighting): https://www.silkwoodstudio.co.uk/2026/05/05/the-complete-guide-to-ecommerce-product-photography-amazon-shopify-more/
- Exposure fusion (why multi-image fusion needs aligned shots): https://web.stanford.edu/class/cs231m/project-1/exposure-fusion.pdf
- Google ML Kit object detection (capture-flow note): https://developers.google.com/ml-kit/vision/object-detection/android
