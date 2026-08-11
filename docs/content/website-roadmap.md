# Kanchuki Website Roadmap — Professional Marketing Site, Store Directory & Content Plan

**Status:** Planning doc. Reference spec for the public website rebuild.
**Date:** 2026-08-09
**Scope:** `apps/web` marketing pages + customer storefront + all public content (copy, images, SEO).
**Builds on:** `docs/design/emil-design.md` (Black & Gold Elegance design system, live in code), `docs/PRO-REQUIREMENTS.md` (feature inventory), `docs/PLAN.md` (product roadmap).
**Companion index:** [`./README.md`](./README.md)

---

## 1. Vision & Goal

### 1.1 Why this website exists

Today `apps/web/src/app/page.tsx` + `MarketingSections.tsx` is a capable single-page marketing site (hero, features, how-it-works, comparison, testimonials, pricing, FAQ, CTA — all framer-motion animated, live stats bar already wired). What it is **not** yet:

- **Not a multi-page site** — no dedicated For-Retailers / For-Customers / How-It-Works / Store-Directory / App pages; everything is anchor-scrolled on one page.
- **Not a store directory** — retailers' stores exist (`/store/[slug]` + `GET /public/retailers/:slug`) but are not discoverable from the homepage.
- **Not a content site** — no sitemap.ts, no blog/SEO surface beyond robots.txt, no structured data.
- **Not a real app-download page** — `/download` is a stale cyan placeholder with disabled "coming soon" store buttons (pre-Black & Gold, not wired to real builds).
- **Not reachable** — no contact page, no "how to reach us", no WhatsApp CTA link anywhere on the site.

**Goal statement (one line, used on the site):**
> Kanchuki digitizes India's clothing stores — AI turns a single photo into a sellable catalog, shared with customers on WhatsApp, no website needed.

### 1.2 What success looks like (tie to product metrics)

| Metric | Target (product MVP gate) | Site contribution |
|---|---|---|
| Retailer signups | 50 onboarded in 90 days | Homepage CTA + pricing page conversion |
| Products per retailer | ≥50 | "Why catalog matters" education → product usage |
| Collection links sent | ≥10/retailer/month | Feature education (WhatsApp share) |
| Collection link open rate | ≥40% | Store-directory SEO → more storefront visitors |
| Enquiry→order | ≥15% | Trust sections (testimonials, how it works) |
| Retention at 60 days | ≥60% | Support/contact presence ("how to reach us") |

Site-specific success metrics: **≥2% visitor→signup conversion** on the homepage CTA; **store-directory pages indexed and ranking** for "<city> <category> store near me" style queries; **all 4 public stat cards live** (not hardcoded).

### 1.3 Design direction — reuse, don't redesign

The **Black & Gold Elegance** system is live and user-approved (2026-08-03 repaint). The roadmap **extends** it — same tokens, same components, same motion discipline. No new palette, no new font pairing, no glassmorphism, no generic-AI-SaaS look. Tokens (from `docs/design/emil-design.md` §3.1):

| Token | Value | Use |
|---|---|---|
| `ink` | `#14213D` (deep navy) | primary buttons, links, active nav, brand |
| `rust` | `#FCA311` (regal gold) | hero accent, CTAs, section tags |
| `turmeric` | `#8A5A12` (antique gold) | badges, checkmarks, star fill |
| `sand` | `#E5E5E5` | borders, muted text |
| `cotton` | `#FFFFFF` | page background |
| `charcoal` | `#000000` | body text / dark sections |
| `glow` / `veil` | `#FFC94D` / `#0B1322` | decorative hero wash only |

Reusable components already in code: **kanchuki-logo.png** wordmark (replaced the interlaced-thread `KanchukiMark` logomark 2026-08-11 — `KanchukiMark.tsx` deleted), **ColorCard** (solid color-block card, renamed from `SelvedgeCard`), **Section/SectionHeader**, **AnimatedSection** (framer-motion `useInView`), **Marquee** (infinite auto-scrolling card strip), **PageHero**, **FinalCta**, **PageLoader**. New pages should compose from these — new components only where the roadmap says so.

> **Design note (updated 2026-08-11):** the marketing/content pages were repainted to the **Colabs-inspired palette** (`cream`/`carbon`/`volt`/`cobalt` + modular card chips) — see CLAUDE.md's 2026-08-11 entry. The Black & Gold tokens below remain live for the customer storefront + admin panel. If you are updating marketing pages, use the CoLab tokens in `apps/web/tailwind.config.ts`; storefront/admin work still uses `ink`/`rust`/`turmeric`/`sand`.

Motion rule (from emil-design.md §3.3 — **restraint by surface**): marketing site gets standard entrance animations (fade-up, stagger, nothing > ~400ms per element); the customer storefront keeps the highest motion budget (drape + staggered cards); admin stays near-zero. No animation on `top/left/width/height` — transform/opacity only. `backdrop-blur` only on fixed/sticky elements.

---

## 2. Feature Inventory — what we actually offer (from the .md review)

**Source of truth:** `docs/PRO-REQUIREMENTS.md` (spec) + repo CLAUDE.md "Built" entries (verified in git). **Rule: the site may only claim features listed here.** Every line below is built (✅) or explicitly planned (🔶) — no invented capabilities.

### 2.1 For Retailers (what the app does)

| # | Feature | Status | Website proof / demo angle |
|---|---|---|---|
| R1 | **AI Catalog Builder** — photo → auto-tagged product in seconds (category, subtype, color, fabric, occasion, auto SKU, auto name, auto description) | ✅ Built | Homepage hero loop: photo in → tagged product card out |
| R2 | **AI-in-background processing** — retailer clicks photos + sets price, AI does the rest after save (tagging + cleanup + auto-contrast background) | ✅ Built (F-028 flow rework) | "Shoot & save, AI in the background" section |
| R3 | **WhatsApp Collections** — select products → shareable link → customers browse on mobile web, no app, no website | ✅ Built | Core How-It-Works step 2; product-detail share button |
| R4 | **Fashion DNA CRM** — customer preference capture (color, style, budget, occasion) + in-store AI search ("pink cotton suit under ₹2000") | ✅ Built (CRM + search); DNA matching Phase 1 🔶 | Feature grid card |
| R5 | **Virtual Try-On** — customer uploads photo, tries outfit; self-hosted V-Tone engine live on Hetzner (CPU ~30 min/run) | 🔶 Engine live; customer-facing rollout pending | "Coming soon" honesty on site; demo button when shipped |
| R6 | **Bulk onboarding** — rack/shelf batch-photo capture, supplier PDF/catalog import, 500–3000+ SKUs; 500-item free catalog-upload promo for all retailers (limited time) | ✅ Built | "Digitize 3,000 SKUs without typing" section |
| R7 | **Ghost-mannequin photo cleanup** — local AI fills backdrop gaps, background removal, portrait blur, product photo quality pipeline | ✅ Built | Image-enhancement section (before/after slider) |
| R8 | **Photo tools** — rotate (pre-save + post-save), background library + post-save background picker, auto-contrast background by garment tone | ✅ Built (F-029, F-028) | Product-detail UX screenshots |
| R9 | **Scan-to-sell** — barcode/QR scan of SKU tag → mark SOLD offline, mutation queue replays on reconnect | ✅ Built | Retailer workflow section |
| R10 | **Store QR + store link** — auto store URL from shop name, QR generate/delete, share storefront | ✅ Built | Store-directory tie-in |
| R11 | **Offline-first PWA** — catalog browsing works with poor connectivity (service worker + offline mutation queue) | ✅ Built | Reliability bullet |
| R12 | **Team & staff** — multi-staff access, field agents, catalog-upload service with delegated access | ✅ Built | Pro-plan feature |
| R13 | **Sizes, categories, inventory** — S/M–XXXL, rack/shelf location, SOLD/reserved states, categories auto-assigned by AI | ✅ Built | Feature bullets |
| R14 | **Subscriptions & billing** — Razorpay, UPI, INR only, 14-day free trial, addon packs | ✅ Built | Pricing page |
| R15 | **GST invoicing** — legal compliance baked in | ✅ Built | Trust/credibility section |
| R16 | **Checkout (L2)** — cart → address → pay direct-to-retailer Razorpay (retailer connects own account; Kanchuki never custodies money) | ✅ Built (Stage A) | Customer side; retailer enablement |

### 2.2 For Customers (what shoppers get on the storefront)

| # | Feature | Status |
|---|---|---|
| C1 | Browse retailer's full catalog on mobile web (no app download) | ✅ Built |
| C2 | Product detail — photos, sizes, price, AI-written summary + product info, related items | ✅ Built |
| C3 | Favorites (heart), WhatsApp enquiry, **Buy Now / Select / Enquire** 3-button bar | ✅ Built |
| C4 | Cart + checkout (where retailer has connected payments) | ✅ Built |
| C5 | Category/shop-by filters with live counts (New Arrivals, Sale computed at query time) | ✅ Built |
| C6 | Virtual Try-On | 🔶 pending rollout |
| C7 | Works offline (cached catalog) | ✅ Built |

### 2.3 Platform-level trust features (site can cite)

- Admin Control Center: plan feature matrix, activity tracking, account suspension, deletion vault, DB guardrails (F-013…F-017) — **data safety/security story** for the trust section.
- AI provider registry (F-023): tagging never stops when one provider's credits run out — reliability story.
- R2 image pipeline: every stored image ≤80KB, quality-first — performance story (fast storefronts on cheap phones).
- Redis public-response cache for storefronts — "handles viral WhatsApp traffic" story.

### 2.4 Pricing (from `packages/shared/src/constants/index.ts` — single source of truth)

| Plan | Monthly | Annual (save 20%) | Positioning |
|---|---|---|---|
| **Starter** | ₹999 | ₹9,999 | Single shop, 500 products, 200 customers, 50 collection links/mo, AI auto-tagging |
| **Growth** | ₹2,499 | ₹24,999 | 2,000 products, 1,000 customers, unlimited links, AI matching, 100 try-ons/mo |
| **Pro** | ₹4,999 | ₹49,999 | Unlimited products/customers, WhatsApp automation, 500 try-ons/mo, multi-staff |

- 14-day free trial, no credit card. UPI (GPay/PhonePe/PayTM) + cards + netbanking. INR only.
- Addons: extra 100 products ₹99, extra 100 AI tags ₹149, extra 10 try-ons ₹99, extra 100 crops/removals ₹99, extra 1,000 API calls ₹99 (from `ADDON_PRICING`).
- The site's pricing section currently hardcodes the plan feature lists in `MarketingSections.tsx` but pulls prices from `PLAN_PRICING` — keep that pattern; consider pulling plan *limits* from `PLAN_LIMITS` too when a public endpoint exists.

---

## 3. Site Architecture — pages, navigation, footer

### 3.1 Site map (target state)

```
/                          Homepage (sections per §4)
├── /for-retailers         What we do for retailers (feature deep-dive, R1–R16)
├── /for-customers         What shoppers get (C1–C7) + "how to browse a store"
├── /how-it-works          3-step explainer + app screenshots + "how the app works" (§6)
├── /pricing               Plans, trial, addons, FAQ-specific pricing questions
├── /stores                ★ Store directory — list of retailer storefronts (§5)
│   └── /store/[slug]      (exists — retailer storefront, indexed)
├── /app                   ★ App download page — QR codes (§6)
├── /about                 Founder story (etymology + real story — §8.4 honesty rule)
├── /testimonials          Real retailer stories (gate per §8.2)
├── /faq                   FAQ (extend existing)
├── /contact               ★ "How to reach us" — WhatsApp, email, form (§7)
├── /terms, /privacy       (exist)
└── /blog                  (Phase 2+ — SEO/content surface, §9)
```

### 3.2 Primary navigation (header)

Nav items (max 6, matching the Black & Gold floating header pattern already in `page.tsx`):

| Order | Label | Href | Notes |
|---|---|---|---|
| 1 | For Retailers | `/for-retailers` | Primary audience — first |
| 2 | For Customers | `/for-customers` | Secondary audience |
| 3 | How It Works | `/how-it-works` | + anchor `#how-it-works` on homepage keeps working |
| 4 | Pricing | `/pricing` | Keep `#pricing` anchor too |
| 5 | Stores | `/stores` | ★ directory — new |
| 6 | FAQ | `/faq` | |

**Header right side:** "Sign In" (retailer login — keep existing) + primary CTA **"Start Free Trial"** → `/pricing#signup` (or the app download for retailers). Mobile: hamburger → full-screen glass overlay with staggered link reveal (fits Black & Gold; the current simple slide-down menu is the upgrade target).

Anchor-compat rule: existing inbound links (`#features`, `#how-it-works`, `#pricing`, `#faq`, `#cta`) from WhatsApp collection pages / old shares must keep working — implement as: homepage keeps those `id`s; sub-pages have their own sections.

### 3.3 Footer (final, Black & Gold styling)

4 columns + bottom bar:

- **Brand:** kanchuki-logo.png wordmark + one-line mission + Hindi tagline ("आपकी दुकान, AI की ताकत") + social icons (Instagram/YouTube — to create).
- **Product:** For Retailers, For Customers, How It Works, Pricing, App Download, Store Directory.
- **Company:** About (founder story), Testimonials, Blog (when live), Contact, Careers (later).
- **Support/Legal:** FAQ, Help/Support (WhatsApp link), Terms, Privacy, GST note.
- **Bottom bar:** © 2026 Kanchuki · Made in India 🇮🇳 · language toggle (EN/हिंदी — Year-1 requirement) · links to `/terms` `/privacy`.

---

## 4. Homepage — section-by-section spec

One page, hero → CTA, all sections animated with the existing `fadeUp`/`stagger`/`drape` vocabulary. Order is conversion-optimized: **prove (stats) → educate (why catalog) → show (features/how) → convince (testimonials) → price → act (CTA)**.

| # | Section | Content | Data source | Animation |
|---|---|---|---|---|
| 1 | **Navbar** | §3.2 | static | scroll-aware (exists) |
| 2 | **Hero** | Headline: "Your store on WhatsApp. Powered by AI." + Hindi line + sub (photo → auto-tagged catalog → share link) + 2 CTAs (Start Free Trial / See How It Works) + trust row (14-day trial · no card · no website) | static | drape (exists) |
| 3 | **Live stats bar** ★ upgrade | Real counts: retailers, products, collections, **this-month enquiries** (already in `GET /public/stats` + `StatsBar`) + add **collection views** counter (exists in DB as `collection_views`) | **live API** (extend `/public/stats` with views) | count-up on inView |
| 4 | **Why a catalog matters** ★ new | "Why catalog is important for retailers" — editorial: a catalog is the storefront customers see at 9 PM; stock on the rack is invisible; catalog = 24×7 selling. 3–4 stat-backed claims (open rate ≥40%, enquiry conversion, WhatsApp reach without website) | static + real metrics when available | fade-up cards |
| 5 | **For Retailers — what we do** | R1–R9 highlights as feature grid (existing `FeaturesSection` upgraded): AI Catalog Builder, WhatsApp Collections, Fashion DNA CRM, In-Store AI Search, Virtual Try-On (badged Coming Soon), Photo Cleanup (before/after image) | static | stagger (exists) |
| 6 | **How AI changes small businesses** ★ new | Editorial section: AI = the shop that never closes; a photo becomes a product page in seconds vs. hours of typing; AI tagging, auto-background, ghost-mannequin cleanup = catalog that looks like a big brand's, built by a one-person shop; AI search = a salesperson who knows every rack. 3 "before/after" mini-cards | static | parallax-ish fade (transform only) |
| 7 | **How It Works** | 3 steps (Snap & Tag → Select & Share → Sell More) — exists, keep; add link to `/how-it-works` deep page | static | exists |
| 8 | **Store directory teaser** ★ new | "Shop real stores on Kanchuki" — live preview cards of 3–6 featured stores (logo, shop name, city, product count) → `/stores` | **live API** (new directory endpoint §5) | stagger card reveal |
| 9 | **Testimonials** | 3–6 real retailer stories — **only real, verified ones** (§8.2 gate). Until 3 exist: replace with "Onboarding stories" (real staff-upload screenshots) or "What retailers say" placeholder section clearly marked as launching | CMS/admin (new §10) | existing |
| 10 | **Comparison matrix** | Kanchuki vs "old way" (manual photos + notebook vs AI catalog) — exists, refresh copy | static | exists |
| 11 | **Pricing** | 3 plans + monthly/annual toggle + 14-day trial banner + addon teaser; CTA per plan | `PLAN_PRICING` (exists) | exists |
| 12 | **FAQ** | exists — extend with catalog/WhatsApp/stores questions | static | exists |
| 13 | **Final CTA** | "Your shop, online tonight." + Start Free Trial + Download App (QR → `/app`) | static | drape |
| 14 | **Footer** | §3.3 | static | — |

---

## 5. ★ Store Directory — listing retailer stores on the frontend

### 5.1 What exists today

- Storefront per retailer: `GET /public/retailers/:slug` (+ categories, category products) — **already public, unauthenticated, cached 60s**.
- Web storefront pages: `/store/[slug]/categories/...` — already indexable (robots allows `/store/*`).
- Live stats: `GET /public/stats` returns `total_retailers`, `total_products`, `total_collections`, `enquiries_this_month`.

### 5.2 What's missing (the build)

1. **New public endpoint** `GET /public/stores` (directory list):
   - Query: retailers with `deleted_at = null`, `public_slug` set, `onboarding_completed = true`, and **not suspended** (F-015) — reuse the same "visible storefront" filter `public-retailers.ts` already applies.
   - Optional `?city=` / `?category=` filters (category via a join on their categories/products).
   - Return per store: `slug`, `shop_name`, `city`, `logo_url`, `banner_url`, `product_count`, `featured` (admin-flag, §10), paginated.
   - Wrap in the existing `withPublicCache()` (Redis public cache — already built, 60s TTL).
   - **No new DB schema needed** — all fields exist.
2. **New page** `apps/web/src/app/stores/page.tsx`:
   - Search box (by shop name/city), city filter chips, category filter chips.
   - Grid of store cards (ColorCard): logo, shop name, city, product count, "Visit store →".
   - Empty state ("Be the first store on Kanchuki") + CTA for retailers.
   - **SEO**: server-rendered; each store card links to `/store/[slug]`; static metadata; `generateStaticParams`-style caching where possible.
3. **Homepage teaser** (§4 #8) — top 6 stores via the same endpoint.
4. **Opt-in/feature flag (admin)**: `admin` can feature stores (reuse admin settings or a new `featured` flag on a public-store listing — decide in §10). Directory lists *all* visible stores by default; `featured` only affects ordering and the homepage teaser. (Consider retailer opt-in later via settings — roadmap note, not MVP of this phase.)

### 5.3 SEO value

Each `/store/[slug]` is a local-SEO landing page ("Kanchuki store — <Shop Name>, <City>"). The directory is the hub. This is the site's highest-leverage organic channel: it converts WhatsApp-shared links (high intent) into indexable, long-tail local pages. Sitemap (§9) must include `/stores` + all store URLs.

---

## 6. ★ App Download Page (`/app`) + "How the app works"

### 6.1 Current state (broken)

`apps/web/src/app/download/page.tsx` is a **stale pre-Black & Gold placeholder**: cyan styling, "Early access — launching soon" badge, disabled greyed-out store buttons, a fake email-capture form that only simulates submission. It contradicts reality (app is built, distributed via EAS internal APK).

### 6.2 Rebuild spec

Route: `/app` (keep `/download` as a redirect or re-point nav). Sections:

1. **Hero:** "The Kanchuki Retailer App" + sub (shoot → AI tags → share on WhatsApp) + platform badges.
2. **★ Download QR codes:** a **QR code that opens the app** (not an image of the app icon). What we can do today:
   - Android: distribute the current EAS internal APK via an install link + QR (e.g., Expo Updates URL or a hosted APK link) — real, works now.
   - Play Store / App Store: **not yet live** (EAS `distribution: internal`, `buildType: apk`; no public listing). The page must show the Android QR + a "iOS & Play Store — coming soon" honest badge (or an email waitlist that actually writes somewhere — see §7 contact).
   - QR generation: server-side or build-time via a small lib; the QR links to the direct install URL. No third-party dependency needed (e.g., `qrcode` npm package or the same lib used by `Print Tag` in the mobile app — `react-native-qrcode-svg` is RN-side; web should use a small JS QR lib).
3. **"How the app works"** — the app-flow explainer (this is the "how our App works" ask): 4 steps with phone-frame screenshots — (1) Add products: photo or bulk import, AI auto-tags everything; (2) Manage: catalog, racks, sizes, prices, SOLD states, scan-to-sell; (3) Share: WhatsApp collections + store QR; (4) Grow: customers, favourites, enquiries, Fashion DNA. Each step = existing app screenshots (real UI, not mockups).
4. **CTAs:** "Download for Android" (QR + link), "Start Free Trial", "See it in action" → how-it-works.

---

## 7. ★ Contact / "How to reach us" (`/contact`)

Today there is **no contact surface at all** — the biggest trust gap on the site. Build:

1. **Primary:** WhatsApp (the product's own channel) — a `https://wa.me/<business-number>` button (constant, or admin-managed via the existing admin-settings key-value store). "WhatsApp us — we reply in business hours (10 AM–7 PM IST)".
2. **Email:** support@kanchuki.app (decide the real address; admin-managed).
3. **Form:** name + shop/city + message → **real backend**, not a simulated submit. Cheapest real option: POST to the API and store as a `SupportTicket`/enquiry (reuse existing infra — team members already handle tickets; or an `enquiries` row the admin panel lists). Do NOT ship another fake form like `/download`'s.
4. **Footer/header links:** contact in footer column + "Support" link in FAQ.
5. Admin integration: contact-submissions surface in the existing admin (activity feed or a new admin route) so nobody misses a lead.

---

## 8. Content plan & honest-copy rules

### 8.1 Copy principles

- **Show, don't claim:** every feature section pairs with a real screenshot / before-after image (photo-cleanup before/after, tagged-product card, WhatsApp link flow). No generic stock fashion photography on the hero (emil-design.md §3.9).
- **Numbers from the product:** stats are live API values, never hardcoded fakes. Pricing from `PLAN_PRICING`. If a number is a target (e.g., "≥40% open rate"), label it as a metric, not a claim.
- **Hindi companion** for hero + key CTAs (Year-1 constraint; already in the hero tagline).
- **Indian retail register:** plain, respectful, non-jargony English; Hindi where it helps ("dukaan", "khata" references OK in copy, not decoration).

### 8.2 Testimonials — the honesty gate (binding)

Per emil-design.md §2.5 and the project's honest-copy discipline: **no fabricated testimonials, no invented founder story, no fake logos**. Options until real ones exist:

1. **Real, verified** retailer testimonials (name + shop + city + photo of the person/store, collected via the team or the app's own success signals — e.g., a retailer who re-shares their store link). **Needs the real 50-retailer cohort** — earliest honest source.
2. **Onboarding stories** (real): screenshots of staff helping a retailer upload their first 50 products — true, verifiable, no invented quotes.
3. If neither exists yet: ship the homepage **without** a testimonials section rather than with fake ones; replace with the live stats bar + store-directory teaser (real social proof).

### 8.3 Imagery plan

- **Product photography** (real, from real stores): natural/window light, visible drape & texture. Source: the platform's own catalogs (with retailer permission) — genuine and self-reinforcing.
- **App screenshots:** real UI at real sizes, in the Black & Gold palette. Every feature section gets one.
- **Photo-cleanup before/after:** real R2 outputs from the admin photo-cleanup tool.
- **Icons:** thin-line (1.5px stroke) to match the Loom/Black & Gold vocabulary (emil-design.md §3.7).
- **Hero imagery:** consider a subtle woven-texture/gold-glow treatment (already in the hero CSS) + a live storefront mockup rather than stock.

### 8.4 About page (real story only)

`/about` per emil-design.md §2.5: lead with the etymology (kanchuki = the tailored bodice worn under a saree/ghagra → fitting technology to a garment trade about precise fit). **The founder story must be supplied by the user** — never invented. Build the page structure now; fill narrative when the user provides it.

---

## 9. SEO roadmap

| # | Item | Detail |
|---|---|---|
| 1 | **sitemap.ts** (missing) | `apps/web/src/app/sitemap.ts`: `/`, all marketing pages, `/stores` (dynamic — query the directory endpoint), all store URLs. `robots.ts` already exists and allows `/store/*`. |
| 2 | **Per-page metadata** | Each page gets its own title/description/OG (extend the layout's metadata pattern; note the repo's plain-title convention — pages append " | Kanchuki" manually). |
| 3 | **Structured data (JSON-LD)** | `Organization` + `SoftwareApplication` (retailer app) on homepage; `Product`/`Store` (`LocalBusiness`-style) on store pages (careful: stores are retail stores, markup as `ClothingStore`); `FAQPage` on /faq; `BreadcrumbList` on deep pages. |
| 4 | **Local SEO via store pages** | Each `/store/[slug]` = "<Shop Name> — <City> clothing store on Kanchuki" → long-tail city queries. Directory is the hub page linking to all. |
| 5 | **OG/Twitter cards per page** | Already have og-image.png; add per-page images (store pages could use the store banner). |
| 6 | **Core Web Vitals budget** | Keep the ≤80KB image pipeline, Redis-cached public API, no blur on scrolling content. Directory pages: server-render, paginate, lazy-load below-fold images. |
| 7 | **Blog (Phase 2+)** | "AI for Indian small retail" editorial: how AI changes small businesses (the §4 #6 section deserves long-form versions), catalog-importance guides, success stories. Each post internally links to `/stores` + `/pricing`. |
| 8 | **Measurement** | GA4 or Plausible (decide; privacy-friendly preferred given the platform's data stance) + Search Console. Query params stripped from analytics (collection links carry UTM). |

---

## 10. Admin integration (what's manageable from the admin panel)

| Content | Today | Roadmap |
|---|---|---|
| Brand colors/theme | ✅ admin-editable (theme settings → live on web+mobile) | keep |
| Live stats | ✅ API `/public/stats` | add collection-views counter |
| **Featured stores** (homepage teaser + directory ordering) | — | admin toggles per retailer in the existing retailers list/detail, or a new `featured_stores` admin page |
| **Testimonials** | — | new admin page: add/verify/hide testimonials (name, shop, city, quote, photo, verified-flag). Content only appears if verified=true |
| **Contact submissions** | — | contact form → new rows → admin activity/support feed |
| **App download links** | — | admin-managed install URL + QR target in admin settings (so a new build doesn't need a website deploy) |
| **Announcements/promo banner** | — | optional: reuse admin-settings KV store for a top-of-site banner ("500-item free catalog upload — limited time" is a live promo today that the homepage could display) |
| Blog (Phase 2+) | — | admin CMS (simple) or markdown-in-repo |

Admin panel styling stays motion-restrained per design system (§3.3) — these are plain CRUD pages.

---

## 11. Phased build plan

Ordered so each phase is shippable and demoable. **Deploy order: API → web** (new endpoints before pages that call them).

### Phase A — Foundation (content + infra, no new design)
1. `/contact` (real backend submission → admin feed) + WhatsApp/email links in footer. **[unblocks trust]**
2. Extend `/public/stats` with `total_collection_views` (+ keep old fields).
3. `sitemap.ts` for existing pages.
4. Fix `/download` staleness: at minimum honest status + correct styling (full rebuild is Phase E).

### Phase B — Multi-page expansion
1. `/for-retailers`, `/for-customers` (content from §2 tables; real screenshots).
2. `/how-it-works` deep page (3 steps + app-flow screenshots).
3. `/pricing` (from `PLAN_PRICING` + `PLAN_LIMITS`), `/faq` (extend), keep anchors working.
4. Nav + footer rebuilt to §3.2/§3.3.

### Phase C — Store directory (★ flagship)
1. `GET /public/stores` endpoint (cached, paginated, filters).
2. `/stores` page (search + filters + store cards) + homepage teaser (§4 #8).
3. Sitemap includes all store URLs; JSON-LD on store pages.

### Phase D — Social proof
1. Testimonials admin page + homepage section (populated per §8.2 gate).
2. Live stats bar upgrade (views counter) + "How AI changes small businesses" editorial section + "Why catalog matters" section.

### Phase E — App download page
1. `/app` rebuild: Android QR → real install link; honest iOS/Play "coming soon"; "How the app works" with real screenshots.
2. Admin-managed download URL.

### Phase F — Launch polish
1. Analytics + Search Console + performance pass (Web Vitals budget §9.6).
2. OG cards per page, blog kickoff (first 2 posts from the §4 editorial sections).
3. Final copy edit + Hindi pass on hero/CTAs.

### Phase G — Iterate (post-launch, from data)
Blog cadence, store-directory city landing pages, retailer opt-in/feature-request flow, campaign landing pages (borrowing Option C "Studio Neon" boldness from emil-design.md's bench for one-off promos if ever wanted).

---

## 12. Open decisions (need the user)

1. **Founder story** for `/about` — supply the real narrative (page structure ready, content can't be invented).
2. **Business WhatsApp number + support email** for contact/footer.
3. **Android install distribution** for the app QR (host the EAS APK somewhere stable, or wait for Play Store).
4. **Analytics tool** choice (privacy-friendly: Plausible/Umami vs GA4).
5. **Testimonial collection** — first 3 real retailers to feature (team can gather during the 50-retailer pilot).
6. **Retailer opt-in** for the directory: list all visible stores by default, or require opt-in (privacy/commercial decision).

---

## 13. Definition of done

- [ ] All pages in §3.1 exist and render in Black & Gold (no cyan leftovers — `/download` is the known offender).
- [ ] Every claim on the site maps to a row in §2 (built ✅ or planned 🔶, never invented).
- [ ] Stats bar + directory teaser serve **live** data (no hardcoded counts).
- [ ] `sitemap.ts` + per-page metadata + JSON-LD shipped; `/stores` + `/store/*` indexed.
- [ ] No fabricated testimonials, founder story, or logos anywhere.
- [ ] Anchor links (`#features`, `#pricing`, `#cta`, `#how-it-works`) still resolve.
- [ ] Contact form writes real data an admin can see.
- [ ] App page has a real Android QR (not a dead placeholder); iOS/Play states are honest.
- [ ] Web tsc clean, API tests pass (the existing 364+ suite incl. new `/public/stores` tests), and the new endpoints wrapped in the public cache.
