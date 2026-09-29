# i18n + Dynamic-Content Audit (Phase A — audit only)

**Status:** 📋 Audit for owner review, 2026-09-29. **Nothing described here is built.** Phase B starts only after the owner approves it.
**Scope scanned:** `apps/web` (customer PWA, storefronts, marketing, billing, admin), `apps/api`, `packages/shared`, `packages/ai`, and `apps/mobile`. `apps/mobile` was read only: it is under Play review and nothing here proposes editing it.
**Supersedes the UI half of:** `pending/multi-language-i18n.md`. The AI-translate half of that file is still accurate.
**Owner defaults already chosen (2026-09-29):** English + Hindi first, starting with the customer PWA, then admin and retailer web. Mobile stays read-only until Play review clears.

---

## 0. Findings that change the brief

1. **The suggested pilot (STYLE_CHIPS → DB) is already built.** `apps/web/src/app/(shopper)/my-profile/page.tsx:27-37` reads `GET /v1/public/attributes?kind=STYLE` (`apps/api/src/routes/public/public-misc.ts:73`, which reads `default_product_attributes`, managed in Admin → Default Attributes). The hardcoded list only remains as `FALLBACK_STYLE_CHIPS`. That changes what the pilot should be: see §4, P2. The work left is **translated labels** for these rows, not moving them into the DB.
2. **No i18n infrastructure exists anywhere.** There is no i18n library in any `package.json`, no `middleware.ts` in `apps/web`, and `<html lang="en">` is hardcoded (`apps/web/src/app/layout.tsx:128`). The fonts are Inter plus MatterSemiMono, and neither has Devanagari glyphs.
3. **One surface already runs its own i18n by hand.** The retailer survey (`apps/web/src/app/survey/translations.ts`, 438 lines, locales `en/hi/pa`) keeps `{en, hi, pa}` objects per question. That proves the demand, and its copy can be moved into the shared catalog.
4. **There are four separate language lists and they disagree:**
   - `SUPPORTED_LOCALES`: BCP-47, 8 entries (`packages/shared/src/constants/index.ts:311`)
   - `SUPPORTED_LANGUAGES` / `LANGUAGE_PROMPT` (`apps/api/src/routes/growth/growth-translate.ts:13,25`)
   - `TRANSLATE_LANGUAGES` (`apps/mobile/src/lib/api/growth.ts:429`)
   - the survey's `LANGS` = `en/hi/pa` (`apps/web/src/app/survey/SurveyForm.tsx:27`). Punjabi is not in `SUPPORTED_LOCALES` at all.
5. **`LOCALE_FALLBACK_CHAIN = ['hi-IN','en-IN']` (`constants/index.ts:325`) is wrong for UI use.** An English user whose key is missing would get Hindi. For UI strings the chain must be *selected → en*. It currently has no callers outside its own file, so it is safe to fix.
6. **Stored values vs labels.** Products and customer preferences store the attribute **name** string (`default_product_attributes.name`, unique on `(kind, segment, name)`). Translating the stored name would break filters, AI tagging and the prefs already saved. So the canonical English `name` must stay the value, and translations can only ever be a label.
7. **A precedent already exists for per-row translations in JSONB.** `growth-translate.ts:61-104` caches AI product descriptions in `products.metadata.translations = { [lang]: text }`.
8. **API errors already carry a stable `code`** (`apps/api/src/plugins/error-handler.ts`: `AppError(code, message, status, field)`). Clients can therefore translate by code without changing the API. Most sites use generic codes (`VALIDATION_ERROR`, `NOT_FOUND`) with free-text messages, though, so finer keys are needed over time.
9. **Admin settings already have a key-value store:** `routes/admin-settings/settings-store.ts` keeps the latest `audit_logs` row per `SETTING_<key>`, so every save is versioned. It is fine for small JSON config such as theme, watermark, rate limits and catalog promo. It is not suitable for thousands of UI strings.
10. **Migration `063` (`retailers.preferred_locale`) applied state is still unverified.** The owner check is in `pending/multi-language-i18n.md`. Nothing in Phase B reads this column before P3.

---

## 1. Inventory

Counts come from a heuristic scan (JSX text nodes, user-facing props such as `placeholder`/`aria-label`/`title`/`alt`/`label`, and literal messages passed to `toast`/`setError`/`Alert.alert`/`throw new Error`). Treat them as ±15%. They are for sizing, not for a checklist.

### 1(a) User-facing strings / UI copy

| Surface | Files | ≈ Literals | Heaviest files | Proposed home |
|---|---|---|---|---|
| Customer: `(shopper)` (my-profile, my-stores) | 4 | 46 | `my-profile/page.tsx` (35) | catalog `profile` |
| Customer: `/c/[slug]` catalog + sheets | 37 | 246 | `CollectionView.tsx` (39), `ProductDetailSheet.tsx` (32), `TryOnSheet.tsx` (25), `CustomerConsentModal.tsx` (24), `StarPicker.tsx` (14) | catalog `storefront` |
| Customer: `/[store]` storefront | 22 | 55 | `ContactGate.tsx` (23), `categories/page.tsx` (12) | catalog `storefront` |
| Customer: `/stores`, `/login`, shared components | 15 | 61 | `StoresDirectory.tsx` (28), `site/Chrome.tsx` (15) | catalog `common` |
| Marketing (home sections, about, faq, how-it-works, for-customers, for-retailers, pricing, download, join, testimonials, contact) | ~15 | ~210 | `sections/MarketingSections.tsx` (59; `FAQS` :62, `FEATURES` :169) | catalog `marketing` (+ optional DB override, §3.4) |
| Legal: `/privacy`, `/terms` | 2 | ~90 (long prose) | `privacy/page.tsx` | **keep English, versioned.** Legal notices are versioned in `apps/api/src/lib/notice-versions.ts`, and a Hindi legal text needs lawyer review (§5 Q6) |
| Retailer web: `/billing`, `/social`, `/survey` | 10 | ~147 | `billing/*` (77), `survey/*` (50, already hand-translated) | catalog `billing`, `survey` |
| Admin panel `/admin/*` | 73 | ~2,300 | `photo-cleanup-test` (105), `retailers/[id]` (96), `commission` (91), `bug-reports` (85), `support-tickets` (76) | catalog `admin.*` (last web surface; §5 Q1) |
| API error messages | ~40 route files | ~500 sites (`notFound` 204, `forbidden` 57, `validationError`/`badRequest`/`conflict` ~190, raw `new AppError` 84) | error-handler helpers | keep the English `message`; add optional `message_key` (§3.6) |
| API notification copy: email, WhatsApp link text, passport welcome | `lib/email.ts` (20), `jobs/passport-welcome.ts`, `routes/collections.ts`, `growth-helpers.ts`, `retailers-whatsapp.ts`, `public-collections.ts` | ~60 | | per-locale templates (P4) |
| Invoice PDF | `lib/gst-invoice-pdf.ts` | ~25 | uses Helvetica, **cannot render Devanagari** | keep English (§5 Q6) |
| AI prompts | `packages/ai/src/*` | ~36 | not user-facing (model input) | keep in code |
| **Mobile (read-only)** | 163 | ~2,380 | `settings/index.tsx` (150), `onboarding.tsx` (82), `product/add.tsx` (72), `catalog-import.tsx` (64), `lib/api/growth.ts` (103) | P6, blocked |

### 1(b) Option lists / enums shown to users

| List | Location | Today | Proposed |
|---|---|---|---|
| Style / Occasion / Fabric | `default_product_attributes` (DB) + `FALLBACK_STYLE_CHIPS` (`my-profile/page.tsx:33`) | ✅ admin-managed, English only | add `labels` JSONB (P2) |
| Default shop-by categories | `default_product_categories` (DB) | ✅ admin-managed, English only | add `labels` JSONB (P2) |
| AI tagging categories | `PRODUCT_CATEGORIES` (`constants/index.ts:102`), `PRODUCT_TYPES`, `PATTERN_TYPES`, `EMBELLISHMENT_TYPES` | code; also the tool-use enum in the AI prompt | keep the values in code (they are the AI contract). Display labels go in catalog `taxonomy` |
| Sizes XS–8XL | `SIZE_OPTIONS` (`constants/index.ts:147`) | code | keep in code. Universal labels, no translation needed |
| Price buckets | `PUBLIC_PRICE_BUCKETS` (`constants/index.ts:720`); mobile `PRICE_BUCKETS` (`catalog.tsx:50`) | code; label string baked in | keep the boundaries in shared code and build the labels from the catalog + `Intl.NumberFormat('en-IN'/'hi-IN')` |
| Indian states | `INDIAN_STATES` (`constants/index.ts:729`), duplicated in `admin/retailers/page.tsx:24`; `STATE_CODE_MAP` (`billing-helpers.ts:69`) | code | keep in code (GST state codes are fixed by law). Labels go in catalog `geo`. Remove the admin duplicate |
| Fabric glossary (25 fabrics + copy) | `FabricGlossary.tsx:7` (209 lines) | code | **admin-managed data**: new `fabric_glossary` rows or `labels`/`body` on the FABRIC attribute rows (P2b) |
| Style quiz questions | `StyleQuiz.tsx:6` | code | admin-managed data (P2b) |
| Review rating labels + comment templates | `StarPicker.tsx:53,63` | code | catalog `storefront` |
| Family relation options | `FamilyProfiles.tsx:6` | code | catalog `profile` (the values are keys) |
| Design gallery categories | `DesignGallery.tsx:21`, `DESIGN_CATEGORIES` in `public-designs.ts:9` + `admin-design-references.ts:10` (duplicated) | code, ×2 | the `showcase_design_categories` table exists. Unify on it + `labels` JSONB (P2) |
| Plan names / notes / features (public pricing) | `pricing/PricingTable.tsx:12-14`, `pricing/page.tsx:18,49`, `billing/lib.ts:9,59`, `for-retailers/page.tsx:18`, `download/page.tsx:11` | code | plan **names** → `plan_pricing` gets `display_name`/`labels`. Feature bullets → catalog `marketing` |
| Status / role / severity / type label maps (admin) | ~25 maps: `bug-reports:67,83`, `support-tickets:69`, `team-members:51`, `social-templates:56`, `ai-providers:44`, `integrations:23`, `referral-settings:46`, `addon-purchases:43`, … | code | catalog `admin`. Enum keys stay in code. Colour/icon maps stay in code |
| Festival regions | `festivals/page.tsx:31` `REGION_SUGGESTIONS` | code suggestions; festivals themselves are DB | `festivals` rows get `labels` JSONB (P4) |
| Post / social template types | `admin/post-templates:28-31`, `admin-post-templates.ts:15-16`, `growth-social-templates.ts:29` | code | enum keys in code, labels in catalog |
| Months (GST report) | `admin/reports/gst/page.tsx:68`, mobile `growth/gst.tsx:20` | code | `Intl.DateTimeFormat` (no catalog needed) |

### 1(c) Business constants

| Constant | Location | Classification | Why |
|---|---|---|---|
| `PLAN_LIMITS` | `constants/index.ts:3`, still read by `pricing/page.tsx`, `for-retailers/page.tsx`, `admin/billing/page.tsx`, `billing-helpers.ts`, `billing-webhook.ts`, `catalog-import.ts`, `admin-retailers-detail.ts` | **admin-managed**. The `plan_limits` table (F-010) already exists | Same drift class as the `PLAN_PRICING` deletion (board §6). Marketing pages can show limits that differ from what the API enforces |
| `GST_RATE = 0.18`, `SAC_CODE` | `apps/api/src/lib/gst.ts:11-12`; fallback `generate-gst-invoice.ts:114` | keep in code | A tax rate change is a legal event that needs code review + invoice regression. `payments.gst_rate` already stores the rate per payment |
| `HSN_RULES_FALLBACK` | `jobs/catalog-sync.ts:81` | keep (it is already the fallback for DB rules at :113) | — |
| `STUDIO_ENGINES` / `STUDIO_ENGINE_INFO` / `FAL_EDIT_ENGINES` | `constants/index.ts:431,466`, `lib/fal-client.ts:296` | keep in code | Each engine is client code plus a request body. A DB row cannot add one. `studio_styles.engine` already selects per style |
| Bench scene / pose lists + cost sheet | `apps/web/src/lib/studio-effects.ts:47,211,980,1011` (1,083 lines) | admin-managed **later** (the `studio_styles` pattern), low priority | Admin-only bench. Its copy is prompts, not UI |
| AI provider models | `ai_provider_configs` (F-023) | ✅ already admin-managed | — |
| Quotas / add-on packs / referral settings / plan features | `plan_limits`, `resource_packs`, `referral_settings`, `plan_features` | ✅ already admin-managed | — |
| Theme / watermark / catalog promo / rate limits | `settings-store.ts` | ✅ already admin-managed | — |
| Colours | `packages/shared/src/colors.ts`, `DEFAULT_PLATFORM_THEME` (`theme.ts:29`) | ✅ theme is admin-managed; the default stays in code | — |
| Timeouts, retry counts, MIME allowlists (`categories.ts:10`), `PUBLISH_LIMIT`, payout/clawback status sets | various | keep in code | Security or correctness limits. Admin-editable values here would widen the attack surface |
| Hindi search map / colour aliases | `FASHION_COLOR_ALIASES` (`constants/index.ts:168`), search normalisation map | keep in code for now; admin-managed later if search tuning becomes routine | — |

### 1(d) Admin-editable vs stays in code/env: the rule

- **Admin-editable:** anything the business changes on its own schedule without a code change: option lists, labels and their translations, marketing copy, message templates, prices, plan limits, feature toggles, festival calendar, styles.
- **Stays in env:** secrets and connection strings (Integration secrets are already encrypted in `integration_settings`).
- **Stays in code:** anything where a wrong value is a security hole or a legal error (auth limits, MIME allowlists, rate-limit floors, GST rate/SAC, DPDP notice text + versions), and anything that is a contract with code or an external model (enum values, AI tool schemas, engine ids, R2 paths).

---

## 2. Classification summary

| Class | What goes there | ≈ Size |
|---|---|---|
| `translatable-UI-string` (i18n catalog in git) | all JSX copy, toasts, empty states, button labels, label maps for enums, error-code messages, marketing copy | web ≈ 3,100 · mobile ≈ 2,400 (blocked) |
| `admin-managed-data` (DB + admin CRUD, translatable via `labels` JSONB) | attributes, categories, design categories, fabric glossary, quiz, plan display names, festivals, post/social/WhatsApp templates, `PLAN_LIMITS` (switch readers to `plan_limits`) | ~10 tables (4 new columns, 2 small new tables) |
| `keep-in-code` | enum values, AI schemas, engine ids, GST rate/SAC, states + codes, sizes, security limits, legal text | — |

---

## 3. Proposed architecture (recommendation, not built)

### 3.1 Libraries
- **Web (Next 14.2 App Router): `next-intl`.** Works in Server and Client Components, uses ICU message format, types keys from the catalog, and supports a **no-URL-prefix mode** (locale from cookie). The last point matters: storefront URLs are shared over WhatsApp and pinned by the deep-link module (RC-041), so adding `/hi/` prefixes would fork every shared link. Pin a `next-intl` release whose peer range includes Next 14.2 (check at install, per the library docs). Alternatives were rejected: `react-i18next` has weaker RSC support, and a DIY context gives no ICU plurals and no key typing.
- **Mobile (read-only note): `i18next` + `react-i18next` + `expo-localization`,** with `i18next-icu` so it reads **the same ICU JSON files** as web. Needs no native module, so it can ship as an OTA/JS change after Play review.

### 3.2 Catalog layout
- New workspace package **`packages/i18n`**: `messages/{en,hi}/{common,storefront,profile,marketing,billing,survey,taxonomy,geo,errors,admin}.json`.
- Also holds the one locale list (`SUPPORTED_LOCALES` moves here or is re-exported) and a `resolveLocale()` helper.
- Keys are semantic (`storefront.enquire.cta`), not English text. `en` is the source of truth. A missing `hi` key falls back to `en` at runtime, and CI reports the gap count without failing the build.
- The four locale lists collapse into this one package. The UI fallback becomes `[selected, 'en-IN']`, and the AI-content chain stays separate.

### 3.3 Translatable DB data: **JSONB `labels` column**, not a translation table

`ALTER TABLE default_product_attributes ADD COLUMN labels JSONB NOT NULL DEFAULT '{}'` → `{"hi-IN": "कैज़ुअल"}`. The same column goes on `default_product_categories`, `showcase_design_categories`, `festivals`, and `plan_pricing` (display name).

| | JSONB `labels` (chosen) | `translations(table, row_id, locale, field, value)` |
|---|---|---|
| Reads | one row, no join; the existing Redis public cache still works | join or second query per list |
| Locales | fits 2–8 locales | better at 20+ |
| Per-string review status | needs a sibling `labels_meta` JSONB if wanted | natural |
| RLS | **unchanged.** The column inherits its table's policy. Global tables have no `retailer_id`, and retailer-scoped `product_attributes` keeps its existing policy | new table needs its own policy with a polymorphic `row_id` (no FK), which is awkward to secure |
| Precedent | `products.metadata.translations` | none |

**The rule:** `name` stays the canonical stored value, and only the displayed label is translated (§0.6).

### 3.4 Admin-editable UI copy (goal #1, "admin manages everything")
- **Tier 1 (default):** bundled catalog in git, changed by PR. Covers most UI text, because it is reviewed and typed.
- **Tier 2 (opt-in keys only):** table `ui_copy_overrides(locale, key, value, updated_by, updated_at)`. It is read server-side, merged over the bundled catalog, and Redis-cached with invalidation on save. Only keys on an allowlist (marketing headlines, FAQ, plan bullets, empty-state nudges) are editable, so the admin cannot break a button label into a 200-char string. This is admin-only global data with no RLS tenant scope, protected by the API admin auth like other admin tables.

### 3.5 Locale resolution
- **Customer PWA / storefront:** `?lang=` (shareable link override) → cookie `NEXT_LOCALE` → *(future)* store's default locale → `Accept-Language` if it names a supported locale → `en-IN`.
- **Retailer web (billing/social):** `retailers.preferred_locale` (once 063 is verified) → cookie → `en-IN`.
- **Admin:** cookie from a switch in the admin header, default `en-IN`.
- `<html lang>` is set from the resolved locale. No RTL is needed.

### 3.6 API: backward compatible for the shipped `.aab`
- `GET /v1/public/attributes` keeps `names: string[]`. With `?locale=hi-IN` it **adds** `items: [{ name, label }]`. The cache key already includes the URL, so each locale caches separately.
- Errors: add optional `message_key` beside `code`/`message`. Old clients ignore it, and the web maps key → catalog → falls back to `message`.
- Nothing is removed or renamed. The default is always English.

### 3.7 Fonts
- `next/font/google` **Noto Sans Devanagari** (subset `devanagari`, weights 400/600) as a CSS variable, applied only when the locale is Hindi, so English pages pay nothing.
- PDF: if a Hindi invoice is ever wanted, embed a Noto Devanagari TTF in pdfkit (`registerFont`), because Helvetica has no Devanagari glyphs.

### 3.8 SEO
- No locale prefix (§3.1). The trade-off is no `hreflang` alternates for the storefront.
- Acceptable for now: storefronts are reached by shared link, not organic search.
- If organic Hindi search matters later, add prefix routing to **marketing pages only**, with `hreflang` in `sitemap.ts`.

### 3.9 AI-assisted first pass
- `scripts/i18n-fill.ts` sends missing `hi` keys through the existing provider registry (`packages/ai`). It writes them with a `// needs-review` marker in a sidecar file, and a person reviews the PR.
- Admin label fields get an **"AI suggest"** button that pre-fills Hindi for review.
- Both paths are admin-triggered, never in a customer request path (the CLAUDE.md rule on AI calls).

---

## 4. Phased plan

| Phase | What | Files touched | Migration (SQL only, owner applies) | Tests | Prod risk | Rollback | Size |
|---|---|---|---|---|---|---|---|
| **P1** Plumbing + customer PWA locale switch | `packages/i18n`; `next-intl` in cookie mode; `LocaleSwitcher` in the shopper chrome; Devanagari font; dynamic `<html lang>`; extract `(shopper)`, `/c/[slug]`, `/[store]`, `/stores`, `/login` (~410 literals) to `en` + AI-first-pass `hi` | `apps/web/src/app/layout.tsx`, new `apps/web/src/i18n/*`, ~70 customer components, `packages/i18n/*` | none | unit: `resolveLocale`, key parity en↔hi; e2e: customer suite in `en` (unchanged) + one `hi` smoke per page | low–med: every customer page re-renders through `t()`. Missing keys fall back to `en` | revert PR; cookie is ignored | **M** (2 PRs: plumbing, then extraction) |
| **P2** Translated option lists | `labels` JSONB on attributes/categories/design categories; admin CRUD per-locale label input + AI suggest; public API additive `items`; my-profile + storefront filters show labels; unify `DESIGN_CATEGORIES` ×2 on the table | `admin-settings`/attributes routes, `public-misc.ts`, `public-designs.ts`, admin pages, `my-profile/page.tsx` | `ALTER TABLE … ADD COLUMN labels JSONB NOT NULL DEFAULT '{}'` ×3 (rollback: `DROP COLUMN`) | API route tests (old shape unchanged + new `items`), customer e2e stub update | low (additive) | drop column; clients fall back to `name` | **S–M** ← **recommended pilot** |
| **P2b** Content lists → DB | fabric glossary, style quiz, `PLAN_LIMITS` readers → `plan_limits` | `FabricGlossary.tsx`, `StyleQuiz.tsx`, pricing/for-retailers/billing, API billing helpers | new `fabric_glossary`, `style_quiz_questions` (global, `labels`/`body` JSONB) | route + e2e | low–med (pricing page numbers change if DB ≠ constant, which is *the point*) | revert reader PR | **M** |
| **P3** Retailer web + marketing + admin strings | billing/social/survey (fold survey's hand-rolled `translations.ts` into the catalog), marketing, then admin by section | ~100 files | none (Tier-2 overrides table optional: `ui_copy_overrides`) | key parity; existing admin e2e | low per slice | per-PR revert | **L** (admin ≈ 2,300 literals; split per section) |
| **P4** Templates | WhatsApp collection share text, passport welcome, email, campaign/post/social templates get `locale` / `labels`; festivals `labels` | `lib/email.ts`, `jobs/passport-welcome.ts`, `collections.ts`, `growth-helpers.ts`, template admin pages | `labels`/`locale` on `post_templates`, `social_templates`, `festivals` | template render tests per locale | med: customer-facing messages; Meta-approved WhatsApp templates are per-language on Meta's side (F-035) | revert; `en` default | **M** |
| **P5** API error keys | add `message_key` to `AppError` helpers + top ~60 call sites; web maps keys | `error-handler.ts`, routes | none | error-handler unit tests; `security.test.ts` unchanged | low (additive field) | revert | **M** |
| **P6** Mobile | i18next + shared catalogs; settings → Language writes `preferred_locale` | `apps/mobile/*` | none new (uses 063) | mobile jest | **BLOCKED** until Play review clears + owner go-ahead | — | **L** |
| **P7** CI guard | see §6 | `scripts/`, `ci.yml` | — | guard self-test | none | disable step | **S** |

Order: P1 → P2 → P7 (so migrated surfaces cannot regress) → P2b → P3 → P5 → P4 → P6.

---

## 5. Open questions for the owner

1. **Admin panel in Hindi at all?** Admin users are internal staff. Recommendation: admin stays English until customer and retailer surfaces are done (it is 75% of the web string count).
2. **Who reviews Hindi?** An AI first pass is cheap, but someone fluent must approve the customer-facing copy before launch.
3. **Product names/descriptions (retailer-written):** auto-translate at read time (AI, cached in `products.metadata.translations`, costs per product per locale) or only show a translation the retailer generated?
4. **Per-store default language?** Should a retailer be able to set "my storefront opens in Hindi" (new additive `retailers.storefront_locale`)?
5. **URL strategy:** OK with cookie + `?lang=` (no `/hi/` URLs, no storefront `hreflang`)? §3.8 has the trade-off.
6. **GST invoice + legal pages:** keep English only (recommended), or bilingual? Bilingual needs lawyer review and a Devanagari PDF font.
7. **Hinglish as a UI locale later?** It is in `SUPPORTED_LOCALES`, but a Romanized UI is a copywriting job, not a translation job.
8. **Tier-2 DB copy overrides (§3.4):** needed now, or is PR-edited catalog copy enough until after launch?

---

## 6. CI guard (recommendation)

`scripts/check-hardcoded-strings.mjs`, modelled on the existing guard scripts (`scripts/check-route-size.sh`, `scripts/check-android-version-code.mjs`):
- Runs only on **directories already migrated** (an allowlist that grows each phase), so unmigrated code never blocks CI.
- Flags JSX text nodes and literal values of `placeholder` / `aria-label` / `title` / `alt` / `label` that contain letters, plus literal `toast(…)` / `setError(…)` messages.
- Opt-out is `// i18n-ignore: <reason>` on the line (for brand names, `₹`, sizes).
- **Ratchet mode:** a checked-in `i18n-baseline.json` holds per-file counts for partially migrated files. CI fails if any count goes up and prints the new literal with its file:line.
- A companion check reports `en`↔`hi` key parity (the missing-`hi` count) without failing, until the owner chooses to make it a gate.
- It needs its own self-test that proves it can fail (the RC-043 lesson: a guard that cannot fail reads exactly like a guard that passes).
