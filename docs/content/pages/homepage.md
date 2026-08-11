# Homepage (`/`) — Full Section Copy

**Purpose:** One page that proves → educates → shows → convinces → prices → acts. Every section below maps 1:1 to the roadmap §4 table.
**Audience:** Retailers (primary) and their customers (secondary).
**Style:** Per `content-style-guide.md` — humanized, E-E-A-T, honest (no fake testimonials, live stats only).

---

## 1. Navbar (static)

- Left: KanchukiMark + wordmark.
- Links: For Retailers · For Customers · How It Works · Pricing · Stores · FAQ.
- Right: **Sign In** (retailer login) + **Start Free Trial** (primary CTA → `/pricing#signup`).

---

## 2. Hero

**Headline:**
> Your store on WhatsApp. Powered by AI.

**Hindi line:**
> आपकी दुकान, AI की ताकत

**Sub-headline:**
> Take a photo of any dress in your shop. AI writes the catalog — the name, the colour, the fabric, the price. Share one link on WhatsApp. Your customers browse it like a real store, no app and no website needed.

**CTAs:**
- Primary: **Start Free Trial** (14 days, no credit card)
- Secondary: **See How It Works**

**Trust row (small text):**
> 14-day free trial · No credit card · No website needed · Works on your phone

---

## 3. Live stats bar (live data — never hardcoded)

> Real numbers from stores already on Kanchuki.

- **Retailers onboarded** (live)
- **Products in catalogs** (live)
- **Collections shared** (live)
- **Enquiries this month** (live)
- **Catalog views** (live — from `collection_views`)

*Rule: these come from `GET /public/stats`, extended with the views counter. If a number isn't ready, show the stat without a number rather than a fake one.*

---

## 4. Why a catalog matters (editorial — "why catalog is important for retailers")

**H2: Your best stock is invisible at 9 PM. A catalog fixes that.**

Lead: Most clothing shops have the same problem — the good stuff is on a rack in the back, or folded in a bag, and the only people who see it are the ones who walk in. A catalog changes who can see your shop and when.

| Claim | The reality |
|---|---|
| **Your shop never closes** | A catalog is a storefront customers open at 9 PM, on a Sunday, from their home. They look, they like, they ask. |
| **Stock on the rack is invisible** | Every photo you upload is a product a customer can actually see, browse and ask about — without standing in your shop. |
| **One link, anywhere** | Share your catalog on WhatsApp to a customer, a group, or a whole colony. One link does the work of ten salespeople. |
| **Enquiries, not just views** | Customers don't just look — they tap "Enquire" and message you directly. A catalog turns browsing into conversations. |

Close: A catalog isn't a website. It's simply your shop, online, where your customers already are — WhatsApp.

---

## 5. For Retailers — what we do (feature grid)

**H2: Everything your shop needs, on one phone.**

| Feature | What it does | Status |
|---|---|---|
| **AI Catalog Builder** | Photograph a dress → AI adds category, colour, fabric, occasion, size, and writes a short description. Catalog done in seconds. | ✅ Live |
| **AI in the background** | Click photos, add a price, save. AI tags, cleans and sets the background after — you're not blocked waiting. | ✅ Live |
| **WhatsApp Collections** | Select products → share one link. Customers browse on their phone, no app. | ✅ Live |
| **Fashion DNA CRM** | Know each customer's colour, style, budget and occasions — and search your racks with plain language ("pink cotton suit under ₹2000"). | ✅ Live (matching: Phase 1) |
| **Virtual Try-On** | Customer uploads a photo, tries an outfit on themselves. | 🔶 Coming soon |
| **Photo cleanup** | Remove backgrounds, fix lighting, ghost-mannequin fill — catalog photos that look like a big brand's. | ✅ Live |
| **Scan-to-sell** | Scan the rack tag, mark it SOLD, even offline. | ✅ Live |
| **Bulk onboarding** | Got 3,000 SKUs from a supplier? Import the PDF or shoot racks shelf-by-shelf. No typing. | ✅ Live |

---

## 6. How AI changes small businesses (editorial)

**H2: What used to take days now takes a photo.**

Lead: For years, going online meant hours of typing — every product's name, description, colour, fabric, price — or paying someone to do it. AI changes the maths for a small shop.

| Before (the old way) | After (with Kanchuki) |
|---|---|
| Hours of typing per product, or an assistant's whole day | A photo. AI writes the name, colour, fabric and description. |
| Catalog photos that look "self-made" | AI cleans the background and makes every photo look consistent, like a big brand's. |
| Customers only see what's on the rack | Every piece is visible, searchable, shareable, day and night. |
| Finding "the pink cotton suit under ₹2000" means searching the shop | One line of text — AI knows your racks. |

Close: AI isn't replacing the shopkeeper's judgement. It's taking away the typing, the photo editing, and the "which rack was that?" — so you can do what you already do best: sell clothes.

---

## 7. How It Works (3 steps)

**H2: Online tonight. Here's how.**

1. **Snap & Tag** — Photograph a dress. AI adds the details. (≈10 seconds per product)
2. **Select & Share** — Pick products, get a WhatsApp link, send it to customers.
3. **Sell More** — Customers browse, favourite, and enquire. You reply right from the app.

*(Link: see the full walkthrough on `/how-it-works`.)*

---

## 8. Store directory teaser

**H2: Shop real stores on Kanchuki.**

> Every store here is a real shop with a real owner you can message. Browse by city, or search for a specific store.

- 3–6 featured store cards (logo, shop name, city, product count) — live from the directory endpoint.
- CTA: **Explore all stores →** (`/stores`)

*Honesty rule: only visible, non-suspended stores appear. If fewer than 3 stores exist yet, show the ones that do with a "be the first" CTA instead of inventing any.*

---

## 9. Testimonials (honesty-gated)

**Rule (binding, roadmap §8.2):** no fabricated testimonials. Until real, verified retailer stories exist (name + shop + city), show one of these instead:

- **Onboarding stories** — real screenshots of a retailer's first 50 products going live (true and verifiable).
- **Live proof section** — the stats bar + store-directory teaser (real social proof without invented quotes).

**When real stories exist**, each testimonial card shows: the person, their shop, their city, and one concrete result ("uploaded 300 products in a weekend" — verifiable, not vague praise).

---

## 10. Comparison matrix

**H2: Kanchuki vs. the old way**

| | The old way | Kanchuki |
|---|---|---|
| Adding a product | Type everything by hand | Photograph it — AI writes the rest |
| Photos | Dull, inconsistent, "self-made" | Clean, consistent, professional-looking |
| Sharing with customers | WhatsApp photos one by one, lost in chats | One catalog link, always current |
| Customer details | Notebook or memory | Saved in the app, with tastes and sizes |
| Finding stock | Walk the racks | Ask the app in plain language |
| Website needed | Yes, or a marketplace cut | No — the link IS the storefront |

---

## 11. Pricing

**H2: Simple pricing. Every plan starts free for 14 days.**

| | **Starter** | **Growth** | **Pro** |
|---|---|---|---|
| Monthly | **₹999** | **₹2,499** | **₹4,999** |
| Annual (save 20%) | ₹9,999 | ₹24,999 | ₹49,999 |
| Products | 500 | 2,000 | Unlimited |
| Customers | Unlimited | Unlimited | Unlimited |
| Collection links | 50/mo | Unlimited | Unlimited |
| AI auto-tagging | ✅ | ✅ | ✅ |
| AI matching (Fashion DNA) | — | 🔶 Coming soon | 🔶 Coming soon |
| Try-ons | — | 100/mo | 500/mo |
| WhatsApp automation / multi-staff | — | — | ✅ |

- **14-day free trial · no credit card** · UPI (GPay / PhonePe / PayTM), cards, netbanking · INR only · GST invoices.
- Add-ons available: extra 100 products ₹99 · extra 100 AI tags ₹149 · extra 10 try-ons ₹99 · extra 100 photo crops/removals ₹99.
- *(Prices from `PLAN_PRICING` — single source of truth. Never hardcode different numbers.)*

CTA per plan: **Start 14-day free trial →**

---

## 12. FAQ (extended)

- **Do I need a website or an app for my customers?** No. Your catalog lives on a link they open in WhatsApp. That's the whole point.
- **How long does it take to get started?** Most shops are online the same evening. Photograph your best pieces, add prices, share the link.
- **Can I use it on an old phone?** Yes — the app and the customer pages are built to run well on budget Android phones and slow connections.
- **What about GST and billing?** Every plan comes with GST invoices. Pricing is in INR only.
- **Is my customer data safe?** Yes — customer photos and details belong to your shop, deletion is supported, and the platform follows India's data norms.
- *(Full list on `/faq`.)*

---

## 13. Final CTA

**H2: Your shop, online tonight.**

> Photograph one dress. See your catalog. Share it on WhatsApp. All within the 14-day free trial — no card needed.

- Primary CTA: **Start Free Trial**
- Secondary: **Download the app** (QR → `/app`)

---

## 14. Footer

- **Brand:** KanchukiMark · "Your store on WhatsApp, powered by AI." · आपकी दुकान, AI की ताकत · Instagram / YouTube (to create).
- **Product:** For Retailers · For Customers · How It Works · Pricing · App Download · Store Directory.
- **Company:** About · Testimonials · Contact.
- **Support/Legal:** FAQ · WhatsApp Support · Terms · Privacy · GST note.
- **Bottom bar:** © 2026 Kanchuki · Made in India 🇮🇳 · EN/हिंदी toggle (Year-1) · Terms · Privacy.

---

## Page metadata (for SEO)

- **Title:** Kanchuki — AI Catalog & WhatsApp Storefront for Indian Clothing Stores
- **Description:** Kanchuki turns photos of your dresses into an AI-written catalog, shared on WhatsApp — no website needed. 14-day free trial. Built for Indian clothing stores.
- **JSON-LD:** `Organization` + `SoftwareApplication` (retailer app).
