# Major Task 2 — Web (`apps/web`)

Covers storefront (`[store]`, `stores`, `category`), customer passport (`(shopper)`: /my-profile, /my-stores, /my-style), marketing pages, admin (`app/admin`), and Next API proxy routes (`app/api`).

| ID | Small task | Do | Output |
| --- | --- | --- | --- |
| T2.1 | Typecheck + lint baseline | `rtk tsc --noEmit` and `rtk lint` in `apps/web`. Group by file/code. | `reports/T2.1-web-typecheck-lint.md` |
| T2.2 | Unit + e2e health | `rtk vitest run`; `pnpm test:e2e:web` (Playwright, stubs in place). List failures, skipped, RC-048-style red-for-unrelated-reasons. | `reports/T2.2-web-tests.md` |
| T2.3 | Dead code | `npx knip` in `apps/web`. Unused components, routes, CSS, deps, teardown leftovers (cart/checkout/VTO/lookbook UI). Verify with Serena. | `reports/T2.3-web-dead-code.md` |
| T2.4 | Admin dashboard | `app/admin/**`: every page and its API call is super-admin-gated (RC-034), CSRF on mutations, bodyless-POST handling, session check. Check client-only guards that the server does not repeat. | `reports/T2.4-web-admin.md` |
| T2.5 | Passport + proxy routes | `app/api/passport/**` and other proxies: path allowlist, methods exported (RC-026), null-body status (RC-045), auth cookie forwarding, SSRF via path param. `(shopper)` pages: toggles loaded from API not `useState(true)` (RC-083/058). | `reports/T2.5-web-passport-proxy.md` |
| T2.6 | XSS / injection surface | Grep `dangerouslySetInnerHTML`, JSON-LD (RC-040/077), `href={user_url}` (RC-077 `safeHttpUrl`), `target=_blank` without `rel`, `window.open`, `postMessage`. | `reports/T2.6-web-xss.md` |
| T2.7 | Runtime errors in browser | Playwright MCP at 360px: load home, /stores, a store page, product sheet, /my-style, /login. Capture console errors + failed network requests (`browser_console_messages`, `browser_network_requests`). | `reports/T2.7-web-runtime.md` |
| T2.8 | Build + headers | `rtk next build` result, `next.config` security headers (CSP, frame-ancestors, HSTS), `sw.ts` caching of authenticated responses, `robots`/sitemap leaks. | `reports/T2.8-web-build-headers.md` |

## Done when

Every T2.x has a report, `tsc` + `lint` + unit tests green, e2e failures explained.
