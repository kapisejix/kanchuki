# Google Business Profile (GBP) go-live — owner steps

**Written:** 2026-11-17. **Status:** GBP reviews are built but **DARK** (off). Nothing here has been run against real Google. Do not treat any step as working until a real result is pasted back.

Spec: `docs/tasks/pending/google-business-profile-and-setup-checklist.md` (Part B, section E). Code: `apps/api/src/lib/google-business.ts`, `apps/api/src/lib/gbp-availability.ts`, `apps/api/src/routes/admin/admin-gbp.ts`, admin page `apps/web/src/app/admin/gbp/page.tsx`, mobile `google-business.tsx`.

## What must be true before it works for a retailer

`gbpAvailable()` needs all three:
1. Plan feature `GOOGLE_BUSINESS_PROFILE` is ON for the retailer's plan (Admin → Plan Features, "Google Business Reviews"; the toggle exists since PR #296; no row = OFF).
2. A Super Admin has connected the shared Kanchuki Google identity (stores `GBP_REFRESH_TOKEN`).
3. An admin has set "API approved" (`GBP_API_APPROVED = true`) after Google approves API access.

Already done by owner (2026-11-16): `plan_limits` `GBP_REVIEW_REPLY` = 20 / 100 / 500 (Starter/Growth/Pro). Migrations 140–143 and 146 applied.

## Redirect URL (read from the code)

The Google redirect lands on the admin **web page**, which then POSTs `{code, state}` to `/v1/admin/gbp/callback` (`admin/gbp/page.tsx` reads `?code&state`). So:

`GOOGLE_GBP_REDIRECT_URI = https://kanchuki.app/admin/gbp`

It must match the OAuth client's authorised redirect URI exactly (no trailing slash). Requested scopes: `https://www.googleapis.com/auth/business.manage`, `openid`, `email`.

## Steps (O = only the owner can do it, G = blocked on Google approval)

| # | Step | Who |
|---|---|---|
| 1 | Choose the Google account for the Kanchuki identity. Prefer **Google Workspace** with consent screen type **Internal** (no verification; refresh tokens do not expire in 7 days). A plain Gmail account means **External** plus sensitive-scope verification (privacy-policy URL, demo video), which is slower. | O |
| 2 | Create a Google Cloud project owned by that account. Note the project **number** and **ID**. | O |
| 3 | Enable APIs: My Business Account Management API, My Business Business Information API, and the Business Profile (v4 `mybusiness`) API. | O |
| 4 | Make sure the privacy-policy and terms pages are live on `kanchuki.app`. | O |
| 5 | Submit the **Basic API Access / GBP API access request** (text below). Until approved, quota is 0 and every call fails with `NOT_APPROVED`. Takes weeks. | O, **G** |
| 6 | OAuth consent screen: Internal (Workspace) or External (Gmail), add scope `business.manage`. | O |
| 7 | Credentials → OAuth client ID → **Web application**, redirect `https://kanchuki.app/admin/gbp`. Copy client ID and secret. | O |
| 8 | For place-id search (Part A): enable **Places API (New)** on a billed project, create a server key restricted to Places API, set a budget alert. | O |
| 9 | Set Railway env vars: `GOOGLE_GBP_CLIENT_ID`, `GOOGLE_GBP_CLIENT_SECRET`, `GOOGLE_GBP_REDIRECT_URI`, `GBP_MANAGER_EMAIL` (the address retailers add as Manager; falls back to the connected email), `GOOGLE_PLACES_API_KEY`. Redeploy from the Railway dashboard. | O |
| 10 | Admin → GBP → **Connect Google account** (Super Admin only). | O |
| 11 | Admin → GBP → set **API approved**. | O, **G** (needs step 5) |
| 12 | Admin → Plan Features → toggle **Google Business Reviews** ON for a plan. | O |
| 13 | A test retailer asks to be linked in the app and adds `GBP_MANAGER_EMAIL` as **Manager** on their Google profile. | retailer |
| 14 | Admin → GBP → link that retailer to their location. The tool only offers locations the shared identity manages. | O |

Steps 1–4, 6–10 and 12 can be done while waiting for Google. Steps 5 and 11 are the long pole.

## Draft text for the Basic API Access request

Google's form wording can differ; adapt this and fill the brackets. Do not overstate numbers.

**Business / app description**
> Kanchuki (https://kanchuki.app) is a SaaS platform for independent clothing retailers in India. We want to use the Google Business Profile APIs so a shop owner can read the reviews on their own Google Business Profile and publish replies to them from inside the Kanchuki app, without switching tools.

**How the integration works**
> Kanchuki operates one dedicated Google account. Each participating retailer explicitly consents in our app and then adds that account as a Manager on their own Business Profile. Our staff then link that retailer's location in our admin console. Kanchuki only accesses locations that the retailer has added us to as Manager, and the link is removed on request.

**API usage**
> - Account Management API: list the accounts the dedicated account manages.
> - Business Information API: list locations (title, address) so staff can link the correct location.
> - Business Profile API v4 `accounts.locations.reviews`: read reviews, and write replies (`updateReply`).
>
> We do not create, edit or delete reviews. We do not read or write any other Business Profile data. We sync each linked location about every 6 hours and store reviews for 30 days after a link is removed.

**Expected volume:** about [N] retailers in the first year, one location each, under [X] requests per minute in total.

**Also needed:** Cloud project number and ID, applicant email (same account as the project; Gmail addresses are often rejected for this form), privacy-policy and terms URLs, `https://kanchuki.app`, business registration details if asked.

## Real-retailer test plan (after step 14)

Record every result; do not mark a line passed without pasted output.
- **Link + first sync:** link response includes `first_sync`. `gbp_links.status = LINKED`, `review_count`, `last_synced_at` set, rows in `gbp_reviews`. If it fails, read `gbp_links.last_error_code`.
- **Review sync:** post a review from a different Google account; wait for the 6-hourly `gbp-review-sync` job (or the next sync) and check it arrives.
- **Reply:** reply from the mobile `google-business.tsx` screen; confirm it shows publicly on Google; `GBP_REVIEW_REPLY` usage counter +1.
- **Unlink:** admin unlink → status `UNLINKED`, account/location ids nulled.
- **Revoked access:** remove the Manager on Google → expect `NEEDS_ACCESS`.
- **Not connected / not approved:** expect `NOT_CONNECTED` / `NOT_APPROVED` messages, never fake data.

## Known unverified

No real Google call has ever run. Mobile `google-business.tsx` needs an EAS build and device test. `/admin/gbp` has not been browser-checked. No `plan_features` row for `GOOGLE_BUSINESS_PROFILE` has been read back (treated as OFF).

## Prompt for a new session (Goal B)

```
Context: Kanchuki, E:\Kanchuki. Caveman mode in chat. Rules: never run migrations or touch prod DB/env; I run SQL and set Railway env vars myself; plain npx/pnpm (rtk not installed); ask before merging; do not claim anything works until I paste real results.
Task: help me take Google Business Profile live. Read docs/runbooks/gbp-go-live-owner-steps.md and docs/tasks/pending/google-business-profile-and-setup-checklist.md (section E). Walk me through the steps in order, one at a time, tell me which are mine and which wait on Google, review any error text I paste against apps/api/src/lib/google-business.ts, and update the status docs (CLAUDE.md rows, PLAN.md, PRO-REQUIREMENTS.md) only with what I actually report.
```
