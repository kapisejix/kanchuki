# F-046 — Retailer staff push notifications (F-044 Release 3, E4 real push)

**Status:** 🟨 Slices 1–3 merged to `main` 2026-10-19 (PRs #137, #138). **Built, not device-tested; needs FCM setup + an EAS rebuild.** Slice 4 (docs index) done 2026-10-19. Migration 135: confirm it is applied with the check under "Owner steps".
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
| 3 | ✅ Built 2026-10-19 (**not device-tested**): `expo-notifications ~0.32.17`; `lib/push-notifications.ts` (channel `enquiries`, permission asked once per install, token register, best-effort unregister on sign-out), `lib/use-push-registration.ts` (wired in `AppShell`: owner + shop staff only, skipped for TeamMembers and catalog delegates; a tap or cold start opens `/enquiries`), `lib/enquiry-push-events.ts` (focused Home refetches the badge on a push), `app.json` plugin, `app.config.ts` `googleServicesFile` from env `GOOGLE_SERVICES_JSON`. The 30 s poll stays as fallback | FCM setup, EAS rebuild, device test |
| 4 | ✅ Done 2026-10-19: PRO-REQUIREMENTS §43, BUILD-LOG part-6, PLAN.md, CLAUDE.md index row 103 (owner approved the text); RC rows only if bugs appear | none |

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

## Slice 3 notes

- Permission is requested right after sign-in, **once per install** (`push_permission_asked`). After a dismiss the way back is the phone's Settings; re-asking every launch gets the permission blocked for good.
- Sign-out calls `unregisterPush()` first (capped at 2 s so a dead network never delays logout). A session that ends by token expiry skips it, so that device keeps pinging until Expo reports `DeviceNotRegistered` (removed staff are filtered server-side regardless). Known gap, not fixed.
- The badge pub/sub is its own module so the badge hook does not import native notifications or the API client.
- A tap on a cold start is held until the session is authenticated (the inbox route only exists behind `Stack.Protected`); the first render after sign-in then calls `router.push('/enquiries')`. This is the part most likely to need a fix on a real device.

## Owner steps before slice 3 can be tested

1. **Apply migration 135**, then confirm with the check below.
2. **Firebase:** create a project, add an Android app with package `app.kanchuki.retailer` (`packages/shared/src/constants/app-identity.ts`), download `google-services.json`.
3. **EAS:** `eas credentials`, Android, upload an FCM V1 service-account key. Add `google-services.json` as an EAS file env var named `GOOGLE_SERVICES_JSON` (all build profiles). iOS: EAS manages the APNs key.
4. **Rebuild** with EAS. `expo-notifications` is a native module, and Expo Go cannot receive remote push on SDK 54.
5. Run the AD_ID guard on that build (`scripts/check-aab-ad-id.mjs`); the plugin adds `POST_NOTIFICATIONS`.
6. Sign in on a device as the owner, then have a customer send an enquiry from a collection link.

```sql
select
  (select relrowsecurity from pg_class where relname = 'staff_push_devices') as rls_on,
  (select count(*) from pg_policies where tablename = 'staff_push_devices') as policies,
  has_table_privilege('kanchuki_app', 'staff_push_devices', 'SELECT,INSERT,UPDATE') as app_can_write,
  has_table_privilege('kanchuki_app', 'staff_push_devices', 'DELETE') as app_can_delete;
-- expected: true | 1 | true | false
```

## Not verified / open

- No device has received a push. Slice 3 + FCM + EAS rebuild are required before any end-to-end claim.
- `expo-notifications` adds `POST_NOTIFICATIONS`; confirm the AD_ID CI guard and manifest check still pass when it lands (slice 3).
