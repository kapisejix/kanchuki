# Support Tickets + Feedback Loop — retailer raises ticket, Kanchuki team collects feedback, admin reports

**Status (2026-10-16): 🟨 Build step 1 DONE (owner said "build tickets"): retailer `POST/GET /v1/retailers/me/tickets` (`retailers-tickets.ts`, 8 tests, max 5 open, reuses `routeTicket`, no access grant) + mobile Settings → Help & Support (`settings/help-support.tsx`; owner-only, hidden for staff). Not device-tested, not deployed. Step 2 DONE 2026-10-16: staff `app/staff/tickets.tsx` (Active/Resolved/All, Call, Pick up, Mark resolved via existing `PATCH /team/tickets/:id`; no API change) + the dead "View Ticket Details" button on staff home now opens it. Steps 3–8 (feedback loop) still 🔴 not approved.** (Original 2026-10-15 note: review only.) Findings from a code review
requested by the owner. F-number unassigned. Decisions in "Open questions" are the owner's.
**Builds on:** `support-session-access.md` (staff session grants, built, not live), F-019/F-020
catalog-upload tickets, `BugReport`, `StoreReview`/`ProductReview`, staff discovery survey.

---

## 0. Conversation log (so every point is tracked)

| # | Owner asked | Answer given |
|---|-------------|--------------|
| 1 | If I upload mobile + customer-web screenshots, how will you analyze design, functionality, consistency, and whether past development is implemented? | Read each image, cross-check against code + BUILD-LOG/PRO-REQUIREMENTS, grep routes/components, classify built / partial / missing / removed. Limit: screenshots are static, cannot prove taps or API calls. |
| 2 | Best way for an AI agent to test mobile + customer web + marketing pages to find core and design issues? | Web: Playwright (mobile + desktop viewport, console errors, failed network, a11y snapshot, broken links, Lighthouse). Mobile: Expo web + Playwright, then Maestro on emulator, then real device. Core bugs come from console/network logs; design issues from screenshots. |
| 3 | Will a screen recording of the mobile app help? | Yes, via `ffmpeg` frame extraction (I read images, not video). Good for flow, states, dead taps. No logs/audio. One flow per recording, 30–90 s, Show taps ON. |
| 4 | Record on phone, not laptop. | Record on phone, copy file to laptop (USB / Drive), drop in `docs/recordings/`. |
| 5 | (a) No visible option for a retailer to generate a ticket and give Kanchuki sales team access. (b) Kanchuki team needs options to collect feedback from retailers and customers, admin analyses it and generates a report. (c) What exactly do retailers want, what do customers want? Review and say how it is possible. (d) Save all this in docs. | Sections 1–5 below. |

---

## 1. Finding A — retailer cannot raise a ticket / grant sales-team access

**Verified in code 2026-10-15.**

| Piece | State | Evidence |
|---|---|---|
| Retailer "Report a Problem" (bug report) | ✅ exists, buried | `apps/mobile/app/settings/index.tsx:1589` (Settings → Actions); posts to `POST /v1/retailers/me/bug-reports`; admin sees it at `/admin/bug-reports` |
| Retailer creates a **general support ticket** | ❌ **no endpoint, no screen** | `supportTicket.create` is called only from `team-tickets.ts:174` (staff creates **for** retailer), `retailers-catalog-upload.ts:68` (CATALOG_UPLOAD only), `team-support-sessions.ts:137` (staff-started session) |
| Retailer grants Kanchuki staff access | ⚠️ built, **initiated by staff**, not live | `settings/support-sessions.tsx` (approve/deny/revoke), `SupportSessionPrompt.tsx`; migration 127 unapplied; switch OFF |
| Retailer sees ticket status / history | ❌ none (only catalog-upload ticket has a status view) | `settings/catalog-upload.tsx` is the only retailer ticket UI |
| Staff view of tickets | ✅ | `staff/index.tsx` (stats), `staff/catalog-tickets.tsx` (CATALOG_UPLOAD only — general tickets have no list screen) |

**Root of the confusion:** the data model and staff side exist; the retailer entry point does not.
"Report a Problem" is a bug-report form (severity + screenshot), not a ticket, and creates no
`SupportTicket`, no assignment, no staff routing, no access grant.

### Proposed fix (smallest path)

1. **Retailer endpoint** `POST /v1/retailers/me/tickets` — body `{ type: GENERAL|DEMO|GROWTH_SETUP|MAINTENANCE, note, requires_visit? }`.
   Reuse `routeTicket()` from `team-tickets.ts` so routing/territory rules stay in one place.
2. **Retailer endpoint** `GET /v1/retailers/me/tickets` — list own tickets + status + assigned staff first name.
3. **Mobile**: new Settings → **Help & Support** section: *Raise a ticket*, *My tickets* (status chips),
   and, on an ASSIGNED ticket, *Allow Kanchuki team to help* → reuses the existing approve flow.
   Keep "Report a Problem" for crashes/bugs; link both from one Help screen.
4. **Access consent** stays as decided in `support-session-access.md` (in-app approve, 24 h, revocable).
   Ticket creation must **not** grant access by itself.
5. Quota/abuse: rate-limit per retailer (e.g. 5 open tickets), enforce via the F-010 limits system.

**Gates (not skippable):** support-session switch + migration 127 are owner-applied; this feature is
useless for access grants until those are live. Ticket creation alone (steps 1–3 without grant) is
independent and can ship first.

---

## 2. Finding B — feedback collection for Kanchuki team

**What exists today**

| Source | Collected | Where it lands | Reaches an admin report? |
|---|---|---|---|
| Staff discovery survey (field agent, in the shop) | 40+ questions: pains, wanted features, trial interest | `AuditLog` rows, `resource_type: RetailerSurvey` (no table) | Admin list at `/admin/survey` — **rows only, no aggregation** |
| Retailer bug reports | description, severity, device, screen | `BugReport` | `/admin/bug-reports` list + stats (counts) |
| Customer store/product ratings | stars + text | `StoreReview`, `ProductReview` | Retailer sees own (`growth/ratings.tsx`); **no cross-retailer admin view** |
| Customer enquiries / favorites | enquiry events | existing events | Not a feedback channel |

**Gaps**

- ❌ Staff mobile app has **no feedback-capture screen**. The survey is a **web page** (`apps/web/src/app/survey`), `POST /v1/team/survey`.
- ❌ No retailer-in-app feedback prompt (NPS / feature request / "what's missing").
- ❌ No customer-facing "feedback to Kanchuki" (customer web only rates stores/products).
- ❌ No structured store: survey answers live in `AuditLog.metadata` JSON — can list, cannot reliably
  group/trend/filter without ad-hoc JSON queries.
- ❌ No report generation (counts by theme, trend, per-territory, export).

### Proposed design

1. **Table, not AuditLog:** `FeedbackEntry { id, source (RETAILER|CUSTOMER|STAFF_ON_BEHALF), retailer_id?, customer_ref?, team_member_id?, kind (NPS|FEATURE_REQUEST|PAIN_POINT|PRAISE|COMPLAINT), rating?, tags[], text, locale, created_at }`.
   Migration **owner-applied only**; RLS per the Kanchuki RLS convention.
2. **Capture points**
   - Retailer mobile: Help & Support → *Give feedback* (1–5 + tags + text); optional NPS prompt after N days / 50 products.
   - Staff mobile: *Log feedback for retailer* (visit-time, voice-dictation friendly, picks retailer from territory list).
   - Customer web: small *Tell Kanchuki* link in footer/profile (rating + text, no login needed beyond phone-OTP rule already used elsewhere).
3. **Admin analysis**: `/admin/feedback` — filters (source, territory, date, tag), theme counts, trend, NPS,
   top wanted features; **CSV export**; "Report" button that renders a one-page summary (PDF/CSV).
4. **AI summarization (optional, later):** batch job via BullMQ (never in request handler, per project rule)
   clustering free-text into themes. Not required for v1.
5. **PII:** feedback text may contain phone numbers/names → no photo/PII export; mask customer phone per existing rules.

---

## 3. Finding C — what retailers and customers want (from what is already in the repo)

> Source = the data and research already in the repo. **No live user data was queried** (DB is empty of
> retailers per the 2026-08-22 full dummy-data wipe), so this is research-derived, not measured.
> The feedback loop above is exactly what turns this into measured demand.

**Retailers** (discovery survey fields in `team-survey.ts` + `docs/references/research/*`)

- Faster product entry — `pain_photoTime`
- Visibility / being found online — `pain_visibility`, `gmb`, `hasWebsite`
- WhatsApp sharing without chaos — `pain_whatsappChaos`
- A customer record / follow-up (CRM) — `pain_noCrm`, `custRecord`, `repeatPct`
- Competing with online shopping — `pain_onlineCompetition`
- Less staff time per customer — `timePerCustomer`, `staffWorkReduction`
- Rate / colour / trend asks from customers — `rateColorTrendAsk`
- Festival promotion — `festivalPromo`
- Their own free-text frustration + wanted features — `biggestFrustration`, `wantedFeature`

**Customers** (customer web scope in `CLAUDE.md` + `docs/customers/customer-profile.md`)

- See a store's collection without installing an app
- Filter by colour / fabric / price / size; "Picked for you"
- Favorite + enquire in one tap, hear back on WhatsApp
- Trust signals: ratings, real photos, store location
- Restock / back-in-stock notify; remember my size

**To verify rather than assume:** prioritise by actual `wantedFeature` and `pain_*` tallies once
~30 surveys are filed. That aggregation is the first thing the admin report should show.

---

## 4. Build order (if approved)

| # | Task | Depends on | Owner-gated |
|---|------|------------|-------------|
| 1 | Retailer `POST/GET /me/tickets` + Help & Support screen (no access grant) | none | no |
| 2 | Staff general-ticket list screen (today only CATALOG_UPLOAD is listed) | 1 | no |
| 3 | `FeedbackEntry` migration + retailer/staff capture endpoints | — | **migration apply** |
| 4 | Staff + retailer feedback screens (mobile) | 3 | no |
| 5 | Admin `/admin/feedback` aggregate view + CSV | 3 | no |
| 6 | Customer-web *Tell Kanchuki* | 3 | no |
| 7 | Backfill survey `AuditLog` → `FeedbackEntry` (read-only copy) | 3 | **owner review** |
| 8 | AI theme summary job | 5 | no |

Tests required: ticket create is retailer-scoped (cannot read another retailer's tickets);
territory routing parity with `POST /team/tickets`; feedback submit rate-limited; admin routes
pass the RC-034 access-classification test; `security.test.ts` + admin login suite.

---

## 5. Open questions (owner)

1. Should ticket creation and "allow staff to help" be one step or two? (Recommended: two — consent stays explicit.)
2. Should customer feedback to Kanchuki exist at all in MVP, or retailer + staff only? (Customer web is a store-owned surface.)
3. Report format: on-screen + CSV enough, or branded PDF?
4. Is the staff survey moved into the staff mobile app, or kept web-only for field agents?
5. F-number to assign (next free after F-043).

## 6. Docs to update when this is approved/built (per CLAUDE.md rule 10)

- `docs/PRO-REQUIREMENTS.md` — new section + status row
- `docs/tasks/README.md` — board row (added with this doc)
- `docs/BUILD-LOG.md` — build table when shipped
- `CLAUDE.md` index row — **needs explicit human approval**, not touched here
