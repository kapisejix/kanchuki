# Support Session Access — Kanchuki sales/tech acting inside a retailer account

**Status: 🔴 Planned, not approved.** Auth-boundary change — needs human review (SECURITY.md §12–18) before any code.
**Builds on:** F-019/F-020 catalog delegate token (`docs/tasks/done/staff-assisted-catalog-upload.md`).

## Problem

Kanchuki staff can only enter a retailer account through the paid, ticket-scoped
catalog-upload delegate token. That token reaches `/v1/products`,
`/v1/catalog-import`, `GET /v1/categories`, `GET /v1/size-charts` only
(`CATALOG_DELEGATE_ALLOWED_ROUTES`, `apps/api/src/plugins/auth.ts`). There is no
sanctioned way to demo the app, run growth work (campaigns, promotions, social
posts) or fix/maintain a live account in-store.

## Non-goals

- No shared retailer OTP/password. No raw "log in as retailer" without consent.
- No access to billing, payout accounts, referral money, team management, account deletion.
- No change to the existing catalog-upload session — it stays as is.

## Design (extend the existing delegate-token pattern)

1. **New ticket types** on `SupportTicket`: `DEMO`, `GROWTH_SETUP`, `MAINTENANCE`
   (alongside `CATALOG_UPLOAD`). Free by default; price optional via the same quote field.
2. **Retailer consent per session.** Staff taps "Start support session" →
   retailer receives a one-time approval (OTP to the retailer's registered phone,
   MSG91, or in-app approve prompt). No consent → no token.
3. **Scoped, short-lived token.** Reuse `signCatalogUploadToken` shape:
   `{ retailer_id, ticket_id, team_member_id, scope }`. `scope` ∈
   `demo | growth | maintenance`; TTL ≤ 24 h (catalog stays 8 h).
4. **Allowlist per scope** (new `SUPPORT_SCOPE_ROUTES`, deny by default):

   | Scope | Allowed |
   |---|---|
   | `demo` | read-only GET on products, collections, customers (masked phone), analytics |
   | `growth` | campaigns, promotions, social composer/accounts (no connect/disconnect), collections, product edit |
   | `maintenance` | profile/GST/WhatsApp-config read + edit, product/photo fixes, category/size-chart |
   | never | billing, subscription, payout/referral, team-members, delete/suspend, OTP, export |

5. **Re-verify every request** (as today): ticket still `ASSIGNED` to the same
   team member, consent grant not revoked/expired. Reassign/close/revoke → dies at once.
6. **Visible banner** on every screen: "Support session — {staff name} — {scope}"
   with End Session (extend `CatalogDelegateBanner`). Retailer's own device also
   shows an "Active support session" row in Settings with a **Revoke** button.
7. **Audit.** Every mutating request → `AuditLog` with `actor_type: 'support_delegate'`,
   `ticket_id`, `team_member_id`, `scope`. Session start/end/consent/revoke are
   their own audit events. Admin → Support Sessions page lists them.
8. **Admin kill switch.** Super admin can end any session; feature flag
   `SUPPORT_SESSIONS` (default OFF, server-side enforced) like `VIRTUAL_TRY_ON_V2`.
9. **PII.** `demo` scope masks customer phone/name; no photo/PII export under any scope.

## Build slices

| # | Slice | Files (expected) |
|---|-------|------------------|
| 1 | Schema: ticket types + `SupportSessionGrant` (consent, scope, expires_at, revoked_at) | `packages/db/prisma`, DATABASE.md, **migration applied by owner only** |
| 2 | Consent: request/approve endpoints + OTP | `routes/team.ts`, `routes/retailers/*` |
| 3 | Token + scoped allowlist + per-request re-verify | `plugins/team-auth.ts`, `plugins/auth.ts` |
| 4 | Audit hook (`support_delegate`) | same hook as `catalog_delegate` |
| 5 | Mobile: staff start flow, banner, retailer Revoke row | `app/staff/*`, `CatalogDelegateBanner.tsx`, `settings/*` |
| 6 | Admin: sessions list + kill switch + flag | `apps/web` admin |

## Tests required

- Token for scope `demo` cannot POST/PATCH anything; `growth` cannot hit billing/team/delete.
- No consent / revoked / expired grant → 403 even with a valid JWT.
- Ticket reassigned → next request 403.
- `isRealOwner()` is false for support tokens (no owner-only route reachable).
- Run `npx vitest run src/routes/security.test.ts` and the admin login suite.

## Decisions (owner, 2026-10-14)

1. **Consent:** owner unsure — keep consent, lightest form (see "Why consent" below). Final channel still open.
2. **Data:** real retailer account, no seeded demo data. Drop the "demo against a seeded retailer" idea; `demo` scope runs on real data read-only.
3. **Who/price:** managers only may start sessions (not all staff). Ticket can be paid, trial/included, or free — set per ticket via the existing quote field (`quoted_price_inr` >= 0).
4. **TTL:** 24 h maximum (was 4 h). Still hard-expires, ticket-bound, revocable. Catalog-upload sessions stay 8 h.

## Why consent

A session can edit a retailer's live customers, campaigns and WhatsApp/GST settings.
Without a retailer approval step, a staff phone + a ticket is enough to act as them:
- Legal: customer phone numbers are personal data (DPDP Act); the retailer is the
  data fiduciary and must know who accessed it.
- Trust/abuse: an insider or a stolen staff login could otherwise alter any retailer.
- Dispute: "I never asked for that campaign" is answerable only with a recorded grant.
Lighter option if one-tap-per-session is too much friction: a single standing opt-in
at onboarding ("Allow Kanchuki support to access my account when I raise a ticket"),
with per-session notification + Revoke instead of per-session OTP.

5. **Consent channel (2026-10-15):** in-app approve. Staff requests → retailer's app shows an Approve/Deny prompt → grant row written. No OTP/SMS. Retailer Settings row has Revoke.
6. **Extension (2026-10-15):** none. 24 h hard cap; staff starts a new session, which needs a fresh approval and its own grant row.

## Still open

- None. Slices 1–6 ready to build (migration applied by owner only).

---

# Part 2 — Retailer staff permission matrix (retailer's own team)

**Separate from Kanchuki-staff sessions above.** Retailer staff are added by the
owner via invite link, so **no consent step** applies. Today's allowlist:
`MANAGER_ALLOWED_ROUTES` / `SALESPERSON_ALLOWED_ROUTES` in
`apps/api/src/plugins/auth.ts` (deny by default; owner-only unless listed).

Decided 2026-10-14 (owner):

| Area | Manager | Salesperson |
|---|---|---|
| Products, collections, categories, size charts | full (add/edit/delete) | view only |
| Add customer | yes | yes |
| Customer list / detail | **masked phone only** | no |
| Send collection / product on WhatsApp | yes, number never shown | yes, number never shown |
| Campaigns, promotions | create + manage | no |
| Social: post + track | yes (no connect/disconnect) | no |
| Analytics | read | no |
| Settings, billing, KYC, staff mgmt, WhatsApp API config, delete account | **never** | **never** |

## Gap vs today

Manager today = products, categories, collections, size-charts, `POST /v1/customers`,
`GET /v1/retailers/me`, `POST /v1/retailers/me/qr-slug`. Missing for the matrix:
campaigns, promotions, social (post/read), analytics-read, WhatsApp send, masked
customer list. Salesperson today lacks only WhatsApp send.

## Build slices

| # | Slice | Notes |
|---|-------|-------|
| 1 | Add manager routes: campaigns, promotions, social post/read, analytics GET | allowlist entries; deny connect/disconnect/delete |
| 2 | Add salesperson route: WhatsApp collection/product send | server resolves real number internally |
| 3 | **Phone masking for staff roles** on customer list/detail/send responses (`98•••••210`) | server-side field masking — allowlist alone does not hide fields; reuse `maskPhone` shape in `lib/staff-invite.ts` |
| 4 | Mobile: hide Settings/billing/staff entries for staff roles | UI mirrors API; API stays the enforcement |
| 5 | Tests: one per newly allowed route + a "still 403" test per owner-only surface; run `security.test.ts` | |

## Open

- Does manager "customer list" mean list-with-masked-phone or no list at all? (matrix assumes masked list.)
- WhatsApp send path: manual wa.me share (client-side, needs the number on device) vs
  server-side send (number stays server-side). Masking is only real with server-side send.
