# Kanchuki — Play Store listing copy (paste-ready)

Companion to `docs/PLAY-STORE-LAUNCH-CHECKLIST.md` §1. Copy below is written
to the **current** feature set — no Virtual Try-On, no "Fashion DNA matching",
no showroom booking (all removed in `chore/remove-unwanted-features`). Keep it
in sync with the marketing pages (`apps/web/src/app/for-retailers`,
`how-it-works`, `pricing`).

---

## App name

```
Kanchuki
```

## Primary category

**Business** (content rating category: Business / Productivity / Tools — see checklist §4)

## Short description (max 80 chars)

```
AI photo catalog + WhatsApp collections for Indian clothing shops. No website.
```
(76 chars)

## Full description (max 4000 chars)

```
Kanchuki turns your clothing shop into an online store you run from your phone —
no website, no computer, no tech skills.

Take a photo of a dress. Kanchuki writes the catalog entry, cleans up the photo,
and gives you a link to share on WhatsApp. Your customers browse it like a real
store and message you when they want something.

WHAT THE APP DOES

- The catalog that writes itself - photograph a garment and AI fills in category,
  subtype, colour, fabric and occasion, writes a short description, suggests a
  name and generates a SKU. Edit anything it gets wrong; your picks always win.

- Photos that look like a big brand's - background removal, auto-contrast
  backdrops, ghost-mannequin fill for hollow necklines, rotate and retouch.
  No photographer needed.

- Sell on WhatsApp - pick the pieces you want to show, get a collection link,
  share it. Customers browse, favourite and tap Enquire to message you directly.
  No app for them to install.

- Your own store page - every shop gets a free storefront at its own link, with
  your shop name, logo and categories, plus a QR code you can print for the
  counter.

- Know your customers - save each customer's colour, style, budget and occasions,
  so your next WhatsApp shows them the right things.

- In-store AI search - type "pink cotton suit under 2000" and find any piece on
  your racks in seconds. Understands Hindi-transliterated terms too.

- Scan-to-sell - print the SKU + QR tag for each design. When a piece sells, scan
  the tag and it's marked SOLD, even if your internet is down. Syncs when you're
  back online.

- Offline-first - built for shops where the network is patchy. Browse your
  catalog and change a product's status; it queues up and syncs when the
  connection returns.

- Bulk onboarding - got hundreds or thousands of SKUs from a supplier? Import the
  supplier PDF/catalog, or shoot your racks shelf-by-shelf and let AI detect each
  item.

- Team logins - add staff with their own accounts so a helper can scan-to-sell or
  add products without touching your account.

BUILT FOR INDIA

- INR pricing only, UPI first (Google Pay, PhonePe, Paytm), cards and netbanking
- GST invoices for every payment
- Works on a low-cost Android phone with a patchy connection

PRICING

14-day free trial, no credit card. Plans start low and scale with your catalog
size. Subscriptions are managed on kanchuki.app/billing.

Privacy policy: https://kanchuki.app/privacy
Delete your account: https://kanchuki.app/account-deletion
Support: support@kanchuki.app
```

---

## Phone screenshots - shot list (8)

Portrait, from an EAS build on a real phone or emulator. Use a store seeded with
real-looking products (the DB is currently empty - seed a demo retailer first).

| # | Screen | Route / how to reach |
|---|--------|----------------------|
| 1 | Product catalog grid | `app/(tabs)/index.tsx` - catalog tab, ~8 products visible |
| 2 | Add product - AI tagging running in background | `app/product/add.tsx` after tapping Save (AI chip "tagging...") |
| 3 | Photo cleanup result (before/after background) | product detail -> photo controls |
| 4 | WhatsApp collection link - share sheet | collection builder -> Share |
| 5 | Customer list + preferences | `app/(tabs)/customers.tsx` -> a customer with colour/style/budget filled |
| 6 | In-store AI search result | search bar -> "pink cotton suit under 2000" |
| 7 | Scan-to-sell - tag scanned, marked SOLD | scan screen success state |
| 8 | Store page + QR code | Settings -> Store / QR |

Optional caption strip per screenshot (keep to ~4 words): "AI writes your
catalog", "Photos like a big brand", "Share on WhatsApp", "Know every customer",
"Find any piece fast", "Scan when it sells", "Your own store page".

## Feature graphic (1024 x 500 px)

Not auto-generated - `scripts/generate-brand-assets.mjs` only builds the web
favicon/icon set. Needs a design pass. Content:

- Kanchuki wordmark / logo, brand palette (see `apps/web` tokens / `COLORS` module)
- Tagline: **"Your clothing shop, online - from your phone."**
- A phone mockup showing the catalog grid or a WhatsApp collection
- No text in the outer 5% safe margin; readable as a thumbnail

## App icon

512 x 512 PNG - already in `apps/mobile` (`app.json` -> `icon` / `android.adaptiveIcon`).

---

## Owner checklist (Play Console - cannot be done from the repo)

- [ ] Paste short + full description, set category **Business**
- [ ] Capture the 8 screenshots above from the next EAS build
- [ ] Produce the 1024x500 feature graphic
- [ ] Contact details + `support@kanchuki.app`
- [ ] Content rating questionnaire (checklist §4)
