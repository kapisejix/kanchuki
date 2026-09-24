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
