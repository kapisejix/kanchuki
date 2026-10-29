# Major Task 4 — Hacker Mode (authorized, local/staging only)

Each session ≤10 min. Use the **hacker variant** of `00-master-prompt.md`. Attack ideas per surface are in `hacker-playbook.md`; this file says what to *prove* in one session.

Output per session: `reports/H<n>-<slug>.md`. Final session H8 merges everything into `reports/00-hacker-report.md`.

Tools: skills `api-security-testing`, `owasp-top-10-testing`, `web-app-penetration-testing`, `penetration-testing-with-strix`; agents `agent-skills:security-auditor`, `ecc:security-reviewer`; Playwright MCP for browser flows; `curl` against local API only.

| ID | Surface | Prove or disprove (each as a numbered attack in the report) |
| --- | --- | --- |
| H1 | **Auth + sessions** (retailer OTP, staff invite tokens, admin login, support sessions, Apple review bypass) | OTP brute force / rate-limit; OTP bypass flag reachable in prod config; staff invite token reuse/guessing; admin TOTP bypass; JWT/cookie flags; support-session privilege escalation |
| H2 | **Authorization / IDOR** (API) | Retailer A reads/edits retailer B's product, customer, collection, enquiry, stock, photo; manager/salesperson/delegate hits owner-only routes (RC-034/068 shape); phone masking bypass (RC-066) |
| H3 | **Admin dashboard** (`apps/web/app/admin`, `/v1/admin/*`) | Reach admin API without super-admin; CSRF on state-changing admin calls; admin session fixation; suspend/delete/vault actions as a non-super-admin; admin XSS via stored retailer fields (RC-077) |
| H4 | **Customer passport + storefront** (`(shopper)`, `/v1/public/*`, proxies) | Read another shopper's passport/preferences/saved stores; passport proxy path traversal / SSRF; enumerate retailers/customers; scrape phone numbers; stored XSS in store name, product name, enquiry text; open redirect |
| H5 | **Uploads + media (R2)** | Presigned URL abuse (oversize, wrong type, other retailer's key — RC-075/080); SVG/HTML upload served from our domain; image-bomb to the tagging/compress jobs; predictable R2 keys exposing other retailers' photos |
| H6 | **Money + quotas** | Fake Razorpay callback / replayed webhook (RC-071/076); plan downgrade evasion (RC-082); quota bypass on AI tagging / studio shoot / try-on; referral commission fraud (self-referral, code guessing, payout double-claim RC-036) |
| H7 | **Mobile app** | Extract API base URL + keys from the bundle (`app.json`, `eas.json`, JS bundle); token storage; deep-link hijack (RC-041); intercept traffic (no pinning) and replay; debug flags / dev menus in release |
| H8 | **Infra + secrets + merge** | Secrets in git history / `.env*` committed; CORS wildcard + credentials; security headers; Swagger/health/metrics endpoints exposed; dependency CVEs (`pnpm audit`); Redis/DB reachable from outside; then merge H1–H7 into `reports/00-hacker-report.md` (executive summary, ranked findings, attack-chain diagram, fix order) |

## Rules of engagement

- Local dev DB or staging only. Seed fake retailers/customers. Never real phone numbers.
- No DoS, no volumetric load. Rate-limit tests: ≤50 requests.
- Do not touch Railway/Supabase production through MCP, read-only status excepted.
- Report secrets by location only, never value.

## Report template (per finding)

```
### H<n>-<k> <title>             Severity: Critical|High|Medium|Low
Attacker: anonymous | shopper | staff | retailer | none (insider)
Goal: what they gain
Preconditions:
Steps: (numbered, exact request/payload)
Impact:
Evidence: (response / code file:line)
Fix: (concrete diff or config)
Status: Confirmed | Plausible | Not exploitable
```
