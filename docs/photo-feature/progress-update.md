# Kanchuki — Photo-Feature Progress Update (Session Memory)

> **What this file is:** a rolling session log for all photo-feature work
> (add-product flow, camera, AI tagging, cropping, backgrounds, ghost
> mannequin, pro cleanup). Each working session appends a dated entry below.
> If your laptop crashes mid-session, re-open this file and pick up from the
> **Latest Session** entry — it records what was done, what was verified, and
> what is still open.
>
> **How to append:** copy the `## Session` template at the bottom, paste it
> above the previous entry (newest first), and fill it in.
>
> **Related docs in this folder:** `ai-photo-final-report-2026-08-07.html`,
> `ai-photo-requirements-analysis-and-thoughts-2026-08-07.md`,
> `multi-photo-catalog-pipeline-2026-08-07.md`,
> `ghost-mannequin-research.md`, `ghost-mannequin-and-ai-photo-edit-status-solution-2026-08-07.md`.

---

## Session — 2026-08-08 (continuation): "Account not found" error explained + delete scope re-confirmed + SQL verified current

### What the user reported
1. Trying to delete a store account in the app throws `Error [ApiError: Account not found. Please complete registration.]`.
2. Re-confirmed the ask: delete ALL data for these 5 phones (shops, data, R2 files, products + images ONLY — **not a full DB reset**): `919898989898, 919999988888, 919999999999, 913131313131, 911313131313` so testing can restart from scratch. "keep the data which [is not these]" — i.e. everything else untouched.

### Root cause — "Account not found. Please complete registration."
- Source: `apps/api/src/plugins/auth.ts:359` — the auth middleware returns `403 RETAILER_NOT_FOUND` when a valid Supabase JWT maps to **no retailer row with `deleted_at: null`** AND no active Staff row.
- Why the user hit it: their app session belongs to one of the 5 test accounts, whose Supabase auth user was **already deleted** (previous session) and whose retailer row is **already soft-deleted** (`deleted_at` set — 4 of the 5; the 5th was soft-deleted too by a later self-delete attempt). So the token verifies cryptographically, but the DB lookup `retailer.findUnique({ auth_user_id, deleted_at: null })` finds nothing → 403.
- **This is expected half-deleted-state behavior, not a new bug.** The app's own Delete Account (soft delete) cannot run because auth rejects the already-deleted account first. Fix on user side: log out (or clear app data), the stale token is dead anyway.

### Verified current state (production audit, dry-run re-run 2026-08-08)
| Phones (normalized) | Retailer | DB rows | R2 objects | Supabase auth |
|---|---|---|---|---|
| 9898989898 Priya Fashion Store | soft-deleted | ✅ still present | ✅ 0 remain | ✅ deleted |
| 9999988888 | soft-deleted | ✅ still present | ✅ 0 remain | ✅ deleted |
| 9999999999 Priyank Shop | soft-deleted | ✅ still present | ✅ 0 remain | ✅ deleted |
| 3131313131 Priya Cloth House | **active** | ✅ still present | ✅ 0 remain | ✅ deleted |
| 1313131313 | soft-deleted | ✅ still present | ✅ 0 remain | ✅ deleted |

DB rows still present per retailer (totals: 69 products, 15 customers, 15 collections, 104 audit logs, 45+13+10 ai_usage_logs, 33 product_attributes, etc.). The R2 prefix sweep reports **0 objects under all 5 `retailers/<id>/` prefixes** — nothing left in storage.

### The one remaining step (user action — I cannot run it)
`scripts/delete-test-retailers.generated.sql` — **verified still current** (same 5 retailer IDs as the fresh audit: `cmsfpz6sj000cch3dglib890t, cmrlx3hog0000zfnjea54ic6z, cmscud4sk000cfs0resf5e7qu, cmrf020c6000z13osff9jm2w2, cmsfuqpha0000fegprbvs33d7`).
- Scope: ONLY these 5 retailers + their children (products, photos, spins, variants, embeddings, collections, customers, orders, subscriptions, staff, categories, attributes, tickets, payment accounts, overrides, counters, ai usage, audit logs, try-on rows). Nothing else. One transaction (`BEGIN`…`COMMIT`) — any failure rolls back everything.
- Runs `SET app.allow_hard_delete = 'true'` to bypass the F-017 guardrail trigger (required), FK-safe children-before-parents order, `storefront_collection_id` NULLed first.
- **Why it must be run in Supabase SQL Editor (superuser):** `kanchuki_app` role has no DELETE under SECURITY §19 role separation, and `PURGE_DATABASE_URL`/`kanchuki_purge` creds are not configured in this env. The previous `--apply` attempt correctly failed with `permission denied` and rolled back (nothing partial).
- After running: the trailing verify `SELECT` must return 0 rows per phone; then those phone numbers are free for fresh signup.

### Changes made this session
- None to code — the scope is a data deletion whose only remaining piece (DB rows) is intentionally blocked from app/script roles and requires the SQL Editor paste. Memory file updated.

### Open items / notes for next session
- **User to run `scripts/delete-test-retailers.generated.sql` in Supabase SQL Editor**, then confirm the verify query shows 0 rows per phone.
- After the wipe, the user logs in fresh with their live retailer number (stale app session from a deleted test account will keep 403-ing — log out first).

---

## Session — 2026-08-08 (very late): OTP network error diagnosed + phone validation shipped + 5 test retailers deleted

### What the user reported
1. OTP screen throws `Error [ApiError: Network request failed]` (stack: `client.ts request()`).
2. "Validation for valid mobile no, which is not integrated yet, complete phone no, must be validated, invalid number. fix all these things."
3. (Via ask_user answer) Delete 5 test retailer accounts completely (DB + R2 + related):
   `919898989898, 919999988888, 919999999999, 913131313131, 911313131313` so testing can restart with a live retailer.

### Root cause 1 — OTP "Network request failed"
**Not a server issue:** both `https://api.kanchuki.app/health` and the LAN API returned HTTP 200 from this machine;
prod `POST /v1/auth/otp/send` returned a proper 400 JSON for a bad number. The phone simply could not complete the HTTP request to whatever URL the bundle uses.

**The env-precedence gotcha (the real trap):** `apps/mobile/` has TWO env files with different `EXPO_PUBLIC_API_URL`:
- `apps/mobile/.env` → `http://10.87.207.14:3001` (LAN dev)
- `apps/mobile/.env.local` → `https://api.kanchuki.app` (prod)

Verified in `node_modules/@expo/env/build/index.js` `getEnvFiles()`: Expo loads, **highest priority first**,
`.env.${mode}.local` → `.env.local` → `.env.${mode}` → `.env`. So **`.env.local` (prod) silently overrides `.env` (LAN)**.
The app was pointed at production, not the local API the `.env` comment assumes. Both are gitignored/untracked.

**Fix (code, self-diagnosing):** `apps/mobile/src/lib/api/client.ts` — the raw-fetch re-wrap now names the exact URL:
`Network request failed to ${API_URL}${path}. Check that the API server is running and this device can reach it.`
Next time this error appears, the message tells you which server the phone tried.

**What to do on the phone (decide the target):**
- Local dev: ensure `apps/mobile/.env.local` either doesn't exist or matches `.env` (LAN IP), restart Metro (`npx expo start --clear`),
  phone on the SAME WiFi as the PC, Windows Firewall must allow inbound port 3001.
- Prod: keep `.env.local` as-is; phone needs working internet/DNS to `api.kanchuki.app`.
- (User's stated plan going forward: test with a LIVE retailer — i.e. prod is the intended target; `.env.local` already points there.)

### Change 2 — Complete Indian mobile number validation (was: length-only)
**Before:** mobile `phone.tsx` used `phone.replace(/\D/g,'').length === 10` (any 10 digits, incl. `0000000000`);
backend schemas used `z.string().min(10).max(15)` + a transform that only stripped non-digits — garbage like `1111111111` sailed through to Supabase.

**Shared:** `packages/shared/src/utils/index.ts` — added `INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/` and
`isValidIndianPhone(phone)` (normalizes +91/91/leading-0 prefixes, then requires 10 digits starting 6–9).
Also extended `normalizeIndianPhone` to strip a leading `0` (11-digit form). New tests: `packages/shared/src/utils.test.ts` (8).

**Backend schemas (all now reject invalid numbers with a clean 422):**
- `auth.ts` — `PhoneSchema` + `OtpVerifySchema` (`.refine(isValidIndianPhone, 'Enter a valid 10-digit Indian mobile number')`)
- `customers.ts` (CustomerSchema), `staff.ts` (StaffSchema), `public/public-retailers.ts` (leads), `checkout/checkout-helpers.ts` (create-order `customer_phone`), `checkout/checkout-flow.ts` (order lookup `phone`), `team/team-retailers.ts`, `team/team-members.ts` (create + update, optional)

**Mobile screens (inline error + proper gating):**
- `auth/phone.tsx` — `isValidIndianPhone`; shows red inline "Enter a valid 10-digit mobile number (starts with 6–9)" when non-empty & invalid; `maxLength` 10→15 (lets users paste `+91…`); button stays disabled on invalid.
- `customer/add.tsx` — same inline error + save blocked with alert.
- `staff/retailer-onboard.tsx` — `isFormValid` now uses `isValidIndianPhone`; inline error.
- `apps/mobile/src/test/setup.ts` — added `isValidIndianPhone` to the `@kanchuki/shared` mock.
- `apps/api/src/routes/security.test.ts` — mock gained the shared export; the "phone does not match" test now uses a VALID-format different number (`9876543211`) because `1111111111` is now correctly rejected by validation.

### Change 3 — 5 test retailers deleted (production, guardrail-aware)
**New script:** `scripts/delete-test-retailers.ts` (dry-run audit by default; `--apply` required).
Audit found **all 5 phones exist** — 4 already soft-deleted (awaiting the 15-day purge cron), 1 active ("Priya Cloth House", phone 3131313131):
`1313131313, 9999988888, 9898989898 ("Priya Fashion Store"), 9999999999 ("Priyank Shop"), 3131313131`.

**Applied (via `--apply`):**
- ✅ **R2: 236 objects deleted** (134 row-referenced keys + 102 prefix-sweep leftovers ≈31 MB) — product photos, spins, variants, measurements, try-on inputs/results, logos, banners, KYC, category covers under `retailers/<id>/`.
- ✅ **Supabase auth users: 5/5 deleted** (admin API, `SUPABASE_SERVICE_KEY`).
- ⚠️ **DB rows NOT deletable from this machine:** production role separation (SECURITY §19) revokes DELETE from `kanchuki_app`, and no `kanchuki_purge`/`PURGE_DATABASE_URL` creds exist here → the Prisma transaction correctly failed with `permission denied` and **rolled back (nothing partially deleted)**.
- ▶️ **Generated `scripts/delete-test-retailers.generated.sql`** — scoped, children-before-parents, `SET app.allow_hard_delete='true'`, single transaction, verify query at the end. **User must paste this into Supabase SQL Editor (superuser) to finish the DB wipe.**

### Verification (all green)
- `packages/shared` vitest `utils.test.ts` **8/8**; rebuilt `dist/` (API reads shared from `dist`, so a rebuild was required after adding the export).
- `apps/api` `tsc --noEmit` **0 errors**; `apps/mobile` `tsc --noEmit` **0 errors**.
- API full suite **355/355 across 27 files** (incl. security 24, team 25, auth-team 4, public 5).
- Mobile vitest **35 passed**; the 1 failed file is the KNOWN pre-existing Rolldown JSX-parse error in `expo-linear-gradient`'s vendor build (documented in CLAUDE.md, unrelated).

### Feature status at end of session
- OTP/login phone validation: complete end-to-end (mobile UI + backend schemas + shared helper + tests).
- Network errors now self-diagnose (URL in message).
- 5 test retailers: R2 + auth users gone; **DB wipe pending the generated SQL** (one paste in Supabase SQL Editor).

### Open items / notes for next session
- **FINISH THE DELETE:** run `scripts/delete-test-retailers.generated.sql` in Supabase SQL Editor. After it, verify with the script's trailing `SELECT` (expect 0 rows per phone).
- **Phone test target:** decide `.env.local` (prod) vs `.env` (LAN) deliberately; restart Metro with `--clear` after any change (env is inlined at bundle time).
- The two mobile env files both being untracked/gitignored means a fresh clone has NO `EXPO_PUBLIC_API_URL` and falls back to `http://localhost:3001` — which on a physical phone is the phone itself. If a teammate hits "Network request failed", check `apps/mobile/.env*` first.

---

## Session — 2026-08-08 (late): Add-Product crash diagnosed + fixed, full flow verified

### What the user reported
1. Starting the camera to add a new product throws:
   `ERROR  Text strings must be rendered within a <Text> component.`
2. Asked for a full diagnosis of the add-product flow: camera, AI tagging,
   auto-selection of categories/occasions/clothing type/style, image
   cropping, adding new backgrounds — working or not.
3. Asked for this memory file so the session survives laptop freezes.

### Root cause (confirmed by reading code, not guessed)
**File:** `apps/mobile/app/product/add.tsx`, **line ~580** (camera step, Controls row).

```jsx
// BEFORE (broken):
<View className="flex-row items-center gap-10">          <AnimatedPressable
//                                       ^^ 10 spaces between tags on the SAME line
```

The 10 spaces between the `View`'s `>` and the `<AnimatedPressable` on the
same line survive the JSX transform (JSX strips newline-adjacent whitespace
but **preserves mid-line whitespace**) → they become a text node `"          "`
as a direct child of a `View`. React Native rejects any string child of a
non-`<Text>` host with exactly the reported error. The stack trace pointed at
`AddProductScreen` → `View` → `createTextInstance`, matching perfectly.

**Why it wasn't caught:** `scripts/scan-text-strings.cjs` only flagged
JSXText with `value.trim()` non-empty — whitespace-only nodes sailed through.

### Fix
1. `apps/mobile/app/product/add.tsx:580` — moved `<AnimatedPressable>` to its
   own line (no mid-line whitespace):
   ```jsx
   <View className="flex-row items-center gap-10">
     <AnimatedPressable
   ```
2. `scripts/scan-text-strings.cjs` — scanner now also flags whitespace-only
   JSXText that contains no newline (the exact bug class). Verified: a
   fixture with the same pattern is now caught; the real mobile tree is CLEAN.

### Verification (all green)
- `grep '>[[:space:]][[:space:]]*<' apps/mobile/app apps/mobile/src -g '*.tsx'` → only
  the one real instance existed; `(tabs)/_layout.tsx` hits were false
  positives (`=> <Home …/>` arrow returns, not JSX children).
- `apps/mobile` `tsc --noEmit` → **0 errors** (after fix).
- `node scripts/scan-text-strings.cjs apps/mobile` → **CLEAN**.
- Not verified: on-device camera render (no RN simulator in this env) —
  **user must reload the app and confirm the camera screen opens.**

### Feature-by-feature status of the add-product flow (read from code)
| Feature | Status | Evidence |
|---|---|---|
| **Camera (Photo/Scan/Pro)** | ✅ Code complete — was BLOCKED only by the crash above | `add.tsx` `CameraView` + `useCameraPermissions`; Photo single-shot, Scan 5-frame burst with pick-shots review, Pro multi-shot (≤5, keep ≥3) with per-photo options; gallery import for all modes; shutter double-tap guard (`capturingRef`) |
| **AI Tagging (background, after save)** | ✅ Working | `apps/api/src/jobs/tag-product.ts` — `handleTagProduct` enqueued via `QUEUES.AI_TAGGING` on product create; tags name/SKU/description/subtype/category/color/fabric/pattern/occasions/style; never-clobbers manual edits; `recordAiUsage` quota attribution (F-023) |
| **Auto category (merchandising)** | ✅ Working | F-024: `resolveCategoryId()` matches AI free-text category against retailer's own `ProductCategory` list (seeded defaults + custom); only sets `category_id` when still null |
| **Occasion / Style / Fabric auto-selection** | ✅ Working | DB-backed `ProductAttribute` taxonomy (F-027, migrated live 2026-08-07); `add.tsx` multi-select chips load via `productAttributeApi.list('OCCASION'/'STYLE'/'FABRIC')`; AI fills arrays only when empty |
| **Image cropping / cleanup** | ✅ Working (two paths) | Photo mode: server-side auto-clean in the tag job (`cleanupProductPhoto`, crop + bg-strip, togglable `auto_cleanup`). Pro mode: `POST /products/pro-cleanup` — rembg + optional SAM2 hardware removal + `tight_crop` + sharpest-photo primary (Laplacian). ⚠️ **Pro needs the photo-cleanup sidecar** (`PHOTO_CLEANUP_SERVICE_URL`) — without it the status probe shows Pro unavailable / 503 with "use Photo mode instead" (by design) |
| **Backgrounds** | ✅ Working | F-011 library picker (`getBackgroundImages`, "Auto" = contrast-match); F-028 auto-contrast: `classifyColorTone(primary_color)` → `pickContrastBackground` (dark garment → light backdrop, light → dark); admin-managed tone override on `/admin/background-images` |
| **Save flow** | ✅ Working | Photo uploads at save time (no blocking AI screen — the 2026-08-08 rework); extras attach best-effort; "Add Spin View?" prompt after create; offline mutation queue unchanged |

**Net:** the add-product pipeline (shoot → price → save → background AI) is
fully wired end-to-end. The only thing that was broken was the render crash,
now fixed.

### Open items / notes for next session
- **On-device verify:** camera screen opens on a real phone after the fix
  (no simulator here to confirm).
- **Pro mode prod caveat (known, by design):** Railway API container has no
  Python/rembg; Pro works where the `PHOTO_CLEANUP_SERVICE_URL` sidecar is
  deployed (Hetzner CX43 hosts it). `GET /products/pro-cleanup/status`
  probes this up-front.
- **Migration state (unchanged):** 043–047 all applied live per CLAUDE.md;
  nothing new needed for this fix.
- The repo's own scanners (`scripts/scan-text-strings.cjs`,
  `scripts/scan-runtime-text.cjs`) are worth running before any commit
  touching `apps/mobile` JSX. (scanner 2 is heuristic/noisy — 409 hits are
  mostly `.map()` false positives; eyeball, don't trust blindly.)

---

## Session template (copy for the next entry)

## Session — YYYY-MM-DD (short label)

### What the user reported
- (…)

### Root cause
- (…file:line, how confirmed…)

### Changes made
- (…file → what changed…)

### Verification
- (…commands + results…)

### Feature status at end of session
- (…)

### Open items / notes
- (…)
