# F-045 follow-up: My Style body profile, stored photo, size match (spec, NOT approved)

Status: draft written 2026-11-16. Nothing here is built except §6 step 0 (frame boost, RC-171).
Extends `docs/tasks/pending/my-style.md` (F-045). Owner decisions are in §2; every build step waits for them.

## 1. What the owner asked (2026-11-16) and what the code does today

| Ask | Today (verified in code) |
|---|---|
| Read height and weight from the selfie | **Not possible and not done.** The photo read returns three enums only: `undertone`, `depth`, `frame` (`packages/ai/src/my-style-vision.ts`). A photo has no scale, so height and weight from it would be a guess presented as a measurement. |
| Use body shape in suggestions | `frame` was stored and shown but never ranked. Fixed in RC-171 (small boost on keyword-matched silhouettes). |
| Keep the photo until the customer deletes it, as a reference for new products | **Photo is never stored** by design (F-045 §3.3, §4.3; the privacy-guard test pins it). Only the three enums persist on `CustomerAccount` until `POST /my-style/profile/clear`. |
| Tell customers they upload once a year so they do not delete it | Not built. |
| Full-body phone scan to collect measurements and match suit size | Not built. No size chart data exists on products (only `sizes[]` S..XXXL checkboxes and per-size stock). |

## 2. Owner decisions needed (recommendation first)

**D1. Store the photo?**
- Recommendation: **no.** The derived profile (colour tone, frame, and the measurements below) already persists until the shopper deletes it and is applied to every new product automatically. The photo adds nothing to ranking. It only matters if we later want to re-read it with a better model, or for virtual try-on (F-040, flag OFF), which has its own consent path.
- If yes anyway: opt-in only (separate checkbox, not bundled), stored in a private R2 prefix (never the public CDN), encrypted at rest, deletable in one tap with a real delete (not a flag), included in the DPDP data export, included in the account-delete sweep, and added to `docs/SECURITY.md` §12-18 (governance sections need human review). A selfie of an adult is sensitive personal data; a breach is far worse than a breach of three enums. Minors: never (the kids flow has no photo path and must stay that way).
- Cost of "yes": new storage, new deletion paths (RC-044 shape: pointer and promise must be durable), new retention notice, new breach surface. Cost of "no": none.

**D2. "Upload once a year, so don't delete it" message.**
- Recommendation: build the profile-age message, with neutral wording. Example: "Your style profile was saved on 12 Nov 2026. You only need to update it about once a year, or whenever you want. You can delete it any time." Show it on the profile card and in the consent step.
- Do not word it to discourage deletion. Consent must be as easy to withdraw as to give; a message that pressures people not to delete can breach that, and it would be misleading if the photo is not actually kept (D1 = no). Deleting must stay one tap with a single confirm.
- Optional: after 12 months show "Update your profile?" (no auto-delete, no forced re-upload). `style_profile_at` already exists.

**D3. Measurements: how to collect.** Options in §4. Recommendation: **self-entered first** (Phase A), vendor scan later and only if demand is proven (Phase C).

**D4. Who sees measurements.** Recommendation: shopper only. Stores see a size suggestion on an enquiry ("suggested size M") and never the raw numbers, unless the shopper ticks "share my measurements with this store" per enquiry.

## 3. Data model (Phase A; migration number: next free at branch time, owner applies)

On `CustomerAccount` (all nullable, all cleared by `profile/clear` and the account-delete sweep):
- `height_cm` Int (100..220), `bust_cm` / `waist_cm` / `hip_cm` Int (50..160), `measurements_at` DateTime.
- No weight field. Weight adds nothing size charts use and is the most sensitive and body-image-risky number. If the owner insists, store a self-entered range band, never a number, never used in ranking.
- Units: store cm; the form accepts cm or ft/in and converts once, in one shared function.

On `Product` (retailer-managed, optional): `size_chart` JSON: `{ "M": { "bust": [86, 90], "waist": [70, 74], "hip": [94, 98] }, ... }`, cm ranges per size. Entered once per product or per category default on the retailer side. Without a chart, no size suggestion is shown (never a guess).

## 4. Measurement options (the full-body scan question)

| Option | Accuracy | Privacy | Cost / effort | Verdict |
|---|---|---|---|---|
| A. Self-entered height + bust/waist/hip with a "how to measure" guide | Best (the shopper's own tape) | Best: no photo | Low: form + guide | **Build first** |
| B. Claude Vision estimate from a photo | Poor for metric values: an LLM cannot derive centimetres without a scale. Can only give a rough frame bucket. | Photo leaves our servers to the provider | Already exists | Keep for tone and frame only. Never for numbers. |
| C. On-device body-scan SDK (phone camera, front + side pose, user height as scale; vendors such as Bold Metrics, Mirrorsize, Nera) | Vendor claims are typically a few cm under good conditions (fitted clothes, full body in frame, plain background); worse in loose Indian wear. Not tested by us. | Best case: processed on the phone, only numbers returned | Paid per scan or per month, new native dependency (EAS rebuild), App Store / Play data-safety declarations, India-vendor and data-residency check | **Phase C, only after A shows shoppers use sizes.** Needs a vendor evaluation before any commitment. |
| D. In-house pose model (MediaPipe-style) | Needs calibration and body-model work | On-device possible | High engineering cost | No. |

Honest limits to state in the UI: "approximate", suggested size not guaranteed, loose or draped garments (saree, dupatta, unstitched suit) are not size-matched at all.

## 5. Size match logic (Phase B)

Inputs: shopper measurements, product `size_chart`, `sizes[]`, `product_stock` (only suggest a size that is in stock).
Rule (pure function in `packages/shared`, tested): for each stocked size, the chart range must contain the shopper's measurement within a tolerance; if between two sizes, suggest the larger and say so. Output: `suggested_size` + `fit_note` ("between M and L") or nothing. Stitched readymade only (suit sets, kurtis, blouses); unstitched and saree return nothing.
Ranking: an in-stock exact size is a small boost (reuse the existing `size` filter path in `my-style-candidates.ts`); never a filter.
Show on card and product sheet: "Your size: M (in stock)". WhatsApp enquiry text includes the suggested size only if the shopper opted in (D4).

## 6. Build order (each step: own branch, red-first, RC for any bug, owner merges)

0. **Done 2026-11-16 (RC-171):** frame boost, `MY_STYLE_FRAME`. The silhouette lists are unreviewed guesses: owner or a stylist reviews before launch; keyword matching is whole-string, so check the real subtype values in the taxonomy and extend the lists.
1. D2 profile-age message + "update/delete" actions on the profile card (web only, no migration).
2. Phase A: migration + `PATCH /my-style/measurements` + form with measuring guide + clear/delete/export/account-sweep coverage + privacy-guard test extended.
3. Retailer size chart entry (mobile product form, optional) + API validation.
4. Phase B: size-match function + card/sheet copy + enquiry opt-in.
5. Phase C only after a vendor decision (separate spec).
6. D1 stored photo only if the owner still wants it after reading §2; separate spec + SECURITY.md review first.

## 7. Tests and risks

- Shared size-match: boundary values, between sizes, out of stock, no chart, unstitched, tolerance.
- Privacy: derived values deleted on `profile/clear` and account delete; export includes them; no measurement in logs or Sentry; no measurement in any public/anonymous route; stores never receive raw numbers without the opt-in.
- Risk: a wrong size suggestion causes returns and distrust. Mitigation: show only with a chart, call it approximate, never auto-apply.
- Risk: body-image harm. Mitigation: no weight, no "ideal body" wording, frame stays an internal ranking input and is never shown as a judgement.
- Risk: the frame boost reflects stereotyped styling rules. Mitigation: small weight (0.05), boost only, reviewed lists, the shopper can clear the profile.
- Risk: nothing here is verified with real Vision output or real shoppers (see the F-045 row in CLAUDE.md).
