# ADR-006: Defer 3D Parametric (SMPL/STAR) Measurement-Driven VTO

**Status:** Accepted
**Date:** 2026-07-11
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
