# Kanchuki — retailer bug list progress (2026-07-16)

Source: user's 8-item bug/feature list (product detail, collections, QR, etc).

## Done

**#1 — Collections list: no edit/delete buttons** ✅ FIXED & COMMITTED
- Backend: Added `PATCH /v1/collections/:id` route (title + expires_days) in `apps/api/src/routes/collections.ts`
- Mobile API: Added `collectionApi.update()` (PATCH) and `collectionApi.delete()` (DELETE) in `apps/mobile/src/lib/api.ts`
- Collections list: Rewrote `apps/mobile/app/(tabs)/collections.tsx` with edit modal (title + expiry), delete button with confirmation, and inline edit/delete icons on each card
- Collection detail: Rewrote `apps/mobile/app/collection/[id].tsx` with header edit/delete buttons + same edit modal

**#2 — Product detail main image cutoff top/bottom** ✅ FIXED
- `apps/mobile/app/product/[id].tsx` carousel image: changed `contentFit="cover"` → `contentFit="contain"` on line 582 so the full image is visible without cropping

**#3 — Crop & Remove Background "Something went wrong"** ✅ FIXED (previously committed `6d3a748`)

**#4 — Delete product "Something went wrong" (dev error visibility)** ✅ FIXED
- `apps/api/src/plugins/error-handler.ts`: Added `NODE_ENV === 'development'` gate that passes the real error message + stack trace in the 500 response instead of the generic "Something went wrong"

**#5 — Add color variant: photo preview black screen + no AI color detect** ✅ FIXED
- Black screen: `apps/mobile/app/product/[id]/add-color.tsx` — changed `className="flex-1"` to `style={{ width: '100%', height: '100%' }}` on the preview Image
- AI color detect: Added `POST /v1/products/detect-color` backend endpoint using Claude Haiku (cheap, fast). Added `detectColor()` export to `packages/ai/src/tagger.ts`. Integrated into add-color screen: auto-uploads photo + detects color in background, pre-fills the color field

**#6 — "New Arrivals" auto-tag, 30-day auto-expiry** ✅ BUILT
- No cron/migration needed — derived flag from `product.created_at >= now() - 30 days`, computed at query time
- Backend: Added `is_new_arrival` to product list response (`apps/api/src/routes/products.ts`), search results (`apps/api/src/routes/search.ts`), and a query filter `?is_new_arrival=true`
- Mobile: Added "New Arrivals (30d)" filter chip in catalog filter panel (`apps/mobile/app/(tabs)/catalog.tsx`), wired to the query param

**#7 — Collection share link uses LAN IP, not hyperlinked** 🔄 CONFIG ISSUE
- Root cause: `WEB_URL` in `.env` is `http://192.168.1.4:3000` (LAN IP)
- The code already correctly reads `WEB_URL` — needs a public-reachable URL (tunnel or deploy)
- Also affects #8's QR code profile URLs
- **Action needed:** Set up a tunnel (ngrok/devtunnels) or deploy `apps/web` publicly, then update `WEB_URL`

**#8 — Store QR code not generated + no JPG/PNG download** ✅ PARTIALLY FIXED
- QR generation was already working (confirmed in code review) — relied on same `WEB_URL` config as #7
- Added QR image export: `apps/mobile/app/store-profile.tsx` — uses `react-native-qrcode-svg`'s `getRef().toDataURL()` to capture the QR as base64 PNG, saves to cache via `expo-file-system`, then shares via OS share sheet. No JPG-specific export (PNG-only from SVG)
- JPG/PDF export not added — PNG via share sheet covers the save-to-gallery use case without needing additional dependencies

## Environment notes
- `apps/api/.env` → `WEB_URL="http://192.168.1.4:3000"` — root cause of #7/#8.
- For #7 resolution: use `ngrok http 3001` or devtunnels to get a public HTTPS URL, then update `WEB_URL`

---

# 2026-07-24 — Collection perf + WhatsApp-commerce architecture decision

## Done
**Server-side pagination + thin product fields** ✅ SHIPPED
- `/public/collections/:slug` and `/retailers/:slug/categories/:categoryId` now paginate (page/pageSize) and filter (category/occasion/price/color) at the DB level instead of shipping every product's full photo/spin-frame/variant arrays on every load
- New `GET /public/products/:productId` fetches full detail (photos, spin frames, variants, tags) only when a customer opens a product
- New shared `PublicProduct` (thin, grid) vs `PublicProductDetail` (full) types in `packages/shared`
- 360° spin: added a "View 360°" icon below the photo slider that opens a fullscreen overlay (close button) — kept the existing spin-as-last-slide behavior too, per user choice
- Product grid paginated client UI (Prev/Next, 12/page)

## Known gap (flagged, not fixed yet)
**"Enquire about N items" can miss favorited products from unvisited pages.** Root cause: favorites are stored as bare product IDs (`lib/wishlist.ts`); the enquiry message resolves name/price from a session-only cache of fetched pages. A product favorited on a grid page never re-fetched this session won't resolve.
**Planned fix (not yet built):** store a small product summary (id, name, price_min, price_max, category) in the wishlist instead of a bare id — resolved at heart-click time from data already in hand (`ProductCard`/`ProductDetailSheet` both hold the full summary object). Net deletion of the current session-cache workaround, not just a patch. See `docs/PRO-REQUIREMENTS.md` F-006 acceptance criteria.

## Decision: WhatsApp-as-commerce architecture
User wants to offer a paid "ecommerce" tier on top of the existing WhatsApp catalog-link flow: customer adds a product to cart, fills address, pays online — money going to the *retailer*, not Kanchuki.

**Key finding:** WhatsApp itself isn't a viable checkout/payment rail for a third-party SaaS platform (Meta's Catalog/Cart + WhatsApp Pay are effectively unavailable to a new platform at this stage). WhatsApp stays what it already is — a share/notify channel. Cart → address → payment happens in the existing customer PWA (`apps/web/src/app/c/[slug]`).

**Two-stage payment architecture, decided:**
1. **Stage A — Direct-to-Retailer (build first).** Each retailer connects their own Razorpay account (their own KYC). Kanchuki stores their key/secret encrypted (reuses the F-012 `encryptSecret`/`decryptSecret` AES-256-GCM helpers, new per-retailer table instead of the global `IntegrationSetting` row). Kanchuki never custodies retailer sale money → no RBI Payment Aggregator license needed.
2. **Stage B — Razorpay Route (upgrade later).** Retailer onboards via Razorpay's Linked Account (Route) instead of bringing their own account; Kanchuki's Razorpay account becomes merchant-of-record and auto-splits funds to the retailer, optionally taking a platform commission. Lower retailer friction, more setup, needs Razorpay/legal confirmation on current marketplace-payment guidance before enabling for real money.

Full design (new `Order`/`OrderItem`/`RetailerPaymentAccount` models, tier-gating via "has an active payment account", API endpoints, webhook signature verification, GST invoicing) written into `docs/PLAN.md` (Month 15–16), `docs/PRO-REQUIREMENTS.md` (F-302/F-307), `docs/DATABASE.md`, `docs/SECURITY.md`, and root `CLAUDE.md`. **Docs only — no code written yet**, pending go-ahead.

---

## Offline catalog browsing — researched, saved for later (docs only)
Checked actual state: `apps/web` has `public/manifest.json` (icon/name metadata only) but zero service worker, zero `workbox`/`next-pwa`/`serwist` dependency — the "PWA" label in `CLAUDE.md` is aspirational.

Finding: wishlist/cart offline and enquiry-send offline **already work today**, zero build needed (localStorage for the former, WhatsApp's own app-level message queueing for the latter — `handleEnquire` is a pure client `wa.me` redirect, no Kanchuki backend call in that path). Only catalog/product-detail *browsing* offline is a real gap — needs a service worker (Serwist recommended over hand-rolled Workbox or the less-maintained `next-pwa`) + Cache Storage, cache-first for photos, network-first-with-fallback for catalog JSON and page shell. Hard limit either way: offline can only serve what was already fetched once while online.

Full spec saved to `docs/PRO-REQUIREMENTS.md` F-006B. User's call: build this + the optional IndexedDB enquiry-outbox add-on (only needed if enquiries must also land in Kanchuki's own backend, not just WhatsApp) when picking the next dev phase.

## Ecommerce checkout security review — saved to docs
User asked whether the planned F-302 checkout is "hacker-proof." Answer: no absolute, but the standard mitigations are enumerable and now written into `docs/SECURITY.md` §11.6–11.10:
- Server-side amount computation (never trust a client-submitted total)
- Dual payment verification (server-side signature check + webhook, never a bare client "success" callback) with idempotent PENDING_PAYMENT→PAID transitions (replay-safe)
- Atomic conditional product reservation (`updateMany` + rowcount check) to prevent double-selling a one-off garment — this catalog has no stock-count concept, so this race is real
- Step-up OTP re-auth + out-of-band notification specifically when a retailer's connected payment account changes (compromised retailer login otherwise = attacker redirects future payouts — a new, higher-value risk this feature introduces vs. every other feature in the app)
- PCI-DSS stays at the light SAQ-A tier as long as Razorpay Checkout.js (hosted iframe) is used — never build a custom card-number field
- Anonymous order-lookup pages need a second factor (checkout phone number) beyond the order ID alone, same posture as the existing `revocation_token` bearer pattern (§3c)

Also added to `docs/PRO-REQUIREMENTS.md` F-302 acceptance criteria. Docs only, no code.
