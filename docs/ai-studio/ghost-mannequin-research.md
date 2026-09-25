# Ghost Mannequin Feature — Current Situation & No-API Self-Hosted Options

**Date:** 2026-08-06
**Status:** Research only. No code changed as part of this document.
**Why this doc exists:** the admin photo-cleanup test page throws
`SNAPPYIT_API_KEY is not configured` the moment you tick "ghost mannequin."
You didn't ask for Snappyit, no key was ever supplied, and you want to know
why the code depends on it at all — and what a Snappyit-free, self-hosted
answer (running on the Hetzner CX43 box you already pay for) actually
looks like.

---

## 1. What is actually happening right now (verified by reading the code, not assumed)

### 1.1 The error is not a bug — it's a dead integration

`packages/ai/src/snappyit.ts` calls `https://snappyit.ai/api/v1/ghost-mannequin`.
Read the comment already sitting in that file, written by whoever built it:

> "Confirmed: snappyit.ai domain (moved from snappyit.app in 2026). The
> `/api/v1/ghost-mannequin` path is **inferred from industry patterns**;
> actual endpoint **to be confirmed during integration**."

That is an admission the endpoint was guessed, never verified against a real
API. This session's research confirms why it was never confirmed: **Snappyit
does not have a public developer API.**

- Its own pricing page (fetched directly, 2026-08-06) sells only consumer
  **credit packs** ($6.90–$48.90/mo, 100–1,150 credits) through a web
  dashboard. No mention of "API," API keys, or programmatic/batch access
  anywhere on the page.
- There is no `docs.snappyit.ai` or developer portal. Searching for one
  returns an unrelated company (`snappy.com`, business gift-card API — a
  different product that happens to share a similar name).

So the honest state of F-001e as shipped: it is wired to call an endpoint
that was never confirmed to exist, on a vendor that — as far as this
research can find — has no API to call in the first place. `SNAPPYIT_API_KEY`
was never "missing configuration" in the normal sense; there was never a key
to get, because there's no documented way to obtain one. Setting an env var
would not fix this — the URL it POSTs to is a guess.

**This is on the project, not on you.** F-001e was written into `CLAUDE.md`
months ago as "via Snappyit API (planned)" and nobody validated that claim
before code was built against it. You're not moving in circles because you
keep changing your mind — the plan itself was built on an unverified premise.

### 1.2 What's real vs. what's a stub, precisely

| Piece | File | Status |
|---|---|---|
| Background removal + backdrop swap + shadow + shine | `scripts/batch-clean-photos.py` | **Real, working, verified.** Uses `rembg` (open source, no API, no key). This is the only part of the "photo cleanup" pipeline that actually does anything today. |
| Ghost mannequin (hollow neckline/sleeve/collar effect) | `packages/ai/src/snappyit.ts`, `apps/api/src/jobs/ghost-mannequin.ts` | **Dead.** Will throw `SNAPPYIT_API_KEY is not configured` (or, if a key were somehow obtained, would then likely 404 against a guessed URL) on every single call. Not "not configured" — not buildable against this vendor at all. |
| Admin test page "Generate on model" (V-Tone) | `apps/api/src/jobs/admin-tryon.ts`, `services/fashion-vtone` | **Real, self-hosted, no API key, on your Hetzner box** — but see §2, it solves a different problem and is too slow for catalog-scale use. |

Nothing in your app today produces a real ghost-mannequin (invisible
mannequin / hollow-body) image. The checkbox exists in the admin UI; the
backend it calls cannot succeed.

---

## 2. Why V-Tone doesn't cover this either

V-Tone (Fashion V-Tone v1.5, self-hosted on your CX43 since the 2026-08-06
migration) is a **virtual try-on** engine: garment photo + **a photo of a
person/model** → the garment shown worn by that person. Ghost mannequin is
the opposite kind of shot — the garment shown as if worn by *nobody visible
at all*, floating in its own shape. V-Tone has no invisible-mannequin mode;
repurposing it would mean generating or sourcing a fake "person," running
try-on, then trying to erase the person back out — a longer, lossier
pipeline than doing the real thing directly.

Even if you ignored that mismatch, the speed already measured on your own
box rules V-Tone out for this: a real end-to-end test on 2026-08-06 timed
**32.3 minutes for one image** (30 diffusion timesteps, CPU-only, no GPU —
CX43 has none). It's also single-request-blocking — a second job has to
wait for the first to finish. For a catalog feature meant to run per-SKU
across potentially hundreds of products, 30+ minutes/image serially is not
usable. That's what you meant by "vtone (which is not usable)" — and you're
right, for this specific job.

---

## 3. Deep research: what can actually generate a ghost-mannequin look, with no third-party API, on hardware you already own

There is a real, permissively-licensed, self-hostable class of tool for
this — but it's important to be precise about what it can and can't
reproduce, so this section separates **quality tiers**, not just tool names.

### 3.1 The three tiers of "ghost mannequin," by technique

| Tier | Technique | What it needs | AI required? |
|---|---|---|---|
| **A — True ghost mannequin (studio standard)** | Photographer shoots the garment twice: once on a mannequin/dress form, once with the mannequin's neck/collar area photographed from inside/behind after slightly lifting the garment. The two shots are layered in Photoshop so the interior neckline shows real fabric, not a guess. | 2 real photos per SKU + manual/scripted compositing | **No.** This is pure image compositing — alpha masking and layering. It is what "invisible mannequin" services like the outsourced retouch shops in the search results above actually do by hand. |
| **B — Single-photo AI approximation** | One garment photo (on mannequin/hanger/flat-lay) → background/mannequin removed → the hollow interior (neckline, cuffs, waist opening) is *inpainted* — i.e., a model paints in plausible fabric-colored shading/folds where the mannequin/body used to be visible. | 1 photo + an inpainting model | **Yes**, but a *small*, CPU-feasible one (see 3.2) |
| **C — Full AI reconstruction** | One photo of a *worn* garment → a diffusion model reconstructs a canonical "flat"/ghost view of just the garment, hallucinating everything about its true shape and interior from a single view. This is the direction of 2024–2025 academic "Virtual Try-Off" research (e.g. TryOffDiff, CVPR'25). | 1 photo + a full diffusion pipeline | **Yes**, and it's the same class of model as V-Tone — same CPU cost problem |

**What Snappyit/Photoroom/Pixelcut actually sell you is Tier B**, wrapped in
a nice UI, charged per credit. They are not doing anything Tier-C-heavy —
if they were, a $6.90/mo plan with instant turnaround wouldn't be
economical for them either.

### 3.2 Tier B is the realistic, CPU-only, no-API answer

**IOPaint** (formerly "lama-cleaner"), MIT/Apache-2.0, self-hosted,
Python — https://github.com/Sanster/IOPaint. It packages the **LaMa**
inpainting model (small, CNN-based, not a diffusion model) alongside
optional heavier Stable-Diffusion-based backends you would *not* use here.

- **License:** Apache 2.0 — same free-to-self-host category as V-Tone and
  `rembg`, already proven acceptable in this project.
- **CPU speed:** independently benchmarked at **~25 seconds per image** on
  CPU for object-removal/inpainting on HD images (7–10% of the image
  masked). That is a completely different order of magnitude from the
  30-minute diffusion runs — it's the same LaMa architecture already known
  to be lightweight (it's a small CNN, not a multi-step diffusion sampler).
- **What it would need to do the job:** LaMa erases/fills a *masked region*
  you tell it about — it doesn't know "this is a neckline" on its own. The
  realistic pipeline is:
  1. `rembg` (already in use) — cut the garment out from its background/mannequin.
  2. A **mask** covering the neckline/sleeve-opening/waist areas where the
     mannequin or hanger was visible through the garment. This mask can be
     approximated heuristically (garment silhouette minus a shrunk interior
     region) or drawn once per garment *shape* and reused, since most
     kurtis/suits/sarees in one category share a similar neckline geometry.
  3. Feed the cutout + mask to IOPaint's LaMa model → it fills the masked
     hollow area with plausible fabric-colored texture.
  4. Composite onto a backdrop exactly like `batch-clean-photos.py` already
     does today.
- **Resource fit for CX43 (8 shared vCPU, 16GB RAM, no GPU, €12/mo — the box
  you already have running V-Tone):** trivially fits. LaMa's published CPU
  benchmark hardware is far less than a CX43. No GPU is needed for this
  tier — this is the one AI option in this whole document that is actually
  proportionate to the hardware you bought.
- **Honest quality ceiling:** this is an *approximation*, not a true 3D
  reconstruction. It will not perfectly recreate exact fabric folds inside
  a real neckline the way Tier A (real second photo) or a much heavier
  diffusion model (Tier C) might. For catalog thumbnails at typical
  e-commerce viewing size, this is very plausibly good enough — it's
  functionally the same tier of quality the $7–35/mo SaaS tools you were
  about to be forced to pay for are already selling.

### 3.3 Tier C (diffusion-based, "real" AI reconstruction) — researched, not recommended

Academic work exists (TryOffDiff, CVPR 2025 —
https://github.com/rizavelioglu/tryoffdiff, license: SSPL) that reconstructs
a garment's canonical shape from a single worn photo using Stable Diffusion
as a base. This is the closest thing to "real AI" ghost-mannequin
generation and would, in principle, produce better hollow-interior detail
than Tier B.

The problem is the same one you already hit and measured yourself: Stable
Diffusion-class inpainting/generation on CPU only, independently benchmarked,
runs **~20–22 minutes per image** on hardware comparable to (or better
than) your CX43's shared vCPUs. That's the same 20–30 minute wall V-Tone
already ran into on this exact box. Nothing about swapping "try-on" for
"try-off" changes the underlying cost — it's diffusion sampling either way,
and diffusion sampling is what's slow on CPU, not the specific task.
**Do not build this tier without adding a GPU.**

---

## 4. Price & resource comparison (the table you asked for)

| Option | Type | Cost | Hardware | Per-image speed (measured or benchmarked) | Needs an API key from a 3rd party? | Ghost-mannequin quality tier |
|---|---|---|---|---|---|---|
| **Snappyit (as currently wired)** | SaaS, credit-based | $6.90–$48.90/mo, ~$0.06–0.10/image | None (their servers) | Seconds (their infra) | **Yes — and doesn't exist to get one.** No developer API was found. Current code is non-functional. | B |
| Photoroom / Pixelcut / similar (not integrated, found during research) | SaaS, credit-based | Similar $6–35/mo tiers | None (their servers) | Seconds | Yes, if they publish one (not verified — same "consumer app, not dev API" pattern is common in this space) | B |
| **V-Tone (already self-hosted, CX43)** | Self-hosted diffusion, repurposed | €0 extra (already running) | CX43: 8 shared vCPU, 16GB RAM, no GPU | **~32 min/image, measured live** | No | Wrong task (try-on, not ghost mannequin) |
| **IOPaint / LaMa (researched, not built)** | Self-hosted, small CNN inpainting | €0 extra (same CX43) | Same CX43, far below its capacity | **~25 sec/image, published CPU benchmark** | No | B (approximation) |
| TryOffDiff / diffusion-based ghost mannequin (researched, not built) | Self-hosted diffusion | €0 extra (same CX43) *if* CPU; needs GPU to be usably fast | CX43 CPU: technically runs, practically too slow. A GPU box (e.g. Hetzner GEX44, ~€184/mo — already ruled out once for V-Tone on cost grounds) would fix speed | ~20–22 min/image on CPU (benchmark); low-single-digit seconds to minutes on GPU | No | C (best quality of the self-hosted options) |
| **True ghost mannequin, 2-photo compositing** | No AI at all — pure image layering | €0 | Any machine, even a phone | Effectively instant (a compositing script, not a model) | No | **A — the real technique, best possible quality** |

---

## 5. Straight answer: what's the best fit

Given you already own the CX43 specifically so you're not paying per-image
or waiting on a vendor:

1. **Stop pretending Snappyit works.** It's not a configuration gap, it's an
   integration built against a product that has no API to integrate with.
   Recommend removing the "ghost mannequin" checkbox from the admin
   photo-cleanup page and the `snappyit.ts`/`ghost-mannequin.ts` files until
   a real path is chosen — leaving them in place just produces the exact
   error you hit, forever, for anyone who clicks that checkbox.
2. **The proportionate, no-API, CPU-only answer is IOPaint/LaMa (Tier B).**
   It runs comfortably on the CX43 you already pay for, at ~25 sec/image —
   fast enough for real catalog batch use, unlike V-Tone or any diffusion
   route. It will look like an *approximation* of ghost mannequin (same
   tier the cheap SaaS tools sell), not a photostudio-perfect one.
3. **If retailers are willing to take one extra photo per new design** (the
   interior-neckline shot), Tier A (plain compositing, no AI) gives the
   actual professional-grade result other e-commerce ghost-mannequin
   services sell, for zero ongoing compute cost and zero model quality
   risk — at the cost of a slightly heavier photography step for the
   retailer, once per design (matching the "unpack once per design" premise
   F-001e was already built around).
4. **Full diffusion-quality reconstruction (Tier C) needs a GPU to be
   usable**, which is the exact cost tradeoff already declined once for
   V-Tone (GPU box ≈ €184/mo vs. €12/mo CPU box). Nothing found in this
   research changes that calculus for ghost mannequin specifically — it's
   the same diffusion-on-CPU wall.

This document does not implement anything — say the word on which tier you
want and it can be scoped and built as its own task.
