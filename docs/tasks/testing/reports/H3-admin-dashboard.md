# H3 — Admin dashboard (`apps/web/src/app/admin`, `/v1/admin/*`)

Date: 2026-10-26 · Branch: `fix/team-otp-fail-closed-rc085` · Mode: hacker (task-4)

## Method and target

- **No local or staging server was started.** `apps/api/.env` and `apps/web/.env*` point at the prod-region pooler / prod API, so the full app was not run.
- Code review plus **one local Fastify `inject()` harness** (session scratchpad, not the repo). It mounts the real `adminAuthPreHandler` from `apps/api/src/routes/admin-auth.ts` with stub handlers, uses fake in-memory `TEAM_JWT_SECRET` / `ADMIN_API_KEY` values, and has no DB, no network and no env files. "Confirmed (local harness)" below means the guard was proven bypassable in that harness. It was not tested against a deployed API, and how Railway's edge treats `%XX` in paths was not checked.
- `rtk` is not installed. Plain `grep`/`sed`/`tsx` were used.
- No secrets read. No requests sent to any remote host.

## Summary

| ID | Title | Severity | Status |
| --- | --- | --- | --- |
| H3-1 | Percent-encoded path segment skips the Super-Admin gate (RC-034 list) | High | Confirmed (local harness) |
| H3-2 | Admin gate is a role deny-list: `SUPPORT_MANAGER` gets full standard-admin power | Medium | Confirmed (local harness) for reach; impact Plausible |
| H3-3 | Admin gate trusts the team JWT's role with no DB check: removed or demoted members keep access up to 12 h | Medium | Plausible |

Not exploitable (with evidence) and could-not-verify items are listed at the end.

---

### H3-1 Percent-encoded path segment skips the Super-Admin gate             Severity: High
Attacker: staff (any team member with a non-agent role, e.g. `MARKETING_MANAGER`, `SUPPORT_MANAGER`), or anyone holding a plain-ADMIN session
Goal: use every Super-Admin-only surface: `/query` (SQL console on the replica), `deletion-vault`, `plan-pricing`, `plan-limits`, `plan-features`, `settings` (incl. `/settings/theme`), `support-sessions` (global switch), `integrations` / `ai-providers` (credentials), `referral` (payout trigger, clawback), `backups`, `audit-log`, `gst`, `invoices`.
Preconditions: a valid team token whose role is not `SUPER_ADMIN`, `MARKETING_AGENT` or `SUPPORT_AGENT`.
Steps:
1. Log in through `/v1/team/login` as a manager and take the token.
2. `PUT /v1/admin/%70lan-pricing` with headers `x-admin-key: <token>`, `x-csrf-token: abc`, `Cookie: csrf-token=abc` (the CSRF pair is attacker-chosen, see "Not exploitable").
3. Fastify's router (find-my-way 9.7.0) percent-decodes the path and runs the `/plan-pricing` handler. The guard compares the raw `request.url` segment `%70lan-pricing` against the list, finds no match, and lets the request through.
4. The same works for any segment, e.g. `POST /v1/admin/%71uery` → SQL console, `GET /v1/admin/%61udit-log`.
Impact: RC-034's boundary is defeated for every Super-Admin-only route. Pricing can be changed for every retailer, all retailer/customer PII can be read through the replica SQL console, deletion-vault actions can be run, provider credentials can be edited, and referral payouts can be triggered. Handlers that re-check `request.adminRole` themselves (e.g. `DELETE /retailers`, `admin-retailers-list.ts:149`) still hold.
Evidence:
- `apps/api/src/routes/admin-auth.ts:173`: `isSuperAdminOnlyAdminPath(request.url)` reads the raw URL.
- `packages/shared/src/constants/admin-access.ts:168-180`: `adminPathSegment` lower-cases the path but never decodes it.
- Local harness output (MARKETING_MANAGER token; SUPPORT_MANAGER gives the same results):
  ```
  GET /v1/admin/audit-log        403 "Access denied — Super Admin privileges required"
  GET /v1/admin/%61udit-log      200 {"reached":"audit-log"}
  PUT /v1/admin/plan-pricing     403 "Access denied — Super Admin privileges required"
  PUT /v1/admin/%70lan-pricing   200 {"reached":"plan-pricing"}
  ```
- `admin-route-guard.test.ts` / `admin-access.test.ts` only test literal paths. No encoded-path case exists.
Fix: classify on the **matched route pattern**, which Fastify has already decoded, not on the raw URL. Keep the raw URL only as a fallback for 404s.
```diff
--- a/apps/api/src/routes/admin-auth.ts
+++ b/apps/api/src/routes/admin-auth.ts
@@ export async function adminAuthPreHandler(
   if (!isIpAllowlisted(request.ip)) throw forbidden('Access denied — IP not allowlisted');
 
+  // H3-1: classify on the matched route pattern (already percent-decoded by
+  // the router), never the raw URL — `/v1/admin/%70lan-pricing` routes to
+  // /plan-pricing but its raw segment matched no list entry.
+  const routePath = request.routeOptions?.url ?? request.url;
+
-  if (adminPathSegment(request.url) === 'login') return;
+  if (adminPathSegment(routePath) === 'login') return;
@@
-  if (info.role !== 'SUPER_ADMIN' && isSuperAdminOnlyAdminPath(request.url)) {
+  if (info.role !== 'SUPER_ADMIN' && isSuperAdminOnlyAdminPath(routePath)) {
     throw forbidden('Access denied — Super Admin privileges required');
   }
```
Defence in depth in the shared helper, so the web layout gets the same protection:
```diff
--- a/packages/shared/src/constants/admin-access.ts
+++ b/packages/shared/src/constants/admin-access.ts
@@ export function adminPathSegment(
   const withoutQuery = pathWithQuery.split('#')[0]?.split('?')[0] ?? '';
-  const lower = withoutQuery.toLowerCase();
+  let decoded: string;
+  try {
+    decoded = decodeURIComponent(withoutQuery);
+  } catch {
+    return '\u0000invalid'; // malformed escape: never equals a STANDARD segment, never 'login'
+  }
+  const lower = decoded.toLowerCase();
```
(If the decode fallback is used, `isSuperAdminOnlyAdminPath` should also return `true` for the invalid marker so it fails closed. Simplest: `if (segment === '\u0000invalid') return true;`.)
Add a test to `admin-route-guard.test.ts`: a plain-ADMIN token on `PUT /v1/admin/%70lan-pricing` and `POST /v1/admin/%71uery` must get 403.
Status: Confirmed (local harness)

---

### H3-2 Admin gate is a role deny-list: `SUPPORT_MANAGER` gets full standard-admin power             Severity: Medium
Attacker: staff (`SUPPORT_MANAGER`), or any future `TeamRole` value
Goal: standard-admin actions the role was never meant to have: suspend retailers, change any retailer's plan to `PRO`/`ACTIVE` without payment, extend trials, set unlimited quota overrides (`limit_per_period: -1`), block customers, read customer records and F-037 engagement drill-downs.
Preconditions: a `SUPPORT_MANAGER` team account (manager invite).
Steps:
1. Log in through `/v1/team/login` as a `SUPPORT_MANAGER`.
2. `POST /v1/admin/retailers/<id>/change-plan` `{"plan":"PRO","status":"ACTIVE"}` with the token in `x-admin-key` and a matching CSRF pair.
3. `POST /v1/admin/retailers/<id>/overrides` `{"resource_type":"AI_TAGGING_CALL","limit_per_period":-1,"period":"MONTH"}`.
Impact: the web UI describes this role as "Access to manage support tickets, customer inquiries, and retailer support issues" (`apps/web/src/app/admin/team-members/page.tsx:63`). The API grants it the same power as `MARKETING_MANAGER` ("Admin / Manager (Standard Access)", line 61). A support manager can hand out free PRO plans and unlimited AI quota (paid provider cost) and can suspend stores. Combined with H3-1, it reaches Super-Admin-only routes too. Any role added to `TeamRole` later becomes an admin by default.
Evidence:
- `apps/api/src/routes/admin-auth.ts:162`: only `MARKETING_AGENT` and `SUPPORT_AGENT` are rejected (deny-list). `:79-83`: any other team role passes, and a missing role defaults to `'ADMIN'`.
- `verifyAdminSession` (`admin-auth.ts:50-58`) uses an allow-list (`SUPER_ADMIN`/`ADMIN`) but is not the function the preHandler calls. Two answers to one question (RC-073 shape).
- Harness: `SUPPORT_MANAGER GET /v1/admin/retailers 200`.
- Money routes are in the standard `retailers` segment on purpose (`admin-retailers-list.ts:147`: "standard Admin accounts can suspend/extend/change-plan but not destroy"): `admin-retailers-detail.ts:100` (extend-trial), `:142` (change-plan), `admin-retailers-management.ts:28` (overrides), `:134` (suspend).
Fix: replace the deny-list with an allow-list, and decide per role:
```diff
--- a/apps/api/src/routes/admin-auth.ts
+++ b/apps/api/src/routes/admin-auth.ts
@@
-  // Field staff / surveyors have NO admin dashboard access
-  if (info.role === 'MARKETING_AGENT' || info.role === 'SUPPORT_AGENT') {
+  // H3-2: allow-list, so a new or unexpected role is denied by default.
+  // 'ADMIN' = a plain admin session JWT signed by signAdminSession(email, 'ADMIN').
+  const ADMIN_PANEL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MARKETING_MANAGER'];
+  if (!ADMIN_PANEL_ROLES.includes(info.role)) {
     throw forbidden('Access denied — staff accounts cannot access the admin panel');
   }
```
and drop the `?? 'ADMIN'` default at `admin-auth.ts:83` (`verifyTeamToken` already rejects a token with no role). If `SUPPORT_MANAGER` needs the support-ticket pages, give it a separate small segment list rather than all of `STANDARD_ADMIN_ADMIN_SEGMENTS`. Owner decision: should `change-plan` / `overrides` / `extend-trial` move to Super Admin (handler check like `admin-retailers-list.ts:149`)?
Status: Confirmed (local harness) for reach; free-plan and quota impact Plausible (handlers not run, no DB)

---

### H3-3 Admin gate trusts the team JWT's role with no DB check             Severity: Medium
Attacker: none (insider). A team member who has been removed, deactivated or demoted.
Goal: keep admin (or Super-Admin) access after offboarding.
Preconditions: a team token issued before the member was deactivated or had their role changed (TTL 12 h, `team-auth.ts:38`).
Steps:
1. A `SUPER_ADMIN` team member logs in and keeps the token.
2. The owner sets `is_active=false` or changes the role to `SUPPORT_AGENT` in Team Members.
3. The ex-member keeps calling `/v1/admin/*` with the old token. It still verifies, and `role: SUPER_ADMIN` comes from the JWT.
Impact: offboarding takes up to 12 h to apply, and there is no way to revoke early short of rotating `TEAM_JWT_SECRET`, which logs out every staff member. The `/v1/team/*` routes do the DB check. The admin gate, which is the more powerful one, does not.
Evidence:
- `apps/api/src/routes/admin-auth.ts:79-85`: `verifyTeamToken` only, no `prisma.teamMember` lookup.
- `apps/api/src/plugins/team-auth.ts:42-51`: pure JWT verify.
- Contrast `apps/api/src/routes/team/team-helpers.ts:101-106`: team routes re-read `{ id, role, is_active }` and 403 "Account inactive or removed".
- Related but separate: H1-8 (the env admin session has no revocation). This finding is about team tokens.
Fix: in `adminSessionInfo`, after `verifyTeamToken`, re-read the member and use the DB role:
```diff
   } catch {
     const teamClaims = await verifyTeamToken(token);
-    if (teamClaims) {
-      return {
-        email: teamClaims.sub,
-        role: teamClaims.role ?? 'ADMIN',
-      };
-    }
-    return null;
+    if (!teamClaims) return null;
+    // H3-3: the JWT's role is a snapshot; deactivation/demotion must apply now.
+    const member = await prisma.teamMember.findUnique({
+      where: { id: teamClaims.sub },
+      select: { role: true, is_active: true },
+    });
+    if (!member?.is_active) return null;
+    return { email: teamClaims.sub, role: member.role };
   }
```
(`/v1/admin/session` stays DB-free for env-admin sessions. Team sessions there would now hit the DB. That is acceptable, or the check can be skipped only for the `session` segment.) Model name and field names must be checked against `schema.prisma` before applying.
Status: Plausible (code-only, no DB)

---

## Not exploitable (checked)

| Attack | Result | Evidence |
| --- | --- | --- |
| Retailer token on `/v1/admin/*` | Rejected. Retailer JWTs are Supabase-signed (`SUPABASE_JWT_SECRET` / JWKS). The admin gate accepts only `ADMIN_API_KEY`, the admin-session secret, or `TEAM_JWT_SECRET`. These stay separate unless an operator sets two secrets to the same value (config note: Supabase tokens carry `role: "authenticated"`, which the H3-2 deny-list would admit; the allow-list fix closes that too). | `plugins/auth.ts:73,105-114`; `admin-auth.ts:66-86`; only signers in the API: `team-auth.ts:34,73,127`, `admin-auth.ts:41` |
| Catalog-upload / support-session tokens on `/v1/admin/*` | Rejected. Same `TEAM_JWT_SECRET`, but no `role` claim, so `verifyTeamToken` returns null. | `team-auth.ts:47,73-82,127-138` |
| `MARKETING_AGENT` / `SUPPORT_AGENT` tokens | Rejected on literal and encoded paths (harness: 403 on all 5 probes). | `admin-auth.ts:162` |
| CSRF on admin mutations | Not exploitable. Auth is the custom `x-admin-key` header, which a cross-site form or `fetch` cannot set without a CORS preflight. The double-submit cookie (`csrf-token`, httpOnly, `SameSite=None; Secure` in prod) adds no strength, because the attacker who already holds a key can pick both halves. It is harmless. CORS config is H8's scope (T2.5). | `admin-auth.ts:181-204`; `admin.ts:122-135,173-183` |
| Admin session fixation | Not exploitable. The token is minted server-side at login and stored in `sessionStorage` (per tab). No route or page accepts a token from the URL. | `admin.ts:137-143`; `LoginScreen.tsx:103-104,190-191`; `grep searchParams.get('token'\|'key')` in `app/admin` → none |
| Stored XSS reaching admin (shop name, tickets, social templates, bug reports) | No sink found. No `dangerouslySetInnerHTML` / `innerHTML` / `srcDoc` in `apps/web/src/app/admin`. Every dynamic `href` is internal or `tel:` (`survey/page.tsx:208`). Bug-report `screenshot_url` comes from `verifyUpload()`, not the client. `<img src>` cannot run script. RC-077's `safeHttpUrl` fix still holds. | `retailers-bug-reports.ts:40-62`; `social-templates/page.tsx:239,397` |
| `DELETE /v1/admin/retailers` as plain admin (even via H3-1) | Blocked by the handler's own `adminRole` check. | `admin-retailers-list.ts:149` |

## Could not verify

- Whether Railway's edge or the web app re-encodes or rejects `%XX` in `/v1/admin/...` before Fastify sees it. If it normalises, H3-1 may not reproduce in prod. The fix is needed either way.
- Which Super-Admin-only handlers (beyond `DELETE /retailers`) re-check `adminRole` themselves and so survive H3-1. Not swept (time box).
- Web `/admin` page gating for encoded paths. It is UI only (the API is the boundary), so it was not tested.
- Missing CSP on the web app (`next.config.mjs` sets `X-Frame-Options` only). Cross-reference T2.6 / H8, not re-reported.

## Cross-references (not re-reported)

RC-034 (the list H3-1 bypasses), RC-077, RC-087, RC-089, RC-021, RC-052, T2.4, T2.6, T2.5 F1, SC-1, H1-4…H1-9 (H1-8 = env admin session revocation), H2-1…H2-6.


---

## Fixes applied 2026-10-26 (Batch 2) — before / after

Branch `fix/team-otp-fail-closed-rc085`, not committed, not deployed. Owner decisions: `SUPPORT_MANAGER` = support pages only; `change-plan` / `overrides` / `extend-trial` = Super Admin only.

| Finding | RC | Before | After |
| --- | --- | --- | --- |
| H3-1 | RC-090 | `PUT /v1/admin/%70lan-pricing` as `MARKETING_MANAGER`: 200 (also `%71uery`, `%61udit-log`) | 403 on all three; SUPER_ADMIN still 200; malformed escape fails closed |
| H3-2 | RC-091 | `SUPPORT_MANAGER`, unknown roles and `role: "authenticated"` tokens reached every standard-admin route; change-plan / overrides / extend-trial open to plain ADMIN | allow-list of 4 panel roles; `SUPPORT_MANAGER` limited to 13 support segments; the four money routes 403 for non-SUPER_ADMIN |
| H3-3 | RC-092 | deactivated, deleted or demoted member kept access up to 12 h from the JWT role | DB re-read on every team-token request: inactive or missing = 403, DB role wins |

Tests: new `admin-gate.test.ts` (17) and `admin-money-routes.test.ts` (8); `admin-access.test.ts` +2. Red first (14 of 25 new tests failed on the unfixed code), green after. Full API suite 2434 passed / 5 skipped; `tsc` clean.

Follow-ups, not done: hide Change plan / Overrides / Extend trial in the admin UI for non-super admins; `team-helpers.ts:76` (`verifyAdminSession`) still trusts the JWT role for `/v1/team/*` admin access (same RC-092 shape, outside Batch 2); whether Railway's edge normalises `%XX`.
