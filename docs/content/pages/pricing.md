# Pricing (`/pricing`) — Page Copy

**Purpose:** Convert. Show exactly what each plan costs and includes, remove every reason to hesitate (trial, no card, UPI, GST).
**Source of truth:** `PLAN_PRICING` / `PLAN_LIMITS` / `ADDON_PRICING` in `packages/shared/src/constants/index.ts` — never hardcode different numbers.
**Style:** Per `content-style-guide.md`.

---

## H1: Simple pricing for a clothing shop.

**Lead:** Three plans, one app, no surprises. Every plan starts with a **14-day free trial — no credit card**. Prices in INR, GST invoices included, pay by UPI, card, or netbanking.

---

## H2: Choose your plan

| | **Starter** | **Growth** | **Pro** |
|---|---|---|---|
| **Monthly** | **₹999** | **₹2,499** | **₹4,999** |
| **Annual (save 20%)** | ₹9,999 | ₹24,999 | ₹49,999 |
| **Products** | 500 | 2,000 | Unlimited |
| **Customers** | Unlimited | Unlimited | Unlimited |
| **Collection links** | 50 / month | Unlimited | Unlimited |
| **AI photo tagging** | ✅ | ✅ | ✅ |
| **AI photo cleanup & backgrounds** | ✅ | ✅ | ✅ |
| **Store page + QR code** | ✅ | ✅ | ✅ |
| **Offline mode** | ✅ | ✅ | ✅ |
| **AI search ("pink suit under ₹2000")** | ✅ | ✅ | ✅ |
| **Fashion DNA (customer preferences)** | ✅ | ✅ | ✅ |
| **AI matching & recommendations** | — | 🔶 Coming soon | 🔶 Coming soon |
| **Try-ons** | — | 100 / month | 500 / month |
| **WhatsApp automation** | — | — | ✅ |
| **Multi-staff logins** | — | — | ✅ |
| **Bulk onboarding (PDF / racks)** | — | ✅ | ✅ |

**Best for:**
- **Starter** — a single shop starting its first catalog. Grow into more as the catalog grows.
- **Growth** — a shop with a serious catalog, regular WhatsApp selling, and customer preferences.
- **Pro** — busy multi-staff shops that want WhatsApp automation and unlimited everything.

---

## H2: Every plan includes

- 14-day free trial, no credit card.
- GST invoices, INR only.
- UPI (GPay / PhonePe / PayTM), cards, netbanking.
- Your data stays yours — deletion supported, platform follows India's data norms.
- Support via WhatsApp (business hours) and email.

---

## H2: Add-ons (only if you need more)

| Add-on | Price |
|---|---|
| Extra 100 products | ₹99 |
| Extra 500 products | ₹399 |
| Extra 100 AI tags | ₹149 |
| Extra 500 AI tags | ₹599 |
| Extra 10 try-ons | ₹99 |
| Extra 50 try-ons | ₹399 |
| Extra 100 photo crops / background removals | ₹99 |
| Extra 1,000 API calls | ₹99 |

*(For shops on a plan who hit a limit in a busy month — buy more without changing plans.)*

---

## H2: Compare: what you'd pay the old way

| | Old way | Kanchuki |
|---|---|---|
| Catalog photos | Photographer + editor, ₹2,000–5,000 per shoot | Included (AI cleanup) |
| Writing product descriptions | Hours of typing or a hired assistant | Included (AI writes them) |
| A website | ₹10,000–50,000 + maintenance | Included (your store page + WhatsApp links) |
| Monthly cost | Easily ₹2,000+ with no results yet | From ₹999, results the same week |

---

## H2: FAQ — pricing

- **Is there really no credit card for the trial?** Correct. Start free, and only pay when you're sure it works for your shop.
- **Can I switch plans later?** Yes — upgrade or downgrade anytime. Annual plans get 20% off.
- **What happens when I hit a product limit?** You can buy an add-on pack for that month, or upgrade the plan. Nothing gets deleted.
- **Is GST added on top?** Prices include GST invoicing — you get proper invoices for every payment.
- **Do you offer a discount for the first year?** Annual billing gives 20% off automatically.

---

## Final CTA

> Start with the shop in front of you — photograph your best 10 dresses on the free trial and see the catalog tonight.

**Start 14-day free trial →** · **Talk to us on WhatsApp →**

---

## Page metadata (for SEO)

- **Title:** Pricing — ₹999/mo for Indian Clothing Stores | Kanchuki
- **Description:** Kanchuki plans from ₹999/month — AI photo catalog, WhatsApp collections, store page. 14-day free trial, no credit card. UPI, GST invoices, INR only.
- **JSON-LD:** `Product`/`Offer` markup per plan (or `FAQPage` for the pricing FAQ).
