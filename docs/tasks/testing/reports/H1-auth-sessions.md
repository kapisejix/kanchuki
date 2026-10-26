# H1 — Auth + sessions (hacker mode)

- **Date:** 2026-10-26
- **Branch:** `fix/web-proxy-hardening-rc084`
- **Target:** code-only review. No local/staging DB was used (`apps/api/.env` points at the prod-region pooler, so the API was not started). Nothing is "Confirmed"; each attack is **Plausible** or **Not exploitable**, with file:line proof.
- **Tooling note:** `rtk` is not installed; plain `grep`/`sed` were used.
- **Commands run:** `grep -n` / `sed -n` over `apps/api/src/routes/auth.ts`, `lib/msg91-otp.ts`, `lib/staff-invite.ts`, `routes/admin.ts`, `routes/admin-auth.ts`, `routes/team/team-session.ts`, `routes/team/team-helpers.ts`, `plugins/team-auth.ts`, `plugins/auth.ts`, `routes/support-sessions.ts`, `routes/retailers/retailers-profile.ts`, `index.ts`.
- **Cross-refs (not re-reported):** RC-015, RC-021, RC-064, T3.6-a, SC-1, and T2.5 F1 (`trustProxy` / client-IP), which H1-4 depends on.

## Result summary

| Severity | Count | IDs |
| --- | --- | --- |
| Critical | 1 | H1-1 |
| High | 2 | H1-2, H1-3 |
| Medium | 4 | H1-4, H1-5, H1-6, H1-7 |
| Low | 2 | H1-8, H1-9 |
| Not exploitable | 5 | staff invite guessing, staff invite reuse, support-session escalation, refresh after suspension, team JWT forgery |

Eight of the nine findings are **Plausible**; H1-9 is **Could not verify** (depends on MSG91 behaviour). This was a code-only review with no live test.

## Findings table

| ID | Sev | File:line | Issue | Fix |
| --- | --- | --- | --- | --- |
| H1-1 | Critical | `routes/team/team-session.ts:236-238, 245-247, 321-324` | Team OTP verify and password reset accept `123456` whenever a Redis call throws, and the very first call on the lazily built client throws by design | Remove the `123456` fallbacks and fail closed; await `'ready'` |
| H1-2 | High | `routes/team/team-session.ts:64, 196` | `/v1/team/login` and `/v1/team/otp/verify` have no per-route limit. A SUPER_ADMIN team token is admin, so this gets around `/admin/login`'s 5 per 15 min limit | Add the same `rateLimit` config, plus a per-email counter |
| H1-3 | High | `lib/msg91-otp.ts:172` | Every live OTP is logged in plaintext (`[otp] Generated OTP for +91…: <code>`) | Delete the log line |
| H1-4 | Medium | `lib/msg91-otp.ts:41,45,255-269`, `index.ts:70,134-144`, `routes/auth.ts:257,340` | Retailer OTP brute force: 5 guesses per code, a new code every 60 s, no daily cap, no per-route limit, and the per-IP key can be spoofed (`trustProxy: true`) | Per-phone daily failure cap plus per-route limits |
| H1-5 | Medium | `routes/auth.ts:123-161`, `routes/team/team-session.ts:13-24` | `OTP_TEST_BYPASS=1` with `OTP_TEST_PHONES=*` accepts any phone and any code. Default phones are used when the list is unset. Nothing stops it in production | Refuse it in production, drop `*`, drop the defaults |
| H1-6 | Medium | `routes/admin-auth.ts:31-34, 45-47, 66-72` | The admin session HMAC key is `"admin-session:" + ADMIN_API_KEY` with no check for an empty key, so an unset key lets anyone forge an admin JWT | Throw when the key is empty (as `team-auth.ts:27-30` does) |
| H1-7 | Medium | `routes/auth.ts:427-434, 201-209` | The Apple review code has no attempt counter. While `REVIEW_PHONE`/`REVIEW_OTP` are set, a 1e6 search takes over the review account | Count failures in Redis and lock after 5 |
| H1-8 | Low | `routes/admin.ts:66-115`, `routes/admin-auth.ts:36-43` | Admin login is one shared password with no 2FA (TOTP removed, but `ADMIN_TOTP_SECRET` is still listed in CLAUDE.md §9). The 12 h JWT cannot be revoked | Add TOTP back for admin, or put admin behind Cloudflare Access; add a session `jti` deny-list |
| H1-9 | Low | `lib/msg91-otp.ts:310-361`, `routes/auth.ts:439-441` | MSG91 widget access token is not recorded as used, so a captured token can be replayed until MSG91 expires it | Store `sha256(token)` in Redis with `SET NX EX 900`; reject on a repeat |

---

### H1-1 Team OTP / password reset fail open to `123456` on any Redis error  Severity: Critical
Attacker: anonymous
Goal: reset the password of any active `TeamMember` (including role `SUPER_ADMIN`/`ADMIN`), log in, and use the token as an admin (`verifyAdminSession` accepts team tokens with those roles, `routes/admin-auth.ts:49-53`).
Preconditions: knows a team member's email (`ADMIN_EMAIL` style addresses are guessable), and either (a) the request is the first Redis call on `sessionRedis` in that process (after every deploy or restart), or (b) Redis is briefly unreachable.
Steps:
1. Right after a deploy, before anyone has used the team routes: `POST /v1/team/reset-password` `{"email":"<member>","reset_code":"123456","new_password":"Attacker123!"}`.
2. `getSessionRedis()` builds a new client with `enableOfflineQueue: false` (`team-session.ts:51-57`) and calls `getdel` at once (`:320`). ioredis rejects with `Stream isn't writeable` while the socket is still connecting. This is the handshake race CLAUDE.md documents as fixed elsewhere 2026-08-13, but it was never fixed here.
3. The `catch` runs `if (body.data.reset_code === '123456') codeValid = true;` (`:322-324`), and the password is overwritten (`:333-336`).
4. `POST /v1/team/login` with the new password returns a team JWT with the member's role, which is an admin session.
The same fail-open exists for team OTP login on the email path (`:244-247`) and the non-MSG91 phone path (`:234-238`). Those need no password at all: `POST /v1/team/otp/verify {identifier:<email>, otp:"123456"}`.
Impact: full platform admin takeover (suspend or delete retailers, pricing, vault).
Evidence:
```ts
// team-session.ts:319-325
try {
  const redis = getSessionRedis();
  const stored = await redis.getdel(`team:pwd-reset:${member.email}`);
  if (stored && stored === body.data.reset_code) { codeValid = true; }
} catch {
  // Redis fallback for dev
  if (body.data.reset_code === '123456') codeValid = true;
}
```
Fix:
```diff
--- a/apps/api/src/routes/team/team-session.ts
@@ getSessionRedis
 function getSessionRedis(): Redis {
   sessionRedis ??= new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
     maxRetriesPerRequest: 1,
     enableOfflineQueue: false,
     connectTimeout: 10_000,
   });
   return sessionRedis;
 }
+// Fail closed: any Redis error is an unverifiable code, never a dev default.
+async function readOnce(key: string): Promise<string | null> {
+  const redis = getSessionRedis();
+  await awaitRedisReady(redis); // export the helper from lib/msg91-otp.ts
+  return redis.getdel(key);
+}
@@ otp/verify (phone, non-MSG91)
-        try {
-          const redis = getSessionRedis();
-          const stored = await redis.getdel(`team:otp:${member.phone}`);
-          if (stored === otp) verified = true;
-        } catch {
-          // Dev mock
-          if (otp === '123456') verified = true;
-        }
+        const stored = await readOnce(`team:otp:${member.phone}`).catch(() => null);
+        if (stored !== null && stored === otp) verified = true;
@@ otp/verify (email)
-      try {
-        const redis = getSessionRedis();
-        const stored = await redis.getdel(`team:email-otp:${member.email}`);
-        if (stored === otp) verified = true;
-      } catch {
-        if (otp === '123456') verified = true;
-      }
+      const stored = await readOnce(`team:email-otp:${member.email}`).catch(() => null);
+      if (stored !== null && stored === otp) verified = true;
@@ reset-password
-    let codeValid = false;
-    try {
-      const redis = getSessionRedis();
-      const stored = await redis.getdel(`team:pwd-reset:${member.email}`);
-      if (stored && stored === body.data.reset_code) {
-        codeValid = true;
-      }
-    } catch {
-      // Redis fallback for dev
-      if (body.data.reset_code === '123456') codeValid = true;
-    }
+    const stored = await readOnce(`team:pwd-reset:${member.email}`).catch(() => null);
+    const codeValid = stored !== null && stored === body.data.reset_code;
```
Also make the `set` calls in `/otp/send` and `/forgot-password` (`:143-149, 162-167, 279-284`) await `'ready'`, and return 503 on failure instead of emailing a code that can never be checked. Add a test: a Redis double that throws, and the route returns 401/422 for `123456`.
Status: Plausible (code path is certain; timing of the race is not tested live)

### H1-2 Team login gets around the admin login rate limit  Severity: High
Attacker: anonymous
Goal: brute-force the password of a SUPER_ADMIN/ADMIN team member.
Preconditions: knows a team member email.
Steps: `POST /v1/team/login {"email":"<member>","password":"<guess>"}` in a loop. Only the global limit of 200/min/IP applies (`index.ts:134-144`). `/admin/login` has `max: 5, timeWindow: 15 min` (`routes/admin.ts:69-72`). `/v1/team/login` (`team-session.ts:64`) and `/v1/team/otp/verify` (`:196`) have no `config.rateLimit`. With the XFF spoof in H1-4 the per-IP limit stops applying at all.
Impact: admin takeover on a weak password. The S-003 control can be sidestepped.
Evidence: `team-session.ts:64` `server.post('/login', async (request) => {`, with no options object.
Fix:
```diff
-  server.post('/login', async (request) => {
+  server.post('/login', { config: { rateLimit: { max: 5, timeWindow: 15 * 60 * 1000 } } }, async (request) => {
@@
-  server.post('/otp/verify', async (request) => {
+  server.post('/otp/verify', { config: { rateLimit: { max: 10, timeWindow: 15 * 60 * 1000 } } }, async (request) => {
```
Apply the same to `/otp/send`, `/forgot-password` and `/reset-password`. Per-IP limits alone fail while H1-4's `trustProxy` issue is open, so also add a per-email failure counter in Redis (lock for 15 min after 5 failures).
Status: Plausible

### H1-3 Plaintext OTP written to production logs  Severity: High
Attacker: insider, or anyone with Railway log / log-drain / Sentry breadcrumb access
Goal: log in as any retailer or team member (phone path) without the SIM.
Preconditions: read access to API logs.
Steps: trigger `POST /v1/auth/otp/send {"phone":"<victim>"}` (or wait for the victim to log in), read `[otp] Generated OTP for +91<phone>: <code>` from the logs, then `POST /v1/auth/otp/verify` with that code within 10 min.
Impact: account takeover of any retailer. The log also links phone numbers to codes (DPDP exposure).
Evidence: `lib/msg91-otp.ts:171-172`
```ts
// biome-ignore lint/suspicious/noConsoleLog: developer debugging — visible in Railway logs only
console.log(`[otp] Generated OTP for +91${phone}: ${otp}`);
```
This runs on the production MSG91 path (`routes/auth.ts:304`). The team phone path also calls it (`team-session.ts:140`).
Fix:
```diff
-      // biome-ignore lint/suspicious/noConsoleLog: developer debugging — visible in Railway logs only
-      console.log(`[otp] Generated OTP for +91${phone}: ${otp}`);
```
Also purge or limit retention of historic Railway logs that contain the line (owner action).
Status: Plausible (code certain; log contents not checked, no prod access)

### H1-4 Retailer OTP brute force: no daily cap, spoofable per-IP key  Severity: Medium
Attacker: anonymous
Goal: guess a victim's OTP and take over the retailer account. Side effect: SMS bombing of the victim (MSG91 cost).
Preconditions: victim phone number (public on storefront / WhatsApp links).
Steps:
1. `POST /v1/auth/otp/send {"phone":"<victim>","purpose":"login"}`. The per-phone cooldown is 60 s (`msg91-otp.ts:45,149`).
2. Up to 4 guesses: `POST /v1/auth/otp/verify {"phone":"<victim>","otp":"<guess>"}`. Each code allows 5 attempts and the 5th locks it (`:259-263`).
3. Repeat every 60 s: about 1,440 codes/day, about 5,760 guesses/day, roughly 0.5 %/day success and about 15 %/month. No daily per-phone cap exists.
4. The per-IP global limit is keyed on `request.ip` (`index.ts:143`) with `trustProxy: true` in production (`index.ts:70`), so a rotating `X-Forwarded-For` header escapes it (open item T2.5 F1). `/otp/send` and `/otp/verify` have no per-route `rateLimit` (`routes/auth.ts:257, 340`).
Impact: slow but unbounded account takeover, plus SMS spend and harassment.
Evidence: lines above. ≤50-request probe not run (no local target).
Fix (sketch): add a per-phone failure counter in Redis (`otp:fail:<phone>`, `INCR` + `EXPIRE 86400`), refuse sends and verifies after 10 failures/24 h, and add per-route limits:
```diff
-  server.post('/otp/send', async (request, reply) => {
+  server.post('/otp/send', { config: { rateLimit: { max: 5, timeWindow: 15 * 60 * 1000 } } }, async (request, reply) => {
@@
-  server.post('/otp/verify', async (request, reply) => {
+  server.post('/otp/verify', { config: { rateLimit: { max: 10, timeWindow: 15 * 60 * 1000 } } }, async (request, reply) => {
```
Resolve T2.5 F1 by setting `trustProxy` to the hop count or Railway's proxy CIDR, not `true`.
Status: Plausible

### H1-5 `OTP_TEST_BYPASS` has a wildcard and no production guard  Severity: Medium
Attacker: anonymous
Goal: log in as any phone with any code.
Preconditions: `OTP_TEST_BYPASS=1` left set in an environment. CLAUDE.md says to "unset once real users are live"; the prod value was not checked (no access).
Steps: if `OTP_TEST_PHONES` contains `*`: `POST /v1/auth/otp/verify {"phone":"<any>","otp":"000000"}` succeeds (`routes/auth.ts:160`). If `OTP_TEST_PHONES` is unset, the hard-coded defaults are used (`:123-131, 152`), including `9876543210` and `9999999999`, which may be real people's numbers. The team route keeps its own copy of the check (`team-session.ts:13-24`).
Impact: platform-wide account takeover while the flag is on.
Evidence: `routes/auth.ts:158-160`
```ts
if (process.env.OTP_TEST_BYPASS !== '1') return false;
const normalized = phone.replace(/\D/g, '').slice(-10);
if ((process.env.OTP_TEST_PHONES ?? '').includes('*')) return true;
```
Fix:
```diff
 function otpTestBypassActive(phone: string): boolean {
   if (process.env.OTP_TEST_BYPASS !== '1') return false;
+  if (process.env.NODE_ENV === 'production' && process.env.OTP_TEST_BYPASS_ALLOW_PROD !== '1') return false;
   const normalized = phone.replace(/\D/g, '').slice(-10);
-  if ((process.env.OTP_TEST_PHONES ?? '').includes('*')) return true;
   return otpTestPhones().has(normalized);
 }
```
Drop `DEFAULT_TEST_PHONES` (return an empty set when the env list is unset), point `team-session.ts` at the same function, and log a boot-time warning when the bypass is on. Owner: confirm `OTP_TEST_BYPASS` is unset in Railway prod.
Status: Plausible (config-dependent)

### H1-6 Admin session JWT can be forged when `ADMIN_API_KEY` is empty  Severity: Medium
Attacker: anonymous
Goal: full admin API.
Preconditions: an environment (staging, preview, a fresh Railway service) where `ADMIN_API_KEY` is unset or empty.
Steps: sign `{email:"x",role:"SUPER_ADMIN",sub:"admin"}` with HS256 using the key `admin-session:` and send it as the admin credential. `jwtVerify` passes (`admin-auth.ts:45-47, 66-72`). `validAdminKey` fails closed on an empty key (`:20-21`) but the session path does not. Same shape as RC-076, where an empty secret made the HMAC forgeable.
Impact: admin takeover of that environment (and any shared DB behind it).
Evidence: `routes/admin-auth.ts:31-34`
```ts
function sessionSecret(): Uint8Array {
  const key = process.env.ADMIN_API_KEY ?? '';
  return new TextEncoder().encode(`admin-session:${key}`);
}
```
Fix:
```diff
 function sessionSecret(): Uint8Array {
   const key = process.env.ADMIN_API_KEY ?? '';
+  if (key.length < 32) throw new Error('ADMIN_API_KEY not configured');
   return new TextEncoder().encode(`admin-session:${key}`);
 }
```
`verifyAdminSession` / `adminSessionInfo` already treat a throw as "not this token type" and fall through to the team token check, so the change fails closed.
Status: Plausible (config-dependent)

### H1-7 Apple review code has no attempt limit  Severity: Medium
Attacker: anonymous
Goal: take over the review demo account (and whatever store data it holds) while the review vars are set.
Preconditions: `REVIEW_PHONE` and `REVIEW_OTP` set. The review phone shows itself: `/otp/send` returns `bypass: true` only for it (`routes/auth.ts:269-272`), the same as the test bypass, so an attacker can find it by probing.
Steps: `POST /v1/auth/otp/verify {"phone":"<review phone>","otp":"<000000..999999>"}`. `reviewOtpMatches` is a timing-safe compare with no counter (`:201-209, 429-434`). 1e6 codes fit within the global limit plus the XFF spoof (H1-4).
Impact: account takeover of the review account. Low data value, but it can be used as a foothold.
Fix: count failures in the same Redis key shape as `verifyStoredOtp` (`otp:review:fail`, `INCR`, lock at 5/hour), and reply with the generic `OTP sent` shape (no `bypass` flag) for the review phone.
Status: Plausible (only while the vars are set)

### H1-8 Admin login: one shared password, no 2FA, no session revocation  Severity: Low
Attacker: anonymous (credential stuffing, phishing) or insider
Goal: admin takeover.
Evidence: `admin.login.test.ts:99` says "no TOTP / 2FA". `routes/admin.ts:79-115` checks env email + scrypt hash only. `signAdminSession` issues a 12 h HS256 JWT with no `jti` (`admin-auth.ts:36-43`). Logout cannot invalidate it, and the only kill switch is rotating `ADMIN_API_KEY`. CLAUDE.md §9 still lists `ADMIN_TOTP_SECRET`, which is stale.
Fix: either add TOTP back (`otplib`, window ±1, replay cache per step), or put `/admin` + `/v1/admin` behind Cloudflare Access. Add `jti` plus a Redis deny-list on logout. Doc fix: drop `ADMIN_TOTP_SECRET` from CLAUDE.md §9 (needs approval).
Status: Plausible (a design gap, not a bug)

### H1-9 MSG91 widget access token can be replayed  Severity: Low
Attacker: anyone who captures a `msg91_token` (proxy on the victim's device, logs, crash reports)
Goal: mint a fresh Supabase session for the victim's phone.
Steps: replay `POST /v1/auth/otp/verify {"phone":"<victim>","msg91_token":"<captured>"}`. The server re-checks with MSG91 (`msg91-otp.ts:310-361`) but never records the token as used. Whether MSG91 rejects a second verify is not known.
Fix:
```ts
// after verifyMsg91WidgetToken succeeds
const fresh = await redis.set(`otp:widget:${sha256(token)}`, '1', 'EX', 900, 'NX');
if (fresh !== 'OK') throw new AppError('INVALID_OTP', 'Invalid or expired OTP. Try again.', 401);
```
Status: Could not verify (depends on MSG91 behaviour)

---

## Not exploitable (with proof)

| Attack | Why it fails |
| --- | --- |
| Staff invite token guessing | 256-bit `randomBytes(32)`, stored as SHA-256, 7-day TTL (`lib/staff-invite.ts:20,24,33`). Checked for `status === 'pending'` and expiry (`routes/auth.ts:386`) |
| Staff invite reuse / forwarding | The phone is bound to the invite: a supplied phone must match (`:394-401`), otherwise it is derived from the invite, so the OTP has to come from the invited SIM. Marked `used` after verify (`:503-512`). The update is not a CAS on `status`, but a double use needs the same OTP twice (code is `GETDEL`'d), so no gain |
| Support-session escalation | The grant row is re-read on every request: status, expiry, ticket assignee, member active, retailer not suspended (`plugins/auth.ts:335-366, 559-574`). Routes are an allowlist per scope (`:279-324`). Only the owner can approve or revoke (`routes/support-sessions.ts:12-15`). MAINTENANCE `PUT /retailers/me` cannot change the WhatsApp number without an OTP (`retailers-profile.ts:23-30`). Every mutation is audit-logged (`plugins/auth.ts:414-438`) |
| Refresh token after suspension | `/auth/refresh` rejects suspended retailers (`routes/auth.ts:746-747`). Refresh-token reuse detection is a Supabase project setting and was not checked |
| Team JWT forgery | `TEAM_JWT_SECRET` fails closed when unset (`plugins/team-auth.ts:27-30`) |

## Not checked / follow-ups

- No live probes (≤50 requests) were run: no local or staging target. H1-1 and H1-4 should be re-run against a local API with a local Redis (kill Redis, then `POST /v1/team/reset-password` with `123456`).
- Prod env values not checked (no access): owner to confirm `OTP_TEST_BYPASS`, `REVIEW_PHONE`/`REVIEW_OTP` unset, and `ADMIN_API_KEY` set to ≥32 chars.
- Supabase Auth settings (refresh-token rotation and reuse interval) not checked.
- Admin cookie flags (`csrf-token` is `httpOnly` + `SameSite=None` in prod, `routes/admin.ts:124-133`) belong to H3.
- `teamAuthPreHandler` treats any path that starts with `/v1/team/login` as public (`team-helpers.ts:71`, `startsWith`). There is no colliding route today, but an exact match would be safer.
- Proposed RC IDs (after "apply"): H1-1 → RC-085 (fail-open dev fallback), H1-3 → RC-086, others as fixes land.

---

## Applied 2026-10-26: H1-1 (RC-085), H1-3 (RC-086)

| ID | Before | After |
| --- | --- | --- |
| H1-1 | `team-session.ts`: 3 `catch` blocks accepted `123456` on any Redis error, and the 3 `set` calls swallowed errors | `storeTeamCode`/`consumeTeamCode` await `'ready'` (`awaitRedisReady`, now exported from `lib/msg91-otp.ts`) and fail closed. `/otp/send` returns 503 when the store fails. `/forgot-password` skips the email when the store fails (same response, no enumeration). No `123456` anywhere in the file |
| H1-3 | `lib/msg91-otp.ts:171-172` logged `[otp] Generated OTP for +91<phone>: <code>` | Line deleted. `grep -rn "Generated OTP" apps/api/src` finds nothing |

Tests: `routes/team.test.ts` relied on the fallback. It now mocks `ioredis` with an in-memory fake, the happy paths read the code that was really stored, and a leftover `mockResolvedValueOnce` that the fallback had hidden is reset. 2 new tests cover `123456` with Redis throwing: 403 on the phone and email OTP paths, 422 on reset, and no password write.

Re-run:
- `npx vitest run src/routes/team.test.ts src/lib/msg91-otp.test.ts src/routes/auth-msg91.test.ts src/routes/auth-team.test.ts src/routes/admin.login.test.ts`: 5 files, 85/85 pass
- `npx vitest run src/routes/security.test.ts`: 6/6
- `npx tsc --noEmit`: clean
- `npx biome check` on the 3 changed files: clean

Not done: no live run against a local API + Redis; nothing committed or pushed. Owner action for RC-086: limit or purge Railway log retention. H1-2 and H1-4 through H1-9 are still open.
