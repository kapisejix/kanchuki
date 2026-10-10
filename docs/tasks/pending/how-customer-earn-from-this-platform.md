# How Customers Earn From This Platform — F-041 Pre-Loved

**Status:** 🔴 Idea / Planned — **not approved, not built** · **Written:** 2026-09-29
**Merges:** the former `preloved-marketplace.md` (spec → Part A) and `preloved-research.md` (research → Part B).
**Indexed in:** `docs/PRO-REQUIREMENTS.md` §39 · `docs/PLAN.md` "Next" table · `CLAUDE.md` What's-Built index.
**Scope note:** outside the Phase 0 MVP in `CLAUDE.md`. The 2026-08-31 teardown removed
checkout/orders; this spec deliberately **does not reintroduce on-platform payments in Phase 1**.

---

## At a glance — the ways a shopper earns or saves

Kanchuki today earns money for **retailers**. F-041 turns the shopper's own wardrobe into value too.

| # | How the shopper benefits | Mechanism | Phase |
|---|---|---|---|
| 1 | **Sell** clothes they no longer wear | List with price, size and measurements; buyer pays by UPI/cash at handover | P1 |
| 2 | **Rent out** costly occasion wear (lehenga, sherwani, bridal) | Rent per event + deposit; the partner retailer holds, cleans and hands over the item | P3 |
| 3 | **Store credit** for handing over old clothes | Retailer trade-in voucher (e.g. 3 garments → ₹300 off a ₹2,000+ purchase) | P2 |
| 4 | **Bonus voucher** for selling/giving via Kanchuki | "Sold or gave an item through Kanchuki? 10% off at this store" | P2 |
| 5 | **Buy cheaply** — good clothes at a fraction of the price, with a fit badge | Browse nearby, filter "fits me (incl. alteration)" | P1 |
| 6 | **Give free** to family or neighbours | FAMILY_FREE private link or public FREE; the owner chooses the recipient | P1 |
| 7 | **Buy-back** on new purchases (retailer option) | "Return this outfit within 12 months for 30% credit" | Retailer-run, see §R2.1 |

Listing and buying stay **free for shoppers**. Kanchuki's own revenue comes later from the retailer
side (plans, rental commission, featured listings) — never from low-income buyers.

---

# Part A — Feature Spec

## 1. The idea in one paragraph

Kanchuki today is a platform for **retailers** to sell. Shoppers already have their own
phone-OTP account (`CustomerAccount` / "passport"). F-041 lets a shopper **list their own used
clothes** — to **sell cheaply**, **rent out** (for expensive occasion wear), or **give free** — with
exact price, size, and garment measurements. Buyers in the same town, including low-income families,
get good clothes cheaply. Relatives can be sent a private link and offered an item free. A
**neighbourhood tailor** closes the size gap, and a **partner retailer's store** acts as the safe
handover point — which is where the retailer benefits.

---

## 2. Is this acceptable in India? (honest assessment)

**Yes, with the right category and framing choices.** Evidence and caveats are in
Part B §R2 and §R6.

| Segment | Acceptance | Why |
|---|---|---|
| Occasion wear (lehenga, bridal, sherwani, silk saree) | **High** | Worn once; big saving; renting is already familiar |
| Kids' wear | **High** | Outgrown, not worn out; families already pass it on |
| Unstitched fabric / sarees | **High** | No size problem; often never worn |
| Branded western wear (jeans, jackets) | Medium | Popular with students and young buyers |
| Used daily wear (kurtis, shirts) | **Low–medium** | *Utran* stigma; price must be very low |
| Innerwear, nightwear, socks | **Not allowed** | Hygiene — banned category |

**Low-income buyers specifically:**

- They **already buy second-hand offline** (weekly old-clothes markets, bartanwali resale). The
  platform has to beat that on **trust + locality + price**, not features.
- Smartphone, UPI, and WhatsApp reach is broad, but **delivery fees kill items under ~₹500** →
  Phase 1 is **local pickup only**.
- **Never label anyone as poor.** No "for poor people" section. Use neutral words: *Free*,
  *Give away*, *Under ₹200*. Dignity is a design requirement.
- **Hindi and regional-language UI** matter more for this audience than for retailers (ties into
  `i18n-and-dynamic-content-audit.md`).
- **Risk:** free items get grabbed by resellers. Mitigations in §8.

---

## 3. Users and roles

| Role | What they do |
|---|---|
| **Lister** (shopper) | Photographs the item, sets price/rent/free, size + measurements, visibility |
| **Seeker** (shopper) | Browses nearby, filters by "fits me", taps *I'm interested* |
| **Family / friends** | Receive a private link; can claim a "free for family" item |
| **Tailor** (Phase 2) | Listed nearby with an alteration price list; accepts alteration requests |
| **Partner retailer** | Opt-in handover point; optionally rental custodian (Phase 3); gains footfall |
| **Admin** | Moderation queue, banned-category rules, dispute handling, abuse flags |

---

## 4. Listing modes

| Mode | Use when | Price fields |
|---|---|---|
| **SELL** | Normal resale | `price` (₹) |
| **RENT** | Costly occasion wear (suggest when the original price is ≥ ₹5,000) | `rent_per_event` (₹), `deposit` (₹), rental days |
| **FREE** | Give away to anyone nearby | none |
| **FAMILY_FREE** | Free only to people holding the private link | none |

A listing can be **SELL + RENT** together (e.g. "₹3,000 to buy or ₹600 per event").

**Price guidance (AI, optional):** suggested price = f(category, original price if entered,
condition, age). Starting rule: 20–40% of original for good occasion wear, 10–25% for daily wear.
Rent suggestion: 10–20% of original per event. Show the suggestion; the lister decides.

**Visibility:**

- `PUBLIC` — anyone nearby
- `LINK_ONLY` — only people with the link (family/friends via WhatsApp)
- `PROFILE` — shown on the lister's public profile page, which can itself be shared

---

## 5. The size problem — and how we solve it

Indian labels (S/M/L/XL, "38", "free size") are inconsistent across brands and tailors. **A size
label alone is not enough.** Four layers:

### 5.1 Garment measurements (required for stitched items)

Measured **on the flat garment**, in inches, with a picture guide showing where to put the tape:

| Garment | Required measurements |
|---|---|
| Kurti / kurta / top / shirt | Bust/chest (armpit to armpit × 2), waist, hip, length, shoulder, sleeve length |
| Blouse | Bust, under-bust, shoulder, sleeve, length, back-neck depth |
| Lehenga | Waist, hip, length (+ blouse and dupatta as separate pieces) |
| Salwar / pant / palazzo | Waist, hip, inseam/length |
| Kids' wear | Age band + chest + length |
| Saree / unstitched fabric | **No size** — fabric length in metres; blouse piece yes/no |

**Stitched state** is a first-class field: `UNSTITCHED | SEMI_STITCHED | STITCHED`. Unstitched items
and sarees skip all size logic and are shown as "fits anyone".

### 5.2 Alteration margin

Indian tailored garments usually keep extra seam allowance inside. The lister records
**"extra margin inside"** (0 / 1″ / 2″ / 3″+) for bust, waist, and hip, with a photo guide showing
how to check it. This is what makes "let it out" possible.

### 5.3 Fit badge for the seeker

The seeker saves their body measurements once (extending the existing `usual_size` on
`CustomerAccount`). Each listing then shows one badge:

| Badge | Rule (per key measurement, with ~1–2″ ease) |
|---|---|
| ✅ **Fits you** | Garment within ease of the seeker's measurement |
| ✂️ **Fits with alteration** | Garment larger (can be taken in — nearly always possible), or smaller but within the recorded margin (can be let out) |
| ❌ **Won't fit** | Smaller than seeker minus margin, or length too short |

Taking in is almost always possible; letting out is limited by the margin; **length can rarely be
added**. The badge must say *which* change is needed, e.g. "Take in waist ~2″".

Filter: **"Show only items that fit me (incl. alteration)"**.

### 5.4 Tailor in the loop (Phase 2)

- **Tailor directory:** nearby tailors register a lightweight profile (name, area, WhatsApp, photos
  of work, price list: *take in ₹100, let out ₹150, shorten ₹80, blouse alteration ₹200…*).
- From an ✂️ listing: **"Get it altered"** → pick a tailor → the alteration note ("take in waist 2″")
  and garment photos go to the tailor via WhatsApp.
- Partner retailers that already employ an in-house tailor can list them — another retailer benefit.
- Kanchuki may take a small fee later; **not in Phase 2** (keep tailor onboarding friction-free).

---

## 6. Family / relatives sharing and free gifting

- Every listing has a **Share** button → WhatsApp deep link (reuse the web deep-link module from RC-041).
- **FAMILY_FREE + LINK_ONLY:** "I'm giving this lehenga free to family — tap to claim." Not visible publicly.
- **Claim flow:** a relative taps *I'd like it* → the lister sees all requests → **the lister picks**
  who gets it (never first-come-first-served for free items).
- **Profile page:** `/p/<handle>` shows the lister's active items; shareable to a family WhatsApp group.
- The lister can **convert** an unclaimed family item to PUBLIC FREE or SELL later.

---

## 7. Handover and money (Phase 1: no on-platform payments)

**Why no payments in Phase 1:** checkout/orders were removed on 2026-08-31; payments bring escrow,
refunds, disputes, TCS/GST questions, and Consumer Protection (E-Commerce) Rules obligations. Local
pickup with **UPI or cash paid directly at handover** avoids all of that while demand is validated.

**Handover options:**

1. **At a partner retailer's store (recommended default)** — a safe, public, known place; the
   retailer gets footfall; nobody shares a home address. Important for women's safety.
2. **A public place** chosen by both.
3. **Home pickup** — only if the lister explicitly allows it; the address is never shown on the listing.

**Contact:** *I'm interested* → notification to the lister → lister accepts → **only then** are
WhatsApp numbers exchanged (in-app chat in Phase 2). Phone numbers are never public (DPDP + safety).

---

## 8. Trust, safety and abuse

| Risk | Control |
|---|---|
| Hygiene | Banned categories (innerwear, nightwear, socks); "washed/dry-cleaned" declaration required |
| Fake / bad photos | Minimum 3 photos incl. label + close-up; AI flags stock/catalog images (reuse `is_catalog_image` from tagging) |
| Counterfeit brands | A "branded" claim needs a label photo; report button |
| Resellers grabbing FREE items | Per-account cap on free claims (e.g. 3 active / 10 per month); lister chooses the recipient; flag accounts that relist claimed items |
| Scams / no-shows | Ratings after handover (reuse the F-021 ratings pattern); repeat no-shows lose visibility |
| Harassment | Numbers hidden until accepted; block/report; store handover by default |
| Rental damage | Phase 3 only, with deposit + retailer custodian (§9) |
| Prohibited / offensive content | Admin moderation queue; AI pre-screen on upload |
| Minors | Listing requires an 18+ declaration |

**Legal review needed before launch (owner + lawyer/CA):**

- **Intermediary status** under the IT Act and IT Rules 2021 (grievance officer, takedown timelines).
- **Consumer Protection (E-Commerce) Rules 2020** — likely lighter while no payment is handled; confirm.
- **GST** — individuals selling personal used goods are generally not making a taxable "supply"; once
  Kanchuki collects payments (Phase 3), check e-commerce-operator obligations (TCS, CGST s.52).
- **DPDP Act** — listing photos may show faces or homes; consent and deletion follow `docs/SECURITY.md`.

---

## 9. Phased plan

| Phase | Scope | Payments | Size |
|---|---|---|---|
| **P0 — validate without code** | 2–3 partner stores run a WhatsApp group "Pre-loved near <store>"; staff post items; handover at the store; count listings, claims, completed handovers, store visits | none | 0 code |
| **P1 — Customer listings** | SELL / FREE / FAMILY_FREE; AI auto-fill of category/colour/fabric from photos (reuse tagging); measurements + stitched state + margin; fit badge; nearby browse (city/pincode); share link + profile page; *I'm interested* → accept → WhatsApp; store-handover selection; moderation queue; banned categories | none | Medium |
| **P2 — Tailor + retailer tie-in** | Tailor directory + "Get it altered"; retailer opt-in as handover point with a store badge; retailer **trade-in voucher** ("sold/gave an item via Kanchuki? 10% off at this store"); ratings after handover | none | Medium |
| **P3 — Rental + payments** | RENT mode with deposit; retailer as **custodian** (stores, dry-cleans, hands over, collects back; takes a cut); Razorpay Route split payments; dispute flow | on-platform | Large + legal |
| **P4 — Circular loop** | Unsold after N days → "donate / recycle" button; pooled pickup to NGOs/recyclers across retailers (see Part B §R2.1) | — | Small |

**Recommendation:** run **P0** during the Diwali 2026 wardrobe clear-out before writing any code.

---

## 10. How the retailer benefits

1. **Footfall** — every handover at a partner store brings two people into the shop.
2. **Conversion** — a trade-in/exchange voucher is handed over at the same visit.
3. **Tailor revenue** — the store's in-house tailor gets alteration jobs.
4. **Rental custodian cut** (P3) — earns on inventory it never bought.
5. **Customer insight** — what shoppers list and seek shows sizes, styles, and budgets (with consent,
   through the existing preference engine).
6. **Brand story** — "sustainable neighbourhood store" for local press and social media.

**Kanchuki revenue (later, never from the low-income side):** partner-store feature inside paid
retailer plans; rental commission (P3); optional featured listings for high-value items; pooled
recycling margin (P4). **Listing and buying stay free for shoppers.**

---

## 11. Data model sketch (not final — check `docs/DATABASE.md` and the RLS convention before any migration)

```prisma
model PreLovedListing {
  id                   String   @id @default(cuid())
  customer_account_id  String
  mode                 PreLovedMode       // SELL | RENT | SELL_OR_RENT | FREE | FAMILY_FREE
  visibility           PreLovedVisibility // PUBLIC | LINK_ONLY | PROFILE
  status               PreLovedStatus     // DRAFT | PENDING_REVIEW | ACTIVE | RESERVED | DONE | REMOVED
  title                String
  category             String             // reuses the DB taxonomy (F-027)
  color                String?
  fabric               String?
  stitched_state       StitchedState      // UNSTITCHED | SEMI_STITCHED | STITCHED
  size_label           String?
  measurements_in      Json?              // { bust, waist, hip, length, shoulder, sleeve, ... }
  alteration_margin_in Json?              // { bust: 2, waist: 1, hip: 0 }
  condition            ItemCondition      // NEW_WITH_TAG | LIKE_NEW | GOOD | FAIR
  times_worn           Int?
  original_price_paise Int?
  price_paise          Int?
  rent_price_paise     Int?
  deposit_paise        Int?
  city                 String
  pincode              String?
  handover_retailer_id String?            // partner store, optional
  photo_keys           String[]
  created_at           DateTime @default(now())
  updated_at           DateTime @updatedAt
  deleted_at           DateTime?
}

model PreLovedInterest {
  id         String   @id @default(cuid())
  listing_id String
  seeker_id  String   // CustomerAccount
  status     String   // REQUESTED | ACCEPTED | DECLINED | COMPLETED | NO_SHOW
  created_at DateTime @default(now())
}

model Tailor {            // Phase 2
  id          String  @id @default(cuid())
  name        String
  city        String
  area        String?
  whatsapp    String
  price_list  Json
  retailer_id String?   // set when it is a partner store's in-house tailor
}
```

Also: extend `CustomerAccount` with body measurements (or add a `CustomerMeasurements` table) and a
public profile handle. All money in **paise, INR only**. Every table needs RLS per the project convention.

---

## 12. Success metrics (P0/P1)

- ≥ 30% of partner-store shoppers who see the feature list at least one item
- ≥ 25% of listings get at least one *I'm interested* within 7 days
- ≥ 50% of accepted interests end in a completed handover
- ≥ 40% of in-store handovers produce a same-visit purchase or voucher redemption
- FREE-item abuse flags below 5% of claims

---

## 13. Open decisions for the owner

- **D-1:** Approve F-041 at all, and when — before or after launch?
- **D-2:** Phase 1 **local pickup only, no payments**? (Recommended: yes.)
- **D-3:** Store handover as the **default** or just one option? (Recommended: default.)
- **D-4:** Categories allowed at launch? (Recommended: occasion wear, kids' wear, unstitched/sarees,
  branded western wear; daily wear allowed but not promoted.)
- **D-5:** Free-claim cap per month or per active count?
- **D-6:** Tailors self-registered, or onboarded only through partner retailers?
- **D-7:** Inside the customer PWA (recommended) or a separate sub-brand/site?

---

# Part B — Research Background (India + Global)

> **Source caveat.** Compiled from general knowledge (training data to mid-2026), **not** from live
> web searches in this session. Every number below is approximate and must be re-verified before it
> goes into a pitch deck, pricing sheet, or investor material. Named companies are examples of a
> model, not endorsements; some have pivoted or shut down (noted where known).

---

## R1. Why this matters — the occasion-wear problem

- Indian shoppers buy **for occasions** (weddings, festivals, pooja, sangeet, office events). An
  occasion outfit is worn **1–5 times**, then stored.
- High-value ethnic wear (lehenga, bridal, Banarasi/Kanjeevaram silk, sherwani, designer suit) is the
  worst case: ₹5,000–₹1,00,000+ of value locked in a trunk, worn once or twice.
- India generates roughly **7–8 million tonnes of textile waste per year** (Fashion for Good,
  *Wealth in Waste*, 2022) — around 8–9% of the global total.
- Globally, **less than 1%** of clothing material is recycled into new clothing (Ellen MacArthur
  Foundation). The rest is downcycled, landfilled, burned, or exported.

---

## R2. What Indian households do with old clothes today

| Path | What happens | Notes |
|---|---|---|
| Hand-me-down (*utran*) | Siblings, cousins, relatives in the village | Most common; strongest for kids' wear |
| Domestic help / watchman | Wearable items given away | Common in urban middle-class homes |
| **Bartanwali exchange** | Old clothes swapped for steel utensils at the doorstep | Proves customers already trade clothes for value |
| Rags / *pochha* | Cotton becomes floor cloths and dusters | Final use of most cotton |
| Home upcycling | Saree → quilt (*godhadi/kantha*), dupatta, kids' frock, curtain | Mostly the older generation |
| Donation | Goonj, temples, gurudwaras, NGOs, disaster relief | Peaks at Diwali cleaning |
| Kabadiwala | Sold by the kg for a few rupees | Very low value |
| Trunk storage | Wedding wear kept for sentiment / "maybe later" | Large dead inventory |
| Landfill / burning | Synthetics and damaged items | Growing with fast fashion |

**The informal second-hand market already serves low-income buyers.** Clothes collected by
bartanwalis and kabadiwalas are sorted and resold in weekly/old-clothes markets (for example Delhi's
Raghubir Nagar, Sunday/haat markets across cities). Low-income families *do* buy used clothes —
cheaply, locally, cash in hand, touch-before-buy. Any platform competes with that experience.

**Key cultural facts for product design:**

1. **Stigma is real but category-specific.** Wearing a stranger's used *daily wear* reads as
   inferior (*utran*). Used *occasion wear*, kids' wear, and unstitched fabric carry much less stigma
   — the buyer is getting a ₹15,000 lehenga for ₹2,500.
2. **Family giving is normal and valued.** Passing a wedding outfit to a niece is a gesture, not charity.
3. **Diwali cleaning (Oct–Nov)** is when every household clears its wardrobe — also peak buying season.
4. **Exchange is a familiar mental model:** jewellery gold exchange (e.g. Tanishq), phone exchange on
   Amazon/Flipkart. "Bring old, get credit on new" needs no explaining.
5. **Alteration is universal.** Almost every Indian family has a neighbourhood tailor (*darzi*);
   altering a garment for ₹100–₹400 is routine. **This is India's advantage** over Western resale:
   size mismatch is fixable cheaply.
6. **Unstitched fabric and sarees are size-free.** Unstitched suits, dress materials, and sarees
   resell with no size problem at all.

### R2.1 Retailer-side idea from the same discussion (exchange / trade-in)

Recorded here so it isn't lost; it is a separate feature from F-041 but pairs with it.

- **Trade-in for store credit, never cash:** "Bring 3 old garments → ₹300 voucher on a ₹2,000+
  purchase, valid 30 days." Premium ethnic pieces are assessed individually.
- **Grade collected clothes:** A = premium resell/rent · B = wearable basics → bulk aggregator or
  donation (Goonj) · C = damaged → recyclers (Panipat shoddy mills, wipers, fill) · Z = real zari →
  zari recovery.
- **Other models:** occasion-wear rental, **buy-back guarantee** on new purchases ("return within 12
  months for 30% credit"), consignment (20–30% commission), an upcycled line made with local tailors,
  a Diwali "exchange mela".
- **Platform angle:** Kanchuki pools Grade B/C volume across retailers into one bulk sale to recyclers
  (a single shop's scrap is too small to sell well).
- **GST on used goods:** a margin scheme may apply (GST on the resale margin only) — **confirm with a CA**.

---

## R3. What the rest of the world does

### R3.1 United States

- **Scale:** EPA figures put US textile waste around **17 million tons/year**, with only ~15% recycled
  and most of the rest landfilled.
- **Thrift / charity:** Goodwill, Salvation Army, church thrift stores. Only a minority of donations
  sell in-store; the rest go to **rag graders** and bulk export (much of it to Africa, Latin America,
  and Asia).
- **Online resale:** ThredUp (managed consignment — you mail a "clean out bag", they grade and sell),
  Poshmark (peer-to-peer, social "closets", sharing to followers), Depop (Gen-Z, styled), eBay,
  The RealReal (authenticated luxury), Facebook Marketplace (local pickup).
- **Brand take-back / resale:** Patagonia *Worn Wear*, Levi's *SecondHand*, white-label brand resale
  programmes (e.g. Trove); H&M in-store garment collection (vouchers for a bag of clothes).
- **Rental:** Rent the Runway (occasion + subscription). Proves rental works for expensive,
  rarely-worn pieces.
- **Gifting:** the **Buy Nothing Project** — hyper-local neighbourhood groups where *everything* is
  given free; millions of members. Direct precedent for a "give free" option.
- **Habits:** garage/yard sales, closet clean-outs, clothing swaps among friends.

### R3.2 United Kingdom

- **Charity shops** are mainstream, not stigmatised: Oxfam, British Heart Foundation, Cancer Research
  UK, Barnardo's — roughly ten thousand shops. Buying second-hand is seen as smart and ethical.
- **Vinted** is the dominant peer-to-peer app (zero seller fee; buyer pays a protection fee).
  **Depop** was founded in Italy and grew up in London.
- **Peer-to-peer rental:** **By Rotation** and **HURR** — people rent out their own designer/occasion
  pieces to others. This is the closest existing model to F-041's "rent if costly" option.
- **Textile banks** in supermarket car parks and council recycling centres.
- **"Swishing" parties** — clothing swaps, often women-organised, social events.
- **Mending culture revival:** repair cafés, visible mending, alteration services on the high street.
- **Policy:** WRAP's *Textiles 2030* voluntary agreement for brands and retailers.

### R3.3 Europe (EU)

- **Law is ahead of everyone else:**
  - **EU Waste Framework Directive:** separate collection of textiles mandatory from **1 Jan 2025**;
    EU-wide **Extended Producer Responsibility (EPR)** for textiles agreed in 2025 — brands pay for
    collection and recycling.
  - **France:** textile EPR since 2007 (eco-organisation *Refashion*); the **AGEC law** bans destroying
    unsold goods (2022); a **repair bonus** (*bonus réparation*) subsidises clothing and shoe repairs
    at approved menders (from late 2023).
- **Germany:** street collection containers (*Altkleidercontainer*), Humana, Oxfam shops, Kleiderkreisel
  (merged into Vinted).
- **Lithuania → pan-EU:** **Vinted**, now Europe's largest second-hand fashion marketplace.
- **Sweden / Nordics:** Sellpy (managed resale, H&M-backed), strong swap culture, recycled-fibre
  research (Renewcell / Circulose — Renewcell went bankrupt in 2024 and its technology was restarted
  as Circulose, which shows how hard fibre-to-fibre economics are).
- **Netherlands:** origin of the **Repair Café** movement (Amsterdam, 2009), now worldwide.

### R3.4 Asia

- **Japan:**
  - *Mottainai* — a cultural aversion to waste.
  - **Boro** (layered patched indigo cloth) and **sashiko** (decorative running-stitch mending) —
    mending as art, now fashionable worldwide.
  - Old kimonos are cut into bags, scarves, and new garments; kimonos are inherited across generations.
  - Large second-hand chains (2nd Street, Book Off, Kindal) and **Mercari** (C2C app, very popular with
    women; simple "photo → price → ship from convenience store" flow).
  - **Uniqlo RE.UNIQLO** — collects its own garments, donates wearable ones, recycles down jackets.
- **South Korea:** apartment-complex clothing collection bins; **Danggeun Market (Karrot)** — a
  hyper-local, neighbourhood-verified C2C app with a very popular **"sharing" (free giving)** feature.
  This is the closest analogue to F-041's local + free-gift design.
- **China:** **Xianyu** (Alibaba's C2C app, very large), community donation bins; historically similar
  stigma to India around wearing strangers' clothes, eased by younger buyers and luxury resale.
- **Southeast Asia:** Philippines *ukay-ukay* (bales of imported used clothes, sold in stalls) — a large
  low-income market; Indonesia/Malaysia thrift ("bundle") shops.
- **South Asia:** Pakistan and Bangladesh import used-clothing bales; India's **Panipat** is the
  world's largest hub for recycling woollens and used clothes into shoddy yarn and blankets.

### R3.5 Africa (the destination of the world's donations)

- Most donated Western clothing that isn't sold in-store is exported in bales: **mitumba** in Kenya,
  **Kantamanto market** in Accra, Ghana (one of the largest second-hand markets in the world).
- A large share is unsellable on arrival and ends up dumped — a warning against "donate everything"
  schemes with no grading.

---

## R4. How used clothes become new things (recycling routes)

| Route | Process | Output | Maturity |
|---|---|---|---|
| **Re-use (resale / rental / gifting)** | Clean, grade, resell as-is | The same garment, used again | Best value, lowest energy |
| **Repair / alteration** | Tailor fixes, resizes | Garment fits a new owner | Cheap in India |
| **Upcycling** | Cut and re-sew into new products | Dupattas, bags, cushion covers, quilts, patchwork, kids' wear, rag rugs, potli bags | Craft/small-batch; premium pricing possible |
| **Mechanical recycling** | Shred → fibre → spin | Shoddy yarn, blankets (Panipat), insulation, mattress/toy stuffing, industrial wipers | Mature, low value |
| **Chemical recycling** | Dissolve cotton/viscose to pulp, or depolymerise polyester | New fibre (e.g. Circulose, Syre, Worn Again) | Early, expensive; <1% of clothing today |
| **Zari recovery** | Burn/melt metallic thread | Silver/gold recovered | Only valuable for real zari |
| **Energy recovery / landfill** | Incinerate or dump | — | Last resort |

**Fibre matters:** pure cotton and pure wool recycle well; blends (poly-cotton, stretch, with
embellishment) are hard to recycle and are better re-used or upcycled.

---

## R5. What women and girls do around the world

- **Swap parties** (UK "swishing", US/EU clothing swaps) — social, friend-group events.
- **Sell on apps** — Vinted, Depop, Poshmark, and Mercari have majority-female seller bases; many
  treat it as side income ("closet clear-out money").
- **Rent occasion wear instead of buying** — By Rotation, HURR, Rent the Runway; the Indian
  equivalent is local "dress on rent" shops and Flyrobe-style services for bridal/party wear.
- **Capsule wardrobes / "30 wears" pledge** (Livia Firth's #30Wears) — buy less, wear more.
- **Mending and customising** — sashiko, embroidery over stains, cropping, dyeing; large on
  Instagram/TikTok.
- **Inheritance** — Japanese kimono; Indian bridal sarees and heavy lehengas passed down.
- **Gifting within the community** — Buy Nothing (US), Karrot sharing (Korea), family *utran* (India).

---

## R6. What this tells us for India (conclusions carried into Part A)

1. **Model on Karrot / Buy Nothing / Vinted / By Rotation, not ThredUp.** Hyper-local peer-to-peer
   with free giving works; centrally graded consignment needs warehouses we don't have.
2. **Shipping kills cheap items.** A ₹150 kurti can't carry ₹60–80 of courier cost. Use **local
   pickup / handover** — ideally at a partner retailer's store.
3. **Occasion wear is the premium lane** (sell or rent); **kids' wear and unstitched fabric** are the
   low-stigma volume lanes; **used daily wear** is the weakest lane.
4. **Tailor alteration is India's structural advantage** — make it part of the product, not an afterthought.
5. **Low-income buyers already buy second-hand offline.** Win on trust, locality, and price —
   not on features.
6. **Never label buyers as "poor".** Free giving works when framed as neighbourly sharing, not charity.
