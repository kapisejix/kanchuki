# F-035 — Kanchuki-Managed WhatsApp Sending (Meta Tech Provider + Embedded Signup)

**Status:** 🔴 **Planned — not started.** Spec written 2026-09-08 on user request. Build after Play Store launch is stable.
**Owner decision locked (2026-09-08):** go with **Model A** — Kanchuki becomes a Meta Tech Provider; each retailer gets their **own** WhatsApp Business Account (WABA) + number through an in-app Embedded Signup popup; Kanchuki holds the token and sends on their behalf. A single shared Kanchuki number for all retailers is **rejected** (Meta policy: one WABA = one business; blasting third-party catalogs from Kanchuki's number risks template rejection + account ban, and destroys retailer branding).
**Related:**
- `apps/api/src/routes/retailers/retailers-whatsapp.ts` — existing bring-your-own-credentials config routes (`GET/PATCH/DELETE /v1/retailers/me/whatsapp-api`)
- `apps/api/src/routes/collections.ts:451` — `POST /v1/collections/:id/bulk-send` (already sends via `graph.facebook.com/v21.0/{phone_number_id}/messages` with the retailer's token + template)
- `apps/api/src/routes/growth/growth-campaigns/growth-campaigns-send.ts` — campaign WhatsApp send (same credential source)
- `docs/tasks/PHASE-II-WHATSAPP-CATALOG-BREAKDOWN.md` — Phase II native catalog sync (also reads `whatsapp_api_*` on Retailer)
- `docs/PRO-REQUIREMENTS.md` §23 (F-031 social), §27 (Phase II catalog)
- CLAUDE.md "What's Built" index — add the F-035 row when this ships
- `docs/BUILD-LOG.md` — append the build table when this ships

Legend for effort: **S** = < 1 h, one file · **M** = 1–3 files · **L** = cross-cutting / migration / needs Meta approval or product sign-off.

---

## 1. Goal

A retailer with no Meta developer knowledge taps **"Connect WhatsApp"** in the app,
completes a ~3-minute Facebook login popup, and can immediately send a collection
link (or campaign message) to all 20–50 saved customers in **one action** — from
**their own** WhatsApp Business number, with their own shop name as the sender.

Kanchuki never asks the retailer to paste a phone number ID, an access token, or a
template name. Kanchuki provisions the WABA, registers the phone number, submits
the message templates, stores the long-lived token, and does the sending.

The existing `POST /collections/:id/bulk-send` and campaign-send code paths stay
**unchanged** — they already read `retailer.whatsapp_api_phone_number_id` +
`whatsapp_api_access_token` + `whatsapp_api_template_name` and call the Graph API.
F-035 only changes **how those four fields get populated**: today a manual
`PATCH /me/whatsapp-api` form; after F-035, the Embedded Signup callback.

---

## 2. Current state (what exists today)

| Piece | Where | Notes |
|---|---|---|
| Credential storage | `Retailer.whatsapp_api_phone_number_id` / `_access_token` / `_template_name` / `_template_lang` / `_configured_at` (`packages/db/prisma/schema.prisma`) | Set today by the manual PATCH form. Token is a **long-lived user token or system-user token the retailer generated themselves** in Meta dashboard. |
| Config routes | `retailers-whatsapp.ts` — `GET/PATCH/DELETE /v1/retailers/me/whatsapp-api` | PATCH takes `{ phone_number_id, access_token, template_name, template_lang }`. Gated behind the `WHATSAPP_BUSINESS_API` plan feature (`hasFeature()`). Writes an `auditLog` row. |
| Bulk send | `collections.ts:451` `POST /v1/collections/:id/bulk-send` | Loops selected customers, POSTs a **template** message to `graph.facebook.com/v21.0/{phone_number_id}/messages` with `Authorization: Bearer {access_token}`. Returns `{ sent, failed_count }`. Feature-gated the same way. |
| Campaign send | `growth-campaigns-send.ts` | Same credential read + Graph call for reactivation / festival campaigns. |
| Native catalog sync | `retailers-whatsapp-catalog.ts` + `jobs/catalog-sync.ts` + `lib/meta-catalog.ts` | Phase II. Also needs a WABA + a **Catalog** attached to it — Embedded Signup can provision that too (see §4.4). |
| Mobile config UI | `apps/mobile/app/settings/social.tsx` (WhatsApp section) + `settings/index.tsx` link | Manual text inputs for the 4 values. This is what F-035 replaces with a one-tap button. |
| Graph client | `apps/api/src/lib/meta-graph.ts` | Facebook Page + IG publishing (F-031). WhatsApp sends are currently done with an **inline `fetch`** in `collections.ts` / campaign-send, **not** via a shared client. F-035 should extract a `lib/whatsapp-cloud.ts` (see T-3). |
| OAuth token pattern | F-012 encrypted-token storage; `apps/web` `/social/connect` OAuth flow (F-031) | Reuse: token encryption at rest, `state` CSRF param, redirect-URI allowlist. |

**Key point:** the "send to everyone" machinery is **already built and working** for
retailers who manually configured credentials. F-035 is an **onboarding /
provisioning** feature, not a sending feature.

---

## 3. Meta-side prerequisites (owner / one-time, no code)

These block the build and take real calendar time — **start them first**.

| # | Task | Owner | Lead time | Notes |
|---|---|---|---|---|
| P-1 | **Business Verification** of the Kanchuki Meta Business account | Owner | 1–3 weeks | Needs company registration docs, address proof, a business domain (`kanchuki.app`). Required before Advanced Access to any WhatsApp permission. |
| P-2 | Create / confirm a **Meta App** with the **WhatsApp** product added (can reuse the F-031 app `1758308975480748` or make a dedicated one — **decide in D-1**) | Owner | 1 day | Dedicated app is cleaner for permission review + rate isolation. |
| P-3 | Become a **Tech Provider** (Meta Business Settings → "Tech Provider" / Solution Partner track) | Owner | days | Unlocks the Embedded Signup flow and OBO (on-behalf-of) token exchange. |
| P-4 | App Review for **`whatsapp_business_management`** + **`whatsapp_business_messaging`** (Advanced Access) | Owner | 1–4 weeks | Submit a screencast of the Embedded Signup + a test send. Until approved, only test WABAs added to the app work. |
| P-5 | Configure the **Embedded Signup** flow in the App Dashboard: allowed redirect/origin, the "configuration" (which assets to request — WABA + phone number + optional Catalog) | Owner | 1 day | Produces a `config_id` used by the JS SDK. |
| P-6 | Decide **billing model** — per-retailer payment method on their WABA, **or** Kanchuki central "line of credit" as partner with OBO billing + passthrough (₹0.38/conv + margin) | Owner | — | CLAUDE.md pricing already assumes passthrough → lean central + credit-pack. See D-2. |
| P-7 | **Meta webhook** endpoint for `messages` + `message_template_status_update` + `account_update` fields, subscribed at the app level | Owner + code (T-6) | — | HMAC-verified, same pattern as `webhooks/whatsapp-catalog.ts`. |

---

## 4. Architecture

### 4.1 Flow — retailer connects

```
Mobile app (settings → "Connect WhatsApp")
  → opens a WebView / in-app browser to  apps/web  /whatsapp/embedded-signup?state=<csrf>
      (web hosts it because the Meta JS SDK "launchWhatsAppSignup" needs a real browser origin;
       the RN app cannot run the FB JS SDK Embedded Signup widget directly)
  → retailer logs into Facebook, picks or creates a Business, a WABA, and a phone number,
    verifies the number by SMS/call  (all inside Meta's popup)
  → Meta returns an authorization `code` to the web page via the SDK callback
  → web page POSTs { code, state, phone_number_id, waba_id }  →  apps/api
      POST /v1/retailers/me/whatsapp-embedded-signup
  → api exchanges `code` → long-lived **business integration system-user access token**
      (POST graph.facebook.com/v21.0/oauth/access_token, grant_type=authorization_code, ...)
  → api calls  POST /{waba_id}/subscribed_apps   (subscribe Kanchuki's app to that WABA's webhooks)
  → api registers the phone number:  POST /{phone_number_id}/register  { messaging_product, pin }
  → api submits the default message templates (T-5) to that WABA
  → api encrypts + stores token, phone_number_id, waba_id, business_id on the Retailer row
  → api writes auditLog + returns { configured: true, phone_display_number, verified_name }
  → mobile polls GET /me/whatsapp-api → shows "Connected as <shop name> · +91…"
```

### 4.2 Schema changes — migration `NNN_whatsapp_embedded_signup`

Add to `Retailer` (all nullable; existing manual-config retailers keep working):

| Column | Type | Purpose |
|---|---|---|
| `whatsapp_waba_id` | `text` | The WhatsApp Business Account ID (needed for template mgmt, catalog, webhooks). |
| `whatsapp_business_id` | `text` | Parent Meta Business ID. |
| `whatsapp_api_token_type` | `text` (`'manual'` \| `'embedded_signup'`) | So we know whether we can refresh / revoke it and which UI to show. Default `'manual'` for backfill. |
| `whatsapp_display_number` | `text` | E.164 shown in the UI ("Connected as +91 98…"). |
| `whatsapp_verified_name` | `text` | Meta-approved business display name shown to message recipients. |
| `whatsapp_quality_rating` | `text` (`GREEN`\|`YELLOW`\|`RED`\|null) | From `account_update` webhook — surface in admin + warn the retailer. |
| `whatsapp_messaging_limit_tier` | `text` | e.g. `TIER_1K`. From webhook. Drives the "you can message N new users / 24 h" hint. |
| `whatsapp_api_token_expires_at` | `timestamptz` | System-user tokens are effectively non-expiring, but store it if Meta returns one. |

Reuse the existing `whatsapp_api_phone_number_id`, `whatsapp_api_access_token`
(switch to **encrypted-at-rest** — see T-2), `whatsapp_api_template_name`,
`whatsapp_api_template_lang`, `whatsapp_api_configured_at`.

New table `whatsapp_template` (Kanchuki-submitted templates per retailer, so we can
show status + re-submit on rejection):

| Column | Type |
|---|---|
| `id` | uuid pk |
| `retailer_id` | fk → Retailer, indexed |
| `name` | text (e.g. `collection_share_v1`) |
| `language` | text (`en_US`, `hi`, …) |
| `category` | text (`MARKETING` \| `UTILITY`) |
| `body_text` | text (the template body with `{{1}}` params) |
| `meta_template_id` | text nullable |
| `status` | text (`PENDING` \| `APPROVED` \| `REJECTED` \| `PAUSED` \| `DISABLED`) |
| `rejection_reason` | text nullable |
| `created_at` / `updated_at` | timestamptz |

RLS: `whatsapp_template` follows the standard retailer-scoped policy (see
[[kanchuki-rls-convention]] — every retailer table needs RLS; the app role reads
only its own `retailer_id`). Add the policy in the same migration.

### 4.3 API surface (new / changed)

| Method + path | File | Effort | Purpose |
|---|---|---|---|
| `GET /v1/retailers/me/whatsapp-embedded-signup/start` | `retailers-whatsapp-embedded.ts` (new) | S | Returns `{ config_id, redirect_url, state }` — the web page needs `config_id`; `state` is a signed CSRF nonce stored in Redis (reuse `createOAuthState` from `retailers-social.ts`). |
| `POST /v1/retailers/me/whatsapp-embedded-signup` | same | L | The callback. Body `{ code, state, phone_number_id, waba_id }`. Does the whole §4.1 exchange → provision → store. Idempotent on `(retailer_id, phone_number_id)`. |
| `GET /v1/retailers/me/whatsapp-api` | `retailers-whatsapp.ts` (extend) | S | Add `waba_id`, `token_type`, `display_number`, `verified_name`, `quality_rating`, `messaging_limit_tier`, and `templates: [{ name, status, language }]` to the response. |
| `DELETE /v1/retailers/me/whatsapp-api` | `retailers-whatsapp.ts` (extend) | S | Also call `DELETE /{waba_id}/subscribed_apps` and null the new columns. |
| `POST /v1/retailers/me/whatsapp-templates/:name/resubmit` | `retailers-whatsapp-embedded.ts` | S | Re-submit a `REJECTED` template after Kanchuki edits the copy. Admin-triggered variant too (T-7). |
| `GET /whatsapp/embedded-signup` (web page) | `apps/web/src/app/whatsapp/embedded-signup/page.tsx` (new) | M | Loads the Facebook JS SDK, renders the "Connect WhatsApp" button, calls `FB.login({ config_id, response_type:'code', override_default_response_type:true, extras:{ setup:{}, featureType:'', sessionInfoVersion:'3' } })`, captures `code` + the `WA_EMBEDDED_SIGNUP` `message` event (`phone_number_id`, `waba_id`), POSTs to the API, then deep-links back to the app (`kanchuki://settings/whatsapp?connected=1`). |
| Webhook `POST /webhooks/whatsapp` | `apps/api/src/routes/webhooks/whatsapp.ts` (new) | M | Handle `message_template_status_update` (→ update `whatsapp_template.status`), `account_update` (→ `quality_rating`, `messaging_limit_tier`, or `PENDING_DELETION` → alert), and delivery `statuses` (→ optional per-message log). HMAC `X-Hub-Signature-256` verify against the app secret, same as `whatsapp-catalog.ts`. |

### 4.4 Optional in the same signup: native catalog

The Embedded Signup `config_id` can be set (P-5) to also create/attach a **Catalog**
to the WABA. If done, Phase II native catalog sync
(`docs/tasks/PHASE-II-WHATSAPP-CATALOG-BREAKDOWN.md`) needs **no separate
onboarding** — the `catalog_id` comes back in the same callback. Store it on the
existing Phase II field. **Decide in D-4** (adds review scope:
`catalog_management` permission).

### 4.5 Mobile changes

| Piece | File | Effort |
|---|---|---|
| Replace the manual 4-field WhatsApp form with a **"Connect WhatsApp Business"** button | `apps/mobile/app/settings/social.tsx` (WhatsApp section) | M |
| Button opens the web Embedded Signup page in an in-app browser (`expo-web-browser` `openAuthSessionAsync`, so the `kanchuki://` return deep-link resolves) | same | S |
| "Connected" state: show `verified_name` + `display_number` + a quality-rating dot + template status chips; a **Disconnect** button | same | S |
| Keep a hidden **"Enter credentials manually"** fallback (for retailers who already have a WABA elsewhere and just want to paste a token) — the existing PATCH form, behind a "More options" link | same | S |
| The collection share sheet (`app/collection/[id].tsx`) and campaign screens need **no change** — `apiConfigured` already flips to `true` once the columns are set, which shows the real "Send" (bulk) button. | — | — |

### 4.6 Admin changes

| Piece | File | Effort |
|---|---|---|
| Retailer detail → "WhatsApp" panel: connection status, `waba_id`, quality rating, messaging tier, template list with status, last send counts | `apps/web` admin retailer page + a `GET /v1/admin/retailers/:id/whatsapp` route | M |
| A cross-retailer "WhatsApp health" list (RED quality / rejected templates / PENDING_DELETION) — reuse the Phase II admin monitor layout | `apps/web` admin + `admin-whatsapp-*.ts` | M |
| Force-resubmit a template / force-disconnect a retailer | admin route | S |

---

## 5. Default message templates (Kanchuki submits these per retailer on connect)

Submit via `POST /{waba_id}/message_templates`. Start with three:

| Name | Category | Language(s) | Body |
|---|---|---|---|
| `collection_share_v1` | MARKETING | `en_US`, `hi` | `Hi {{1}}! Check out our latest collection "{{2}}": {{3}}` |
| `back_in_stock_v1` | MARKETING | `en_US`, `hi` | `Hi {{1}}, "{{2}}" is back in stock at our store. View here: {{3}}` |
| `enquiry_reply_v1` | UTILITY | `en_US`, `hi` | `Hi {{1}}, thanks for your enquiry about "{{2}}". {{3}}` |

`bulk-send` today uses `retailer.whatsapp_api_template_name` — after F-035 default
that to `collection_share_v1` and pass `{{1}}=customer name`, `{{2}}=collection
title`, `{{3}}=collection URL` as the template `components` params. **This changes
the current `bulk-send` body construction** (it currently sends whatever single
template the retailer named, with its own param assumptions) — see T-8.

---

## 6. Task list (build order)

> Do **P-1…P-5** (Meta side) in parallel from day 0 — they gate everything and
> take weeks. Code tasks below assume a **test WABA** added to the app is available
> for T-1…T-8 before Advanced Access is granted.

| # | Task | Effort | Skills / agents to use |
|---|---|---|---|
| **T-0** | **Brainstorm + confirm scope** with the owner: billing model (D-2), dedicated vs shared Meta app (D-1), catalog-in-signup (D-4), which templates (§5), manual fallback kept or dropped (D-3). Write the answers back into §9. | S | `superpowers:brainstorming` (before any code), then `superpowers:writing-plans` to turn the confirmed scope into the ordered subtask list |
| **T-1** | **Migration `NNN_whatsapp_embedded_signup`**: new `Retailer` columns (§4.2), new `whatsapp_template` table + RLS policy, backfill `whatsapp_api_token_type='manual'` for rows that already have a `phone_number_id`. Prisma schema + `packages/db/prisma/migrations`. Do **not** apply in prod from code — owner applies via the admin runner (CLAUDE.md rule). | M | `ecc:database-migrations`, `supabase:supabase-postgres-best-practices`, `ecc:prisma-patterns`; review with the `ecc:database-reviewer` agent; RLS per [[kanchuki-rls-convention]] |
| **T-2** | **Encrypt `whatsapp_api_access_token` at rest.** Today it's stored plaintext. Add an `encrypt()/decrypt()` wrapper (reuse F-012's key + helper) in a `lib/whatsapp-cloud.ts`; migrate existing plaintext tokens in T-1's data step (or a one-off script the owner runs). All readers (`bulk-send`, campaign-send, catalog-sync) go through `getDecryptedWhatsAppToken(retailerId)`. | M | `security-review` skill / `ecc:security-review`, `agent-skills:security-and-hardening`, `ecc:typescript-reviewer` agent |
| **T-3** | **`lib/whatsapp-cloud.ts`** — a shared Cloud API client: `exchangeCode()`, `getLongLivedToken()`, `subscribeApp(wabaId)`, `registerPhoneNumber(phoneNumberId, pin)`, `createTemplate(wabaId, tpl)`, `getTemplates(wabaId)`, `sendTemplateMessage({ phoneNumberId, token, to, templateName, language, components })`, `deleteSubscribedApp(wabaId)`. Typed errors (`MetaApiError` like `meta-graph.ts`). Unit-tested with `vitest` + a fetch mock. | L | `ecc:api-design`, `ecc:backend-patterns`, `mcp__plugin_context7__query-docs` for the current Meta WhatsApp Cloud API + Embedded Signup contract (do **not** trust training data — the Graph version + signup SDK params change often), `agent-skills:test-driven-development` |
| **T-4** | **`retailers-whatsapp-embedded.ts`** — `GET …/start` + `POST …/whatsapp-embedded-signup` + `…/whatsapp-templates/:name/resubmit`. Wire into the retailers route aggregator (check it's actually `.register()`-ed — F-031/F-064 both shipped with unregistered routes; add a route-registration smoke test). Feature-gate behind `WHATSAPP_BUSINESS_API`. `auditLog` on connect/disconnect. | L | `ecc:typescript-reviewer` agent + `ecc:backend-patterns`; `superpowers:test-driven-development` |
| **T-5** | **Default template submission** on connect (§5) — create the 3 templates × 2 languages, store `whatsapp_template` rows as `PENDING`. | M | same as T-4; `mcp__plugin_context7` for the `message_templates` payload shape |
| **T-6** | **Webhook `webhooks/whatsapp.ts`** — HMAC verify, handle `message_template_status_update` / `account_update` / `statuses`. Reuse `whatsapp-catalog.ts` signature-verify code. Tests with recorded payloads. | M | `ecc:security-review` (signature verify), `agent-skills:test-driven-development`, copy the test style of `webhooks/whatsapp-catalog-webhook.test.ts` |
| **T-7** | **Admin surfaces** — retailer WhatsApp panel + cross-retailer health list + force-resubmit/disconnect. | M | `ecc:react-reviewer` agent, `frontend-design` skill, match the Phase II admin monitor UI |
| **T-8** | **Update `bulk-send` + campaign-send** to use `collection_share_v1` with structured `components` params + `getDecryptedWhatsAppToken()` + `lib/whatsapp-cloud.ts` `sendTemplateMessage()` (drop the inline `fetch`). Keep the `{ sent, failed_count }` response shape. Re-run the security + collections test suites. | M | `ecc:typescript-reviewer` agent, `superpowers:test-driven-development`; run `npx vitest run src/routes/security.test.ts` (CLAUDE.md rule 8) |
| **T-9** | **Web Embedded Signup page** `apps/web/src/app/whatsapp/embedded-signup/page.tsx` — FB JS SDK, `config_id`, capture `code` + `WA_EMBEDDED_SIGNUP` message event, POST to API, deep-link back. CSP: the FB SDK host must be in the `apps/web` `script-src` allowlist. | M | `ecc:react-reviewer` agent, `mcp__plugin_context7` for the current `launchWhatsAppSignup` / `FB.login` params, `vercel-react-best-practices` |
| **T-10** | **Mobile settings rewrite** (§4.5) — button, in-app browser, connected state, manual fallback behind "More options". | M | `vercel-react-native-skills`, `ecc:react-reviewer` agent, `frontend-design` skill |
| **T-11** | **Docs + status flip** — BUILD-LOG table, CLAUDE.md index row F-035 → Built, PLAN.md, PRO-REQUIREMENTS §31, INDIA-RETAILER-GROWTH P/E. (CLAUDE.md rule 10/11.) | S | — |
| **T-12** | **Code review pass** on the whole branch before merge. | S | `code-review:code-review` skill or the `agent-skills:code-reviewer` + `agent-skills:security-auditor` agents |

**Rough total:** ~2–3 dev-weeks of code once Meta approvals (P-1…P-4) are through.
The Meta approvals are the long pole (4–8 weeks calendar).

---

## 7. Testing plan

### 7.1 Unit (`vitest`, `apps/api`)

- `lib/whatsapp-cloud.ts` — mock `fetch`; assert:
  - `exchangeCode` posts to the right Graph URL with `grant_type=authorization_code`
  - `sendTemplateMessage` builds the `template.components` array correctly for `{{1}}{{2}}{{3}}`
  - a Meta error body (`{ error: { message, code, error_subcode } }`) → typed `MetaApiError`, message surfaced, raw network text **not** leaked (mirror the F-064 finding-4 sanitisation)
- `retailers-whatsapp-embedded.ts` — `POST …/whatsapp-embedded-signup`:
  - happy path → columns written, `auditLog` row, `{ configured: true }`
  - replay same `(retailer_id, phone_number_id)` → idempotent, no dup templates
  - bad/expired `state` → 400, nothing written
  - Meta exchange failure → 502, nothing written, no partial state
- webhook — recorded `message_template_status_update` payload → `whatsapp_template.status` updated; bad signature → 401
- `bulk-send` — existing tests updated for the new template-param body; `{ sent, failed_count }` unchanged; token comes from `getDecryptedWhatsAppToken`
- **Regression:** `npx vitest run src/routes/security.test.ts` + `src/routes/collections*.test.ts` green

### 7.2 Integration — Meta test WABA

Before Advanced Access, add a **test phone number** to the app (Meta gives up to 2
free test numbers, 250 free msgs/day).

1. Run the web Embedded Signup page locally (ngrok/tunnel for the redirect + webhook), complete the popup with a test WABA.
2. Assert the API callback provisions: token stored (encrypted), `subscribed_apps` set (verify with `GET /{waba_id}/subscribed_apps`), phone `register` 200, 6 template rows `PENDING`.
3. Approve a template in the Meta dashboard → assert the webhook flips the row to `APPROVED`.
4. From the app: create a collection, pick 3 test recipient numbers (all must have messaged the test number first, or be on the allowed test-recipient list), tap **Send** → assert 3 delivered, `whatsapp_template` used = `collection_share_v1`, delivery `statuses` webhooks logged.
5. Disconnect → assert `subscribed_apps` removed, columns nulled, `auditLog` delete row.

### 7.3 Manual QA on a real EAS build

- The in-app browser (`expo-web-browser`) round-trip: button → FB popup → back to `kanchuki://settings/whatsapp?connected=1` → "Connected as …" without a manual refresh.
- Quality-rating dot + template chips render from `GET /me/whatsapp-api`.
- "More options → enter manually" still works (paste a token) — the fallback path is not broken.
- Poor connectivity: popup abandoned halfway → app shows "not connected", no orphan columns.

### 7.4 Pre-launch checklist

- [ ] Advanced Access granted for `whatsapp_business_messaging` + `whatsapp_business_management`
- [ ] Business Verification green
- [ ] Webhook subscribed at app level for `message_template_status_update`, `account_update`, `messages`
- [ ] CSP `script-src` on `apps/web` includes the FB SDK host
- [ ] `WHATSAPP_BUSINESS_API` plan-feature rows present for the tiers that should get it (Growth + Pro? — D-5)
- [ ] Token encryption key present in prod env (F-012 key)
- [ ] Rate-limit / retry on `sendTemplateMessage` (Meta 80 msg/s default; `bulk-send` of 50 is fine, but campaign sends of 500+ need throttling — reuse the BullMQ pattern from `jobs/catalog-sync.ts` if a send can exceed ~200 recipients)

---

## 8. Risks

1. **Meta approval timeline** — Business Verification + App Review can take 4–8 weeks and can be rejected for vague reasons. Mitigation: start P-1…P-4 immediately; keep the manual-credential path alive as the interim; the `wa.me` one-by-one flow stays as the zero-approval fallback.
2. **Per-conversation cost** — Meta bills the WABA owner. If Kanchuki bills centrally (D-2), a runaway campaign is a real money leak. Mitigation: per-retailer daily send cap tied to plan tier (reuse F-010 quota — add a `WHATSAPP_CONVERSATIONS` `QuotaResourceType`), hard-stop at the cap, surface remaining count in the share sheet.
3. **Template rejection** — MARKETING templates get rejected for tone/format. Mitigation: keep bodies minimal (§5), store `rejection_reason`, admin re-submit (T-7), ship with UTILITY variants as a fallback.
4. **Quality rating drop → number blocked** — spammy sends tank the rating (webhook → `RED` → Meta throttles then blocks). Mitigation: only send to customers with a captured phone + an implied opt-in (they gave their number in-store); never send to scraped lists; show the retailer their rating; cap new-conversation sends to the messaging tier.
5. **Token leakage** — a stored WABA system-user token can send as the retailer. Mitigation: encrypt at rest (T-2), never log it, never return it in any API response, `auditLog` every use path, admin force-disconnect.
6. **RN can't run the Embedded Signup widget** — hence the `apps/web` page + in-app browser hop. If the deep-link return is flaky on some Android OEMs, fall back to "we'll finish setup — reopen the app in a minute" polling.
7. **Existing manual-config retailers** — must not break. The migration backfills `token_type='manual'`; all read paths stay identical; the new columns are additive and nullable.

---

## 9. Open decisions (fill in during T-0 brainstorm)

- **D-1 — Meta app:** dedicated new app for WhatsApp, or reuse the F-031 Facebook app `1758308975480748`? *(lean: dedicated — isolates permission review + webhooks + rate limits.)*
- **D-2 — Billing:** per-retailer payment method on their WABA (Meta bills them; Kanchuki charges nothing extra), **or** Kanchuki central credit line + OBO billing + passthrough at ₹0.38 + margin via a credit pack / plan allowance? *(CLAUDE.md pricing assumes passthrough → lean central + `WHATSAPP_CONVERSATIONS` quota.)*
- **D-3 — Manual fallback:** keep the paste-your-own-token form (behind "More options"), or remove it once Embedded Signup works? *(lean: keep — some retailers have an agency-managed WABA.)*
- **D-4 — Catalog in signup:** request Catalog creation in the same Embedded Signup `config_id` (so Phase II native catalog needs no separate onboarding), accepting the extra `catalog_management` review scope? *(lean: yes, phase it — ship messaging first, add the catalog asset to `config_id` in a follow-up.)*
- **D-5 — Plan gating:** which tiers get `WHATSAPP_BUSINESS_API` + what daily conversation cap each? *(Starter: none / Growth: 200/day / Pro: 1000/day — confirm against `plan_pricing`.)*
- **D-6 — Languages:** ship templates in `en_US` + `hi` only, or add `mr`, `ta`, `te`, `bn`, `gu` at launch? *(lean: `en_US` + `hi`; add regional on demand — each is a separate Meta submission.)*

---

## 10. Out of scope for F-035

- Two-way WhatsApp chat / inbox in the app (customer replies land in the retailer's normal WhatsApp).
- WhatsApp Flows, interactive list/button messages, carousels.
- Automated drip / scheduled campaigns (F-034-style scheduling) — F-035 is one-shot sends only; scheduling is a later feature on top.
- Migrating a retailer's **existing personal WhatsApp** number into the WABA (Meta supports it, but it deletes the number from the consumer app — too sharp an edge for self-serve; document it as a manual, support-assisted path).
