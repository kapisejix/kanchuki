# Disaster Recovery Runbook

**Audience:** owner / on-call operator. **Last reviewed:** 2026-09-24.
**Scope:** production (`api.kanchuki.app`, `kanchuki.app`, the Kanchuki mobile app).

> **Read this before you need it.** Every scenario below assumes you are under pressure.
> Steps that are dashboard-only are marked **(dashboard)**; steps that need a terminal are
> marked **(CLI)**. Nothing in this document authorizes a destructive action without a
> verified backup — when in doubt, stop and take another backup first.

---

## 0. What's where (data inventory)

| Data | Where it lives | Backup story | Loss impact |
|---|---|---|---|
| Retailers, products, photos metadata, customers, collections, subscriptions, referral ledger, audit log | **Supabase Postgres 16** (prod project; pooled `DATABASE_URL` for traffic, direct non-pooler connection for migrations) | Supabase **automated daily backups + Point-in-Time Recovery** (plan-dependent retention — check the dashboard, don't assume) | **Severe** — this is the business. Recovered by PITR, not by re-running code. |
| Product photos, banners, logos, generated images, invoices, showcase designs | **Cloudflare R2** bucket `kanchuki-prod` (+ other buckets) | No versioning configured by default — **verify in the R2 dashboard** | **Severe for photos** — DB rows reference R2 keys; losing objects breaks every image. |
| Session state, rate-limit counters, OTP slots, BullMQ job queues + repeatable schedules, public-response cache | **Upstash Redis** | **None — treated as ephemeral** | **Low for data, medium for operations**: in-flight jobs are lost and repeat schedules must be re-registered (see §6). OTP slots are 10-minute-lived anyway. |
| Deletion Vault (snapshots of hard-deleted records) | **Separate Railway Postgres** (`VAULT_DATABASE_URL`, INSERT-only `vault_app`) | Railway Postgres backups (verify in dashboard) | **Medium** — compliance/audit value, not live traffic. |
| App + API containers | **Railway** (two services: API, Web) | Deploys are rebuilt from **GitHub `main`**; Railway keeps the last N deployments for rollback | **Low** — a rebuild restores the app. |
| Fashion V-Tone (try-on) service | Self-hosted on **Hetzner CX43**, shared-secret auth | Rebuildable from the repo + model weights re-download | **Low/medium** — try-on degrades; it is not in the MVP launch path. |
| Secrets / config | Railway service variables + Admin → Integrations (DB-backed) | Not backed up by us; recoverable from the owners' password managers | **High if lost** — see §7. |

### Targets

| Metric | Target | Reality |
|---|---|---|
| **RPO** (max data loss) | ≤ 24 h, ideally minutes | Bounded by Supabase backup/PITR granularity. **Confirm the actual retention on the Supabase plan — this is an owner action, not a code fact.** |
| **RTO** (time to restore) | ≤ 4 h for DB; ≤ 30 min for a bad deploy | PITR restore is the long pole and is done by Supabase, not us. |

---

## 1. Before anything else (first 5 minutes of any incident)

1. **Stop writing.** If the corruption is ongoing (a runaway job, a bad migration, a rogue bulk delete), the fastest way to bound the damage is to stop the writers.
   - **(dashboard)** Railway → API service → **⋯ → Pause** (or scale to 0). Web can stay up; it will show API errors, which is honest.
2. **Write down the time** (IST and UTC). Every recovery point is expressed relative to this.
3. **Do not run `railway up`.** Ever. It ships your laptop's files, not GitHub's — that is a documented cause of real incidents here. Redeploy from GitHub only.
4. **Open a timeline doc** and timestamp every action. Post-incident review depends on it.
5. **Announce** (retailers on WhatsApp/status page if the outage is visible; internal team in the ops channel).

---

## 2. Scenario A — Database loss or corruption (Supabase Postgres)

**Symptoms:** mass 500s, `relation does not exist`, data visibly wrong/reverted, a bad migration applied.

### 2a. Recover from a bad migration (most common)

If the migration only *added* something, roll forward with a corrective migration (preferred — never hand-edit prod). If it *destroyed* data:

1. **(dashboard)** Supabase → your project → **Database → Backups**. Confirm the newest
   pre-incident restore point.
2. **Clone first, restore second.** Create a **restore to a new project / branch**, not over
   the live one. Verify the data there.
3. Only after verification, point `DATABASE_URL` / `DATABASE_URL_POOLER` at the restored
   instance **(dashboard)** Railway → API service → Variables. Railway restarts the service.
4. Re-run any migrations that landed *after* the restore point but are still wanted:
   **(CLI)** from `packages/db`, with the **migrator** URL only:
   ```bash
   DATABASE_URL="$DATABASE_URL_MIGRATOR" npx prisma migrate deploy
   ```
   ⚠️ Migrations 083–089 and 063/104–117 were applied **by hand from the Supabase SQL
   Editor**, so `_prisma_migrations` has **zero rows** for them. `migrate deploy` may try to
   re-apply them. Check `docs/database/` and the migration files' own idempotency before
   running it against a restored DB; when unsure, apply the missing ones by hand and insert
   the `_prisma_migrations` rows to reconcile.
5. **(CLI)** Verify: `curl https://api.kanchuki.app/health` → `{"status":"ok"}`.

### 2b. PITR (point-in-time) restore

Same shape as 2a but with a timestamp: Supabase → **Backups → Point in Time**, pick the last
known-good moment (just before the incident start in §1.2), restore to a **new** instance,
verify, then repoint. Do not restore over live.

### 2c. Lost the pooler suffix / role passwords

Connection failures with `password authentication failed` are usually **not** a database
incident. Supabase pooler usernames **must** be `<role>.<project_ref>` (e.g.
`kanchuki_app.thpqcylmcxokajxoerjx`) — a bare `kanchuki_app` is rejected. See
`docs/INFRA-SETUP.md` for the role list (`kanchuki_app`, `kanchuki_migrator`,
`kanchuki_purge`, `vault_app`) and re-run `scripts/setup-role-separation.sql` if roles are
missing.

### 2d. Deletion Vault

If `VAULT_DATABASE_URL` is down, vault writes fail but request traffic continues (the vault is
a write-only side channel). Restore the Railway Postgres from its own backups. The vault is
**INSERT-only by design** — never "fix" it by granting SELECT/UPDATE to `vault_app`.

---

## 3. Scenario B — Bad deploy / bad build (Railway)

**Symptoms:** 502s, crash loop, a feature regression that shipped, a build that succeeded but
behaves wrong.

1. **(dashboard)** Railway → the affected service → **Deployments** → pick the last known-good
   deployment → **Redeploy**.
   - Prefer **Redeploy** (re-runs the build from that deployment's commit) over a rollback
     hack. It keeps "Deployed via GitHub" true.
2. Confirm the deploy source reads **"Deployed via GitHub"**. If it says "Deployed via CLI",
   someone ran `railway up` — flag it, and re-deploy from GitHub to make the state honest.
3. If the failure is the **web** service only and *every* path 502s with
   `x-railway-fallback: true`, this is the **domain-target-port drift** documented in
   `docs/DEPLOY.md` — the container is healthy but the edge routes to the wrong port. Fix it
   without a redeploy:
   - **(CLI)** `railway domain list --service <name>` vs the app's logged listening port.
   - **(CLI)** `railway domain update --port <actual-port> <domain-id> --service <name>`.
4. If the deploy failed because of an **env var** change, fix the variable and use
   **(dashboard) Redeploy** — no code change needed.

**Guardrail:** the deploy flow is *push to `main` → Railway auto-deploys*. There is no
supported path that deploys from a local working copy.

---

## 4. Scenario C — R2 storage loss / accidental object deletion

**Symptoms:** images 404 or render broken; `ProductPhoto.url` rows point at missing keys.

1. **(dashboard)** Cloudflare → R2 → `kanchuki-prod` → check object count and whether
   versioning/lifecycle rules exist. **If versioning is off, deleted objects are
   unrecoverable** — this is the highest-risk gap in the stack; the owner should enable
   versioning or a lifecycle backup *before* an incident.
2. What **is** recoverable without R2 backups:
   - DB rows (URLs, keys, metadata) survive in Postgres — restore them via §2, not R2.
   - Photos still on retailer devices / the original uploads can be re-uploaded.
3. **Do not** "repair" by deleting DB rows that reference missing objects — that hides the
   outage and loses the metadata needed to re-link re-uploaded files.
4. Rebuild the public URL prefix if the custom domain changed: `R2_PUBLIC_URL` **(dashboard)**
   → Redeploy. `NEXT_PUBLIC_*` values are baked in at build time, so the **web** service must
   rebuild too.

---

## 5. Scenario D — Redis (Upstash) loss

**Symptoms:** OTP send fails ("Could not start a secure OTP session"), social connect fails,
jobs stop running, rate limits reset.

**Redis is treated as ephemeral.** Nothing here needs to be *restored*; things need to be
*re-registered*.

1. **(dashboard)** Upstash → confirm the database exists and the `REDIS_URL` matches.
   A common false alarm: the first Redis-touching request after an idle sleep fails once.
   The lazyConnect handshake race was **fixed** — do not re-diagnose this as a timeout bug.
2. **OTP slots / rate limits / public cache** rebuild themselves on next use. No action.
3. **BullMQ queues:** in-flight jobs are gone. Confirm the critical ones re-enqueue:
   - Purge-soft-deleted (30-day cron) — runs nightly; a missed night is caught the next.
   - Catalog full-sync, R2 compression, referral qualify/accrue/payout — all repeatable
     schedules. **If you changed a cron env var (e.g. `CATALOG_SYNC_CRON`) on a live
     deployment, the old repeat schedule can survive in Redis and duplicate.** After any
     Redis wipe, verify the repeatable-job set matches the intended schedules and remove
     strays.
4. Re-run a targeted check for whichever job's lane is critical (e.g. trigger one manual
   catalog sync from the admin panel) rather than waiting for the schedule.

---

## 6. Scenario E — Region / host outage (Railway, Supabase, Upstash, Cloudflare)

| Down | Impact | Mitigation |
|---|---|---|
| **Railway** (API or Web) | App/API unreachable | Railway status page; if the API is down, the mobile app and storefront fail. No self-hosted fallback. Wait it out; do not redeploy into a broken platform. |
| **Supabase** | Total outage — no auth, no data | Managed; Supabase status page. This is a single point of failure: **post-launch, enable a read replica (B-002)** so read-only storefront traffic survives a primary failure. |
| **Upstash** | OTP login fails; jobs pause; caching degrades (public cache is fail-open) | See §5. |
| **Cloudflare / R2** | Images break; CDN down | R2 outage ≠ site down (storefront HTML is served by Railway), but it looks broken to shoppers. Cloudflare status page. |
| **Hetzner** (V-Tone) | Try-on unavailable | Not in the MVP launch path; degrade silently. |

---

## 7. Scenario F — Secret compromise (rotate in this order)

Rotate **in dependency order**: a consumer must be restarted with the new value after the
provider issues it, or you get an outage in the middle of a security incident.

1. **Database credentials** first — if the DB is compromised, everything else is moot.
   - **(dashboard)** Supabase → reset role passwords → update `DATABASE_URL`,
     `DATABASE_URL_POOLER`, `PURGE_DATABASE_URL` on the API service → Redeploy.
   - Railway vault Postgres: reset `vault_app`, update `VAULT_DATABASE_URL`.
2. **Supabase service key + JWT secret** — resets every live session (users re-login). Expected.
3. **R2 keys** — issue new token, update `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`, remove
   the old token, Redeploy. Photo writes/reads break between the two steps, so do it in one sitting.
4. **Redis password** — Upstash → rotate → update `REDIS_URL` → Redeploy. Expect one failed
   first request per new connection.
5. **Payment + messaging + AI keys** — Razorpay (`KEY_ID`/`KEY_SECRET`/`WEBHOOK_SECRET`),
   RazorpayX payout keys + `RAZORPAYX_WEBHOOK_SECRET`, MSG91 (`AUTHKEY`/`TEMPLATE_ID`/
   `WEBHOOK_SECRET`), Anthropic/OpenAI, Meta app secret, Fal.ai, Gemini, BFL.
   - RazorpayX/payments webhook secrets are **deliberately separate** — rotating one must
     never require rotating the other.
6. **Auth/JWT secrets** — `COOKIE_SECRET`, `TEAM_JWT_SECRET`, `ADMIN_API_KEY`,
   `REVALIDATION_SECRET` (note: `REVALIDATION_SECRET` must be set on **both** the API and web
   services or `/api/revalidate` 401s), `VAULT_DATABASE_URL`'s companion secrets.
7. **Review/test bypasses** — if leaked, unset `OTP_TEST_BYPASS`/`OTP_TEST_PHONES` and
   `REVIEW_PHONE`/`REVIEW_OTP` immediately. They are the shortest path to a session.

**After rotating:** grep every service's variables for the old value (Railway variables are
per-service; it is easy to update one and forget the other), redeploy both services, and
verify `/health`, an OTP login, and one Razorpay webhook test event.

---

## 8. Known gaps (stated, not hidden)

| Gap | Risk | Owning action |
|---|---|---|
| **R2 has no confirmed versioning/backup** | Deleted or corrupted objects are unrecoverable; photos are the product | Owner: enable R2 versioning or a scheduled backup export |
| **Supabase retention is plan-dependent** | RPO could be 24 h+ on a lower plan | Owner: confirm PITR window on the current plan |
| **Single database, no read replica** | A Supabase failure is a total outage | B-002 (post-pilot) |
| **`_prisma_migrations` has gaps** (083–089, 063/104–117 applied by hand) | `migrate deploy` on a restored DB may re-apply or skip | Owner/§1.1: reconcile runner rows |
| **No off-platform copy of the deletion vault** | Vault loss ends compliance history | Owner: confirm Railway Postgres backup retention |
| **Secrets live only in Railway + password manager** | Losing both means re-issuing everything | Keep the password-manager entries current (no secrets in the repo) |

---

## 9. Post-incident checklist

- [ ] Writers un-paused; `/health` green; a real login + a real storefront page verified.
- [ ] Data-loss window stated in IST/UTC and confirmed against the restore point.
- [ ] Any hand-applied SQL recorded in `docs/database/` and, where a migration was bypassed,
      in `_prisma_migrations`.
- [ ] New root cause filed in `docs/root-cause/root-cause issues.md` (**RC-###**) if code or
      process caused it, referenced from the fix commit.
- [ ] The gap that made this incident possible is added to §8 with an owner, or closed.
- [ ] Credentials rotated per §7 if compromise was even suspected.
- [ ] Timeline + a short blameless write-up shared with the team.
