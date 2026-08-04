# Staff-Assisted Catalog Upload — How It Works

**Status: already built.** This is not a new feature — it is F-019 (Paid
On-Site Catalog Upload Service) + F-020 (Delegated On-Site Access), built
2026-07-28 / 2026-07-30. This doc explains the existing end-to-end process so
it can be operated and explained without re-reading the code each time.
Backend: `apps/api/src/routes/retailers.ts` (§ F-019), `apps/api/src/routes/team.ts`
(`/tickets/:id/catalog-session`), `apps/api/src/plugins/{auth,team-auth}.ts`.
Mobile: `apps/mobile/app/staff/catalog-tickets.tsx`,
`apps/mobile/src/lib/catalog-delegate.ts`,
`apps/mobile/src/components/CatalogDelegateBanner.tsx`.

## The core problem this solves

A staff member is standing in the retailer's store with their own
phone/tablet. The retailer wants their catalog uploaded but has no interest
in creating a password, remembering an OTP flow, or handing over their real
login. The staff member needs to add products — with photos — and have them
land in the *retailer's* account, not a staging area that needs a later
merge.

The answer already in the codebase: a **short-lived, ticket-scoped delegated
token**. The staff member's phone temporarily authenticates *as the
retailer*, scoped to catalog routes only, for a few hours, fully audited, and
instantly revocable. No new retailer-side screens, no separate "staff
catalog" table — it reuses the exact same product/photo upload screens a
retailer would use themselves.

## Two entry points

### A. Retailer already has an account (the F-019 paid-service path)

This is the fully-built, default path.

1. **Retailer requests it.** From the retailer app (or during onboarding,
   skippable), the retailer submits `POST /me/catalog-upload-request` with an
   estimated item count and an optional note. This creates a `SupportTicket`
   with `ticket_type: CATALOG_UPLOAD`.
2. **Admin quotes a price and proposes visit slots.** Admin reviews the
   ticket and sets `quoted_price_inr` + `proposed_slots` via
   `PATCH /team/tickets/:id`. (Admin can quote **₹0** — validation only
   requires `>= 0` — for a free/promotional on-site upload; no code change
   needed for that.) A `CatalogUploadPriceTier` grid exists in Admin for
   suggested defaults by item-count bracket.
3. **Retailer pays.** `POST /me/catalog-upload-request/:id/pay` opens a
   Razorpay Payment Link (server computes the amount from the stored quote —
   never trusts a client-supplied number). Payment is verified server-side
   via the Razorpay callback/webhook, not a client POST.
4. **Retailer confirms a visit slot.** `POST /me/catalog-upload-request/:id/confirm-slot`
   — only allowed after `paid_at` is set. On confirmation, the ticket
   auto-routes to a team member via the existing `routeTicket()` logic
   (territory hierarchy → nearest agent → least-loaded scheduling — the same
   engine Phase 0.5 support tickets already use). This is where "which staff
   member goes to this store" gets decided; nothing new to build here.
5. **Staff member sees the job.** On their own phone, `Staff → Catalog Upload
   Jobs` (`app/staff/catalog-tickets.tsx`) lists tickets assigned to them
   where `status = ASSIGNED`, `paid_at` is set, and `confirmed_slot` is set.
   Anything not fully paid+scheduled simply doesn't show up here — there is
   no way to start a session against an unpaid/unscheduled ticket.
6. **Staff taps "Start Upload Session."** This calls
   `POST /team/tickets/:id/catalog-session`, which mints an 8-hour JWT scoped
   to `{ retailer_id, ticket_id, team_member_id }` (`signCatalogUploadToken`,
   `apps/api/src/plugins/team-auth.ts`). Only the assigned agent (or a super
   admin) can mint this token, and only once payment + slot are both
   confirmed — the backend re-checks this, it isn't just a UI gate.
7. **The phone's session silently swaps identity.** `enterCatalogSession()`
   backs up the staff member's own login token, stores it locally, and
   writes the delegated token into the same slot the app's API client
   already reads from (`apps/mobile/src/lib/catalog-delegate.ts`). Every
   existing screen — `product/add`, `product/bulk-onboard`, photo upload,
   AI tagging — works completely unmodified, because as far as the app's
   API layer is concerned, it's just holding a bearer token. It has no idea
   whether that token is a real retailer login or a delegated one.
8. **A persistent banner marks the session.** `CatalogDelegateBanner`
   renders "Uploading catalog for {shop name}" with an "End Session" button
   on every screen for as long as the delegated token is active, so it's
   never ambiguous whose catalog is being edited.
9. **Products/photos save directly to the retailer's real account.** There
   is no staging table. `request.retailerId` on the backend resolves to the
   *retailer's* ID (from the token's `sub` claim), so every `POST /v1/products`,
   photo upload, and `catalog-import` call writes straight into that
   retailer's real `Product`/`ProductPhoto` rows — identical to the retailer
   doing it themselves.
10. **Access is narrow and self-revoking.** The delegate token can *only*
    reach `/v1/products` and `/v1/catalog-import` (`CATALOG_DELEGATE_ALLOWED_ROUTES`,
    `apps/api/src/plugins/auth.ts`) — no customers, no billing, no staff
    management, no account settings. On every request the backend re-verifies
    the ticket is still `ASSIGNED` to that same team member — if the ticket
    is reassigned, closed, or resolved, access dies immediately, not just at
    the 8-hour mark.
11. **Every write is audited.** An `onResponse` hook logs every mutating
    request made under a delegated session to `AuditLog` with
    `actor_type: 'catalog_delegate'`, the ticket ID, and the retailer ID —
    one hook, not scattered per-route logging.
12. **Staff taps "End Session."** `exitCatalogSession()` restores the staff
    member's own login token and clears the delegate info. They're back to
    their normal staff identity, done from the same device, no re-login
    needed.

### B. Retailer has no account yet (brand-new store)

`app/staff/retailer-onboard.tsx` + `POST /team/onboard-retailer` (Phase 0.5)
creates the retailer's account (shop name, phone, city, 14-day trial) —
this part is a plain registration, not a delegated session, since there's no
existing account/data to protect yet.

Once that account exists, catalog upload for it goes through path **A**
above like any other retailer — the same request/quote/pay/visit flow. If
the intent is "staff onboards a brand-new retailer *and* uploads the catalog
in the same visit for free," the lazy way to do that with zero new code is:
admin (or the staff member's manager) quotes that ticket at **₹0** and
proposes an immediate slot — the pay step still runs but Razorpay settles a
₹0 order instantly, and the rest of the flow (routing, delegated token,
upload) is identical.

## Is it the same mobile app the retailer uses? (verified 2026-08-04, gap since fixed — see "Open follow-ups" below)

**Intent: yes, one app, phone-OTP login, redirected by role.** That's how
`apps/mobile/app/_layout.tsx` and `app/auth/otp.tsx` are wired — after OTP
verify, the app checks `is_staff` in the response and routes to `/staff`
instead of the retailer home screen. One APK/build, no separate staff app to
maintain or distribute.

**But tracing the actual auth chain end to end surfaces a real gap, not a
cosmetic one:**

- The OTP-verify endpoint (`apps/api/src/routes/auth.ts`) only ever checks
  `prisma.staff.findFirst(...)` — the **`Staff` model (F-009)**, i.e. a
  retailer's *own shop employee* (e.g. a salesperson working inside one
  specific store, role `manager`/`salesperson`). That's who phone-OTP-based
  `/staff` login actually authenticates today.
- The screens under `app/staff/*` (`index.tsx`, `catalog-tickets.tsx`,
  `retailer-onboard.tsx`) are written against `teamApi`, which calls
  `/team/me`, `/team/retailers`, `/team/tickets/*` — routes guarded by
  `verifyTeamToken()`, which only accepts a JWT minted by `POST /team/login`
  (**`TeamMember` model** — Kanchuki's own internal field/sales/support
  agents, email+password login, no phone/OTP path exists for them at all,
  on mobile or anywhere).
- A phone-OTP `Staff` (F-009) login produces a **Supabase session token**,
  not a `verifyTeamToken`-shaped JWT. `teamRequest()` in
  `apps/mobile/src/lib/team-api.ts` sends that Supabase token as the Bearer
  header to `/team/*` anyway — it will fail verification and 401, which
  `teamRequest` treats as "session ended" and bounces the user back to
  `/auth/phone`.

**Net effect: the exact persona this whole doc is about — the Kanchuki
field/sales agent who visits a store and runs a catalog-upload session —
has no working login path into the mobile app today.** The `/staff` screens
render correctly (they were clearly built against the `TeamMember` API
surface) but nothing in the sign-in flow can hand them a token those screens
can use. The only account type that *can* reach `/staff` via OTP (a
retailer's own F-009 shop employee) hits 401s the moment it calls
`teamApi.getMe()`/`getTickets()`/`startCatalogSession()`.

This isn't something to route around with a workaround — it's a real gap
between two auth systems that grew independently (`Staff`/OTP for
in-store retailer employees vs. `TeamMember`/JWT for Kanchuki's own agents)
and were never bridged. Fixing it is a backend decision (does `TeamMember`
get a phone+OTP path added, reusing the same Supabase flow, or does the
mobile app gain a `/team/login` email+password screen?) — flagged here for
that decision, not fixed, per "no coding" for this pass.

## Current limited-time offer: first 500 catalog items free (all retailers)

Decision, not yet built into any enforcement: **the first 500 product items
uploaded per retailer are free**, for a limited time. Two things worth being
precise about, since neither is automatic:

- **The `CatalogUploadPriceTier` grid (Admin → Catalog Upload Tiers) is
  reference data only.** Setting a `min_items:1, max_items:500, price_inr:0`
  row there does **not** auto-fill `quoted_price_inr` on any ticket —
  confirmed by reading `team.ts`: the ticket-quoting route
  (`PATCH /team/tickets/:id`) never reads `CatalogUploadPriceTier` at all.
  Whoever quotes a ticket still has to manually type `quoted_price_inr: 0`
  for it to actually be free. Updating the tier grid is worth doing (it's
  what admins reference while quoting), but it doesn't enforce anything by
  itself.
- **There is no offer start/end date anywhere in the schema.** "Limited
  time" is not a system concept here — nothing will automatically start
  charging again when the promo ends. Whoever quotes tickets needs to be
  told the cutoff date directly (calendar reminder, team message, etc.);
  the system will happily keep quoting ₹0 forever if nobody's told to stop.
- Applies per ticket: if `item_count_requested <= 500`, quote `0`; above
  500, quote the normal tiered price for the excess (or however the
  business wants to split partial-free/partial-paid — the ticket has one
  `quoted_price_inr` field, not a per-item split, so a >500-item request is
  one manual decision per ticket, not something the system computes).

## Why this design and not something simpler

- **Why not just let staff log in as the retailer with a shared password?**
  Retailer never has to create/share a password. Access is scoped (catalog
  only) and time-boxed (8h), which a shared password isn't.
- **Why not a separate "staff catalog draft" table merged later?** Doubles
  the write path (draft schema + merge logic + conflict handling) for a
  problem the existing product screens already solve if the app just holds
  the right token. Reusing `product/add` and `bulk-onboard` unmodified is
  the entire point of F-020.
- **Why JWT instead of a DB session table?** Expiry is free (the `exp`
  claim), and the live `SupportTicket.status` check on every request already
  gives instant revocation — a DB session table would duplicate that
  revocation check for no extra benefit.

## Operating checklist (no code involved)

- [ ] Retailer account exists (onboard first via path B if it doesn't).
- [ ] Retailer has submitted a catalog-upload request (or admin creates the
      ticket manually with the same `ticket_type: CATALOG_UPLOAD`).
- [ ] Admin has set `quoted_price_inr` (use `0` for a free visit) and at
      least one `proposed_slots` entry.
- [ ] Retailer has paid (or the ₹0 order has settled) and confirmed a slot.
- [ ] Ticket auto-routed to a team member — check `SupportTicket.assigned_to_id`,
      or `/team/reporting/coverage-gaps` if nobody's covering that territory.
- [ ] Staff opens **Staff → Catalog Upload Jobs** on their own phone at the
      store, taps **Start Upload Session**, uploads via the normal product
      screens, taps **End Session** when done.

## Open follow-ups

**Fixed 2026-08-04 (commit `c99a6c6`):**

- **`TeamMember` mobile login gap — closed.** Option A shipped: migration
  `044` adds `TeamMember.phone @unique`; `auth.ts` `/otp/verify` now checks
  `TeamMember` after `Staff` and before the retailer upsert, minting a real
  team JWT. An agent's phone can never create a Retailer row; `Staff` vs
  `TeamMember` tokens stay cryptographically separate. Mobile `otp.tsx`
  routes `team_member` logins to `/staff` with no stale retailer context.
  A field agent can now reach `/staff/catalog-tickets.tsx` with a working
  session end to end, once an admin sets their phone number in
  Admin → Team Members.

**Not blocking, just not built:**

- No in-app UI for a manager to quote/propose slots from the mobile app yet —
  currently admin-web-panel only (`PATCH /team/tickets/:id`). Not required
  for the flow to work, just an ergonomics gap for managers who live in the
  field app.
- No system-level "free tier"/promo-window concept — see "Current
  limited-time offer" above. The ₹0-quote-per-ticket approach covers today's
  500-item promo with zero new code, but there's no expiry enforcement or
  per-item free/paid split; a second promo, or one with an automatic cutoff,
  would need real schema/logic, not just manual quoting discipline.
