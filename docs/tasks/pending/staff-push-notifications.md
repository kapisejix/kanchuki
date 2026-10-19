# F-046 — Retailer staff push notifications (F-044 Release 3, E4 real push)

**Status:** 🟨 Slices 1–2 built 2026-10-19 on `feat/f-046-staff-push` (PR #137, unmerged, migration 135 not applied, nothing sent to a real device). Slices 3–4 planned.
**Parent:** `docs/tasks/pending/enquiry-basket-team-inbox-and-instore-tryon.md` §11.7 (Release 3). Separate from F-036 (customer web push).

## Decisions (owner, 2026-10-19: "go" on the recommended set)

| # | Decision |
|---|---|
| 1 | Delivery = Expo push service (`exp.host/--/api/v2/push/send`, plain `fetch`, no SDK). Expo relays to FCM / APNs. |
| 2 | Recipients = owner + managers + salespeople. Catalog / support delegates never. Resolved at send time from `Staff.role` + `is_active`, not at register time. |
| 3 | v1 scope = **new enquiry only**. No taken / reassigned pushes. Payload = "New enquiry · N items" + `{enquiryId}`; no customer phone, name or product names (F-037, RC-066). |
| 4 | Android needs FCM: owner creates the Firebase project, uploads the FCM V1 service-account key via `eas credentials`; `google-services.json` wired as an EAS secret file. iOS APNs via EAS. |
| 5 | F-number = F-046. |

## Slices

| # | Slice | Needs owner |
|---|---|---|
| 1 | ✅ Migration 135 `staff_push_devices` (+ RLS, purge delete) · `POST /v1/push-devices/register` + `/unregister` · staff allowlists · tests | Apply migration 135 |
| 2 | ✅ Built 2026-10-19 (same branch, unmerged): `jobs/enquiry-push.ts` (recipients from `Staff.is_active` at send time, Expo send, `DeviceNotRegistered` soft-disable, delayed receipts job, no `repeat.limit`), own queue `kanchuki-push` + worker, hooked into both enquiry creators (`public-collections.ts`, `public-my-style.ts`), `jobId` dedupes per enquiry, enqueue failure logged and never fails the enquiry | none (optional env `EXPO_ACCESS_TOKEN` if Expo "Enhanced Security" is turned on) |
| 3 | Mobile: `expo-notifications`, permission after login, register / unregister token, tap opens the Enquiries inbox, foreground refetch of the unread badge. 30 s poll stays as fallback | FCM setup, EAS rebuild, device test |
| 4 | Docs: PRO-REQUIREMENTS, BUILD-LOG part-6, CLAUDE.md index row, RC rows only if bugs appear | approval for the index row |

## Slice 1 notes

- Unregister is `POST`, not `DELETE`: avoids the Fastify v5 empty-JSON-body 400 the client would have to special-case.
- Unregister is scoped to the caller's `retailer_id`, so a leaked token can't mute another shop.
- Register upserts by token: a device that signs in as someone else moves with its token, so the previous person stops getting pings.
- Stale `disabled_at` rows are not pruned yet (the app role has no DELETE). Add a purge-role sweep if the table grows; only retailer hard-delete removes rows today.

## Slice 2 notes

- The producer `addEnquiryPushJob` lives in `jobs/enquiry-push.ts`, not `jobs/index.ts`: the public enquiry routes import it, and `jobs/index.ts` drags the purge job and `getPurgePrisma` into every route test that loads them (3 existing suites broke on exactly that).
- `purge-retailer-now.ts` deliberately does **not** name `staff_push_devices`: the FK cascades (RC-050 holds), and naming a table there trips the RC-030 `purge-rls-policy` guard, which is tied to migration 111's already-applied list. Pinned by `lib/staff-push-migration.test.ts`.
- Delivery is at-least-once. If a later 100-device chunk fails, the BullMQ retry re-sends earlier chunks; a shop has a handful of devices, so one chunk is the norm.
- Receipts run as a 15-minute delayed job per send (not a cron), so there is no `repeat.limit` to get wrong (RC-062).

## Not verified / open

- No device has received a push. Slice 3 + FCM + EAS rebuild are required before any end-to-end claim.
- `expo-notifications` adds `POST_NOTIFICATIONS`; confirm the AD_ID CI guard and manifest check still pass when it lands (slice 3).
