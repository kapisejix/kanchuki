# Customer Phone Number & Universal QR Profile Architecture

**Document:** `docs/customer/customer-qr-identity-solution.md`
**Date:** 2026-08-30 (research pass 3 — adds cross-store activity tracking, unified profile & recommendation engine, §15–§19)
**Status:** Research & Architecture Proposal — decisions needed (§13). No code started.
**Context:** Concrete build spec for the "unified cross-retailer identity" decision recorded in `docs/customer/customer-profile-req.md` (there called **Option C**, roadmap item 21). §1–§14 = QR entry / phone capture. §15–§19 = the activity/profile/recommendation layer that identity unlocks (delivers deferred items 22–24). **Task breakdown:** `docs/superpowers/plans/2026-08-30-shopper-passport-and-profile.md`.

---

## 1. Problem

In offline ethnic-wear hubs (Chandni Chowk, Commercial Street, T. Nagar, Bapu Bazaar) a shopper walks into **5–10 boutiques in one afternoon**. Today's `ContactGate.tsx` makes each of those a wall:

- **A 4-field wall before any inventory** — name, phone, gender, consent — repeated per store. Benchmarks: a 3-field form converts ~10.1% vs ~3.6% at 9 fields; every added required field measurably drops completion; actions that take **under 30 s convert ~2×** those taking 2 min+ ([digitalapplied](https://www.digitalapplied.com/blog/landing-page-statistics-2026-conversion-data-points), [Kirro](https://kirro.io/landing-page-conversion-rate)). A warm in-store scan *should* convert 15–25% ([qr-code-generator](https://www.qr-code-generator.com/blog/qr-code-scan-rate-benchmark/)) — the gate is what burns it.
- **Privacy hesitation** — handing a raw mobile number to 10 unknown shopkeepers to *look at clothes*.
- **Dirty leads** — shoppers type `9899999999` to get past the gate. `ContactGate.tsx` doesn't verify anything today (it just writes `localStorage`), so every fake number lands in the retailer CRM.
- **No memory** — nothing links the 10 visits, for the shopper or across the platform.

## 2. Solution — "Kanchuki Shopper Passport"

One verified identity, held by Kanchuki, reused across every partner boutique.

1. **Verify phone once** (first partner store, or online beforehand) — number + OTP.
2. **Stores 2–10: catalog opens with zero typing.** A returning-shopper sheet, one tap (or browse straight through — see §3.3).
3. **Contact is shared with a store only on an explicit tap** — until then the number stays Kanchuki-scoped. This is the hesitation-killer (§4).
4. **On share:** visit logged to the shopper's `/my-stores`, verified walk-in lead written to that retailer's CRM, retailer's WhatsApp catalog link auto-dispatched (reuses the built WhatsApp Catalog Sync, CLAUDE.md #45).

**External precedent:** cross-merchant single-identity checkout networks (Bolt, Shop Pay, PayPal Fastlane) report ~50% conversion lift and ~50% larger orders once a shopper is on the network ([cardrates](https://www.cardrates.com/news/bolt-checkout-boosts-account-signups-and-conversions/), [PYMNTS](https://www.pymnts.com/news/ecommerce/2022/bolt-ceo-commerce-identity-checkout-operating-system-makes-one-click-checkout-ubiquitous/)). Same mechanic, applied to catalog entry instead of checkout.

---

## 3. UX Flow

### 3.1 Store #1 — first-time (~15 s)

```mermaid
sequenceDiagram
    autonumber
    actor C as Shopper (Ananya)
    participant W as kanchuki.com/{store}
    participant A as API (Fastify + MSG91)
    participant R as Retailer CRM / WhatsApp
    C->>W: Scan Shree Sarees QR
    W->>A: GET passport session? (HttpOnly cookie)
    A-->>W: none
    W-->>C: Co-branded gate — phone + "unlock 500+ boutiques" + [Skip, just browse]
    C->>W: Enters number, taps Verify
    A->>C: OTP via WhatsApp (SMS fallback)
    C->>W: Enters / auto-reads OTP
    A->>A: Upsert CustomerAccount(phone_hash); Set-Cookie passport (HttpOnly, 180d)
    C->>W: Affirmative tick "Send my contact to Shree Sarees for WhatsApp catalog" + Enter
    A->>R: Upsert Customer(retailer_id, phone) source=QR_SCAN, consent_given=true, consent_at
    A->>R: Enqueue WhatsApp welcome + catalog link
    W-->>C: Catalog
```

### 3.2 Stores #2–10 — returning (~1 s)

Cookie validates on load. Sheet:

> **Welcome back, Ananya ✨** — entering **Meena Bazaar**
> ☐ Send my contact to Meena Bazaar for its WhatsApp catalog & updates
> **[ Enter catalog → ]**

- **Enter catalog** works whether or not the box is ticked — entering the catalog shares no new PII (the passport already exists).
- Ticking the box + Enter = writes the `Customer` row + consent + WhatsApp dispatch for *this* store only.
- **No auto-submit of the consent tick.** Auto-advancing into the catalog after ~2 s is acceptable *only* if it does not also share contact — DPDP consent must be an affirmative action, never a timer (§6).

### 3.3 The "just browse" ladder (new — reduces the store-1 wall)

Store 1's gate offers **"Skip — just browse"**. Shopper sees the full catalog with no passport. The gate re-appears only when they hit a **contact-requiring action**: Enquire, Favorite (needs cross-store profile), "Get on WhatsApp", checkout. This moves the ask from "before you see anything" to "when you want something" — the single biggest conversion lever after the scan is a page with one clear action, not a wall ([digitalapplied](https://www.digitalapplied.com/blog/landing-page-statistics-2026-conversion-data-points)).

> **Decision needed (§13-a):** does the retailer still get a lead for a browse-only visit? Recommended: an *anonymous* visit counter, no phone, no CRM row until an action.

---

## 4. Why the shopper stops hesitating

The ask is explicitly "so customers don't hesitate to share their number." Design for that:

| Lever | Mechanism |
| --- | --- |
| **Number isn't handed to strangers** | Verified to Kanchuki. Each store gets it only on a per-store affirmative tap. Pitch on the gate: *"Your number stays with Kanchuki — you choose which shops get it."* |
| **Verify once, not 10×** | One OTP. Stores 2–10 are 1-tap. |
| **Proof we're not flashing it around** | Number shown back masked (`98765-XXXXX`) everywhere in the shopper UI. |
| **One-tap mute that actually works** | `/my-stores` → mute any store. Enforced at WhatsApp send time (`is_muted` check), not just a UI toggle. |
| **Reversible** | New passport withdrawal flow — per-store mute/remove on `/my-stores`, whole-passport delete on `/my-profile`. (The existing `/consent/revoke` is VTO-training-only and `/account-deletion` is retailer-only — neither is reused.) |
| **No password, no app** | Cookie-backed; PWA. |
| **Skip is a real option** | §3.3 — browsing never requires the number. |

---

## 5. Retailer value

Shopkeepers want leads and sales, not an auth silo. Framed right this is a straight upgrade:

| Factor | Per-store form (today) | Passport |
| --- | --- | --- |
| QR → catalog conversion | ~15–25% warm scan, minus the gate | 1-tap for repeat scanners; "just browse" removes the wall |
| Lead quality | Unverified; fake numbers common (no OTP today) | 100% OTP-verified Indian mobiles |
| CRM record | Only what was typed | Verified name + phone + visit timestamps + `usual_size` from the global profile |
| WhatsApp follow-up | Manual | Auto catalog-link dispatch on the consent tap (reuses Catalog Sync) |
| Lead alert | None | Push to retailer app: *"Ananya Sharma is browsing your catalog via QR"* |

Retailer never sees the raw number until the shopper's consent tap for that store — which is also what makes the shopper willing to tap.

---

## 6. DPDP compliance (Rules 2025 — corrected)

India's **DPDP Rules 2025** were notified **13 Nov 2025** and operationalise the DPDP Act 2023 ([EY](https://www.ey.com/en_in/insights/cybersecurity/decoding-the-digital-personal-data-protection-act-2023), [PIB](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2190014&reg=3&lang=2)). Consequences for this design:

- **Consent = free, informed, specific, unambiguous, affirmative.** → The per-store WhatsApp consent box **must ship unticked**. AntiGravity's earlier draft (default-checked, "auto after 2 s") would not be valid consent. Schema default is `whatsapp_consent = false`.
- **Itemised notice at the point of collection** — what's collected (mobile, name, gender-optional), why (universal profile + share with stores you tap to enable WhatsApp catalog/order updates), and a link to withdraw. Show it on the store-1 gate and link it on the 2–10 sheet.
- **Withdrawal as easy as granting** — per-store mute + whole-passport delete via a **new** passport flow (`/my-stores`, `/my-profile`, `POST /v1/public/passport/delete`). The existing `/consent/revoke` (VTO-training-only) and `/account-deletion` (retailer-only) are not reusable. Each consent + each withdrawal writes a timestamped row (`whatsapp_consent_at`, plus an append-only `ConsentEvent` log for audit).
- **Purpose limitation** — the passport's phone is used for profile + shopper-tapped store sharing only. No selling, no cross-store marketing without a further specific consent.
- **Kanchuki is the Data Fiduciary** for the passport; each retailer is a **separate Data Fiduciary** for their CRM copy once shared. The share event is the lawful basis hand-off — log it.
- **Children:** if `age`/`gender` capture ever implies under-18, DPDP needs verifiable parental consent — keep age out of the passport for now.

---

## 7. Data model

Reuse what exists. `CustomerLeadSource` enum **already has `QR_SCAN`** (`packages/db/prisma/schema.prisma:1805`); `Customer` is already keyed `@@unique([retailer_id, phone])` with `phone_hash`, `consent_given`, `consent_at`, `usual_size`, `source`.

```prisma
// NEW — global shopper identity, sits above per-retailer Customer rows
model CustomerAccount {
  id           String   @id @default(cuid())
  // No auth_user_id — Supabase Auth is retailer-only; passport is cookie-based (§8).
  phone        String   @unique          // E.164 +9198...
  phone_hash   String   @unique          // SHA-256, lookup + privacy index (matches Customer.phone_hash)
  name         String?
  gender       Gender?
  city         String?
  state        String?
  usual_size   String?                   // feeds cross-store size reco (roadmap N)
  is_verified  Boolean  @default(true)   // set true only after OTP
  created_at   DateTime @default(now())
  updated_at   DateTime @updatedAt
  deleted_at   DateTime?

  store_visits   CustomerStoreVisit[]
  retailer_links Customer[]              // back-reference; add customer_account_id to Customer
  consent_events ConsentEvent[]

  @@map("customer_accounts")
}

// NEW — one row per (shopper, retailer); scan + per-store consent state
model CustomerStoreVisit {
  id                  String   @id @default(cuid())
  customer_account_id String
  retailer_id         String
  source              CustomerLeadSource @default(QR_SCAN)   // reuse existing enum
  first_visited_at    DateTime @default(now())
  last_visited_at     DateTime @default(now())
  visit_count         Int      @default(1)
  contact_shared      Boolean  @default(false)               // has the raw number been written to this retailer's Customer row
  whatsapp_consent    Boolean  @default(false)               // DPDP: NOT default true
  whatsapp_consent_at DateTime?
  is_muted            Boolean  @default(false)               // checked at WhatsApp send time

  customer_account CustomerAccount @relation(fields: [customer_account_id], references: [id], onDelete: Cascade)
  retailer         Retailer        @relation(fields: [retailer_id], references: [id], onDelete: Cascade)

  @@unique([customer_account_id, retailer_id])
  @@index([retailer_id, last_visited_at])
  @@map("customer_store_visits")
}

// NEW — append-only consent/withdrawal audit (DPDP record-keeping)
model ConsentEvent {
  id                  String   @id @default(cuid())
  customer_account_id String
  retailer_id         String?
  kind                String   // PASSPORT_CREATED | STORE_CONSENT_GRANTED | STORE_MUTED | STORE_CONSENT_WITHDRAWN | PASSPORT_DELETED
  notice_version      String   // which notice text was shown
  ip_hash             String?
  user_agent          String?
  created_at          DateTime @default(now())
  customer_account    CustomerAccount @relation(fields: [customer_account_id], references: [id], onDelete: Cascade)

  @@index([customer_account_id, created_at])
  @@map("consent_events")
}

// enum CustomerLeadSource — add:  WHATSAPP_LINK  DIRECT_WEB   (QR_SCAN already present)

// model Customer — add:
//   customer_account_id String?
//   customer_account    CustomerAccount? @relation(fields: [customer_account_id], references: [id])
```

**RLS:** `customer_accounts`, `customer_store_visits`, `consent_events` are new PII tables → RLS from day one (see `kanchuki-rls-convention`, `customer-profile-req.md` §"new PII surface"). Retailer role reads only `customer_store_visits` rows for its own `retailer_id`, and only where `contact_shared = true`.

---

## 8. Session & cookie architecture

### 8.1 Same root domain — already true

Storefronts are path-based on one domain: `kanchuki.com/{store}/...` (`ContactGate` redirects to `/${slug}/categories`; legacy `/c/{slug}` redirects to canonical). A cookie set at store 1 is sent to every other store automatically. **No third-party-cookie problem, no redirect dance.**

### 8.2 The cookie — server-set, ITP-exempt

- Set via `Set-Cookie` **response header from the Kanchuki server** (Next route handler or API) — **not** `document.cookie`.
- `HttpOnly; Secure; SameSite=Lax; Domain=kanchuki.com; Max-Age=15552000` (180 d).
- Safari ITP's 7-day cap applies **only to JS-set cookies**; server-set first-party `HttpOnly` cookies persist their full TTL (up to 400 d) ([Stape](https://stape.io/blog/safari-itp), [Datafly](https://www.dataflysignal.com/blog/itp-7-day-cookies-and-how-to-fix-them)). **Caveat:** Safari 16.4+ re-imposes 7 days if the setting server looks like a tracker behind a CNAME — set the cookie from the apex app origin, not a CNAME'd subdomain or tag host.
- Contents: opaque session id → Redis/DB lookup to `CustomerAccount`. No PII in the cookie.
- **`localStorage` is not identity storage** — ITP caps JS-written storage similarly and in-app webviews wipe it. At most cache a display name for instant paint, and render correctly when it's absent.

### 8.3 In-app browser reality (the actual hard case)

Scanning via Paytm / GPay / Instagram / Google Lens opens an **isolated WebView with its own cookie jar** — the Chrome/Safari passport cookie is not visible there. This, not subdomains, is what breaks "scan 10, type once."

Mitigations, in order:
1. **Detect the WebView** (UA sniff) → banner: *"Open in Chrome for 1-tap entry across shops"* with an `intent://` / `x-safari-` deep link.
2. **WhatsApp deep-link login** — `wa.me/<kanchuki-number>?text=LOGIN-<nonce>`; shopper sends it, our webhook verifies the sender number = passport, issues the session on return. One tap, no OTP typing, and it round-trips through a stable identity. Reuses the WhatsApp rail already built.
3. **Accept the floor:** worst case the shopper does **one OTP per distinct browser**, not per store. Still 1× in Paytm, 1× in Chrome — vs 10× today.

---

## 9. Abuse & rate limiting

- **Per-passport scan velocity** — cap distinct-retailer first-visits per hour (bot / scraper).
- **Retailer self-inflation** — retailer scanning their own QR repeatedly to fake leads: dedupe on `(customer_account_id, retailer_id)` (the `@@unique`), and don't count a visit as a lead until `contact_shared = true`.
- **OTP endpoint** — reuse existing MSG91 send throttle + `awaitRedisReady` handshake guard (CLAUDE.md "Redis handshake race" — do not reintroduce `lazyConnect`).
- **Phone enumeration** — `/my-stores` and passport lookup must require the session cookie; never expose "does this number have a passport" unauthenticated.

---

## 10. Migration from current state

1. **`ContactGate.tsx` today:** no OTP, per-store `localStorage` keys (`kanchuki_lead_{slug}`), POST → `/api/{store}/leads` → `POST /v1/public/retailers/{store}/leads`. OTP on web is **net-new** (mobile has the MSG91 widget; API has the server-side MSG91 lib — reuse `apps/api/src/lib/msg91-otp.ts`).
2. **Backfill:** for existing `Customer` rows, create a `CustomerAccount` per distinct `phone_hash`, link `customer_account_id`. Existing `consent_given` / `consent_at` copy into a `CustomerStoreVisit` with `contact_shared = true`. **Consent does not retroactively become platform-wide** — it stays per store as recorded.
3. **Cutover:** `ContactGate` checks the passport cookie first; falls back to the current inline form (now + OTP) when absent. Old `localStorage` keys can stay as a legacy "seen this store" hint but are no longer the source of truth.

---

## 11. Current vs proposed

| | Today (`ContactGate.tsx`) | Passport |
| --- | --- | --- |
| Verification | none (localStorage only) | OTP once (WhatsApp + SMS fallback) |
| Store 1 | 4-field form, no skip | phone + OTP, or "just browse" |
| Stores 2–10 | full form re-typed each store | 1 tap, or auto-enter catalog (no re-consent) |
| Persistence | `localStorage` per slug (ITP-capped, webview-wiped) | server-set `HttpOnly` cookie, 180 d, ITP-exempt |
| Retailer gets number | immediately, unverified | only on per-store affirmative tap, verified |
| Consent | one pre-required checkbox | unticked per-store opt-in + audit log |
| Shopper hub | none | `/my-stores` — visits, mute, delete |
| WhatsApp | manual | auto dispatch on consent tap (Catalog Sync) |

---

## 12. Roadmap

**Phase 1 — Passport + 1-tap entry**
- Migration: `CustomerAccount`, `CustomerStoreVisit`, `ConsentEvent`, `Customer.customer_account_id`, enum additions. RLS policies.
- Web OTP: `POST /v1/public/passport/otp/{send,verify}` on the API, reusing `msg91-otp.ts` + `awaitRedisReady`.
- Session: server-set `HttpOnly` cookie + Redis session store + `GET /v1/public/passport/me`.
- `ContactGate.tsx`: cookie check → returning sheet (§3.2) or first-time (phone+OTP+notice, §3.1) or "just browse" (§3.3).
- Lead write only on the consent tap → existing `/v1/public/retailers/{store}/leads` path, extended with `customer_account_id` + `contact_shared`.
- Security tests (checkout/auth touched) + `admin.login.test.ts` if admin auth touched.

**Phase 2 — Auto WhatsApp dispatch**
- On `STORE_CONSENT_GRANTED`, enqueue the retailer's WhatsApp welcome + catalog link via the built Catalog Sync / MSG91 rail. Respect `is_muted` at send.

**Phase 3 — Shopper hub `/my-stores`**
- Visited boutiques (masked number, dates), per-store mute, whole-passport delete (new `POST /v1/public/passport/delete` — not the retailer `/account-deletion` page), cross-store wishlist + `CustomerFashionDNA` unification (the rest of Option C).

---

## 13. Decisions needed — **LOCKED (2026-08-30)**

All decisions locked with recommended defaults. Implementation follows.

- **a. Browse-only visit** → **Anonymous counter only.** No phone, no CRM row until a contact-requiring action.
- **b. Passport scope of `name`/`gender`** → **Name optional, gender off the passport.** Retailer can still ask in CRM. Removes a DPDP edge (children).
- **c. OTP channel default** → **Option 1: MSG91 web widget** (recommended). Mobile already ships the widget; `verifyMsg91WidgetToken()` already exists server-side (`msg91-otp.ts`). No DLT dependency (MSG91's provisioned route). SMS stays as fallback once DLT clears.
- **d. Cookie TTL** → **180 days, sliding** — refresh on each scan.
- **e. Session store** → **DB row + Redis cache.** DB for durability, Redis for hot-path reads.
- **f. Auto-enter timer on stores 2–10** → **No timer.** Explicit 1-tap only. Timer consent is not valid under DPDP.
- **g. Personalized recommendations default** → **ON with clear notice + easy off.** Core UX; toggle covers withdrawal.
- **h. Embedding provider** → **Keep `text-embedding-3-small` for v1.** Revisit if cost/latency bites.
- **i. Interaction retention window** → **24 months for raw `CustomerInteraction` rows.** Aggregates (affinities, vector) retained while account is active.
- **j. "For You" as home** → **Separate tab** until CTR is proven.
- **k. c/[slug] vs [store] surface** → **`[store]` is canonical.** `c/[slug]` stays for backward compat; profile features target `[store]`.
- **l. Retailer alert** → **Drop for v1.** Retailer sees the new lead in their Customers tab on next app open. No push notification backend exists.

---

## 14. Recommendation

Build it — but three corrections to the earlier draft are load-bearing:

1. **Consent ships unticked, per store, with an audit log.** Pre-checked / timer consent is not valid under DPDP Rules 2025.
2. **Separate "enter the catalog" from "share my contact."** Entering is free (passport already exists); sharing is the affirmative tap. This is both the compliance line and the reason shoppers will actually tap.
3. **The cookie must be server-set `HttpOnly` from the apex origin** — the only way it survives Safari ITP past 7 days; `localStorage` identity is dead on arrival. In-app WebViews still cost one OTP each — mitigate with a WhatsApp deep-link login, accept the floor.

Everything else in the "Shopper Passport" concept holds: verify once, 1-tap thereafter, verified leads, auto WhatsApp, `/my-stores` hub, network effects.

---

## 15. Cross-Store Activity Tracking & Unified Profile

Once a passport exists, **every action the shopper takes at any Kanchuki store attaches to their `CustomerAccount`**, not just one retailer's silo. This is the raw material for the profile screen (§17) and the recommendation engine (§16). It delivers `customer-profile-req.md` deferred items 22–24.

### 15.1 What already exists (reuse, don't rebuild)

| Asset | Today | Change needed |
| --- | --- | --- |
| `CustomerInteraction` (`schema.prisma:868`) | `type: view\|favorite\|enquiry\|purchase\|try_on`, `customer_id` (retailer-scoped) + `metadata Json` | add `customer_account_id String?`; widen `type`; write it on every event when a passport session is present |
| `CustomerFashionDNA` (`schema.prisma:844`) | `preference_vector vector(1536)`, `*_affinities Json`, `budget_range Json`, `confidence_score` — one row per retailer relationship | add `customer_account_id String? @unique`; the identity row becomes the source of truth for recs, retailer rows kept for back-compat |
| `ProductEmbedding` (`schema.prisma:700`) | 1536-dim `text-embedding-3-small` per product, `input_hash` de-dupe | ensure coverage for every public ACTIVE product (backfill job) |
| pgvector | enabled (`schema.prisma:9`), `<->` KNN available | none |
| Style quiz, AI Stylist, restock-notify, recently-viewed | built (`customer-profile-req.md` §12 items 8, 9, 11, 12) — same-store / localStorage scope | re-point to identity scope when a passport session exists |

### 15.2 Signal taxonomy

Extend `CustomerInteraction.type`:

```
view | favorite | unfavorite | enquiry | purchase | try_on
| search | collection_open | not_interested | store_visit | quiz_answer
```

`metadata Json` contract per type:

| type | metadata |
| --- | --- |
| `view` | `{ product_id, dwell_ms, source: "feed"\|"search"\|"catalog"\|"discovery" }` |
| `search` | `{ query, filters: { category?, color?, fabric?, price_max? }, result_count }` |
| `not_interested` | `{ product_id, tags: string[] }` |
| `collection_open` | `{ collection_id, retailer_id, channel: "whatsapp"\|"web" }` |
| `store_visit` | `{ retailer_id, entry: "qr"\|"link"\|"discovery" }` |
| `quiz_answer` | `{ question_id, answer }` |

### 15.3 Signal weights & decay (feeds the vector + affinities)

| Signal | Weight |
| --- | --- |
| `purchase` | +10 |
| `favorite` | +5 |
| `enquiry` | +4 |
| `try_on` | +3 |
| `collection_open` | +2 |
| `view` | +1 (×1.5 if `dwell_ms > 8000`) |
| `not_interested` | −5 |

Recency decay: exponential, **half-life 60 days**. `confidence_score` = `min(1, interaction_count / 20)`.

### 15.4 Unified profile store

- **`preference_vector`** = recency-decayed, signal-weighted **mean of `ProductEmbedding.embedding`** over products the shopper interacted with (any store). No model training. Recompute: debounced on write (≤1/min per account) + nightly batch reconcile.
- **`*_affinities` JSON** = tag histograms (color / style / fabric / occasion), aggregated across stores, same shape as today.
- **`budget_range`** = inferred from `search` filters applied + `purchase` prices → `{ p25, p50, p75 }` in paise.
- **Explicit overlays** (always beat inferred signal, applied as hard filters, stored on `CustomerAccount` / `CustomerStoreVisit`): `usual_size`, quiz answers, regional-weave prefs, followed / muted stores.

### 15.5 New derived tables

```prisma
// Identity-scoped recently-viewed — replaces the localStorage-only same-store
// tracker (customer-profile-req.md item 8) for shoppers with a passport.
model CustomerRecentlyViewed {
  id                  String   @id @default(cuid())
  customer_account_id String
  product_id          String
  retailer_id         String
  viewed_at           DateTime @default(now())
  @@unique([customer_account_id, product_id])
  @@index([customer_account_id, viewed_at])
  @@map("customer_recently_viewed")
}

// Identity-scoped cross-store favorites — delivers deferred item 22.
model CustomerWishlistItem {
  id                  String   @id @default(cuid())
  customer_account_id String
  product_id          String
  retailer_id         String
  created_at          DateTime @default(now())
  @@unique([customer_account_id, product_id])
  @@index([customer_account_id])
  @@map("customer_wishlist_items")
}

// Nightly precomputed store-discovery score per shopper (§16.4).
model StoreAffinity {
  id                  String   @id @default(cuid())
  customer_account_id String
  retailer_id         String
  score               Float
  computed_at         DateTime @default(now())
  @@unique([customer_account_id, retailer_id])
  @@index([customer_account_id, score])
  @@map("store_affinities")
}
```

### 15.6 Cold start

Until `interaction_count >= 5`: recs fall back to **quiz-tag filter + `usual_size` + trending**. The built style quiz + `usual_size` + first 3 favorites seed the vector.

---

## 16. Recommendation & Discovery Engine

**No ML training. pgvector cosine + a rules layer.** One ranking function, reused by every surface.

### 16.1 Ranking pipeline

1. **Candidates** — pgvector KNN (`preference_vector <-> ProductEmbedding.embedding`, ~200) across all public ACTIVE products. Exclude: out-of-stock, muted-store products, `not_interested` product ids, suspended retailers.
2. **Hard filters** — size availability vs `usual_size`; price within `budget_range` ±20%; city / radius when the surface is location-bound; retailer active.
3. **Re-rank** — base = cosine score; boosts: followed store +0.10, same city +0.05, new arrival (<14 d) +0.05, active price-drop +0.05.
4. **Diversity** — max 3 products per retailer in the top 20.

### 16.2 "For You" feed

- Route: `/for-you` (customer web). Endpoint returns paginated ranking output.
- Cold / empty → quiz-tag + trending (§15.6).

### 16.3 Personalized search

- Existing keyword / NL search (`"cotton pink suits under ₹2000"`) runs first for recall.
- When a passport session is present, results are **re-ranked** by `cosine(preference_vector, product)` blended 50/50 with the text relevance score.
- Autocomplete suggestions seeded from the shopper's top affinity tags.

### 16.4 Store discovery

- Route: `/discover-stores`; also feeds the existing Kanchuki Store Directory (`/stores`).
- `StoreAffinity.score` = `cosine(preference_vector, store_catalog_centroid)` + same-city bonus + **co-visitation** ("shoppers with similar taste also visited", from `CustomerStoreVisit`).
- `store_catalog_centroid` = mean of that retailer's `ProductEmbedding`s, recomputed nightly.

### 16.5 Proactive triggers (push / WhatsApp)

Gated by per-store consent + `is_muted` + **frequency cap 2 / week / store**:

| Trigger | Condition |
| --- | --- |
| New-arrival match | new product, `cosine > 0.82`, followed or previously-visited store |
| Restock | favorited item back in stock (reuses built NotifyWhenAvailable, now identity-scoped) |
| Price drop | active discount on a viewed / favorited item |
| Collection published | a followed store publishes a collection |

---

## 17. Customer Profile Screen

Routes: `/my-profile`, `/my-stores`. **Everything tracked is visible, editable, and deletable** — this is both DPDP (§18) and the trust mechanic (§4).

| Section | Content |
| --- | --- |
| **Your Style** | affinity tags as chips (`Silk · Bandhani · Festive · ₹3k–8k`); "Retake quiz"; edit / remove any chip (writes an explicit override that beats inferred signal) |
| **Visited Stores** (`/my-stores`) | list with **masked** number shown back (`98765-XXXXX`), first / last visit, per-store mute toggle, "remove me from this store" |
| **Saved** | cross-store favorites (`CustomerWishlistItem`) — delivers item 22 |
| **Recently Viewed** | cross-store (`CustomerRecentlyViewed`) |
| **Enquiries & Orders** | items enquired / purchased, per store, with status |
| **Notifications** | master toggle + per-trigger toggles (new arrivals / restock / price drop / collections) |
| **Data controls** | "Download my data" (JSON), "Turn off personalized recommendations" (keeps account, stops profiling), "Delete my Kanchuki passport" → new `POST /v1/public/passport/delete` (retailer `/account-deletion` page is not reused) |

---

## 18. DPDP — Profiling (extends §6)

- Behavioral tracking / profiling is a **distinct purpose** → its own itemised notice line: *"Kanchuki records what you view, save, and buy across stores to recommend collections and shops you'll like."*
- **"Personalized recommendations" toggle** on the profile — default ON, one tap OFF. OFF ⇒ stop writing behavioral signals, freeze then clear `preference_vector`, feed falls back to non-personalized. This is the withdrawal mechanism.
- **No profiling of children** — age stays off the passport.
- `ConsentEvent.kind` adds: `PROFILING_ENABLED | PROFILING_DISABLED | DATA_EXPORTED`.
- **Retention** — raw `CustomerInteraction` rows older than 24 months auto-pruned (cron); aggregates (affinities, vector) retained while the account is active.
- **Retailer isolation** — a retailer never sees another store's activity. Retailer-facing taste analytics are **aggregate-only** over their own `customer_store_visits` where `contact_shared = true` (e.g. "62% of your visitors want bridal lehenga under ₹50k"). Build with the `dataviz` skill.

---

## 19. Roadmap (supersedes §12 — full scope)

§12's Phases 1–3 stay as written (identity + WhatsApp dispatch + `/my-stores`). The profile / recommendation layer adds:

| Phase | Deliverable | Depends on |
| --- | --- | --- |
| **4 — Activity tracking** | `CustomerInteraction` identity-scoped + widened; client event beacon; `CustomerRecentlyViewed`; retention cron | Phase 1 |
| **5 — Unified Fashion DNA** | `CustomerFashionDNA` identity-scoped; affinity + `budget_range` aggregation job; `preference_vector` compute; `ProductEmbedding` coverage backfill | Phase 4 |
| **6 — Profile screen** | `/my-profile` (Your Style, Saved cross-store, Recently Viewed, Enquiries/Orders, notif toggles, data controls); `CustomerWishlistItem` | Phases 4–5 |
| **7 — Recommendations** | ranking pipeline service; "For You" feed; personalized search re-rank; `StoreAffinity` job + `/discover-stores` | Phases 5–6 |
| **8 — Proactive triggers** | new-arrival / restock / price-drop / collection triggers → WhatsApp/push with frequency cap | Phases 2, 7 |
| **9 — Profiling compliance & retailer analytics** | recommendations toggle + freeze/clear; data export; DPDP notice-copy pass + `notice_version`; aggregate retailer taste report | Phases 4–7 |

Full task breakdown with per-task skills, files, interfaces, test plans and acceptance criteria: **`docs/superpowers/plans/2026-08-30-shopper-passport-and-profile.md`**.

**Docs to update when each phase ships** (per CLAUDE.md rule 10–11): CLAUDE.md feature index + `docs/BUILD-LOG.md`; `docs/PLAN.md`; `docs/PRO-REQUIREMENTS.md`; `docs/DATABASE.md` (new tables + RLS); `docs/API.md` (new endpoints); `docs/SECURITY.md` (§12–18 profiling + PII surface); `docs/customer/customer-profile-req.md` §12 (items 21–24).

---

### Sources

- QR / form conversion: [digitalapplied](https://www.digitalapplied.com/blog/landing-page-statistics-2026-conversion-data-points), [Kirro](https://kirro.io/landing-page-conversion-rate), [qr-code-generator](https://www.qr-code-generator.com/blog/qr-code-scan-rate-benchmark/)
- Cross-merchant identity lift: [cardrates/Bolt](https://www.cardrates.com/news/bolt-checkout-boosts-account-signups-and-conversions/), [PYMNTS](https://www.pymnts.com/news/ecommerce/2022/bolt-ceo-commerce-identity-checkout-operating-system-makes-one-click-checkout-ubiquitous/)
- DPDP Rules 2025: [EY](https://www.ey.com/en_in/insights/cybersecurity/decoding-the-digital-personal-data-protection-act-2023), [PIB](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2190014&reg=3&lang=2), [Lexology](https://www.lexology.com/library/detail.aspx?g=7e3af947-10aa-4712-bc1e-54179a613409)
- Safari ITP / cookies: [Stape](https://stape.io/blog/safari-itp), [Datafly](https://www.dataflysignal.com/blog/itp-7-day-cookies-and-how-to-fix-them), [Snowplow](https://snowplow.io/blog/tracking-cookies-length)
- OTP India (SMS vs WhatsApp): [messagecentral](https://www.messagecentral.com/en-in/blog/sms-otp-pricing-india), [anantya](https://anantya.ai/blog/sms-fallback-for-whatsapp-otp-india/), [Authgear](https://www.authgear.com/post/whatsapp-api-pricing/)
