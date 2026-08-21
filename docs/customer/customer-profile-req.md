# Customer Profile + Multi-Retailer AI Stylist — Research & Requirements

**Date:** 2026-08-21
**Status:** Research + decision recorded. Nothing built. No schema/code changes made.
**Decision:** User confirmed **unified cross-retailer customer identity** (one phone-OTP login, one profile, browse/favorite across all retailers) — this is what §6 below labels **Option C**. Note the label collision: the user's own shorthand "Option B" (from the initial fork question) means the *full unified identity* model, not the narrower "opt-in cross-store product matching, no shared login" option this doc separately calls Option B. Written out in full below so the letters don't matter.

---

## 0. Verdict

**Two separable pieces, both now scoped:**

- **AI Stylist** (combo suggestions from tagged catalog) — good fit, buildable now, cheap. LLM + deterministic color/fabric rules over attributes already captured by the AI Catalog Builder. See §3–4.
- **Cross-retailer customer identity** — confirmed direction, but it is a **business-model pivot**, not a feature slot. It directly reverses PRO-REQUIREMENTS §2.2 ("customer does NOT need... create account") and requires the `Customer` model to stop being solely `retailer_id`-owned (`docs/DATABASE.md:382-427`, phone unique per-retailer today, not globally). Auth mechanics are cheap (Supabase Auth phone OTP + MSG91 rail already live for retailers, 2026-08-12 — directly reusable for customers). The real cost is the identity/data-model rework + retailer buy-in, not the login screen.

**Retailer-relationship risk, stated plainly since the call is made:** putting all 12+ boutiques behind one customer login turns Kanchuki into a marketplace competing for that customer's attention across stores it also serves individually. Retailers may read this as Kanchuki disintermediating their customer relationship. Not a reason to reverse the decision — a reason to sequence rollout with retailer communication/opt-in, not silently.

---

## 1. Market grounding

- Ethnic wear online penetration ~32% of category revenue, growing >15%/yr; offline (~68%) still dominates — **fabric/fit trust doesn't transfer to a screen** for sarees and unstitched suits. (6Wresearch, SkyQuest)
- Overall ethnic wear market CAGR ~12.6%, driven by rising income + renewed preference for traditional garments. (Technavio)
- Tier-2/3 buyers — Kanchuki's actual base — still prefer in-store fabric/fit assessment despite rising smartphone penetration. Online growth there is discount/convenience-led, not trust-led.
- **Implication for the unified-identity decision:** trust today is anchored to *the retailer*, not "Kanchuki" as a brand. A marketplace layer has to preserve each store's identity on top of the shared login, or it fights the very trust dynamic that makes these customers buy at all.

---

## 2. Cautionary precedent: Craftsvilla

Craftsvilla raised $58M over 8 years as "Etsy for Indian ethnic wear," aggregating independent boutiques. Failed: supply chain quietly consolidated to Surat mass-manufacture, breaking the authenticity promise; 3 pivots, never found fit, sold off 2019 at a loss. (Entrackr, Wikipedia)

**Lesson for the now-confirmed unified-identity build:** the marketplace layer must keep each boutique's real identity and real stock visible and attributed — don't let the "one Kanchuki profile" abstraction flatten 12+ distinct stores into one undifferentiated catalog. That flattening is exactly what killed Craftsvilla's credibility.

Contrast: **GlowRoad/Meesho** — social resell of a shared dropship catalog, works because reseller owns zero inventory, but boutiques lose brand identity entirely. Wrong pattern to copy — Kanchuki's pitch to retailers is "you keep your own storefront."

---

## 3. AI Stylist — what's buildable now

### 3.1 Precedent architectures

| Product | Approach | Data needed |
|---|---|---|
| Myntra "My Stylist" (2023) | CNN + Bi-LSTM trained on ~450k styles; input = purchase/browse history + wardrobe photo; output = complete-the-look | Volume Kanchuki does not have |
| Stitch Fix | ML narrows/ranks candidates, ~1,600 human stylists make final call | Large fit/feedback dataset + human-in-the-loop |

### 3.2 What Kanchuki has right now

- AI Catalog Builder already tags category/color/fabric/subtype/occasion per product (BUILD-LOG §12).
- `CustomerFashionDNA` model exists in schema (`docs/DATABASE.md:467-491`) — color/style/fabric/occasion affinities + budget range — currently unused by anything customer-facing.
- No 450k-style training set, no embedding pipeline, no click-stream volume — training a recommender is not realistic yet.

### 3.3 Correct v1

**LLM-prompt matching over already-tagged attributes, layered on a deterministic color/fabric rule set — no training, no vector model for v1.** Customer types free text → Claude receives parsed intent + tagged catalog subset (filtered by occasion/budget/affinity) → returns a combo + one-line rationale. Deterministic rules in §4 pre-filter so the LLM can't propose combos that violate basic conventions. Reuses existing Claude Vision infra, existing attribute fields, finally gives `CustomerFashionDNA` a consumer.

---

## 4. Matching rules (documented Indian styling conventions)

| Element | Rule | Source pattern |
|---|---|---|
| Dupatta-to-outfit | **Match-to-bottom** (coordinated/safe), **match-to-kurta** (monochrome/elegant), **contrast** (festive/high-impact) | Shreekama |
| Color pairing | **Analogous** = soft/harmonious daily wear. **Complementary** = vibrant/festive (royal blue + gold, mustard + maroon) | Fordiva |
| Fabric weight | Printed/heavy-embroidered suit → plain dupatta. Solid suit → printed/embellished dupatta. Chiffon/georgette for flowy suits, silk/velvet for structured | AzaFashions |
| Footwear (jutti/mojari) | **Tonal-match dominates** — picks up a color already in the outfit. Black/brown/beige = safe base. Sherwani: mojari matches kurta, not bottom | AzaFashions, PureElegance |
| Region ≠ generic occasion | North Indian bridal → Banarasi silk. South Indian bridal → Kanjeevaram. "Occasion: wedding" alone misfires without a region/state field | CBazaar, G3Fashion |
| Regional color skew | Punjab: bold red/yellow/green/orange. North: heavier silk/brocade, dense embroidery. South: lighter cotton/silk. East: breezy cottons | G3Fashion |

Encode as a small static ruleset — a pre-filter/validator under the LLM, not a trained model.

---

## 5. Quiz design (feeds `CustomerFashionDNA`)

5 questions, map to existing schema fields, no new tables for v1:

1. **Occasion** → `pref_occasions` / `occasion_affinities`
2. **Region/state** (new field — not currently on `Customer` or `CustomerFashionDNA`) — required per §4's regional-bridal finding
3. **Budget range** → `budget_min`/`budget_max` (exists)
4. **Fabric preference / avoidances** → `pref_fabrics`, `notes`
5. **Color preference or "surprise me"** → `pref_colors` / `color_affinities`

`customers.usual_size` (migration 058 — **not yet applied**) feeds size filtering once live; don't build against it before it lands.

---

## 6. Cross-store mechanic — options considered, decision recorded

**Option A — Same-store only.** Zero identity-layer work. Not chosen — user wants cross-store.

**Option B — Cross-store opt-in product matching, no shared login.** Each store keeps its own separate `Customer` row; only product discovery crosses stores, via the existing referral engine as the commission primitive. Lighter lift, smaller blast radius. Not what the user asked for here — noted for reference only.

**Option C — Full unified customer identity across all 12+ boutiques. ← CONFIRMED DECISION.** One phone-OTP login (reuse Supabase Auth + MSG91 rail, already live), one profile, cross-store favorites/wishlist, `CustomerFashionDNA` becomes retailer-agnostic (or retailer-scoped rows get merged under one identity). Requires:
- New identity layer above today's retailer-scoped `Customer` model.
- Consent/data-sharing flow per SECURITY.md §12-18 governance — new cross-tenant PII surface, not covered by existing per-retailer RLS design.
- Retailer communication on the model change (see risk note in §0) — not a technical blocker, a rollout-sequencing one.

---

## 7. Data model gaps

- No region/state field on `Customer`/`CustomerFashionDNA` — needed per §4/§5.
- `CustomerFashionDNA` currently `retailer_id`-scoped (`docs/DATABASE.md:470`) — under Option C this needs to become identity-scoped (one DNA profile per customer, aggregating signal across all retailers they've interacted with) rather than one-per-retailer-relationship.
- `customers.usual_size` (migration 058) not yet applied — blocks size-aware stylist output.
- No product-to-product "pairs well with" relation — v1 stylist output stays LLM-composed from independently tagged items, no schema change required yet.
- Unified identity needs a `CustomerAccount`-style table (phone as global key) sitting above per-retailer `Customer` rows, plus a migration path to link/merge existing retailer-scoped customer records to the new identity without duplicating consent.

---

## 8. AI Stylist + Engagement + Retention — full feature set (approved backlog)

### 8.1 Engagement — keep customers browsing more catalogs

1. **Personalized home feed** — "For You" row using Fashion DNA (color/style/budget/occasion) — biggest lever once unified DNA is live.
2. **Wishlist/favorite across stores** — syncs to the unified profile, not a single-store session — direct consequence of the Option C decision.
3. **"Similar from other stores"** — cross-sell when viewing a product, surface a matching item from a different retailer — needs retailer opt-in + the referral/commission mechanism from §6 Option B, reused here as the settlement layer even though full identity (Option C) is the login model.
4. **Festival/seasonal collections surfaced** — Diwali, Navratri, wedding season — festival campaign engine already built (Sprint Block B) — extend to customer-facing surfacing across the unified feed.
5. **Restock/new-arrival notify** for favorited stores — via WhatsApp (existing retailer→customer channel) or web push.
6. **Price-drop/promotion alert** — Smart Promotion Engine already built retailer-side — wire a customer-facing alert.
7. **Recently viewed + browsing history** — cheap, standard retention hook, now spans stores under one profile.
8. **Style quiz onboarding** — see §5 — removes cold-start for Fashion DNA on day one.

### 8.2 Retention services beyond browsing

- **Virtual Try-On, customer self-serve** — Fashion V-Tone self-hosted, LIVE on Hetzner (BUILD-LOG §27/23), currently admin/retailer-only tool ("Generate on model"). Opening this to customers directly is the platform's stated moat and the single highest-leverage retention feature — currently backend-ready, frontend-gated only.
- **AI Stylist Chat** — "what goes with this kurta" — natural language extension of §3's stylist, conversational rather than single-shot.
- **Saved measurements** — bust/waist/hip, usual size (F-102, migration 058 pending) — reused for unstitched/blouse-stitching orders without re-entry.
- **Showroom/try-on room booking** — already built (Sprint Block C) — surface prominently in the unified customer web app.
- **Order tracking + GST invoice download** — checkout built (L2 ecommerce); invoicing pipeline designed, not built (Phase I).
- **Easy reorder** — one-tap reorder of the same item/size — common pattern for repeat saree/kurta purchases for family members.
- **Referral rewards, customer side** — retailer referral engine already built; extend so the customer also earns a discount for referring a friend to a store.
- **Reviews/ratings** — already built (F-021) — surface as social proof on product/store pages, now visible across the unified profile's browsing history.

### 8.3 India-fashion-specific product/content layer

- **Unstitched + tailoring flow** — capture measurements once, order stitching (blouse-stitching, fall-pico) as an add-on — high-frequency ask in Indian retail. Design-selection mechanic now confirmed — see §9.
- **Occasion-based curated collections** — wedding (sangeet/mehendi/reception differ), festival (Diwali/Eid/Karva Chauth/Pongal/Durga Puja), daily-wear vs ethnic.
- **Regional style filters** — Banarasi/Kanjeevaram/Chanderi/Bandhani, Punjabi suits, South Indian silk, Bengali taant — filter by weave/region, not generic "saree."
- **Fabric glossary/education** — cotton vs khadi vs georgette vs silk blends — AI tagging already extracts fabric (BUILD-LOG §12) — surface as filter + tooltip, builds first-time-online-buyer trust (see §1's trust finding).
- **Family/gifting mode** — buy for a family member using their saved size profile — extension of the usual-size feature.
- **Mix-and-match lookbooks** — retailer Lookbook Generator already built — surface styled combos (kurta + dupatta + jutti) to the customer, drives basket size, directly reuses §4's matching rules.
- **Rental/exchange for one-time wear** — sangeet lehenga, sherwani — real unmet need, not built, adds logistics complexity — flag as a later differentiator, not v1.
- **Regional language UI** — Hindi groundwork laid (migration 063, `preferred_locale`), customer-facing toggle still not built. Real Tier-2/3 adoption blocker — arguably higher-leverage than new features, since it blocks people from using what already exists.

---

## 9. Unstitched Suit Design Gallery — Admin-Curated Reference Catalog (confirmed feature)

**Mechanic (user-confirmed):** Admin uploads reference design images, each tagged to one of the 5 trade-standard categories below with a specific named option. Customer, viewing an unstitched-suit product, opens "Explore Designs" → browses/filters the gallery by category → picks a design → taps WhatsApp share to send the design image to their tailor, family, or anyone (not limited to the retailer's own number).

**Scope note — this is the simpler, static-catalog pattern (UDesign-style), not the AI-composite pattern (StitchMagic-style: customer's own fabric photo + design reference → AI-generated photorealistic preview) surfaced in the AI Stylist research earlier in this doc.** Confirmed as out of scope for this version — see the explicit callout at the end of this section. That's a deliberate scope cut, not an oversight: this version needs no new AI/image-generation pipeline at all, only admin upload + categorization + share, all buildable on infra that already exists:

- **Image upload/storage** — same R2 pipeline every product photo already uses.
- **Categorization** — same pattern as the existing DB-backed Category/Style/Occasion/Fabric taxonomy (F-027, BUILD-LOG §29) — reuse that structure for design categories/options, don't build a new taxonomy subsystem.
- **Share mechanism** — existing per-product WhatsApp share button (F-006, BUILD-LOG §7) — already sends an image/link out; same button, pointed at a design-reference image instead of a product photo.

**Design category taxonomy (admin tags each upload to one category + one named option — real trade-standard names, not invented):**

| Category | Named options |
|---|---|
| Neckline ("gala") | V-shape, round, boat neck, square, keyhole, high neck, mandarin/collar, banded, asymmetric, sweetheart, halter, off-shoulder, button-front, angrakha-style |
| Blouse back design | Deep V-back, round-cut back, square back, keyhole back, dori/string-tie back, criss-cross back, backless, bow-back, pot neck (South Indian rounded), zipper/collar-back |
| Sleeve/shoulder | Full, 3/4, bell, puff, cape, dolman |
| Salwar/bottom | Churidar, Patiala, palazzo, sharara, straight-pant, dhoti-style |
| Kurti/kameez silhouette | A-line, straight-cut, Anarkali, high-low |

**Scope decided: platform-wide.** Curated once via the existing Admin Control Center, all retailers' customers browse the same shared gallery. A "keyhole neckline" reference photo isn't retailer-specific — no reason for 12+ retailers to each re-upload the same ~14 neckline photos. (Per-retailer would only make sense for a different feature — showcasing each retailer's own tailor's past work as a portfolio, not a taxonomy-tagged style catalog — not what's being built here.)

**Data model implication:** new `DesignReference` entity — image + category (enum, 5 values above) + option (enum per category, from the named lists above) — a sibling to the existing taxonomy tables (F-027 pattern), not a new subsystem. No relation to `Customer` needed for this static-gallery version — it's a standalone browsable catalog linked from the unstitched-suit product page, admin-managed via the existing Admin Control Center pattern (same shape as the Photo Cleanup / Studio Shoot admin tools already built).

**Explicitly out of scope for this version:** AI-generating a preview of the *customer's own fabric* stitched in the chosen design (the StitchMagic-style composite from §3's research). This version only shows the *reference* design on a model/generic fabric — the customer imagines their own fabric in that cut, then shares the reference to their tailor to execute. Cheaper, no AI dependency, ships fast on existing infra. The AI-composite upgrade stays open as a later, separate build if the static gallery alone doesn't move the trust needle enough — don't build it preemptively.

---

## 10. Consent/Privacy (non-negotiable, SECURITY.md §12-18)

Collecting customer contact + building the unified cross-store profile (§6 Option C) is a new PII surface, not an extension of the existing per-retailer RLS model:

- Explicit consent capture at signup — "share my profile/activity across Kanchuki stores" — cannot be bundled into a generic ToS checkbox.
- Deletion rights — a customer must be able to delete the unified identity without needing to contact each of the 12+ retailers individually.
- No silent cross-store data pooling — a retailer should not see another retailer's interaction history for a shared customer without that customer's explicit opt-in.

Do not skip this when scoping the Option C build — it's a governance requirement, not a nice-to-have.

---

## 11. Build priority (original, identity-first) — SUPERSEDED for near-term scope by §12

1. **Customer login + cross-store favorites** — the Option C decision itself: unified identity via existing Supabase Auth/MSG91 rail, `CustomerAccount` layer, consent flow.
2. **Customer-facing VTO self-serve** — backend already live (Hetzner), this is a frontend/access-gating change, not new AI infra — highest-leverage next feature given it's already built.
3. **Hindi UI toggle** — groundwork (migration 063) already laid — removes a real adoption blocker for Tier-2/3 customers ahead of adding more new features.

AI Stylist (§3) and the rest of §8's backlog follow once the identity layer (#1) exists to hang cross-store favorites/feed personalization on.

**Note (2026-08-21):** this order optimizes for "identity foundation first." It conflicts with a later ask for *minimum dev time* — Option C (item 1) is XL effort. See §12 for the minimum-time-ordered list actually confirmed for near-term build.

---

## 12. Finalized build priority — minimum dev time, user-confirmed 2026-08-21 (P0–P2, no coding started)

Supersedes §11 for near-term scope. Selected: items 1–13 below (P0/P1/P2). Items 14+ deferred, not scoped for this build pass. Nothing coded yet — scope lock only.

| # | Feature | Effort | Priority | Notes |
|---|---|---|---|---|
| 1 | Customer-facing VTO self-serve | S — frontend gate only, backend already LIVE (Hetzner) | 🔴 P0 ✅ Built | Commit `6dcf35c` — flipped `TRY_ON_ENABLED` gate 2026-08-21 |
| 2 | Showroom booking — surface in customer web | S — already built (Sprint Block C) | 🟡 P1 ✅ Built | Commit `367ba34` — BookingForm + bottom bar button + API proxy 2026-08-21 |
| 3 | Reviews/ratings — surface as social proof | S — already built (F-021) | 🟡 P1 ✅ Built | Commit `1fa2262` — ReviewList component + rating distribution 2026-08-21 |
| 4 | Festival/seasonal collections — surface | S — engine already built | 🟡 P1 ✅ Built | Commit `ea8d81d` — SeasonalPicks + public collections endpoint 2026-08-21 |
| 5 | Mix-and-match lookbooks — surface | S — Lookbook Generator already built | 🟡 P1 ✅ Built | Commit `3bee868` — CustomerLookbooks + public lookbooks endpoint 2026-08-21 |
| 6 | Price-drop/promotion alert | S — Smart Promotion Engine already built | 🟡 P1 ✅ Built | Commit `c4cbec7` — PromotionBanner + public promotions endpoint 2026-08-21 |
| 7 | Fabric glossary + tooltip | S — fabric already tagged by AI | 🟢 P2 ✅ Built | Commit `06a5fcf` — FabricGlossary +25 fabrics 2026-08-21 |
| 8 | Recently viewed (same-store scope) | S — no identity dependency | 🟢 P2 ✅ Built | Commit `d2a7ae7` — localStorage tracker + horizontal row 2026-08-21 |
| 9 | Restock/new-arrival notify | M — needs favorite-trigger wiring | 🟢 P2 ✅ Built | Commit `3e40d88` — NotifyWhenAvailable on sold-out products 2026-08-21 |
| 10 | Saved measurements | S once migration 058 applied | 🟢 P2 ✅ Built | Commit `fb26d03` — SavedSize localStorage capture XS-8XL 2026-08-21 |
| 11 | Style quiz onboarding (§5) | M — needs new region field | 🟢 P2 ✅ Built | Commit `e3f5250` — 5-question quiz with skip 2026-08-21 |
| 12 | AI Stylist v1 (§3–4) | M — LLM + static rules, no training | 🟢 P2 ✅ Built | Commit `52af9fb` — Claude-powered chat + deterministic pre-filter 2026-08-21 |
| 13 | Unstitched Design Gallery (§9) | M/L — new `DesignReference` entity + admin CRUD | 🟢 P2 ✅ Built | Commit `3e695f4` — schema + migration 069 + admin CRUD + customer gallery 2026-08-21 |

**Deferred (not in this scope):** items 14–20 (P3 — easy reorder, regional filters, referral rewards customer-side, family/gifting mode, occasion collections, AI Stylist Chat, full Hindi UI toggle), item 21 (Customer login + cross-store identity / Option C — XL, foundation for items 22–24), items 22–24 (blocked on 21: wishlist cross-store, personalized home feed, "similar from other stores"), item 25 (order tracking + GST invoice download — blocked on Phase I invoicing), item 26 (rental/exchange — explicitly out of scope, logistics complexity).

**Consequence of deferring Option C (item 21):** items 1–13 above stay same-store-scoped where identity would otherwise matter (#8 recently-viewed, #9 restock-notify) — cross-store versions follow once/if item 21 is later approved.
