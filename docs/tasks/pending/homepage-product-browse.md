# Homepage Product Browse — "New arrivals near you"

**Status:** 🟨 §2b category grid **built 2026-10-14** (PRs #72, #73; self-hides when thin) — rest of this spec still idea · **Written:** 2026-09-30
**Feature ID:** F-042 *(proposed — not yet in `docs/PRO-REQUIREMENTS.md` or the CLAUDE.md index)*
**Builds on:** nearby store cards (commit `d52efae9`, `feat/nearby-stores`) — `GET /v1/public/stores?lat&lng`, `StoreCard`, `NearMeBar`, `lib/geo.ts`.
**Scope note:** outside the Phase 0 MVP list in `CLAUDE.md`. Customer web only (marketing homepage + `/stores`); no retailer-app change.

---

## 1. Idea (owner, 2026-09-30)

Today the marketing pages list **stores** (logo, name, address, distance). Add a way for a customer to browse **products** instead: they see product cards, tap one, and land on that store's page. Goal: more engagement and more time on Kanchuki, because shoppers browse by *what they want to wear*, not by shop name.

## 2. Recommendation (agreed direction)

**Add, don't replace.** Keep the store list as the main "near me" view (it is built and always looks fine). Add a **"New arrivals near you"** product row above it on the homepage and `/stores`, with a toggle/tab to a full product grid later.

## 2b. Category-wise layout (added 2026-10-14, owner request — Meesho-style browse)

Owner wants all products listed **category-wise** on the marketing homepage; tapping a product opens that shop's listing. Same "add, don't replace" and same gates (§3) apply.

**Flow**
1. Homepage: category tiles/chips (from the DB-backed taxonomy, F-024/F-027 — no hardcoded list).
2. Under tiles: one horizontal product row per category (cap ~8 products, "See all" link).
3. `See all` → `/category/<slug>` grid, Prev/Next pager (infinite scroll was reverted by owner, PR #41).
4. Card tap → product sheet on that shop's page (rule 5). Shop name + distance stay on every card.

**Rules (extend §4)**
- Category rows use the same eligibility, per-shop cap (2 per shop per row/page) and self-hiding threshold, **applied per category**: a category with < 6 products from < 3 shops is hidden, not shown thin.
- Ordering inside a category: nearest shop first (when location known), then newest.
- Category pages are server-rendered with JSON-LD (reuse §7A.1 SEO pattern, RC-040 escaping) — organic search traffic.
- No cart/checkout; CTA stays "view in shop" + WhatsApp enquiry.

**Build additions (extend §6)**
- API: `GET /v1/public/products?category=&lat&lng&page` (same live-store filter, Redis public-cache with rounded coords, page-size cap). Index check: products `(category_id, status, created_at)`.
- Web: `CategoryTiles`, `CategoryRow`, `/category/[slug]` page; reuse `ProductCard`.
- Verify first: can the storefront route open a given product via query param (rule 5)?

**Staging:** (1) "New arrivals near you" row → (2) category rows on homepage → (3) `/category/<slug>` grid pages. Advance only if §7 metrics show pull.

---

## 3. Preconditions — do not build until these hold

| # | Gate | Why |
|---|------|-----|
| G-1 | The pilot area has **≥ 10 active shops** with live products | A feed of ~40 products from 3 shops looks empty and repetitive. A 3-store list still looks fine. |
| G-2 | Product photos shown in the feed are **consistent** (auto-clean re-enabled for them, or a background/crop pass) | Add-Product saves raw photos by default since 2026-08-29 (BUILD-LOG §2026-08-29). Mixed backgrounds in a grid make the whole site look cheap. |
| G-3 | Owner has checked **retailer reaction** (see §5 R-2) | Shops watch competitors; putting products side by side can backfire. |

If G-1 is not met at build time, the row must **hide itself** (see §4 rule 6) rather than show a thin feed.

## 4. Behaviour rules

1. **Card content:** product photo, price (₹), shop name, distance (when location is known), small store-type chip (Ladies / Gents / Kids). The shop name and distance stay visible on every card so the shop owns the customer.
2. **Ordering:** nearest shop first when location is known, then newest. Without location: newest across the directory.
3. **Per-shop cap:** at most **2 products per shop** per screen, so one big store cannot flood the feed.
4. **Eligibility:** only live products with status `AVAILABLE`, from live storefronts (same bar as `/public/stores`: has `public_slug`, not suspended, not deleted). Prefer recently added items so sold-out or stale pieces do not appear.
5. **Tap target:** open the **product on that shop's page** (its product sheet), not just the shop front page — otherwise the shopper hits a dead end after the click. **To verify before building:** whether the storefront route can already open a specific product (e.g. via a query param) or needs a small addition.
6. **Self-hiding threshold:** show the row only when the nearby (or city) result has **≥ 12 products from ≥ 4 shops**. Below that, render nothing.
7. **Location:** reuse `useUserLocation` and the 2 → 5 → 10 km widening; if nothing is nearby, fall back to newest across the directory, with the same notice pattern as the store list.
8. **No price comparison, no ranking by price.** Nothing that pits shops against each other.
9. **Share:** each card keeps the Share action (Web Share, WhatsApp fallback), same as `StoreCard`; dismissal of the share sheet is not an error (RC-014).

## 5. Risks

| # | Risk | Mitigation |
|---|------|-----------|
| R-1 | Thin feed at pilot scale | G-1 + self-hiding threshold (rule 6) |
| R-2 | Retailers dislike competitors' products beside theirs | Shop name/distance on every card; per-shop cap; no comparison; ask pilot shops first (G-3) |
| R-3 | Inconsistent photos | G-2 |
| R-4 | Stale or sold items | Rule 4 (available + recent only) |
| R-5 | Dead-end after tap | Rule 5 |
| R-6 | Cost / cache: a product feed is a heavier query than the store list | Reuse the Redis public-cache with rounded coordinates; cap page size; index check on `retailers(latitude, longitude)` + products by `created_at` before shipping |

## 6. Rough build plan (when approved)

1. **API** — extend the public catalog surface with a nearby/new-arrivals product list (or a `products` mode on the existing stores route): same live-store filter, distance via `lib/geo.ts`, per-shop cap, threshold info in the response.
2. **Web** — `ProductCard` (shared with the row and later grid), "New arrivals near you" row on the homepage and `/stores`, tap → product on the shop page.
3. **Tests** — API: eligibility, per-shop cap, ordering, widening, threshold; web: card content, hidden-when-thin, share behaviour.
4. **Measure** — see §7.

Do **not** start step 1 until G-1…G-3 are checked and the owner approves this file.

## 7. Success metrics (decide whether to grow it into a full grid)

- Click-through from product row → shop page (per 100 homepage views).
- Product taps that lead to a WhatsApp enquiry within the same session.
- Time on page and pages per session versus the store-list-only version.
- Share taps per 100 product views.

## 8. Open decisions (owner)

| # | Decision | Default if not answered |
|---|----------|------------------------|
| D-1 | Row only, or a full product grid page too? | Row first; grid only if §7 shows pull |
| D-2 | Show price on the card? | Yes (₹, as the shop set it) |
| D-3 | Ask pilot shops before enabling? | Yes — ask, don't surprise them |
| D-4 | Should a shop be able to opt out of the public product feed? | Yes, if any pilot shop asks; not built by default |

## 9. Non-goals

Checkout/cart on the marketing page (removed 2026-08-31), price comparison, personalised ranking (F-037 "Picked for you" is a separate, in-store feature), and anything that needs a new retailer-app screen.
