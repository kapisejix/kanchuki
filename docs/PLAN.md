# Kanchuki — Roadmap

**Version:** 2.0 (Phase 9 shrink, 2026-09-24)
**Where we are:** Phase 0 MVP built; retailer Android app in Play Store review; pre-launch.

> Per-feature status lives in `PRO-REQUIREMENTS.md` §3; build history in `BUILD-LOG.md`; open work in `tasks/pending/`.
> The full pre-shrink roadmap (v1.1, 359 lines — month-by-month checklists, Phase S/0.5/I/II deliverables, the removed Phase 1 VTO + Fashion DNA plan) is preserved verbatim at **`references/history/superseded/PLAN-full-2026-09-24.md`**. Older citations such as "PLAN.md Phase II" resolve there.

---

## Phase overview

| Phase | Scope | Status |
|---|---|---|
| **0 — MVP** | Photo upload + AI tagging, catalog with rack/shelf location, customer preferences, WhatsApp collection links, customer mobile web, in-store AI search, bulk onboarding, settings + quotas, offline mode | ✅ built |
| **S — Security & admin control** | Backup DB, admin SQL console, audit log, deployment gates, operations center, plan feature matrix, suspension, deletion vault, DB guardrails (F-013–F-017) | ✅ built |
| **0.5 — Internal team** | Team login, territories, support-ticket routing, manager reports, staff mode in the Expo app, F-018/F-019/F-020, admin theme | ✅ built — only the 10-retailer pilot (operational) is left |
| **I — GST invoicing** | Subscription GST invoices (CGST/SGST/IGST, gap-free numbers, PDF in R2), GST reports | ✅ built for subscriptions. The original order-invoice design (HSN master, per-order ledger) died with checkout |
| **II — WhatsApp native catalog sync** | Meta Catalog API client, BullMQ sync engine, webhook, retailer settings, admin monitor | ✅ built 2026-08-18 |
| **Growth** | India Retailer Growth Engine, social publishing + composer, marketing enablement, AI Studio, customer profile P2, shopper passport, customer PWA Phase A, engagement log | ✅ built (details: PRO-REQUIREMENTS §3.3–3.5) |
| **Launch** | Play Store approval, 12-retailer pilot, launch-readiness items | 🟨 in progress — `tasks/pending/launch-readiness.md` |
| **Post-launch** | See "Next" below | 🔴 planned |
| **2 — B2B supply network** | Wholesaler catalog import, retailer→wholesaler orders, manufacturer catalog, design-popularity analytics (F-201–F-204) | 🔴 not started — only after MVP retention is proven |
| **3 — Scale** | Multi-store management (F-305), e-invoicing, Hindi UI | 🔴 not started |

> **Removed 2026-08-31** (`chore/remove-unwanted-features`, migration `082`): the old **Phase 1 "AI Core"** (Fashion DNA matching + self-hosted Virtual Try-On) and the old **Phase 3 "Full Commerce"** checkout/orders/Razorpay Route plan are gone, along with size recommendation, showroom bookings, referrals, lookbooks, 360° spin, partner network, festival backgrounds and the incentive engine. They are not on this roadmap. List: `references/history/reports/2026-08-31-feature-teardown-spec.md`.

---

## Next (post-launch, in rough priority order)

| # | Work | Spec | Gate |
|---|---|---|---|
| 1 | Launch-readiness leftovers — read replica (B-002), Sentry DSNs, verify migration `063`, real-device FB connect, first live-provider AI Studio run | `tasks/pending/launch-readiness.md` | Owner actions |
| 2 | F-035 Kanchuki-managed WhatsApp sending (Embedded Signup) | `tasks/pending/whatsapp-managed-sending.md` | Meta Business Verification + App Review (4–8 weeks) |
| 3 | F-036 Phases B–D — web push, iOS install flow, consent/mute UI | `tasks/pending/customer-pwa-push-notifications.md` | — |
| 4 | F-037 Phases 2–4 — nightly aggregation, admin + retailer behaviour dashboards | `tasks/pending/customer-engagement-analytics.md` | — |
| 5 | AI Studio — owner picks engines per style, applies migrations `104`/`105`; F-034 retailer video phase | `tasks/pending/ai-photo-generation.md` | Bench sign-off |
| 6 | AI credit packs (retailer purchase side) | `tasks/pending/ai-credit-billing-model.md` | F-034 retailer phase |
| 7 | Prorated plan upgrades (Model B) | `tasks/pending/plan-switch-prorated.md` | — |
| 8 | Multi-language UI (Hindi first) | `tasks/pending/multi-language-i18n.md` | Year-1 target |
| 9 | Coupon codes · social publishing phase 3 · ghost-mannequin (F-001e) | `tasks/pending/coupon-codes.md`, `tasks/pending/social-publishing-phase-3.md`, `tasks/pending/ghost-mannequin.md` | — |
| — | F-022 Google Business Profile auto-post | `tasks/pending/google-business-profile-autopost.md` | ⏸ blocked on Google API access |

---

## Platform scaling (cross-cutting)

Full spec: `SCALING.md`. The current stack holds MVP scale only.

| Stage | Retailers | Key work |
|---|---|---|
| **A — pre-10K** | 0–10K | Supabase pooler in `DATABASE_URL`; provision `DATABASE_URL_REPLICA`; provision the vault DB (`VAULT_DATABASE_URL`, otherwise F-016 writes skip); Redis-backed rate limiting before running >1 API instance |
| **B — 10K–100K** | aligns with Phase 2 | Railway multi-instance/autoscale; Supabase dedicated compute; Redis HA; `pg_stat_statements` monitoring |
| **C — 100K–1M** | aligns with Phase 3 | Read-replica fan-out or hot-table partitioning (`Product`, `CollectionView`, `CustomerInteraction`); edge cache for public storefront reads |

Explicitly deferred (no evidence of need): multi-region DB, sharding, separate read-model service. Gate: a load test plus a load-driven security pass before Stage B work (`SCALING.md` §5).

---

## Milestones & success gates

| Milestone | Gate | Status |
|---|---|---|
| Infrastructure ready | Deploy responds, DB seeded | ✅ |
| AI tagging working | 80 % tag accuracy on a 50-image test set | ✅ |
| Collection link live | Customer opens a link on mobile and enquires | ✅ |
| Backup + query console + deploy gates | Backup restorable from admin; read-only SQL; deploys only from GitHub `main` | ✅ |
| GST invoicing live | Every subscription payment has a GST invoice PDF | ✅ |
| WhatsApp catalog sync live | Products sync to the native WhatsApp catalog | ✅ |
| Play Store approval | Retailer app live on Play | 🟨 in review |
| MVP beta | 10–12 pilot retailers giving real feedback | 🔴 |
| MVP public | 50 paying retailers | 🔴 |
| 90-day success metrics | ≥50 products/retailer · ≥10 links sent/retailer/month · ≥40 % link open rate · ≥15 % enquiry→order · ≥60 % 60-day retention | 🔴 |
| Managed WhatsApp | 100 retailers sending through F-035 | 🔴 |
| Wholesaler beta | 5 wholesalers sharing catalogs | 🔴 |
| Regional languages | Hindi UI live | 🔴 |

---

## Risks

| Risk | Mitigation |
|---|---|
| Retailers try once and drop off | Human onboarding for the first 50 products (F-019 paid on-site upload), bulk onboarding (F-001d), guided pilot |
| WhatsApp API access or pricing change | WhatsApp behind a feature flag; collection links work without the API; MSG91 SMS always available |
| WhatsApp account ban | Never spam; per-retailer WABA (F-035) instead of one shared number |
| AI cost spike | Per-plan quotas (F-010), credit packs, cached embeddings, cheaper models for bulk |
| AI Studio output quality | Admin bench A/B before any retailer rollout; owner signs off per engine |
| Competitor replication / Jio-Reliance entry | Speed, ethnic-wear depth, Tier 2–3 focus |
| Database corruption or data loss | Backups + deletion vault; 7-year retention for GST records |
| Unauthorized deployment | Deploys only via GitHub push → Railway (`DEPLOY.md`); never `railway up` |

---

## Budget (MVP baseline, 4 months)

Hosting/provider comparison + store fees: `references/guides/hosting-and-app-store.md`.

| Category | Monthly |
|---|---|
| Infrastructure (Railway / Supabase / R2 / Cloudflare) | ₹15,000 |
| Claude API (tagging at 500 retailers × 100 products) | ₹20,000 |
| Backup database | ₹3,000 |
| Developers (2) · designer · marketing/sales | ₹2,00,000 · ₹75,000 · ₹50,000 |
| **Total** | **₹3,63,000** (₹14,52,000 over 4 months) |

**Break-even:** 37 Growth-plan retailers (₹9,999 × 37 = ₹3,69,963/month, ex-GST).

---

## Website Content Plan

Planning docs for the public marketing website (`apps/web`), the customer storefront, and all public-facing content (copy, images, SEO). Status: **Planning only** at time of writing — builds on, never replaces, the live design system (`docs/DESIGN.md`).

> Merged from the former `docs/content/` folder (`website-roadmap.md` + `pages/*.md`).

### Website Roadmap


**Status:** Planning doc. Reference spec for the public website rebuild.
**Date:** 2026-08-09
**Scope:** `apps/web` marketing pages + customer storefront + all public content (copy, images, SEO).
**Builds on:** `docs/design/emil-design.md` (Black & Gold Elegance design system, live in code), `docs/PRO-REQUIREMENTS.md` (feature inventory), `docs/PLAN.md` (product roadmap).
**Companion index:** [`./README.md`](./README.md)

---

#### 1. Vision & Goal

##### 1.1 Why this website exists

Today `apps/web/src/app/page.tsx` + `MarketingSections.tsx` is a capable single-page marketing site (hero, features, how-it-works, comparison, testimonials, pricing, FAQ, CTA — all framer-motion animated, live stats bar already wired). What it is **not** yet:

- **Not a multi-page site** — no dedicated For-Retailers / For-Customers / How-It-Works / Store-Directory / App pages; everything is anchor-scrolled on one page.
- **Not a store directory** — retailers' stores exist (`/store/[slug]` + `GET /public/retailers/:slug`) but are not discoverable from the homepage.
- **Not a content site** — no sitemap.ts, no blog/SEO surface beyond robots.txt, no structured data.
- **Not a real app-download page** — `/download` is a stale cyan placeholder with disabled "coming soon" store buttons (pre-Black & Gold, not wired to real builds).
- **Not reachable** — no contact page, no "how to reach us", no WhatsApp CTA link anywhere on the site.

**Goal statement (one line, used on the site):**
> Kanchuki digitizes India's clothing stores — AI turns a single photo into a sellable catalog, shared with customers on WhatsApp, no website needed.

##### 1.2 What success looks like (tie to product metrics)

| Metric | Target (product MVP gate) | Site contribution |
|---|---|---|
| Retailer signups | 50 onboarded in 90 days | Homepage CTA + pricing page conversion |
| Products per retailer | ≥50 | "Why catalog matters" education → product usage |
| Collection links sent | ≥10/retailer/month | Feature education (WhatsApp share) |
| Collection link open rate | ≥40% | Store-directory SEO → more storefront visitors |
| Enquiry→order | ≥15% | Trust sections (testimonials, how it works) |
| Retention at 60 days | ≥60% | Support/contact presence ("how to reach us") |

Site-specific success metrics: **≥2% visitor→signup conversion** on the homepage CTA; **store-directory pages indexed and ranking** for "<city> <category> store near me" style queries; **all 4 public stat cards live** (not hardcoded).

##### 1.3 Design direction — reuse, don't redesign

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

#### 2. Feature Inventory — what we actually offer (from the .md review)

**Source of truth:** `docs/PRO-REQUIREMENTS.md` (spec) + repo CLAUDE.md "Built" entries (verified in git). **Rule: the site may only claim features listed here.** Every line below is built (✅) or explicitly planned (🔶) — no invented capabilities.

##### 2.1 For Retailers (what the app does)

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

##### 2.2 For Customers (what shoppers get on the storefront)

| # | Feature | Status |
|---|---|---|
| C1 | Browse retailer's full catalog on mobile web (no app download) | ✅ Built |
| C2 | Product detail — photos, sizes, price, AI-written summary + product info, related items | ✅ Built |
| C3 | Favorites (heart), WhatsApp enquiry, **Buy Now / Select / Enquire** 3-button bar | ✅ Built |
| C4 | Cart + checkout (where retailer has connected payments) | ✅ Built |
| C5 | Category/shop-by filters with live counts (New Arrivals, Sale computed at query time) | ✅ Built |
| C6 | Virtual Try-On | 🔶 pending rollout |
| C7 | Works offline (cached catalog) | ✅ Built |

##### 2.3 Platform-level trust features (site can cite)

- Admin Control Center: plan feature matrix, activity tracking, account suspension, deletion vault, DB guardrails (F-013…F-017) — **data safety/security story** for the trust section.
- AI provider registry (F-023): tagging never stops when one provider's credits run out — reliability story.
- R2 image pipeline: every stored image ≤80KB, quality-first — performance story (fast storefronts on cheap phones).
- Redis public-response cache for storefronts — "handles viral WhatsApp traffic" story.

##### 2.4 Pricing (from `packages/shared/src/constants/index.ts` — single source of truth)

| Plan | Monthly | Annual (save 20%) | Positioning |
|---|---|---|---|
| **Starter** | ₹999 | ₹9,999 | Single shop, 500 products, 200 customers, 50 collection links/mo, AI auto-tagging |
| **Growth** | ₹2,499 | ₹24,999 | 2,000 products, 1,000 customers, unlimited links, AI matching, 100 try-ons/mo |
| **Pro** | ₹4,999 | ₹49,999 | Unlimited products/customers, WhatsApp automation, 500 try-ons/mo, multi-staff |

- 14-day free trial, no credit card. UPI (GPay/PhonePe/PayTM) + cards + netbanking. INR only.
- Addons: extra 100 products ₹99, extra 100 AI tags ₹149, extra 10 try-ons ₹99, extra 100 crops/removals ₹99, extra 1,000 API calls ₹99 (from `ADDON_PRICING`).
- The site's pricing section currently hardcodes the plan feature lists in `MarketingSections.tsx` but pulls prices from `PLAN_PRICING` — keep that pattern; consider pulling plan *limits* from `PLAN_LIMITS` too when a public endpoint exists.

---

#### 3. Site Architecture — pages, navigation, footer

##### 3.1 Site map (target state)

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

##### 3.2 Primary navigation (header)

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

##### 3.3 Footer (final, Black & Gold styling)

4 columns + bottom bar:

- **Brand:** kanchuki-logo.png wordmark + one-line mission + Hindi tagline ("आपकी दुकान, AI की ताकत") + social icons (Instagram/YouTube — to create).
- **Product:** For Retailers, For Customers, How It Works, Pricing, App Download, Store Directory.
- **Company:** About (founder story), Testimonials, Blog (when live), Contact, Careers (later).
- **Support/Legal:** FAQ, Help/Support (WhatsApp link), Terms, Privacy, GST note.
- **Bottom bar:** © 2026 Kanchuki · Made in India 🇮🇳 · language toggle (EN/हिंदी — Year-1 requirement) · links to `/terms` `/privacy`.

---

#### 4. Homepage — section-by-section spec

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

#### 5. ★ Store Directory — listing retailer stores on the frontend

##### 5.1 What exists today

- Storefront per retailer: `GET /public/retailers/:slug` (+ categories, category products) — **already public, unauthenticated, cached 60s**.
- Web storefront pages: `/store/[slug]/categories/...` — already indexable (robots allows `/store/*`).
- Live stats: `GET /public/stats` returns `total_retailers`, `total_products`, `total_collections`, `enquiries_this_month`.

##### 5.2 What's missing (the build)

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

##### 5.3 SEO value

Each `/store/[slug]` is a local-SEO landing page ("Kanchuki store — <Shop Name>, <City>"). The directory is the hub. This is the site's highest-leverage organic channel: it converts WhatsApp-shared links (high intent) into indexable, long-tail local pages. Sitemap (§9) must include `/stores` + all store URLs.

---

#### 6. ★ App Download Page (`/app`) + "How the app works"

##### 6.1 Current state (broken)

`apps/web/src/app/download/page.tsx` is a **stale pre-Black & Gold placeholder**: cyan styling, "Early access — launching soon" badge, disabled greyed-out store buttons, a fake email-capture form that only simulates submission. It contradicts reality (app is built, distributed via EAS internal APK).

##### 6.2 Rebuild spec

Route: `/app` (keep `/download` as a redirect or re-point nav). Sections:

1. **Hero:** "The Kanchuki Retailer App" + sub (shoot → AI tags → share on WhatsApp) + platform badges.
2. **★ Download QR codes:** a **QR code that opens the app** (not an image of the app icon). What we can do today:
   - Android: distribute the current EAS internal APK via an install link + QR (e.g., Expo Updates URL or a hosted APK link) — real, works now.
   - Play Store / App Store: **not yet live** (EAS `distribution: internal`, `buildType: apk`; no public listing). The page must show the Android QR + a "iOS & Play Store — coming soon" honest badge (or an email waitlist that actually writes somewhere — see §7 contact).
   - QR generation: server-side or build-time via a small lib; the QR links to the direct install URL. No third-party dependency needed (e.g., `qrcode` npm package or the same lib used by `Print Tag` in the mobile app — `react-native-qrcode-svg` is RN-side; web should use a small JS QR lib).
3. **"How the app works"** — the app-flow explainer (this is the "how our App works" ask): 4 steps with phone-frame screenshots — (1) Add products: photo or bulk import, AI auto-tags everything; (2) Manage: catalog, racks, sizes, prices, SOLD states, scan-to-sell; (3) Share: WhatsApp collections + store QR; (4) Grow: customers, favourites, enquiries, Fashion DNA. Each step = existing app screenshots (real UI, not mockups).
4. **CTAs:** "Download for Android" (QR + link), "Start Free Trial", "See it in action" → how-it-works.

---

#### 7. ★ Contact / "How to reach us" (`/contact`)

Today there is **no contact surface at all** — the biggest trust gap on the site. Build:

1. **Primary:** WhatsApp (the product's own channel) — a `https://wa.me/<business-number>` button (constant, or admin-managed via the existing admin-settings key-value store). "WhatsApp us — we reply in business hours (10 AM–7 PM IST)".
2. **Email:** support@kanchuki.app (decide the real address; admin-managed).
3. **Form:** name + shop/city + message → **real backend**, not a simulated submit. Cheapest real option: POST to the API and store as a `SupportTicket`/enquiry (reuse existing infra — team members already handle tickets; or an `enquiries` row the admin panel lists). Do NOT ship another fake form like `/download`'s.
4. **Footer/header links:** contact in footer column + "Support" link in FAQ.
5. Admin integration: contact-submissions surface in the existing admin (activity feed or a new admin route) so nobody misses a lead.

---

#### 8. Content plan & honest-copy rules

##### 8.1 Copy principles

- **Show, don't claim:** every feature section pairs with a real screenshot / before-after image (photo-cleanup before/after, tagged-product card, WhatsApp link flow). No generic stock fashion photography on the hero (emil-design.md §3.9).
- **Numbers from the product:** stats are live API values, never hardcoded fakes. Pricing from `PLAN_PRICING`. If a number is a target (e.g., "≥40% open rate"), label it as a metric, not a claim.
- **Hindi companion** for hero + key CTAs (Year-1 constraint; already in the hero tagline).
- **Indian retail register:** plain, respectful, non-jargony English; Hindi where it helps ("dukaan", "khata" references OK in copy, not decoration).

##### 8.2 Testimonials — the honesty gate (binding)

Per emil-design.md §2.5 and the project's honest-copy discipline: **no fabricated testimonials, no invented founder story, no fake logos**. Options until real ones exist:

1. **Real, verified** retailer testimonials (name + shop + city + photo of the person/store, collected via the team or the app's own success signals — e.g., a retailer who re-shares their store link). **Needs the real 50-retailer cohort** — earliest honest source.
2. **Onboarding stories** (real): screenshots of staff helping a retailer upload their first 50 products — true, verifiable, no invented quotes.
3. If neither exists yet: ship the homepage **without** a testimonials section rather than with fake ones; replace with the live stats bar + store-directory teaser (real social proof).

##### 8.3 Imagery plan

- **Product photography** (real, from real stores): natural/window light, visible drape & texture. Source: the platform's own catalogs (with retailer permission) — genuine and self-reinforcing.
- **App screenshots:** real UI at real sizes, in the Black & Gold palette. Every feature section gets one.
- **Photo-cleanup before/after:** real R2 outputs from the admin photo-cleanup tool.
- **Icons:** thin-line (1.5px stroke) to match the Loom/Black & Gold vocabulary (emil-design.md §3.7).
- **Hero imagery:** consider a subtle woven-texture/gold-glow treatment (already in the hero CSS) + a live storefront mockup rather than stock.

##### 8.4 About page (real story only)

`/about` per emil-design.md §2.5: lead with the etymology (kanchuki = the tailored bodice worn under a saree/ghagra → fitting technology to a garment trade about precise fit). **The founder story must be supplied by the user** — never invented. Build the page structure now; fill narrative when the user provides it.

---

#### 9. SEO roadmap

| # | Item | Detail |
|---|---|---|
| 1 | **sitemap.ts** (missing) | `apps/web/src/app/sitemap.ts`: `/`, all marketing pages, `/stores` (dynamic — query the directory endpoint), all store URLs. `robots.ts` already exists and allows `/store/*`. |
| 2 | **Per-page metadata** | Each page gets its own title/description/OG (extend the layout's metadata pattern; note the repo's plain-title convention — pages append " \| Kanchuki" manually). |
| 3 | **Structured data (JSON-LD)** | `Organization` + `SoftwareApplication` (retailer app) on homepage; `Product`/`Store` (`LocalBusiness`-style) on store pages (careful: stores are retail stores, markup as `ClothingStore`); `FAQPage` on /faq; `BreadcrumbList` on deep pages. |
| 4 | **Local SEO via store pages** | Each `/store/[slug]` = "<Shop Name> — <City> clothing store on Kanchuki" → long-tail city queries. Directory is the hub page linking to all. |
| 5 | **OG/Twitter cards per page** | Already have og-image.png; add per-page images (store pages could use the store banner). |
| 6 | **Core Web Vitals budget** | Keep the ≤80KB image pipeline, Redis-cached public API, no blur on scrolling content. Directory pages: server-render, paginate, lazy-load below-fold images. |
| 7 | **Blog (Phase 2+)** | "AI for Indian small retail" editorial: how AI changes small businesses (the §4 #6 section deserves long-form versions), catalog-importance guides, success stories. Each post internally links to `/stores` + `/pricing`. |
| 8 | **Measurement** | GA4 or Plausible (decide; privacy-friendly preferred given the platform's data stance) + Search Console. Query params stripped from analytics (collection links carry UTM). |

---

#### 10. Admin integration (what's manageable from the admin panel)

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

#### 11. Phased build plan

Ordered so each phase is shippable and demoable. **Deploy order: API → web** (new endpoints before pages that call them).

##### Phase A — Foundation (content + infra, no new design)
1. `/contact` (real backend submission → admin feed) + WhatsApp/email links in footer. **[unblocks trust]**
2. Extend `/public/stats` with `total_collection_views` (+ keep old fields).
3. `sitemap.ts` for existing pages.
4. Fix `/download` staleness: at minimum honest status + correct styling (full rebuild is Phase E).

##### Phase B — Multi-page expansion
1. `/for-retailers`, `/for-customers` (content from §2 tables; real screenshots).
2. `/how-it-works` deep page (3 steps + app-flow screenshots).
3. `/pricing` (from `PLAN_PRICING` + `PLAN_LIMITS`), `/faq` (extend), keep anchors working.
4. Nav + footer rebuilt to §3.2/§3.3.

##### Phase C — Store directory (★ flagship)
1. `GET /public/stores` endpoint (cached, paginated, filters).
2. `/stores` page (search + filters + store cards) + homepage teaser (§4 #8).
3. Sitemap includes all store URLs; JSON-LD on store pages.

##### Phase D — Social proof
1. Testimonials admin page + homepage section (populated per §8.2 gate).
2. Live stats bar upgrade (views counter) + "How AI changes small businesses" editorial section + "Why catalog matters" section.

##### Phase E — App download page
1. `/app` rebuild: Android QR → real install link; honest iOS/Play "coming soon"; "How the app works" with real screenshots.
2. Admin-managed download URL.

##### Phase F — Launch polish
1. Analytics + Search Console + performance pass (Web Vitals budget §9.6).
2. OG cards per page, blog kickoff (first 2 posts from the §4 editorial sections).
3. Final copy edit + Hindi pass on hero/CTAs.

##### Phase G — Iterate (post-launch, from data)
Blog cadence, store-directory city landing pages, retailer opt-in/feature-request flow, campaign landing pages (borrowing Option C "Studio Neon" boldness from emil-design.md's bench for one-off promos if ever wanted).

---

#### 12. Open decisions (need the user)

1. **Founder story** for `/about` — supply the real narrative (page structure ready, content can't be invented).
2. **Business WhatsApp number + support email** for contact/footer.
3. **Android install distribution** for the app QR (host the EAS APK somewhere stable, or wait for Play Store).
4. **Analytics tool** choice (privacy-friendly: Plausible/Umami vs GA4).
5. **Testimonial collection** — first 3 real retailers to feature (team can gather during the 50-retailer pilot).
6. **Retailer opt-in** for the directory: list all visible stores by default, or require opt-in (privacy/commercial decision).

---

#### 13. Definition of done

- [ ] All pages in §3.1 exist and render in Black & Gold (no cyan leftovers — `/download` is the known offender).
- [ ] Every claim on the site maps to a row in §2 (built ✅ or planned 🔶, never invented).
- [ ] Stats bar + directory teaser serve **live** data (no hardcoded counts).
- [ ] `sitemap.ts` + per-page metadata + JSON-LD shipped; `/stores` + `/store/*` indexed.
- [ ] No fabricated testimonials, founder story, or logos anywhere.
- [ ] Anchor links (`#features`, `#pricing`, `#cta`, `#how-it-works`) still resolve.
- [ ] Contact form writes real data an admin can see.
- [ ] App page has a real Android QR (not a dead placeholder); iOS/Play states are honest.
- [ ] Web tsc clean, API tests pass (the existing 364+ suite incl. new `/public/stores` tests), and the new endpoints wrapped in the public cache.

### Website Page Copy


---

#### Kanchuki Website Copy — Style & E-E-A-T Guide

> Merged from the former `docs/content/pages/content-style-guide.md`.


**Purpose:** One shared rulebook for every page in `docs/content/pages/`. Use it to write, review, and edit any website copy.
**Applies to:** All public site pages — homepage, /for-retailers, /for-customers, /how-it-works, /pricing, /stores, /app, /about, /testimonials, /faq, /contact.
**Date:** 2026-08-09

---

##### 1. What "humanized" means here

Write the way a helpful shop assistant at a busy Indian clothing store would talk — plain, warm, direct, no marketing fluff. Rules:

1. **Short sentences.** One idea per sentence. If a sentence needs a comma chain, split it.
2. **You-language.** Talk to the reader ("your shop", "your customers"), not about them ("retailers should…").
3. **Everyday words, not jargon.** Say "photo" not "asset"; "catalog" not "product information management"; "app" not "platform solution".
4. **Numbers that mean something.** "500 products" beats "large catalog". "Under ₹2,000/month" beats "affordable".
5. **Hindi companion where it helps.** The hero tagline is "आपकी दुकान, AI की ताकत". Sprinkle Hindi words only where they feel natural to an Indian retail reader (dukaan, khata, ghar baithe) — never as decoration.
6. **No hype.** No "revolutionary", "game-changing", "world-class". Say what the thing does, then let the reader decide.

---

##### 2. What E-E-A-T means for us (and how to write for it)

Google evaluates content with **Experience, Expertise, Authoritativeness, Trustworthiness**. This is how each shows up in our copy:

###### Experience (E)
> *Does the content come from real, first-hand experience?*

- Write from the **shop floor**: "You've seen it — a customer walks in at 9 PM and the good stock is in the back room. They can't see it." We live this daily; the copy should sound like it.
- Use **real store examples** from Kanchuki's own retailer cohort (with permission), never invented quotes or fake shops.

###### Expertise (E)
> *Does the author actually know the subject?*

- Only claim what the product **actually does** (see the feature inventory in `website-roadmap.md` §2 — every claim must trace to a built feature).
- Show the *mechanism*, not magic: "AI looks at your photo and adds the category, colour, fabric, and a short description automatically" — specific beats vague.
- Cite real system details where they build trust: "GST invoices, INR pricing, UPI payments" — concrete India-specific proof.

###### Authoritativeness (A)
> *Is this a source others can rely on?*

- **Live numbers over claims.** Stats come from the real `GET /public/stats` endpoint, never hardcoded fakes.
- Named references: "Razorpay", "UPI (GPay/PhonePe/PayTM)", "WhatsApp", "14-day free trial, no credit card" — recognizable, verifiable facts.
- Link to real pages (pricing, stores, app) instead of asserting.

###### Trustworthiness (T)
> *Can the reader trust us with their business and their data?*

- **Honesty gate (binding, from website-roadmap.md §8.2):** no fabricated testimonials, no invented founder story, no fake logos. Until real retailer stories exist, show live stats + the store directory instead.
- Be upfront about limits: Virtual Try-On is "coming soon"; iOS/Play Store app is "coming soon" with an honest badge; anything a feature doesn't do is not claimed.
- Give people a real way to reach a human: WhatsApp + support email on every page footer.
- Data safety: mention that customer photos belong to the store, deletion is supported, and the platform follows India's data norms.

---

##### 3. Tone by audience

| Audience | Tone | Example |
|---|---|---|
| **Retailer** (primary) | Practical, respectful, money-aware, "your shop, your stock, your customers" | "Stop retyping your catalog. Photograph it once — AI writes the description." |
| **Customer / shopper** | Warm, helpful, "browse a store like you're walking in" | "Every store on Kanchuki is a real shop you can message directly." |
| **Curious visitor / press** | Clear, specific, no fluff | "Kanchuki digitizes India's 1M+ offline clothing stores with AI photo cataloging and WhatsApp sharing." |

---

##### 4. Structure rules for every page

1. **One H1** — the page's promise. Never repeat the H1 inside the body as an H1 again.
2. **H2 sections** — each a distinct reader question ("Why does my shop need a catalog?").
3. **H3 within sections** for sub-points.
4. **Lead paragraph** under the H1: 2–3 sentences that answer "what is this page about and who is it for".
5. **One primary CTA per page** at the end, plus contextual links along the way.
6. **Bullet lists** for features; **tables** for comparisons and pricing.
7. **FAQ-style H2s** are fine — "Can I use it without a website?" is a heading AND a question.

---

##### 5. Vocabulary — say this, not that

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

##### 6. Facts that are always true (safe to use anywhere)

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

##### 7. Review checklist (run before publishing any page)

- [ ] Every feature claim traces to a built feature (roadmap §2) or is marked "coming soon".
- [ ] No invented testimonials, founder story, or numbers.
- [ ] All prices match `PLAN_PRICING` (₹999 / ₹2,499 / ₹4,999; annual −20%).
- [ ] Stats come from the live API, not hardcoded.
- [ ] Short sentences, you-language, no jargon, no hype words.
- [ ] One H1, clear H2 sections, one primary CTA.
- [ ] Contact + WhatsApp link present.
- [ ] Reads aloud naturally — if you stumble, rewrite.

---

#### Homepage (`/`) — Full Section Copy

> Merged from the former `docs/content/pages/homepage.md`.


**Purpose:** One page that proves → educates → shows → convinces → prices → acts. Every section below maps 1:1 to the roadmap §4 table.
**Audience:** Retailers (primary) and their customers (secondary).
**Style:** Per `content-style-guide.md` — humanized, E-E-A-T, honest (no fake testimonials, live stats only).

---

##### 1. Navbar (static)

- Left: kanchuki-logo.png wordmark (replaced KanchukiMark 2026-08-11).
- Links: For Retailers · For Customers · How It Works · Pricing · Stores · FAQ.
- Right: **Sign In** (retailer login) + **Start Free Trial** (primary CTA → `/pricing#signup`).

---

##### 2. Hero

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

##### 3. Live stats bar (live data — never hardcoded)

> Real numbers from stores already on Kanchuki.

- **Retailers onboarded** (live)
- **Products in catalogs** (live)
- **Collections shared** (live)
- **Enquiries this month** (live)
- **Catalog views** (live — from `collection_views`)

*Rule: these come from `GET /public/stats`, extended with the views counter. If a number isn't ready, show the stat without a number rather than a fake one.*

---

##### 4. Why a catalog matters (editorial — "why catalog is important for retailers")

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

##### 5. For Retailers — what we do (feature grid)

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

##### 6. How AI changes small businesses (editorial)

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

##### 7. How It Works (3 steps)

**H2: Online tonight. Here's how.**

1. **Snap & Tag** — Photograph a dress. AI adds the details. (≈10 seconds per product)
2. **Select & Share** — Pick products, get a WhatsApp link, send it to customers.
3. **Sell More** — Customers browse, favourite, and enquire. You reply right from the app.

*(Link: see the full walkthrough on `/how-it-works`.)*

---

##### 8. Store directory teaser

**H2: Shop real stores on Kanchuki.**

> Every store here is a real shop with a real owner you can message. Browse by city, or search for a specific store.

- 3–6 featured store cards (logo, shop name, city, product count) — live from the directory endpoint.
- CTA: **Explore all stores →** (`/stores`)

*Honesty rule: only visible, non-suspended stores appear. If fewer than 3 stores exist yet, show the ones that do with a "be the first" CTA instead of inventing any.*

---

##### 9. Testimonials (honesty-gated)

**Rule (binding, roadmap §8.2):** no fabricated testimonials. Until real, verified retailer stories exist (name + shop + city), show one of these instead:

- **Onboarding stories** — real screenshots of a retailer's first 50 products going live (true and verifiable).
- **Live proof section** — the stats bar + store-directory teaser (real social proof without invented quotes).

**When real stories exist**, each testimonial card shows: the person, their shop, their city, and one concrete result ("uploaded 300 products in a weekend" — verifiable, not vague praise).

---

##### 10. Comparison matrix

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

##### 11. Pricing

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

##### 12. FAQ (extended)

- **Do I need a website or an app for my customers?** No. Your catalog lives on a link they open in WhatsApp. That's the whole point.
- **How long does it take to get started?** Most shops are online the same evening. Photograph your best pieces, add prices, share the link.
- **Can I use it on an old phone?** Yes — the app and the customer pages are built to run well on budget Android phones and slow connections.
- **What about GST and billing?** Every plan comes with GST invoices. Pricing is in INR only.
- **Is my customer data safe?** Yes — customer photos and details belong to your shop, deletion is supported, and the platform follows India's data norms.
- *(Full list on `/faq`.)*

---

##### 13. Final CTA

**H2: Your shop, online tonight.**

> Photograph one dress. See your catalog. Share it on WhatsApp. All within the 14-day free trial — no card needed.

- Primary CTA: **Start Free Trial**
- Secondary: **Download the app** (QR → `/app`)

---

##### 14. Footer

- **Brand:** kanchuki-logo.png wordmark · "Your store on WhatsApp, powered by AI." · आपकी दुकान, AI की ताकत · Instagram / YouTube (to create).
- **Product:** For Retailers · For Customers · How It Works · Pricing · App Download · Store Directory.
- **Company:** About · Testimonials · Contact.
- **Support/Legal:** FAQ · WhatsApp Support · Terms · Privacy · GST note.
- **Bottom bar:** © 2026 Kanchuki · Made in India 🇮🇳 · EN/हिंदी toggle (Year-1) · Terms · Privacy.

---

##### Page metadata (for SEO)

- **Title:** Kanchuki — AI Catalog & WhatsApp Storefront for Indian Clothing Stores
- **Description:** Kanchuki turns photos of your dresses into an AI-written catalog, shared on WhatsApp — no website needed. 14-day free trial. Built for Indian clothing stores.
- **JSON-LD:** `Organization` + `SoftwareApplication` (retailer app).

---

#### For Retailers (`/for-retailers`) — Page Copy

> Merged from the former `docs/content/pages/for-retailers.md`.


**Purpose:** The deep-dive page for shop owners. Answers the question: "What exactly does Kanchuki do for my shop?"
**Audience:** Owner / manager of an Indian clothing store (sarees, kurtis, suits, lehengas, kids wear, menswear).
**Source of truth:** Feature inventory `website-roadmap.md` §2 (R1–R16). Only built features get ✅; planned ones are marked 🔶.
**Style:** Per `content-style-guide.md`.

---

##### H1: Run your clothing shop online — from your phone, no website needed.

**Lead:** You take a photo of a dress. Kanchuki writes the catalog entry, cleans the photo, and gives you a link to share on WhatsApp. Your customers browse it like a real store — and message you when they want something. Here's everything the app does for your shop.

---

##### H2: The catalog that writes itself

###### H3: Photograph once, AI does the details
- Take a photo of any dress. AI adds the **category, subtype, colour, fabric, and occasion** automatically — a "Teal Embroidered Kurta Set" stays tagged the way your customers actually describe it.
- AI writes a **short description** and suggests a **name** for the product.
- Every product gets an **auto SKU** — so when you scan it to mark it SOLD, the tag and the catalog stay in sync.

###### H3: AI works in the background
- You click photos, set a price, tap save. That's it.
- While you go back to the shop floor, AI tags the product, cleans up the photo, and sets a good background. No waiting on a loading screen.

###### H3: Your catalog, your rules
- Edit anything AI got wrong — it's your shop. Your picks always win.
- Sizes from S to XXXL, rack/shelf location, SOLD / reserved states, categories you can manage yourself.

---

##### H2: Photos that look like a big brand's

###### H3: AI photo cleanup (before → after)
- **Background removal** — that busy shop floor or wall disappears; the dress stays.
- **Auto-contrast background** — dark clothes get a light background, light clothes get a dark one. The product pops.
- **Ghost-mannequin fill** — hollow necklines and sleeves get filled so the garment looks worn, not flat.
- **Rotate and retouch** — fix a crooked photo, pick a backdrop from the library.

###### H3: Why photos matter
- On WhatsApp and in the catalog, the photo IS the product. Clean, consistent photos make a small shop look as put-together as a big brand — without hiring a photographer.

---

##### H2: Sell on WhatsApp — where your customers already are

###### H3: One link = your storefront
- Select the pieces you want to show, get a **collection link**, and share it on WhatsApp — to one customer, a group, or your whole customer list.
- The link opens a clean, mobile-friendly page. Customers browse, favourite, and **tap Enquire** to message you. No app for them, no website for you.

###### H3: Your store, on its own page
- Every shop gets a **free storefront at its own link** (e.g. kanchuki.app/store/your-shop) with your shop name, logo and categories.
- Generate a **store QR code** — stick it on the counter, the billing desk, or the delivery bag. Customers scan and browse.

---

##### H2: Know your customers (Fashion DNA)

###### H3: Remember what they like
- Save each customer's **colour, style, budget, and occasions**.
- Next time they ask for something, you already know what they'd like — and what to show them first.

###### H3: Search your own racks in plain language
- Type "pink cotton suit under ₹2000" into the app — it finds the matching pieces in your catalog. No walking the racks, no memory needed.
- *(AI-driven matching and recommendations across customers: Phase 1.)*

---

##### H2: For busy, big shops — bulk onboarding

- Got **500 to 3,000 SKUs** from a supplier? Import the **supplier PDF/catalog** and let the app build the products.
- Or shoot your racks **shelf-by-shelf** — AI detects each item in the photo.
- A **catalog-upload service** is available where a Kanchuki team member visits, photographs your stock, and sets up the catalog for you. *(500-item free upload promo is live for all retailers, limited time.)*

---

##### H2: Sell faster at the counter

###### H3: Scan-to-sell
- Print the SKU + QR tag for each design, stick it on the rack card.
- When a piece sells, **scan the tag** — it's marked SOLD, even if your internet is down. The app syncs when you're back online.

###### H3: Offline-first
- Built for shops where the network is patchy. Browse your catalog, change a product's status — it queues up and syncs when the connection returns.

---

##### H2: Team, staff, and control

- Add your **staff** with their own logins — a helper can scan-to-sell or add products without touching your account.
- Field teams and catalog-upload visits work through **delegated access** — no sharing your password.
- **You own the data.** Customer photos and details are yours; deletion is supported.

---

##### H2: Pricing that fits a small shop

- **Starter ₹999/mo** — one shop, 500 products, unlimited customers, AI tagging included.
- **Growth ₹2,499/mo** — 2,000 products, unlimited customers, unlimited links, try-ons.
- **Pro ₹4,999/mo** — unlimited, WhatsApp automation, multi-staff, more try-ons.
- **14-day free trial, no credit card.** UPI, cards, netbanking. GST invoices. Annual plans save 20%.
- *(Full details: `/pricing`.)*

---

##### H2: What's coming (honest list)

| Feature | Status |
|---|---|
| Virtual Try-On (customer tries outfits on their own photo) | 🔶 Engine live, customer rollout coming soon |
| AI Fashion DNA matching across customers | 🔶 Phase 1 |
| Hindi UI | 🔶 Year 1 |
| Play Store / iOS app listings | 🔶 coming soon (Android APK available now) |

---

##### Final CTA

> Photograph one dress tonight. See your catalog tomorrow morning. That's the whole pitch.

**Start your 14-day free trial →** · **See how it works →** · **Download the app →**

---

##### Page metadata (for SEO)

- **Title:** For Retailers — AI Catalog & WhatsApp Selling for Clothing Stores | Kanchuki
- **Description:** Photograph your dresses, AI writes the catalog, share on WhatsApp. No website needed. Built for Indian clothing stores — 14-day free trial.
- **JSON-LD:** `BreadcrumbList` → Home / For Retailers.

---

#### For Customers (`/for-customers`) — Page Copy

> Merged from the former `docs/content/pages/for-customers.md`.


**Purpose:** For shoppers who land on a store link. Answers: "What is this, and how do I browse and buy from this shop?"
**Audience:** Customers of Kanchuki stores — people shopping for clothes on their phones.
**Style:** Per `content-style-guide.md` — warm, helpful, plain. You-language throughout.

---

##### H1: Shop real clothing stores from your phone.

**Lead:** When a shop shares a Kanchuki link with you, you're looking at their real catalog — the same dresses, suits and sarees they have in the shop, photographed and ready to browse. No app to install, no account to make. Just look, like, and ask.

---

##### H2: What you can do on any store's catalog

- **Browse by category** — kurtis, suits, sarees, lehengas — or scroll the whole collection.
- **Look at every angle** — each product shows its photos, colour, fabric and sizes.
- **Save what you like** — tap the heart to favourite pieces and come back to them.
- **Ask the shop directly** — every product has an "Enquire" button that lets you message the shop owner about price, size, or whether it's available.
- **Buy when checkout is on** — some stores let you add to a cart and pay online. If not, just enquire — the owner replies.

---

##### H2: Every store is a real shop

- The shops on Kanchuki are **physical clothing stores** — the same ones you'd walk into.
- Each store page shows the **shop name, city and owner** — you're dealing with a real person, not a faceless website.
- **WhatsApp is the counter.** When you enquire, the shop replies the way you'd talk to them in person — same phone, same owner.

---

##### H2: How to browse like a pro

1. **Open the link the shop sent you** — it works on any phone, no app needed.
2. **Tap a category** or scroll to see everything.
3. **Tap a product** to see its photos, colours, fabric and sizes.
4. **Favourite** what you like, then **tap Enquire** to ask about it.
5. **Checkout** (if the store has it enabled) — add to cart, pay by UPI/card/netbanking.

---

##### H2: Your favourites, in one place

- Every store has a **wishlist** — pieces you've hearted stay there so you can compare later.
- Favourites also help the shop know what their customers like — which means better choices for everyone.

---

##### H2: Is my information safe?

- You don't need an account to browse. When you enquire, the shop sees only what you choose to share.
- Your messages go to the shop owner — the shop's data belongs to them, and they follow the same care with it as they would in person.
- Kanchuki follows India's data norms. No random ads, no selling your number.

---

##### H2: Looking for a particular kind of store?

- **Browse the store directory** to find clothing shops by city and category — all real stores with real catalogs.
- *(Coming soon: more stores every week as shops onboard.)*

---

##### Final CTA

> Find a store near you → · Or ask your favourite shop to join Kanchuki — it's free for 14 days.

---

##### Page metadata (for SEO)

- **Title:** For Customers — Browse & Enquire at Real Clothing Stores | Kanchuki
- **Description:** Shop real clothing stores on your phone — browse catalogs, favourite pieces, and message the shop directly on WhatsApp. No app needed.
- **JSON-LD:** `BreadcrumbList` → Home / For Customers.

---

#### How It Works (`/how-it-works`) — Page Copy

> Merged from the former `docs/content/pages/how-it-works.md`.


**Purpose:** The explainer page. Two jobs: (1) the 3-step "online tonight" story for retailers, (2) the "how the app works" walkthrough with real app screenshots.
**Audience:** Retailers evaluating the product, and anyone who landed on a store link and is curious how it's built.
**Style:** Per `content-style-guide.md`.

---

##### H1: Online tonight. Here's exactly how.

**Lead:** From a photo of a dress to a catalog your customers can browse — in three steps. Most shops are online the same evening they start. Here's the whole journey, with real screenshots of the app.

---

##### H2: The 3 steps

###### Step 1 — Snap & Tag
- Open the app, photograph a dress. Just one photo is enough to start.
- **AI adds the details in the background** — category, subtype, colour, fabric, occasion, a short description, and an auto SKU.
- You set the price and save. Done. (About 10 seconds per product once you're used to it.)

###### Step 2 — Select & Share
- Pick the pieces you want to show — a new arrival, a festival collection, a few sale items.
- Tap share. Kanchuki builds a **WhatsApp link** for that collection.
- Send it to a customer, a family group, or your whole list. The link opens a clean mobile page — no app for them.

###### Step 3 — Sell More
- Customers browse, heart what they like, and tap **Enquire**.
- You get the enquiry in the app and reply — like a WhatsApp chat, but organised.
- Stores with checkout enabled can take payment online too (UPI, cards, netbanking).

---

##### H2: How the app works — the full walkthrough

*(Each step pairs with a real app screenshot, at real size, in the Black & Gold palette.)*

###### H3: 1. Add products
- **One photo** → AI-tagged product, or **bulk**: shoot racks shelf-by-shelf or import a supplier PDF for 500–3,000 SKUs.
- Every product gets sizes (S–XXXL), a category, colour, fabric, and a rack/shelf location.

###### H3: 2. Manage your catalog
- See everything in one list — search by name, colour, or price range.
- Edit anything AI wrote; your edits always win.
- Mark pieces **SOLD** or **reserved** with one tap — or scan the rack tag (works offline).

###### H3: 3. Share with customers
- **WhatsApp collections** — one link per occasion or collection.
- **Store QR** — print it, stick it on the counter, customers scan and browse.
- Every shop also gets its own **store page** at a personal link.

###### H3: 4. Grow with customer insights
- Favourites and enquiries tell you what people actually want.
- Fashion DNA notes each customer's colour, style, budget and occasions — so your next WhatsApp to them shows the right things.
- *(AI-driven matching across customers: Phase 1.)*

---

##### H2: What happens after you save? (AI in the background)

- You never wait on a loading screen. After you save, the app quietly:
  1. Tags the product (name, category, colour, fabric, occasion, description, SKU).
  2. Cleans the photo — removes the background, sets an auto-contrast backdrop.
  3. Makes the catalog live.
- If you need to correct anything, edit it — AI never overwrites your changes.

---

##### H2: Works on the phone your shop already has

- Built for **budget Android phones** and **patchy networks**.
- Offline mode: browse and update your catalog, sync when the connection returns.
- Customer pages are light and fast — they open quickly even on old phones and slow connections.

---

##### Final CTA

> **Start your 14-day free trial →** · **Download the Android app →**

---

##### Page metadata (for SEO)

- **Title:** How It Works — From Photo to WhatsApp Catalog in 3 Steps | Kanchuki
- **Description:** Photograph a dress, AI writes the catalog, share on WhatsApp. See how Kanchuki works — 3 steps, no website, 14-day free trial.
- **JSON-LD:** `BreadcrumbList` → Home / How It Works.

---

#### Pricing (`/pricing`) — Page Copy

> Merged from the former `docs/content/pages/pricing.md`.


**Purpose:** Convert. Show exactly what each plan costs and includes, remove every reason to hesitate (trial, no card, UPI, GST).
**Source of truth:** `PLAN_PRICING` / `PLAN_LIMITS` / `ADDON_PRICING` in `packages/shared/src/constants/index.ts` — never hardcode different numbers.
**Style:** Per `content-style-guide.md`.

---

##### H1: Simple pricing for a clothing shop.

**Lead:** Three plans, one app, no surprises. Every plan starts with a **14-day free trial — no credit card**. Prices in INR, GST invoices included, pay by UPI, card, or netbanking.

---

##### H2: Choose your plan

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

##### H2: Every plan includes

- 14-day free trial, no credit card.
- GST invoices, INR only.
- UPI (GPay / PhonePe / PayTM), cards, netbanking.
- Your data stays yours — deletion supported, platform follows India's data norms.
- Support via WhatsApp (business hours) and email.

---

##### H2: Add-ons (only if you need more)

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

##### H2: Compare: what you'd pay the old way

| | Old way | Kanchuki |
|---|---|---|
| Catalog photos | Photographer + editor, ₹2,000–5,000 per shoot | Included (AI cleanup) |
| Writing product descriptions | Hours of typing or a hired assistant | Included (AI writes them) |
| A website | ₹10,000–50,000 + maintenance | Included (your store page + WhatsApp links) |
| Monthly cost | Easily ₹2,000+ with no results yet | From ₹999, results the same week |

---

##### H2: FAQ — pricing

- **Is there really no credit card for the trial?** Correct. Start free, and only pay when you're sure it works for your shop.
- **Can I switch plans later?** Yes — upgrade or downgrade anytime. Annual plans get 20% off.
- **What happens when I hit a product limit?** You can buy an add-on pack for that month, or upgrade the plan. Nothing gets deleted.
- **Is GST added on top?** Prices include GST invoicing — you get proper invoices for every payment.
- **Do you offer a discount for the first year?** Annual billing gives 20% off automatically.

---

##### Final CTA

> Start with the shop in front of you — photograph your best 10 dresses on the free trial and see the catalog tonight.

**Start 14-day free trial →** · **Talk to us on WhatsApp →**

---

##### Page metadata (for SEO)

- **Title:** Pricing — ₹999/mo for Indian Clothing Stores | Kanchuki
- **Description:** Kanchuki plans from ₹999/month — AI photo catalog, WhatsApp collections, store page. 14-day free trial, no credit card. UPI, GST invoices, INR only.
- **JSON-LD:** `Product`/`Offer` markup per plan (or `FAQPage` for the pricing FAQ).

---

#### Store Directory (`/stores`) — Page Copy

> Merged from the former `docs/content/pages/stores.md`.


**Purpose:** The hub page listing every visible retailer storefront. Local-SEO surface: "real clothing stores on Kanchuki" + city/category discovery.
**Data:** Live from the new `GET /public/stores` endpoint (visible, non-suspended stores only). No invented stores, ever.
**Style:** Per `content-style-guide.md`.

---

##### H1: Shop real clothing stores on Kanchuki.

**Lead:** Every store here is a real shop — with a real owner you can message directly. Browse by city or category, tap a store, and see their actual catalog. New stores join every week.

*(Empty-state honesty rule: if fewer than 3 stores are visible yet, show the ones that exist plus a "Be the first store on Kanchuki" CTA. Never list invented stores.)*

---

##### H2: Find a store

- **Search** by shop name or city ("kurtis in Jaipur").
- **Filter by city** — tap a chip to see stores there.
- **Filter by category** — suits, sarees, lehengas, kurtis, kids wear, menswear.

---

##### H2: Store cards

Each card shows:
- Store logo (or a tasteful placeholder monogram)
- Shop name
- City
- Product count ("134 products")
- **Visit store →** (opens `/store/[slug]`)

**Featured stores** (admin-curated) appear first; every visible store is listed.

---

##### H2: Why shop here?

- **Real shops, real owners.** The store page shows the shop's name and city — you're dealing with a person.
- **See the actual catalog.** Not "best sellers" picked by an algorithm — the shop's real stock, photographed by the owner.
- **Message them directly.** Tap Enquire and talk to the shop on WhatsApp, the way you would in person.
- **Works on any phone.** No app, no account — just open the link.

---

##### H2: Are you a store owner?

> Your shop can be here too — with your own catalog page, your own link, and your own QR code.

**Start your 14-day free trial →** (free trial, no card) · **See how it works →**

---

##### H2: FAQ — store directory

- **How do stores get listed?** Every shop with a public store page appears automatically once they complete onboarding. Suspended or deleted shops are never listed.
- **Can a shop be featured?** Yes — the Kanchuki team curates featured stores (real stores, shown first). 
- **I can't find my shop.** Ask your favourite shop to join — or if you're the owner, start the free trial and your store page goes live today.

---

##### Page metadata (for SEO)

- **Title:** Store Directory — Real Clothing Stores on Kanchuki
- **Description:** Browse real clothing stores on Kanchuki — suits, sarees, kurtis, lehengas and more, searchable by city and category. Message shops directly on WhatsApp.
- **JSON-LD:** `ItemList` of `ClothingStore` entries; sitemap includes `/stores` + every store URL. Each store page = long-tail local SEO ("<Shop Name> — <City> clothing store on Kanchuki").

---

#### App Download (`/app`) — Page Copy

> Merged from the former `docs/content/pages/app-download.md`.


**Purpose:** The "how our App works" + download page. Replaces the stale `/download` placeholder. Real Android QR + honest iOS/Play "coming soon".
**Rule:** Every link and QR must lead somewhere real (EAS APK install). No fake email forms, no disabled buttons.
**Style:** Per `content-style-guide.md`.

---

##### H1: The Kanchuki retailer app.

**Lead:** Shoot a dress, AI writes the catalog, share on WhatsApp. The whole shop fits in one app — built for the phone you already use, and built to work even where the network is weak.

---

##### H2: Download for Android

- **Scan the QR code** (links to the current Android app installer).
- Or tap **Download the Android app** for the direct install link.
- **iOS & Play Store — coming soon.** We're working through store listings; the Android build is available now.

*(Honesty note: the QR points to the real install link — never a dead placeholder. When Play Store/iOS go live, replace the badge and QR.)*

---

##### H2: How the app works — 4 steps

*(Each step pairs with a real app screenshot.)*

###### Step 1 — Add products
- Photograph one dress, or import a whole supplier catalog (500–3,000 SKUs).
- AI tags everything in the background: category, subtype, colour, fabric, occasion, description, SKU.
- You just set the price. Save and move on.

###### Step 2 — Manage your catalog
- Search your racks in plain language ("pink cotton suit under ₹2000").
- Sizes, rack/shelf location, SOLD / reserved states — one tap each.
- **Scan-to-sell:** print the SKU+QR rack tag, scan to mark SOLD — works offline, syncs later.

###### Step 3 — Share with customers
- Pick a collection → **WhatsApp link** → send it to customers.
- **Store QR code** on the counter — customers scan and browse.
- Every shop gets a **store page** at its own link.

###### Step 4 — Grow
- Favourites, enquiries and Fashion DNA (colour, style, budget, occasions) tell you what customers want.
- Reply to enquiries right in the app — like WhatsApp, but organised around your shop.

---

##### H2: What's inside (feature snapshot)

- AI Catalog Builder · WhatsApp Collections · Store page + QR · Fashion DNA CRM · AI search
- Photo cleanup & auto-contrast backgrounds · Ghost-mannequin fill · Bulk onboarding (PDF/racks)
- Offline mode · Scan-to-sell · Multi-staff · Try-On (coming soon)

---

##### H2: Requirements

- **Android** phone (budget phones welcome — built for Indian networks and devices).
- Your shop's **customer list** (or start with none — WhatsApp sharing works from day one).
- That's it. No website, no computer, no photographer.

---

##### Final CTA

> Start with 10 dresses and 14 free days. Photograph, save, share — tonight.

**Download for Android (QR above)** · **Start Free Trial** · **See how it works →**

---

##### Page metadata (for SEO)

- **Title:** Kanchuki App — Download for Android | Kanchuki
- **Description:** Download the Kanchuki retailer app — photograph dresses, AI writes the catalog, share on WhatsApp. Android now, iOS & Play Store coming soon.
- **JSON-LD:** `SoftwareApplication` (retailer app) with offers.

---

#### About (`/about`) — Page Copy

> Merged from the former `docs/content/pages/about.md`.


**Purpose:** Why Kanchuki exists. Lead with the meaning of the name, then the mission, then — when supplied by the user — the real founder story.
**Honesty rule (roadmap §8.4, binding):** the founder story must be provided by the user. This page ships with structure + mission + etymology; the narrative section stays a placeholder until real input exists. Never invent it.
**Style:** Per `content-style-guide.md`.

---

##### H1: Why we built Kanchuki.

**Lead:** India has more than a million clothing shops — most of them offline, most of them run by one or two people with an eye for cloth and a stack of bills. Kanchuki exists to give those shops the same reach a big brand has, without a website, without a team, without a photographer.

---

##### H2: The name

**Kanchuki** (कांचुकी / kanchuki) is the tailored bodice worn under a saree or ghagra — the quiet piece that makes everything else fit properly.

It's the right name for what we build: **technology that fits the garment trade**. Not a platform you have to change your shop for — a tool that fits under what you already wear, already do, already sell.

---

##### H2: What we believe

- **The catalogue is the shop.** Stock on a rack is invisible at 9 PM. A photo, tagged and shareable, is a shop that never closes.
- **AI should remove typing, not judgement.** The shopkeeper knows fabric and fit. We give them back the hours they used to spend writing "Teal embroidered kurta set with silver gota work".
- **WhatsApp is the Indian storefront.** Your customers are already there. Meet them where they are.
- **A small shop deserves big-brand photos.** Clean backgrounds, consistent lighting, ghost-mannequin fills — without a photo shoot.
- **Trust is earned with honesty.** Real numbers, real stores, real pricing — and we tell you plainly what's coming soon instead of pretending.

---

##### H2: What we've built so far (real, not slides)

- A **photo-to-catalog AI** that tags category, colour, fabric, occasion, description and SKU from a single photo.
- **WhatsApp collection links** and store pages that need no website.
- **Photo cleanup** — background removal, auto-contrast backdrops, ghost-mannequin fill.
- **Offline-first mobile app** built for budget Android phones and patchy networks.
- **Admin control center** — the platform protects store data, supports deletion, and follows India's data norms.

*(Full feature list with honest status: `/for-retailers`.)*

---

##### H2: The story behind Kanchuki

*(Placeholder — to be written with the founder. This section will tell the real story: who we are, what we saw in India's clothing shops, and why this is the thing we chose to build. We won't publish anything here until it's true.)*

---

##### H2: Work with us

- **Are you a clothing store?** Start your 14-day free trial — your shop can be online tonight.
- **Are you a retailer who wants your store featured?** Write to us — we feature real stores on the directory.
- **Do you run a shop we should talk to?** WhatsApp us — we'd love to hear how your shop works.

---

##### Final CTA

> One photo. One link. One shop that never closes.

**Start Free Trial →** · **Explore stores →** · **Contact us →**

---

##### Page metadata (for SEO)

- **Title:** About — Why We Built Kanchuki | Kanchuki
- **Description:** Kanchuki gives India's clothing shops a photo-to-WhatsApp catalog, powered by AI — no website needed. The story, the name, and what we believe.
- **JSON-LD:** `Organization` (extends homepage), `BreadcrumbList`.

---

#### Testimonials (`/testimonials`) — Page Copy

> Merged from the former `docs/content/pages/testimonials.md`.


**Purpose:** Real social proof. Per the honesty gate (roadmap §8.2, binding): **no fabricated testimonials, no invented quotes, no fake logos.** This page documents the structure that will host real stories — and what shows instead until they exist.

---

##### H1: What stores say about Kanchuki.

**Lead:** We only publish what real shops have told us — with their names, their shops, and their cities. Until those stories exist, this page shows real proof of a different kind: live numbers and real stores, straight from the platform.

---

##### H2: Real stories (published as they're verified)

*Every story below must be a real retailer: name + shop + city + a verifiable detail (e.g. "uploaded 300 products in a weekend"). No anonymous praise, no invented quotes.*

*(Template for each card:)*

> **"<One concrete, quotable line about their result — not vague praise.>"**
> — <Name>, <Shop Name>, <City>
> *Detail: <what they did on Kanchuki, verifiable — products uploaded, links shared, enquiries received>*

---

##### H2: Until real stories exist — real proof instead

Until the first verified retailer stories are collected, this page (and the homepage §9) shows **real, un-fakeable proof**:

1. **Live platform stats** — retailers, products, collections, enquiries this month, catalog views (from `GET /public/stats`). These change daily and cannot be invented.
2. **The store directory** — every store listed is a real, visible shop with a real catalog you can open and browse. That's the strongest testimonial there is.
3. **Onboarding stories** — real screenshots of a store's first products going live (staff-assisted or self-serve), documented by the team.

---

##### H2: How stories get verified (so you can trust them)

- The retailer is a **confirmed account** on the platform (their store page is live).
- Their quote references something **checkable** — products uploaded, a link shared, an enquiry answered.
- They've agreed to be named with their shop and city.
- Anything we can't verify doesn't get published. Simple rule.

---

##### H2: Want to share your story?

> If you're a Kanchuki store owner, tell us what changed for your shop. Real stories help other shops decide — and we'd love to feature you.

**WhatsApp us →** · **Or start your own free trial →**

---

##### Page metadata (for SEO)

- **Title:** Retailer Stories & Reviews | Kanchuki
- **Description:** Real stories from real clothing stores on Kanchuki — how shops photograph, tag and share their catalogs on WhatsApp. Verified, never invented.
- **JSON-LD:** `Review`/`Testimonial` markup ONLY for published verified stories. No markup while the page shows platform proof instead.

---

#### FAQ (`/faq`) — Page Copy

> Merged from the former `docs/content/pages/faq.md`.


**Purpose:** Answer the real questions a shop owner has before signing up. Grouped by topic, plain language, honest answers.
**Style:** Per `content-style-guide.md`.

---

##### H1: Questions shop owners ask us.

**Lead:** If your question isn't here, WhatsApp us — we answer during business hours (10 AM–7 PM IST).

---

##### H2: Getting started

**Do I need a website?**
No. That's the point. Your catalog lives on a link you share on WhatsApp, and your shop gets its own page on Kanchuki. No domain, no hosting, no website builder.

**Do my customers need an app?**
No. The link opens in their phone's browser — usually right inside WhatsApp. They can browse, favourite, and enquire without installing anything.

**How long until my shop is online?**
Most shops are online the same evening. Photograph your best pieces, add prices, save, share the link.

**Can I try it before paying?**
Yes — 14 days free, no credit card. After that, plans start at ₹999/month.

---

##### H2: Catalog & photos

**How does AI tagging work?**
You photograph a dress. AI looks at the photo and adds the category, subtype, colour, fabric, and occasion, plus a short description and an auto SKU. You can edit anything it writes — your edits always win.

**What if I have 3,000 SKUs from a supplier?**
Use bulk onboarding: import the supplier PDF/catalog, or photograph your racks shelf-by-shelf. AI detects each item. No typing.

**My photos aren't professional. Is that okay?**
Yes. AI cleans them — removes the background, picks a contrasting backdrop, fills hollow necklines. Clean catalog photos without a photographer.

**Can I mark things SOLD or reserved?**
Yes, with one tap — or scan the rack tag (works even offline).

---

##### H2: Sharing & selling

**How do customers buy?**
They browse, favourite, and tap Enquire — then message you directly on WhatsApp. Stores that connect checkout let customers pay online too (UPI, cards, netbanking).

**What is a collection link?**
You pick products, tap share, and Kanchuki makes a WhatsApp link for that set — a festival collection, new arrivals, a sale. Send it to one customer or a whole group.

**Do I get my own store page?**
Yes — every shop gets a free store page at its own link (e.g. kanchuki.app/store/your-shop) plus a QR code you can print for the counter.

---

##### H2: Money & billing

**How much does it cost?**
Starter ₹999/mo, Growth ₹2,499/mo, Pro ₹4,999/mo. Annual billing saves 20%. Prices in INR with GST invoices.

**How do I pay?**
UPI (GPay, PhonePe, PayTM), cards, or netbanking. No forex, no hidden charges.

**What if I hit a product limit?**
Buy a small add-on pack for that month, or upgrade the plan. Nothing gets deleted.

---

##### H2: Phones & offline

**Will it work on my old phone?**
Yes. The app and customer pages are built for budget Android phones and slow connections.

**What happens when the internet drops?**
The app keeps working — you can browse and update your catalog. Changes sync when you're back online.

---

##### H2: Data & trust

**Who owns the customer data?**
Your shop does. Customer photos and details belong to you; deletion is supported. Kanchuki follows India's data norms.

**Can my staff use it too?**
Yes — on the Pro plan, add staff with their own logins. Team members can help without touching your account.

**Is the app on the Play Store?**
Android APK is available now via direct install. Play Store and iOS listings are coming soon.

---

##### H2: Still stuck?

> WhatsApp us — we reply in business hours (10 AM–7 PM IST) · or email support.

**WhatsApp Support →** · **Contact →** · **Start Free Trial →**

---

##### Page metadata (for SEO)

- **Title:** FAQ — Kanchuki for Indian Clothing Stores
- **Description:** Answers for shop owners — how AI tagging works, WhatsApp selling, pricing, offline mode, and data safety. 14-day free trial, no credit card.
- **JSON-LD:** `FAQPage` markup (one Question/Answer per entry).

---

#### Contact (`/contact`) — Page Copy

> Merged from the former `docs/content/pages/contact.md`.


**Purpose:** "How to reach us" — the biggest trust gap on the site today. Real channels only: WhatsApp (the product's own channel), email, and a form that actually saves to the backend (reuses SupportTicket/enquiry infra — no fake submits).
**Style:** Per `content-style-guide.md`.

---

##### H1: Talk to a human.

**Lead:** Questions about Kanchuki for your shop? Want help getting started? We're real people, and we answer — during business hours (10 AM–7 PM IST, Monday–Saturday).

---

##### H2: WhatsApp — fastest

- Tap the button → opens WhatsApp to our number.
- Best for: quick questions, screenshots of your shop, "how do I…", getting set up.
- We reply in business hours.

**WhatsApp us →**

---

##### H2: Email

- **support@kanchuki.app** *(confirm the real address before launch — admin-managed)*
- Best for: longer questions, account/billing issues, partnership ideas, press.

**Email us →**

---

##### H2: Send a message (form — saves to the backend)

*This form actually works: it stores your message where the team sees it. No fake "we'll be in touch" simulation.*

- **Name**
- **Shop / City**
- **What do you need?** (pick: Getting started · Catalog help · Billing · Partnership · Something else)
- **Message**

**Send →**

---

##### H2: What happens after you write to us

1. We read it the same day (business hours).
2. If it's about your shop, we'll ask for your store link or phone number to look at your account.
3. We reply on the channel you used — WhatsApp or email.

---

##### H2: Other ways to reach us

- **Stores directory** — browse real stores on Kanchuki.
- **Help/FAQ** — most questions answered there.
- **For shops already on Kanchuki:** support is inside the app (Settings → Help/Support) and via the same WhatsApp number.

---

##### Final CTA

> Prefer to just try it? **Start your 14-day free trial** — no card, cancel anytime.

---

##### Page metadata (for SEO)

- **Title:** Contact — How to Reach Kanchuki | Kanchuki
- **Description:** WhatsApp, email, or a quick form — talk to a real person about Kanchuki for your clothing store. Business hours 10 AM–7 PM IST.
- **JSON-LD:** `ContactPage`.

---

## Feature Ideas Review — 2026-07-30

> Merged from the former `docs/references/research/feature-ideas-2026-07-30.md`.


Three ideas reviewed: cross-store coupon network, ratings/reviews, WhatsApp share buttons. Verdict per feature: feasible?, complexity, MVP-relevance.

---

#### #1 — Cross-Store Coupon Network ("buy here, get discount there")

**What you described:** customer buys item at Store A → gets coupon → redeems at Store B (different retailer, possibly different category — shoes/jewellery/cosmetics) → Store B scans it in-app → item free/discounted at B. Stores pre-tie-up which categories/items qualify.

**Verdict: possible, but this is a marketplace feature, not a retail-tool feature. Heavy, and wrong for MVP.**

##### Why it's heavy
This isn't "add a coupon field." It needs:
- **Retailer-to-retailer graph** — tie-ups are bilateral (A trusts B for X items), not global. New model: `StoreTieUp` (retailer_a, retailer_b, category/item scope, discount terms, status).
- **Coupon lifecycle** — issue (on purchase) → unique code/QR → redeem (scan at *another* retailer's device) → settle. Needs `Coupon` model: issuing_retailer, redeeming_retailer (nullable until used), customer, source_order, value_type (free/%/flat), scope (SKU/category), status (issued/redeemed/expired/void), expiry.
- **Cross-tenant scan flow** — today every scan/action in the retailer app is scoped to *your own* store's data (RLS is per-retailer, see `[[kanchuki-rls-convention]]`). Store B scanning a code issued by Store A means Store B's app must read *across* tenant boundary — a new, narrow RLS exception, not a toggle.
- **Money/settlement question you haven't answered yet:** who eats the discount? If Store B gives a free item because Store A's customer showed a code, does A owe B anything? Real inter-shop marketing tie-ups (mall coupon books, co-op ads) settle this with actual cash or barter *outside* the app. If Kanchuki must track "B is owed ₹X by A," that's a ledger system — real money movement, GST implications (is this a discount, a barter, or a taxable supply between two GST-registered businesses?). This alone could be a multi-week feature.
- **Fraud surface** — coupon reuse, screenshot-and-share, fake redemption by colluding retailers to inflate activity metrics. Needs one-time-use enforcement + audit trail (`[[kanchuki-admin-control-center-2026-07-26]]` deletion-vault/audit patterns apply here).
- **Discovery problem** — Store A's customer needs to *know* which stores B/C/D are tied up and what they offer. That's new UI surface on the customer PWA (a "linked stores" or "network offers" section), not just a coupon code.

##### Complexity estimate
High — comparable in scope to the L2 checkout build (`docs/PRO-REQUIREMENTS.md` F-302), which took a dedicated schema, security threat model (`docs/SECURITY.md` §11), and phased rollout. This needs the same treatment: new schema, new RLS carve-out, a settlement/ledger decision, fraud controls, and new customer-facing discovery UI. Realistically 3–5 weeks for a defensible v1 (single-category, manual tie-up, no ledger — just "B trusts A's codes, no money changes hands, they reconcile offline").

##### Is it important for MVP?
No. MVP goal (see `CLAUDE.md`) is single-retailer catalog/CRM/WhatsApp commerce — 50 retailers, ≥50 products each, WhatsApp links, enquiry conversion. Cross-store marketing networks assume *many* onboarded, active retailers in the same city/mall willing to tie up — you don't have that density yet. This is a **Phase 2+ growth-loop feature**, valuable once you have retailer density in a city, not before.

##### If you want to de-risk it now
Ship the smallest version that tests the idea without the ledger/fraud machinery: single retailer gives a **"refer a friend" or "buy X get store credit at a partner store"** coupon, redemption is *manual* (retailer B types the code into a simple lookup, no scan, no automated trust boundary), no money settlement — just a marketing gesture between two owners who already know each other. That validates demand before you build the graph, scan flow, and ledger.

---

#### #2 — Ratings System (product + store)

**Verdict: possible, standard e-commerce feature, moderate complexity, genuinely useful for MVP-adjacent trust-building.**

##### What it needs
- **Schema:** `ProductReview` (product_id, customer_id, rating 1-5, comment, photos?, created_at) and `StoreReview` (retailer_id, customer_id, rating, comment). One review per customer per product/store — needs a purchase or enquiry check if you want to prevent drive-by fake reviews (see below).
- **Aggregate fields:** `Product.avg_rating`/`rating_count`, `Retailer.avg_rating`/`rating_count` — denormalized counters updated on write (trigger or app-level increment), so catalog browsing doesn't need a live aggregate query per product.
- **Customer-facing UI:** star display on product cards + product detail (already has a detail sheet — `ProductDetailSheet.tsx` — add rating block there), a "rate this" affordance (likely gated: only customers who enquired/ordered, to avoid spam ratings from people who never engaged).
- **Retailer-facing UI:** reviews visible on retailer's own product/store view; ideally a way to respond (standard for trust — "owner replied").
- **Moderation:** admin needs to see/remove abusive reviews — extends the existing Admin Control Center (F-013–F-017) rather than inventing a new system. `AuditLog` wiring for review deletion, same as other admin actions.

##### Complexity estimate
Moderate — 3–5 days. Mostly CRUD + one denormalized-counter decision + admin moderation hook. No new architectural pattern; follows the same shape as everything else in the customer PWA + admin panel.

##### Gating question (worth deciding before building)
Should rating require a prior enquiry/order? Recommend **yes** — unrestricted ratings on a catalog with no purchase-verification will fill with fake 5-stars from the retailer's own network or fake 1-stars from competitors. Tie eligibility to `CustomerInteraction`/`Order` records that already exist in the schema.

##### Is it important for MVP?
Reasonably — it supports the "customer trust" side of the product but isn't in the locked MVP feature list (`CLAUDE.md` "Current Phase: MVP" section doesn't mention it, and MVP success metrics are about upload/link/conversion, not reviews). Recommend: **build after the MVP metrics are validated**, not before — reviews matter once there's repeat traffic to a store's page; with a brand-new catalog there's nothing to rate yet. Good Phase 1 addition, not Phase 0.

---

#### #3 — Share Collection/Product to WhatsApp

**Verdict: mostly already built. Trivial remaining gap.**

##### Current state (checked code, not assuming)
`CollectionView.tsx` already has a working share button (`handleShare`, `Share2` icon) using the native **Web Share API** (`navigator.share({ title, url })`) — on mobile this opens the OS share sheet, WhatsApp included, with no custom WhatsApp-specific code needed. `ContactGate.tsx`/enquiry flows already use `buildWhatsAppEnquiryLink`/`buildEnquiryMessage` from `@kanchuki/shared` for the "enquire on WhatsApp" message — so the wa.me link-building helper already exists in the shared package.

**Gap:** `ProductDetailSheet.tsx` (single product view) has no share button — only the collection-level view does.

##### Complexity estimate
Trivial — under an hour. Copy the same `handleShare` pattern from `CollectionView.tsx` into `ProductDetailSheet.tsx`, pointing the shared URL at the product's anchor within the collection (or a dedicated product deep-link if one exists/is added: `/{slug}?product={id}` style). No new dependency, no new backend — `navigator.share` is a browser-native API already in use in this codebase.

##### Is it important for MVP?
Yes, and cheap — directly supports the "WhatsApp collection link generator" MVP feature already in `CLAUDE.md`'s locked scope, and the ≥10 collection links sent/retailer/month metric. Recommend doing this one now, independent of the other two.

---

#### Summary Table

| # | Feature | Feasible? | Complexity | MVP-relevant? | Recommendation |
|---|---|---|---|---|---|
| 1 | Cross-store coupon network | Yes, but heavy | High (3–5 wks) — new schema, cross-tenant RLS, settlement/ledger, fraud controls | No — needs retailer density Kanchuki doesn't have yet | Defer to post-MVP growth phase; if testing appetite now, ship a manual/no-ledger version only |
| 2 | Product + store ratings | Yes | Moderate (3–5 days) | Adjacent, not in locked MVP list | Build in Phase 1, gate ratings behind prior enquiry/order to avoid fake reviews |
| 3 | WhatsApp share button | Already 90% built | Trivial (<1 hr) | Yes — extends existing MVP feature | Do now — just add to `ProductDetailSheet.tsx` |

---

#### Suggested order if you want to proceed
1. **#3 first** — near-free, closes a real gap in an already-shipped MVP feature.
2. **#2 next** — standalone, moderate effort, don't gate other work on it. Decide the enquiry/order-gating question before starting.
3. **#1 last, and only after validating demand** — start with the manual/no-ledger version described above before building the full tie-up graph + settlement ledger. Don't build the fraud/ledger machinery speculatively.

---

## International WhatsApp Commerce Roadmap

> Merged from the former `docs/references/research/international-expansion.md`.


**Status:** Proposed enhancement  
**Date:** August 2026  
**Owner:** Product + Engineering  
**Prerequisite:** Phase 3 (Full Commerce) live — WhatsApp Business API, payments, and admin controls stable  

---

#### 1. Why International Now

The Indian diaspora is ~35 million, concentrated in:
- **US** (~5.4M), **UK** (~1.86M), **Canada** (~2.87M), **Australia** (~720K)
- **UAE** (~3.6M), **Saudi Arabia** (~2.6M), **Kuwait/Oman/Qatar/Bahrain** (~3.5M combined)
- **Singapore** (~600K), **South Africa** (~1.5M), **Mauritius** (~890K), **Trinidad & Tobago** (~470K)
- **New Zealand** (~300K), **Germany/Netherlands** (large fabric importers)

These communities already buy Indian ethnic wear. Kanchuki retailers are positioned to serve them — but today the retailer’s reach ends at their local customer base. WhatsApp is the universal bridge: the same app used in India is used by diaspora everywhere.

**The gap:** current WhatsApp is manual share-only. Retailers cannot run global campaigns, cannot auto-send collections to opted-in diaspora customers, cannot collect international payments or arrange cross-border shipping through the platform.

---

#### 2. Current State Assessment

| Capability | Current Status | Gap for Global |
|---|---|---|
| Collection link generation | ✅ Built (`/c/{slug}`) | Works globally but no proactive send |
| WhatsApp share | ✅ Manual Web Share API | No API-driven broadcast |
| AI catalog tagging | ✅ Built | Needs region-aware labels |
| Customer Fashion DNA | 🕐 Planned (Phase 1) | Needs region profiles |
| Payments | ✅ Razorpay (UPI/cards) | Needs international methods |
| Shipping | ❌ Manual notes | Needs zone calculation |
| Language | ❌ English only | Needs Hindi/Arabic minimum |
| Compliance | ❌ India-only | Needs GDPR/TCPA/regional |

---

#### 3. Roadmap Overview

```
Phase 4A: WhatsApp Global API Foundation    Month 1–2
Phase 4B: International Catalog             Month 2–3
Phase 4C: Smart Global Campaigns            Month 3–4
Phase 4D: Payments, Shipping & Scale        Month 4–5
```

---

#### 4. Phase 4A: WhatsApp Global API Foundation

**Goal:** Move from manual share to Meta WhatsApp Business API with international reach.  
**Duration:** 4–6 weeks

##### 4.1 Meta WhatsApp Business API — Global Send

- Enable Meta Cloud API for international destinations (already planned for Phase 3 India; extend to global rate cards).
- Admin panel: WhatsApp Business Manager onboarding wizard — connect Meta Business Portfolio, verify business, link phone number.
- Per-destination cost tracking: track ₹ spent per country (Meta rates differ: India ~₹0.06–0.38/conversation; US ~₹4–8; UK/EU ~₹3–6; UAE ~₹1–2).
- Conversation hierarchy:
  - **Marketing** — broadcast campaigns (new arrivals, festivals)
  - **Utility** — order confirmations, shipping updates, payment links
  - **Service** — customer replies within 24h window

##### 4.2 International Phone Number Handling

- Retailer customer list: store `phone_e164` + `phone_country` + `phone_region`.
- Validation: validate at entry using `libphonenumber` (already a transitive dep via shared utils or add directly).
- WhatsApp format: always normalize to E.164 before sending via API.
- Country-aware defaults: default language, currency, shipping zone based on phone prefix.

##### 4.3 Message Templates — Multi-Language

- Admin-managed template library (already needed for India; expand).
- Minimum templates for Phase 4A:
  - English (global default)
  - Hindi (for diaspora who prefer Devanagari or Hinglish)
  - Arabic (for UAE/Saudi/Kuwait — Indian retailers serve NRI workers there)
- Template variables: `{customer_name}`, `{collection_name}`, `{store_name}`, `{unsubscribe_link}`.
- Pre-approval workflow: admin submits templates to Meta; status tracked in DB.

##### 4.4 Opt-In & Consent — International Grade

- **GDPR (EU/UK):** explicit opt-in, right to erasure, data portability. Add consent fields: `gdpr_consent_at`, `marketing_consent_source`, `data_processing_basis`.
- **TCPA (US):** prior express written consent for marketing messages. Add `tcpa_consent_at`, `tcpa_consent_ip`.
- **Regional toggles:** per-customer, per-region opt-in status. Default: no marketing send until explicit opt-in.
- Unsubscribe mechanism: every template message includes `Reply STOP to unsubscribe` or `{unsubscribe_link}`.

##### 4.5 Time-Zone Aware Scheduling

- Admin campaign scheduler: pick send time per region, not per retailer timezone.
- Auto-optimize: learn best open rate per region/customer and schedule accordingly.
- Quiet hours: respect local quiet hours (EU: 9pm–8am; UAE: 9pm–8am; US: 9pm–8am by state).

---

#### 5. Phase 4B: International Catalog

**Goal:** Product catalog that works for global Indian diaspora, not just domestic buyers.  
**Duration:** 3–4 weeks

##### 5.1 Multi-Currency Pricing

- Product price base: always INR in DB.
- Admin panel: exchange rate manager — manual or auto-fetched (RBI/Open Exchange Rates). Cache 1h TTL.
- Display rules:
  - Customer in UK → show GBP estimate alongside INR.
  - Customer in UAE → show AED.
  - Customer in US → show USD.
- Collection links: currency determined by customer’s detected region (IP fallback + phone prefix override).

##### 5.2 Region-Specific Product Metadata

- Extend product tags with `intl_style_profile` — same product can be tagged differently for different regions.
  - Example: heavily embroidered lehenga → `style_for_gulf = premium_wedding`, `style_for_us = fusion_cocktail`, `style_for_uk = wedding_guest`.
- AI auto-suggests region tags during catalog upload based on product attributes.
- Admin can override per product.

##### 5.3 Shipping Zones & Duty Estimates

- New admin module: Shipping Zones.
  - Zone = country group (e.g., “GCC”, “EU”, “NA”, “APAC”).
  - Per zone: base shipping cost (INR), estimated delivery days, duty note.
- Collection links: show shipping cost + estimated duties before checkout.
- Courier integration (later): Shiprocket International, DHL eCommerce, India Post International.

##### 5.4 International Payment Methods

- Extend Razorpay: enable international cards (Razorpay supports global cards natively).
- Add PayPal / Apple Pay / Google Pay as checkout options (Phase 4D).
- Currency settlement: retailer receives INR; platform handles FX at checkout.
- Display: customer sees price in local currency + “You pay {amount}. Retailer receives ₹{INR}.”

##### 5.5 Language & Localization

- Customer web PWA: detect language from URL param (`?lang=`) or browser header.
- Minimum supported languages Phase 4:
  - English (global)
  - Hindi (India + diaspora)
  - Arabic (Gulf market)
  - Spanish (Trinidad, Fiji, future LatAm)
- AI-generated product descriptions: localized by region (e.g., “office wear” in US vs “formal suit” in UK).
- RTL support for Arabic on customer web pages.

---

#### 6. Phase 4C: Smart Global Campaigns

**Goal:** AI-powered campaign design that respects regional fashion differences and compliance rules.  
**Duration:** 3–4 weeks

##### 6.1 Region-Aware Fashion DNA

- Extend `CustomerFashionDNA` with `region_preferences` — a sub-profile per region the customer belongs to.
  - A customer in the US may prefer Indo-Western fusion.
  - A customer in UAE may prefer modest, elegant festive wear.
  - A customer in UK may prefer traditional wedding guest looks.
- AI matching engine: weight region-specific preferences higher when customer is in that region.
- Learning signal: track `tryon_completed`, `favourited`, `enquiry_sent`, `order_placed` — but segment by region.

##### 6.2 Festival & Occasion Calendar — Global

- Admin-managed festival calendar with country-level toggles.
- Pre-seeded:
  - India: Diwali, Navratri, Karwa Chauth, Raksha Bandhan, wedding season
  - UAE/Saudi: Eid al-Fitr, Eid al-Adha, National Day
  - US/UK/Canada: Diwali (public events), Christmas party season
  - Global: New Year, Valentine’s Day
- AI campaign assistant: “Create a collection for UK customers for Diwali — style: wedding guest, budget: £50–£150.”

##### 6.3 Time-Zone Optimized Sends + Quiet Hours

- Campaign scheduler stores `send_at` per recipient region, not a single global timestamp.
- Quiet hours: enforced per country (defaults configurable by admin).
- Frequency cap: max N marketing messages per customer per week (configurable).

##### 6.4 Compliance Guardrails

- Pre-send compliance check per recipient:
  - EU/UK: has `gdpr_consent_at`? If not, block send.
  - US: has `tcpa_consent_at`? If not, block send.
  - UAE: no specific anti-spam law yet, but honor opt-out.
- Audit log: every marketing send logged with `recipient_region`, `consent_status`, `template_id`, `cost`.
- Admin dashboard: Compliance Health — % of customers with valid consent per region.

##### 6.5 Campaign Analytics by Region

- Existing analytics extended with region dimension:
  - Open rate by country
  - Try-on rate by country
  - Enquiry rate by country
  - AOV by currency
  - Best-performing styles by region
- Admin can slice: “Show me top 5 products for UAE customers this month.”

---

#### 7. Phase 4D: Payments, Shipping & Scale

**Goal:** Close the loop — international customer can browse, try-on, pay, and receive delivery.  
**Duration:** 4–6 weeks

##### 7.1 International Checkout

- Customer web PWA: new checkout path for international orders.
- Flow:
  1. Customer favorites / enquires / clicks “Buy”
  2. Select shipping address (country, state, pincode)
  3. See shipping cost + duty estimate
  4. Pay via international card / PayPal / Apple Pay / Google Pay
  5. Retailer gets order notification (WhatsApp + in-app)
  6. Retailer packs, marks shipped
  7. Customer gets tracking link
- Razorpay international: already supports cards; add PayPal via Razorpay or direct.
- Order status: same flow as domestic, with international tracking fields.

##### 7.2 Cross-Border Logistics

- Admin: Shipping zone configuration (countries, base rate, per-kg rate, duties).
- Courier API integrations (Phase 4D+):
  - Shiprocket International
  - DHL eCommerce
  - India Post International (economy)
- Tracking: store tracking number + courier name; customer web shows tracking map.
- Returns: admin-configured return policy per zone; customer can raise return request.

##### 7.3 FX & Payouts

- Retailer always sees INR.
- Platform records FX rate at time of transaction.
- Admin dashboard: international revenue dashboard (INR + local currency).

##### 7.4 Scale: WhatsApp Rate Limits + Cost Controls

- Per-retailer daily broadcast cap: configurable (default: 100/day).
- Cost alert: if a campaign exceeds ₹X, require admin approval before send.
- Queue: BullMQ job for each send, with retry + dead-letter on WhatsApp API failure.
- Template governance: admin approves templates before they can be used in campaigns.

---

#### 8. Integration Points with Existing Codebase

| Existing Feature | Extension for Global |
|---|---|
| `POST /v1/auth/otp/send` | Add international SMS fallback (Twilio) for OTP when MSG91 DLT blocks foreign numbers |
| `Customer` model | Add `phone_country`, `phone_region`, `gdpr_consent_at`, `tcpa_consent_at` |
| `FashionDNA` | Add `region_preferences` JSONB column |
| `Product` model | Add `intl_style_tags` JSONB; currency display in public API |
| `Collection` share | Add `?lang=` param + `?currency=` param on `/c/{slug}` |
| `CustomerWeb` (Next.js) | Add i18n (next-intl or similar), currency selector, RTL layout |
| Admin panel | New pages: WhatsApp Global, Shipping Zones, FX Rates, Compliance, Region Analytics |
| BullMQ jobs | New queues: `whatsapp-global-send`, `fx-rate-refresh`, `shipping-calculate` |
| `docs/SCALING.md` | Update Phase B/C triggers with global traffic assumptions |

---

#### 9. Compliance Checklist

| Region | Requirement | Implementation |
|---|---|---|
| EU / UK | GDPR — explicit consent, right to erasure, data portability | `gdpr_consent_at`, export/delete endpoints, privacy notice in en/hi/ar |
| US | TCPA — prior express written consent for SMS/WhatsApp marketing | `tcpa_consent_at`, `STOP` handling, consent capture UI |
| UAE / Saudi | No specific spam law yet, but WhatsApp TOS applies | honor opt-out, no misleading sender ID |
| Canada | CASL — explicit consent, unsubscribe mechanism | similar to GDPR opt-in |
| Australia | Spam Act 2003 — consent + unsubscribe | similar to GDPR opt-in |
| India | TRAI DLT + new DPDP Act 2023 | already in scope for domestic |

---

#### 10. Success Metrics

| Metric | Target |
|---|---|
| International retailers onboarded | 10 within 3 months of Phase 4A launch |
| International collection links opened | ≥1,000/month |
| International try-ons | ≥200/month |
| International enquiry-to-order conversion | ≥10% |
| Average international order value | ≥₹3,000 |
| WhatsApp API delivery rate | ≥98% |
| Compliance opt-in rate | ≥60% of international customers |
| Revenue from international orders | ₹2L+/month by Month 6 of Phase 4 |

---

#### 11. Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| WhatsApp Business API approval delays for new regions | Medium | Start India + UAE first (highest Indian diaspora); EU/US approval takes longer |
| GDPR/TCPA fines | Low (if built correctly) | Fail-closed consent checks; no send without valid consent |
| International shipping disputes | Medium | Clear duty/delivery estimates; easy return policy |
| FX volatility | Low | Razorpay locks rate at checkout; retailer sees INR only |
| Low diaspora engagement | Medium | AI region-aware matching + festival calendar drives relevance |
| Meta rate changes | Low | Pass costs through; maintain SMS fallback |

---

#### 12. Dependencies & Blockers

- **Phase 3 (Full Commerce)** must be live first — WhatsApp Business API, checkout, and admin controls are prerequisites.
- **Meta Business Verification:** retailer Meta accounts need business verification to use WhatsApp Business API globally. Plan for hand-holding.
- **Payment gateway:** Razorpay International or PayPal must be enabled in admin panel.
- **Shipping API:** courier integrations are Phase 4D+, not blockers for Phase 4A–4C (manual shipping works interim).

---

#### 13. Out of Scope (Phase 4)

- Full standalone marketplace (retailer discovery by international customers)
- Multi-language AI tagging at scale (start with English + Hindi + Arabic labels)
- Local returns/warehouse in destination country
- Customs brokerage automation
- Local-language customer support chatbots
