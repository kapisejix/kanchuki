# Kanchuki — Build Log (Feature History)

Full chronological build history for Kanchuki. **CLAUDE.md** keeps only a
one-line index of these entries; this file is the detail for every feature,
incident, migration, and decision recorded after 2026-07-26.

> **Remaining work:** (session log, condensed into this entry) — 31 prioritized coding items + 5 devOps tasks (items 1–3 marked ✅ done).

## Table of Contents

| # | Section | Status | Date |
|---|---------|--------|------|
| 1 | [Admin Control Center — Permission Matrix, Trust & Safety, Deletion Vault, DB Guardrails (F-013…F-017)](#built-admin-control-center--permission-matrix-trust--safety-deletion-vault-db-guardrails) | Built | 2026-07-26 |
| 2 | [Phase 0.5: Internal Team Management](#phase-05-internal-team-management--all-code-items-completed-) | Built | — |
| 3 | [L2 Ecommerce Checkout](#built-l2-ecommerce-checkout-whatsapp-stays-messaging-only) | Built | 2026-08-18 |
| 4 | [Sales Referral Attribution + Paid Catalog Upload (F-018/F-019)](#built-sales-referral-attribution--paid-on-site-catalog-upload-service-f-018f-019) | Built | 2026-07-28 |
| 5 | [Marketing Page Redesign — Loom Design System](#built-marketing-page-redesign--loom-design-system-option-a) | Built | 2026-07-29 |
| 6 | [Admin-Configurable Platform Theme](#built-admin-configurable-platform-theme-2026-07-29) | Built | 2026-07-29 |
| 7 | [Product-Level WhatsApp Share + Ratings Reviewed](#built-product-level-whatsapp-share-button-f-006-gap--ratings-reviewed) | Built | 2026-07-30 |
| 8 | [F-023 AI Provider Registry](#built-f-023-ai-provider-registry--admin-configurable-tagging-models--per-provider-usage) | Built | 2026-08-01 |
| 52 | [F-021 Product & Store Ratings](#built-f-021-product--store-ratings) | Built | 2026-08-20 |
| 53 | [Customer Profile P0-P3 — 16 Features](#built-2026-08-21-customer-profile-p0-p3--all-16-features-shipped) | Built | 2026-08-21 |
| 54 | [Add-Product raw-photo default + restored per-photo controls + AI Studio model prompts + Admin backdrop delete/lightbox/AI-naming](#built-2026-08-29-add-product-raw-photo-default--restored-per-photo-controls--ai-studio-model-prompts--admin-backdrop-deletelightboxai-naming) | Built | 2026-08-29 |
| 9 | [F-022 Auto-Post New Arrivals to Google Business Profile](#planned--not-started-f-022-auto-post-new-arrivals-to-google-business-profile) | Planned | — |
| 10 | [Mobile Accessibility Audit + Harden Pass](#built-mobile-accessibility-audit--harden-pass-appsmobile) | Built | 2026-07-31 |
| 11 | [Production DB Outage Fix + Purge-Cron Scoped Role](#built-2026-08-02--production-db-outage-fix-pooler-suffix--purge-cron-scoped-role--adminweb-hardening) | Built | 2026-08-02 |
| 12 | [AI Tagging Expansion — Subtype/SKU/Description/Name](#built-2026-08-03--ai-tagging-expansion--subtypeskudescriptionname--slider-fix--color-tap--catalog-redesign) | Built | 2026-08-03 |
| 13 | [apps/mobile Design Polish Pass](#built-appsmobile-design-polish-pass--p0p1-fixed-p3-started-2026-08-03) | Built | 2026-08-03 |
| 14 | [Black & Gold Brand Repaint + COLORS Module](#built-black--gold-elegance-brand-repaint--shared-colors-module-2026-08-03) | Built | 2026-08-03 |
| 15 | [Customer Web PWA — nav/cart/detail fixes](#built-customer-web-pwa--catalog-nav-bug--bottom-bar--cart-wiring--product-detail-redesign--back-button-fix-2026-08-04) | Built | 2026-08-04 |
| 16 | [Staff catalog-upload auth gap + 500-item free offer](#built-2026-08-04-staffretailer-catalog-upload--auth-gap-closed--500-item-free-offer-enforced) | Built | 2026-08-04 |
| 17 | [F-024 DB-Backed Default Shop-By Categories](#built-2026-08-04-f-024-db-backed-default-shop-by-categories--ai-auto-category-assignment) | Built | 2026-08-04 |
| 18 | [F-025 Scan-to-Sell + F-026 bug fix](#built-2026-08-04-f-025-scan-to-sell--f-026-bug--fixed) | Built | 2026-08-04 |
| 19 | [Product-Photo Cleanup Script](#built-standalone-product-photo-cleanup-script-2026-08-05-1804-ist) | Built | 2026-08-05 |
| 20 | [Admin Photo Cleanup Test Page + ghost-mannequin](#built-admin-photo-cleanup-test-page-2026-08-06-commit-3a3f863-pushed-to-main) | Built | 2026-08-06 |
| 21 | [Admin refresh/CSRF fix](#bug-hit--fixed-admin-panel-refresh--login-screen--csrf-token-fetch-failed-http-403) | Built | 2026-08-06 |
| 22 | [Quality-First Image Compressor + R2 Storage Measurement](#built-quality-first-image-compressor-80kb--r2-storage-measurement--batch-compression-2026-08-06) | Built | 2026-08-06 |
| 23 | [Fashion V-Tone LIVE on Railway](#built-2026-08-06-fashion-v-tone-live-on-railway--generate-on-model-admin-tool) | Built | 2026-08-06 |
| 24 | [Featured Stores](#built-2026-08-11-featured-stores--admin-curated-pins-float-to-the-top-of-stores--homepage-teaser) | Built | 2026-08-11 |
| 25 | [Colabs-inspired marketing redesign](#built-2026-08-11-colabs-inspired-marketing-redesign--new-palette-marquee-logo-mattersemimono-headings) | Built | 2026-08-11 |
| 59 | [Monthly-Only Pricing + GST Engine](#built-2026-09-01--monthly-only-pricing--gst-engine) | Built | 2026-09-01 |
| 26 | [INCIDENT: test-retailer cleanup deleted live R2 photos](#incident--fix-2026-08-11-test-retailer-cleanup-deleted-a-live-retailers-r2-photos-priya-cloth-house) | Incident | 2026-08-11 |
| 27 | [Fashion V-Tone moved to Hetzner CX43](#migrated-2026-08-06-fashion-v-tone-moved-off-railway--self-hosted-on-hetzner-cx43) | Migrated | 2026-08-06 |
| 28 | [Multi-Photo Ken Burns Effect](#planned--not-started-multi-photo-ken-burns-effect-product-photos--pseudo-video) | Planned | — |
| 29 | [F-027 DB-backed Category/Style/Occasion/Fabric taxonomy](#built--migrated--live-verified-2026-08-07--db-backed-categorystyleoccasionfabric-taxonomy-f-027) | Built | 2026-08-07 |
| 30 | [Store QR Self-Service + URL Rename Sync](#built-store-qr-self-service--store-url-rename-sync--onboarding-qr-nudge-2026-08-08-commit-3311fc7-pushed-to-main) | Built | 2026-08-08 |
| 31 | [Add-Product Flow Rework + F-028 Auto-Contrast Background](#built-add-product-flow-rework--ai-in-background--f-028-auto-contrast-background-2026-08-08-committed-ec525bd--follow-ups) | Built | 2026-08-08 |
| 32 | [Redis Public-Response Cache](#built-redis-public-response-cache-for-customer-storefronts-2026-08-08-commit-56068e7) | Built | 2026-08-08 |
| 33 | [F-029 Photo Rotate + Post-Save Background Picker](#built-f-029-photo-rotate-pre-save--post-save--post-save-background-picker-2026-08-09) | Built | 2026-08-09 |
| 34 | [Photo edit visibility fix](#fixed-photo-edits-croprotatebackground-not-visible-after-save--deployed-2026-08-10-commit-4067306) | Fixed | 2026-08-10 |
| 35 | [F-030 shadow toggle](#built--deployed-2026-08-10-f-030-shadow-toggle-for-cropped-photos) | Built | 2026-08-10 |
| 36 | [Occasion removed + AI auto-selects Category/Style](#built-2026-08-10-occasion-removed-everywhere--ai-auto-selects-category-group--style) | Built | 2026-08-10 |
| 37 | [Play Store Launch Batch](#built-2026-08-10-play-store-launch-batch--web-billing-option-a-privacy-disclosures-location-removal-launch-checklist-commits-56357f6--b29b316) | Built | 2026-08-10 |
| 38 | [MSG91 Real OTP](#built-2026-08-12-real-otp--msg91-widget-on-mobile--server-side-msg91-everywhere) | Built | 2026-08-12 |
| 39 | F-032 Phase A — AI Studio Shoots (see "F-032 AI Studio Shoots" section below) | Built (Phase A only) | 2026-08-13 → 08-19 |
| 42 | [Admin Commission Tracker — 3% of Monthly Payments + Expense Ledger](#built-2026-08-17-admin-commission-tracker--3-of-monthly-payments--expense-ledger) | Built | 2026-08-17 |
| 43 | [Retailer Auth — Login / Create Account toggle](#built-2026-08-17-retailer-auth--login--create-account-toggle) | Built | 2026-08-17 |
| 44 | [India Retailer Growth Engine — Backend + Migration 055](#built-backend-2026-08-17-india-retailer-growth-engine--10-feature-modules--migration-055) | Built | 2026-08-17 |
| 45 | [Growth Engine UI — Mobile Growth Hub + Campaigns + Admin Festival Calendar](#built-2026-08-17-growth-engine-ui--mobile-growth-hub--campaigns--admin-festival-calendar) | Built | 2026-08-17 |
| 46 | [Growth Engine UI — Remaining 7 Modules (Mobile Screens)](#built-2026-08-17-growth-engine-ui--remaining-7-modules-mobile-screens) | Built | 2026-08-17 |
| 47 | [Growth Engine — Roadmap M, N, R, S Completed](#built-2026-08-17-growth-engine--roadmap-m-n-r-s-completed-ai-translate-breadth--size--fit--campaign-analytics--collection-ab) | Built | 2026-08-17 |
| 48 | [AI Campaign Assistant (E)](#built-2026-08-18-ai-campaign-assistant-roadmap-e) | Built | 2026-08-18 |
| 49 | [Phase II — WhatsApp Native Catalog Sync](#built-2026-08-18-phase-ii--whatsapp-native-catalog-sync-f-307--roadmap-p) | Built | 2026-08-18 |
| 50 | [Roadmap M — i18n Data Groundwork](#built-2026-08-18-roadmap-m--i18n-data-groundwork-deferred-post-launch) | Built | 2026-08-18 |
| 51 | [Roadmap R — Seasonal Analytics](#built-2026-08-18-roadmap-r--seasonal-analytics-wedding-season-vs-daily-wear) | Built | 2026-08-18 |
| 55 | [Feature Teardown — Remove Unwanted Features](#55-feature-teardown--remove-unwanted-features) | Built | 2026-08-31 |
| 56 | [Onboarding Plan Selection Step](#built-2026-08-31-onboarding-plan-selection-step) | Built | 2026-08-31 |
| 57 | [Admin bodyless-POST 400 fix — unsuspend/feature/unfeature (Fastify v5 empty JSON body)](#fixed-2026-08-31-admin-bodyless-post-400--unsuspendfeatureunfeature-fastify-v5-empty-json-body) | Fixed | 2026-08-31 |

---


## Build Log Parts (split 2026-09-26)

> This file grew past the 150k-char doc limit. Full chronological detail now lives in `docs/build-log/part-N.md` files below — nothing was dropped, only split at section boundaries. The Table of Contents above is the original hand-curated index (it predates this split and was already known-incomplete for later entries — see `kanchuki-doc-staleness-pattern` memory); the table below is generated from the actual file and is complete.

| Part | From | To | Size |
|---|---|---|---|
| 1 | Built: Admin Control Center — Permission Matrix, Trust & Safety, Deletion Vault, DB Guardrails | Planned — NOT started: Multi-Photo Ken Burns Effect (product photos → pseudo-video) | [`docs/build-log/part-1.md`](build-log/part-1.md) (~96k chars) |
| 2 | ✅ BUILT + MIGRATED + LIVE-VERIFIED (2026-08-07) — DB-backed Category/Style/Occasion/Fabric taxonomy (F-027) | BUILT 2026-08-20: Phase 4 — Festival Backgrounds Mobile Screen | [`docs/build-log/part-2.md`](build-log/part-2.md) (~99k chars) |
| 3 | BUILT 2026-08-20: Phase 8 — GST Report Mobile Screen | CLEANUP 2026-09-07: CI quality gate + Deploy workflow green-up (owner-approved CI/CD change) | [`docs/build-log/part-3.md`](build-log/part-3.md) (~97k chars) |
| 4 | BUILT 2026-09-08: Root-cause fixes batch (3 commits — AI Campaign Assistant, category delete guardrail, customer product-detail sheet) | BUILT 2026-09-20 — DPDP notice update + shopper "right to nominate" | [`docs/build-log/part-4.md`](build-log/part-4.md) (~99k chars) |
| 5 | BUILT 2026-09-22 — Retailer affiliate referral program (T1–T3) + purge-grant audit (RC-029, RC-030, RC-031) | 2026-09-24 (launch §7A.6) — retailer-facing photo retention / no-training notice | [`docs/build-log/part-5.md`](build-log/part-5.md) (~99k chars) |
| 6 | 2026-09-24 (launch §7A.7) — pre-production re-test of every RC-###: 40/40 pass | 2026-09-25 (later still) — the mobile manifest stops repeating the app identity: the shared constant is now what `expo prebuild` reads | [`docs/build-log/part-6.md`](build-log/part-6.md) (~54k chars) |
