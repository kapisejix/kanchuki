# Customer PWA — Home-Screen Icon, Visited-Store List & Push Notifications

**Document:** `docs/tasks/pending/customer-pwa-push-notifications.md`
**Date:** 2026-09-17
**Status:** 🟡 **Phase A ✅ Built (2026-09-17)** — see `docs/BUILD-LOG.md` §2026-09-17 and `CLAUDE.md` row 73: `/my-stores` visited-store list, `manifest.json` `start_url` → `/my-stores`, install CTA (module-scope `beforeinstallprompt` capture), plus the follow-on `/login` + `return_to` work (`docs/tasks/done/return-to-post-login-redirect.md`) and the `/stores` `ShopperEntry` state-aware entry point. **Phases B–D 🔴 Planned, no code yet** — push subscription model + VAPID/web-push send job, `push` service-worker handler, enforced iOS Add-to-Home-Screen, consent/mute UI, retailer subscriber counts. (This header previously read "research & roadmap only — no code started"; that was true when written and is now stale.)
**Answers:** owner question about giving customers a phone-icon entry point into "all stores they've visited," plus browser push notifications for new products/collections, without replacing WhatsApp share.
**Related:** `docs/PRO-REQUIREMENTS.md §36 (Shopper Passport)` (Shopper Passport — identity/cookie/consent architecture this feature sits on top of), `docs/PRO-REQUIREMENTS.md §36 (Customer Profile)` §12.

---

## 1. What you asked

1. Customer gets a phone icon (like an app icon) that isn't a real app — clicking it opens the existing browser catalog.
2. That icon's home screen shows **all the retailer stores the customer has visited/accessed**, not just one store.
3. Tapping a store opens its catalog exactly like today.
4. When a retailer uploads new products, customers who visited that store get a **browser notification** (not WhatsApp) so they see new items without the retailer doing anything.
5. When a retailer publishes a new collection, customers get a **browser notification** instead of the retailer manually WhatsApp-ing the link.
6. WhatsApp collection-share must keep working exactly as it does today — this is an *additional* channel, not a replacement.
7. Identity is via the phone number + OTP customers already register with when they scan a store's QR — every notified customer must be a real, known number in your database, not a stranger.

**Verdict: yes, all of this is buildable with standard, widely-used web technology (PWA + Web Push). Nothing here needs the app stores, and nothing here needs a second phone-number system — it slots directly onto identity work already designed for this codebase.**

---

## 2. The good news: 80% of the hard part is already designed

This is not a new concept for Kanchuki. `docs/PRO-REQUIREMENTS.md §36 (Shopper Passport)` ("Shopper Passport") already specs almost exactly this, for a different original reason (killing the repeat-form wall across boutiques). It has already been partially built:

| Piece | Status in repo | Where |
|---|---|---|
| Verified phone identity (`CustomerAccount`, one row per phone, OTP-verified) | ✅ Built (migrations `079_passport_core`, `080_passport_preferences`, `081_passport_personalization_toggle`) | `packages/db/prisma/schema.prisma:2112` |
| Per-store visit record (`CustomerStoreVisit` — which retailer, when, consent state) | ✅ Built | `schema.prisma:2152` |
| Cross-store customer profile page | ✅ Built | `apps/web/src/app/(shopper)/my-profile/page.tsx` |
| **List of visited stores page (`/my-stores`)** | ❌ Not built yet | spec exists, §17 of the passport doc |
| PWA manifest + installable icon | ✅ Exists (`apps/web/public/manifest.json`, generic Kanchuki icon, `display: standalone`) | not yet promoted with an install prompt |
| Service worker | ✅ Exists (Serwist-generated, `apps/web/public/sw.js`) — currently only precaches assets, **does not handle push events** | needs a `push` event listener added |
| **Web Push subscription + send infrastructure** | ❌ Not built — explicitly flagged as a gap: *"Retailer alert → Drop for v1... No push notification backend exists."* (passport doc §13-l) | this document proposes closing that gap |
| Restock / new-arrival / collection **trigger logic** | ✅ Designed, not wired to a delivery channel (passport doc §16.5) | trigger conditions defined; only WhatsApp delivery exists today |
| WhatsApp catalog/collection share | ✅ Built and live (Catalog Sync, Social Composer) | unaffected — stays as-is |

So the real gap is narrow: **(a)** the `/my-stores` list page, **(b)** an installable-icon prompt, **(c)** a Web Push subscribe-and-send pipeline wired to the product-upload and collection-publish events that already exist in the codebase.

---

## 3. How each piece actually works

### 3.1 The "app icon" that isn't an app

This is a **PWA (Progressive Web App)**, not a native app — no Play Store, no APK, no review process.

- `manifest.json` already declares `name`, icons, `display: standalone` — the ingredients for "Add to Home Screen" already exist.
- What's missing is *asking* — Chrome/Edge on Android can auto-show an install prompt (`beforeinstallprompt`), or you trigger it yourself with a "Add Kanchuki to your Home Screen" button after a customer's first successful store visit.
- Once added, the customer has an icon on their home screen indistinguishable at a glance from a native app icon. Tapping it opens `start_url` (currently `/`) in a chrome-less window — no address bar, no tabs, feels like an app.
- **Today `start_url` is generic** (`/`). For this feature it should route to the new `/my-stores` page instead of the marketing home page, so the icon *is* the "my boutiques" screen.

### 3.2 The visited-store list

- Backed entirely by `CustomerStoreVisit` (already in the schema) — one row per (customer, retailer) they've interacted with.
- Page `/my-stores`: reads the passport session cookie → looks up the customer's `CustomerAccount` → lists every `CustomerStoreVisit`, sorted by `last_visited_at`, each row = store name/logo/last-visit date, tap → opens that store's existing catalog exactly as today.
- No new "browsing" mechanism — it's a directory into the catalog pages that already work.

### 3.3 New-product / new-collection browser notifications

This is **Web Push** — the same technology behind Gmail, Twitter, Facebook, and most news sites showing you a notification even when the browser is closed.

Mechanically:
1. Customer's browser holds a **push subscription** (an opaque endpoint URL + encryption keys) once they tap "Allow" on a notification permission prompt.
2. That subscription is saved on your server, tied to `CustomerAccount` + the specific `retailer_id` they subscribed to (i.e., stores they've visited/consented to hear from).
3. When a retailer uploads a product or publishes a collection (events that already fire in the existing product-create / collection-publish code paths), your server looks up all subscribed customers for that retailer and sends a push message via the **Web Push protocol** (standard library: `web-push` npm package + VAPID keys — no third-party SaaS required, no per-message cost).
4. The browser's service worker (`sw.js`) wakes up — even if Kanchuki isn't open — and shows an OS-level notification: *"Meena Bazaar just added 12 new items"* or *"Shree Sarees published a new Diwali collection"*.
5. Tapping the notification opens that store's catalog/collection directly.

This reuses the trigger conditions already designed in the passport doc (§16.5: new-arrival match, restock, price drop, collection published) — they were speced for "push / WhatsApp" delivery and only the WhatsApp half was ever wired up. This document is about wiring the push half.

---

## 4. The Android/iOS reality check (important, don't skip this)

Web Push does **not** behave identically everywhere — this determines the rollout order:

| Platform | Behaviour |
|---|---|
| **Android, Chrome/Edge/Samsung Internet** | Push notifications work in the regular browser tab — **no install required**. Best case, works today for the majority of your Indian customer base. |
| **Android, installed PWA (home-screen icon)** | Works identically, plus the app-like icon/full-screen feel. |
| **iOS/iPadOS Safari (16.4+, released March 2023)** | Web Push **only works if the customer has added the site to their Home Screen first**. A plain Safari tab cannot receive push notifications — this is an Apple restriction, not something you can code around. |
| **iOS, older than 16.4** | No web push at all. Given the March 2023 release date, this is now a small and shrinking slice. |
| **In-app browsers** (WhatsApp/Instagram/Paytm webview when a customer taps a shared link) | Cannot install a PWA or hold a push subscription — same limitation the passport doc already flags for the identity cookie (§8.3). Customer must open the link in a real browser (Chrome/Safari) at least once. |

**Consequence for the roadmap:** ship push for Android first (majority, zero extra friction), and for iOS make "Add to Home Screen" a **hard prerequisite** the UI enforces, not an optional nicety — a banner that says *"Add Kanchuki to your Home Screen to get notified about new arrivals"* before offering the notification permission prompt at all.

---

## 5. Identity — who actually gets notified

You were specific that this must ride on the phone+OTP identity you already collect, not be open to anyone who opens the site. This is exactly what `CustomerAccount` + `CustomerStoreVisit` already model:

- A push subscription is only ever created for a browser session backed by a **verified passport cookie** (server-set, tied to an OTP-verified `CustomerAccount.phone`).
- A subscription is scoped **per store** — a customer only gets notified by retailers whose store they've actually visited/consented to, mirroring the existing per-store WhatsApp consent model in the passport doc (§3.2, §6). No blanket "notify everyone in the DB" — that would also violate DPDP consent rules already documented for this project.
- This means: anonymous "just browsing" visitors (§3.3 of the passport doc) are **not** eligible for push until they verify — consistent with today's WhatsApp-consent gating.

---

## 6. Consent & compliance (same rules already governing this project)

CLAUDE.md and the passport doc are already explicit that DPDP 2025 requires consent to be **affirmative, specific, and revocable** — the same rule applies to notifications:

- Notification permission prompt must be **opt-in**, shown after the customer sees value (post-first-visit), never pre-ticked, never on page load before anything else happens.
- `/my-stores` (or `/my-profile`, already built) needs a per-store **mute toggle** and a global **"turn off notifications"** switch — the passport doc already designs this pattern for WhatsApp consent (§4, §17); notifications reuse the identical mute/consent-audit mechanism (`ConsentEvent` log, frequency cap already defined at **2/week/store** in §16.5, to avoid notification fatigue that would get the whole channel disabled by the customer or the OS).

---

## 7. What needs to be built (net-new)

| Component | Type | Notes |
|---|---|---|
| `PushSubscription` table (customer_account_id, retailer_id, endpoint, keys, created_at) | DB | new model, RLS from day one per project convention |
| `POST /v1/public/passport/push/subscribe` + `/unsubscribe` | API | saves/removes browser subscription |
| VAPID keypair (env secret) | Infra | one-time generation, standard Web Push requirement |
| `push` event handler in `apps/web/public/sw.js` (or its Serwist source config) | Service worker | currently absent — shows the OS notification, handles the tap-to-open |
| Server-side send job, hooked into existing product-create and collection-publish code paths | API | fan-out to subscribed customers per retailer, respecting mute + frequency cap |
| `/my-stores` page | Web (customer PWA) | list of `CustomerStoreVisit` rows, tap → catalog |
| Install-prompt UI + iOS "Add to Home Screen" banner | Web | triggers `beforeinstallprompt` on Android; instructional banner on iOS Safari |
| `start_url` change in `manifest.json` to `/my-stores` (or a smart redirect: single-store visitor → straight to that store, multi-store visitor → list) | Config | one-line change, high UX impact |
| Notification settings block on `/my-profile` (already exists) | Web | master + per-store mute toggles |

None of this requires new phone/OTP infrastructure — it is additive to the Shopper Passport work already designed and partially built.

---

## 8. Roadmap

This slots in as the missing delivery channel for Phase 8 of the existing passport roadmap (`customer-qr-identity-solution.md` §19). Suggested sequencing:

**Phase A — Store list + installable icon** (small, high visible payoff)
- Build `/my-stores` from `CustomerStoreVisit` (schema already exists).
- Point `manifest.json` `start_url` at it; add an install-prompt CTA after first verified visit.
- No push yet — this alone delivers "one icon, all my stores."

**Phase B — Push infrastructure (Android-first)**
- `PushSubscription` model + subscribe/unsubscribe endpoints.
- VAPID keys, `web-push` server library, service-worker `push` handler.
- Wire to the existing new-product and new-collection publish events, respecting per-store consent + the 2/week frequency cap already specified.

**Phase C — iOS parity**
- "Add to Home Screen" enforcement banner before offering notification permission (Apple's hard requirement).
- iOS-specific QA (Safari's install/push flow differs materially from Chrome's).

**Phase D — Consent, mute controls, retailer visibility**
- Notification toggles on `/my-profile` (master + per-store).
- Retailer-side: surface subscriber counts (aggregate only, same privacy posture as the passport doc's retailer analytics rule, §18) so retailers see the channel is working without seeing individual customer data beyond what they already have.

**Dependency note:** Phase B/C/D benefit from — but do not strictly require — `/my-stores` (Phase A) shipping first, since both read from the same `CustomerStoreVisit` table. Building them together in one pass is reasonable if you want it in one release.

---

## 9. Why this is useful

**For retailers:**
- Zero-effort re-engagement — upload a product, customers who've visited get notified automatically. Today this only happens if the retailer remembers to manually WhatsApp a link.
- A second free channel alongside WhatsApp (push has no per-message cost, unlike WhatsApp Business API's ₹0.38/conversation noted in CLAUDE.md's cost constraints) — useful for routine "new arrivals" pings you wouldn't want to spend WhatsApp conversations on.
- Retailers keep full control of WhatsApp for high-intent sends (a curated collection, a festival push) while routine catalog updates flow through the free channel.

**For customers:**
- One icon replaces bookmarking or re-scanning QR codes for every boutique they've shopped at.
- Passive discovery of new stock without proactively checking each store.
- No new account, no app download, no storage taken on the phone beyond a lightweight PWA shell.

---

## 10. Precedent — is this a known pattern?

Yes, on both axes of what you're asking for:

**PWA "installable web app that behaves like a native app" — well-established, with public case studies:**
- **Starbucks PWA** — built specifically because their native app was too heavy for many customers' data plans; PWA ordering flow led to a widely cited ~2x increase in daily active users after launch.
- **Twitter Lite / X** — PWA install reduced data usage drastically and increased pages-per-session and tweets sent, per Twitter's own published case study.
- **Pinterest** — PWA rebuild reported a large jump in user-generated ad revenue and core engagement metrics.
- **Trivago, Uber (m.uber.com), MakeMyTrip, Ola's early web app** — all shipped installable, app-like booking/browsing flows without requiring an app-store install, aimed at exactly the low-friction, low-storage use case you're describing.

**"Browser push instead of manual link-sharing" — also standard, e.g.:**
- Every major news site and e-commerce PWA (Flipkart Lite historically, Myntra's earlier lite web experience, most D2C Shopify PWAs) uses Web Push for "back in stock," "price drop," "new arrivals" — the exact same trigger types already designed in your passport doc §16.5.

**Closest same-industry analog to your actual business model (WhatsApp-catalog + no native app):**
- India's reseller social-commerce apps — **Meesho, GlowRoad, Shop101** — run on almost the identical mechanic you already have: a shareable catalog link, WhatsApp as the primary distribution channel, no requirement for the end customer to install anything. None of them rely on browser push as their main channel (WhatsApp/SMS dominate in that segment for exactly the deliverability reasons in §11 below), which is a useful signal: **push should be additive, not a WhatsApp replacement** — which matches what you asked for.

So: nothing here is novel technology. The novelty, if any, is combining "installable multi-tenant store directory" + "push tied to a verified phone identity" specifically for the offline-retail-aggregator model — which is a reasonable, low-risk feature built entirely on standard web platform capabilities.

---

## 11. Risks & honest limitations

- **Web Push open/click rates are materially lower than WhatsApp.** Industry figures generally put browser push around 5–10% engagement vs. WhatsApp business messages commonly cited in the 40–70%+ range. Treat push as a *supplementary, free* channel for routine updates — not a reason to reduce WhatsApp's role for anything the retailer actually cares about landing.
- **iOS requires the extra "Add to Home Screen" step** — expect materially lower iOS opt-in than Android unless the install prompt is well designed and clearly explained.
- **Permission fatigue** — browsers increasingly discourage sites from asking for notification permission immediately; Chrome can auto-suppress the prompt for sites with low grant rates. Timing (ask after a customer favorites/enquires, not on page load) matters more than usual here.
- **Subscriptions go stale** — customers change phones, clear browser data, uninstall the PWA; expect push endpoints to silently die over time (standard Web Push behaviour — failed sends should prune the subscription, not retry indefinitely).
- **In-app browsers can't participate at all** — a customer who only ever opens your link inside WhatsApp/Instagram will never see a native "Add to Home Screen" affordance; this is the same limitation the passport doc already documents for cookies (§8.3) and has no full workaround, only the "open in Chrome/Safari" nudge.

---

## 12. Recommendation

Build it, in the order above (A → B → C → D). Reasoning:

1. **Phase A alone is worth shipping on its own** — the visited-store list + home-screen icon delivers most of the "feels like an app" value you described, using data (`CustomerStoreVisit`) and infrastructure (`manifest.json`, passport identity) that already exist. This is a small, low-risk win.
2. **Push (Phase B) is genuinely new infrastructure**, but it's standard, well-documented, free-to-run (VAPID + `web-push`, no SaaS subscription), and plugs into product-create/collection-publish code paths that already exist — it is not a rebuild of anything.
3. **Do not let push replace WhatsApp share anywhere in the retailer flow.** Position it as "customers now get notified automatically for routine updates; you still control WhatsApp for anything you want to personally push" — this matches what you asked for and matches the deliverability reality in §11.
4. **Reuse the passport doc's consent machinery rather than inventing new consent UI** — same mute pattern, same `ConsentEvent` audit log, same frequency cap. This keeps the DPDP story consistent across WhatsApp consent and push consent instead of creating two different compliance surfaces to maintain.
