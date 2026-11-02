# AI-generated content reporting (Google Play AI-Generated Content policy)

**Status:** 🟨 Merged to `main` 2026-11-02 (PRs #221 mobile, #222 web + API, #223 admin queue; migration 148 applied by owner). Not device/browser-tested, no EAS build yet. Play Console declaration still open.

## Why

Google Play rejects apps that show AI-generated content without an in-app way for users to report or flag objectionable output (a developer reported a rejection for exactly this on 2026-10-29). Kanchuki generates content with AI in several places, and before this change the only report path was the generic "Report a Problem" row in Settings — not reachable from the generated content itself.

## What is built (mobile, `apps/mobile`)

| Piece | Where |
|---|---|
| `aiContent?: { feature, ref? }` prop on the report sheet — retitles it "Report AI Content", prefixes the description `[AI content report: <feature> · <id>]`, sets `screen_name` to the feature. Text only: no image is attached, so a try-on picture that is meant to be deleted never leaves the device | `src/components/ReportProblem.tsx` |
| `<ReportAiContent feature contentRef? dark? />` — flag button + sheet (sheet mounts only while open) | `src/components/ReportAiContent.tsx` (new) |
| AI Studio Shoot result (`feature="AI Studio Shoot"`, ref = product id) | `src/components/product-detail/ProductStudioModal.tsx` |
| Retailer virtual try-on result (`"Virtual try-on"`, ref = product id) | `app/product/try-on.tsx` |
| In-store enquiry try-on gallery (`"Virtual try-on (in-store)"`) | `app/enquiry-try-on.tsx` |
| AI caption in the post composer — shown while the caption is the untouched AI suggestion | `app/social/create.tsx` |
| AI caption in the scheduler — shown on every editable post with a caption (plan captions are AI-filled by default) | `app/social/schedule/[id].tsx` |
| Source-pin test: each surface renders the button with its feature name; `ReportProblem` keeps the tag | `__tests__/ai-content-report.test.ts` |
| Shared test setup gained an `expo-image-picker` mock (the new import chain pulls the native module into suites that render these screens) | `src/test/setup.ts` |

Reports go through the existing `POST /v1/retailers/me/bug-reports` route — **no API or migration change**.

## Deliberately not covered

- `growth/videos.tsx` / `ProductMediaCarousel`: `ProductVideo.source` is `UPLOAD | KEN_BURNS` (an ffmpeg slideshow of the retailer's own photos), not generative AI. F-034 AI image→video is admin-only today; add the button when it reaches retailers.
- AI product tagging / descriptions on the add-product form: editable metadata, not a generated image or message shown to others.

## Still open

1. **Migration 148** — written, NOT applied (owner applies). Until it is applied, `POST /v1/public/passport/ai-report` 500s on every submit.
2. **Triage** — built 2026-11-02 (`feat/ai-content-report-admin`, stacked on the web PR): shopper reports have an admin queue at **Admin → Team & Support → AI Content Reports** (`/admin/ai-content-reports`; filter by status / feature, mark reviewed / reopen, reporter phone masked, anonymous shown as such). API `GET /v1/admin/ai-content-reports`, `…/stats`, `PATCH …/:id` (`admin-ai-content-reports.ts`, inherits the `adminRoutes` auth hook, covered by the route-guard test; 5 route tests). Still two queues: retailer reports stay in Bug Reports (prefix-tagged `[AI content report: …]`), shopper reports here. Standard admins only (SUPPORT_MANAGER allow-list not extended). Needs migration 148 applied before it shows anything.
3. **Play Console** — declare in-app reporting in the AI-generated content section and check the data-safety answers; the build must go to Play via EAS (mobile JS change, needs a new build).
4. **Device / browser test** — mobile: open each of the five surfaces, submit, confirm the `[AI content report: …]` bug report. Web: submit from AI Stylist (signed out), try-on, My Style selfie / find similar / complete the look; confirm a row in `ai_content_reports`.

## Web PWA (built 2026-11-02, branch `feat/ai-content-report-web`, stacked on the mobile PR)

| Piece | Where |
|---|---|
| Table `ai_content_reports` (`customer_account_id` nullable = anonymous; `feature`, `content_ref`, `description`, `status NEW/REVIEWED`), RLS policy, text only | migration `148_ai_content_reports`, `AiContentReport` in `schema.prisma` |
| `POST /v1/public/passport/ai-report` — closed list of 5 feature labels, description 10–2000 chars, identity from the passport session if any (never the body); cap 20/24 h per account, 100/h for all anonymous reports (the proxy forwards no client IP, RC-084) | `apps/api/src/routes/public/passport/passport-ai-report.ts`, registered in `passport.ts` |
| Account delete unlinks the account's reports (`customer_account_id = null`, text kept for moderation) — the delete is soft, so the FK cascade never fires (RC-099 shape) | `passport-data.ts` |
| Proxy path allowlist gains `ai-report` | `apps/web/src/app/api/passport/[...path]/route.ts` |
| Inline `<ReportAiContent feature contentRef? />` (no modal: safe inside `Sheet`, RC-065) | `apps/web/src/components/ReportAiContent.tsx` |
| Wired into: AI Stylist results, customer try-on result, My Style selfie / find-similar result, Complete-the-look | `AIStylist.tsx`, `TryOnSheet.tsx`, `AnalyzeSheet.tsx`, `LookPanel.tsx` |
| Tests | API `passport-ai-report.test.ts` (6) + delete unlink case; web `ReportAiContent.test.tsx` (3) |

Verification: API `tsc` clean, vitest 2873 passed / 9 skipped; web `tsc` clean, new component test 3/3. Ten web test files (`WishlistView`, `shortlist`, `recentlyViewed`, …) fail identically with and without this change (checked by stashing) — not touched here.

## Verification

`npx tsc --noEmit` clean; mobile vitest 543/543 (50 files) on 2026-11-02. Not run on a device.
