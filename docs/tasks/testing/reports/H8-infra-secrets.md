# H8 — Infra + secrets (hacker mode)

Task: H8 Part 1 (infra, secrets, CI, dependencies). Part 2 (merge) is `00-hacker-report.md`.
Date: 2026-10-26. Branch `fix/team-otp-fail-closed-rc085`. Target: code/config review only. No request to prod API, web, R2, Supabase, Railway or Hetzner, and no MCP call to any of them. `.env*` files were not opened.
Tooling: `rtk` is not installed, so plain `git`/`grep`/`awk`/`node` were used. Scratch scripts live in the session scratchpad (`scan.awk`, `harness.mts`), not in the repo.

## Commands run

- `sed`/`grep` over `apps/api/src/index.ts`, `packages/db/src/client.ts`, `apps/web/next.config.mjs`, `apps/web/src/middleware.ts`, `.github/workflows/*.yml`, `services/*/docker-compose.yml`, `services/fashion-vtone/app.py`, `docs/DEPLOY.md`.
- `grep -rn "swagger|bull-board|/metrics|/debug|tunnel"` over `apps/api/src`, `apps/web/app`, `next.config.mjs`.
- Secrets: `git log --all -p -G'<key-shape regex>' | awk -f scan.awk` (prints commit, file, key type and placeholder-or-not, never the value). Hits then classified by **redacted shape** (letters → `a`/`A`, digits → `9`), role name and host class only.
- `git ls-files | grep .env`, `git log --all --diff-filter=A --name-only -- '*.env' '*.env.*'`.
- Local harness `harness.mts` (Fastify + `@fastify/cors` from `apps/api/node_modules`, `inject()` only, no DB, no network): the production CORS options and `trustProxy: true`.
- `pnpm audit --prod`: timed out twice (150 s, then 400 s in the background, exit 124). See §CVE.

## Result summary

| Sev | Count | IDs |
| --- | --- | --- |
| Critical | 1 | H8-1 |
| High | 0 | — |
| Medium | 1 | H8-2 |
| Low | 5 | H8-3, H8-4, H8-5, H8-6, H8-7 |
| Pass / not exploitable | 9 | see §Checked and clean |

H8-7 is a tooling note (Low) and is not counted in the 00 report's 40.

## Findings table

| ID | Sev | Where | Issue | Fix |
| --- | --- | --- | --- | --- |
| H8-1 | Critical | git history `541f312f` (2026-07-26), `f624324a` (2026-08-02): `docs/INFRA-SETUP.md`, `docs/26-night-report.md`, `scripts/setup-role-separation.sql` | Real-looking passwords for `postgres` (superuser) and `vault_app`, on top of SC-1's three roles, and also in an earlier commit SC-1 did not list | Owner: rotate all five, then optional history purge |
| H8-2 | Medium | `services/fashion-vtone/app.py:52,252,132-135`, `docker-compose.yml:30-31,38` | V-Tone auth fails open when `VTONE_SHARED_SECRET` is empty (compose default `:-`), port 8000 published, plain HTTP, `/try-on` downloads any URL | Fail closed, `:?` in compose, `hmac.compare_digest`, R2-host allow-list, TLS |
| H8-3 | Low | `apps/api/src/index.ts:104-109` | CORS regex `/(^\|\.)kanchuki\.app$/` accepts any subdomain on any scheme (`http://…`) with `credentials: true`. Confirmed (local harness) | Anchor scheme: `/^https:\/\/([a-z0-9-]+\.)?kanchuki\.app$/`. **Fixed RC-140** (owner chose `)*` for multi-level), not deployed |
| H8-4 | Low | `apps/api/src/index.ts:187-224`, `packages/db/src/client.ts:110` | Anonymous `/health` returns raw Prisma/ioredis error text (DB host:port, Redis host) when a dependency is down | Return `ok` + latency only; log the error |
| H8-5 | Low | `docs/DEPLOY.md:77`; 6 clients `new Redis(process.env.REDIS_URL…)` (`lib/msg91-otp.ts:74`, `lib/public-cache.ts:32`, `lib/my-style-analysis.ts:54`, `lib/social-post-idempotency.ts:22`, `lib/studio-shoot.ts:1171`, `jobs/queue.ts:15`) | TLS only if the URL is `rediss://`; the doc tells the operator to use `redis://default:password@host:port` | Doc → `rediss://`; owner checks the prod scheme |
| H8-6 | Low | `.github/workflows/ci.yml`, `deploy.yml` (no `permissions:`), `deploy.yml:76` `dorny/paths-filter@v3` | `GITHUB_TOKEN` gets the repo default scope; a third-party action pinned by a moving tag runs in the workflow that later uses `RAILWAY_TOKEN` | `permissions: contents: read`; pin third-party actions to a commit SHA |
| H8-7 | Low | root `package.json` `"pnpm": { overrides, patchedDependencies }` | The local `pnpm` warns these keys are "no longer read … ignored". Lockfile still carries `overrides:` and patched versions; CI pins `pnpm@9.0.0`, which still reads them. A local install with the newer CLI can regenerate the lockfile without the CVE overrides | Move both keys to `pnpm-workspace.yaml` |

---

### H8-1 `postgres` superuser and `vault_app` passwords in public git history             Severity: Critical
Attacker: anonymous (anyone who can clone the public repo, SC-2)
Goal: direct SQL access to production: read or change every table, skip RLS and the app/purge role split, read the deletion vault.
Preconditions: the passwords were not rotated after the commits below. Rotation since then **could not be verified** (no Supabase access by policy).
Steps:
1. `git clone` the public repo; `git log --all -p -S pooler.supabase.com`.
2. Commits `541f312f` (2026-07-26, "feat: Database Health page + infra setup…") and `f624324a` (2026-08-02) add pooler connection strings to `docs/INFRA-SETUP.md`, `docs/26-night-report.md` and `scripts/setup-role-separation.sql`.
3. Connect with `psql` to the Supabase pooler (internet-reachable by design; the project ref is in the same lines).
Impact: as `postgres`, full read/write on the whole project, including the `auth` schema, every retailer, every shopper phone, KYC rows and R2 keys (feeds H5-1). As `vault_app`, the deletion-vault data that is meant to outlive retailer deletion.
Evidence (file + commit + key type only; shapes are redacted, no characters of any value):

| Commit | File:line | Role | Key type | Redacted shape |
| --- | --- | --- | --- | --- |
| `541f312f`, `f624324a` | `docs/INFRA-SETUP.md:166,175` / `:189,198` | `postgres` | postgres URL with password | 16 chars, random mix of upper, lower, digits |
| `541f312f`, `f624324a` | `docs/INFRA-SETUP.md:79-103` / `:87-111` | `vault_app` | postgres URL with password | 24 chars, word_word + `!` + 4 digits |
| `541f312f`, `f624324a` | `INFRA-SETUP.md`, `26-night-report.md:198`/`:200`, `setup-role-separation.sql:64-70`/`:141-147` | `kanchuki_app` | postgres URL with password | 23 chars (SC-1 lists it for `f624324a`) |
| `541f312f`, `f624324a` | `INFRA-SETUP.md:189-216`/`:212-246`, `setup-role-separation.sql:148` | `kanchuki_migrator` | postgres URL with password | 21 chars (SC-1) |
| `f624324a` | `INFRA-SETUP.md:219,250`, `setup-role-separation.sql:150` | `kanchuki_purge` | postgres URL with password | 29 chars (SC-1) |

The three `kanchuki_*` values and `vault_app` share one human-chosen structure (word, word, `!`, digits). A rotation that keeps that structure is guessable from the old values.
HEAD is clean: `git grep` at HEAD finds only `<PLACEHOLDER>` passwords in `docs/DEPLOY.md:122-990` and `scripts/setup-role-separation.sql:268-277`. Both source docs are deleted at HEAD, but both commits are in `origin/main`'s history (SC-1 checked `f624324a`; `541f312f` is its ancestor).
Fix (owner only, no code):
1. Supabase → Database → reset the `postgres` password, and `ALTER ROLE … PASSWORD` for `kanchuki_app`, `kanchuki_migrator`, `kanchuki_purge`, `vault_app`, using generated random values (≥32 chars).
2. Update the matching DB URL env vars in Railway (owner sets env vars).
3. Read Supabase pooler and Postgres logs for logins from unknown IPs since 2026-07-26.
4. Later, optional: `git filter-repo` both commits and ask GitHub support to purge cached views. Do this only after the repo is private (SC-2).
Status: Plausible (values look real; live validity not checked, by policy)

### H8-2 V-Tone service fails open without its secret and fetches any URL             Severity: Medium
Attacker: anonymous on the internet
Goal: free try-on compute, SSRF from the Hetzner box, and (with the secret sniffed) the same access as the API.
Preconditions: V-Tone is live on a self-hosted Hetzner CX43 (CLAUDE.md index #27) with port 8000 published. For the fail-open half: `VTONE_SHARED_SECRET` unset on the box.
Steps:
1. `POST http://<hetzner-ip>:8000/try-on` with `{"person_image_url":"http://169.254.169.254/hetzner/v1/metadata","garment_image_url":"https://example.com/a.jpg"}` and no `X-Vtone-Key`.
2. `app.py:252` `if SHARED_SECRET and x_vtone_key != SHARED_SECRET:` lets the request through when the secret is empty. Compose passes `VTONE_SHARED_SECRET: "${VTONE_SHARED_SECRET:-}"` (`docker-compose.yml:38`), so an unset host var becomes an empty string instead of a start-up error.
3. `download_image(url)` → `requests.get(url, timeout=…)` (`app.py:132-135`) with no host allow-list.
Impact: compute abuse and an SSRF primitive inside the Hetzner network (metadata endpoint, any internal service). The result is uploaded to Kanchuki's R2 with Kanchuki credentials (`app.py:176-205`). With the secret set, the remaining risk is that the header travels over plain HTTP (`docker-compose.yml:14-21`: "Still plain HTTP") and is compared with `!=`, not in constant time.
Evidence: `app.py:52` `SHARED_SECRET = os.environ.get("VTONE_SHARED_SECRET", "")`; `app.py:252-253`; `docker-compose.yml:30-31` `ports: - "8000:8000"`. Contrast: `services/photo-cleanup/docker-compose.yml:31` uses `${CLEANUP_SHARED_SECRET:?…}`, which fails closed.
Fix:
```diff
--- a/services/fashion-vtone/docker-compose.yml
-      VTONE_SHARED_SECRET: "${VTONE_SHARED_SECRET:-}"
+      VTONE_SHARED_SECRET: "${VTONE_SHARED_SECRET:?set VTONE_SHARED_SECRET}"
--- a/services/fashion-vtone/app.py
+import hmac
+from urllib.parse import urlparse
+ALLOWED_IMAGE_HOSTS = {h for h in os.environ.get("VTONE_ALLOWED_HOSTS", "").split(",") if h}
@@ def try_on(...)
-    if SHARED_SECRET and x_vtone_key != SHARED_SECRET:
+    if not SHARED_SECRET or not hmac.compare_digest(x_vtone_key or "", SHARED_SECRET):
         raise HTTPException(status_code=401, detail="Missing or invalid X-Vtone-Key header")
@@ def download_image(url: str)
+    u = urlparse(url)
+    if u.scheme != "https" or u.hostname not in ALLOWED_IMAGE_HOSTS:
+        raise HTTPException(status_code=400, detail="image host not allowed")
```
Deploy order: the owner sets `VTONE_SHARED_SECRET` and `VTONE_ALLOWED_HOSTS` (the R2 public host) on the box **before** this ships, or every try-on fails. Owner: Hetzner firewall port 8000, or Caddy with TLS in front.
Status: Plausible (code certain; whether the secret is set on the box could not be verified)

### H8-3 CORS accepts any `*.kanchuki.app` origin, including plain `http`, with credentials             Severity: Low
Attacker: anyone who controls a page on any `kanchuki.app` subdomain (dangling DNS / subdomain takeover), or an on-path attacker injecting into a plain-HTTP response for one
Goal: credentialed cross-origin reads of API responses.
Preconditions: a takeable or HTTP-served subdomain, and a cookie-authenticated API route (admin session/CSRF cookies). Bearer-token routes are not affected: the attacker page has no token.
Steps: send a request with `Origin: http://evil.kanchuki.app`.
Impact: low today (no takeable subdomain known), and the regex has no reason to allow `http`.
Evidence: Confirmed (local harness), production options from `index.ts:104-109`:
```
origin https://kanchuki.app           ACAO= https://kanchuki.app       ACAC= true
origin https://www.kanchuki.app       ACAO= https://www.kanchuki.app   ACAC= true
origin http://evil.kanchuki.app       ACAO= http://evil.kanchuki.app   ACAC= true
origin https://evilkanchuki.app       ACAO= -
origin https://kanchuki.app.evil.com  ACAO= -
```
Fix:
```diff
-      ? [process.env.WEB_URL ?? '', /(^|\.)kanchuki\.app$/]
+      ? [process.env.WEB_URL ?? '', /^https:\/\/([a-z0-9-]+\.)?kanchuki\.app$/]
```
Status: Fixed (RC-140), not deployed. Confirmed (local harness) before the fix; regex now `/^https:\/\/([a-z0-9-]+\.)*kanchuki\.app$/`, pinned by `apps/api/src/cors-origin.test.ts`.

### H8-4 Anonymous `/health` echoes raw DB/Redis error text             Severity: Low
Attacker: anonymous
Goal: learn internal hostnames/ports (Supabase pooler host, Upstash host) during an outage.
Preconditions: DB or Redis is failing at the time of the request.
Steps: `GET /health` → 503 with `{"db":{"ok":false,"error":"<Prisma message>"},"redis":{"ok":false,"error":"<ioredis message>"}}`.
Impact: information leak only. The hosts are not secret on their own, but driver messages can include connection details.
Evidence: `index.ts:192-201` puts `err.message` in the body; `packages/db/src/client.ts:110` does the same; the route has no auth (`index.ts:187`).
Fix:
```diff
-          error: err instanceof Error ? err.message : String(err),
+          error: 'unreachable',
```
in both places, plus `server.log.warn({ err }, 'health check failed')`.
Status: Plausible

### H8-5 Redis TLS depends on the URL scheme; the deploy doc gives the plaintext form             Severity: Low
Attacker: on-path network between Railway and Upstash
Goal: read the Redis password, OTP hashes, rate-limit and queue data.
Preconditions: the prod `REDIS_URL` uses `redis://` and the Upstash database accepts non-TLS connections.
Steps: n/a (passive).
Evidence: `docs/DEPLOY.md:77` "Copy the `REDIS_URL` (format: `redis://default:password@host:port`)". All six ioredis clients pass `REDIS_URL` with no `tls` option, so ioredis uses TLS only for `rediss://`.
Fix: change the doc to `rediss://default:<password>@<host>:6379`. Owner checks that the Railway value starts with `rediss://` (without pasting the value anywhere).
Status: Could not verify (prod env not read, by policy)

### H8-6 CI token scope and third-party action pin             Severity: Low
Attacker: compromised maintainer of a third-party action (supply chain)
Goal: run code in `deploy.yml` with a default-scope `GITHUB_TOKEN`, in the workflow that later uses `RAILWAY_TOKEN`.
Preconditions: the `dorny/paths-filter` tag `v3` is repointed to malicious code.
Evidence: no `permissions:` key in `ci.yml` or `deploy.yml` (only `docker-tryon.yml:14` has one); `deploy.yml:76` `uses: dorny/paths-filter@v3`. The `changes` job does not hold the Railway secret, so the direct exposure is the `GITHUB_TOKEN` scope. No `pull_request_target`, no `workflow_run`, no `${{ github.event.* }}` in any `run:` (grep: none). `ci.yml`, the only PR-triggered workflow, references no secrets.
Fix:
```diff
--- a/.github/workflows/deploy.yml (and ci.yml)
+permissions:
+  contents: read
-      - uses: dorny/paths-filter@v3
+      - uses: dorny/paths-filter@<full commit sha>  # v3
```
A CI change needs owner approval (CLAUDE.md: never modify CI/CD without approval). SC-9 (GHCR PAT) is a separate finding.
Status: Plausible (hardening)

### H8-7 pnpm security overrides live where the local pnpm no longer reads them             Severity: Low
Attacker: none (process gap)
Goal: n/a. A dev who runs the newer local CLI and commits the lockfile would silently drop the CVE overrides (`fastify`, `find-my-way`, `fast-uri`, `tar`, `sharp`, …).
Evidence: running `pnpm` on this machine prints: `The "pnpm" field in package.json is no longer read by pnpm. The following keys were ignored: "pnpm.overrides", "pnpm.patchedDependencies"`. `pnpm-lock.yaml:7` still has `overrides:`, and the lockfile resolves `fastify@5.10.0`, `find-my-way@9.7.0`, `fast-uri@4.1.1`, `sharp@0.35.3`, `tar@7.5.22`. CI pins `pnpm@9.0.0` via `packageManager`.
Fix: move both keys to `pnpm-workspace.yaml` (`overrides:` / `patchedDependencies:`), delete them from `package.json`, run `pnpm install --lockfile-only`, and check that the lockfile diff is empty.
Status: Plausible

## CVE (pnpm audit --prod)

**Could not verify.** `pnpm audit --prod` timed out twice (150 s foreground; 400 s background, exit 124) with no output. Indirect signal: every package the overrides target resolves to a patched version in the lockfile (see H8-7). Follow-up: run `pnpm audit --prod --json > audit.json` with no timeout and report by package + advisory ID + reachable-or-not.

## Checked and clean (not exploitable)

| Check | Result | Evidence |
| --- | --- | --- |
| Tracked `.env*` | Only `.env.example` and `apps/mobile/.env.example`; no other `.env*` file was ever added | `git ls-files`, `git log --all --diff-filter=A -- '*.env*'` |
| Key-shape scan, other types | `sk-ant`, `sk-`/`sk-proj`, `AKIA`, PEM private key, JWT, `re_`, `whsec_`: 0 hits in all history | `scan.awk` output |
| `rzp_live_` hit | `apps/api/src/routes/admin.test.ts` @ `48bc0627`: lowercase letters and underscores only, a test fixture | redacted shape `a+_a+_a+` |
| `EAA…` (Meta token shape) hits | 8 hits, all inside base64 image data (e2e image fixtures, notebooks, HTML reports) | context contains `base64` |
| Postgres/Redis URLs in HEAD | Placeholders only (`<…>` passwords) | `git grep` at HEAD |
| Debug surfaces | No Swagger, `/docs`, `/metrics`, `/debug`, bull-board or Sentry tunnel route in API or web | grep: none |
| API headers | `@fastify/helmet` with CSP `default-src 'self'` (`index.ts:89-102`); default `bodyLimit` (1 MiB); global limit 200/min keyed on `request.ip` (`index.ts:134-144`) | code |
| Web headers | `X-Frame-Options: DENY` etc. (`next.config.mjs:62-68`). No CSP (T2.6/T2.8 F3); HSTS unverified (T2.8 F4) | cross-ref |
| CI triggers | No `pull_request_target`; the PR workflow has no secrets; `android-release.yml:71` decodes a secret but is `workflow_dispatch` only and the value is masked | grep |

## Cross-refs (not re-reported)

- **T1.8 F4 / T2.5 F1 (`trustProxy`)**: the app half is now Confirmed (local harness). With `trustProxy: true` (`index.ts:70`), `request.ip` is the **leftmost** `X-Forwarded-For` entry: `XFF: 192.0.2.99, 198.51.100.1, 10.0.0.5` gives `request.ip = 192.0.2.99`. Whether Railway's edge overwrites a client-sent XFF is still the owner check. If it appends, every IP-keyed limit (global, OTP send, RC-087 team login, upload URLs) can be bypassed.
- SC-1 (same commits, three roles), SC-2 (public repo), SC-9 (GHCR PAT), SC-11 (base image digests), RC-047 (deploy signal), RC-084, T2.6.
- The Supabase project ref in `docs/DEPLOY.md` at HEAD is an identifier, not a secret.

## Not checked / follow-ups

- `pnpm audit` result (see §CVE).
- Live validity of any leaked password; Supabase/Upstash/Hetzner network exposure; the `REDIS_URL` scheme; R2 bucket listing. All are owner checks in `00-hacker-report.md`.
- `services/photo-cleanup/app.py` auth code not read (its compose file already fails closed on a missing secret).
- No RC numbers assigned: none of these is a shipped fix yet. Next free ID: RC-104.
