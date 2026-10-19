# F-046 — Retailer staff push notifications (F-044 Release 3, E4 real push)

**Status:** 🟨 Slice 1 built 2026-10-19 on `feat/f-046-staff-push` (unmerged, migration 135 not applied). Slices 2–4 planned.
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
| 2 | Send helper + BullMQ job hooked into both enquiry creators (`public-collections.ts`, `public-my-style.ts`); collapse by enquiry id; disable token on `DeviceNotRegistered`; receipt check job (no `repeat.limit`, RC-062) | none |
| 3 | Mobile: `expo-notifications`, permission after login, register / unregister token, tap opens the Enquiries inbox, foreground refetch of the unread badge. 30 s poll stays as fallback | FCM setup, EAS rebuild, device test |
| 4 | Docs: PRO-REQUIREMENTS, BUILD-LOG part-6, CLAUDE.md index row, RC rows only if bugs appear | approval for the index row |

## Slice 1 notes

- Unregister is `POST`, not `DELETE`: avoids the Fastify v5 empty-JSON-body 400 the client would have to special-case.
- Unregister is scoped to the caller's `retailer_id`, so a leaked token can't mute another shop.
- Register upserts by token: a device that signs in as someone else moves with its token, so the previous person stops getting pings.
- Stale `disabled_at` rows are not pruned yet (the app role has no DELETE). Add a purge-role sweep if the table grows; only retailer hard-delete removes rows today.

## Not verified / open

- No device has received a push. Slice 3 + FCM + EAS rebuild are required before any end-to-end claim.
- `expo-notifications` adds `POST_NOTIFICATIONS`; confirm the AD_ID CI guard and manifest check still pass when it lands (slice 3).
