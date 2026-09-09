# Retailer Team Members — How It Works Today + Functional Requirements

**Date:** 2026-09-09
**Status:** ✅ Built 2026-09-09 — FR-1 (role picker/edit, reject `owner`, capability summary), FR-2
(login/routing fix — `auth.ts` detection now runs before the OTP bypass short-circuit, shop Staff
routed to `(tabs)` instead of `app/staff/` or onboarding), FR-3 (shared `staffCan()` client mirror +
role-scoped tabs/home/settings), FR-4 (`@@unique([retailer_id, phone])` migration 098 + de-dupe,
reactivate-on-add, Removed section + Restore, `purge=true` DPDP hard-delete with audit), FR-5
(restated — already covered by the FR-1/FR-4 audit + seat-check work), FR-6.1 (client-side invite
prompt: copy/share sheet after a successful add, shop name from `GET /v1/retailers/me`; NO SMS per
the FR — helper + message copy pinned in `src/lib/staff-invite.ts`). Tests: API 933/933, mobile
69/69, web 122/122; typecheck + lint clean.
**Trigger:** Retailer "Team Members" screen only asks name + phone, no feature-access control; a
new team member's login lands on the onboarding screen instead of a limited dashboard; deleting a
team member appears to wipe them from the database.

---

## TL;DR

| Reported problem | Reality | Root cause |
|---|---|---|
| "No option to assign which app features a team member can access" | **Half-true.** A 2-tier permission model (`manager` / `salesperson`) exists and is **enforced server-side** (`staffCanAccess` allowlist in `apps/api/src/plugins/auth.ts`). But the mobile "Add Team Member" modal **hardcodes `role: 'salesperson'`** — the retailer can never pick. No finer-grained (per-feature) control exists. | UI never exposed the `role` field. |
| "Team member login goes to onboarding, not a limited dashboard" | Two separate bugs stack up. (a) With `OTP_TEST_BYPASS=1` (used for dummy-number testing), the staff-detection branch in `auth.ts` is **skipped entirely** → the staff phone is turned into a brand-new blank `Retailer` → app routes to `/onboarding`. (b) Even on the correct path, staff are routed to `app/staff/` — a screen built for Kanchuki's **internal** field agents (`/v1/team/*` endpoints), not the retailer's own catalog. There is **no shop-staff dashboard**. | Bypass short-circuit + missing client UI. |
| "Deleting a team member deletes them completely from the DB (phone + name)" | **Not on the normal path.** `DELETE /v1/staff/:id` is a **soft delete** (`is_active = false`); the row, name and phone stay. It only looks "gone" because the list filters `is_active`. A true hard-delete of `staff` rows happens **only** when the whole *retailer* account is purged (`apps/api/src/jobs/purge-retailer-now.ts`). If bug (a) above turned the phone into a `Retailer`, then "deleting" that account *does* hard-delete via the retailer purge path. | List hides inactive rows; no restore/hard-erase UI; compounds with bug (a). |

---

## 1. The two "team" concepts (don't confuse them)

| | `Staff` (`staff` table) | `TeamMember` (`team_members` table) |
|---|---|---|
| Who | **Retailer's own shop employees** | **Kanchuki's** internal field / sales / support agents |
| Added by | Retailer, in `settings/staff.tsx` → `POST /v1/staff` | Admin, in `apps/web/src/app/admin/team-members` |
| Auth | Retailer's Supabase phone-OTP session | Email+password (`/team/login`) **or** phone-OTP (migration 044) → team JWT |
| Fields | `id, retailer_id, auth_user_id?, name, phone, role, is_active` | `id, name, email, password_hash, role (TeamRole enum), phone?, is_active, max_retailers, territories[]` |
| Permission model | `role` string: `owner \| manager \| salesperson` → `staffCanAccess()` allowlist | `TeamRole` enum + assigned territories, filtered per query |

**This document is about `Staff` only** (the retailer's shop employees). `TeamMember` is mentioned
only where the login flow branches between them.

---

## 2. How `Staff` works today — end to end

### 2.1 Add a team member

- **Screen:** `apps/mobile/app/settings/staff.tsx` → `AddStaffModal`
- Collects **name** + **phone** (10-digit). Calls `staffApi.create({ name, phone, role: 'salesperson' })`
  — **`role` is hardcoded**, no picker.
- **API:** `POST /v1/staff` (`apps/api/src/routes/staff.ts`)
  - Zod: `name`, `phone` (valid Indian mobile), `role` enum default `salesperson`.
  - Seat check: `activeCount >= retailer.max_staff_seats` → `planLimitExceeded('staff seats')`.
    Default `max_staff_seats` = 3 (per F-009 / pricing doc "Additional staff seat: ₹199/mo" — **no
    purchase flow built**).
  - Rejects a phone already `is_active` for this retailer, or already a live `Retailer` account.
  - Creates the `staff` row (`auth_user_id` null until first login). Writes an `auditLog`.
- **No invite / SMS is sent.** The staff member just has to know to open the app and log in with
  that phone.

### 2.2 Team member logs in

`apps/api/src/routes/auth.ts` → `POST /v1/auth/otp/verify`:

1. OTP verified (MSG91 widget / stored code / **test bypass**) → `ensureSupabaseSession(phone)`
   mints a Supabase auth user for the phone.
2. `pending = prisma.retailer.findUnique({ where: { phone } })`.
3. **`if (!pending && !bypassActive)`** → account-type detection:
   - `prisma.staff.findFirst({ where: { phone, is_active: true, retailer: { deleted_at: null } } })`
     → if found: link `auth_user_id`, return
     `{ is_staff: true, staff: { id, name, role, retailer_id, retailer_shop_name, retailer_city } }`.
   - else `prisma.teamMember.findFirst(...)` → return `{ is_staff: true, team_member: {...} }`.
4. Otherwise falls through to `prisma.retailer.upsert({ where: { auth_user_id } })` → **new blank
   retailer**, `is_new: true`.

`apps/mobile/app/auth/otp.tsx` → `completeLogin(result)`:

- `result.is_staff && result.staff` → store `staff_role`, `staff_name`, `staff_retailer_id`,
  `retailer_id`; `emitAuthChange({ authed: true })` (no `navigateTo`).
- `result.retailer` with incomplete onboarding, **or** no retailer/staff/team at all →
  `emitAuthChange({ authed: true, navigateTo: '/onboarding' })`.

`apps/mobile/app/_layout.tsx` guards:

- `isStaff` = `Boolean(staff_role in storage)`.
- `<Stack.Protected guard={isAuthed && !isStaff}>` → retailer tabs / onboarding / settings / growth …
- `<Stack.Protected guard={isStaff}>` → **`app/staff/`** (single nested stack: `index`, `retailer-onboard`).

### 2.3 What the staff screen actually shows

`apps/mobile/app/staff/index.tsx` ("Staff Dashboard") calls **`teamApi.getMe()` / `getRetailers()` /
`getTicketStats()` → `/v1/team/me`, `/v1/team/retailers`, `/v1/team/tickets/stats`**. Those routes
are behind the **team-JWT** plugin. A shop-`Staff` member holds a **Supabase** session, so every one
of those calls **401s**. The screen's content ("New Retailer", "Catalog Upload Jobs", "Retailers in
Territory") is meaningless for a shop employee anyway.

➡️ **There is no shop-staff view of the retailer's catalog / customers / collections.** The
server-side allowlist that *would* scope them (`MANAGER_ALLOWED_ROUTES`, `SALESPERSON_ALLOWED_ROUTES`)
is built and enforced — but the client never renders the retailer tab UI for a staff session.

### 2.4 Server-side permission model (already built, `apps/api/src/plugins/auth.ts`)

`authPlugin` `preHandler`: if the Supabase JWT resolves to a `Staff` row (not a `Retailer`), it sets
`request.staffRole = staff.role` and calls:

```
staffCanAccess(method, routeUrl, role):
  role === 'salesperson' → SALESPERSON_ALLOWED_ROUTES
  else (manager / owner)  → MANAGER_ALLOWED_ROUTES
  → 403 "Your team account does not have access to this section" if no rule matches
```

| Route | manager | salesperson |
|---|---|---|
| `* /v1/products` (add/edit/delete) | ✅ | ❌ (GET only) |
| `GET /v1/products` | ✅ | ✅ |
| `* /v1/categories` | ✅ | ❌ (GET only) |
| `* /v1/collections` | ✅ | ❌ |
| `* /v1/size-charts` | ✅ | ❌ (GET only) |
| `POST /v1/customers` (add only) | ✅ | ✅ |
| `GET /v1/retailers/me` | ✅ | ✅ |
| `POST /v1/retailers/me/qr-slug` | ✅ | ❌ |
| billing, KYC, staff mgmt, WhatsApp API, account delete, deleted-products | ❌ | ❌ |

Everything is **owner-only by default**; a route has to be added to an allowlist to let staff in.
(`isRealOwner()` distinguishes a true owner from an F-020 catalog-delegate token, which also has
`staffRole = null`.)

### 2.5 Remove a team member

- **Screen:** `staff.tsx` `handleRemove` → `Alert` "Deactivate … They can be re-added later" →
  `staffApi.delete(id)` → `DELETE /v1/staff/:id`.
- **API:** `prisma.staff.update({ where: { id }, data: { is_active: false } })` + `auditLog`. **Soft
  delete.** Row, `name`, `phone`, `auth_user_id` all remain.
- The list (`staff.tsx`) does `.filter((s) => s.is_active)` → the member disappears → **looks** deleted.
- Re-adding the same phone: `POST /v1/staff` only checks `is_active: true` collisions, so it **creates
  a second `staff` row** (no `@@unique([retailer_id, phone])`).
- Hard delete of `staff` rows happens **only** in `purge-retailer-now.ts`
  (`DELETE FROM staff WHERE retailer_id = $1`) when the *retailer* account is purged.

---

## 3. Gaps / bugs

| # | Severity | Gap |
|---|---|---|
| G1 | High | **No role picker.** Add-modal hardcodes `salesperson`. Retailer cannot grant `manager` (catalog edit / collections) or anything else. This is the "assign access to features" the retailer is asking for. |
| G2 | High | **`OTP_TEST_BYPASS` swallows staff/team phones.** `if (!pending && !bypassActive)` skips staff detection whenever bypass is active → staff phone → new blank `Retailer` → `/onboarding`. Also a production landmine if the flag is ever left on. |
| G3 | High | **No shop-staff dashboard.** Staff are routed to `app/staff/` (internal-agent screen, `/v1/team/*`, 401s for them). They never see the retailer's catalog/customers/collections in a scoped UI, even though the API allows it. |
| G4 | Medium | **Client doesn't hide owner-only UI for staff.** Even if G3 is fixed by pointing staff at `(tabs)`, entries like Billing / KYC / Team / WhatsApp API / Growth would render and then 403 on tap. `settings/index.tsx` already reads `staff_role` in one place — needs to gate the menu. |
| G5 | Medium | **Delete is deactivate, with no visibility.** No "deactivated members" list, no restore, and the copy says "re-added later" but re-adding makes a duplicate row (G6). Retailer has no way to confirm the data still exists → perceives it as a hard delete. |
| G6 | Low | **Duplicate staff rows.** No `@@unique([retailer_id, phone])`; re-adding a deactivated phone creates a second row. |
| G7 | Low | **No DPDP hard-erase.** If a retailer genuinely wants a staff member's phone/name erased (not just seat freed), there is no path short of purging the whole retailer account. |
| G8 | Low | **No invite signal.** Staff must be told out-of-band to log in. Minor, but explains "nothing happened after I added them". |
| G9 | Low | **`role: 'owner'` on a `Staff` row** silently gets the full manager allowlist (`staffCanAccess`: "else" branch). Harmless today (UI can't create it) but should be rejected explicitly once a picker exists. |

---

## 4. Functional Requirements

> Design intent (ponytail): the permission **backbone already exists** — the 2-tier
> `manager`/`salesperson` allowlist in `auth.ts`. **Do not** build a granular per-feature ACL
> (checkbox matrix, `staff_permissions` table). Expose the two roles, wire the client to the
> allowlist that's already enforced, and fix the routing bugs. Granular per-feature toggles are
> explicitly **deferred** (see §4.7) until the 2-tier model is proven insufficient.

### FR-1 — Role selection when adding / editing a team member  (fixes G1, G9)

- **FR-1.1** The Add Team Member modal (`settings/staff.tsx`) MUST let the retailer choose a role.
  Options, plain-language labels:
  - **Manager** — "Can add & edit products, categories, collections, size charts, and add customers."
  - **Salesperson** — "Can view the catalog and add customers. Cannot edit products or create collections."
  - Default selection: **Salesperson** (current behaviour).
- **FR-1.2** `role` MUST be editable afterwards. Add an Edit action on each row in `staff.tsx`
  (`PUT /v1/staff/:id` already accepts `role`). Changing role takes effect on the staff member's
  next request (allowlist is checked per-request; no re-login needed).
- **FR-1.3** `POST /v1/staff` and `PUT /v1/staff/:id` MUST reject `role: 'owner'` from a retailer
  caller with `validationError('Role must be manager or salesperson')`. (`owner` stays a valid DB
  value only for internal/seed use.)
- **FR-1.4** No new DB column. `Staff.role` already exists. No migration.
- **FR-1.5** The role label + one-line capability summary MUST be shown on each staff row (replace the
  bare `{role}` text) so the retailer can see at a glance what each member can do.

### FR-2 — Team member login lands in a scoped retailer view, never onboarding  (fixes G2, G3)

- **FR-2.1** `auth.ts` `POST /auth/otp/verify` MUST detect a `Staff` (and `TeamMember`) match
  **before** the test-bypass short-circuit. Concretely: run staff/team detection whenever
  `!pending`, regardless of `bypassActive`. A dummy phone that belongs to a `staff` row MUST return
  `{ is_staff: true, staff: {...} }`, not create a `Retailer`.
  - Regression test: with `OTP_TEST_BYPASS=1` and a bypass-listed phone that has an active `staff`
    row, `verify` returns `is_staff: true` and creates **no** `retailer`.
- **FR-2.2** A logged-in `Staff` session MUST render the **retailer tab UI** (`app/(tabs)`), scoped
  to what their role allows — **not** `app/staff/` (which is for internal `TeamMember`s), and **not**
  `/onboarding`.
  - Simplest routing: keep `isStaff` for internal `TeamMember`s only; introduce `isShopStaff`
    (derived from a stored `staff_retailer_id` + a `staff_kind` marker set in `completeLogin`) and
    let `guard={isAuthed && !isTeamMember}` cover both owner and shop-staff, with the menu gated by
    role (FR-3). Exact guard wiring is an implementation detail; the requirement is: **shop staff see
    the retailer's real catalog/customers/collections screens, filtered by permission.**
- **FR-2.3** A `Staff` member MUST never be shown the onboarding flow. Onboarding is owner-only
  (the shop already exists).
- **FR-2.4** If a `Staff` row's `retailer` is soft-deleted or suspended, login MUST fail with the
  existing `ACCOUNT_DELETED` / `ACCOUNT_SUSPENDED` errors (already true for the owner path; extend to
  staff).

### FR-3 — Client hides what the role can't use  (fixes G4)

- **FR-3.1** When `staff_role` is present, `settings/index.tsx` MUST hide: Subscription/Billing, KYC,
  Team Members, WhatsApp Business API, Account delete. (Profile becomes read-only — `GET
  /v1/retailers/me` is allowed, `PUT` is not.)
- **FR-3.2** For `salesperson`, additionally hide/disable: product add & edit affordances, category
  create/edit, collection create, size-chart edit, Growth hub, AI Studio, social publishing,
  showcase-designs management. Leave visible: catalog browse, product detail (read-only),
  "Add Customer", Scan-to-Sell (status update is intentionally un-gated — see PRO-REQUIREMENTS
  §F-025 note).
- **FR-3.3** For `manager`, hide only the owner-only set from FR-3.1 (plus Growth/Billing-adjacent
  surfaces that have no allowlist entry). Manager keeps product/category/collection/size-chart
  management + Add Customer.
- **FR-3.4** Any owner-only action that slips through MUST surface the API's 403 message
  ("Your team account does not have access to this section") as a normal error toast, not a crash or
  a silent no-op.
- **FR-3.5** The gating MUST be driven by a single shared helper (e.g. `staffCan(role, feature)` in
  `apps/mobile/src/lib/`) mirroring the server allowlist, so the two don't drift. One source of the
  feature→role map, imported by every screen that needs it.

### FR-4 — Deletion: clear semantics + visibility  (fixes G5, G6, G7)

- **FR-4.1** Keep **Deactivate** (`is_active = false`) as the default action. Reword the confirm
  dialog to state exactly what happens: *"Remove {name} from your team? They lose app access
  immediately and the seat is freed. Their record is kept (deactivated) and can be restored."*
- **FR-4.2** `staff.tsx` MUST show deactivated members in a collapsible "Removed" section with a
  **Restore** action (`PUT /v1/staff/:id { is_active: true }`, subject to the seat check).
- **FR-4.3** `POST /v1/staff` MUST reactivate an existing **inactive** row for the same
  `(retailer_id, phone)` instead of creating a duplicate. Add `@@unique([retailer_id, phone])` to the
  `Staff` model + a migration that de-dupes existing rows first (keep the most recent active, else
  most recent).
- **FR-4.4** Provide an explicit **"Delete permanently"** action inside the Removed section (owner
  only) → new `DELETE /v1/staff/:id?purge=true` (or a distinct route) that hard-deletes the row after
  a "type DELETE" confirm, for DPDP erasure requests. Writes an `auditLog` entry (`action: 'purge'`,
  `metadata: { name, phone }`) **before** deleting so the erasure itself is auditable. Blocked if the
  row is still `is_active`.
- **FR-4.5** Deactivating or purging a `Staff` row MUST NOT touch the `Retailer`. (Regression guard
  against G2's compounding effect.)

### FR-5 — Audit & limits (unchanged, restated)

- **FR-5.1** Every create / role-change / deactivate / restore / purge writes an `auditLog`
  (`actor_type: 'retailer'`, `resource_type: 'Staff'`). Already true except restore/purge (new).
- **FR-5.2** Seat limit (`Retailer.max_staff_seats`, default 3) is enforced on create **and restore**.
  Over-limit → `planLimitExceeded('staff seats')`. (Paid additional seats remain out of scope — no
  purchase flow; F-009 / pricing doc.)

### FR-6 — Optional: invite signal  (fixes G8, low priority)

- **FR-6.1** After `POST /v1/staff` succeeds, show the retailer a share sheet / copy-text:
  *"{name} can now log in to the {shop} app with their phone number {phone}."* No SMS send (cost,
  DLT). Purely a client-side prompt.

### 4.7 Deferred — granular per-feature permissions

A per-feature toggle matrix (`staff_permissions` table, checkbox UI) is **out of scope**. Revisit
only if retailers report the 2-tier model is too coarse (e.g. "a salesperson who can also run
collections but not edit products"). If it happens, the migration path is: add a nullable
`permissions Json?` override on `Staff`, checked by `staffCanAccess` before falling back to the
role allowlist. Not before there's demand.

---

## 5. Affected files (for whoever implements this)

| Area | File |
|---|---|
| Add/edit/list/remove UI | `apps/mobile/app/settings/staff.tsx` |
| Settings menu gating | `apps/mobile/app/settings/index.tsx` |
| Login result handling | `apps/mobile/app/auth/otp.tsx` (`completeLogin`) |
| Route guards | `apps/mobile/app/_layout.tsx`, `apps/mobile/src/lib/auth-context.tsx` |
| New shared `staffCan()` helper | `apps/mobile/src/lib/` (new) |
| Staff API | `apps/api/src/routes/staff.ts` |
| Login detection + bypass fix | `apps/api/src/routes/auth.ts` |
| Server allowlist (source of truth for `staffCan`) | `apps/api/src/plugins/auth.ts` |
| Schema (`@@unique`, migration) | `packages/db/prisma/schema.prisma` + new migration |
| Tests | `apps/api/src/routes/staff.test.ts`, `apps/api/src/routes/auth-team.test.ts`, `apps/mobile/__tests__/auth/login-routing.test.ts` |

## 6. Priority

1. **FR-2** (login bug — staff can't use the app at all today) — High
2. **FR-1** + **FR-3** (role picker + client gating — the actual "assign access" ask) — High
3. **FR-4** (delete semantics + `@@unique`) — Medium
4. **FR-5** restated, **FR-6** optional — Low
