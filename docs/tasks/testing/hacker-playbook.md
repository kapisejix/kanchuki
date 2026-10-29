# Hacker Playbook — how an attacker would go after Kanchuki

**Status: hypotheses, not findings.** Built from the architecture in `CLAUDE.md` and the project's own RC history. Nothing here is confirmed until a `task-4-hacker.md` session proves it. Each item says what the attacker gains, so you can see the goal, not just the technique.

Attacker types: **A** anonymous internet user · **S** shopper (phone-OTP customer) · **R** retailer owner · **T** staff (manager/salesperson/delegate) · **M** malicious mobile-app user · **I** insider/leaked key.

## How a real attacker works (the loop)

1. **Recon** — find hosts, routes, JS bundles, sitemap, `robots.txt`, error messages, public API shape, mobile APK contents.
2. **Map trust boundaries** — who may call what: anonymous, shopper, retailer, staff roles, super-admin.
3. **Attack the weakest boundary** — usually authorization (IDOR), not crypto. One missing `retailer_id` filter beats a broken cipher.
4. **Chain** — a low-severity bug plus another becomes account takeover (e.g. stored XSS in a store name + admin viewing it = admin session).
5. **Monetise / persist** — free paid plan, stolen customer phone numbers, spam via your WhatsApp/Meta tokens, referral payouts, ransom of data.

---

## 1. Retailer mobile app (M, R)

| Attack | Gain | Why plausible here |
| --- | --- | --- |
| Unpack the APK/JS bundle, read API base URL, public keys, feature flags | Full API map without docs | RN bundles are readable; any key shipped in `app.json`/`eas.json` is public |
| Intercept HTTPS with a proxy (no cert pinning) and replay/modify requests | Tamper prices, quotas, IDs | Mobile apps rarely pin; server must not trust client fields |
| Change `retailer_id`/`product_id` in requests | Read/edit other stores' data (IDOR) | Multi-tenant; every route needs its own ownership check |
| Abuse OTP screen: brute force 6-digit code, spam send | Account takeover, SMS bill (MSG91 cost) | OTP bypass code exists for Apple review — must be unreachable in prod |
| Steal token from device storage (rooted phone, backups) | Session hijack | Depends on SecureStore vs AsyncStorage |
| Hijack deep links / invite links (`https` staff invite, `?ref=`) | Join a store as staff, referral fraud | Tokenised invites; check single-use + expiry |
| Skip client-side plan/feature gates by calling API directly | Free access to paid features (AI Studio, social scheduler, try-on) | Gates must be enforced server-side at call time |

## 2. Customer passport + storefront (A, S)

| Attack | Gain | Why plausible here |
| --- | --- | --- |
| Enumerate `/stores`, `/[store]`, product IDs, collection slugs | Competitor scraping, harvest retailer WhatsApp/phone | Public by design; limit what is exposed and rate-limit |
| Tamper `/api/passport/*` proxy paths (`..`, extra segments, other methods) | Reach non-public API routes, SSRF | Proxy with a path allowlist — one miss = open door (RC-026 was an allowlist miss) |
| Read/write another shopper's preferences, saved stores, selfie analysis | Privacy breach (DPDP Act exposure) | Per-shopper ownership check required on each passport route |
| Stored XSS via store name, product name/description, enquiry text, collection title | Steal shopper session, deface storefront, attack admin viewing it | Many free-text fields rendered in web + admin + JSON-LD (RC-040, RC-077 fixed some) |
| Open redirect / `javascript:` links in retailer-supplied URLs | Phishing from a trusted domain | `safeHttpUrl` must be on every user-supplied href |
| Enquiry/OTP spam through shopper endpoints | WhatsApp/SMS cost, harass retailers | Anonymous `/stylist` and `/enquire` had only global limits (RC-079) |
| Service worker caches an authenticated response | Next user on a shared phone sees prior user's data | Check `sw.ts` scope and cache rules |

## 3. API (A, S, R, T)

| Attack | Gain | Why plausible here |
| --- | --- | --- |
| **IDOR** on every `:id` route (products, customers, collections, enquiries, photos, stock, invoices) | Cross-tenant read/write — the #1 SaaS breach | Hand-written per-route checks (RC-034, 066, 068 show the pattern fails) |
| **Role escalation** — salesperson/delegate calls owner/manager routes | Delete data, burn quota, see unmasked phones | Role checks copied per route |
| Mass assignment — send extra JSON fields (`plan`, `is_admin`, `retailer_id`, `status`) | Free PRO, change ownership | Depends on Zod `.strict()` vs pass-through to Prisma |
| SQL injection via `$queryRaw` (pgvector search, feeds) | Full DB read | Raw SQL is used for search/similar/feed; must be parameterised |
| Upload abuse — oversize/wrong type/other retailer's R2 key; SVG with script; decompression bomb | Storage cost, stored XSS from our domain, job crash | Presigned PUT only fixes key + type (RC-075/080) |
| Webhook forgery — fake Razorpay/MSG91/Meta/RazorpayX events | Free plans, fake payouts, fake delivery status | HMAC + empty-secret handling (RC-076); idempotency |
| Quota evasion — parallel requests (race), retry storms, unmetered endpoints | Free AI usage → your Claude/Fal/Replicate bill | AI costs real money; check atomic quota counters |
| Rate-limit evasion — rotate IPs/`X-Forwarded-For` spoof | Brute force OTP/login | Depends on `trustProxy` config on Railway |
| Verbose errors / stack traces / `/health` details | Recon, internal hostnames | Check error handler output in prod mode |
| SSRF — any feature fetching a user URL (image import, supplier PDF import F-001b, catalog import, link preview) | Reach internal network / cloud metadata | Import-from-URL features are classic SSRF |
| Prompt injection — text on a product photo or in a PDF steering the AI tagger / campaign assistant | Poisoned catalog data, leaked system prompt, cost | Mitigated by tool-use schema for tagging; free-text paths (campaign assistant, stylist) less so |
| Referral/affiliate fraud — self-referral, code guessing, double-claim payout | Real money out (RazorpayX payouts) | Payout race fixed once (RC-036); verify all claim paths |

## 4. Admin dashboard (`/admin`, `/v1/admin/*`) (A, R, I)

| Attack | Gain | Why plausible here |
| --- | --- | --- |
| Credential stuffing / TOTP brute force on admin login | Total platform control | Rate limit + lockout needed; TOTP window |
| Call admin API directly with a retailer token | Admin actions without admin login | RC-034: admin gating was 3 hand-written lists once |
| CSRF on admin mutations (suspend, delete retailer, change plan pricing, theme) | Forced destructive action via a link | Cookie-based admin session → CSRF token required |
| Stored XSS reaching admin (retailer profile, tickets, social templates) | Admin session theft → full takeover | Admin renders retailer-controlled strings |
| Platform theme / `plan_pricing` edit abuse | Rebrand site, free pricing | Super-admin only; verify |
| Deletion Vault / purge role misuse | Data destruction or recovery of "deleted" PII | Separate `kanchuki_purge` DB role; check what it can reach |
| Support-session feature (impersonate a retailer) | Silent account takeover by anyone who gets admin | Switch is OFF; verify audit log + expiry |

## 5. Infrastructure, secrets, supply chain (A, I)

| Attack | Gain | Why plausible here |
| --- | --- | --- |
| Secrets in git history / committed `.env*` / CI logs | DB, R2, Razorpay, Meta, Claude keys | Large repo with many integrations; scan history |
| Leaked `SUPABASE_SERVICE_KEY` / DB URL | Bypass all RLS | Server-only key must never reach web/mobile bundles |
| CORS `*` with credentials, missing security headers | Cross-site data theft, clickjacking | Check API + web headers |
| Public R2 bucket listing / guessable keys | Mass photo download (consent/privacy issue) | Photos are sensitive per SECURITY.md |
| Redis exposed / no auth | Read OTPs, sessions, rate-limit state | Upstash with TLS expected; verify |
| Malicious dependency / postinstall script | Run code in CI and on dev machines | pnpm monorepo, many deps; `pnpm audit`, lockfile review |
| GitHub Actions secret exfiltration via PR | CI secrets | Check workflow triggers (`pull_request_target`) |
| Third-party tokens at rest (Facebook/Instagram page tokens, WhatsApp creds) | Post as retailers, send spam | Check they are encrypted (`ENCRYPTION_MASTER_KEY`) and never returned by any API |
| Meta/Razorpay webhook endpoints on guessable URLs | Event forgery | Signature check is the only defence |

## 6. Typical attack chains (what a real breach looks like)

1. **Free PRO + data theft:** mass-assignment on retailer profile → `plan=PRO` → unlimited AI Studio; or IDOR → download all customers' phone numbers.
2. **Admin takeover:** stored XSS in retailer `store_name` → admin opens retailers list → script reads admin cookie/CSRF → suspends or deletes retailers.
3. **Phone-number harvest:** public store/enquiry endpoints + weak masking → sell customer lists; also DPDP Act breach.
4. **Cost attack:** anonymous `/stylist` or tagging endpoint hammered → Claude/Fal bill spikes (RC-079/081 mitigations exist; verify limits hold).
5. **Payment fraud:** forged Razorpay callback or replayed webhook → paid plan without paying.
6. **Social hijack:** leaked Facebook page token → attacker posts on 100s of retailer pages.
7. **Supply-chain:** compromised npm dependency → secrets from CI → everything.

## 7. What "good" looks like (so reports can say pass/fail)

- Every `:id` query includes `retailer_id` from the **session**, never the request body.
- One shared guard helper per role, with a test per route that asserts 401/403 for each lower role.
- Zod schemas `.strict()`; DB writes use explicit field lists, never `data: req.body`.
- All user-supplied URLs pass through one validator; all HTML-bound strings escaped; CSP set.
- Webhooks: HMAC checked with timing-safe compare, secret non-empty, event-id idempotency.
- Rate limits on every anonymous route that costs money (SMS, AI, WhatsApp).
- No secret in client bundles; tokens stored in SecureStore / httpOnly cookies.
