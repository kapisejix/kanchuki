# Storefront returns HTTP 200 for unknown paths (soft-404)

**Opened:** 2026-10-10 · **Status:** 🔴 Planned, not started · **Priority:** low (SEO + wasted renders, no data exposure) · **Found by:** a scanner probe in the Railway web HTTP log

---

## 1. What was observed

- Railway web log, 2026-10-10 05:53:12 UTC: `GET /.git/config 200 1109ms`.
- Re-tested by hand against `https://kanchuki.app/.git/config`:
  - status `200`, `content-type: text/html`, 15.7 KB.
  - body is the Next.js 404 page ("This page could not be found" ×2) wrapped in the normal app shell.
  - grep for `[core]`, `[remote`, `repositoryformatversion`, `url =` → 0 matches. **No git data is exposed.** This is not a security leak.
- The page content says "not found" but the HTTP status is 200.

## 2. Why it matters

- **SEO:** crawlers see a 200 for every junk URL (soft-404). Dilutes the index and wastes crawl budget on `/[store]/[collection]` paths that don't exist.
- **Cost / noise:** every scanner probe (`/.git/config`, `/wp-login.php`, `/.env` …) runs a full server render and fetches `/v1/public/theme` plus the retailer/collection lookup against the API.
- **Monitoring:** 5xx/4xx dashboards never see these, so scanner traffic looks like healthy 200s.

## 3. Likely cause (to verify, not yet proven)

- `/.git/config` matches `apps/web/src/app/[store]/[collection]/page.tsx` (`.git` = store, `config` = collection).
- `[store]/page.tsx:98` does call `notFound()` when the profile is missing. `[store]/[collection]/page.tsx` had **no** `notFound()` match when grepped on 2026-10-10 — check how it handles a missing collection.
- `[store]/loading.tsx` and `[store]/[collection]/loading.tsx` exist. With a Suspense `loading.tsx`, Next App Router flushes the `200` status line before `notFound()` resolves, so the 404 UI streams in under a 200. This is documented Next behaviour; confirm against the installed Next 14 version.

## 4. Proposed fix (smallest first)

1. Reproduce locally: `curl -i localhost:3000/does-not-exist/nope` → expect 200 today.
2. Resolve existence **before** streaming: do the retailer/collection lookup in `generateMetadata` / the page and call `notFound()` there, or move the lookup into `layout.tsx` above the `loading.tsx` boundary so the status is decided before the first flush.
3. Alternative if (2) is awkward: a `middleware.ts` early-reject for obviously non-storefront paths (`/.git/*`, `/.env*`, `/wp-*`, `*.php`) returning 404 without rendering. Cheap and also stops scanner renders; does not fix real soft-404s for unknown collection slugs.
4. Add a test: unknown store and unknown collection → status 404 (Playwright e2e or route test).
5. Re-check with `curl -i https://kanchuki.app/.git/config` after deploy → expect 404.

## 5. Out of scope / notes

- No DB, schema, env or deploy change needed. Code change in `apps/web` only → needs owner approval per project rules; deploy via main push only.
- The web healthcheck hitting `/` every 60 s (which triggers one `/v1/public/theme` fetch per minute) is a separate, harmless item — see `docs/tasks/pending/improvments-railway.md`. A lightweight `/api/health` would remove it; optional.
