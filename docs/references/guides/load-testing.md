# Load testing (§7A.5)

Two k6 scripts under `scripts/load/k6/` simulate the mix `docs/SCALING.md` §5
asks for: retailer photo uploads (write-heavy), collection-link views
(read-heavy, anonymous), and AI search queries. Guarded by
`apps/api/src/routes/load-test.test.ts` (54 tests) — see that file's header
for why a load-test script needs its own CI guard.

**Run these against a staging Supabase branch / staging API deployment,
never production.** `mix.js` refuses `kanchuki.app` / `kanchuki.com` hosts
with no override flag — see "Safety rails" below.

## 1. Prerequisites

Install k6 v0.50+ (the scripts use `http.expectedStatuses`, added in v0.50;
on an older binary the scripts still run, they just can't distinguish a
429 from any other non-2xx in the response callback — the `rate_limited`
counter still works either way):

```powershell
winget install k6              # Windows
choco install k6                # Windows (Chocolatey)
brew install k6                 # macOS
```

Or skip the install and run via Docker:

```bash
docker run --rm -i -e LOADTEST_BASE_URL=https://<staging-api> \
  grafana/k6 run - < scripts/load/k6/storefront.js
```

To validate a script without running it (checks syntax + that `k6/*` imports
resolve, without sending a single request):

```bash
k6 inspect scripts/load/k6/storefront.js
```

## 2. Getting a bearer token (for `retailer.js` only)

`retailer.js` needs a real Supabase access token in `Authorization: Bearer
<token>` (`apps/api/src/plugins/auth.ts` — it's a bearer token, not a
cookie). Two ways to get one on staging:

- **§7A.3's Apple-review OTP bypass**, if `REVIEW_PHONE` + `REVIEW_OTP` are
  set on the staging deployment: `POST /v1/auth/otp/send` with that phone,
  then `POST /v1/auth/otp/verify` with the fixed `REVIEW_OTP` code returns
  `access_token` in the response body.
- **A real staging retailer login** via MSG91/Supabase OTP, same two routes.

Either way, `retailer.js`'s `setup()` calls `GET /v1/retailers/me` with the
token before spending the run on it, and fails immediately (not with a wall
of 401s) if the token is missing, expired, or not a retailer.

## 3. Running the scripts

```bash
# Anonymous, read-heavy — storefront / product grid / product detail / etc.
k6 run -e LOADTEST_BASE_URL=https://<staging-api> scripts/load/k6/storefront.js

# Authenticated — retailer product list, profile, categories, upload presign
k6 run \
  -e LOADTEST_BASE_URL=https://<staging-api> \
  -e LOADTEST_BEARER=<access_token> \
  scripts/load/k6/retailer.js
```

### Env matrix

| Var | Required by | Default | Notes |
|---|---|---|---|
| `LOADTEST_BASE_URL` | both | — | Throws if unset/unparseable/production. |
| `LOADTEST_RATE` | both | `180`/min | Hard-capped at 180 by `mix.js`; a value ≥ the API's 200/min limiter throws. |
| `LOADTEST_DURATION` | both | `3m` | k6 duration string. |
| `LOADTEST_SEARCH` | `storefront.js` | unset (off) | `=1` adds `POST /v1/public/search` to the mix — costs one OpenAI embedding call per hit, no cache (`packages/ai/src/embedder.ts`). Never in the default mix. |
| `LOADTEST_BEARER` | `retailer.js` | — | Supabase access token. Script fails in `setup()` without one, before any load is generated. |

## 4. The 200/min-per-IP ceiling

`apps/api/src/index.ts` registers `@fastify/rate-limit` globally: `max: 200,
timeWindow: '1 minute'`, keyed on `request.ip`. It is a literal — **no env
override today, and this load-test work deliberately did not add one** (it's
a security control; making it configurable is a decision for the owner, not
a side effect of a load-test script).

One k6 process from one machine is one IP, so every route in a run shares
that single 200/min budget — `storefront.js` and `retailer.js` **must not
run concurrently against the same host**, they'd split one budget. The
scripts cap themselves at 180/min for headroom and refuse anything higher.

To measure real concurrency beyond 200/min, you need one of:

- **Multiple generators, multiple IPs** — run the same script from several
  machines/regions (or k6 Cloud/other distributed runners) against the same
  staging host.
- **An env-overridable limiter on staging** — a code change to
  `apps/api/src/index.ts`'s rate-limit config, staging-only, scoped and
  reviewed on its own; not part of this script.

## 5. Reading the results

- Per-endpoint numbers are tagged: `http_req_duration{endpoint:storefront}`,
  `{endpoint:retailer_products}`, etc. — k6's end-of-run summary breaks out
  every tag value.
- `rate_limited` (a custom Counter) counts 429s separately from
  `http_req_failed`. **A non-zero `rate_limited` invalidates the run** — it
  means you measured the limiter, not the API. Its threshold
  (`rate_limited: ['count<1']`) fails the run automatically when this
  happens; don't read a rate-limited run's other numbers as if they were
  clean.
- `checks` tracks per-request assertions (route not 404, not 5xx, etc.) —
  `rate>0.99` is the pass bar.
- `http_req_duration` thresholds: `p(95)<1500ms`, `p(99)<3000ms`.

## 6. Safety rails

- **Production is refused, no override flag.** `mix.js`'s `PROD_HOSTS =
  ['kanchuki.app', 'kanchuki.com']`, matched on hostname + subdomain
  (`api.kanchuki.app` is caught, a lookalike like
  `kanchuki.app.evil.example` is not falsely blocked). There's no
  `LOADTEST_ALLOW_PROD` — an escape hatch here is one typo from hitting
  live retailers.
- **The two scripts share one IP's rate budget — never run them
  concurrently against the same host.**
- **Nothing is ever uploaded to R2 and no product is ever created.**
  `retailer.js` calls `POST /v1/products/upload-url` (the presign) but never
  follows with a PUT to the signed URL — that would write a real object into
  the staging bucket. Neither script ever hits `POST /v1/products`.

## 7. What is deliberately not measured, and why

| Route/family | Why excluded | How to measure it on purpose |
|---|---|---|
| `POST /v1/products` | `products-crud.ts` calls `addTaggingJob()` unconditionally on every create — a scripted loop would buy a Claude Vision call per request. Banned by the guard test by exact route shape. | Run a small, manually-bounded batch by hand against staging, watching the AI provider's usage dashboard — never loop it. |
| `retag`, `studio-shoot`, `detect-color`, `pro-cleanup` | Each buys a model call or heavy CPU (LaMa inpainting, FLUX/Gemini generation) per request. | Same — hand-run a bounded batch, don't script it. |
| `spin-video`, `bulk-delete`, `/purge` | Destructive or resource-heavy; nothing a load test needs to exercise. | N/A. |
| `/v1/admin/*` | Admin surfaces aren't part of the retailer/customer load profile §5 asks for, and most mutate state. | Out of scope for this script; write a separate admin-specific script if that's ever the question. |
| `/v1/auth/*`, `/v1/public/passport/otp*` | SMS dispatch (MSG91, real cost + real delivery) and Redis side effects per call. | Mint one token by hand (see §2) and reuse it for the whole run — that's exactly what `retailer.js` does. |
| `/v1/public/stylist` | AI chat, per-message model call. | Not covered by this script. |
| `POST /v1/public/search` | Embeds every query, no cache — bills per request. | Opt-in only, via `LOADTEST_SEARCH=1`; never in the default mix. |

## 8. This is not a penetration test

`docs/SCALING.md` §5 says so explicitly. This measures throughput and
latency under a realistic traffic *shape*, not security posture. For that,
see `apps/api/src/routes/security.test.ts` and
`apps/api/src/routes/admin.login.test.ts` (CLAUDE.md rules 8–9 keep both
running on every auth/checkout change).
