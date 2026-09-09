# Tokenized Invite System for Retailer Staff

**Date:** 2026-09-09
**Status:** 🔴 Planned (spec only — nothing built)
**Owner ask:** _"I want a tokenized invite system for retailer staff so everything is fine and the picture is clear."_
**Supersedes:** `docs/tasks/team-member-access-control.md` §FR-6 (the client-only "copy this text" stopgap, shipped as FR-6.1 in `dab79651`). Everything else in that doc (role picker, `staffCan`, routing, lifecycle) still stands — this doc only replaces the *invite* piece.

---

## 1. Why

Today a retailer adds a team member with **name + phone only** (`POST /v1/staff` → a `staff` row). No invite is sent. The retailer has to tell them out-of-band "open the app, log in with your phone."

When that team member opens the **one** login screen (`auth/phone` → `auth/otp`) and the server can't match their phone to a `staff` row — because the phone was mistyped, they were never added, or they were deactivated — `POST /v1/auth/otp/verify` falls through to `retailer.upsert` and creates a **brand-new blank retailer**, then the app routes them to `/onboarding`. A person who was told "you're on the team" silently becomes a junk retailer trial account.

The server genuinely can't tell "new retailer signing up" from "team member whose invite failed" — both are just an unknown phone doing OTP. A token carried from the invite link removes the ambiguity.

---

## 2. Core design decisions (locked)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **The token never authenticates.** Login is always phone + OTP. | The SIM stays the real auth factor. A leaked link can't get anyone in. |
| D2 | **The token is single-use and onboarding-only.** It exists only to carry state from "opened the invite link" to "passed OTP the first time." | After the first successful login, `staff.auth_user_id` is set and every future login is pure phone + OTP, routed correctly by the existing `auth.ts` logic. The token is irrelevant post-join. |
| D3 | **OTP must succeed on the phone stored in the `staff` row**, not any phone the link-opener types. | Otherwise a forwarded link = anyone joins as that member. |
| D4 | **Delivery stays retailer-shares-the-link.** No server-sent SMS/WhatsApp in v1. | Same constraint as FR-6.1 — per-message cost + TRAI DLT registration. Server-send is a later phase (§10). |
| D5 | **One live invite per `staff` row.** Resend = replace the token on the same row. | `staff_invites.staff_id` is unique. Keeps the model trivial. |
| D6 | **Custom scheme `kanchuki://join?token=…` for v1**, with an `https://kanchuki.app/join?token=…` web fallback page for the no-app case. | Universal links / associated domains aren't configured (`app.json` has only `"scheme": "kanchuki"`). Adding them is a nice-to-have (§10). |

---

## 3. End-to-end flow

### 3.1 Retailer adds a member

1. Settings → Team Members → Add. Enters **name, phone, role** (Manager / Salesperson — already built, `dab79651` FR-1).
2. `POST /v1/staff` creates the `staff` row **and** a `staff_invites` row: `status: pending`, random token, `expires_at = now + 7 days`.
3. Response includes `invite: { url, expires_at }` (raw token only in `url`, never stored raw).
4. The existing `InvitePromptModal` (`apps/mobile/app/settings/staff.tsx`) shows a **copy / share** sheet with the message:
   > *"{name}, you've been added to {shop} as {role}. Tap to join: {url}"*
   Retailer sends it however they want (WhatsApp, SMS, in person). Still no SMS from us.

### 3.2 Member opens the link

1. Link is `kanchuki://join?token=<raw>` (or `https://kanchuki.app/join?token=<raw>`).
   - **App installed** → deep link opens `app/join.tsx`.
   - **App not installed** → the web `/join` page shows "Install Kanchuki" + the shop/role summary; after install, the link is re-opened.
2. `app/join.tsx` (reachable while logged out) calls **`GET /v1/public/staff-invite/:token`** → `{ shop_name, member_name, role, phone_masked, status }`.
   - `status: pending` → screen: *"Join **{shop_name}** as **{role}**. We'll send an OTP to {phone_masked}."* → **Continue**.
   - `status: used` → *"You've already joined. Just log in with your phone."* → go to `auth/phone`.
   - `status: expired` / `revoked` / not found → *"This invite link is no longer valid. Ask the store owner to send a new one."* → dead end (no onboarding).
3. **Continue** → call **`POST /v1/public/staff-invite/:token/otp`** (server sends the OTP to the invite's bound phone — the number never crosses the wire to the client), then navigate to `auth/otp` with `invite_token` as a route param.

### 3.3 Member verifies OTP

1. `auth/otp.tsx` runs the normal MSG91 / OTP flow, and passes `invite_token` into `authApi.verifyOtp` / `authApi.verifyMsg91`.
2. `POST /v1/auth/otp/verify` — `OtpVerifySchema` gains an optional `invite_token`:
   - OTP verified → Supabase session minted (unchanged).
   - `invite_token` present → resolve `staff_invites` by `token_hash`:
     - not found / `status != pending` / expired → **400 `INVITE_INVALID`** (do **not** fall through to `retailer.upsert`).
     - found → load the bound `staff` row. Require **`normalizeIndianPhone(phone) === staff.phone`** and `staff.is_active` and `staff.retailer.deleted_at == null`. Mismatch → **400 `INVITE_PHONE_MISMATCH`**.
     - all good → set `staff.auth_user_id = user.id`, mark invite `status: used`, `accepted_at = now`. Return the **existing staff payload** (`is_staff: true, staff: {…}`).
   - `invite_token` absent → **exactly today's behavior** (retailer → staff-by-phone → team-member-by-phone → new retailer). No regression.
3. `completeLogin` (`auth/otp.tsx`) already handles `result.staff` → stores `staff_role` / `staff_kind='shop'` / `staff_retailer_id` → `isShopStaff` → routed into the retailer `(tabs)`, role-scoped by `staffCan()`. **No client routing change needed.**

### 3.4 Every login after the first

The `staff` row now has `auth_user_id` set and `is_active: true`. `POST /v1/auth/otp/verify` (no token) → `if (!pending)` → `staff.findFirst({ phone, is_active: true, retailer.deleted_at: null })` matches → returns the staff payload → routed to the retailer app. **Never onboarding.** The token is done forever.

---

## 4. Data model — migration `099_staff_invites`

```prisma
model StaffInvite {
  id            String    @id @default(cuid())
  staff_id      String    @unique          // one live invite per staff row (D5)
  retailer_id   String                     // denormalised — purge + tenant scoping
  token_hash    String    @unique          // sha256(raw token); raw is never stored
  role_snapshot String                     // role at invite time (audit only; staff.role is source of truth)
  status        String    @default("pending") // pending | used | expired | revoked
  expires_at    DateTime
  accepted_at   DateTime?
  created_at    DateTime  @default(now())
  updated_at    DateTime  @updatedAt

  staff    Staff    @relation(fields: [staff_id], references: [id], onDelete: Cascade)
  retailer Retailer @relation(fields: [retailer_id], references: [id], onDelete: Cascade)

  @@index([retailer_id])
  @@map("staff_invites")
}
```

- **RLS:** `ENABLE ROW LEVEL SECURITY` with **zero policies** (default-deny for anon/authenticated) — the API service-role key is the only reader/writer, same pattern as `staff` / `support_tickets`.
- **No F-017 hard-delete trigger.** Invites carry no legal-retention value; the main `kanchuki_app` role keeps `DELETE` on this table (unlike `staff`). `prisma.staffInvite.delete*` works directly — no `getPurgePrisma()` dance.
- **Backfill in the migration:** for every `staff` row where `is_active = true AND auth_user_id IS NULL`, insert a `pending` invite (`expires_at = now + 7 days`, fresh token hash). Existing un-logged-in members get a usable invite record on day one. *The migration can't hand the raw tokens to anyone — the retailer must hit "Resend" to get a shareable link for a backfilled invite. Acceptable; the alternative is emailing tokens around.*

### 4.1 Purge

Add to `apps/api/src/jobs/purge-retailer-now.ts`, **before** the existing `DELETE FROM staff WHERE retailer_id = $1` (FK order):

```sql
DELETE FROM staff_invites WHERE retailer_id = $1;
```

`ON DELETE CASCADE` on both FKs makes this belt-and-suspenders, but the purge job is explicit about every table by convention — keep it explicit.

### 4.2 Retailer account deletion recap

| Stage | Effect on invites |
|---|---|
| Soft delete (`Retailer.deleted_at` set) | Invite rows stay. `GET /v1/public/staff-invite/:token` returns `revoked` (join screen checks `staff.retailer.deleted_at`). Any staff login is already blocked with `ACCOUNT_DELETED`. |
| Purge (`purge-retailer-now.ts`, cron after grace or admin-triggered) | `DELETE FROM staff_invites …` then `DELETE FROM staff …` — token hash, role snapshot, everything gone. The member's orphaned Supabase auth user is harmless (next login → treated as a new retailer). |

---

## 5. API surface

### 5.1 `POST /v1/staff` (extend)

On successful create, in the same transaction:
- generate `raw = randomBytes(32).toString('base64url')`, `token_hash = sha256(raw)`.
- insert `staff_invites` (`status: pending`, `expires_at = now + STAFF_INVITE_TTL_DAYS`, `role_snapshot = role`).
- response body gains:
  ```json
  "invite": {
    "url": "https://kanchuki.app/join?token=<raw>",
    "expires_at": "2026-09-16T00:00:00.000Z"
  }
  ```
- **Reactivation path** (`dab79651` FR-4.3 — adding a phone that has a deactivated `staff` row): also refresh/replace the invite row (`status: pending`, new token, new expiry) if the member never linked an `auth_user_id`. If they had already joined once (`auth_user_id` set), no invite needed — skip.

### 5.2 `POST /v1/staff/:id/invite/resend`

- Owner-only (not on the `staffCanAccess` allowlist).
- `staff` row must belong to `request.retailerId`, be `is_active`, and have `auth_user_id IS NULL` (already-joined members don't get re-invited — they just log in). Otherwise **409 `ALREADY_JOINED`**.
- Replace the token on the existing `staff_invites` row (`staff_id` is unique): new `token_hash`, `status: pending`, `expires_at = now + TTL`, `accepted_at = null`.
- Response: `{ invite: { url, expires_at } }`.
- Audit log: `action: 'staff_invite_resend'`.

### 5.3 `GET /v1/public/staff-invite/:token`

- **Unauthenticated** (add `/v1/public/staff-invite` to the `authPlugin` skip list, like the other `/v1/public/*` routes).
- Rate-limited (per-IP, e.g. 20/min) — it's a token-guessing surface.
- Look up by `token_hash = sha256(param)`. Compute derived status: `revoked` if `staff.is_active == false` or `staff.retailer.deleted_at != null`; `expired` if `status == 'pending' && expires_at < now`; else the stored `status`.
- Response (no token echoed, phone masked):
  ```json
  {
    "data": {
      "shop_name": "Radha Clothing Store",
      "member_name": "Ramesh",
      "role": "salesperson",
      "phone_masked": "•••••• 3210",
      "status": "pending"
    }
  }
  ```
- 404 for unknown hash (indistinguishable from expired — don't leak existence).

### 5.4 `POST /v1/public/staff-invite/:token/otp`

- **Unauthenticated**, rate-limited (per-IP + per-token, e.g. 3/min).
- Resolve the invite by `token_hash`. If not `pending` / expired / `staff` inactive / retailer deleted → **400 `INVITE_INVALID`**.
- Send the OTP to `staff.phone` via the existing `sendOtpViaMsg91(staff.phone, 'login')` path. The client never learns the number.
- Response: `{ data: { sent_to: "•••••• 3210" } }`.

### 5.5 `POST /v1/auth/otp/verify` (extend)

`OtpVerifySchema` gains:
```ts
invite_token: z.string().min(20).optional(),
```

After OTP verification and Supabase session minting, **before** the `if (!pending)` staff/team block:

```
if (invite_token) {
  const inv = await prisma.staffInvite.findUnique({
    where: { token_hash: sha256(invite_token) },
    include: { staff: { include: { retailer: { select: { deleted_at, shop_name, city } } } } },
  });
  if (!inv || inv.status !== 'pending' || inv.expires_at < now)  → 400 INVITE_INVALID
  if (!inv.staff.is_active || inv.staff.retailer.deleted_at)      → 400 INVITE_INVALID
  if (inv.staff.phone !== phone)                                  → 400 INVITE_PHONE_MISMATCH
  await tx([
    staff.update({ where: { id: inv.staff_id }, data: { auth_user_id: user.id } }),
    staffInvite.update({ where: { id: inv.id }, data: { status: 'used', accepted_at: now } }),
  ]);
  return staffPayload(inv.staff);   // same shape as the existing staff branch
}
```

`invite_token` **absent** → unchanged. This is the only edit to the hot auth path and it is fully additive.

### 5.6 Deactivate / delete a member (existing routes, one addition)

- `DELETE /v1/staff/:id` (soft, `is_active: false`) and `?purge=true` (hard) — both already exist (`dab79651`). Add: set any `pending` invite for that `staff_id` to `status: revoked` (soft) — the hard path cascade-deletes it.
- `PUT /v1/staff/:id` role change — **do not** invalidate the invite. Role is read live from `staff.role` at every request; `role_snapshot` is audit-only.

---

## 6. Mobile

### 6.1 New route `app/join.tsx`

- Registered in `app/_layout.tsx` inside the **`guard={!isAuthed}`** block (alongside `auth/phone`, `auth/otp`) — an invite is opened by someone not yet logged in. If a logged-in user opens it, bounce to their normal home (or show "you're already signed in as …").
- Reads `token` from the deep-link params. Calls `GET /v1/public/staff-invite/:token`. Renders per §3.2.
- **Continue** → `POST /v1/public/staff-invite/:token/otp`, then `router.replace({ pathname: '/auth/otp', params: { invite_token: token } })`. No phone is passed to the client at any point — the server owns it.

### 6.2 `app/auth/otp.tsx`

- Accept an `invite_token` param. When present:
  - the "resend" action calls `POST /v1/public/staff-invite/:token/otp` instead of `/v1/auth/otp/send`.
  - `handleVerify` passes `invite_token` into `authApi.verifyOtp` / `authApi.verifyMsg91`.
  - the "sent to +91 ****NNNN" line uses the masked value from the `GET …/:token` response (carry it via param or re-fetch).
- `completeLogin` unchanged — `result.staff` path already does the right thing.
- On `INVITE_INVALID` / `INVITE_PHONE_MISMATCH` from verify: show the message and route back to a dead-end (not onboarding, not phone entry).

### 6.3 `app/settings/staff.tsx`

- `InvitePromptModal`: swap `buildStaffInviteMessage` output for the tokenized link message (`{name}, you've been added to {shop} as {role}. Tap to join: {url}`). `url` + `expires_at` come from the `POST /v1/staff` response.
- Active-member rows: show an **invite status chip** for members with `auth_user_id == null`:
  - `Invite sent · expires {date}` (pending)
  - `Invite expired` (pending + past expiry) → **Resend** button → `POST /v1/staff/:id/invite/resend` → re-open `InvitePromptModal` with the new link.
  - Members who have logged in (`auth_user_id != null`) show nothing / "Active".
- `staffApi` (`apps/mobile/src/lib/api/staff.ts`): add `resendInvite(id)`.

### 6.4 `apps/mobile/src/lib/staff-invite.ts`

- Replace `buildStaffInviteMessage(name, phone, shopName)` with `buildStaffInviteMessage(name, role, shopName, url)` — the phone is no longer the payload, the link is. Keep it as the single source of the copy for screen + test.

---

## 7. Web `/join` page (`apps/web/src/app/join/page.tsx`)

- New route. Reads `?token=`. Server-fetches `GET /v1/public/staff-invite/:token`.
- `pending` → "**{member_name}**, you've been added to **{shop_name}** as **{role}**." + big **Open in Kanchuki app** button (`kanchuki://join?token=…`) + App Store / Play Store badges for the no-app case.
- `used` → "You've already joined — open the app and log in with your phone."
- `expired` / `revoked` / 404 → "This invite link is no longer valid."
- No OTP flow on web — the web page only bridges to the app. (Retailers who genuinely need web staff access are out of scope; staff are a mobile-app surface.)

---

## 8. Edge cases

| Situation | Handling |
|---|---|
| Member never opens the link, 7 days pass | Invite lazily reads as `expired`. Retailer sees "Invite expired · Resend" on the member row. |
| Member opens the link after already joining once | `GET …/:token` → `status: used` → join screen: "already joined, log in with your phone" → `auth/phone`. |
| Link forwarded to a stranger | Stranger sees shop/role/masked phone, can trigger an OTP **to the member's number** (can't read it), can't verify. No access. Token ≠ auth (D1/D3). |
| Retailer typo'd the member's phone | Join screen shows the masked phone on file. If wrong, member tells the retailer → retailer edits via `PUT /v1/staff/:id` (blocked from creating a dupe by `@@unique([retailer_id, phone])` from migration 098) → **Resend**. We deliberately do **not** let an arbitrary phone claim an invite (that's the forwarded-link hole). |
| Same phone is staff for two different retailers | `@@unique([retailer_id, phone])` permits it. Each retailer's invite is separate. On a tokenless login, `auth.ts` `staff.findFirst` returns the first active match — pre-existing ambiguity, **out of scope** (documented, not fixed here). With a token, the correct retailer's row is chosen unambiguously. |
| Phone is already a live retailer account | `POST /v1/staff` already rejects this (`staff.ts`). No invite is ever created for such a phone. |
| Member deactivated while invite still `pending` | Invite → `revoked` on the deactivate path; `GET …/:token` also derives `revoked` from `staff.is_active`. |
| Retailer account soft-deleted | `GET …/:token` derives `revoked` from `staff.retailer.deleted_at`. OTP verify with the token → `INVITE_INVALID`. |
| Token brute-force | `token_hash` is sha256 of 32 random bytes; `GET …/:token` and the OTP-send route are rate-limited and return an identical 404 for unknown vs expired. |

---

## 9. Non-goals (v1)

- **Server-sent SMS/WhatsApp invites.** Delivery stays "retailer shares the link." (§10 phase 3.)
- **Universal links / Android App Links** (associated-domains verification). Custom `kanchuki://` scheme + web `/join` bridge is enough for v1.
- **Per-feature / granular permissions.** The 2-tier Manager/Salesperson model (`team-member-access-control.md`) is unchanged.
- **Staff editing their own profile.** The retailer owns the `staff` row.
- **Multi-retailer disambiguation on tokenless login** (the "same phone, two shops" corner) — noted, not solved here.
- **The onboarding fork** ("Setting up your own store?" vs "I was added to a team") from the `team-member-access-control.md` discussion — with invites the primary path is clean, so this becomes an optional low-priority fallback for people who were told they're staff but have no link. Not part of this scope.

---

## 10. Phasing

| Phase | Scope | Blocks |
|---|---|---|
| **1 — Core** | Migration `099` (+ backfill), `POST /v1/staff` creates invite, `GET /v1/public/staff-invite/:token`, `POST /v1/public/staff-invite/:token/otp`, `invite_token` on `/v1/auth/otp/verify`, `app/join.tsx`, `auth/otp` token pass-through, tokenized share message, purge-job line. | — |
| **2 — Lifecycle UI** | `POST /v1/staff/:id/invite/resend`, invite-status chips + Resend in `settings/staff.tsx`, web `/join` page. | Phase 1 |
| **3 — Later** | Server-sent invite via MSG91 (needs a DLT-registered template + per-message cost sign-off), universal links / App Links, the optional onboarding fork. | Launch + DLT |

---

## 11. Files touched

| Area | File |
|---|---|
| Schema + migration | `packages/db/prisma/schema.prisma`, `packages/db/prisma/migrations/099_staff_invites/migration.sql` |
| Staff routes | `apps/api/src/routes/staff.ts` (create → +invite, resend, revoke-on-deactivate) |
| Public invite route | `apps/api/src/routes/**` (new `staff-invite.ts` under a public group) + `authPlugin` skip-list entry |
| OTP verify | `apps/api/src/routes/auth.ts` (`OtpVerifySchema` + invite branch) |
| Purge | `apps/api/src/jobs/purge-retailer-now.ts` (+1 DELETE line) |
| Invite token util | `apps/api/src/lib/**` (new — `randomBytes` + `sha256` helpers, TTL constant `STAFF_INVITE_TTL_DAYS`) |
| Mobile join screen | `apps/mobile/app/join.tsx` (new), `apps/mobile/app/_layout.tsx` (register in `!isAuthed` block) |
| Mobile OTP | `apps/mobile/app/auth/otp.tsx` (`invite_token` param → send + verify) |
| Mobile staff screen | `apps/mobile/app/settings/staff.tsx` (status chips, Resend), `apps/mobile/src/lib/api/staff.ts` (`resendInvite`), `apps/mobile/src/lib/staff-invite.ts` (message shape) |
| Web | `apps/web/src/app/join/page.tsx` (new) |
| Tests | `apps/api/src/routes/staff.test.ts` (+invite on create, resend), new `staff-invite.test.ts` (public read shape/masking/rate-limit, expiry/revoke), `apps/api/src/routes/auth-*.test.ts` (verify with valid/expired/revoked/used token, phone mismatch), `apps/mobile/__tests__/**` (`join.tsx` render + token pass-through), `apps/mobile/src/lib/staff-invite.test.ts` (message) |

---

## 12. Acceptance criteria

- Adding a member returns a working `invite.url`; opening it in the app shows "Join {shop} as {role}" and the masked bound phone.
- Completing OTP with a valid `invite_token` links `staff.auth_user_id`, marks the invite `used`, lands the member in the retailer `(tabs)` scoped to their role — **never** `/onboarding`, **never** a new retailer row.
- A second login (no token) with the same phone lands the member in the same place via the existing phone-match path.
- An expired / revoked / already-used / unknown token shows a clear dead-end message and creates **no** account.
- OTP on a phone other than the invite's bound phone is rejected (`INVITE_PHONE_MISMATCH`).
- `invite_token` omitted → `/v1/auth/otp/verify` behaves exactly as before (regression-tested).
- Retailer purge removes every `staff_invites` row for that retailer.
- `GET /v1/public/staff-invite/:token` never returns the raw token or the unmasked phone, and is rate-limited.
