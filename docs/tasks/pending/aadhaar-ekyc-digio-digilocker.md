# Aadhaar eKYC (mandatory) — vendor-neutral, replaces manual Aadhar upload

**Status (2026-10-16): 🔴 Planned, not approved.** Spec only; nothing built. Touches PII and the KYC trust boundary — needs human review (SECURITY.md §12–18) and a DPDP consent review before build.
**Extends:** F-009 KYC (`docs/PRO-REQUIREMENTS.md` §F-009 item 6). F-number: assign on approval.
**File name note:** kept as `aadhaar-ekyc-digio-digilocker.md` for link stability; the design is now vendor-neutral (Digio and DigiLocker are one candidate, not the plan).

## Decision (owner, 2026-10-16)

- **Aadhaar verification is compulsory** for a retailer to become KYC `VERIFIED`. No Aadhaar → no `VERIFIED`.
- **GSTIN and PAN verification are deferred** ("later if required"). v1 builds the provider seam so they can be added without touching routes or mobile, but ships no GST/PAN API call.
- The vendor is **not chosen yet**. The system is built against a provider interface; the vendor is swapped by config + one adapter file.

## Problem

Today a retailer verifies identity by uploading three photos (GST certificate, Aadhar front, Aadhar back) from the gallery — `POST /retailers/me/kyc-upload-url` + `PATCH /retailers/me/kyc` (`apps/api/src/routes/retailers/retailers-uploads.ts`), mobile `KycModal` in `apps/mobile/app/settings/index.tsx`. Three problems:

1. **Friction + fraud.** Photos are unverified; anyone can upload any image.
2. **Sensitive data at rest.** Full Aadhaar images sit in R2 (`retailers/{id}/kyc/...`), the highest-risk PII the platform holds.
3. **KYC can never complete.** Status goes `NOT_SUBMITTED → PENDING` on the third upload, but **no code anywhere sets `VERIFIED` or `REJECTED`** (grep 2026-10-16: the only `kyc_status` writes are in `retailers-uploads.ts`; `admin-retailers-detail.ts` only reads). `kyc_reviewed_at` and `kyc_rejection_reason` are never written. Every submitted retailer is stuck at `PENDING`.

## Goal

Retailer taps **Verify Aadhaar**, completes the vendor's consent-based flow (DigiLocker, UIDAI app OTP/QR, or offline XML — whichever the chosen vendor offers), and returns to the app already `VERIFIED`. No Aadhaar photo is uploaded or stored.

## Non-goals

- No direct UIDAI AUA/KUA integration (not available to a general private SaaS).
- No direct DigiLocker "requester" registration (NeGD committee + CEO approval, audit, no published timeline) — revisit only at scale.
- No Aadhaar-based login; Aadhaar is never a unique key.
- No GSTIN / PAN verification and no face match in v1 (seam only — see "Deferred checks").
- GST certificate upload stays as-is, optional, and is **not** part of the `VERIFIED` decision.

## Vendor selection (task 0 — blocks build)

Candidates and what is known (public pages, 2026-10-16):

| Vendor | Flow | Public price |
|---|---|---|
| Message Central eKYCNow | Aadhaar + PAN, face match, AML; says DigiLocker integrated | ₹10 Basic / ₹18 Premium per successful verification, 4 free checks; confirm minimums and setup fee |
| Setu — Aadhaar app verification | User verifies in UIDAI's app (OTP or QR), optional FaceAuth | Not published, sales |
| Digio (DigiKYC / DigiLocker) | Template-driven request, hosted DigiLocker page | Not published, sales |

Ask every vendor the same questions and record the answers in this file before choosing:

1. Price per **successful** verification; any minimum commitment, setup fee, or expiry on prepaid credits.
2. Sandbox available without a contract?
3. Which flow (DigiLocker / UIDAI app / offline XML) and what does the user actually see?
4. Webhook: event names, signature scheme, retry policy. Or is polling required?
5. Exactly which fields come back (name, DOB, gender, address, photo, last-4)? Can we request **name + last-4 only**?
6. Data retention on the vendor side and DPDP processor terms (DPA).
7. Uptime/SLA and support channel.

Selection rule: cheapest vendor that (a) returns name + last-4 without us touching the Aadhaar number, (b) signs its webhooks, (c) signs a DPA.

## Design

### Provider seam (the vendor-neutral part)

`apps/api/src/lib/kyc-provider/` with one interface and one adapter per vendor:

```ts
interface KycProvider {
  /** Begin an Aadhaar verification; returns where to send the user. */
  startAadhaar(input: { retailerId: string; phone: string; returnUrl: string }):
    Promise<{ providerRequestId: string; redirectUrl: string }>;
  /** Verify + parse an inbound webhook. Throws on bad signature. */
  parseWebhook(rawBody: string, headers: Record<string, string>):
    Promise<{ providerRequestId: string; outcome: 'COMPLETED' | 'FAILED' | 'EXPIRED';
              verified?: { name: string; aadhaarLast4: string }; failureReason?: string }>;
  /** Server-side status fetch, used when a webhook is late or missing. */
  fetchStatus(providerRequestId: string): Promise<ReturnType<KycProvider['parseWebhook']>>;
}
```

- Selected by `getSecret('KYC_PROVIDER')` (`digio | setu | messagecentral | …`). A `fake` provider ships for tests and local dev.
- The adapter is the **only** place that knows vendor URLs, auth, payload shape, and signature scheme. Routes, DB columns, admin UI and mobile see only the interface.
- Vendor errors are mapped to `AppError('KYC_PROVIDER_ERROR', <readable message>, 502)` (same pattern as the fixed `razorpay()` helper) so the app shows the real reason, never the generic "Something went wrong".
- Adapters use a 20 s `AbortSignal.timeout` and log the vendor response body (never the Aadhaar payload) on failure.

### Flow

```
Mobile                    API                         Vendor
  | POST /kyc/aadhaar/start (consent=true)
  |-------------------------->| provider.startAadhaar()
  |                           |---------------------------->|
  |<-- {redirect_url} --------|<---------------------------|
  | open url (in-app browser) ----------------------------->| user verifies (vendor flow)
  |<---- deep link back to app -----------------------------|
  | poll GET /kyc             |<---- webhook (signed) ------| completed / failed
  |                           | parseWebhook, store masked data, set status
  |<-- {kyc_status: VERIFIED} |
```

1. **Start** — `POST /v1/retailers/me/kyc/aadhaar/start`, body `{ consent: true }` (reject unless `true`; store `kyc_consent_at`). Owner-only: not reachable by staff or support-delegate tokens (deny-by-default allowlists in `plugins/auth.ts`; assert in auth tests). Stores `kyc_provider` + `kyc_provider_request_id`. Rate limit 5 starts per retailer per day.
2. **Return** — deep link built by the shared app-identity module (RC-041: one module builds every deep link). Screen polls `GET /v1/retailers/me/kyc` every 3 s for up to 60 s; on timeout calls `fetchStatus` once server-side, then shows "Still verifying — we'll update you".
3. **Webhook** — `POST /v1/webhooks/kyc/:provider`. Same shape as `billing-webhook.ts`: `captureRawBody` preParsing hook, provider-specific signature check inside `parseWebhook`, constant-time compare, **idempotent** (at-least-once), unknown request id → 200 + warn. The browser redirect is never trusted; only a verified webhook or server-side `fetchStatus` can set `VERIFIED`.
4. **Decide** — on `COMPLETED`, compute name similarity vs `retailer.owner_name`; match → `VERIFIED`; mismatch → attempt recorded as rejected with a reason and the retailer set to `PENDING` for admin follow-up (see Decisions #2). `FAILED`/`EXPIRED` → `REJECTED` with a plain-language reason the retailer can act on, and the retailer can retry.

### Data model (migration — dev writes, owner applies; CLAUDE.md policy)

Add to `Retailer`:

| Column | Type | Note |
|---|---|---|
| `kyc_method` | enum `MANUAL_UPLOAD \| AADHAAR_EKYC` | existing rows backfill `MANUAL_UPLOAD` |
| `kyc_provider` | text, nullable | adapter key at time of verification |
| `kyc_provider_request_id` | text, unique, nullable | |
| `kyc_aadhaar_last4` | char(4), nullable | **only** the last four digits |
| `kyc_verified_name` | text, nullable | name as returned by the vendor |
| `kyc_consent_at` | timestamptz, nullable | DPDP consent record |

`KycStatus` keeps its four values. A name-mismatch is `PENDING` with `kyc_method = AADHAAR_EKYC`; admin lists that combination. Do not `ADD VALUE` to `KycStatus` without checking whether another column shares the enum (RC-033 lesson), and never inside a transaction (see 127 header). Document in `docs/DATABASE.md`; new columns live on `retailers`, which already has RLS.

### Admin: close the dead-end that exists today

`PATCH /v1/admin/retailers/:id/kyc` `{ decision: 'VERIFIED' | 'REJECTED', reason? }` sets `kyc_status`, `kyc_reviewed_at`, `kyc_rejection_reason` and writes `AuditLog`. Super-admin and support-manager only — add it to the single access-boundary list (RC-034), not a new hand-written copy. Used for (a) name-mismatch cases and (b) legacy manual-upload retailers. Wire Verify / Reject controls into the KYC card in `apps/web/src/app/admin/retailers/[id]/page.tsx`. **This is needed even if the vendor work slips — ship it first.**

### Mobile

- `KycModal`: primary button **Verify Aadhaar** with a consent checkbox and one plain-language line on why. Show the result masked: "Verified · Aadhaar ••••1234".
- Remove the Aadhar front/back rows for new submissions; GST row stays optional. Retailers already `PENDING` via upload keep their rows until reviewed.
- `startAadhaarKyc()` / `getKyc()` in `apps/mobile/src/lib/api/retailer.ts`; `timeoutMs: 60_000` on start (external call — default 10 s caused RC-011 / RC-064).
- Show server 4xx/502 messages as-is.

### Privacy and compliance (same release)

- **Never store** the Aadhaar number, XML, photo, or share code. Store last-4 + name + status + provider request id + consent timestamp only. Do not log vendor payloads or attach them to Sentry events.
- Update `apps/web/src/app/privacy/page.tsx` (currently says Aadhaar card images are uploaded and stored, ~lines 76 / 175 / 203): add the chosen vendor as a sub-processor. Update `docs/SECURITY.md` KYC/photo retention text.
- **Delete existing Aadhaar images:** one-off job removes `kyc_aadhar_front_r2_key` / `kyc_aadhar_back_r2_key` objects from R2 and nulls the columns once a retailer is `VERIFIED` via eKYC. R2 deletes use the `kanchuki_purge` role (RC-049). `purge-soft-deleted.ts` already deletes these keys on retailer deletion — keep until the columns are dropped.
- Withdrawal: retailer can request removal; clears the new columns and resets to `NOT_SUBMITTED`. Admin can never read more than last-4.

### Config / secrets (human sets in Admin → Integrations; never via CLI or by an agent)

`KYC_PROVIDER` plus that vendor's own keys (e.g. `<VENDOR>_CLIENT_ID`, `<VENDOR>_CLIENT_SECRET`, `<VENDOR>_BASE_URL`, `<VENDOR>_WEBHOOK_SECRET`). Read with `getSecret()` like Razorpay. Feature flag `KYC_AADHAAR_EKYC` (default OFF, server-enforced, like `VIRTUAL_TRY_ON_V2`); when OFF the manual upload flow is unchanged.

### Deferred checks (GSTIN / PAN) — seam only

Extend the interface later with `verifyGstin(gstin)` and `verifyPan(pan, name)` returning `{ valid, legalName }`. Nothing in v1 calls them. When wanted: add a `kyc_gstin_verified_at` / `kyc_pan_verified_at` column pair, call from the same webhook-free request/response path, and keep Aadhaar as the gate. No route or mobile contract changes needed beyond new fields on `GET /retailers/me/kyc`.

## Tasks

0. **Vendor quotes + sandbox (owner):** answer the seven questions above for at least two vendors; pick one; record it here. *Blocks adapter work only — tasks 1, 2, 5 can start now.*
1. Migration (6 columns + enum) — written by dev, **applied by owner**.
2. `lib/kyc-provider/` interface + `fake` adapter + tests; provider selection via `getSecret`.
3. `POST /retailers/me/kyc/aadhaar/start`, `GET /retailers/me/kyc`, rate limit, consent check.
4. `POST /webhooks/kyc/:provider` (raw body, signature, idempotency, name match, status transition). Tests: bad signature → 401; duplicate delivery → no-op; unknown id → 200; failed → `REJECTED` with reason; late webhook after `fetchStatus` → no regression.
5. Admin `PATCH /admin/retailers/:id/kyc` + web card controls + access-boundary entry + audit log. *Ship first.*
6. First real vendor adapter (after task 0), sandbox-tested.
7. Mobile `KycModal` rework + deep-link return + polling + error surfacing.
8. Privacy page, SECURITY.md, DATABASE.md, PRO-REQUIREMENTS F-009; image-deletion job.
9. Regression: manual-upload path still works with the flag OFF; `retailers-uploads` tests green; staff and delegate tokens cannot reach the new routes.

## Test plan

- API unit tests per tasks 2–5; run `npx vitest run src/routes/security.test.ts` and the auth plugin tests after touching access lists.
- Sandbox end-to-end on a real device: happy path, user abandons the vendor flow, wrong OTP, name mismatch, webhook delayed >60 s, webhook replayed twice, vendor 5xx on start.
- After a verified run, confirm in DB and R2: only last-4 + name stored, no Aadhaar object in R2, nothing sensitive in API logs or Sentry.

## Cost and risk

- Per-verification cost is vendor-specific (lowest published: ₹10 per successful verification, Message Central Basic). **Kanchuki pays** (Decisions #3): add it to the pricing math. At 50 retailers that is small, but retries and re-verification of legacy retailers multiply it.
- Vendor outage blocks KYC; turning the flag OFF falls back to manual upload. The provider seam also makes a vendor swap a one-adapter change.
- Legal: confirm with counsel / the vendor that the consent flow plus last-4 retention satisfies Aadhaar Act and DPDP obligations for this use before launch.

## Decisions (owner, 2026-10-16)

1. **Gate.** Aadhaar eKYC through the vendor API takes ~1–2 minutes, so it is a normal onboarding step rather than a back-office wait. If the details match, the retailer is `VERIFIED` immediately. If they do not match, the retailer goes to `PENDING` and an admin contacts them to resolve it. *Assumption to confirm at build: the gate is "finish onboarding" (the step sits before "Done", like plan selection). If you want a softer gate — e.g. only payouts / referral money / paid plans — say so before task 7.*
2. **Name mismatch → rejected, then `PENDING`.** A name mismatch is recorded as a failed attempt with a plain-language reason (`kyc_rejection_reason`), and the retailer is left in `PENDING` for admin follow-up — not a dead end. They may retry (rate limit: 5 starts per day).
3. **Cost.** Kanchuki pays the per-verification fee. Add the vendor's per-successful-verification price to the pricing math (`docs/PRO-REQUIREMENTS.md` margin tables) and to the Admin cost views; budget a retry allowance (failed attempts that the vendor still bills).
4. **Re-verification.** Existing retailers already `PENDING` from the old photo upload are **re-verified via eKYC** — they get an in-app prompt and a banner on the KYC row; the old photos are deleted once they pass. Admin approve-from-photos is not used for them.
