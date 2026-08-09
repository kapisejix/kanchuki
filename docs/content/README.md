# Kanchuki Website & Content — Docs Index

This folder holds the planning docs for the **public marketing website** (`apps/web`),
the **customer storefront**, and all **public-facing content** (copy, images, SEO).

> Status: **Planning only.** Nothing in this folder is implemented yet. The roadmap
> in this folder is the reference spec for the website rebuild work. It builds on —
> never replaces — the design system already live in code (Black & Gold Elegance,
> `docs/design/emil-design.md`).

| Doc | What it covers |
|---|---|
| [`website-roadmap.md`](./website-roadmap.md) | **The master roadmap.** Vision, feature inventory (what we actually offer retailers & customers, from the .md review), homepage section-by-section spec, full page/sitemap architecture, store directory, app-download page, contact/"how to reach us", nav + footer, content plan, SEO plan, admin integration, and the phased build plan. |
| [`pages/content-style-guide.md`](./pages/content-style-guide.md) | **The writing rulebook.** E-E-A-T (Experience/Expertise/Authoritativeness/Trustworthiness) + humanized copy rules: short sentences, you-language, no jargon/hype, honest-claim gate, vocabulary swap list, and a pre-publish checklist. Read this before editing any page copy. |
| [`pages/homepage.md`](./pages/homepage.md) | **Homepage copy — all 14 sections** (hero → live stats → why catalog → features → AI story → how-it-works → store teaser → testimonials gate → comparison → pricing → FAQ → CTA → footer), plus SEO metadata. The master document every other page derives from. |
| [`pages/for-retailers.md`](./pages/for-retailers.md) | `/for-retailers` — deep dive on what the app does for a shop owner (R1–R16): AI catalog, photo cleanup, WhatsApp selling, Fashion DNA, bulk onboarding, scan-to-sell, staff, pricing. |
| [`pages/for-customers.md`](./pages/for-customers.md) | `/for-customers` — what shoppers get: browsing, favourites, enquire, checkout, real-shop trust, privacy. |
| [`pages/how-it-works.md`](./pages/how-it-works.md) | `/how-it-works` — the 3-step story (Snap & Tag → Select & Share → Sell More) + the 4-step "how the app works" walkthrough with real screenshots. |
| [`pages/pricing.md`](./pages/pricing.md) | `/pricing` — plans (₹999/₹2,499/₹4,999, annual −20%), feature comparison, add-ons, old-way cost comparison, pricing FAQ. Prices trace to `PLAN_PRICING`. |
| [`pages/stores.md`](./pages/stores.md) | `/stores` — store directory: search + city/category filters, store cards, "real shops" trust story, empty-state honesty rule, local-SEO metadata. |
| [`pages/app-download.md`](./pages/app-download.md) | `/app` — Android download QR (real install link), honest iOS/Play "coming soon", and the 4-step how-the-app-works walkthrough. |
| [`pages/about.md`](./pages/about.md) | `/about` — the kanchuki etymology, mission, what we believe, real build progress. Founder-story section is a **placeholder** until the user supplies the real story (honesty rule). |
| [`pages/testimonials.md`](./pages/testimonials.md) | `/testimonials` — **honesty-gated** structure: real verified stories only (name + shop + city + checkable detail); until they exist the page shows live stats + the real store directory instead. |
| [`pages/faq.md`](./pages/faq.md) | `/faq` — grouped Q&A (getting started, catalog, sharing, billing, phones/offline, data & trust), extends the homepage FAQ. |
| [`pages/contact.md`](./pages/contact.md) | `/contact` — WhatsApp (primary), email, and a form that **saves to the backend** (reuses SupportTicket/enquiry infra — no fake submit), plus business hours. |

## Related docs (outside this folder)

- `docs/design/emil-design.md` — the design system (Black & Gold Elegance tokens, typography, motion-by-surface, anti-patterns). The roadmap **references** this; it does not redefine it.
- `docs/PRO-REQUIREMENTS.md` — the product spec the feature inventory is drawn from (§3 features by phase, §6 pricing).
- `docs/PLAN.md` — the product roadmap the website phases interleave with.
- `docs/CLAUDE.md` (repo root) — project memory; the authoritative list of **built** features.
- `docs/DESIGN.md` — design tokens reference (kept current with the live palette).

## How to use these docs

1. Read `website-roadmap.md` before starting any website work.
2. Treat the **feature inventory** (§2) as the source of truth for *what we can honestly claim* on the site — every feature listed there is built or explicitly planned.
3. Treat the **honest-copy rules** (§8) as binding: no fabricated testimonials, no invented founder story, no fake urgency. The site's moat is trust; the copy must not trade it.
4. To write or edit **page copy**, read `pages/content-style-guide.md` first (E-E-A-T + humanized rules), then the relevant page file under `pages/`.
5. Page copy files are the **content source**: when the website pages are built, the H1/H2 copy and section text here is what ships (with live stats and real images wired in per the roadmap).
