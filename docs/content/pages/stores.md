# Store Directory (`/stores`) — Page Copy

**Purpose:** The hub page listing every visible retailer storefront. Local-SEO surface: "real clothing stores on Kanchuki" + city/category discovery.
**Data:** Live from the new `GET /public/stores` endpoint (visible, non-suspended stores only). No invented stores, ever.
**Style:** Per `content-style-guide.md`.

---

## H1: Shop real clothing stores on Kanchuki.

**Lead:** Every store here is a real shop — with a real owner you can message directly. Browse by city or category, tap a store, and see their actual catalog. New stores join every week.

*(Empty-state honesty rule: if fewer than 3 stores are visible yet, show the ones that exist plus a "Be the first store on Kanchuki" CTA. Never list invented stores.)*

---

## H2: Find a store

- **Search** by shop name or city ("kurtis in Jaipur").
- **Filter by city** — tap a chip to see stores there.
- **Filter by category** — suits, sarees, lehengas, kurtis, kids wear, menswear.

---

## H2: Store cards

Each card shows:
- Store logo (or a tasteful placeholder monogram)
- Shop name
- City
- Product count ("134 products")
- **Visit store →** (opens `/store/[slug]`)

**Featured stores** (admin-curated) appear first; every visible store is listed.

---

## H2: Why shop here?

- **Real shops, real owners.** The store page shows the shop's name and city — you're dealing with a person.
- **See the actual catalog.** Not "best sellers" picked by an algorithm — the shop's real stock, photographed by the owner.
- **Message them directly.** Tap Enquire and talk to the shop on WhatsApp, the way you would in person.
- **Works on any phone.** No app, no account — just open the link.

---

## H2: Are you a store owner?

> Your shop can be here too — with your own catalog page, your own link, and your own QR code.

**Start your 14-day free trial →** (free trial, no card) · **See how it works →**

---

## H2: FAQ — store directory

- **How do stores get listed?** Every shop with a public store page appears automatically once they complete onboarding. Suspended or deleted shops are never listed.
- **Can a shop be featured?** Yes — the Kanchuki team curates featured stores (real stores, shown first). 
- **I can't find my shop.** Ask your favourite shop to join — or if you're the owner, start the free trial and your store page goes live today.

---

## Page metadata (for SEO)

- **Title:** Store Directory — Real Clothing Stores on Kanchuki
- **Description:** Browse real clothing stores on Kanchuki — suits, sarees, kurtis, lehengas and more, searchable by city and category. Message shops directly on WhatsApp.
- **JSON-LD:** `ItemList` of `ClothingStore` entries; sitemap includes `/stores` + every store URL. Each store page = long-tail local SEO ("<Shop Name> — <City> clothing store on Kanchuki").
