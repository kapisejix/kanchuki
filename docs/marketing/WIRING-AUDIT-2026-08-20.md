# Marketing & Sales Enablement — Wiring Audit

**Date:** 2026-08-20
**Question asked:** Are the 10 features in `IMPLEMENTATION-STATUS.md` actually live under the admin web dashboard (`apps/web`) and retailer mobile app (`apps/mobile`)?
**Answer: No.** Doc claims "100% COMPLETE" / "MVP" for all 12 features. Code check shows **0 of 10 new marketing services are wired into the real product.** They are disconnected standalone stub servers sitting outside the monorepo build.

---

## 1. Verdict Table

| Feature (doc claim) | Doc status | Code location | Admin UI (`apps/web/src/app/admin`) | Mobile UI (`apps/mobile`) | Wired to `apps/api`? | Reality |
|---|---|---|---|---|---|---|
| Smart Incentive Engine | ✅ COMPLETE | `services/incentive-engine/` | ❌ none | ❌ none | ❌ zero references | Orphan stub |
| Local Discovery Engine | ✅ COMPLETE | `services/local-discovery-engine/` | ❌ none | ❌ none | ❌ zero references | Orphan stub |
| GMB Integration | ✅ COMPLETE | `services/gmb-sync/` | ❌ none | ❌ none | ❌ zero references | Orphan stub |
| AI-Driven Social Media Templates | ✅ COMPLETE | `services/social-template/` | ❌ none | ❌ none | ❌ zero references | Orphan stub |
| Direct Social Publishing | ✅ COMPLETE | *(claimed: "leverages existing WhatsApp/IG")* | n/a | ❌ none | — | No new code found beyond F-031 Facebook Page connect (real, pre-existing, unrelated to this doc) |
| Automated Festival Background Library | ✅ COMPLETE | *(claimed: part of `photo-cleanup`)* | ❌ none | ❌ none | ❌ no `festival-bg` table, no apply-background route | Not built — doc describes work that doesn't exist |
| Partner Network Manager | ✅ COMPLETE | `apps/api/src/routes/retailers/retailers-partners/` | ❌ none | ❌ none (no `*partner*` file anywhere in `apps/mobile`) | ✅ **real route exists in apps/api** | Half-real: API route exists, but no admin page, no mobile screen — retailer has no way to use it |
| Aggregator Sync (Meesho/Instamojo/Glroad/Craftsvilla) | ✅ COMPLETE | `services/aggregator-sync/` (**1 file**) | ❌ none | ❌ none | ❌ zero references | Orphan stub, single file |
| Automated Lookbook Generator | ✅ COMPLETE | `services/lookbook-generator/` (**1 file**) | ❌ none | ❌ none | ❌ zero references | Orphan stub, single file |
| Facebook Local Awareness Ads | ✅ COMPLETE | `services/facebook-ads/` | ❌ none | ❌ none | ❌ zero references | Orphan stub, mock creds, own port 3007 |
| Google Local Service Ads | ✅ COMPLETE | `services/google-local-service-ads/` | ❌ none | ❌ none | ❌ zero references | Orphan stub, mock creds |
| Analytics Service | *(support)* | `services/analytics-service/` | ❌ none | ❌ none | ❌ zero references | Orphan stub |
| Auth Service | *(support)* | `services/auth-service/` | ❌ none | ❌ none | ❌ zero references | Orphan stub, own port 3011, mock JWT secret |
| GST Report Generator | *(support)* | `packages/gst-report-generator/` | ❌ none | ❌ none | ❌ zero references from `apps/api` or anywhere | Dead package — sits in the real workspace but nothing imports it |

**Score: 1 real (partial) route out of 14 claimed items. Everything else is unreachable code.**

---

## 2. Hard Evidence

**pnpm workspace only includes real apps/packages:**
```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```
`services/*` is **not a workspace member.** `pnpm install`, `turbo build`, `turbo dev` never touch it. `turbo.json` has zero mention of `services`.

**Zero cross-references** — grepped `apps/api/src`, `apps/web/src`, `apps/mobile` for every service name (`aggregator-sync`, `analytics-service`, `auth-service`, `facebook-ads`, `gmb-sync`, `google-local-service-ads`, `incentive-engine`, `local-discovery-engine`, `lookbook-generator`, `social-template`) — **no import, no fetch call, no env var pointing at them, nothing.**

**Each service is its own unstarted Fastify toy server**, e.g. `services/facebook-ads/src/facebook-ads.ts`:
```ts
// ponytail: Facebook Local Awareness Ads service with realistic Meta API integration
// TODO: Replace with actual Meta API credentials when available
const META_API_CONFIG = {
  accessToken: process.env.META_ACCESS_TOKEN || 'your-meta-access-token',
  ...
};
...
await fastify.listen({ port: 3007, host: '0.0.0.0' });
```
No `Dockerfile`, no `railway.json`, no deploy target — this process has never run outside a dev machine. `auth-service` is the same pattern on port 3011 with a placeholder JWT secret. These are scaffolds, not services.

**`services/admin-dashboard/` is a red flag on its own** — untracked (`git status`), and its `src/` directory is **completely empty** (package.json + tsconfig.json only, zero source files). The real admin dashboard already exists and is fully built at `apps/web/src/app/admin/` (40+ real pages: retailers, plan-features, commission, whatsapp-catalog, festivals, etc). This stub duplicates the name of a thing that already exists and does nothing. Almost certainly created by mistake during the "immediate enhancement" commits — **delete it**, don't build it out.

**`IMPLEMENTATION-STATUS.md`'s own conclusion contradicts itself**: it says "Build intuitive admin interfaces for each feature" and "Add proper authentication & authorization" under *Short-term Enhancements* — i.e., the doc itself admits no UI and no real auth exist, while the summary table two sections above claims 100% complete with 0 in-progress.

---

## 3. Root Cause

The build cycle that produced these 10 services (commits `33e6320` → `d046c5c`, 2026-08-19) followed a **microservices-first pattern instead of extending the real apps.** Every feature got its own new `services/<name>/` Fastify server with its own `package.json`, instead of a new route file under `apps/api/src/routes/` (the pattern every *real* feature in this repo uses — see `retailers-partners/`, `growth/growth-videos.ts`, `retailers-social.ts`). Because nothing plugged these servers into the API gateway, admin app, or mobile app, they're inert. Docs were updated to reflect the *code being written*, not the *feature being reachable by a retailer or admin*.

---

## 4. Fix Path (per feature, lazy version — fold into existing apps, don't stand up 10 new deployables)

General pattern, matching what's already proven in this repo (`retailers-partners`, `growth/*`):

1. **Backend**: move logic from `services/<name>/src/*.ts` into a new route file under `apps/api/src/routes/growth/` or `apps/api/src/routes/retailers/`, reusing the existing Fastify instance, `@kanchuki/db` Prisma client, and existing auth middleware. Delete the standalone `fastify.listen()`, `package.json`, `tsconfig.json` — this is not a deploy target.
2. **Admin gating**: add the feature to the existing plan-feature matrix (`apps/web/src/app/admin/plan-features/`) the same way `GROWTH_ENGINE` and `WHATSAPP_CATALOG_SYNC` were added — new Prisma migration for the enum value, gate the new routes behind it.
3. **Admin UI**: one new folder under `apps/web/src/app/admin/<feature>/` if the feature needs admin config (e.g. festival background library assets, GMB webhook status) — mirror `apps/web/src/app/admin/whatsapp-catalog/` or `apps/web/src/app/admin/festivals/` for structure.
4. **Mobile UI**: one new screen under `apps/mobile/app/growth/<feature>.tsx` + an API client function in `apps/mobile/src/lib/api/growth.ts` — mirror `apps/mobile/app/growth/videos.tsx`.
5. **Real credentials**: none of these have real API keys today (Meta, Google Ads, Meesho, Instamojo, Glroad, Craftsvilla all use placeholder/mock tokens) — that's a separate blocker per integration, same as the existing Facebook Page connect (F-031) which *does* have real Meta Graph API wiring to copy from (`apps/api/src/lib/meta-graph.ts`).

**Per-feature specifics:**

| Feature | What to do |
|---|---|
| Partner Network Manager | Already has a real API route. Just needs: admin UI page + mobile screen ("Refer a partner" style, reuse Referral Program Engine's mobile pattern since it's the closest built analog). |
| Smart Incentive Engine, Local Discovery Engine | Fold into `apps/api/src/routes/growth/` as new files reusing `customers` + `retailers` tables already in schema. Don't add `customer_visits`/`incentive_rules` as separate tables without checking `packages/db/prisma/schema.prisma` first — some of this may already exist under Growth Engine (promotions/campaigns). |
| GMB Integration, Facebook Local Awareness Ads, Google Local Service Ads | Real 3rd-party API work — biggest lift, needs actual API access/creds first (same blocker noted for F-022 in CLAUDE.md, already marked Planned/blocked). Don't rebuild the stub, start clean once creds exist. |
| AI-Driven Social Media Templates, Automated Festival Background Library, Automated Lookbook Generator | These claim to extend `services/photo-cleanup/` / `studio-shoot`. Check whether the real studio-shoot job (F-032, marked 🔴 Planned in CLAUDE.md #39) exists before building on it — it may not exist yet either. |
| Aggregator Sync (Meesho/Instamojo/Glroad/Craftsvilla) | 1-file stub, no real product-sync logic. Lowest priority — no evidence any pilot retailer sells on these channels yet. Question whether this needs to exist before building it (ladder rung 1: YAGNI). |
| Analytics Service, Auth Service | Pure scaffolding for things `apps/api` already has (existing auth middleware, existing admin activity tracking F-014). Delete — don't revive. |
| GST Report Generator package | Wire into `apps/api/src/lib/invoice.ts` (already handles GST invoicing) if GST-Ready Invoicing (roadmap item **I**, marked 🔴 Not built) gets picked up — otherwise delete, it's dead weight in the workspace. |
| `services/admin-dashboard/` | **Delete.** Empty, untracked, duplicate of the real `apps/web/src/app/admin`. |

---

## 5. Recommendation

Don't wire all 10 up at once — that repeats the same mistake (build first, ask later). Pick the retailer-facing feature with clearest ROI (Smart Incentive Engine or Partner Network Manager — partner already has a real API route, cheapest to finish), scope it with `docs/PRO-REQUIREMENTS.md` acceptance criteria the way every other built feature in this repo was scoped, then build it as routes + admin page + mobile screen in one pass, not a standalone service. Update `IMPLEMENTATION-STATUS.md` and `CLAUDE.md`'s feature index to say "Not Started" for the other 9 until they follow the same path — the current "100% COMPLETE" claim is false and will mislead the next session (this repo has a known pattern of docs claiming more than code delivers, see the existing doc-staleness note in memory).
