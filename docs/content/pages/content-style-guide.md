# Kanchuki Website Copy — Style & E-E-A-T Guide

**Purpose:** One shared rulebook for every page in `docs/content/pages/`. Use it to write, review, and edit any website copy.
**Applies to:** All public site pages — homepage, /for-retailers, /for-customers, /how-it-works, /pricing, /stores, /app, /about, /testimonials, /faq, /contact.
**Date:** 2026-08-09

---

## 1. What "humanized" means here

Write the way a helpful shop assistant at a busy Indian clothing store would talk — plain, warm, direct, no marketing fluff. Rules:

1. **Short sentences.** One idea per sentence. If a sentence needs a comma chain, split it.
2. **You-language.** Talk to the reader ("your shop", "your customers"), not about them ("retailers should…").
3. **Everyday words, not jargon.** Say "photo" not "asset"; "catalog" not "product information management"; "app" not "platform solution".
4. **Numbers that mean something.** "500 products" beats "large catalog". "Under ₹2,000/month" beats "affordable".
5. **Hindi companion where it helps.** The hero tagline is "आपकी दुकान, AI की ताकत". Sprinkle Hindi words only where they feel natural to an Indian retail reader (dukaan, khata, ghar baithe) — never as decoration.
6. **No hype.** No "revolutionary", "game-changing", "world-class". Say what the thing does, then let the reader decide.

---

## 2. What E-E-A-T means for us (and how to write for it)

Google evaluates content with **Experience, Expertise, Authoritativeness, Trustworthiness**. This is how each shows up in our copy:

### Experience (E)
> *Does the content come from real, first-hand experience?*

- Write from the **shop floor**: "You've seen it — a customer walks in at 9 PM and the good stock is in the back room. They can't see it." We live this daily; the copy should sound like it.
- Use **real store examples** from Kanchuki's own retailer cohort (with permission), never invented quotes or fake shops.

### Expertise (E)
> *Does the author actually know the subject?*

- Only claim what the product **actually does** (see the feature inventory in `website-roadmap.md` §2 — every claim must trace to a built feature).
- Show the *mechanism*, not magic: "AI looks at your photo and adds the category, colour, fabric, and a short description automatically" — specific beats vague.
- Cite real system details where they build trust: "GST invoices, INR pricing, UPI payments" — concrete India-specific proof.

### Authoritativeness (A)
> *Is this a source others can rely on?*

- **Live numbers over claims.** Stats come from the real `GET /public/stats` endpoint, never hardcoded fakes.
- Named references: "Razorpay", "UPI (GPay/PhonePe/PayTM)", "WhatsApp", "14-day free trial, no credit card" — recognizable, verifiable facts.
- Link to real pages (pricing, stores, app) instead of asserting.

### Trustworthiness (T)
> *Can the reader trust us with their business and their data?*

- **Honesty gate (binding, from website-roadmap.md §8.2):** no fabricated testimonials, no invented founder story, no fake logos. Until real retailer stories exist, show live stats + the store directory instead.
- Be upfront about limits: Virtual Try-On is "coming soon"; iOS/Play Store app is "coming soon" with an honest badge; anything a feature doesn't do is not claimed.
- Give people a real way to reach a human: WhatsApp + support email on every page footer.
- Data safety: mention that customer photos belong to the store, deletion is supported, and the platform follows India's data norms.

---

## 3. Tone by audience

| Audience | Tone | Example |
|---|---|---|
| **Retailer** (primary) | Practical, respectful, money-aware, "your shop, your stock, your customers" | "Stop retyping your catalog. Photograph it once — AI writes the description." |
| **Customer / shopper** | Warm, helpful, "browse a store like you're walking in" | "Every store on Kanchuki is a real shop you can message directly." |
| **Curious visitor / press** | Clear, specific, no fluff | "Kanchuki digitizes India's 1M+ offline clothing stores with AI photo cataloging and WhatsApp sharing." |

---

## 4. Structure rules for every page

1. **One H1** — the page's promise. Never repeat the H1 inside the body as an H1 again.
2. **H2 sections** — each a distinct reader question ("Why does my shop need a catalog?").
3. **H3 within sections** for sub-points.
4. **Lead paragraph** under the H1: 2–3 sentences that answer "what is this page about and who is it for".
5. **One primary CTA per page** at the end, plus contextual links along the way.
6. **Bullet lists** for features; **tables** for comparisons and pricing.
7. **FAQ-style H2s** are fine — "Can I use it without a website?" is a heading AND a question.

---

## 5. Vocabulary — say this, not that

| Don't say | Say |
|---|---|
| platform / solution / suite | app / product |
| digitize your business | put your shop online |
| leverage AI | let AI do the typing |
| comprehensive catalog management | keep your catalog in one place |
| onboarding journey | getting started |
| end-user | customer / shopper |
| seamless experience | it just works |
| robust / scalable | handles big catalogs |
| utilize | use |
| revolutionize | — (delete entirely) |

---

## 6. Facts that are always true (safe to use anywhere)

- Kanchuki is built for Indian clothing stores — sarees, kurtis, suits, lehengas.
- Works **without a website** — the catalog lives on a link you share on WhatsApp.
- **AI tags photos automatically**: category, subtype, colour, fabric, occasion, plus a short description and auto SKU.
- **14-day free trial, no credit card.** INR pricing only, UPI + cards + netbanking.
- Three plans: Starter ₹999/mo, Growth ₹2,499/mo, Pro ₹4,999/mo (annual = 20% off).
- Retailer app: Android (EAS APK). Play Store / iOS: coming soon.
- Stores get their own free web storefront at a personal link (e.g. kanchuki.app/store/your-shop).
- Customers browse, favourite, and enquire — no app needed on their side.
- Data safety: photo deletion supported, platform follows data norms, admin control center protects against unauthorized access.

---

## 7. Review checklist (run before publishing any page)

- [ ] Every feature claim traces to a built feature (roadmap §2) or is marked "coming soon".
- [ ] No invented testimonials, founder story, or numbers.
- [ ] All prices match `PLAN_PRICING` (₹999 / ₹2,499 / ₹4,999; annual −20%).
- [ ] Stats come from the live API, not hardcoded.
- [ ] Short sentences, you-language, no jargon, no hype words.
- [ ] One H1, clear H2 sections, one primary CTA.
- [ ] Contact + WhatsApp link present.
- [ ] Reads aloud naturally — if you stumble, rewrite.
