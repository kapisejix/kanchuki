# AI-generated content reporting (Google Play AI-Generated Content policy)

**Status:** 🟨 Mobile buttons built 2026-11-02 on `feat/ai-content-report-buttons` — not device-tested, no EAS build yet. Web PWA, admin triage and Play Console declaration still open.

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

1. **Web PWA** — My Style (selfie analysis, find-similar), AI Stylist, customer try-on: no report control yet. Needs the same pattern on the customer web plus a passport-session route (the retailer bug-report route needs a retailer token).
2. **Triage** — AI reports land in the same bug-report inbox as ordinary bugs, tagged only by the description prefix. Decide whether admin needs a filter or a separate queue.
3. **Play Console** — declare in-app reporting in the AI-generated content section and check the data-safety answers; the build must go to Play via EAS (mobile JS change, needs a new build).
4. **Device test** — open each of the five surfaces, submit a report, confirm it appears in Admin → bug reports with the `[AI content report: …]` prefix.

## Verification

`npx tsc --noEmit` clean; mobile vitest 543/543 (50 files) on 2026-11-02. Not run on a device.
