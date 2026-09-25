# Root Cause — How to Use This Folder

**Files:** `root-cause issues.md` (the tracker — one entry per root cause, newest first, `RC-###` IDs) and this page.

---

## The rules

1. **Before editing any feature area, read `root-cause issues.md` for that area first.** Most entries in this tracker are *whole classes* of bug (a silent fallback, an unguarded `fetch`, a teardown that pruned destinations but not entry points). If you are touching that area, the same class is probably still reachable.
2. **A shipped bug gets a new `RC-###` entry — one per ROOT CAUSE, not per symptom.** If one cause produced several visible symptoms, that is one entry with the symptoms listed under it.
3. **Every entry needs all five parts:** Component → Commit → Symptom → Root cause → Fix → **Proof** (the test or command that fails without the fix). An entry with no proof is a claim, not a record.
4. **Add the RC row to the tracker table in `CLAUDE.md`** and **reference the RC ID in the commit message** when you land the fix.
5. **Re-test every RC before a production release** — that is what the checklist below is for.

**Format reminder:** append new entries at the TOP of `root-cause issues.md`. The `RC-###` ID is stable forever — never reuse or renumber one.

---

## Pre-production regression checklist

Run this before any production release. "Auto" = covered by a test that fails without the fix; "Manual" = needs a human on a device/browser. The manual rows are the ones a green CI run cannot prove.

| RC | What broke | How to re-test | Coverage |
|---|---|---|---|
| RC-001 | AI Campaign Assistant 500s on malformed LLM reply shapes | Ask the AI Campaign assistant for a campaign; the intent parser must never throw on a missing/stringified/bad-enum field | Auto — `packages/ai/src/campaign-assistant.test.ts`, `apps/api/src/routes/growth/growth-ai-campaign.test.ts` |
| RC-002 | Festival resolution never matched → FESTIVAL drafts unsaveable | Build a FESTIVAL campaign naming a festival in free text; it must resolve and save | Auto — `growth-ai-campaign.test.ts` |
| RC-003 | Mobile catch block swapped the real API error for a constant | Force an API failure on the AI Campaign screen; the real message must appear | Auto (screen smoke) — `apps/mobile/__tests__/smoke/rc-screens.test.tsx` |
| RC-004 | Category DELETE used the main client on a DELETE-revoked table (500) | Delete a category from the mobile category screen | Auto — `apps/api/src/routes/categories.test.ts` |
| RC-005 | Related-product thumbnails did nothing | Open a product detail sheet, tap a related product — it must open **in place** | Manual (sheet interaction) |
| RC-006 | Sheet unmount `history.back()` undid in-sheet `<Link>` navigation | Open a Suits Designs permalink from inside the sheet, then press back | Manual |
| RC-007 | Customer-detail screen crashed on fields the 2026-08-31 teardown removed | Open a customer detail screen with 0 purchases | Auto (screen smoke) — `rc-screens.test.tsx` |
| RC-008 | Mobile GST report read `estimated_*` after the server renamed them to `cgst`/`sgst`/`igst` | Open the GST report on a month with invoices | Auto (screen smoke) — `rc-screens.test.tsx` |
| RC-009 | "Failed to add team member" hid every real rejection | Add a team member with a duplicate phone; the real API error must show | Auto — `apps/api/src/routes/staff.test.ts` + `rc-screens.test.tsx` |
| RC-010 | Edit Profile re-sent the stored GSTIN → 422 on unrelated logo/banner saves | Save a logo/banner/profile without touching GSTIN | Auto — `apps/api/src/routes/retailers.test.ts` + `rc-screens.test.tsx` |
| RC-011 | Server Razorpay call had no timeout → Switch Plans timed out client-side | Switch plans on a slow network; must not report "API server not running" | Auto — `apps/api/src/routes/billing.test.ts` (pins the 20 s `AbortSignal.timeout`) + `rc-screens.test.tsx` |
| RC-012 | Customer-detail kept a Measurements card wired to deleted routes | Open a customer detail screen; no Measurements card, no camera nav | Auto (screen smoke) + `grep -r "measurement" apps/mobile` |
| RC-013 | Dead 360-spin modal + stale `try_on_credits` reads survived the teardown | Plan-select / onboarding / analytics render with no try-on lines | Auto (screen smoke) + `grep -r "spin_\|try_on_credits" apps/mobile` |
| RC-014 | Dismissing the OS share sheet raised an unhandled `AbortError` (Sentry) | Open share on a customer product page, dismiss the sheet — no Sentry event | Auto — `apps/web/src/app/c/[slug]/components/__tests__/{CollectionView,ProductDetailSheet}.test.tsx` |
| RC-015 | OTP sent twice (state-based guard lost a race) | Double-tap submit on mobile; double-click the WebView storefront gate — exactly 1 SMS | Manual (real phone + browser) |
| RC-016 | Facebook Disconnect left the native SDK session → reconnect loop | Connect → Disconnect → Connect on a real phone | Manual (real device) |
| RC-017 | AI Studio style pick reset to row 0 on every render | Open AI Studio, tap the 3rd style, generate — the 3rd must be used | Auto — `apps/mobile/__tests__/smoke/ai-studio-selection.test.tsx` |
| RC-018 | `logOut()` before *every* FB login forced the credentials form | Connect Facebook on a device already signed in — expect one-tap "Continue as" | Auto — `apps/mobile/__tests__/lib/facebook-auth.test.ts`; also Manual (real device) |
| RC-019 | Offline e2e flaked by reaching the real server (SW navigation not covered by `setOffline`) | Run the **full** customer e2e suite (not a `-g` run) | Auto — `apps/web/e2e/customer-collection.spec.ts` |
| RC-020 | OTP digits rendered twice once autofill fired | On a real Android device, let SMS Retriever autofill the code | Manual (real Android device) |
| RC-021 | Two different OTPs from two senders on every real-phone login | Log in on a real phone — exactly one SMS, one sender | Auto — `apps/api/src/routes/auth-otp-bypass.test.ts`; also Manual (SMS count) |
| RC-022 | Facebook collection-link posts had no photo (and the preview was empty) | Publish a Collection-link post; it must carry a cover photo | Auto — `apps/api/src/routes/retailers/retailers-social/retailers-social-fanout.test.ts` |
| RC-023 | Composer defaulted `linkType` to `'none'` → most posts had no shop link | Open the composer, change post type — the link must stay populated | Manual (composer) |
| RC-024 | E2E assertion sampled a cache-warm first paint → 1-in-3 flake | Run the store-directory e2e suite on a warm `.next/cache` | Auto — `apps/web/e2e/customer-stores-directory.spec.ts` |
| RC-025 | Storefront view tracking never reached the API (missing proxy route) + a dead `checkout-status` probe 404'd on every view | Load a storefront with console-error capture on: zero 404s, and a `POST /v1/public/collections/*/view` must appear in the stub log | Auto — `apps/web/e2e/customer-my-stores.spec.ts`, unit tests on both proxy routes |
| RC-026 | `/my-profile` personalization opt-out silently never persisted (DPDP) | Toggle Personalization off, reload — the switch must still be off | Auto — `apps/web/src/app/api/passport/[...path]/__tests__/route.test.ts` + e2e |
| RC-027 | Studio Shoot engine named in the DB never received the product photo (text-to-image endpoint) + a silent fallback for unknown engines | Run the **admin bench** (which now sends real product data + `engine`) against a live provider and compare the rendered garment to the product | Auto — `apps/api/src/lib/gemini-image.test.ts`, `apps/api/src/lib/studio-shoot.test.ts`, `apps/api/src/lib/retired-tryon-guard.test.ts`; also Manual (first live-provider run has never happened) |

### Known-residual / non-code rows
- **RC-011** — residual is device-dependent (real Razorpay latency); the pinned test covers the timeout shape only.
- **RC-018** — still open, and **not a code defect**: without the Facebook app installed, the SDK's own web dialog is expected and still asks for credentials. Nothing to fix in code.
- **RC-025** — known residual, measured: a proxied view records the **web server's** `ip_hash`, not the shopper's. The dashboard *count* is correct; changing it means a separate decision about `trustProxy`. Deliberately not changed.
- **RC-019** — the original assertion was **removed as not Playwright-deterministic**; the spec asserts the layer below instead. Do not "restore" it.

---

## ⚠️ RC IDs referenced in commits that are NOT in the tracker yet

**RC-028 … RC-038** appear in commit messages but have **no entry in `root-cause issues.md`**. All of them are on **unmerged branches** — none is an ancestor of `origin/main` — so by rule 2 they are not yet "shipped bugs":

| RC | Commit | Subject | Branch |
|---|---|---|---|
| RC-028 | `ab086d62` | `fix(growth): promotion delete 42501 — route through purge client` | `chore/remove-text-to-image-studio-engines` |
| RC-029 | `d66ead2c` | `feat(referrals): retailer affiliate program T1+T2 + purge-grant audit` | same |
| RC-030 | `d738242c`, `baf9d665` | `fix(purge): sweep the 7 bare-retailer_id tables and guard the list with the schema` | same |
| RC-031 | `40e7d53b` | `feat(referrals): T3 affiliate code namespace + mint endpoint` | same |
| RC-032 | `49dae2fb` | `feat(referrals): T4 affiliate capture at signup, on the field F-018 already owns` | same |
| RC-033 | `efc4446f` | `feat(referrals): T5 qualification cron — pending → qualified/clawed_back` | same |
| RC-034 | `1c543d15` | `fix(admin): replace three drifted access lists with one shared, derivation-guarded list` | same |
| RC-035 | `1c543d15` | stale assertion — a test pinned `grok_imagine` as the "unverified price" example after its price was verified | same |
| RC-036 | `b5a31478` | `fix(referrals): close the double-pay claim race found by the early §11 run` | same |
| RC-037 | `d585d26b` | `fix(referrals): five T7 payout defects hidden by mocks` | same |
| RC-038 | `91ae9916` | `fix(web): run the customer e2e suite for real, fix the 204→503 proxy bug it hid` | `fix/e2e-customer-my-stores` |

**Action when those branches merge:** add the eleven entries to `root-cause issues.md` with their proof lines, and add their rows to the `CLAUDE.md` RC table. **Do not renumber them** — the IDs are already in commit messages, so the numbers are spoken for whether or not the file knows yet.
