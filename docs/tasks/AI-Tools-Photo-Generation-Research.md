# AI Image/Video Generation Tools Research — Consumer AI vs Kanchuki's Paid Pipeline

**Date:** 2026-09-18
**Trigger:** Owner question — if ChatGPT/Gemini/etc. generate "free" stunning product photos via prompt commands, why pay for BFL Flux, why not let retailers use these tools directly (including for Virtual Try-On)?
**Status:** Research only. No code changed.

---

## TL;DR

1. **Consumer AI chat tools are not a substitute for the catalog pipeline.** They're free for *one-off, manually-prompted, single images in a chat UI*. Kanchuki's product is the *pipeline* (photo → auto-tag → compress → R2 store → WhatsApp share → customer catalog), not the pixel-generation step alone. A retailer manually running 500–3000 SKUs through ChatGPT/Gemini one prompt at a time, downloading, renaming, and re-uploading each image, is doing unpaid data-entry labor Kanchuki exists to remove. The "free" image is real; the free *workflow* isn't.
2. **Yes — add cheaper/alternate models, keep curated commands, don't expose a raw prompt box.** Flux Kontext Pro (~$0.04/MP) is already cheaper than Nano Banana Pro (~$0.134/image) for the identity-preserving edit use case Kanchuki needs. The admin-configurable multi-provider pattern already exists in this codebase (F-023 AI Provider Registry, F-034 Fal.ai multi-model video) — extending it to add Gemini/GPT-Image as additional Studio Shoot providers is small, additive work, not a rebuild. A free-text prompt box is a liability (off-brand output, moderation risk, broken garment fidelity) — keep the locked-template + optional short "style note" pattern already shipped in F-032.
3. **Don't rebuild Try-On. Google already ships one, for free, for retailers who use Google Merchant Center — and Kanchuki explicitly tore VTO out of scope on 2026-08-31.** Google killed the standalone "Doppl" app on 2026-04-30 and folded virtual try-on directly into Google Search/Shopping ("Try It On", powered by Gemini 2.5 Flash Image / Nano Banana), live in India among 10 countries, with Zalando/Zara already using it. It's free to the retailer and free to the shopper — Google hosts and pays for the compute. But it only reaches retailers who run a Google Merchant Center product feed (GTIN, categories, Shopping ads) — which is not Kanchuki's model (no checkout, WhatsApp-first, offline SMB). Re-adding an in-app VTO would directly reverse a deliberate, recent removal (see `docs/database/no-feature-want.md`, CLAUDE.md "Removed" list) — flag this to the owner before building anything, don't just implement it.

---

## 1. Why would a retailer pay Kanchuki if ChatGPT/Gemini can "just" make free stunning photos?

### What the free/cheap consumer tools actually are
- **Nano Banana / Nano Banana Pro (Gemini)** — Google's Gemini 2.5/3 Flash Image models. Commercial use of output is permitted under Google's Gemini API terms (no extra restriction beyond safety filters); output carries an invisible SynthID watermark that doesn't affect usability. Pricing when accessed via API: **$0.02–$0.134/image** depending on tier. Free inside the consumer Gemini app/chat UI, rate-limited, no SLA, no batch API guarantees for a business.
- **ChatGPT Images (GPT Image 2 / 2.5)** — free inside ChatGPT app tiers (including free tier) with daily/monthly caps; API pricing is token-based, working out to roughly **$0.005–$0.21/image** depending on resolution/quality. OpenAI's terms let you own and commercially sell/resell output, subject to content policy and not claiming AI output as human-made, and subject to having rights to any input photo you upload.
- **BFL Flux Kontext** (what Kanchuki currently pays for) — **$0.025–$0.04/MP**, actually **cheaper per edit than Nano Banana Pro** in raw $ terms (see §2).

So the "free" claim is half-true: it's free *for a human, manually, one image at a time, inside a chat window*. None of these tools hands a retailer:
- A **queue/quota system** tied to their subscription plan (Starter/Growth/Pro) — Kanchuki's `QuotaResourceType` system (F-010) already gates this.
- **Automatic garment-identity preservation across 500–3000 SKUs** in one batch run. Consumer chat tools are proven to drift: research explicitly documents that Nano Banana identity/garment fidelity degrades after ~8–10 sequential edits and needs manual "re-anchoring" to the reference image every 5–8 prompts — fine for a solo creator making a few hero shots, unworkable for an SMB onboarding a full shop unattended (this is exactly the failure mode Kanchuki's bulk-onboarding feature, F-001d, is built to avoid).
- **Auto background removal + AI tagging (category/color/fabric/size) + compression to ≤80KB + R2 storage + rack/shelf location + WhatsApp collection links + customer PWA catalog.** The image is 1 step in a ~10-step retailer workflow. A retailer who "just uses ChatGPT" still has to manually do steps 2–10 for every product, every restock.
- **Consistency of *brand*, not just garment.** A retailer generating photos ad hoc in ChatGPT gets a different background/lighting/style every session unless they re-paste a long prompt each time (and remember it). Kanchuki's admin-curated style presets (F-032, 18 templates) guarantee the whole catalog looks like one coherent shop.

**The honest answer for the owner to give retailers:** *"You can absolutely generate one nice photo for free in ChatGPT today. Try doing that consistently for 800 products, correctly tagged, compressed, backed up, and pushed to a shareable WhatsApp catalog, every time you restock — without an app."* That gap is the product.

---

## 2. Should Kanchuki drop/supplement BFL and let retailers pick a model + write custom prompts?

### Cost comparison (per generated/edited image, Sept 2026 pricing)

| Provider/Model | Price | Notes |
|---|---|---|
| Flux Kontext Dev | ~$0.025/run | cheapest, slightly lower fidelity |
| **Flux Kontext Pro (current BFL usage)** | **~$0.04/MP** | best price/fidelity tradeoff for garment-preserving edits |
| Nano Banana 2 (Gemini Flash Image) | ~$0.02–0.03/image | cheap, but see drift issue above |
| Nano Banana Pro (Gemini 3 Pro Image) | ~$0.134/image | **3x+ pricier than Flux Kontext Pro** |
| GPT Image 2 | ~$0.005–$0.21/image (res-dependent) | widest range, unpredictable cost at high-res |

**Finding: BFL is not overpriced relative to the "free" alternatives once you price the API, not the chat app.** Flux Kontext Pro is actually the *cheapest* credible option for the specific job (lock garment identity, vary background/model/style) — this is why BFL was picked originally and that choice holds up.

### Recommendation
- **Add, don't replace.** Kanchuki already has the exact architecture for this twice over: F-023 (AI Provider Registry, admin-configurable tagging models + weighted quota) and F-034 (Fal.ai — 5 interchangeable video models, admin-curated). Extending the same pattern to Studio Shoot images (add Nano Banana / GPT Image as selectable providers next to Flux Kontext, admin sets per-plan-tier default) is a bounded, additive change — reuse the provider-registry pattern, don't design a new one.
- **Don't expose a raw custom-prompt textbox to retailers.** Every piece of research on this pulled up the same failure mode: unconstrained prompts → garment drift, off-brand results, and (per OpenAI's usage terms) the retailer becomes responsible for content-policy violations and any rights issues in what they typed or uploaded. Kanchuki already ships the safer version of this: curated style commands (`/whitebg`, `/onmodel`, `/goldenhour`-equivalents) as the 18 admin-managed `STUDIO_TEMPLATES` (F-032/F-032 demographic expansion). This *is* the "slash command" system the owner is describing — already built, just admin-curated instead of freeform.
- **If retailers want customization, add a short constrained field** ("style note," max ~100 chars, appended to a locked `/preserve` block that always pins color/print/embroidery/fabric/silhouette) rather than an open prompt box — gets 80% of the flexibility with none of the drift/moderation risk.

---

## 3. Can these tools power Virtual Try-On, free, for retailer + customer?

### The landscape shifted under this question — Google already built it
- Google ran a standalone "Doppl" VTO app in Labs through early 2026, then **shut it down on 2026-04-30** — not a failure, a migration. Try-on is now built directly into **Google Search and Google Shopping**: any shopper can tap "Try It On" on a supported listing, using a full-body photo or even just a selfie (Gemini auto-generates a full-body render from a selfie via Nano Banana). It now covers apparel and shoes.
- **Officially live in India** (one of 10 launch countries, alongside US/UK/Canada/Australia/Argentina/Chile/Colombia/Japan/Mexico). Zalando and Zara are cited as live retail partners.
- **Cost to the retailer: $0. Cost to Kanchuki: $0.** Google hosts the model and pays the inference cost. The only requirement is that the retailer's products are in **Google Merchant Center** with a correctly categorized apparel product feed (GTIN, images meeting Google's spec).

### Why this doesn't just solve it for Kanchuki
Kanchuki's retailers are **offline SMB shops with no website, selling via WhatsApp links** — deliberately no checkout, no product feed infrastructure, no Google Shopping ads account (that's a materially different, higher-friction product than what Kanchuki sells). Getting a Kanchuki retailer onto Google Merchant Center is a separate, non-trivial integration (GTIN assignment, feed spec compliance, a Google Ads/Merchant account) — worth a **future, distinct feature** ("push my Kanchuki catalog to Google Merchant Center so shoppers get free Google-hosted try-on") rather than Kanchuki re-implementing try-on itself.

### On rebuilding VTO in-app
**This project already built and then explicitly removed self-serve VTO.** Per memory (`kanchuki-catvton-multipiece-rootcause.md`, `runpod-catvton-deploy-debug.md`) CatVTON was deployed, debugged, and confirmed working end-to-end on RunPod in July 2026 — then VTO was fully torn down in the 2026-08-31 feature teardown (migration `082_remove_unwanted_features`) with an explicit "Removed" line in CLAUDE.md and a rejected note in the WhatsApp/growth roadmap. That was a deliberate product decision, not a technical failure. **Flag this conflict to the owner directly before building anything** — don't silently resurrect a torn-out feature because a new research question touched it.

If the owner overrides that decision and wants try-on back:
- **Don't rebuild self-hosted CatVTON/IDM-VTON on GPU infra.** The July 2026 RunPod deploy worked but RunPod is billed per build/poll cycle (see `kanchuki-runpod-cost-caution.md` memory — "burns cost fast") and Kanchuki's current image infra (Hetzner CX43 for V-Tone) is **CPU-only**, no GPU — reviving CatVTON means re-adding GPU hosting cost and ops surface that was removed on purpose.
- **The lazy, cheaper path is the same provider-registry pattern as Studio Shoot:** call Nano Banana / Gemini's image-edit endpoint per-request with (person photo + garment photo) → worn-image out, pay ~$0.02–0.13/generation, no GPU box to run. This reuses F-034's exact "pay-per-call to a hosted model, no self-hosted inference" pattern instead of the GPU-hosted CatVTON pattern that was already tried and removed.
- Either way this is a **new scoped feature decision requiring explicit owner sign-off**, not an extension of existing work — the removal was deliberate and recent (three weeks ago).

---

## Sources

- [Nano Banana image generation — Interactions API](https://ai.google.dev/gemini-api/docs/image-generation)
- [Clarification on Commercial Use of AI-Generated Images from Gemini](https://support.google.com/gemini/thread/370190690/clarification-on-commercial-use-of-ai-generated-images-from-gemini-nano-banana?hl=en)
- [Nano Banana 2 API Guide 2026](https://ark-route.com/blog/nano-banana-api-guide)
- [Nano Banana Pro Restrictions in 2026](https://www.aifreeapi.com/en/posts/nano-banana-pro-restrictions)
- [ChatGPT Images 2.5 pricing: API rates and cost per image](https://www.eesel.ai/blog/chatgpt-images-2-5-pricing)
- [GPT Image 2 API Pricing: $0.03–$0.08 per Image](https://unifically.com/blogs/gpt-image-2)
- [FLUX.1 Kontext [pro] API: Pricing, Benchmarks & Docs](https://www.together.ai/models/flux-1-kontext-pro)
- [FLUX API Pricing — Black Forest Labs](https://bfl.ai/pricing)
- [Nano Banana 2 API | AIMLAPI](https://aimlapi.com/models/google-gemini-3-1-flash-image-preview)
- [Virtual Try-On in 2026: How CatVTON and IDM-VTON Work](https://medium.com/@anmjawad007/virtual-try-on-in-2026-how-catvton-and-idm-vton-work-what-i-learned-on-a-macbook-m1-pro-and-how-6428f460fcba)
- [AI Virtual Try-On Models: IDM-VTON, CatVTON, VITON-HD](https://opencreator.io/blog/ai-virtual-try-on-models)
- [Google's AI try-on feature for clothes now works with just a selfie — TechCrunch](https://techcrunch.com/2025/12/11/googles-ai-try-on-feature-for-clothes-now-works-with-just-a-selfie/)
- [Google Virtual Try-On Is Now in Search: What Every Retailer Must Know in 2026](https://adrianarivas.tech/2026/04/18/google-virtual-try-on-retail-2026/)
- [Google virtual try on shopping feature adds new studio-quality images](https://blog.google/products-and-platforms/products/shopping/studio-quality-digital-try-on/)
- [Can AI Replace Fashion E-Commerce Photography? — Fstoppers](https://fstoppers.com/artificial-intelligence/can-ai-make-useable-e-commerce-fashion-photography-901418)
- [Nano Banana 2 Character Consistency with Reference Images](https://nanobananatool.com/blog/nano-banana-2-character-consistency)
- [OpenAI Usage policies](https://openai.com/policies/usage-policies/)
- [OpenAI Service terms](https://openai.com/policies/service-terms/)
