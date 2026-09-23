# Multi-Photo → Professional Catalog Photo Pipeline — Research Report

**Date:** 2026-08-07
**Status:** Research only. Nothing in this document is built. No code was written this session.
**Requested by:** user, via `/ponytail` — "review requirements, research solutions, no development."
**Related existing docs:** `docs/photo-feature/ghost-mannequin-research.md` (2026-08-06, prior session — read and incorporated, not duplicated), `docs/DESIGN.md`, `CLAUDE.md` → "Ghost-mannequin" and "Admin Photo Cleanup Test Page" entries.

---

## 1. Status of the existing ghost-mannequin / AI photo-edit feature (verified via git, not memory)

Both `docs/PROGRESS.md`/`CLAUDE.md` and the actual commit history were checked directly (`git log`) because this project has a documented pattern of docs going stale mid-feature (see memory: "doc staleness pattern"). Here is what is **actually true today**, in build order:

| Date | Commit | What it did |
|---|---|---|
| 2026-08-06 | `3a3f863` | Standalone `scripts/batch-clean-photos.py` (rembg bg-removal + composite-on-color/backdrop, or `--blur` portrait mode, `--shine` contrast pop) wired into an **admin-only test page** (`/admin/photo-cleanup-test`) — upload product photo + optional background, run, see before/after. Session-only, not part of the retailer product flow. |
| 2026-08-06 | `bf42d28` | **Python + rembg + simple-lama-inpainting installed directly into the production API Docker image** (`apps/api/Dockerfile`). This is newer than the "Known limitation: Railway has no Python" note still sitting in `CLAUDE.md` — that note is now **stale**. The Dockerfile genuinely bundles the interpreter and both models' weights (`u2net.onnx`, `big-lama.pt`) baked in at build time. |
| 2026-08-06 | `0c66a7f` | `--ghost-mannequin` mode: detects backdrop-colored hollow regions (neckline/sleeve holes showing the studio wall through them) by sampling the 4 corners of the shot and diffing pixel color, then fills only those holes with local LaMa inpainting. Confirmed on one real photo end-to-end. **Confirmed limitation, tested, not fixed:** it does not remove a mannequin neck-stub, hook, or hanger of a *different color* than the backdrop — that's erasing a solid foreground object, a different problem from filling a same-color gap. Your 4 first-category sample photos below are exactly this case (grey mannequin bust + metal hook + wooden hanger, all differently colored from the wall) — ghost-mannequin mode as it exists today would leave all three artifacts in place. |
| 2026-08-06 | `23efa22` | Fixed a dev-environment bug (wrong Python binary silently picked, unrelated to production). |
| 2026-08-07 | `9f843f3` | Added an optional crop-rect param so a second in-frame garment/prop touching the subject can be manually trimmed out before segmentation, since rembg segments by saliency, not identity, and can't separate two touching objects on its own. |

**Net status:** the underlying tech (bg removal, backdrop swap, hollow-gap fill) is real, committed, and Dockerfile-wired for production — but it is an **admin test tool only**. It is not exposed to retailers, not wired into the product-add camera flow, has no per-retailer quota/billing, and doesn't attempt what you're now asking for (turning *this specific kind of messy raw phone photo* — mannequin, hook, hanger, cracked wall — into a boutique-quality shot). Whether the current Railway deploy has actually picked up the Dockerfile change (a rebuild is required, not just a git push) was not re-verified this session — check the Railway API service's latest build log before assuming it's live.

---

## 2. What your team is actually clicking vs. what you want (reviewed the 4+4 sample photos + 4 reference photos directly)

**Category 1** (`WhatsApp Image ...4.33.1[5-8] PM*.jpeg`) — hung garments:
- Grey plastic mannequin bust on a stand, garment on a wire/plastic hanger hooked to a wall bracket.
- Background: visibly dirty/cracked plastered wall, with old nail holes, chalk numbers, and staining.
- Framing: consistent (centered, vertical), but a lot of dead wall space top and bottom — the garment fills maybe 45-55% of frame height, well under Amazon/Shopify's ~85%-fill guidance.
- Lighting: flat daylight, acceptable, no harsh shadow, no motion blur — this part is actually fine.
- Timestamp/camera watermark burned into the photo (Redmi Note 8 Pro, "AI QUAD CAMERA", date-time) — will need cropping, not just background swap.

**Category 2** (`WhatsApp Image ...5.39.3[3-7] PM.jpeg`) — folded/unstitched suit pieces:
- Folded flat on a bed, on a wrinkled white bedsheet (fabric folds and shadows in the sheet itself, distracting).
- Brand/size tags still stapled on, sometimes covering the embroidery detail you'd want visible.
- Shot from directly above but slightly angled, not perfectly top-down — mild keystoning.
- Also has the camera timestamp watermark.

**The 4 "desired output" reference photos you gave** are not photos of *your* products — they're stock/marketing images from other apparel brands (wooden hangers against a softly lit wall with a plant and ceramic vase, a moody backdrop shot, a styled linen ad, a mannequin bust against a distressed wallpaper backdrop with a horse-head sculpture prop). They're useful as a **mood board for background style and framing**, not as a literal target ("combine 3 photos into this exact scene") — a fully staged lifestyle shoot with props/plants/furniture is a different (much more expensive, much less controllable) generation task than "clean this garment photo up." I'm treating them as art direction, not as a literal spec, and say so explicitly here rather than silently reinterpreting your ask.

**What this means for the pipeline, restated as testable requirements:**
1. Remove/replace the busy real-world backdrop (wall, bedsheet) with a clean flat color or a simple, repeatable studio-style backdrop — not a fully staged lifestyle scene with props, which is a different and much harder generation task.
2. Crop out camera watermark, mannequin stand hardware, hook, hanger, tags-stapled-on — these are *foreground object removal*, not backdrop-gap filling. This is the gap the current `--ghost-mannequin` mode explicitly doesn't cover yet (see §1).
3. Straighten framing (garment fills more of frame, watermark/dead space cropped).
4. Garment's actual print/color/embroidery must not be altered by the AI step — this is a hard fidelity requirement given the source photos are of heavily embroidered/printed ethnic wear, and generative models are known to drift on fine pattern detail (see §4).
5. Pick 3+ of the 3-5 captured photos (front, maybe back/detail) — treated as **separate cleaned catalog images**, not merged into one Frankenstein photo (see §3 for why "combine into one" isn't the right mental model).

---

## 3. Is "combine 3+ photos into one image" the right idea? (Straight answer, not a hedge)

No — not as literal pixel fusion, and it's worth being direct about this before it gets built wrong.

Techniques like exposure fusion / focus stacking (the classical "combine multiple shots into one better shot" methods, e.g. Mertens et al.) require the shots to already be near-pixel-aligned — a tripod-mounted bracketed exposure sequence, not 3-5 handheld phone photos taken from different angles and distances. No commercial product-photo tool fuses multiple angle shots of a static garment into a single composite; even Amazon/Shopify's own multi-photo guidance treats each angle as a **separate catalog image** (front, back, detail, worn), not one merged photo.

What "the team clicks 3-5, picks at least 3" should actually produce, and what your existing product data model already supports without a schema change (`Product.photos[]`, already multi-photo):
- **Frame/angle selection**, not fusion: retailer picks which 3+ of the 3-5 shots are keepers (front, back, close-up of embroidery) — a **person decision**, cheap, zero AI cost.
- Each kept photo gets the *same* cleanup treatment independently (crop, remove background clutter, straighten, backdrop swap) — producing 3+ clean catalog images per product, exactly matching how your product photo carousel already works (this is also the fix for the mobile photo-slider bug you shipped 2026-08-03 — multiple clean photos per product is already a first-class concept in this codebase).
- One of the 3+ (sharpest, best-lit, best-centered) can be auto-flagged as the **primary/thumbnail** photo — this part *is* a real, cheap, well-understood technique: blur-variance (Laplacian) + exposure histogram scoring, no ML model needed, can run instantly on-device.

If you want a literal "3 photos → 1 hero image" later (e.g., front view's body + a close crop of the embroidery inset in a corner), that's a manual/templated collage, not an AI fusion problem — worth flagging as a distinct, much smaller feature if you actually want it, separate from the cleanup pipeline below.

---

## 4. Solution architecture — what to actually build, in cost order

### 4.1 The three real jobs, and what solves each one cheaply

| Job | Best fit | Why |
|---|---|---|
| **A. Foreground object removal** (mannequin stand, hook, hanger, staple tags) | Manual crop-to-exclude (already shipped 2026-08-07, `9f843f3`) for the simple case; a **prompted/masked inpaint** (see 4.2) for the case where the object overlaps the garment and can't just be cropped out of frame | rembg/u2net segments by saliency, not identity — it cannot tell "mannequin bust" from "garment" when they're touching. No cheap classical-CV fix exists for this; it needs either a smarter mask (SAM2, see 4.3) or a generative inpaint prompted specifically to remove that object. |
| **B. Backdrop replacement** (dirty wall / bedsheet → clean flat color or simple studio backdrop) | **Existing `batch-clean-photos.py` default mode is already correct for this** — rembg cutout + composite onto a flat color or backdrop photo. This is the cheapest and most reliable step in the whole pipeline; it's solved, just not wired into the retailer-facing flow yet. | Background swap via segmentation (not generative repaint) has zero risk of altering the garment, because the garment pixels are copied through untouched — only the background pixels change. This is the single most important fidelity-safety property for a fashion catalog: **prefer segmentation+composite over prompt-based generative background whenever possible**, and only reach for a generative model (4.2) for the harder foreground-removal case in row A. |
| **C. Wrinkle/framing cleanup, watermark crop, straightening** | Deterministic image ops (crop, perspective correction, contrast/shine — `--shine` flag already exists) + optional light generative de-wrinkle only on request | Wrinkle removal via generative AI risks smoothing away real embroidery texture — treat as optional/manual, not default-on. |

### 4.2 When you do need a generative model (row A's overlap case, and any "make it look boutique" repaint)

Researched the two cheapest capable APIs plus the purpose-built product-photo tools layered on top of them:

| Option | Cost/image (₹, @₹83/$1) | Garment-fidelity risk | Fit |
|---|---|---|---|
| **Gemini 2.5 Flash Image ("nano banana")** | ~₹3.2 | **Real risk** — prompt-only edit, no mask input, can "re-imagine" adjacent regions; explicitly not trained for e-commerce and known to drift on fine pattern/text. Retires Oct 2026, successor exists, re-check pricing before committing. | Cheapest, but needs a locked-down prompt + a fallback comparison check before use; not for embroidery-heavy garments without a mask. |
| **OpenAI gpt-image-1** | ₹1.7 (low) – ₹16 (high) | **Lower risk** — supports true **mask-based inpainting** (edit only the masked pixels, rest is untouched byte-for-byte). This is the right primitive for "remove only the mannequin-stand pixels, leave the garment alone." Deprecates Oct 2026, successor live, re-check before committing. | Best fit of the two for foreground-object removal specifically, because of the mask. |
| **Claid.ai fashion API** | ~₹10 | Markets fidelity explicitly ("every texture, label, fine detail preserved"), purpose-built for fashion. | Worth a trial run against a real embroidered Kanchuki sample before committing budget — no independent fidelity complaints found, but also no independent verification. |
| **Photoroom API (bg-only tier)** | ₹1.7 (basic bg removal) | Same segmentation-based safety as self-hosted rembg | Managed fallback if self-hosting rembg ever becomes a bottleneck; not needed as primary given rembg already works and is free. |

**Recommendation:** don't reach for a generative model as the default path at all. Segmentation-based backdrop swap (already built, free, zero fidelity risk) covers the *majority* of your sample photos' problem (busy wall/bedsheet). Reserve a paid, masked generative call (gpt-image-1, masked) for the **specific, flagged case** where a stand/hook/hanger overlaps the garment silhouette and can't be cropped away — this should be the expensive/optional path, not the default per-photo cost.

### 4.3 A better foreground-removal primitive than rembg alone, if row A keeps coming up

**SAM2 (Meta's Segment Anything Model 2)** — promptable segmentation ("click the mannequin, not the garment") rather than saliency-only — is the right tool if hardware/hook/stand removal turns out to be common enough to be worth automating rather than relying on the manual crop param shipped 2026-08-07. Not researched in depth this session (out of scope for "no dev" research pass); flag as a follow-up research item if row A proves to be the majority failure mode once you look at more real retailer photos, not just these 8 samples.

### 4.4 What NOT to build (explicitly ruled out)

- **True multi-image pixel fusion** — see §3. Not a real technique for this input.
- **Fully staged lifestyle scenes** (props, plants, furniture, like the 4 reference images) — a much harder and more expensive generation task than "clean this garment photo," and inconsistent with the fidelity requirement (more generative surface area = more risk to garment accuracy). If genuinely wanted later, scope it as a separate, opt-in "premium listing" feature, not the default catalog path.
- **Self-hosted diffusion for this step** — you already have direct, painful proof this doesn't work cheaply on CPU-only hardware (Fashion V-Tone: 26-32 min/image on the Hetzner CX43). Segmentation-based bg removal (rembg) is cheap on CPU because it's a small model doing one forward pass, not iterative diffusion — that's *why* it already works in your existing script. Don't repeat the V-Tone mistake by trying to self-host a diffusion-based generative repaint on the same box; use a hosted API for any step that genuinely needs generation.

---

## 5. Cost math against your existing plans

Using the pricing table in §4.2 and your existing three-tier pricing (₹999 / ₹2,499 / ₹4,999 per month):

- **Backdrop-swap step (rembg, self-hosted, already built):** effectively free per image — CPU cost is a few seconds on the existing API container, no external API call. This should be the **default, included** treatment for every product photo, no metering needed, same as today's photo-cleanup script.
- **Generative foreground-removal step (only for the flagged overlap case, gpt-image-1 masked, ~₹1.7-16/image depending on quality tier):** even at 500 SKUs/month for a Growth/Pro retailer, if this were needed on *every* photo it'd run ₹850-8,000/month — too much to bake into flat plan pricing. But per §4.2 this should be the **exception path**, triggered only when the manual-crop/backdrop-swap isn't enough — realistically a minority of shots once staff learn to shoot with less overlap. Meter it the same way F-023 (AI provider registry) already meters `AI_TAGGING_CALL` credits — reuse that exact mechanism (`checkQuota`/`reserveAiCredits`/addon top-up) rather than inventing new billing, since it already solves "AI cost must be covered by plan pricing" for a structurally identical problem.

---

## 6. Capture-flow UX — guiding the shot before AI has to fix it

Cheapest lever in the entire pipeline: a **better raw photo needs less AI cleanup, for zero extra cost.** Amazon/Shopify photography guidelines (subject fills ~85% of frame, soft diffused light, straight-on/flat-lay angle, min. 1600px) map directly onto what's wrong with your 8 samples (garment too small in frame, watermark included, angled top-down shot for the folded pieces).

Proposed capture screen, matching what you described ("camera opens, team clicks 1-5 pics, picks at least 3, then crop/bg options"):

1. **Live camera overlay** — a garment-shaped guide frame (like a passport-photo or document-scanner guide box), nudging staff to fill more of the frame and shoot straight-on. This is a **thin custom layer**, not a full document-scanner SDK port — garments aren't rectangular, so `VNDocumentCameraViewController`-style edge detection doesn't transfer directly; borrow the *pattern* (live guide + reject-and-reprompt on bad quality), not the library.
2. **On-device quality check before the photo is accepted** — blur detection via Laplacian variance (a few lines, no ML model, runs instantly) + basic exposure histogram check. Google ML Kit (free, on-device, already the natural fit for React Native) has object/pose detection but **no built-in blur detector** — that piece needs a small custom implementation layered on top, same effort class as the existing `compressImageForUpload` client-side step already shipped 2026-08-06.
3. **1-5 shots, retailer/staff picks 3+ keepers** — matches your description; each kept shot becomes its own cleaned catalog photo (§3), not a merge target.
4. **Per-photo options after selection:** crop (existing `--crop` param), remove-bg + flat color or backdrop image (existing default mode, already built), shine/contrast pop (existing `--shine` flag). All three of these already exist in `scripts/batch-clean-photos.py` — the actual gap is wiring them into the retailer-facing mobile flow instead of the admin test page, plus the capture-guide layer above (net-new).

---

## 7. Resources needed to build this (inventory, not a build plan)

- **Already have, reusable as-is:** `scripts/batch-clean-photos.py` (bg removal, composite, shine, blur portrait mode, crop, ghost-mannequin hollow-fill), the Dockerfile Python/rembg/LaMa install, the admin test page as a reference UI, F-023's AI credit/quota metering system, `Product.photos[]` multi-photo model, `compressImageForUpload` client-side compression pattern, `expo-camera` (already a mobile dependency, used for F-025 barcode scan).
- **Net-new, if this gets built:** retailer-facing capture screen with live guide overlay + on-device blur/exposure check (mobile, React Native); wiring the existing Python cleanup script into the retailer product-add flow (currently admin-only) with per-retailer quota gating; a masked-inpaint call path (gpt-image-1) reserved for the flagged foreground-overlap case, metered through the existing AI credit system; SAM2 evaluation if manual-crop proves insufficient (§4.3, flagged as a follow-up research item, not committed).
- **Not needed:** any new self-hosted diffusion infrastructure, any multi-image fusion library, any lifestyle-scene generation model.

---

## 8. Open questions for you before this becomes a build plan

- Is the generative foreground-removal step (mannequin/hook/hanger overlap) common enough across real retailer photos to justify the SAM2 + masked-inpaint work, or is "shoot with the hook/stand slightly out of the garment's silhouette + manual crop" an acceptable staff instruction that avoids needing it at all? Cheapest possible fix is a one-line addition to staff photo-taking instructions, not more AI.
- Do you want the flat backdrop to be a single fixed color (cheapest, most consistent catalog look) or retailer-choosable (matches the existing "Background Images library" already built for the admin photo-cleanup tool)?
- Confirm the reference photos were mood-board-only (background/framing style), not a literal ask for props/plants/staged scenes — see §2. If you did want the staged-scene look, that changes the cost/risk profile significantly (§4.4) and is worth a separate conversation.

---

## Sources

- [Photoroom API pricing](https://www.photoroom.com/api/pricing) · [remove.bg pricing](https://www.remove.bg/pricing) · [Claid.ai API pricing](https://claid.ai/api-pricing) · [Claid fashion API](https://claid.ai/fashion) · [PixelBin pricing](https://www.pixelbin.io/pricing)
- [Gemini API pricing (Flash Image)](https://ai.google.dev/gemini-api/docs/pricing) · [OpenAI image generation API](https://openai.com/index/image-generation-api/) · [gpt-image-1 pricing breakdown](https://gate.ai/blog/gpt-image-1-openai-specs-pricing-api-use-cases)
- [Photoroom vs Gemini comparison](https://www.photoroom.com/blog/photoroom-vs-gemini) · [Nano Banana garment-fidelity test](https://aiclothswap.com/blog/can-nano-banana-change-clothes)
- [BRIA RMBG-2.0](https://huggingface.co/briaai/RMBG-2.0) · [InSPyReNet / transparent-background](https://github.com/plemeri/transparent-background) · [rembg vs cloud API CPU benchmark discussion](https://medium.com/@ai-engine/rembg-vs-cloud-api-for-background-removal-which-one-should-you-use-234329539ec1)
- [ONNX Runtime Web + WebGPU in-browser background removal](https://img.ly/blog/browser-background-removal-using-onnx-runtime-webgpu/)
- [Exposure Fusion, Mertens et al.](https://web.stanford.edu/class/cs231m/project-1/exposure-fusion.pdf)
- [Amazon product photography guide (Jungle Scout)](https://www.junglescout.com/resources/articles/amazon-product-photography/) · [E-commerce product photography guide](https://www.silkwoodstudio.co.uk/2026/05/05/the-complete-guide-to-ecommerce-product-photography-amazon-shopify-more/)
- [Google ML Kit object detection](https://developers.google.com/ml-kit/vision/object-detection/android) · [react-native-document-scanner](https://github.com/Michaelvilleneuve/react-native-document-scanner) · [Scanbot SDK](https://scanbot.io/developer/react-native-document-scanner/)
- `docs/photo-feature/ghost-mannequin-research.md` (2026-08-06, this project, prior session)
