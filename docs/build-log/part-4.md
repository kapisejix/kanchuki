# Kanchuki — Build Log (part 4 of 6)

> Continuation of [`../BUILD-LOG.md`](../BUILD-LOG.md) — split 2026-09-26 to stay under the 150k-char doc limit. Full chronological detail, same as before, just split by size. Sections in this part run from "BUILT 2026-09-08: Root-cause fixes batch (3 commits — AI Campaign Assistant, category delete guardrail, customer product-detail sheet)" to "BUILT 2026-09-20 — DPDP notice update + shopper "right to nominate"".

---

## BUILT 2026-09-08: Root-cause fixes batch (3 commits — AI Campaign Assistant, category delete guardrail, customer product-detail sheet)

Three unrelated bug-fix commits landed in one session; each has a tracked root cause in `docs/root-cause/root-cause issues.md` (RC-001…RC-006).

### `70e057a8` fix(ai): harden campaign-intent parsing + fix festival resolution + surface real errors

- **RC-001** — `POST /v1/growth/ai-campaign` intermittently 500'd ("Failed to generate campaign" on mobile). `parseCampaignIntent` used the free-text `ask()` path with no schema enforcement, so provider replies arrived as missing `product_criteria`/`audience` objects, stringified nested JSON, out-of-union enums, numeric strings, or comma-joined arrays — any of which threw inside the DB route. Added `normalizeCampaignIntent()` in `packages/ai/src/campaign-assistant.ts`: never-throwing coercion (re-parses stringified objects, coerces enums/numbers/arrays, caps `limit` 20, safe defaults `PROMOTION`/`casual`). 7 new ai-package tests.
- **RC-002** — FESTIVAL drafts always returned `festival_id: null` and couldn't be saved. Festival resolution matched `name: { equals: prompt.split(' ').slice(0,3).join(' ') }` — an exact match against the literal first three words of the prompt, which never equals a festival name. Fixed to match any festival whose name appears anywhere in the prompt (newest-starting first). 3 new route tests.
- **RC-003** — mobile `ai-campaign.tsx` swallowed the real API error and showed the constant "Failed to generate campaign". Now surfaces `ApiError.message` when present, generic string only as fallback.

### `21be0e92` fix(api): category DELETE through purge role with allow_hard_delete guardrail

- **RC-004** — `DELETE /v1/categories/:id` called `prisma.productCategory.delete` through the main `kanchuki_app` client, which has DELETE revoked on `product_categories` under SECURITY §19 (hard-delete table + BEFORE DELETE guardrail). 500'd on the category screen. Now routes through `getPurgePrisma()` with `SET app.allow_hard_delete = 'true'` inside the transaction (same pattern as products-trash/products-variants) + audit-log row. 2 new route tests.

### `590c2185` fix(web): customer product detail sheet — related products + design links

- **RC-005** — Related-product thumbs only called `onClose()` — never opened the tapped product. Added `onSelectProduct` prop (in-place sheet swap, same as AIStylist's `onProductTap`), wired to `setSelectedProduct` in CollectionView, plus a per-product view-state reset effect.
- **RC-006** — Suits Designs permalink links "went nowhere": the sheet pushes a history entry on mount and its unmount cleanup called `window.history.back()` unconditionally, instantly undoing the `<Link>` navigation to `/{store}/designs/{id}`. Cleanup now only rolls back when the sheet's own entry is still the top-most history state. Heading also renamed "Related suits" → "Related Products". 2 new web tests.

**Verification:** ai 91/91, api growth suite 25/25 + categories 4/4, web 122/122 (incl. 2 new ProductDetailSheet tests); `tsc --noEmit` clean on ai/api/mobile/web; no new Biome diagnostics vs baseline.

## BUILT 2026-09-08 (later): Mobile bug-fix batch #5–#9 (4 commits — customer detail, GST report, team member, logo save, switch plans)

Five retailer-reported mobile errors fixed in one session, root causes tracked in `docs/root-cause/root-cause issues.md` (RC-007…RC-011).

### `df63010d` fix(mobile): customer detail + GST report tolerate teardown-removed fields

- **RC-007 (#5)** — opening a single customer crashed: `Cannot read property 'length' of undefined`. `apps/mobile/app/customer/[id].tsx` dereferenced `customer.interactions.length` + `total_purchases`/`total_spent`, all removed by the 2026-08-31 teardown (migration 082 dropped `customer_interactions` and checkout data). Fields now optional, stat reads null-coalesce (`?? 0`), Recent Activity gated on hoisted `recentInteractions = customer.interactions ?? []`.
- **RC-008 (#6)** — GST report (Growth) crashed: `Cannot read property 'toLocalString' of undefined`. The mobile `GstSummary` type + screen still read `estimated_cgst`/`estimated_sgst`/`estimated_igst` while the server summary route (and the already-fixed admin report, §59.2) returns `cgst`/`sgst`/`igst` — stale field-name contract across the wire + unguarded `inr()` formatter. Type renamed to real names; `inr()` now returns `₹0` on null/undefined/NaN.

### `91214791` fix(mobile): surface real API errors on team-member + profile/logo save

- **RC-009 (#7)** — adding a team member always showed the constant "Failed to add team member". `settings/staff.tsx` mutation `onError` discarded the real `ApiError` (duplicate phone, seat limit, phone already a retailer account). Now surfaces `ApiError.message`, generic only as fallback.
- **RC-010 (#8)** — "Error when adding logo to retailer profile": the Edit Profile modal (`settings/index.tsx`) re-sent the stored GSTIN on **every** save, and a GSTIN captured once during onboarding can't round-trip the strict uppercase server regex — the whole `PUT /me` 422'd, failing unrelated logo/banner/profile saves. GSTIN now omitted when unchanged (`gstinChanged`), sent as `''` when cleared; upload + save catch blocks also surface real errors.

### `54970c5a` fix(api,mobile): bound Razorpay calls — stop switch-plan request timeouts

- **RC-011 (#9)** — Switch Plans: "Request timed out (/v1/billing/subscription). Check that the API server is running". The server's raw Razorpay `fetch` had no timeout, so a slow/hung Razorpay kept the route open past the mobile client's 10s abort → misleading outage message. Server `razorpay()` now defaults to `AbortSignal.timeout(20s)` (caller signal still honored); mobile `subscribe` + `cancel` get a 60s `timeoutMs` budget.

### `86440221` test(api): pin POST /v1/staff contract + GSTIN/profile logo-save rules

New `staff.test.ts` (happy path + invalid phone 422 + seat limit 402 + duplicate active-staff phone 422 + retailer-account phone 422 + GET list) and 2 `retailers.test.ts` cases (logo-only save with GSTIN omitted → 200; malformed GSTIN → 422 "Invalid GSTIN format"). Draft test also surfaced a vitest trap: `vi.clearAllMocks()` doesn't clear `mockResolvedValueOnce` queues — `vi.resetAllMocks()` required.

**Verification:** api **913/913** tests (72 files; staff 6/6, retailers 41/41), mobile **59/59**, `tsc --noEmit` clean on api + mobile.
## BUILT 2026-09-09 — Post-teardown dead-code sweep of the mobile app (RC-012, RC-013)

Swept `apps/mobile` for kept screens still reading fields/features the 2026-08-31 teardown (migration 082) removed — same crash class as RC-007/RC-008. Two survivors found and pruned:

**RC-012 (`440b900`) — customer detail screen still shipped the deleted measurement flow.** The teardown dropped the `CustomerMeasurement` model, its endpoints, and the `/customer/:id/measurement` route, but `customer/[id].tsx` survived with the full Measurements card: Manual form modal, Camera button navigating to the now-404 route, a measurement `useQuery`, plus a Recent Activity section consuming the dropped `customer_interactions` field. Removed the card/modal/nav/query and the `Measurement`/`Interaction` types; deleted the orphaned `getMeasurements`/`createManualMeasurement`/`initPhotoMeasurement`/`extractMeasurement`/`getMatches` methods from `customerApi`; trimmed unrendered `total_purchases`/`total_spent` off the customer-list type.

**RC-013 (`2c6b348`) — dead 360-spin UI and stale VTO/try-on reads.** `product/[id].tsx` carried a fullscreen spin modal + touch handlers + `spin_status`-polling refs that nothing ever opened; `productApi` had orphaned `getSpinVideoUploadUrl`/`submitSpinVideo`. Removed all of it. Cleaned the guarded-but-dead `try_on_credits` declarations/feature lines out of onboarding, plan-select, analytics and the `billing`/`analytics` API types (plans payload never sends it — verified against `jsonLimits`/`PLAN_LIMITS`).

**Verification:** mobile `tsc --noEmit` clean, **59/59** vitest (11 files). Grep-proof: zero remaining `spin_*`/`measurement`-route/`try_on_credits` reads in `apps/mobile`; no `router.push` to any deleted route.

## BUILT 2026-09-09 — Tokenized staff invites — core, lifecycle UI + WhatsApp delivery (CLAUDE.md row #71; spec `docs/tasks/done/staff-invite-tokens.md`)

Replaces the FR-6.1 "copy this text" stopgap (`dab79651`): a staff member added with name+phone now gets a **single-use `kanchuki://join?token=…` invite link** that carries "this is a team join, not a new signup" from the link into the first OTP verify. The token never authenticates — login stays phone+OTP, the SIM stays the auth factor (D1); after first login `staff.auth_user_id` routes every future login via the existing phone-match path, token irrelevant forever (D2).

**Phase 1 — Core:** migration `099_staff_invites` (staff_id unique, sha256 token_hash — raw never stored, status pending/used/expired/revoked, 7d TTL, CASCADE on retailer+staff, DELETE grants for app+purge roles, **backfill** of a pending invite per active never-logged-in member). `POST /v1/staff` mints the invite **in the same `$transaction`** as the row (response carries `invite: { url, expires_at }`); `GET /v1/public/staff-invite/:token` (masked phone only, rate-limited); `POST /v1/public/staff-invite/:token/otp` (server-sends OTP to the bound phone — **phone never crosses the wire**, D3); `invite_token` branch on `/v1/auth/otp/verify` that **resolves the invite before** OTP verification so a bad/expired/used/revoked token 400s and never falls through to `retailer.upsert`; purge job DELETEs `staff_invites` before the staff row. Mobile: new `app/join.tsx` (in the `!isAuthed` guard block) reads `?token=`, `auth/otp.tsx` passes the token through and shows the masked bound phone. Two spec decisions taken with owner sign-off: **RLS left off** (migration 093 convention — the zero-policy RLS pattern is a Supabase-era vestige that breaks the pooled Prisma read path) and **D3's no-phone design** (the client never sends the member phone on the invite flow).

**Phase 2 — Lifecycle UI:** `POST /v1/staff/:id/invite/resend` (owner-only, replaces the token on the same row via upsert — D5, 409 `ALREADY_JOINED`, audit `staff_invite_resend`); `GET /v1/staff` now derives per-member `invite: { status, expires_at }` (pending past expiry reads as `expired` server-side; joined members get `null`); mobile `settings/staff.tsx` invite-status chips; web `apps/web/src/app/join/page.tsx` bridge (pending → "Join {shop} as {role}" + masked phone + `kanchuki://join` deep link; used/expired/revoked/404 → dead-ends; no OTP on web — it bridges to the app).

**WhatsApp delivery (owner ask — free, universal, low volume, replaces MSG91):** `buildWhatsAppInviteUrl()` (`wa.me/91<phone>?text=<invite message>`, same pattern as collection share) — the add-member modal leads with a green **Send on WhatsApp** button, and the member-row chip has a one-tap **WhatsApp** resend that mints a fresh link (`resendInvite`) and opens the retailer's own WhatsApp pre-filled. No MSG91 (DLT+cost), no Meta Cloud API (₹0.38/conversation+template), no server round-trip; Copy/Share remain for the no-WhatsApp case.

**Verification:** API **960/960** (10 auth-invite + 10 public-route + 7 resend/status tests), mobile **78/78** (join screen + WhatsApp URL lib), web **128/128** (join page 6) — all three `tsc --noEmit` clean, biome clean on touched files. (The intermittent full-suite API failures are the pre-existing flaky image-upload tests under parallel load — pass in isolation and re-runs.)

---

## CLEANUP 2026-09-12: CI lint gate to zero (188 Biome diagnostics) + Facebook-login runbook + Play Store release provenance

Three commits (`7502c4a7`, `b48bf927`, `56676dbe`) — no product behaviour changed; the first removes a blind spot in CI, the other two move Facebook/Meta and Play Console setup from tribal knowledge into the repo.

### `7502c4a7` chore(api): clear all 188 Biome diagnostics

The `quality` job only ever failed on **errors**, so the warning count drifted to 188 without anything going red — enough noise that a real finding would hide in it. `biome check src/` now reports 288 files / **0 diagnostics**.

**Production (129) — refactored, not silenced.** `noUncheckedIndexedAccess` is on (`tsconfig.base.json`), so deleting the `!` is not an option; every site needed a real guard.

- `noExplicitAny` (48): typed the provider-JSON boundary. `retailers-integrations.ts` (19 sites) got named shapes (`MetaApiErrorBody`, `MetaIdResponse`, `MetaAccountResponse`, `GoogleTokenResponse`) plus an `apiErrorMessage(body, fallback)` helper, following the existing `meta-catalog.ts` precedent. `where: any` became `Prisma.RetailerWhereInput` / `ProductWhereInput` / `ProductReviewWhereInput`; the raw vector SQL now casts to a declared `SearchRow` interface instead of `any[]`.
- `noNonNullAssertion` (78): two clusters. Map lookups with an upstream predicate now throw explicitly (`loadedProducts.get(id)`, `accountById.get(targetId)`, `snapshots[0]`); accumulator loops (`obj[key]!`) collapsed into a shared `accumulator(map, key, factory)` helper in `growth-helpers.ts`. **A first pass used `??=`, which merely traded `noNonNullAssertion` for `noAssignInExpressions`** — hence the helper rather than the operator.
- `retailers-ratings.ts` dropped redundant `(request as any).retailerId as string` casts: `request.retailerId` is already typed. Its query params got a typed cast matching the existing `as { category?: string }` precedent.
- Four `biome-ignore` suppressions that the rule changes orphaned were cleared.

**Tests (59) — scoped off with the reason inline.** `delete process.env.FOO` is the **only correct way** to unset an env var; the rule's suggested fix (`= undefined`) stores the literal string `"undefined"` in Node and silently breaks the test. Also scoped: `noNonNullAssertion` (`mock.calls[0]![0]` on a double the test just built) and `noExplicitAny` (`vi.fn()` callbacks, partial fixtures) — in each case the offending expression is the test's own scaffolding, so the rule is wrong for that file, not the file wrong for the rule.

**Config renamed `biome.json` → `biome.jsonc`** so those reasons can be comments. Grepped first: only prose referenced the old filename, and CI never names it (`pnpm lint` resolves it), so nothing else needed changing.

**Verification:** `biome check src/` 288 files / 0 diagnostics (was 188 warn-level); repo `pnpm lint` 6/6; `tsc --noEmit` clean; **960/960 API tests** (74 files). CI run `34681789887` — all four jobs green, **zero Playwright retries** (the RC-019 offline test passed first attempt).

### `b48bf927` docs: Meta dashboard runbook for Facebook one-tap login

New `docs/DEPLOY.md (Meta Dashboard Setup section)` — an operator runbook; the login code needed no change. Every fact in it is sourced from the repo rather than written from memory: app id `1758308975480748` and scheme (mobile `app.json` plugin block), package/bundle `app.kanchuki.retailer`, redirect URIs `/social/connect` + `/social/connect/callback` (`defaultOAuthRedirect()`, `retailers-social-connect.ts:28`; web callback at `:350`), the `PAGE_PERMISSIONS` / `IG_PERMISSIONS` lists (`facebook-auth.ts`), the `NO_PAGES_FOUND` / `NO_PAGE_TOKEN` / `NO_IG_FOUND` throws in the connect route, the signing secrets and keystore mechanics (`android-release.yml:54-88`), and the compliance URLs (all real web routes).

Two findings that were the likely actual blockers — both configuration, neither fixable in code:

1. **Play App Signing.** A build delivered through Play Console is **re-signed by Google**, so the certificate on the installed app is Play's app-signing key, *not* the upload keystore CI signs with. Registering only the upload keystore hash reproduces the exact reported symptom — correct code, correct build, login never completes. Both must be registered; Meta accepts a list.
2. **Format.** Meta wants `base64(SHA-1(DER cert))`; Play Console and `eas credentials` both display colon-separated **hex**, which Meta rejects. That is a conversion problem, not a missing value.

Also records that validation is **server-side**, so **no rebuild is needed** after saving a hash — the opposite of the natural assumption. And `social-connect-native.md` §2 still instructed you to "replace the three placeholders" for values that are already real; corrected to point at the runbook so there is one source of truth instead of two drifting ones.

**Deliberately cut from the first draft:** two claims that could not be verified — that the SDK caches the key-hash check for the process lifetime, and that Meta "falls back to looser validation" with no Android platform entry. Neither is in the shipped doc.

### `scripts/meta-android-key-hash.mjs` (new, with `b48bf927`)

Does the hex → base64 conversion, and reads the certificate straight out of a **JKS**: in that container the certificate chain is plaintext DER and only the private key is encrypted, so no password and **no JDK** are needed. That matters here because release builds only happen in CI and there is no `keytool` on the dev machine. It refuses to print a value unless two checks pass — Node's own X.509 fingerprint agrees with hashing the DER it extracted, and the certificate **verifies against its own public key** (a signing certificate is self-signed, so a mis-offset read cannot pass). Also documents the `META-INF/<first-8-of-alias>.RSA` naming convention for identifying which key signed a shipped artifact.

### `56676dbe` docs: Play Store release provenance

`docs/PLAY-STORE-RELEASES.md` had only a versionCode and a date per row. Four `android-release.yml` runs landed on 2026-09-11 and **two produced a versionCode 3 artifact** (`34617176198` at `c14cc6f3`, `34619372677` at `0305d589`), so which was uploaded is now unreconstructable. The row is **marked ambiguous rather than guessed** — both runs contain the same code (only a docs diff), so behaviour is identical but provenance is not knowable. Adds CI-run + commit columns backfilled from the real runs, the rule *"write the run ID and SHA into the row at trigger time"*, and how to trace an installed build through the Settings build-info footer.

**Upload keystore hash — extracted and confirmed two independent ways that agree exactly:**

```
SHA-1:          16:3B:21:32:B6:DB:00:C4:0D:AF:04:2F:ED:10:3D:8D:87:CC:AF:45
META KEY HASH:  FjshMrbbAMQNrwQv7RA9jYfMr0U=
```

Path 1: the new script reading `apps/mobile/@s.numbhraal__kanchuki.jks`. Path 2: downloading the shipped `app-release.aab` from run `34619372677` and reading its signature block with `openssl` (`META-INF/F8DE0ED2.RSA`, matching the alias prefix — JAR signing names the block after the alias's first 8 characters). Two consequences GitHub secrets cannot otherwise reveal: the `ANDROID_KEYSTORE_BASE64` secret holds **this same keystore**, and `_OLD_1.jks` is **not a rotated key** (identical certificate, identical 2026-09-02 → 2054 validity), so nothing extra needs registering for it.

**⚠️ Not extractable from this repo — the Play App Signing key hash.** It is Google's key and is readable only from Play Console → *Release → Setup → App signing*, or from an APK Play actually installed. The CI artifact is upload-signed (confirmed directly above), so it cannot stand in. This is the value most likely responsible for the Facebook-login symptom.

**Verification:** all four guard scripts pass, including `check-secrets-guard.sh --all` (which scans the tracked tree, so it covers both new docs); `pnpm lint` 6/6.

## BUILT 2026-09-12 (later): Android release hardening — AD_ID guard in CI, RECORD_AUDIO blocked, AAB merged-manifest inspector

One symptom, three defects. `versionCode 4` (built from `10c8f2d`) was blocked in Play review with *"Incomplete advertising ID declaration"*. `com.google.android.gms.permission.AD_ID` appears nowhere in this repo — and that turned out to be the easy part. Proving it surfaced a **wrong entry in the release log**, a **config option that had never worked**, and a **verification method that gave the wrong answer in both directions at once**. No build was triggered and no `.aab` was produced; everything below is measured against the five already-downloaded CI artifacts.

### 1. Where AD_ID actually comes from — and why nothing in the repo shows it

`react-native-fbsdk-next` pulls `com.facebook.android:facebook-android-sdk:18.+`, whose `facebook-core` **AAR** manifest declares the permission. An AAR manifest is merged at Gradle time, so the string is invisible to `git grep`, to `node_modules/**/AndroidManifest.xml`, and to `expo prebuild`. `apps/mobile/plugins/withRemoveAdId.js` is the only thing removing it, and it is correctly registered (last entry in `app.json`'s `plugins`).

### 2. The Play block is a Console form — and the checklist pointed at the wrong one

*"Incomplete advertising ID declaration"* is not a manifest scan; it is the **App content → Advertising ID** questionnaire, never completed, and Play refuses to roll out a release targeting API 33+ until it is. The checklist told the reader to set this under **Data safety**, which is a *different* Console question — both now named, with a warning that they must agree.

The order matters, and it is why the checklist now says to check **App bundle explorer → Permissions** first: declaring **"No"** while the permission is actually present triggers a *harder*, opposite block ("this version includes the permission, but your declaration indicates that your app doesn't use any advertising IDs").

### 3. `tools:node="remove"` leaves no trace — the doc had this exactly backwards

The checklist claimed a removed permission keeps its name in the bundle as a marker, so the `.aab` could not be trusted to distinguish *declared* from *removed*. **Measured across the five real bundles, that is false.** The merged manifest declares no `tools` namespace at all and contains the string `remove` zero times: the counterparts are `READ_MEDIA_IMAGES`, which carries a `tools:node="remove"` marker in the source manifest and appears **nowhere** in the versionCode 4 bundle, while versionCode 2 (pre-block) does list it. So **absence proves removal and presence proves a real declaration** — which is what makes the RECORD_AUDIO finding below conclusive rather than hedged.

### 4. `recordAudioAndroid: false` was a silent no-op — RECORD_AUDIO was always shipping

`expo-camera`'s library manifest declares `android.permission.RECORD_AUDIO` **unconditionally**, and its config plugin only ever *adds*:

```
AndroidConfig.Permissions.withPermissions(config,
  ['android.permission.CAMERA', recordAudioAndroid && 'android.permission.RECORD_AUDIO'].filter(Boolean))
```

So `false` merely declines to add the permission; it never removes the library's own declaration, and a library manifest merges in regardless. The option is a **no-op for removal** — every doc that read it as "trimmed" was wrong, and the permission shipped in every release.

**Decision: Data safety still answers "No" for audio.** The form asks what the app *collects or shares*, and nothing records audio — no `expo-audio`/`expo-av` dependency, no `recordAsync`, no `requestAudioPermissions`, and all four `CameraView` call sites are photo/barcode capture, never `mode="video"`. Declaring it would *over-claim* collection. The permission itself is now removed the way the `READ_MEDIA_*` group already was: `blockedPermissions` in `app.json`, which provably wins the merge (same mechanism, and `READ_EXTERNAL_STORAGE` — declared by two library manifests — is absent from v4).

### 5. The guard's regex was wrong in both directions; the new decoder proved it

`scripts/check-aab-ad-id.mjs` deliberately uses a substring test — for its single yes/no question that is the right trade. But as a *reported count* it was misleading, and the first draft of the new inspector's proper protobuf decode found out why:

| versionCode | requested (`uses-permission*`) | declared (`<permission>`) | required **of callers** | regex says |
|---|---|---|---|---|
| 1 | 23 | 1 | 2 | 24 |
| 2 (×2) | 23 | 1 | 2 | 24 |
| 3 | 18 | 1 | 2 | 19 |
| 4 | 18 | 1 | 2 | 19 |

The regex **over**-counts `android.permission.DUMP` (an `android:permission` on a `<receiver>`) and `BIND_JOB_SERVICE` (on a `<service>`), which are permissions the *callers* must hold — the inverse of a request — and **misses** `app.kanchuki.retailer.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` entirely, because that name contains no `.permission.` segment. The two errors happen to cancel, so 19 looked credible. **18 is the number the Data safety form is compared against.**

Two bugs found in the new decoder itself, both worth recording:

- **`XmlElement.child` holds `XmlNode` wrappers, not elements** (`XmlNode { 1: element, 2: text, 3: source }`). Reading a child as an element picks up its `SourcePosition` as the element *name*, yielding binary garbage — and because whitespace text nodes have no field 1, two of the five bundles then reported **0 permissions**, which reads exactly like a clean manifest. Fixed with a `decodeNode()` unwrapper.
- The entry file's root check (`root.name !== 'manifest'`) is what makes a misparse **fail loudly** instead of silently reporting an empty, "clean" permission list.

### Files

| File | Change |
|---|---|
| `.github/workflows/android-release.yml` | New step *"Check the merged manifest is free of AD_ID"* (step 11 of 13), after the signing verification and **before** `upload-artifact` so a Play-blocked bundle can never be downloaded and hand-uploaded. Cost: one file read. |
| `scripts/check-aab-ad-id.mjs` | **New.** Fails the release build if the shipped AAB declares AD_ID. Fails closed on every unreadable path, and requires `android.permission.CAMERA` as a read-sanity anchor so an empty extraction cannot pass as "absent". |
| `scripts/inspect-aab-manifest.mjs` | **New.** Decodes the merged manifest and reports package, `versionCode`/`versionName`, min/target SDK, the full permission list grouped by family, and the AD_ID verdict. `--json` for machine-readable output, `--strict` to exit non-zero when AD_ID is declared. A report is not a verdict, so it exits 0 on findings unless `--strict`. |
| `apps/mobile/app.json` | `android.permission.RECORD_AUDIO` added to `expo.android.blockedPermissions` (1-line diff). Takes effect on the next build only. |
| `docs/PLAY-STORE-RELEASES.md` | §2 new "Audio" subsection (decision + root cause); §3 corrected (the `.aab` **is** authoritative, `RECORD_AUDIO` resolved, both Console locations named, the fix path, the 18/1/2 breakdown); §7 realigned. |
| `docs/PLAY-STORE-RELEASES.md` | The **versionCode 2** row falsely credited an "AD_ID strip" — impossible, since the plugin (`b1ccefce`) postdates that upload and `6fc542ae` is only a one-line versionCode bump. Credited to versionCode 3 where it belongs; "in flight" section updated (4 is built + uploaded + blocked, so it gets **no Uploads row**). |

### Verification

Both guards run against all five real AABs: `check-aab-ad-id.mjs` **passes versionCode 4 and fails versionCode 2** (proving it can fail), `check-android-version-code.mjs` passes (reserves 4, records 2 and 3). The inspector's decode was cross-checked against the five bundles and agrees with the regex on the AD_ID verdict in every case. Fail-closed paths exercised: empty manifest, garbage bytes, wrong root element, missing AAB, non-zip, and default-path-with-no-build all exit 1 rather than reporting a phantom clean result. `biome check` exits 0 on both new scripts — same state as the existing guard. All edited files are 100% CRLF with zero bare-LF.

**Still open:** the Play Console declaration itself (*App content → Advertising ID → No*), which only the owner can answer; the RECORD_AUDIO removal is verified in the **source** manifest only (the merged proof needs a build, deliberately not triggered); and the versionCode 4 release stays blocked until the declaration is saved.

## BUILT 2026-09-17 — F-036 Phase A: customer PWA visited-store list + installable home-screen icon (CLAUDE.md row #73)

Spec `docs/tasks/pending/customer-pwa-push-notifications.md`; requirement `docs/PRO-REQUIREMENTS.md` §32. **Phase A only** — Phase B (Web Push) is deliberately not started, so there is no `PushSubscription` model and no `push` handler in the service worker. **Zero files under `apps/mobile`.**

The feature sits on identity work already shipped (`CustomerAccount`/`CustomerStoreVisit`, migrations `079`–`081`) — Phase A is the missing *surface*, not new identity.

| Piece | File | What it does |
|---|---|---|
| Visited-store page | `apps/web/src/app/(shopper)/my-stores/page.tsx` | Lists the passport's `CustomerStoreVisit` rows, newest first. The `My Stores` nav link in `(shopper)/layout.tsx` existed already and pointed at a 404 until this landed. |
| Mapping / formatting | `…/my-stores/lib.ts` | Pure `mapStoreVisits` + `formatLastVisit` — drops malformed rows, never accumulates across renders, re-sorts defensively |
| API field | `apps/api/src/routes/public/passport/passport-stores.ts` | Adds `public_slug` to the `retailer` select — the storefront key each row links to |
| Installed-icon entry point | `apps/web/public/manifest.json` | `start_url` `/` → `/my-stores` |
| Install CTA | `apps/web/src/lib/install-prompt.ts`, `apps/web/src/components/InstallPrompt.tsx` | Captures `beforeinstallprompt`, offers our own button |
| CTA mount points | `PassportSheet.tsx` (below the primary action), `my-stores/page.tsx` (non-empty list), capture listener in `app/layout.tsx` | Shown at the two "just verified a visit" moments |
| Tests | `passport-stores.test.ts` (5), `my-stores/__tests__/{lib,page}.test.tsx` (10 + 8), `install-prompt.test.ts` (20), `InstallPrompt.test.tsx` (9), `manifest.test.ts` (3) | — |

### `start_url`: the plain route, not a smart redirect

Chose `start_url: "/my-stores"` — the list always, **not** the "single-store visitor goes straight to that store" variant the task doc offered as the alternative. The list already handles all three cases (no visits / one row / many rows), so every installed icon follows one code path that has to work anyway; a redirect adds a second per-launch branch whose failure modes (landing on the wrong store, or a loop for a zero-visit shopper) are worse than one extra tap for the single-store case. It is also a one-line manifest change with no server work, so it could ship inside Phase A instead of waiting on a routing decision. Worth revisiting once real launch data exists.

### The install event has to be captured at startup, not in an effect

`beforeinstallprompt` is the only way to drive installation from our own button (`preventDefault()` suppresses Chrome's mini-infobar and keeps the event promptable), and Chrome dispatches it **once per page load**, as soon as it decides the site is installable — typically before React hydrates. Both CTA mount points render only after an async step (the passport lookup in `ContactGate`, the stores fetch on `/my-stores`), so a listener added in a component effect missed the event on exactly the visits the CTA exists for, and the button silently never appeared.

Fixed by attaching the listener at **module scope** in `lib/install-prompt.ts` (`ensureInstallPromptCapture`, idempotent per target) plus an inert `InstallPromptCapture` in the root layout whose only job is to pull that module into the initial client bundle; the component now subscribes to captures instead of owning the DOM listener. `preventDefault()` is consequently called sitewide, which is intended — the omnibox install icon and the browser menu entry are unaffected by it, so holding the event costs nothing where no CTA renders, while a missed event cannot be recovered.

### Verification

`apps/web` tsc clean, **178/178 tests** (28 files, +15); `apps/api` tsc clean, **967/967** (75 files, incl. 5 new passport-stores tests). The startup-capture regression test was confirmed **sensitive** rather than assumed: with the module-scope registration commented out it fails (`expected "preventDefault" to be called at least once`), and passes with it restored.

Task 4 confirmations: a row links to `/{public_slug}` → the pre-existing `[store]/page.tsx` (resolved by `public_slug` in `public-retailers-storefront.ts`, rendering the existing `CollectionView` behind the existing `ContactGate`) — `[store]` and `ContactGate` are **not in the diff**, so the tap-through is the same page a QR scan or a WhatsApp share opens; the diff touches **no** share/WhatsApp file; **zero** files under `apps/mobile`. Also checked rather than assumed: `/my-stores` is a static segment that outranks `[store]`, but no retailer slug can collide with it — `generateCollectionSlug` always appends a 4-char random suffix.

### Known issues (filed, not fixed here)

- **`return_to` is written but never read** — `docs/tasks/done/return-to-post-login-redirect.md`. Pre-existing and now more visible: an installed-icon launch with an expired cookie bounces to `/`, which has no login surface (the only passport OTP entry point in the customer web app is a store catalog page). Deliberately not bundled into this diff. **✅ Fixed later the same day — see the entry below.**
- **No live browser run.** The tap-through chain is verified by reading route resolution plus unit/component tests; no one has clicked a row in a real browser, and the task's own acceptance test (anonymous → bounce → OTP → back on `/my-stores`) cannot pass until the item above is fixed. **✅ Closed later the same day** — a live Chrome run (prod build) now covers both the tap-through and the full acceptance test in `e2e/customer-my-stores.spec.ts`; see the entry below.
- **Phase C still owns iOS.** Phase A ships no "Add to Home Screen" banner; Safari 16.4+ requires the PWA be installed before it can receive push at all, so that enforcement belongs with Phase B/C.

---

## BUILT 2026-09-17 (later) — `return_to` is now consumed: dedicated `/login` route + open-redirect validation

Closes the residual filed above (`docs/tasks/done/return-to-post-login-redirect.md`). F-036 Phase A pointed the installed icon at `/my-stores`; the guard bounced visitors who had no passport to `/` **with `?return_to=` attached and nothing reading it** — and `/` is the retailer marketing page, so there was no login surface anywhere outside a store catalog page. An installed-icon launch with an expired cookie dead-ended.

**Scope: `apps/web` only** — no API, schema, or `apps/mobile` change.

| Piece | File | What it does |
|---|---|---|
| Open-redirect-safe validator | `apps/web/src/lib/return-to.ts` | `sanitizeReturnTo()` reduces any input to a same-origin path or `DEFAULT_RETURN_TO` (`/my-stores`); never throws |
| Login route (server) | `apps/web/src/app/login/page.tsx` | Sanitises `?return_to=` before it reaches the client; `robots: { index: false, follow: false }` |
| Login form (client) | `apps/web/src/app/login/LoginForm.tsx` | Phone → OTP via the existing `/api/passport/otp/{send,verify}` proxy; widget-first with API fallback; redirects to the validated target on success; sends an already-signed-in visitor straight on |
| Guard write site | `apps/web/src/app/(shopper)/layout.tsx` | `/?return_to=…` → `/login?return_to=…`, value validated before being written |

### The route is `/login`, not a form on `/`

The filed task recommended adding a login entry to `/` and asked for confirmation. Confirmed as a **dedicated `/login` route** instead: `/` is the retailer-facing marketing page, so customer auth there would change that page's job and hide a shopper's only way in behind retailer copy. This also gives organic visitors a real login entry point, which did not exist outside a store catalog page.

### `ContactGate` deliberately untouched

The task plan threaded the return target through `ContactGate.handleVerifyOtp`. That is unnecessary — the shopper never needs a store page to log in — and skipping it means the "no pending target keeps the in-place `PassportSheet` behaviour" regression guard is satisfied **by construction**: neither `ContactGate` nor `PassportSheet` appears in the diff.

### Validation rules (open redirect)

`sanitizeReturnTo` rejects protocol-relative (`//host`), any backslash (browsers normalise `\` to `/`, so `/\evil.com` escapes), control characters (CR/LF), schemes (`https:`, `javascript:`, `data:`), missing leading slash, arrays/repeated params, and inputs over 512 chars. It percent-decodes **up to 3 times first** so `%2F%2Fevil.com` and `%252F%252Fevil.com` cannot hide behind an encoding layer, then resolves against a sentinel origin with `new URL()` and requires the result to stay on it — the string checks are not trusted to be exhaustive. Every rejection falls back to `/my-stores`.

Applied at both ends of the round trip: the guard validates before writing, the server page validates before handing the value to the client, and the form validates again immediately before `router.replace`.

### A wrong claim from the first draft, and how it was caught

The initial version justified `clearPassportCache()` before navigating with "`passport-client` caches a *negative* result for 30s, so the guard would read it and bounce straight back to `/login`." **That was false.** `getPassport` guards its cache with `if (cachedSession && …)` — a stored `null` is falsy, so a negative result is never served; only positive sessions are memoised. Caught by probing the claim instead of trusting it: the live round-trip spec still passed with the cache clear removed. The call is kept (correct before a hand-off, and it stops a *stale positive* session being read mid-transition) but the comment and test now say that. `clearPassportCache` had **no callers anywhere** in the app before this — the login flow is its first.

### Verification

Live, prod build + Chrome (`e2e/customer-my-stores.spec.ts`): anonymous `/my-stores?tab=orders` → `/login?return_to=%2Fmy-stores%3Ftab%3Dorders` → phone + OTP → **back on `/my-stores?tab=orders`, signed in, list rendered** (the task's own acceptance test, automated, with the query string proven to survive because the post-login predicate requires `tab=orders`); and `/login?return_to=https://evil.example/phish` → completes login → stays on our origin. Unit: `lib/__tests__/return-to.test.ts` (35), `login/__tests__/{LoginForm,page}.test.tsx` (12 + 11), `(shopper)/__tests__/layout.test.tsx` (6). Gates: web tsc clean, `pnpm test` 9/9 (web **242/242**, was 178), `pnpm lint` 6/6, all five guard scripts, **10/10** customer e2e.

**The query string is carried, not just the path.** The guard composes the target from `pathname` + `window.location.search`, so a shopper intercepted on `/my-stores?tab=orders` returns to that exact URL. It reads `window.location` rather than `useSearchParams()` — the guard runs in an effect (browser-only by definition), and `useSearchParams()` in a layout with no Suspense boundary would force every guarded route out of static rendering. The live round-trip spec enters on `/my-stores?tab=orders` and its predicate requires `tab=orders` back, so a guard that dropped the query cannot pass on the bare pathname match. Residual: the **hash** is not carried.

## BUILT 2026-09-17 (later still) — `/stores` gains a state-aware shopper entry point (CLAUDE.md row #73)

Phase A pointed the installed icon at `/my-stores` and the follow-up added `/login` — but `/login` was reachable **only by being intercepted** by the `(shopper)` guard. A shopper had to already want a guarded page to discover it, so an organic visitor to the store directory had no way in, and nothing on the site acknowledged an existing passport once one existed.

**Scope: `apps/web` only** — no API, schema, or `apps/mobile` change.

| Piece | File | What it does |
|---|---|---|
| Entry point (client) | `apps/web/src/app/stores/ShopperEntry.tsx` | Signed out → `Log in` → `/login`. Signed in → the shopper's own name, `· My Stores` → `/my-stores` |
| Mount | `apps/web/src/app/stores/StoresDirectory.tsx` | +7 lines, above the search box |

### Why `/stores` and not the shared `Navbar`

`Navbar`/`Footer` live in `components/site/Chrome.tsx` and render on **every** marketing page, including `/`. Those pages are statically rendered, so a state-aware entry point there would cost *every* marketing page view one `/api/passport/me` call — the passport cookie is HttpOnly, so the client cannot answer "is this visitor signed in?" without asking. It would also put a customer entry point in the retailer-facing nav directly beside "Start Free Trial". `/stores` is the one genuinely shopper-facing surface on the marketing site. Owner-confirmed before building.

### The in-flight state is inert, not `Log in`

Until the session check answers, the component renders a reserved-height `aria-hidden` placeholder (`h-9 w-[104px]`, so the search box below does not shift) rather than `Log in`. Because the cookie is HttpOnly the state is genuinely unknown in that window, and rendering `Log in` first would tell a signed-in shopper they are signed out on every visit to the page.

`href` is plain `/login`, **not** `/login?return_to=/stores`: this is an explicit "take me to my account" action rather than an interception, and `/my-stores` is the shopper's home — the same place the installed icon opens. `account.name` is nullable (the passport OTP flow never asks for one), so it falls back to `My Stores` instead of rendering an empty pill.

### Verification

Unit: 7 new `ShopperEntry` tests — both states, the in-flight no-flash gate, a nameless account, the `getPassportSession` failure path, and that no session check is issued twice. Web **249/249** (was 242).

Live, prod build + Chrome (new `e2e/customer-stores-directory.spec.ts`): `/stores` anonymous → `Log in` with `href="/login"`; authenticated → the name with `href="/my-stores"` and **zero** `Log in` links. The directory itself still renders (search box + store card), so mounting the component did not disturb the page. Whole customer suite **12/12** across its three specs.

### A stub trap worth recording

This is the first call in the customer e2e suite made by the **browser** directly to the API origin — the passport calls go through the same-origin `/api/passport/*` proxy. `localhost:3100` → `127.0.0.1:3001` is cross-origin, and the stub sent no `Access-Control-Allow-Origin`, so Chrome silently dropped the response and the directory rendered its error state while the entry point (proxy-based) worked fine — a failure that looks like "the page is broken" rather than "the stub is incomplete". Diagnosed by grepping the inlined URL out of the built client chunk (`127.0.0.1:3001`, so the config pin was working and the URL was never the problem) rather than by guessing. The stub now sends CORS headers; **any future browser-side API fetch added to this suite needs it too.**

---

## BUILT 2026-09-17 (latest) — hardening pass over the `/stores` entry point: shared e2e stub, two real defects found, phone/tablet verification

Following an owner request to check for errors, bugs, lint, design consistency and root-cause-class regressions before this reaches a live run. Three of the five items below were **found by the checks**, not fixed before them.

### 1. The CORS trap is now structural, not a comment (`e2e/support/api-stub.ts`)

All three customer specs had grown their own copy of the stub server, and only the newest sent `Access-Control-Allow-Origin` — the trap that had already cost a debugging cycle earlier the same day. New `e2e/support/api-stub.ts` owns the plumbing: `createStubServer` applies CORS to **every** response (including 404s) and answers `OPTIONS` before any route sees it, plus `listenStub`/`closeStub` (the EADDRINUSE hint that previously lived in only one spec) and a shared `json()` helper. All three specs now build stubs through it, so a spec author **cannot forget the header** by adding a route, and the pattern anyone copies has it already. Each spec's route bodies are unchanged; the duplicated `API_STUB_PORT`/`API_STUB_ORIGIN` declarations were removed so the port is defined once (the helper's listen and the spec's request-logging can no longer disagree).

### 2. Defect found — an outbound call with no deadline (`passport-client.ts`, RC-011's class)

`getPassport()` awaited `fetch('/api/passport/me')` with **no timeout**. Everything awaiting it is UI state: a hung `/me` would leave the `(shopper)` guard never redirecting and the `/stores` entry point permanently on its placeholder — no error, no toast, just a page that stays half-alive. Now bounded by `AbortSignal.timeout(10_000)`, landing in the existing catch so callers get a definite “not signed in”. This helper had **no test file at all**; it now has 7 (`src/lib/__tests__/passport-client.test.ts`) covering the bound (asserted at the `AbortSignal.timeout` factory, since the returned signal doesn't expose its deadline), a timeout resolving to `null` rather than throwing, credentials/no-customer-id, and the cache's negative/positive semantics.

### 3. Defect found — two off-system design states (`ShopperEntry.tsx`)

- **No `focus-visible` state.** The site's own CTA pattern (`Chrome.tsx`) is `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-<token> focus-visible:ring-offset-2`, and the search field directly below uses `cobalt-500`. The entry point was the one keyboard-reachable control on the page without a ring; it now matches, with `ring-offset-cream` (the `/stores` shell is cream via `Navbar`/`PageHero`/`Section`).
- **36px tall, next to a 48px search field.** Bumped to 40px (`h-10`), matching the marketing pills (`px-5 py-2.5 text-sm`). The reserved-height placeholder moved with it.
- **Residual, not fixed:** the `· My Stores` suffix uses `text-carbon/50` at `text-xs`, which is below AA contrast for small text. It is the house pattern (19 occurrences in `apps/web/src`), so changing the one instance would fork the system; it is a repo-wide contrast question, recorded rather than silently diverged from.

### 4. Flake found and root-caused — the request-log assertion sampled a cache-warm first paint

One of three full-suite runs failed on `GET /v1/public/stores` being absent from the stub's log while the store card was visibly rendered. Written up as **RC-024**: `/stores` is `revalidate = 300`, Next's Data Cache lives on disk (`.next/cache/fetch-cache/<hash>` — confirmed to hold that URL, and `turbo build --force` does not clear it), so a cache-warm run serves a first paint with **no network call**, leaving the client's mount fetch still in flight when the assertion sampled the log. Two competing explanations were eliminated by evidence (no `.next/` artifact contains the store name; the client effect has no `initial` guard). The assertion now `expect.poll`s the joined log — which also makes the claim stronger, since the test waits for the browser's cross-origin call instead of noticing one had arrived.

### 5. Phone + tablet verification of the directory and the catalog (new, and it passes)

Both surfaces are now exercised at **390×844 (phone)** and **820×1180 (tablet)**: `horizontalOverflow()` (document scroll width vs viewport) plus the real content assertions, with no horizontal overflow and no page errors on either surface at either size. Three things make that result trustworthy rather than decorative:

- **The detector is proven to fail.** A dedicated test injects a 2000px element and requires the measurement to see it — necessary because this page runs **Lenis** smooth scrolling, whose stylesheet sets `overflow: hidden` in some states, and a clipped container would let `scrollWidth` report nothing while content spills. It fired as designed.
- **Page errors are captured, not assumed.** `page.on('pageerror')` in every new test, so a component that throws while still rendering something (RC-014's shape) fails instead of passing.
- **Stub payloads are typed.** `DIRECTORY` and `ACCOUNT` are annotated with the app's own `StoresDirectoryData`/`PassportAccount`, so a field rename fails `tsc` here rather than leaving the spec green against a shape the app no longer accepts (the RC-008 class — the spec's fixture was previously hand-written and untyped).

### 6. The entry point's destinations are actually clicked (RC-005/RC-006's class)

Both states now click through in the browser: `Log in` → `/login` with a usable phone field, and the shopper's name → `/my-stores` rendering a real row from the passport API. An `href` assertion alone is the shape that shipped twice in this repo as "the link goes nowhere" (RC-005, RC-006) — a unit test cannot see it.

**Verification:** web tsc clean · **256/256** unit (was 249) · `pnpm lint` 6/6 · all five CI guard scripts · **19/19** customer e2e across the three specs, **twice consecutively** (RC-019: the run type that exposes a flake, not a single `-g` run). Root cause recorded as RC-024.

---

## BUILT 2026-09-17 (console + responsive sweep) — every customer surface checked at phone and tablet, behind a console-error backstop that found two pre-existing defects

**Why:** the earlier pass verified layout with `pageerror` only, and sized two surfaces. That misses two whole classes — a console error the app *swallows* (a hydration mismatch, a rejected fetch) fails nothing and is invisible, and "the catalog" is five routes, not two.

| Piece | Change |
|---|---|
| `e2e/support/responsive.ts` | **new** shared helper: `PHONE`/`TABLET`/`VIEWPORTS`, `watchClientErrors()` (pageerror **plus** filtered console errors, with everything ignored reprinted in every failure message), `expectNoHorizontalOverflow`, `expectFullyInViewport` |
| three customer specs | refactored onto it, with per-surface phone/tablet checks: `/stores` directory, `/login`, `/my-stores` list, `/{store}` catalog, `/{store}/{collection}` + the product detail sheet |
| spec stubs | `promotions` served (and `reviews/product` + `showcase-designs` in the collection spec) — real proxy routes whose missing upstream made the browser log 404s the app handles by design |

**What the sweep found**

1. **RC-025 · `view` tracking has never worked on the web.** `CollectionView` POSTs `{apiBasePath}/view` with a comment saying it exists "so the retailer's dashboard 'Views' stat increments"; the API endpoint, the `CollectionView` model and the dashboard reader (`retailers-stats.ts`) all exist — but the web proxy route between client and API **never did** (`git log --all` finds none). Web storefront views have never been counted. **Open** — needs a decision (restore the route, or drop the call).
2. **RC-025 · the `checkout-status` call outlived its route.** The proxy was deleted deliberately with checkout in `76c5acdb` (#15); the effect calling it stayed behind. Dead code — it can only ever leave `checkoutEnabled` at its initial `false`.
3. **The sheet's enquiry CTA starts below the fold on a 390×844 phone** (measured: bottom edge ~892px against an 844px viewport). It is not stranded — it is the last block inside the sheet's `overflow-y-auto` body — so the test now asserts what actually matters: `scrollIntoViewIfNeeded()` brings it fully into view. "It's inside a scroll container" would have been a claim read off the CSS, which is the sort of reading this repo has been wrong about before.

**Tap-target and token checks (the "design ratio" pass):** directory entry 40px (the site's pill height), store-list row ≥44px, login phone field ≥40px, and the sheet's close button fully inside the viewport at both sizes.

**Residual, deliberate:** the entry point's `· My Stores` suffix is `text-carbon/50` at `text-xs`, below AA contrast for small text — it is the house pattern (19 occurrences in `apps/web/src`), so changing one instance forks the system. Recorded rather than silently diverged from.

**Verification:** web tsc clean · **256/256** unit · `pnpm lint` 6/6 · all guard scripts · **25/25** customer e2e (was 19) across three specs, **twice consecutively** (RC-019's lesson: a lone `-g` run is not a signal). Mid-pass `tsc` caught one genuine break — a `VIEWPORTS` const deleted without importing its replacement — which is why the typecheck runs before every browser run.

---

## FIXED 2026-09-17 — RC-025 closed: the `view` proxy route that never existed, and the `checkout-status` call that outlived its deleted route

Both were found by the console-error backstop above, on the same page every shopper opens.

| Piece | Change |
|---|---|
| `apps/web/src/app/api/[store]/[collection]/view/route.ts` | **new** — the proxy that never existed, so the retailer "Views" stat (`retailers-stats.ts` → `prisma.collectionView.count`) counts web storefront traffic for the first time |
| `apps/web/src/app/api/c/[slug]/view/route.ts` | **new** — legacy twin; CollectionView picks the `/api/c/{slug}` base path whenever a page has no store segment |
| `CollectionView.tsx` | dead `checkout-status` effect and its `checkoutEnabled` state removed |
| `ProductDetailSheet.tsx` | unused `checkoutEnabled` prop removed — declared and destructured, never read, so checkout's UI was already gone and only the pointless fetch remained |
| `sw.ts` runtime matcher | stale `checkout-status` entry dropped (it cached requests to a route that no longer exists) |
| specs + `support/responsive.ts` | stubs serve the view endpoint; **the named RC-025 console exclusion is deleted**, so these pages are held to a clean console with no exceptions |
| 6 new unit tests | canonical route (4) + legacy (2): upstream URL, forwarded body, bodyless POST, and 204-when-the-API-is-down |

**Proof the wiring is real, not merely quiet:** `customer-my-stores.spec.ts` polls the stub's request log for a `POST /v1/public/collections/*/view`, so it fails if the ping stops crossing the proxy. That was checked for teeth — pointing the new route at a wrong upstream path failed it with its own message, then the change was reverted. Polled rather than sampled because the call is fire-and-forget: the upstream request lands *after* the route answers the browser, which is RC-024's trap.

**Residual, measured rather than assumed:** a proxied view records the **web server's** `ip_hash`, not the shopper's, because the API hashes `request.ip` on its own incoming request. The count the dashboard shows is unaffected; per-shopper hashing would mean trusting `x-forwarded-for` in the API (`trustProxy`) — a separate trust-boundary decision, left alone.

**Verification:** web tsc clean · **262/262** unit (was 256) · `pnpm lint` 6/6 · all guard scripts · customer e2e **25/25** with the console exclusion removed.

---

## BUILT 2026-09-17 (final sweep) — remaining customer surfaces sized, RC-026 filed and fixed, and the photo harness that had been letting sizing tests pass over broken images

**Why:** three surfaces were still unsized, and removing the last console exclusion turned out to expose a *method* problem rather than another app bug — the suite was measuring photo grids whose photos had all failed to load.

| Piece | Change |
|---|---|
| `customer-collection.spec.ts` | phone/tablet checks for the **legacy `/c/{slug}` redirect** (does it land on something *usable*, not merely on the right URL?) and for the **Suits-Designs browse + permalink**, the two surfaces a shared link on a phone actually reaches |
| `customer-my-stores.spec.ts` | phone/tablet check for **`/my-profile`** |
| `e2e/support/images.ts` | **new** `stubFixtureImages()` — serves both paths to the fixture host |
| `e2e/support/responsive.ts` | **new** `expectRenderedImage()`; the `/cdn-e2e\.r2\.dev\|_next/image` console exclusion **deleted** |
| `src/__tests__/e2e-api-stub.test.ts` | **new** — 11 tests guarding the harness itself (5 real requests against the stub, 3 static scans, 3 self-proofs) |

**RC-026 · the personalization opt-out on `/my-profile` saved nothing and said nothing.** `/my-profile` sends `PUT /api/passport/preferences`; the proxy allowed only `GET`/`POST` and its path allowlist omitted `preferences`, so it could only ever answer `405`. The half that made it silent: **`fetch` does not throw on a non-2xx**, so the handler's `catch` never ran and the component kept the toggled state. The API side was complete throughout. Fixed by collapsing the per-verb copies into one `forward()` used by all three verbs (the duplication is exactly how `PUT` came to be missing), adding `preferences`, and making the client check `res.ok` and roll the toggle back. A DPDP-visible defect — a shopper exercised a data-protection opt-out and the platform quietly kept the older setting. Recorded as **RC-026**.

**The harness finding — a green test that was checking less than it read like.** `next/image` fetches remote photos through `/_next/image`, and that fetch happens *inside `next start`*, where browser routing cannot reach it. The fixture host is fake, so the optimizer answered 500 and every product photo in a sizing test was a **broken box**: `<img>` keeps its width/height, so `toBeVisible()` passed, `expectNoHorizontalOverflow` passed, and “the catalog holds up on phone” was measured against a page whose photos had all failed. The tell was an allowlist entry excusing “the fixture photo host the harness does not serve” — the exclusion was the symptom. Both paths are now served (the optimizer, **and** the raw host, because the designs permalink deliberately renders the watermarked file with a plain `<img>` so the optimiser never re-encodes it), `expectRenderedImage` asserts decoded pixels, the exclusion is gone, and **upstream image failures in the run log went from 4+ per run to zero**.

**A comment in my own work claimed a guard that did not exist.** `e2e/support/api-stub.ts` says a test “fails the build if a spec goes around this helper”. No such file existed. It does now — 5 tests making real requests to pin the CORS headers (including the preflight and a 404, since an unheadered 404 is an opaque network error to the page), plus 3 static scans. The scans are **pure functions** fed crafted sources in a self-proof block, so “this guard would actually catch it” is asserted on every run instead of being verified once by hand and trusted thereafter. The first run proved the point: the optimizer scan matched a **comment** explaining `/_next/image`, so it is now anchored on the `route(...)` call — a guard that fires on prose gets weakened to quiet it, which is how guards die.

**Verification:** web tsc clean · **279/279** unit (was 262; +11 harness guard, +6 passport route) · `pnpm lint` 6/6 · all four CI guard scripts · customer e2e **32/32** across three specs, **twice consecutively**, with the console check now strict everywhere including the tap-through test — and **zero** upstream image failures (was 4+ per run).

**Residual, measured not assumed:** 820×1180 portrait only (no landscape, no 320px); installability is still `in-incognito` because Chrome gives no verdict under Playwright; and the tap-through/designs photos load from a 64×80 stub, so layout is proven structurally rather than at real aspect ratios.

---

## BUILT 2026-09-18 — F-037 Phase 1: CustomerInteraction event log (net-new, identity-scoped)

**Why:** owner follow-up doc (`docs/tasks/pending/customer-engagement-analytics.md` §0) found the passport doc's claim that `CustomerInteraction`/`CustomerFashionDNA` already existed and only needed widening was false — migration `082_remove_unwanted_features` (2026-08-31) had dropped both. Phase 1 (§6 of that doc) builds the interaction log fresh at `CustomerAccount` scope rather than reviving the old retailer-scoped table.

| Piece | Change |
|---|---|
| `packages/db/prisma/schema.prisma` | **new** `CustomerInteraction` model + `CustomerInteractionType` enum (`VIEW`/`SEARCH`/`FAVORITE`/`UNFAVORITE`/`ENQUIRY`/`STORE_VISIT`), `interactions` relation on `CustomerAccount` |
| `packages/db/prisma/migrations/100_customer_interaction/` | **new** — table + both indexes + FK + RLS `ENABLE ROW LEVEL SECURITY` with no policies (default deny, Kanchuki-only — matches `customer_recently_viewed`/`customer_wishlist_items`; a retailer SELECT policy is Phase 4 scope, not built yet) |
| `apps/api/.../passport/passport-activity.ts` | `POST /v1/public/passport/events` — the write was a commented-out stub since the old table was dropped (`// Interactions recording removed`); restored via a lowercase→enum `EVENT_TYPE_MAP` (type-only enum import so unrelated `@kanchuki/db` test mocks aren't forced to stub it), `createMany` per batch, unknown event names silently dropped, gated on `session.customer_account.profiling_enabled` (same DPDP opt-out `passport-preferences.ts` already uses for the preference vector) |
| `apps/api/.../public-retailers-leads.ts` | passport-path lead capture now also writes a `STORE_VISIT` row alongside the existing `CustomerStoreVisit` upsert, same `profiling_enabled` gate |
| `apps/web/.../ProductDetailSheet.tsx` | dwell-timed `view` event fired on unmount/product-swap (`Date.now()` delta, §3.1's "not just page load" requirement) — **also removed a dead `handleEnquire` function**, never called since the real enquiry flow is `CustomerConsentModal.handleContinue`, found while reviewing this file |
| `apps/web/.../CustomerConsentModal.tsx` | `enquiry` event fired in `handleContinue` before the WhatsApp link opens |
| `apps/web/.../CollectionView.tsx` | `favorite`/`unfavorite` events in `toggleFavorite`; debounced (600ms) `search` event with query + active filters + `filteredProducts.length` |

**Bug found and fixed mid-build:** the enum-import approach originally used the runtime `CustomerInteractionType` object (`import { CustomerInteractionType } from '@kanchuki/db'`), which broke 4 pre-existing test files that mock `@kanchuki/db` without stubbing that enum — `passport.test.ts`, `passport-export-delete.test.ts`, `passport-otp.test.ts`, `passport-preferences.test.ts` all failed at module load. Root-cause fix (not a per-file mock patch): switched to a type-only import and plain string literals in `EVENT_TYPE_MAP`, so the module carries no runtime dependency on the enum object at all.

**Also found while reviewing:** `schema.prisma` accidentally ran through `prisma format` once, which reflowed ~530 unrelated lines (pre-existing inconsistent indentation across the file) into a single diff. Reverted to a clean 31-line additive diff before this landed — the reformat was never committed.

**Verification:** API tsc clean · **973/973** (was 911; +6 events-route tests, +2 leads-route tests, all failing-then-passing verified against the enum-import bug) · `biome check` clean on every touched file · web tsc clean · **279/279** unit (unchanged — `ProductDetailSheet.test.tsx`/`CollectionView.test.tsx` re-run explicitly, both still pass) · `next lint` clean on every touched file.

**Not built (Phases 2–4, per the task doc's own roadmap):** nightly aggregation job, admin store-level + per-customer drill-down dashboard, retailer-facing aggregate view. Phase 1 only writes rows — nothing reads them yet.

---

## BUILT 2026-09-18 — AI Studio Shoot MODEL set finalized (21 → 8) + top-only-garment bottomwear fix

**Why:** owner asked why paid BFL vs. free ChatGPT/Gemini prompt commands (research answer: `docs/tasks/AI-Tools-Photo-Generation-Research.md`), then followed up wanting the MODEL scene set collapsed to a curated 7–10 like a slash-command catalog, plus a fix for the concrete complaint: picking a kurti/t-shirt and generating a MODEL shot auto-added a bottom garment (palazzo/leggings) and sometimes stretched the top's length, because every seeded MODEL prompt described a full standing pose with nothing else in frame for Kontext to fill.

| Piece | Change |
|---|---|
| `apps/api/src/lib/studio-shoot.ts` | **root-cause fix, one chokepoint** — new `isTopOnlyGarment()` (regex on category/name: kurti/blouse/t-shirt/tee/top/tunic/crop top/shirt); when true, `generateStudioImage()` appends a "waist-up only, do not invent trousers/palazzo/leggings/jeans/skirt" clause to **every** MODEL prompt, not just one template — every caller (retailer route, growth backgrounds, admin bench) gets it automatically |
| `packages/db/prisma/migrations/101_studio_styles_finalized_v2/migration.sql` | **new** — `DELETE` the 21 original MODEL rows seeded in migration `078` (near-duplicate scene backdrops), `INSERT` 8 finalized rows: Indoor Studio Softbox, Home Mirror Selfie, Golden Hour Outdoor, Catwalk Runway Motion, Editorial Close-Up, Marble Premium Luxury, Half-Body Top Shot (Kurti/T-Shirt — explicit crop template), Social Media Post Square. All `PUBLISHED`, all 3 plan tiers. PRODUCT-tab rows (ghost/hanger/flatlay/mannequin, 8 rows) untouched. No FK from `ProductPhoto` to `studio_styles` (provenance is JSON metadata on the photo row) so the delete has no side effect on already-generated photos. **Not yet applied to prod — ships via the normal migration-deploy path, not run directly.** |
| `docs/ai-studio/AI Models and Scenes.html` | the 8 finalized prompts prepended to the `ITEMS` array, marked "FINALIZED SET — 2026-09-18"; the 21 retired scenes stay below as design reference only (no longer live in the DB) |
| `docs/tasks/ai-studio-shoot-models-scenes.md` | status note appended documenting the 21→8 collapse + the code-level fix |

**Deleting the old rows also removes them from the `/admin/photo-cleanup-test` bench dropdown** (that page fetches all `studio_styles` rows regardless of status, by design, so drafts stay testable — with the rows physically gone, no frontend filter change was needed).

**Deliberately not built:** store logo/badge-on-product and the social-post crop are a post-processing step — composite the retailer's logo PNG onto the generated image with `sharp` after Kontext returns it, same pattern as the F-066 Suits Designs watermark — not a prompt change, and not built in this pass. Diffusion models render logos/text unreliably from a prompt.

**Verification:** `apps/api` tsc clean · `studio-shoot.test.ts` **9/9** passing.

---

## BUILT 2026-09-18 (later) — MODEL rows to Gemini engine + PRODUCT-tab hook-removal fix

**Why:** owner compared the same prompt+photo across BFL Kontext / Gemini / ChatGPT — Kontext lost on pose/smile/lighting realism (it's a pixel-preserving diffusion editor, not a generative foundation model; Gemini is the same model behind Google Shopping's "Try It On", purpose-trained on fashion realism). Separately, PRODUCT-tab shots (hanger/mannequin/etc.) still showed the retailer's original hook/clip.

| Migration | Change |
|---|---|
| `102_studio_styles_model_engine_gemini` | `UPDATE ... SET engine = 'imagen_3'` on the 8 MODEL rows from `101`. PRODUCT-tab rows untouched — no person in frame, Kontext's pixel-lock is still correct there. Code-level fallback (`generateStudioImage`: Gemini → Kontext → BFL direct) unchanged, so BFL keeps serving every PRODUCT generation and any MODEL generation where the Gemini key/quota is out — no engine-registry code change needed, `studio_styles.engine` was already the per-row dial (F-023 pattern). |
| `103_studio_styles_product_hook_removal_fix` | Rewrote all 8 PRODUCT-tab prompts. Root cause, found by re-reading `078`'s original text: 6 of 8 rows asked for hook removal but as a *trailing* clause after a leading "keep 100% pixel-identical" sentence — BFL's own guidance says the change-clause should lead and fold the preserve-constraint into the same sentence, not stack two instructions. The other 2 rows (`wedding_elegant`, `warm_luxury`) **never asked for removal at all** — pure "replace the background" prompts, so Kontext correctly left the hook untouched; not a model failure. Every row now leads with an explicit "none of it may remain" removal clause and specifies lighting *direction* (angle + purpose) instead of a bare "5500K lighting" line. |

**Not yet applied to prod** — both ship via the normal migration-deploy path, not run directly, same as `101`.

---

## BUILT 2026-09-18 (later still) — AI Studio Shoot: the product photo was never reaching the model, + garment-conditioned two-step pipeline

**Why:** owner asked why AI Studio Shoot doesn't produce Gemini/ChatGPT-quality output, what backend those products actually use, and whether to switch APIs.

### Root cause — found by reading the code, and it supersedes the previous two rounds' diagnosis

`generateGoogleImagen()` (`apps/api/src/lib/imagen-client.ts`) is a **text-to-image** call: its body is `instances: [{ prompt }]` — there is no image field — and `generateStudioImage()` never passed it `inputImageUrl` either. So migration `102` did **not** switch MODEL scenes "to Gemini"; it switched them to a generator that had never seen the product, driven by a prompt that never named a garment type either. A plausible stranger in a plausible stranger's clothes is the correct output of that input — the observation that motivated `102` ("Gemini's pose/smile/lighting realism clearly better") was a comparison against a model that had the garment and a model that didn't.

Three supporting findings:

1. `imagen-3.0-generate-002` on `:predict` is **Imagen 3**, a diffusion text-to-image family — not Gemini's image capability. Gemini's is the "Nano Banana" line (`gemini-3.1-flash-image` / `gemini-3-pro-image`; `gemini-2.5-flash-image` now legacy) on the Interactions API, and it accepts the input image. The repo called none of it.
2. The admin bench called `generateStudioImage()` with **no `product` object at all** — so no colour clause, a `womens` demographic fallback, and neither the garment-identity nor the top-only guard could fire. It exercised a strictly weaker prompt than the retailer path, which is why three rounds of prompt-guard work could not be validated on it.
3. **Structural:** no single call gives both properties a studio shoot needs. Prompt-driven models (Kontext, Gemini, FLUX) produce the person and scene but can only *guess* the garment — naming it narrows the guess, it does not make it your product. A garment-conditioned try-on model puts the real garment on the model but knows nothing about studios, poses or lighting. Gemini/ChatGPT are both autoregressive native-multimodal models (not diffusion, per OpenAI's own 4o image-generation system card) — that is the source of their realism — but **neither is garment-locked**. Google Shopping's "Try It On" is garment-conditioned, like FASHN, not prompt-driven.

### Stage 1 — stop the bleeding, name the garment, make it testable

| File | Change |
|---|---|
| `apps/api/src/lib/studio-shoot.ts` | New `garmentIdentityClause()` — names the garment from `subtype`/`category` and, **whether or not row data exists**, forbids substitution and re-draping ("keep any dupatta, stole or sash in its original placement"). The anti-substitution half needs no row data, so it fires on every caller. New `sanitizeGarmentText()` — `product.name` is retailer free text entering a third-party prompt: control characters dropped (a newline would split the instruction), double quotes neutralised, whitespace collapsed, bounded to 120 chars. `isTopOnlyGarment()` is now variadic and takes `subtype`, so a product with `subtype: 'Kurti'` and a generic category no longer slips past the guard. `SCENE_GUARD` hoisted to module scope so both paths share one string. |
| `apps/api/src/jobs/studio-shoot.ts` | Pipes `subtype` through (it was already selected from the DB, just never passed). |
| `apps/api/src/routes/admin/admin-photo-cleanup.ts` + `apps/web/src/app/admin/photo-cleanup-test/page.tsx` | Bench takes Category / Subtype / Name / Colour / Fabric / Pattern, and now sends `engine` at all (it never did). This is the process fix that stops round four. |
| `packages/db/prisma/migrations/104_studio_styles_model_engine_revert_kontext/migration.sql` | **New** — `engine = NULL` (Kontext default) on the 8 MODEL rows from `101`/`102`. Interim: Kontext preserves the garment, `imagen_3` provably could not. Comment records why, so nobody re-points at it without reading that. |

### Stage 2 — the two-step pipeline (`engine = 'vton_kontext'`)

Human reference (supplied, or generated plain and frontal) → **FASHN v1.5 try-on ← THE PRODUCT PHOTO** → **FLUX Kontext** scene swap. The step-1 input is deliberately a plain frontal full-body reference with no scene, because try-on models are trained on plain human photographs and a dramatic pose or cropped frame (see the top-only guard) is out of distribution — the likeliest way this stage disappoints. `humanImageUrl` lets the bench substitute any reference, including a previously generated scene, which makes the reversed order testable without new code.

| File | Change |
|---|---|
| `apps/api/src/lib/fal-client.ts` | **Fixed `generateFashnTryon()` — it was dead code that would have failed on first use.** Verified against `fal.ai/models/fal-ai/fashn/tryon/v1.5/api`: the endpoint was `fal-ai/fashn/tryon-v1.5` (**dashes — the real path uses slashes, so it would 404**), and it sent `long_top`, `nsfw_filter`, `cover_feet`, `adjust_hands`, `restore_background` — **none of which exist in the v1.5 schema**. Moderation is `moderation_level`. Note the earlier docs/BUILD-LOG claim of "Indian long_top support" came from that phantom parameter, not a real capability. Now: correct path, real params only, `category: 'auto'` (a kurta *set* is not cleanly `tops`), `output_format: 'jpeg'`. |
| `apps/api/src/lib/studio-shoot.ts` | New `runTwoStepStudio()` + `MODEL_REFERENCE_PROMPT`. Returns `null` when the try-on stage fails so the caller **falls through to the single-shot Kontext path** — a provider outage degrades the shot instead of failing the job. `vton_kontext` added to `StudioEngine`. |
| `packages/shared/src/constants/index.ts` | New `STUDIO_ENGINES` + `StudioEngine` type. The engine list had been duplicated across four surfaces (two API validators, two admin web selectors); a value present in only some is un-storable or unselectable. `StudioEngine` in the API is now derived from it, so the type cannot drift from the list. |
| `apps/api/src/routes/admin/admin-studio-styles.ts`, `apps/web/src/app/admin/studio-styles/page.tsx`, `apps/api/src/routes/admin/admin-photo-cleanup.ts`, `apps/web/src/app/admin/photo-cleanup-test/page.tsx` | All four read `STUDIO_ENGINES`; bench gains an engine select + optional model-reference URL. |
| `apps/api/src/routes/security.test.ts`, `admin.login.test.ts` | Their explicit-factory `vi.mock('@kanchuki/shared')` had to gain a **non-empty** `STUDIO_ENGINES` — the admin barrel builds `z.enum(STUDIO_ENGINES)` at module load and `z.enum([])` throws. |

### Verification

`apps/api` **981/981** (77 files; `studio-shoot.test.ts` 9 → **17**, incl. the two-step order, the supplied-reference path, the try-on-failure fallback, and pins on both the slash endpoint and the absence of the four phantom params) · `apps/web` **279/279** · API/Web/Shared `tsc --noEmit` clean · Biome clean on every changed API/lib/shared file (the two admin web pages and `shared/constants/index.ts` carry pre-existing diagnostics, byte-identical before and after — verified by baselining each file against `HEAD`).

The fallback test was initially passing for the wrong reason — the mocked response had no `.text()`, so `runFalTask`'s error branch threw a `TypeError` instead of the `AppError` under test. The mock now provides it, and the test exercises the real 500 path.

`packages/shared` was rebuilt (`pnpm --filter @kanchuki/shared build`) because `dist` is what the consuming apps resolved, and `dist` is gitignored.

### Owner actions, then the honest limits

1. **Apply migration `104`**, and confirm `102`'s actual state: `SELECT slug, engine FROM studio_styles WHERE tab = 'MODEL'`.
2. **Re-test on the bench with the garment fields filled** — the first run where the output is diagnostic.
3. Point the 8 MODEL rows at `vton_kontext` only after the bench proves it. **No migration flips them to the new engine** — it is opt-in per row, and `104` leaves them on the Kontext default.

**Deliberately not done at the time:** `generateIdmVtonTryon()` was still dead broken code (same class of problem — never called); **deleted later the same day**, see the entry at the end of this file. ~~Stage 3 is not started.~~ **Stage 3 landed the same day** — see the entry below: the `:predict` Imagen 3 path is deleted, replaced by a real Gemini native-image client that is handed the photo. `imagen_3` / `imagen_3_fast` no longer exist.

**Not verified:** the two-step pipeline has never been run against the live providers — no FAL key or prod access in this session. Pose robustness on generated (rather than photographed) human references is the specific unknown to watch on the first bench run.

---

## BUILT 2026-09-18 (stage 3) — AI Studio Shoot: a real Gemini native-image client, and Gemini on the two-step scene step

**Why:** stage 3 of the three-stage plan — replace the `imagen-3.0-generate-002` `:predict` client, which is a text-to-image endpoint that never received the product photo, with Gemini's actual image capability ("Nano Banana", Interactions API), which does. Then use it where it is strongest: the **scene** step, on top of an image that already has the right garment on the right person.

### The contract, verified 2026-09-18 (this is the third time a provider contract has been assumed wrong in this feature — so it is cited)

Against `ai.google.dev/api/interactions-api` and `ai.google.dev/gemini-api/docs/image-generation`:

| | Value |
|---|---|
| Endpoint | `POST https://generativelanguage.googleapis.com/v1beta/interactions` |
| Auth | `x-goog-api-key: <key>` header — **not** a `?key=` query param (which ends up in logs and error strings) |
| Body | `{ model, input: [{type:'text',text}, {type:'image',mime_type,data}] }` — `input` is a plain string only for text-only calls |
| Image input | base64 `data` + `mime_type`. A `uri` field exists in the schema, but every documented input example is base64, and a URL would rely on the model fetching our R2 object |
| Output | Interaction resource: `steps[].content[]` with a `{type:'image', data, mime_type}` block. There is **no** top-level `predictions` / `images` array — the SDK `output_image` property is a convenience over the steps |
| Models | `gemini-3.1-flash-image` (Nano Banana 2, workhorse) / `gemini-3-pro-image` (Nano Banana Pro); `gemini-2.5-flash-image` is the legacy one |

**The parse takes the LAST image block, not the first.** Gemini 3 image models run a thinking pass that emits interim "thought images" before the final output, and the docs define `output_image` as *the last* generated image block for that reason. A first-match parser would hand back a draft, which reads as a quality regression rather than a parsing bug. Both directions are pinned in tests.

**Deliberately not sent:** `image_size` (1K is the default, it varies by model — Flash Lite is 1K-only — and an unexercisable field is a field that 400s in production). **Considered and deferred:** `store: false`, which would stop Google retaining the request/response. It is a documented optional field, but a wrong field fails the whole call and there is no key in this session to test with; note the photos already reach Fal/BFL today, so it is not a regression — but it is the right follow-up for a DPDP review.

### Stage 3 changes

| File | Change |
|---|---|
| `apps/api/src/lib/gemini-image.ts` | **New.** The old `imagen-client.ts` is deleted. `generateGeminiImage(prompt, { inputImageUrl, model, aspectRatio, onProgress })` fetches the source photo (SSRF-safe — in the bench case the URL is admin-pasted), sends it as a real image input block, and returns `{ base64Data, mimeType }`. Also `inferImageMimeType()` (the block's `mime_type` is required and must be honest; read the extension, fall back to JPEG since our compressor outputs JPEG) and `parseInteractionImage()` (last-wins, exported for tests). A 200 carrying `status: failed`/`cancelled`/`budget_exceeded` throws the interaction's own `errors[].message` instead of mis-reporting "no image". |
| `apps/api/src/lib/studio-shoot.ts` | `gemini_image` / `gemini_image_pro` replace `imagen_3` / `imagen_3_fast`, and **do** pass `inputImageUrl`. New `vton_gemini` engine: the same two-step pipeline as `vton_kontext` with Gemini rendering step 2 (`runTwoStepStudio` gained a `sceneRenderer: 'kontext' \| 'gemini'` option) — so the two scene renderers can be A/B'd on the bench on identical try-on output. `StudioEngine` is now **derived** from `STUDIO_ENGINES` rather than restated as a union, which is the drift the shared constant exists to prevent. |
| `packages/shared/src/constants/index.ts` | `imagen_3` / `imagen_3_fast` → `gemini_image` / `gemini_image_pro`; `vton_gemini` added. Comment records what the old names were and why they were renamed rather than fixed. |
| `packages/db/prisma/migrations/105_studio_styles_engine_rename/migration.sql` | **New** — `UPDATE`s the two retired strings to their replacements. `engine` is a free-text column (admin validation only guards new writes), and a row holding a dead value does not crash: `generateStudioImage` has no branch for it and **silently falls through to Kontext while the DB says "Gemini"**. That silence is why this normalizes. In a clean `102 → 104 → 105` sequence it matches nothing (104 already reverted the 8 rows); it is here for stale and hand-set values. |
| `apps/web/src/app/admin/photo-cleanup-test/page.tsx` | Bench labels both two-step engines as keeping the product, and marks the Gemini engines as receiving the photo. |

### Verification

`apps/api` **1002/1002** (78 files) · `apps/web` **279/279** · API + Web `tsc --noEmit` clean · Biome clean on every changed API/shared file · the bench page's 17 diagnostics are **byte-identical to `HEAD`** (baselined by running Biome on the `git show HEAD:` copy).

New: `apps/api/src/lib/gemini-image.test.ts` — 15 tests, including that the request carries an image block whose `data` is the base64 of the fetched photo bytes (the assertion that would have failed on every previous round of this feature), that the key is a header and not a query param, last-image-block-wins over a leading thought image, malformed/absent images, a failed interaction surfacing its own message, an unreadable source photo, and the unconfigured-key 503. `studio-shoot.test.ts` **17 → 24**: `gemini_image` sends the photo, `gemini_image_pro` selects the Pro model, a Gemini failure falls back to the Kontext path, `vton_gemini` orders try-on → Gemini and hands Gemini the **worn** image (asserting it never downloads the flat product photo, and that Kontext is not called at all on that engine), the try-on-failure fallback, and two pins on `STUDIO_ENGINES` (the retired names are gone; both Gemini scene engines are present).

`packages/shared` rebuilt again for the same reason as stage 2: the consuming apps resolve its gitignored `dist`.

### Owner actions

1. **Apply migration `105`** (and `104` if it is still pending).
2. On `/admin/photo-cleanup-test`, run the same product + scene through `bfl_kontext`, `gemini_image`, `vton_kontext` and `vton_gemini`, with the garment fields filled. That is now a real four-way comparison: all four receive the photograph.
3. Only then point the 8 MODEL rows at whichever engine wins. **Nothing flips them automatically**, on purpose — `vton_*` costs three provider calls per shot and its step-0 human reference is still unvalidated, so a readiness claim would be a guess.

### Honest limits

**Never run against the live API** — no `GEMINI_API_KEY` and no prod access in this session. Everything above is verified by types, tests and the published contract; none of it is verified by output quality. The specific unknowns to watch on the first bench run are (a) whether Gemini's `3:4` output framing suits a full-length garment shot that Kontext would have matched to the input, and (b) whether the Interactions API accepts a ~1MB base64 image block from our compressed JPEGs, or wants the image downscaled first.

**Gemini is still not garment-locked.** It now receives the photo — which is the difference between describing a garment to a generator and instructing an editor — but it reinterprets: it does not guarantee this retailer's dye, print, embroidery or cut. Only the garment-conditioned try-on step does, and that is the point of the `vton_*` pair. `gemini_image` is the like-for-like comparison against the current default, not the fidelity fix.

**Still open:** `generateIdmVtonTryon()` is dead broken code of the same class as `generateFashnTryon()` was (endpoint and params unverified, never called) — nothing calls it, and `services/fashion-vtone` is no longer in the path. With the engine list renamed, the cleanest next move is deleting it rather than verifying it. **Deleted later the same day** — see the entry at the end of this file.

---

## BUILT 2026-09-18 (same day) — AI Studio Shoot: the last dead try-on helper deleted, and a guard that keeps it deleted

**Why:** both entries above close by naming `generateIdmVtonTryon()` as dead broken code left in place ("the cleanest next move is deleting it rather than verifying it"). Verifying it was the wrong option: the reason it was broken is that nothing had ever run it, so the first caller — a retailer — would have been the one to find out. Deleted instead, in all three places it existed.

| File | Change |
|---|---|
| `apps/api/src/lib/fal-client.ts` | `generateIdmVtonTryon()` **deleted**. A tombstone comment records why (no caller since the 2026-08-30 studio-styles rework, parameter names never checked against the schema, weights CC BY-NC-SA-ND per ADR-006 so no fine-tune may be redistributed) and points at the FASHN v1.5 step that replaced it. The `runFalTask` doc comment no longer advertises IDM-VTON. |
| `scripts/studio-shoot-demo.mjs` | The `vton` mode and its `falVton()` helper **deleted** — a second, differently-wrong copy of the same call (it posted `human_image_url` / `garment_image_url` to `fal-ai/idm-vton`, neither of which matches the API helper's own names). Header corrected too: BFL-direct is the code-level *fallback*, not what the shipped feature does (production runs FLUX Kontext through Fal). |
| `packages/shared/src/constants/index.ts` | `FAL_API_KEY` label: `'Fal.ai API Key (Flux 1.1 Pro, Flux Schnell, IDM-VTON / CatVTON)'` → `'… (FLUX Pro / Kontext / Schnell, FASHN v1.5 try-on)'`. Labels render live from the constant (`admin-integrations.ts` maps them), so no migration — but the old text was the admin dashboard advertising a retired model. |
| `apps/api/src/lib/retired-tryon-guard.test.ts` | **New** — a repo scan that fails if the retired path reappears **as code**. |

**The guard, and why deleting is not self-enforcing:** a removed function cannot be found by a reader, and a reviewer looking at a diff that re-adds it has no way to know it was removed on purpose. So the guard scans `apps/`, `packages/` and `scripts/` for the endpoint and engine value (`idm-vton` / `idm_vton`), the helper name, and IDM-VTON's parameter names (`human_img_url`, `garm_img_url`, `garment_des`). It strips comments before matching, so this repo's own tombstone comments and the RC-027 entry stay legal — a guard that fires on prose gets weakened by whoever trips it (the sibling `/v1/` shell guard carries that lesson explicitly). `services/` is excluded because nothing in the app imports it; `docs/` is excluded because docs should record the history. It lives in a test rather than a `scripts/check-*.sh` so it needs no CI change and also fires on every local `pnpm test`.

**Proof — the guard was shown to fail, not assumed to work:** a temporary `scripts/tmp-guard-drill.mjs` containing `runFalTask('fal-ai/idm-vton', input)` was added; the guard failed naming it (`scripts/tmp-guard-drill.mjs → the IDM-VTON endpoint or engine value`), and the file was deleted. It also asserts the walk sees two specific files (`fal-client.ts`, the demo script) so a broken walk cannot pass as a clean repo, and asserts FASHN v1.5 is still the live step as a positive control. The self-proof block covers the endpoint, the helper, an `idm_vton` engine value, the parameter names, comment-immunity, and a call on a line that also contains `https://`.

**Verification:** `apps/api` **1010/1010** (79 files; the new guard test adds 8) · `apps/web` **279/279** · API `tsc --noEmit` clean · Biome clean on `fal-client.ts` and the new test. The demo script's 2 remaining diagnostics are fewer than its `HEAD` baseline (3), and `scripts/` is not in any package's lint scope. `scripts/studio-shoot-demo.mjs` parses (`node --check`). `packages/shared` rebuilt — the consuming apps resolve its gitignored `dist`, so the label change needs that build to be visible locally.

**Left alone deliberately:** `services/fashion-vtone` stays in the repo, unwired (not imported by the API, and out of the path since the 2026-08-30 rework). `docs/TECH-STACK.md` still lists "Replicate IDM-VTON" in a historical cost table — that is research, not a wiring path.

**Not amended:** `CLAUDE.md` row 75 (the studio-shoot index row) does not mention this cleanup — that file is gated on explicit approval, so the one-clause addition is pending an owner go-ahead.

---

## BUILT 2026-09-18 (same day) — AI Studio Shoot: a bench A/B that runs BOTH pipeline orders on one product photo

**Why:** the two-step pipeline can be ordered two ways and neither is obviously right. The forward order (reference → try-on → scene render) feeds the try-on the plain frontal reference it was trained on and finishes at the scene renderer's own resolution. The reversed order (scene render → try-on) costs one provider call less and starts from the single-shot render the feature already produces, but it feeds the try-on a *generated* scene — out of distribution for a try-on model — and finishes at FASHN v1.5's 576×864. That argument cannot be settled on paper; it is the kind of thing a bench settles with output. Until now the reversed order was only reachable by hand — pasting a previously generated scene into the bench's model-reference field — which is an approximation of the order, not the order.

| File | Change |
|---|---|
| `apps/api/src/lib/studio-shoot.ts` | **`generateStudioOrderAb()`** runs both orders **concurrently** over the same photo and returns both arms, each with its stages, wall-clock, and failure reason. **`runReversedStudio()`** is the other order: scene render from the product photo, then try-on. **`runTwoStepStudio()`** now returns `{ result, stages, error }` rather than `result \| null`, so an arm can say *which stage* failed — a new `stage()` helper wraps each call and prefixes its label onto the error, because in a three-call pipeline "Fal.ai task submission failed (500)" is equally true of the try-on and the scene render. **`buildStudioPromptContext()`** was extracted out of `generateStudioImage()` so both arms are handed **byte-identical** prompt text; two copies of that assembly would drift, and the drift would be invisible in exactly the way that matters (the arms would differ by wording as well as by stage order). `StudioProduct` is shared by both entry points, and `StudioVtonEngine` is `Extract<StudioEngine, …>` rather than a restated union. |
| `apps/api/src/routes/admin/admin-photo-cleanup.ts` | **`POST /admin/photo-cleanup/studio-ab`**, engine restricted to the two `vton_*` values (a single-shot engine there would run the same pipeline twice and call it a comparison). Re-serves **every** image from R2 — each arm's result *and* its intermediates — because Fal and BFL result URLs expire, BFL's inside ten minutes, and a comparison board of dead tiles is worse than no board. `studioBenchFields` extracted so `/studio-shoot` and `/studio-ab` cannot start describing the product differently. |
| `apps/web/src/app/admin/photo-cleanup-test/page.tsx` | Side-by-side A/B card: its **own** engine dial (`vton_kontext` / `vton_gemini`) rather than the form's engine — the comparison is undefined for single-shot engines, and silently coercing whatever the form had selected is the same class of hidden behaviour this bench exists to remove. Each arm shows its stage strip above its result, its wall-clock, and its failure reason; the server's caveats render as a notes list. |
| `apps/api/src/lib/studio-shoot.test.ts` | 4 new tests — the order itself, the failure reporting, the Gemini-intermediate persist step, and the no-persist-step error. |
| `apps/api/src/routes/security.test.ts`, `admin.login.test.ts` | Their explicit-factory `vi.mock('@kanchuki/shared')` now also supplies `PRODUCT_DEMOGRAPHICS`: the shared bench body shape is module-level, so `z.enum(PRODUCT_DEMOGRAPHICS)` evaluates at **import**, and a missing key throws during collection (the same failure mode `STUDIO_ENGINES` produced in stage 2 — these tests fail to *collect*, not to assert). |

**Both arms are strict, and that is the load-bearing decision.** `generateStudioImage()` falls back to a single-shot Kontext render when a stage fails; letting the A/B do that would turn "which order is better" into a silent comparison of two different pipelines — the same mistake as the bench that sent *less* product data than production and therefore could not reproduce the bug it was opened to test. So a failed stage fails that arm, names the stage, and leaves the other arm's result intact. The tests pin that: one arm's try-on is failed (identified by the model image it was handed, which is the arm's own fingerprint) and the other arm still comes back `ready`, with the failed arm's stages showing how far it got.

**The assertion this feature exists for** is that the two try-ons were handed *different* model images — the generated reference in one arm, the scene render in the other — while both receive the same product photo as the garment. It was drilled rather than assumed: pointing the reversed arm's try-on at the product photo instead of its scene render made the test fail, and the file was restored afterwards.

**The reversed order and base64.** Gemini answers with base64 and the try-on stage needs a URL it can fetch, so the reversed pipeline takes an injected `persistStage` upload and re-serves its intermediate; without it the arm fails immediately with that reason rather than sending base64 somewhere it cannot go. The route supplies an R2 uploader (keeping storage keys the route's business), and the test injects a fake to prove the try-on receives the *persisted* URL.

**Notes the bench returns** (they change how the two images should be read): the reversed arm finishes on the try-on's 576×864 and will look softer; a product-only scene renders nobody, so the reversed arm usually cannot run; a supplied model reference makes the arms differ by more than stage order; and the provider-call count per run.

**Verification:** `apps/api` **1014/1014** (79 files; +4) · `apps/web` **279/279** · API + Web `tsc --noEmit` clean · Biome clean on all changed API/route files, and the bench page's 17 diagnostics are byte-identical to its `HEAD` baseline. The page is CRLF in the working tree and stayed CRLF (`loneLF = 0`).

**Not verified:** the A/B has never run against live providers — no `FAL_API_KEY` / `GEMINI_API_KEY` or production access in that session. Everything above is types, tests and the published contracts; the quality call it exists to support is still the owner's, on the bench, after migrations 104/105.

**Not amended:** `CLAUDE.md` row 75 does not yet mention this bench (that file is gated on explicit approval).



## BUILT 2026-09-19 — Admin bench: vision detects "bare garment vs worn", manual checkbox removed

**Problem:** the bench had a manual "Photo is a bare garment" checkbox (default on) that toggled `input_has_person`, i.e. `SCENE_GUARD` ("edit only the background") vs `PLACEMENT_GUARD` ("put this garment on the model"). A hand-set flag the pipeline can read off the photo — and one that silently mis-set the prompt whenever the operator forgot it.

**Change (bench only; the retailer job/route path is deliberately untouched until the bench result is in):**

| File | Change |
|---|---|
| `apps/api/src/lib/garment-parts.ts` | `person_present` added to the vision schema; `VisibleParts.hasPerson` (`false` only on an explicit "nobody wearing it" or a `flat-lay` framing — silent/unusable answers read as *person present*, i.e. today's behaviour); new `detectGarmentPartsFromUrl()` |
| `apps/api/src/routes/admin/admin-photo-cleanup.ts` | `input_has_person` is now **optional**. Omitted → `detectGarmentPartsFromUrl()` decides; explicit value still wins as an override; detection failure → assume a person. Response adds `input_has_person` + `detected_parts` |
| `apps/web/.../photo-cleanup-test/page.tsx` | checkbox + state removed, field no longer sent; result rows show "Photo read as: worn / bare garment" |
| `apps/api/src/lib/garment-parts.test.ts` | +2 tests: flat-lay / `person_present:false` → no person; silent or non-boolean answer → person (fail-open) |

**Cost:** one extra vision call per bench run when the override is omitted (bucketed under `AI_ITEM_DETECT`, not billed as a shoot).

**Not done:** retailer path still passes no `inputHasPerson`; `missingParts`/set completion (R1–R3) still not wired even though the same vision call now returns the parts; `studio-ab` route does not run the check (two-step engines build their own prompts). **Not verified against a live provider.**

**Verification:** `garment-parts` + `studio-shoot` tests 58/58 · API + Web `tsc --noEmit` clean.

## BUILT 2026-09-20 — DPDP notice update + shopper "right to nominate"

Driven by the DPDP founder guide (see PRO-REQUIREMENTS §34 for the point-by-point map).

| File | Change |
|---|---|
| `apps/web/src/app/privacy/page.tsx` | +Why we process / who is responsible, Security, Data breaches, Children, Retention, Grievance officer (`privacy@kanchuki.app`, 30 days); Rights gains nominate + Board complaint; vendor-contract / overseas sentence |
| `apps/web/src/app/terms/page.tsx` | new §7 "Personal data of your customers"; later sections renumbered 8–10 |
| `apps/web/src/app/account-deletion/page.tsx` | grievance + Board pointer |
| `apps/web/src/app/faq/page.tsx`, `for-customers/page.tsx` | DPDP FAQ entry + safety blurb; stale FAQ prices fixed (were ₹999/2,499/4,999 + annual) |
| `packages/db/prisma/schema.prisma`, `migrations/108_customer_nominee` | `CustomerAccount.nominee_name` / `nominee_phone` — **migration applied 2026-09-23** (owner, Supabase SQL Editor; verified: both TEXT columns present, Prisma select ok) |
| `apps/api/.../passport-preferences.ts`, `passport-data.ts` | nominee on GET/PUT `/preferences` (both-or-neither, 10-digit mobile) + in the data export |
| `apps/web/.../(shopper)/my-profile/page.tsx` | Nominee card (save / update / remove) |
| `passport-preferences.test.ts` | +6 nominee tests |

**Not done:** lawyer review; nothing acts on a nominee automatically; CLAUDE.md index row not added (needs owner approval).
**Verification:** passport-preferences 14/14 · API + Web `tsc --noEmit` clean.

