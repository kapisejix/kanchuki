# Database Structure Report — 2026-08-22

## What you asked

> Check Supabase DB — tables, fields, columns, entries, IDs, unique keys, relationships. Can we merge tables, link them to one main table? How many tables, what's each table's role? Admin login should get reports from every section; retailer has own table tied to retailer ID, admin tied to admin ID, customer tables linked to admin main table and to retailers. Is the DB structure 100% fine? Want 9-12 tables minimum, 21 max, rest added later as features grow. Rate it — good, bad, sounds good, excellent?

Answered as 2 points first (in chat), full detail here.

## #1 — Table count and relationships

**73 tables** (Prisma models in `packages/db/prisma/schema.prisma`, 2465 lines), **51 enums**, backed by Postgres on Supabase.

### Hub structure — not flat, not siloed

`Retailer` is the hub. **51 of the 73 tables carry a direct `retailer_id` foreign key** — every retailer-scoped feature (products, customers, collections, orders, campaigns, suppliers, bookings, referrals, social posts, catalog sync, integrations...) hangs directly off `Retailer.id`. Deeper chains extend from there:

```
Retailer (hub)
├── Product ──── ProductPhoto, ProductVariant, ProductSpinFrame, ProductEmbedding, ProductVideo, ProductReview
├── Customer ──── CustomerVisit, CustomerMeasurement, CustomerFashionDNA, CustomerInteraction
├── Collection ── CollectionProduct, CollectionView, CollectionEnquiry
├── Staff, TeamMember ── TeamMemberTerritory, Territory
├── Order ──── OrderItem
├── Subscription ── SubscriptionPayment
├── Campaign ── CampaignSend, Festival
├── Supplier ── SupplierTransaction
├── Referral ── ReferralCredit
├── Partner ── PartnerReferral, PartnerEvent
├── TryOnJob, TrainingPhotoConsent, TryOnUsageLog
├── AiProviderConfig ── AiUsageLog
├── SocialAccount ── SocialPost
├── CatalogItem ── CatalogSyncLog
└── ... (51 total direct children, 73 total incl. grandchildren + platform tables)
```

`Customer` (15 references across the schema) is itself a sub-hub under `Retailer` — `CustomerVisit`, `CustomerMeasurement`, `CustomerFashionDNA`, `CustomerInteraction` all key off `customer_id`, and `Customer` keys off `retailer_id`. This matches what you described wanting ("customer tables linked to retailers") — it's already built that way.

### The gap: no `Admin` table

You described admin login being tied to an "admin ID" the way retailer/customer are. **That doesn't exist.** Admin auth is env-var based — `ADMIN_EMAIL` / `ADMIN_PASSWORD` on the API service (see `apps/api/src/routes/admin-auth.ts`), not a database row. `CLAUDE.md` build-log entry #21 calls this out explicitly as intentional: *"Admin panel refresh→login + CSRF 403 fix (DB-free session check)"*. It works, but it means:
- No per-admin audit trail tied to a real foreign key (there's an `AuditLog` table, but it isn't FK'd to an `Admin.id` because there's no such row to point at)
- Can't have multiple named admins with different permissions without adding a real `Admin` table
- "Admin gets all reports from every section" already works today (every table keys off `retailer_id`, so `SELECT ... GROUP BY retailer_id` or similar rollups work fine across all 51 retailer-scoped tables) — that part of your ask is already satisfied structurally, just not gated behind a DB-backed admin identity

### Unique keys / IDs

Every table uses `id String @id @default(cuid())` — collision-safe, sortable-ish, no auto-increment integer exposure (good practice, avoids enumeration attacks on public routes). Natural-key uniqueness is enforced separately where it matters, e.g. `Retailer.phone` unique, `Retailer.auth_user_id` unique (both confirmed live in `auth.ts` — the whole soft-delete/relink dance in the OTP flow exists *because* of this constraint).

## #2 — Can this fit in 12-21 tables?

**No — and forcing it would make the database worse, not simpler.**

73 tables for 52 shipped features (see the feature index in `CLAUDE.md` — growth engine with campaigns/referrals/suppliers/bookings/inventory alerts, marketing suite with social publishing/lookbooks/festival backgrounds, admin commission ledger, WhatsApp catalog sync, AI provider registry, plan/quota system...) is the *expected* count for a normalized relational schema, not a red flag. A rough rule of thumb: one feature domain rarely fits in fewer than 2-4 tables (a parent + its line items + its history/log) once you need real relationships and audit trails instead of a JSON blob.

Squeezing to 12-21 tables means one of:
- **Denormalizing into JSONB columns** (e.g. dumping all of `Campaign`, `Referral`, `Promotion`, `Booking` into one `growth_events` table with a `type` discriminator + JSONB payload). This is a real pattern (EAV / polymorphic tables) but it costs you: no foreign-key integrity on the payload fields, no per-type unique constraints, Postgres RLS (which this project relies on — see `kanchuki-rls-convention` memory: *"every retailer table needs RLS"*) gets much harder to write correctly per type, and every query needs `->>'field'` JSON extraction instead of a plain column.
- **Merging unrelated domains** (e.g. `Supplier` + `Partner` in one table because both are "external parties") — breaks the FK relationships to their actual child tables (`SupplierTransaction`, `PartnerReferral`, `PartnerEvent` have different shapes) and forces nullable columns for whichever type isn't active on a given row.

Neither improves anything you listed as a goal (reports, admin rollups, retailer/customer linkage) — those already work via the `retailer_id` hub pattern. Table *count* isn't a quality metric; foreign-key discipline and RLS coverage are, and those are already in place.

**What "9-21 tables and grow later" actually looks like in practice here:** you already have it, just inverted — start with the ~10 tables a bare-minimum MVP needs (Retailer, Product, ProductPhoto, Customer, Collection, CollectionProduct, Staff, Order, OrderItem, Subscription), and every feature after that adds 2-6 more tables on top, scoped to `retailer_id`. That's exactly the shape of what's in the schema today — it just kept growing because the feature list kept growing (52 features per `CLAUDE.md`). The table count is a *symptom* of feature count, not a design mistake to reverse.

## Known issues — CONFIRMED live via Supabase MCP, 2026-08-22

Checked directly against the production project (`thpqcylmcxokajxoerjx`, `ACTIVE_HEALTHY`, only one Kanchuki project — no staging/prod split to confuse) using `list_migrations`, `list_tables`, and read-only `execute_sql`. Replaces the earlier "very likely undeployed" guess in the first pass of this report with hard evidence:

1. **`CollectionStatus` enum confirmed** — live enum values are exactly `ACTIVE`, `EXPIRED`, `ARCHIVED`. No `HIDDEN`. Directly queried (`SELECT enumlabel FROM pg_enum JOIN pg_type ...`), not inferred.
2. **`_prisma_migrations` (Prisma's own tracking table) stops at `048_product_shadow`**, finished `2026-08-10 08:53 UTC`. Everything from `049` onward — 26 migration folders through `074` — is **unrecorded in migration history**, 12 days of drift as of this report.
3. **But the drift isn't uniform — schema and migration bookkeeping disagree with each other.** Tables that should only exist from migrations past `048` are already live: `campaigns`, `referrals`, `suppliers`, `bookings`, `partners`, `festival_backgrounds`, `lookbooks`, `social_templates`, `channel_syncs`, `plan_pricing`, `product_reviews`, `store_reviews`. Something applied most of that range's `CREATE TABLE` statements — `prisma db push` or manual SQL — without recording it as a tracked migration. Confirmed directly that `campaigns` is missing all 3 columns `064` adds (`variant_a_collection_id`, `variant_b_collection_id`, `cleanup_ttl_days`) — so **table creation landed, later ALTER-only migrations on those same tables did not.**
4. **Practical consequence:** a plain `prisma migrate deploy` will NOT cleanly fix this. It replays migrations in order starting from the first one Prisma doesn't have a record of (`049`) — and if `049`'s `CREATE TABLE` target already exists (likely, given #3), that statement errors out and the whole deploy aborts before it ever reaches `064`.
5. **Duplicate migration number** — two folders both numbered `069` (`069_design_gallery`, `069_social_media_templates`). Alphabetical ordering happens to keep them in a safe sequence (`d` < `s`), so it likely isn't breaking anything on its own, but worth renumbering to avoid confusing this exact kind of reconciliation work.
6. **No `Admin` table** — as covered in #1 (of the main report). Not broken (env-based admin auth works), but blocks per-admin audit trails and multi-admin permissions if you want that later.

### Reconciliation plan (for you or whoever runs it — not run by me, prod-migration policy)

1. `cd packages/db && DATABASE_URL="<prod-url>" npx prisma migrate status` — Prisma will list exactly which of `049`-`074` it thinks are pending; cross-check each against whether its target table/column already exists live (the list above is a start, not exhaustive — there are 26 files to check).
2. For every migration whose changes are **already live** (most `CREATE TABLE`-only ones, going by the table list above): `npx prisma migrate resolve --applied "<migration_name>"` — tells Prisma's tracker "this already ran," without re-running it.
3. For migrations that are genuinely missing (confirmed so far: `064_ab_variant_collections` — enum value + 3 columns): let `npx prisma migrate deploy` apply those for real once the tracker is caught up on step 2.
4. Re-run `execute_sql` (or `prisma migrate status`) after to confirm `CollectionStatus` now includes `HIDDEN` and `campaigns` has the 3 new columns.

## Rating

**Schema design: excellent. Live deployment state: currently inconsistent, confirmed — not a guess anymore.**

- Schema design (normalization, FK discipline, hub pattern, RLS-friendly per-table structure, cuid IDs): **excellent** — this is how a platform this size *should* be modeled. All 73 live tables have RLS enabled (`rls_enabled: true` on every row checked), matching the project's own RLS convention.
- Deployment state: **confirmed broken in a specific, non-trivial way** — not "just run migrate deploy," because migration bookkeeping and actual schema have diverged (tables exist that migration history doesn't know about). This needs the reconciliation sequence above, not a one-liner.
- Once reconciled, this is an **excellent** rating with no caveats. The underlying design was never the problem — the deployment process (some combination of `db push` and `migrate deploy` used inconsistently over the last 12 days) is what needs discipline going forward: pick one workflow (`migrate deploy` only, from CI or an admin-dashboard-triggered step) and stop mixing it with direct pushes.

Table count staying at ~73 (and growing with every future feature) is correct and expected — don't chase a lower number as a goal.
