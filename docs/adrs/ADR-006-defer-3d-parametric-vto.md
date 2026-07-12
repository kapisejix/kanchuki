# ADR-006: Defer 3D Parametric (SMPL/STAR) Measurement-Driven VTO

**Status:** Original decision (SMPL/STAR, 3D pipeline) reaffirmed, unchanged.
Revisited 2026-07-12 for a related but different question — swapping CatVTON
for a 2D dual-UNet model (IDM-VTON/OOTDiffusion). See **Revisit** section
below for that decision, plus a licensing finding that affects the
**currently deployed, revenue-facing** CatVTON engine, not just the
hypothetical upgrade. **Resolved 2026-07-13: commercial license for CatVTON
obtained from the author (option 1) — no engine swap needed, NC-exposure
closed.**
**Date:** 2026-07-11 (original), 2026-07-12 (revisit), 2026-07-13 (licensing resolved)
**Context:** Phase 1 (Virtual Try-On), evaluated after early CatVTON quality complaints ("not even 1% close" on product+customer image match)

## Decision

Keep CatVTON (2D, photo-conditioned) as the sole try-on engine for MVP/Phase 1. Do **not** build a measurement-driven 3D body-shape pipeline (SMPL/STAR parametric body model + pose-conditioned diffusion, e.g. IDM-VTON/OOTDiffusion) at this stage.

## Why

**Cost:** New pipeline needs 16-24GB VRAM (vs CatVTON's 8GB) and ~60-90s/job (vs ~35-45s) — RunPod serverless cost estimate ~$0.03-0.08/try-on vs CatVTON's $0.005, a 6-15x jump. At 10k try-ons/month: ~₹25,000-67,000 vs ~₹4,000 today. Pushes near/over the ₹5-15/image AI cost budget in `CLAUDE.md`.

**Accuracy:** Published benchmarks (VITON-HD/DressCode) show only ~10-20% photorealism gain (FID/LPIPS/SSIM) for the 3D-conditioned approach over CatVTON — and **neither** engine's benchmark covers Indian ethnic wear (saree drape, dupatta, unstitched suit layering). The domain gap (Western fitted-garment training data) dominates output quality far more than architecture choice. The reported "not even 1% close" complaint traces to input quality (uncleaned background, wrong garment category, multi-piece sets) — not an engine ceiling — see `docs/PRO-REQUIREMENTS.md` F-102 product-photo requirements.

**Licensing:** SMPL/SMPL-X model weights are free for research; commercial use requires a paid annual license from Meshcapade. Not a blocker in itself (STAR model is a free-for-commercial alternative), but adds friction on top of the cost/accuracy case above.

**What 3D actually buys:** Body-shape *correctness* (output proportions match the customer's real measurements) — a different axis from garment-render realism. No established benchmark exists for it; SMPL pose-fit tools (4D-Humans/ROMP) report ~40-80mm joint error, decent but not exact.

## Consequences

- Height/weight/body measurements (F-102b) are used for **size recommendation** only (F-102c: simple size-chart lookup, zero GPU cost) — not for scaling the CatVTON visual render.
- Revisit this ADR post-MVP if: (a) margin allows ₹2.5-6.5/try-on economics, and (b) demand data shows customers specifically want body-shape-accurate previews over garment-style previews.
- If revisited: full Python/open-source stack is buildable (4D-Humans/ROMP/PIXIE for pose+shape, STAR to avoid SMPL license fee, OOTDiffusion/IDM-VTON for render) — no forced third-party paid API.

---

## Revisit — 2026-07-12: 2D dual-UNet upgrade (IDM-VTON / OOTDiffusion), and a licensing finding on the current engine

**Trigger:** user asked how Google Shopping's in-listing "Try it on" feature
works, then asked to revisit this ADR for IDM-VTON/OOTDiffusion, with a
"build our own Google-quality model" angle. Full web research below.

### TL;DR

1. **Urgent, separate from the upgrade question: CatVTON — the engine already
   live in production today — is licensed CC BY-NC-SA 4.0 (NonCommercial).
   Kanchuki is a paid SaaS. This is a real legal exposure that exists right
   now, independent of whether we ever touch IDM-VTON.** Not something to
   silently work around — flagged for a user decision, see "Licensing
   options" below.
2. IDM-VTON and OOTDiffusion do **not** fix that problem if swapped in — they
   carry the *same* NC restriction (arguably stricter: IDM-VTON's checkpoint
   license is CC BY-NC-SA-ND, No-Derivatives, meaning you technically can't
   even fine-tune-and-redistribute it). Swapping engines changes texture/
   color fidelity, not legal exposure.
3. GPU cost is **not** the blocker the original ADR assumed for the 3D
   pipeline — recalculated for RunPod's actual L4 pricing, both CatVTON today
   and an IDM-VTON-class swap sit comfortably inside the ₹5-15/image budget
   in `CLAUDE.md`. Licensing, not cost, is now the gating issue.
4. "Build the same as Google" (a from-scratch TryOnDiffusion clone) is a
   multi-month, likely 6-figure-USD-compute research project, not a Phase 1
   task. A scoped, realistic version of "build like Google" exists — see
   below — but it requires owning the training data outright, which fine-
   tuning an existing NC checkpoint does **not** give you.

### How Google's "Try it on" actually works (answering the original question)

Two separate things carry the Google name here and are easy to conflate:

- **Google Shopping's in-listing Try It On** (the feature triggered from a
  product search result) is built on **TryOnDiffusion** ("A Tale of Two
  UNets", Google Research, CVPR 2023). Architecture: two parallel UNets —
  one processes the person photo, one processes the garment photo — with
  cross-attention layers between them so garment texture warps onto the
  target body *inside* the diffusion denoising process, instead of a
  separate explicit geometric-warp step feeding into a single inpainting
  UNet (the older approach, and the approach CatVTON/IDM-VTON/OOTDiffusion
  all still use in different forms). It runs server-side on Google's
  infrastructure, against Google's own indexed product photography via the
  Shopping Graph — not a general "any photo" system, and not something
  Google ships as a downloadable model or public API.
- **Doppl** (Google Labs consumer app, launched 2025) is a *different*
  product: a standalone try-on app using Gemini 2.5 Flash Image ("Nano
  Banana") to generate a full-body avatar from a selfie, doing the garment
  compositing computation on-device rather than in the cloud. Per Google's
  own support page, **Doppl is being shut down on 2026-04-30** — so it's not
  a durable reference architecture to copy. It also isn't the same model
  family as Shopping's Try It On.

Neither is available as a licensable API or open checkpoint. "How do we get
the same result" means "build a comparable dual-UNet architecture ourselves"
— see the build-from-scratch section below for what that actually costs.

### Licensing landscape (the part that matters most)

Checked license + training-dataset provenance for every mainstream open VTO
model, because — per FASHN's own developer guide on this exact topic — the
code license and the *weights'* effective license are two different things:
weights trained on a NonCommercial-licensed dataset stay NC-restricted no
matter what license the training *code* ships under.

| Model | Code license | Trained/eval on | Effective commercial status |
|---|---|---|---|
| **CatVTON** (currently deployed) | CC BY-NC-SA 4.0 | not disclosed in repo | **NC — cannot legally power paid usage today** |
| IDM-VTON | CC BY-NC-SA-**ND** 4.0 (No-Derivatives) | VITON-HD, DressCode | NC, and technically blocks redistributing a fine-tune |
| OOTDiffusion | CC BY-NC(-like), non-commercial per repo | VITON-HD (half-body model), DressCode (full-body model) | NC |
| DCI-VTON | **MIT** (code) | VITON-HD | **Code is permissive, but weights are dataset-tainted** — VITON-HD's own license is CC BY-NC 4.0, so a model whose weights derive from training on it inherits that NC restriction regardless of the MIT wrapper. Same trap the FASHN guide calls out by name. |
| ViViD (video try-on) | Apache 2.0 | own dataset (per authors) | Cleanest license found, but it's a *video* try-on model, different use case than product-photo try-on |

**Bottom line: there is currently no widely-used, high-quality open VTO
checkpoint that is safe to use commercially as-is.** DCI-VTON's MIT *code*
license is the closest thing to good news, and it isn't actually good news
once the VITON-HD dataset lineage is accounted for.

**Licensing options, ranked by effort:**

1. **✅ RESOLVED 2026-07-13 — Email Zheng Chong (CatVTON's author) and ask
   about a paid commercial license.** User confirmed approval obtained.
   No engine swap or NC-exposure mitigation needed; the currently-deployed
   CatVTON weights are now commercially licensed for Kanchuki's use.
2. **Route paid/production try-ons through a commercially-licensed API**
   (FASHN: $0.075/try-on at low volume, drops under $0.04/try-on at volume,
   explicitly commercial-use-licensed) **and keep self-hosted CatVTON only
   for internal dev/testing**, where non-commercial use is actually
   license-compliant. This was rejected earlier in the project purely on
   cost grounds (`docs/final-research.md` era decision) — worth revisiting
   given the alternative is an actual license violation, not just a cost
   delta. At Phase 0 pilot volume (≤10 retailers), the cost gap vs. self-
   hosted CatVTON is small in absolute ₹ terms.
3. **Accept the risk short-term, deliberately, with the user's sign-off** —
   some startups do run on NC-licensed weights at low scale and fix it
   before it matters at exposure-scale. This is a legitimate choice, but it
   has to be a chosen risk, not a default nobody decided.
4. **Train your own weights from scratch on your own licensed data.** The
   only option that actually removes the taint at the root — see below for
   what this costs.

### Cost, recalculated on RunPod's real L4 pricing (the original ADR overstated this)

RunPod serverless L4 (24GB), per official pricing page: **$0.69/hr =
$0.0001917/sec**, flex-worker rate.

| Engine | Est. inference time | Est. cost/try-on | vs. ₹5-15 (~$0.06-0.18) budget |
|---|---|---|---|
| CatVTON, single-piece (current) | ~35-45s (measured in this project's logs) | ~$0.0067-0.0086 (~₹0.56-0.71) | Comfortably under |
| CatVTON, two-piece chained (current) | ~53-180s (measured 53s once, code comment estimates up to 180s) | ~$0.010-0.035 (~₹0.83-2.9) | Comfortably under |
| IDM-VTON on L4 | **Unconfirmed — estimate only.** Repo reports 19s on an A100-80GB, a far more powerful card than L4. No published L4 benchmark found. Rough estimate 60-120s given the throughput gap. | ~$0.012-0.023 (~₹0.95-1.9), *estimated, not benchmarked* | Still comfortably under, on the estimate |

The original ADR's "$0.03-0.08/try-on, 6-15x jump, pushes over budget" figures
appear to have assumed a pricier GPU tier than L4 (A10G/A100-class) for the
3D pipeline — on L4 specifically, that gap doesn't materialize the same way.
**Correction: cost is not the reason to avoid a 2D dual-UNet swap. Licensing
is.** If licensing gets solved via option 1 or 4 above, cost is not a
blocker for adopting IDM-VTON-class quality.

### Quality: does it actually fix the reported problem?

Relevant to the "not even 1% close" complaint (`docs/PROGRESS.md`,
2026-07-12 entries) once the real root cause — unhandled multi-piece
garments, now fixed — is set aside: for **single-piece, texture-heavy
garments** (the print/color-fidelity axis, not the piece-count axis),
published comparisons consistently report:

- **CatVTON**: better at preserving overall body/garment *structure* and
  shape, single compact network, <8GB VRAM, ~35s at 1024×768. This is the
  project's current engine.
- **IDM-VTON**: better at *texture and color fidelity* — prints, logos, fine
  pattern detail survive better, at the cost of ~2x the VRAM floor (16GB+)
  and heavier compute (dual SDXL-based UNets vs. CatVTON's single compact
  net).
- **OOTDiffusion**: similar dual-UNet family to IDM-VTON; ships a "half-body"
  model (VITON-HD-trained, upper garments) and a separate "full-body" model
  (DressCode-trained, adds lower-body/dresses) rather than one model
  covering everything.
- Neither IDM-VTON nor OOTDiffusion's published benchmarks (VITON-HD/
  DressCode) cover Indian ethnic wear, saree drape, or multi-piece
  kameez+salwar+dupatta sets — the same domain-gap caveat the original ADR
  already flagged still applies unchanged.

For a fashion-retail product where sarees, Banarasi prints, and zari/gota
work are exactly the garments where pattern fidelity matters most, IDM-
VTON's texture advantage is directionally the right lever — **if** the
licensing question gets resolved first.

### "Build our own Google-quality model" — what that actually costs

Two different asks hide under this phrase; worth separating them:

**A. Fully replicate TryOnDiffusion from scratch (dual-UNet, trained from
zero on a large paired dataset).** This is a research-lab-scale project:

- **Data**: needs *paired* images — the same garment on multiple people/
  poses — at real scale. Google built this from their Shopping Graph's
  existing catalog photography plus internal data pipelines; there is no
  public dataset of this shape at the needed scale. Collecting or licensing
  an equivalent (matching-garment photography across many models) is itself
  a multi-month vendor/photography effort, not a scraping job.
- **Compute**: training two large UNets (SDXL-class parameter counts) from
  random init is comparable in scale to training a full text-to-image
  diffusion model — realistically tens of thousands to low hundreds of
  thousands of USD in GPU-hours (rough order-of-magnitude estimate; neither
  Google's paper nor any public source states an exact training compute
  budget, so treat this as a ballpark, not a quote).
- **Team**: an ML research team, not a Phase 1 engineering sprint.
- **Verdict: out of scope for this project at any stage currently visible on
  the roadmap.** Not recommending this.

**B. The realistic version — fine-tune an existing open dual-UNet
architecture on Kanchuki's own domain data (Indian ethnic wear).** This is
what "build like Google, but sized for us" actually looks like, and the
project already has half the infrastructure for it
(`scripts/training/train_lora.py`, mentioned in `docs/PROGRESS.md`
2026-07-08, built for CatVTON LoRA fine-tuning). Two important caveats
specific to this option:

1. **Fine-tuning does not launder away the base checkpoint's license.** A
   LoRA/fine-tune of IDM-VTON's released weights is a *derivative work* of a
   CC BY-NC-SA-**ND** checkpoint — the ND clause is explicit that
   derivatives aren't permitted to be shared/used the way a fine-tune-and-
   deploy workflow requires. Fine-tuning CatVTON's NC weights has the same
   problem via the SA (ShareAlike) clause. **To actually own clean
   commercial rights to the result, the dual-UNet architecture would need
   to start from a commercially-licensed base checkpoint** (e.g. plain SD/
   SDXL base weights, which ship under OpenRAIL++ and do permit commercial
   use) and be trained using **only Kanchuki's own retailer-contributed
   photos** (with retailer ToS granting Kanchuki a commercial license to
   that imagery) — not VITON-HD/DressCode. That's closer to "train the
   IDM-VTON *architecture* ourselves" than "fine-tune IDM-VTON's weights."
2. Retailer product photography is realistically single-garment-on-
   mannequin or flat-lay, not the same-garment-on-multiple-people paired
   data a dual-UNet garment-warping model needs to learn well. Some of this
   gap could be narrowed with synthetic pose augmentation, but that's an
   open research question for this specific use case, not a solved recipe.

This path is real and buildable, but it's a Phase 2+ undertaking gated on
(a) enough retailer photo volume to be worth training on, and (b) the
licensing question above being resolved either way first — no point
building a properly-licensed pipeline while the currently-deployed engine
still carries an open NC exposure.

### Decision

- **Do not swap CatVTON for IDM-VTON or OOTDiffusion right now.** It would
  not fix the actual blocking issue (licensing), would add VRAM/latency
  overhead, and the domain-gap caveat from the original ADR still applies to
  both candidates equally.
- **Do not attempt a from-scratch TryOnDiffusion clone.** Confirmed out of
  scope by cost and team-size, not just deferred.
- **New action item, higher priority than either of the above:** resolve
  CatVTON's NC-license exposure on the live product. Recommended order: try
  option 1 (email the author, ask about a commercial license) first since
  it's free to attempt; fall back to option 2 (FASHN API for paid/production
  traffic) if no commercial license is obtainable. This is a business/legal
  decision for the user, not something to auto-resolve in code.
- **If/when the licensing question is resolved**, the technical upgrade
  path worth pursuing is **B** above (fine-tune a dual-UNet architecture on
  Kanchuki's own retailer photos, starting from a commercially-licensed base
  checkpoint) — not adopting IDM-VTON's own released weights as-is, and not
  a from-scratch TryOnDiffusion clone.

### Sources

- [IDM-VTON GitHub](https://github.com/yisol/IDM-VTON) — [commercial license issue #160](https://github.com/yisol/IDM-VTON/issues/160)
- [OOTDiffusion GitHub](https://github.com/levihsu/OOTDiffusion) — [LICENSE](https://github.com/levihsu/OOTDiffusion/blob/main/LICENSE)
- [CatVTON GitHub](https://github.com/Zheng-Chong/CatVTON) — [zhengchong/CatVTON on Hugging Face](https://huggingface.co/zhengchong/CatVTON)
- [DCI-VTON GitHub](https://github.com/bcmi/DCI-VTON-Virtual-Try-On) — [LICENSE](https://github.com/bcmi/DCI-VTON-Virtual-Try-On/blob/main/LICENSE)
- [VITON-HD GitHub](https://github.com/shadow2496/VITON-HD) — [LICENSE](https://github.com/shadow2496/VITON-HD/blob/main/LICENSE)
- [FASHN: "So You Want to Build a Virtual Try-On App?"](https://fashn.ai/blog/so-you-want-to-build-a-virtual-try-on-app-a-developers-guide-to-not-getting) — licensing-focused developer guide, source of the "dataset taint" point
- [FASHN: Comparing the Top 4 Open Source VITON Models](https://fashn.ai/blog/comparing-the-top-4-open-source-virtual-try-on-viton-models)
- [FASHN API pricing](https://fashn.ai/pricing) / [API pricing detail](https://help.fashn.ai/plans-and-pricing/api-pricing)
- [RunPod Serverless pricing](https://www.runpod.io/pricing)
- Google Doppl: [Google Labs blog announcement](https://blog.google/technology/google-labs/doppl/), [TechCrunch: shoppable discovery feed](https://techcrunch.com/2025/12/08/googles-ai-try-on-app-doppl-adds-a-shoppable-discovery-feed/), [Google Labs Help: Doppl shutdown](https://support.google.com/labs/answer/16537062?hl=en)
- [Zheng-Chong/Awesome-Try-On-Models](https://github.com/Zheng-Chong/Awesome-Try-On-Models) — maintained list of 2025-2026 VTO papers/repos
- Original TryOnDiffusion paper: "TryOnDiffusion: A Tale of Two UNets" (Google Research, CVPR 2023)
