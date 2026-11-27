# Customer Profile & My Style: research, gaps and redesign proposal

Status 2026-11-27 (later): **Phase 1 MERGED (PR #365, c989a50c). Phase 2 + D4 + D5 MERGED (PR #366, 1703357f), not device-tested; migrations 170/171 applied in prod and read back 2026-11-27. Next: Phase 3 (D6, D7).**. Guided capture + live camera, on-device check (light/blur/cast; face checks only where FaceDetector exists), new reasons + confidence, drape test, split quota, admin failure counts. Out of scope: D1, D2, D3, D6, D7, pref_styles, reason chips, size charts.
Earlier status: **Phase 1 built on branch `feat/my-style-result-screen`, not merged, not device-tested.** Result screen (swatches best/good/go easy, plain "why", in-memory photo preview, Shop my colours / Retake / Delete), `GET /v1/public/my-style/profile` (R3, RC-185), face-photo copy (R6), fix line + tips per failed read, `palette_only` feed filter. Swatch hexes are a static map in `packages/shared/src/color-family.ts` (`color_families` has no hex column: a later migration). Phase 2+ waits on D1-D7 (§11).
Previous status: **research only, nothing built.** Written 2026-11-26 after the owner reported: "customer uploads a photo from the gallery and gets nothing back: no measurements, no saved photo, no advice, no 'photo not good enough, retake' message. The My Style page stays blank."
Scope: shopper-side web PWA (`apps/web/src/app/(shopper)/`), the API behind it (`apps/api/src/routes/public/public-my-style*.ts`, `apps/api/src/lib/my-style-*.ts`), the vision call (`packages/ai/src/my-style-vision.ts`) and the stored data (`customer_accounts` and related tables).
Related specs: `docs/tasks/pending/my-style.md` (F-045), `docs/tasks/pending/my-style-body-profile.md` (body profile, not approved), PRO-REQUIREMENTS §42, PROJECT-MEMORY rows 102, 104, 107, 115. `style-match-lite.md` (F-039) is superseded by F-045.

---

## 0. Summary

1. **The pipeline works, but the customer never sees what it found.** Prod read (2026-11-26): 8 successful photo reads in total, 2 today, and today's read saved a profile (`warm / medium / average`, `style_profile_at` 2026-11-26 15:04 DB time). The data reaches the database. What the customer sees afterwards is a "Your palette is ready" line and, further down, a card with colour *names* (for example "yellow, orange, olive"). There's no photo, no swatches, no explanation, no measurements and no "here's what we saw in your photo". To the customer that looks like nothing happened.
2. **A photo was never designed to return measurements.** The vision call returns three labels only: undertone, depth and frame. Centimetres can't be read from one uncalibrated photo, and the code says so on purpose. The capture screen still says *"A full-body photo works best"* and the tile says *"Selfie / full body"*, so customers expect body results that never come.
3. **The photo is never stored.** This was a deliberate privacy decision (F-045 D1, privacy-guard test). The customer has nothing to look back at.
4. **Measurements are a manual form, and they do nothing today.** 0 of 6 accounts have measurements, and 0 of 319 products have a size chart. The suggested-size label (`suggestSize`) can never appear, so the "Measurements" card has no visible payoff.
5. **Photo-quality feedback is thin.** It only appears *after* a paid AI call and up to 90 s of polling. There are 4 failure reasons (`no_person`, `face_not_clear`, `multiple_people`, `too_dark`), each a single line of text with no example and no visual guide. Nothing checks framing, distance, blur, filters, makeup or a cropped face.
6. **The profile is split across 3 pages and some of it is dead.** `/my-profile` collects `pref_styles`, which the ranker **never reads**. `gender` is stored but **not used**, so a woman's adult feed also shows men's wear (`adultsWhere` = WOMEN + MEN). The palette card only renders when the feed request succeeds (`setStyleProfile` runs only on `r.kind === 'ok'`), so a slow or failed feed hides the profile too.
7. **Fix direction:** one "Style Passport" profile with an explicit **result screen**, a **guided capture with an on-device quality check before upload**, **real colour swatches with reasons**, **measurements that pay off** (size charts plus a size suggestion) and a **clear "why this match" on every product**. Plan in §7 to §10.

On "100% accurate, no ifs and buts": no system can promise 100% on skin tone from a phone photo or on body size from a picture, and claiming it would mislead customers. What we *can* make exact is everything around that: a refused photo always says why and how to fix it; a saved result is always shown, dated and editable; a size is suggested only when the store's chart backs it. The plan is built on that line (§5, §8).

---

## 1. Why "upload from gallery returns nothing": root causes (verified in code and prod)

| # | Cause | Evidence | Customer effect |
|---|---|---|---|
| R1 | The success screen is one sentence, and the sheet then closes onto the feed | `AnalyzeSheet.tsx:276-293` "Your palette is ready / Your picks now lean toward colours that suit you." | No result to look at. |
| R2 | The result card shows family *names* only. No swatches, no undertone or depth wording (spec 4.3 forbids skin and body labels), no frame | `PaletteCard.tsx:57-99` | "warm/medium" is shown as "yellow, orange, green…" text chips with no meaning attached. |
| R3 | The profile card depends on the feed request | `page.tsx:238-243`: `setStyleProfile` only when `fetchFeed` returns `ok` | If the feed fails or times out, the page shows the feed error and **no profile**, even though the profile was saved. |
| R4 | The photo is discarded by design | `tryon-photo-store.ts` (in-memory, one-shot); `my-style-privacy-guard.test.ts` | The customer can't see which photo produced the result. |
| R5 | The photo can't produce measurements | `my-style-vision.ts` schema = `usable, undertone, depth, frame, reason` | "No measurements" is expected behaviour, but the UI (R6) promises otherwise. |
| R6 | The copy over-promises | `AnalyzeSheet.tsx:186` "A full-body photo works best."; `page.tsx:407` tile "Selfie / full body" | The customer uploads a full-body shot expecting a body analysis. |
| R7 | Quality feedback only comes after the AI call | No client-side check; reasons come from the model | Slow, costs a call, and gives one line of feedback. |
| R8 | Failure reasons are narrow | `MY_STYLE_UNUSABLE_REASONS` = 4 values; "too far", "face covered", "heavy filter" have no reason, so they fall into `read_failed` | Generic "We could not read that photo". |
| R9 | Quota: 3 reads a month, **shared with Find similar** | migration 133 `crl_style_analysis` 3/MONTH; garment mode uses the same `STYLE_ANALYSIS` | A customer who tries Find similar twice and a selfie once is blocked until the 1st. They see an error, not a result. Unusable photos are refunded, which is good. |
| R10 | Failure rate isn't recorded | `style_analysis_daily` counts successes only; failures only go to `console.error` | Nobody (owner/admin) can see how many uploads fail, or why. |
| R11 | No device or browser verification ever done | PROJECT-MEMORY row 102: "none of PR-6..PR-10b is browser/device-verified" | Real-phone behaviour (HEIC decode, gallery picker, camera `capture`) is unproven. |

Not the cause: the vision provider (it works, profiles are saved), the worker/process split (worker runs inside the API process, `index.ts:239`) and the kill-switch (`CUSTOMER_STYLE_ANALYSIS = true`).
Not checked: Railway logs for failed reads (Railway CLI auth expired during this research). Run `railway login` and search API logs for `[my-style] job` to see the failure reasons from the owner's test today.

---

## 2. Inventory: what exists today

### 2.1 Pages (customer web PWA)

| Page | What it holds |
|---|---|
| `/my-profile` | Name, masked phone, city, usual size, "Your Style" chips (`pref_styles`), account delete/export |
| `/my-stores` | Followed stores |
| `/my-style` | Header with 2 tiles (Selfie / full body, Find similar), quick quiz, For my child, Taste card, Palette card, Measurements card, Find-similar banner, tabs (For you / Festival / Occasion / Trending / Complete the look), filters (budget, size, occasion, distance), product grid, shortlist bar, enquire per store |

### 2.2 Data stored per customer (`customer_accounts`, prod schema read 2026-11-26)

| Group | Columns | Source | Used by ranking? |
|---|---|---|---|
| Identity | `phone`, `phone_hash`, `name`, `gender`, `city`, `state`, `is_verified` | OTP login, profile form | `city` = location fallback. **`gender` not used.** |
| Size | `usual_size` | Profile form | Yes, default size filter |
| Taste (quiz/profile) | `pref_colors`, `pref_occasions`, `pref_fabrics`, `pref_styles`, `budget_min`, `budget_max`, `notes` | Quick quiz, `/my-profile` chips | colours 0.10, occasion 0.15, fabric 0.05 of fit, `budget_max` filter. **`pref_styles`, `budget_min`, `notes` not used.** |
| Photo-derived | `skin_undertone`, `skin_depth`, `body_frame`, `style_profile_at` | Vision read | Palette ±0.40 of fit; frame +0.05 on keyword silhouettes |
| Measurements | `height_cm`, `bust_cm`, `waist_cm`, `hip_cm`, `measurements_at` | Manual form | Only the `suggestSize` label, which never shows (no charts) |
| Consent / control | `profiling_enabled`, consent events (photo, body `mystyle-body-1.0`), `deleted_at` | Consent steps | Gate |
| Other | `nominee_name`, `nominee_phone` | Passport | No |

Never stored: the photo, the garment photo (Find similar keeps an enum descriptor in page state only), the kids form (session only), the shortlist (localStorage, device-only).

### 2.3 Feature by feature

**Match (ranking).** `score = 0.45·fit + 0.20·trend + 0.15·rating + 0.10·freshness + 0.10·proximity` (`packages/shared/src/my-style-weights.ts`). `fit = 0.30 base + 0.40·palette(+1 good / −1 avoid) + 0.15 occasion + 0.10 pref colour + 0.05 pref fabric`, plus kids age (+0.10/+0.05) and frame (+0.05). Diversity: at most 3 per store in the first 12. Candidates: in stock, adult/kids split by `audience` or keyword, budget, size, radius or city.
- Weaknesses: the customer is never told *why* a product ranks high (`rationale_source: 'none'`). Palette fit depends on `products.color_family`, which 55 of 319 products lack, so they score neutral. Weights are untuned guesses with no click or enquiry feedback loop.

**Palette / colour advice.** 9 seeded palettes (3 undertones × 3 depths) map to `good_families` and `avoid_families`. Example from prod, `warm/medium`: good = yellow, orange, green, olive, teal, maroon, red, brown, gold, cream, peach; avoid = silver, grey, magenta. Admin can edit them. Weaknesses: names only, no swatches, no "why", no occasion-wise advice (wedding vs office), no metal or finish advice (gold vs silver zari, matte vs shimmer).

**Body frame.** One of `petite / average / tall / curvy` from the photo. Never shown to the customer (deliberate, to avoid body-image harm). It adds +0.05 to keyword-matched silhouettes. The silhouette lists are unreviewed styling guesses.

**Measurements.** A manual form with its own consent (no weight, by design), ft/in conversion and a "How to measure" paragraph. Suggested size needs `products.size_chart`, and **0 products have one**. So the card collects data and gives nothing back (RC-030 shape: a collected field that does nothing visible).

**Find similar.** A garment photo becomes an enum descriptor (category, type, colour family, pattern, embellishments). Strict category gate, similarity ≥ 0.6, embedding where available, otherwise attribute overlap.

**Complete the look.** Hand-written complement slots (suit → dupatta + bottom, saree → blouse…) plus a `COMPLEMENTARY_COLORS` table. Unreviewed.

**Tabs.** For you, Festival (≤ 30-day festival), Occasion (a boost, not a filter), Trending (admin `style_trends`), Look.

**Quiz / Taste card.** Answers stored in `pref_*` and shown back on the Taste card (RC-170 fixed).

**Kids.** Session-only form, no photo path (correct, must stay so).

**Privacy and compliance.** Separate photo and body consents, versioned notices, "Clear my data", "Remove my measurements", export and erasure through `STYLE_PROFILE_CLEARED` (RC-172), refund on unusable photos, 5/min rate limit, pixel cap, EXIF stripped, prompt-injection guard in the vision prompt, AI-content report button. This part is solid and must be kept.

### 2.4 Live numbers (prod, read-only, 2026-11-26)

| Metric | Value |
|---|---|
| Customer accounts | 6 |
| With a photo profile | 1 (warm / medium / average, saved 2026-11-26) |
| With measurements | 0 |
| Successful photo + garment reads, all time | 8 (10-20: 1, 10-25: 2, 11-15: 3, 11-26: 2) |
| Failed reads | **unknown, not recorded** |
| Products / with `color_family` / with `size_chart` | 319 / 264 / **0** |
| Active palettes | 9 |

---

## 3. Gap list (ranked)

| Sev | Gap | Fix idea |
|---|---|---|
| P0 | No result screen after a successful read | Result screen §7.3 |
| P0 | No pre-upload quality check; feedback is late, vague and one line | Guided capture + on-device checks §7.2 |
| P0 | Profile hidden when the feed fails (R3) | Separate `GET /my-style/profile` §9 |
| P0 | Copy promises body analysis from a full-body photo | Rewrite copy, face-only for colours §7.2 |
| P1 | Measurements give no payoff (0 size charts) | Category-default size charts + retailer chart prompts §7.5 |
| P1 | `gender` unused; women see men's wear | Use `gender` in `adultsWhere` §9 |
| P1 | `pref_styles` collected, never ranked | Rank it or remove the chips §9 |
| P1 | No "why this matches" per product | Reason chips from fit components §7.4 |
| P1 | Quota 3/month shared with Find similar | Separate quotas §9 |
| P1 | Failures not counted | Failure counter by reason §9 |
| P2 | Profile split over 3 pages | One Style Passport §7.1 |
| P2 | Photo never kept, so nothing to look back at | Owner decision D1 §11 |
| P2 | Palette advice is generic | Rich palette content §7.3 |
| P2 | 55 products have no colour family, so they score neutral | Run the colour backfill (owner-run) |
| P2 | Weights, frame lists and colour pairings unreviewed | Stylist review + click/enquiry feedback |
| P3 | Shortlist device-only | Account-saved shortlist |
| P3 | Nothing verified on a real device | Device checklist §10 |

---

## 4. Target: what a "rich, productive" customer profile looks like

The principle: **every input gives the customer something visible back, at once, with a reason.** Nothing is collected that doesn't change what they see.

| Input from customer | What they get back immediately |
|---|---|
| Face photo (selfie) | Result screen: real swatches (best / good / go easy), metal (gold vs silver), colours by occasion, "Shop my colours" button |
| Full-body photo (optional, later) | Silhouette tips in positive wording ("A-line and anarkali sit well on you"), no body label |
| Measurements | "Your size at this store: M" on every card that has a chart; a "fits me" filter |
| Quiz answers | Taste card + "because you like festive / silk" reason chips on products |
| Gender, city, budget | Correct feed (no men's wear for women unless asked), nearby stores, price fit |
| Shortlist / enquiries | "Saved looks" and "My enquiries" on the profile, synced to the account |

---

## 5. Accuracy: what can and cannot be made exact

| Signal | Achievable accuracy | How to get there | What we must not claim |
|---|---|---|---|
| Photo usable or not | Near-certain for blur, darkness, no face, several faces, face too small, face cut off | **On-device checks before upload**: brightness, blur (Laplacian variance), face detection + size + count (browser `FaceDetector` where present, otherwise MediaPipe Face Detector in WASM) | – |
| Undertone (warm / cool / neutral) | Moderate. Light, white balance, filters and makeup shift it | Guided capture (daylight, facing a window, no filter, light makeup), model asked for a **confidence**; low confidence → customer confirms with a 3-step swatch "drape test" | "100% accurate skin tone" |
| Depth (fair / medium / deep) | Moderate to good | Same + customer can correct it on the result screen | Shade numbers |
| Frame | Rough bucket only | Optional; stays internal, used as a small boost | Any body label shown to the customer |
| Measurements from a photo | Not possible from one photo with no scale | Self-entered (best). Later, a vendor body-scan SDK (front + side photo + known height); vendor accuracy claims are **untested by us** and likely worse in loose Indian wear | Measurements from a single selfie |
| Size suggestion | As good as the store's chart and the customer's tape | Shown only when a chart exists; "between M and L → L" wording | "Guaranteed fit" |

So "no ifs and buts" is delivered as: **no silent results, no unexplained refusals, no guessed numbers.** Every outcome is one of: a clear result, a clear fix-it instruction, or a clear "not available for this product".

---

## 6. Market patterns (reference, not verified for this doc)

- **Colour-analysis apps:** show a season or tone name, a swatch grid, and a drape comparison the user confirms. The confirm step is what builds trust.
- **Indian fashion marketplaces:** size advice on the product page comes from **brand size charts plus purchase history**, not from photos.
- **Body-scan vendors** (for example 3DLOOK, Bold Metrics, MirrorSize): two-photo scan plus height, paid per scan. Treat their accuracy as vendor claims until we pilot them.
- **On-device quality gating:** Google MediaPipe (Face Detector, Pose Landmarker) runs in the browser via WASM, free, and the photo stays on the phone during the check.

---

## 7. Proposed design: "Style Passport"

### 7.1 One profile (replace the 3-way split)

```
┌───────────────────────────────────────┐
│  Hi Priya            ✎ Edit profile    │
│  Profile 70% complete  ▓▓▓▓▓▓▓░░░      │  ← each step shows what it unlocks
├───────────────────────────────────────┤
│  YOUR COLOURS             Updated 26 Nov│
│  [photo thumb*]  Warm, earthy shades    │  *only if owner allows storing (D1)
│  Best  ■■■■■■  Good ■■■■  Go easy ■■■   │  real swatches, not names
│  Metal: Gold  ·  Finish: rich, matte    │
│  [Shop my colours] [Retake] [Adjust] [Delete] │
├───────────────────────────────────────┤
│  YOUR SIZE                              │
│  Height 160 · Bust 88 · Waist 72 · Hip 96│
│  Usual size M     [Update] [Remove]     │
│  "Your size shown on 128 products near you" │
├───────────────────────────────────────┤
│  YOUR TASTE                             │
│  Festive · Office | Silk, Cotton | ≤ ₹5,000 │
│  [Retake quiz]                          │
├───────────────────────────────────────┤
│  SAVED LOOKS (synced)   MY ENQUIRIES (3)│
├───────────────────────────────────────┤
│  PRIVACY: what we keep · export · delete│
└───────────────────────────────────────┘
```

- `/my-style` stays the *shopping* feed; the profile blocks move to one Style Passport (a section at the top of `/my-profile`, linked from `/my-style`). One source of truth, one place to edit.
- Completeness steps: colours (photo), size (measurements), taste (quiz), gender + city. Each step says what it unlocks.

### 7.2 Guided capture (before any upload)

1. **One clear purpose:** "Find your colours (face photo)". Drop "full body" from the tile and the copy until a body feature exists, and never for measurements.
2. **How-to card with example photos:** ✅ daylight facing a window, no filter, light or no makeup, hair off the face, plain background. ❌ dark room, sunglasses, group photo, beauty filter, screenshot.
3. **Camera with an oval overlay**, or gallery pick.
4. **On-device check (instant, free, nothing uploaded):**

| Check | Method | Message if it fails |
|---|---|---|
| Format/size | existing `prepareUpload` | existing |
| Too dark / too bright | mean luminance on a downscaled canvas | "Too dark. Move near a window or turn on a light." |
| Blur | Laplacian variance threshold | "Photo is blurry. Hold still and try again." |
| No face / more than one face | FaceDetector / MediaPipe | "We can't find your face." / "Only you in the photo, please." |
| Face too small | face box under ~15% of the frame | "Come closer: your face should fill the oval." |
| Face cut off | box touches the edge | "Your face is cut off. Centre it in the oval." |
| Strong colour cast | channel ratio | "The light is very yellow. Daylight gives a truer result." (warning, can continue) |

   Each failure shows the photo with the problem marked and a "Retake" button. **Only a passing photo is uploaded**, so quota and AI spend go only to good photos. Thresholds need tuning on real phones.
5. **Server read** (existing job). Add reasons `face_too_small`, `filter_or_edit`, `face_covered`, and ask the model for `confidence: high / medium / low`.
6. **Low confidence:** a drape test, 3 pairs of swatches beside the photo ("which side makes your face look brighter?"), decides warm vs cool. The customer's answer wins and is stored as confirmed.

### 7.3 Result screen (the missing piece)

- Header: "Your colours are ready", the saved date, and a thumbnail of the photo used (held in page memory only; no storage needed for this screen).
- **Swatch grid** for best / good / go easy, from colour-family hex values.
- **Plain-language why**, without skin labels: "Warm, earthy and golden shades make your face look brighter. Icy greys and silver can look flat on you."
- **Metal and work:** gold vs silver zari, antique vs shiny.
- **By occasion:** wedding, festive, office: 3 colours each from the good list.
- **Buttons:** "Shop my colours" (feed filtered to the good families), "Not right? Adjust" (drape test or manual pick), "Delete".
- The same content becomes the "Your colours" block of the Style Passport.

### 7.4 "Why this matches" on every product

Build reason chips from the fit parts the ranker already computes: "Your colour" (palette good), "For festive" (occasion), "Silk, you like it" (fabric), "Your size M in stock" (size), "1.2 km away". Two chips at most per card. `rationale_source` already exists in the feed meta and is `'none'` today.

### 7.5 Measurements that pay off

1. **Category default charts** (admin-set per category: kurti, suit set, blouse, lehenga choli), so a suggestion works on day one without retailer input. Label them "standard size chart, store sizes may differ".
2. **Retailer chart entry** (already built, migration 162): prompt for it when a retailer adds a stitched product.
3. **Illustrated measuring guide** (3 pictures, not a paragraph), plus a fallback: "No tape? Use my usual size."
4. **Payoff counter:** "Your size shown on N products near you."
5. Later (owner decision D3): a vendor scan SDK, only after a measured pilot.

### 7.6 Body / silhouette advice (optional, later)

Only with an explicit full-body consent. Output is positive silhouette advice ("A-line, anarkali and straight-cut kurtis suit you"), never a body-type label, never weight. A stylist reviews the lists first.

---

## 8. Promise to show in the UI

> "We read the colours in your photo to suggest shades. Results depend on light, so you can adjust them any time. Sizes are suggested from each store's size chart and your own measurements."

---

## 9. Backend and data changes (proposal; each needs owner approval; migrations applied by owner)

| Change | Why | Size |
|---|---|---|
| `GET /v1/public/my-style/profile` returning profile + palette + measurements + taste + completeness | The profile no longer depends on the feed (R3) | S |
| Vision schema: add `confidence` and reasons `face_too_small`, `filter_or_edit`, `face_covered` | Better feedback, triggers the drape test | S |
| `customer_accounts.profile_source` (`photo` / `confirmed` / `manual`) | Customer can correct the result | S + migration |
| Hex value per colour family (check if one exists first) | Real swatches | S, maybe migration |
| Failure counter by day and reason (no customer id) | Owner sees failure rate | S + migration |
| Use `gender` in `adultsWhere` (WOMEN for female, MEN for male, both when unset) + a toggle | Stops wrong-gender items | S |
| Rank `pref_styles` (match product subtype/keywords, small boost) or remove the chips | RC-030 shape: dead field | S |
| Reason chips data in the feed cards | "Why this matches" | M |
| Split quota: selfie and Find similar counted separately | R9 | S + migration |
| Category default size charts (admin table) | Size payoff from day one | M + migration |
| Account-synced shortlist | Saved looks across devices | M + migration |
| Optional (D1): private thumbnail store | "See the photo I used" | L + SECURITY.md §12-18 review |

Web: guided capture (MediaPipe WASM lazy-loaded only on that screen), result screen, Style Passport block, reason chips, illustrated measuring guide.

---

## 10. Phased plan (nothing starts without owner go-ahead)

| Phase | Content | Outcome for the customer |
|---|---|---|
| **1. Make results visible** | Result screen with swatches and why; profile endpoint (fix R3); copy fix (R6); real-device test of camera, gallery and HEIC on Android Chrome and iOS Safari | Every upload ends in a visible result or a clear reason |
| **2. Guided capture + quality gate** | How-to card with examples, oval overlay, on-device checks, new failure reasons, failure counter, confidence + drape test | Bad photos are caught instantly with a fix-it message; no wasted quota |
| **3. Style Passport** | One profile, completeness bar, synced shortlist, gender and `pref_styles` fixes, reason chips | One neat profile; every input visibly changes the feed |
| **4. Size that works** | Category default charts, chart prompts for retailers, illustrated guide, payoff counter | "Your size: M" appears on real products |
| **5. Optional** | Stored thumbnail (D1), full-body silhouette advice, vendor body scan (D3) | Only after decisions and a pilot |

Each phase: its own branch, tests first, an RC row for any bug found, local `tsc` + tests + Biome before push (GitHub Actions billing blocked), owner merges, owner applies migrations.

Device checklist for every phase: Android Chrome PWA and iOS Safari; camera, gallery JPEG, gallery HEIC, 20 MB photo, dark photo, group photo, screenshot, signed out, quota used up, slow 3G, feed failing while a profile exists.

---

## 11. Owner decisions needed

| ID | Question | Recommendation | Decision (2026-11-27) |
|---|---|---|---|
| D1 | Store the customer's photo? | **A small private thumbnail, opt-in with its own checkbox**, private R2 prefix, deleted with "Delete my colours" and with account erasure, adults only. Needs a SECURITY.md §12-18 review first. If no: the result screen still shows the photo from page memory during that visit. | Yes (2026-11-27). Not built: needs the SECURITY.md §12-18 review + owner approval first. |
| D2 | Full-body analysis? | Not for measurements. Optional silhouette advice later, after a stylist review. | Later (2026-11-27). |
| D3 | Body-scan vendor? | Not now. Revisit after Phase 4 shows customers use sizes. | No (2026-11-27). No vendor. |
| D4 | Can the customer override the photo result? | **Yes** (drape test or manual pick). The customer's own choice wins. | Yes (2026-11-27). Drape test on low confidence + "Adjust" on the result screen; the customer's answer wins (`profile_source`). Phase 2. |
| D5 | Quota | Selfie 5/month; Find similar counted separately, 10/month. Unusable photos stay free. | Yes, 5/10 (2026-11-27): selfie 5/month, Find similar 10/month, counted separately; unusable photos stay free. Phase 2. |
| D6 | Show men's wear to women? | Default by `gender`, with a toggle. | Default by gender + a toggle (2026-11-27). Phase 3. |
| D7 | Where the profile lives | Style Passport section at the top of `/my-profile`, linked from `/my-style`. | Style Passport on `/my-profile` (2026-11-27). Phase 3. |

---

## 12. Compliance guardrails (keep all)

- DPDP: separate, versioned consent for the photo, body data and (if D1) a stored photo. Withdrawing is as easy as giving. Export and erasure cover every new column. No weight. No skin or body label shown as a judgement. Kids: never a photo path.
- The photo never goes into Redis or BullMQ payloads, logs or Sentry (the privacy-guard test stays and is extended).
- AI only in BullMQ jobs, never in request handlers.
- On-device checks run in the browser; nothing extra leaves the phone.

---

## 13. Skills / agents to use when building

`superpowers:brainstorming` → `superpowers:writing-plans` → `superpowers:test-driven-development`. UI: `impeccable`, `ui-ux-pro-max`, `ecc:frontend-a11y`, `vercel-react-best-practices`. Data: `ecc:database-migrations`, `supabase:supabase-postgres-best-practices`. Review: `ecc:security-reviewer` (photo/body data), `ecc:silent-failure-hunter`, `ecc:typescript-reviewer`. Verify: `ecc:browser-qa`, `superpowers:verification-before-completion`.

---

## 14. Sources read for this research

Code: `apps/web/src/app/(shopper)/my-style/{page,AnalyzeSheet,PaletteCard,MeasurementsCard}.tsx`, `analyze.ts`; `apps/web/src/app/(shopper)/my-profile/page.tsx`; `apps/api/src/routes/public/public-my-style.ts`, `public-my-style-analyze.ts`; `apps/api/src/lib/my-style-analysis.ts`, `my-style-candidates.ts`, `tryon-photo-store.ts`, `features.ts`; `apps/api/src/jobs/my-style-analyze.ts`; `packages/ai/src/my-style-vision.ts`; `packages/shared/src/my-style-{weights,size,measurements,consent}.ts`.
Docs: `docs/tasks/pending/my-style-body-profile.md`, `my-style-session-handoff.md`, `style-match-lite.md`; `docs/PROJECT-MEMORY.md` rows 102/104/107/115, RC-167 to RC-172.
Prod (read-only SQL): `customer_accounts` (schema + counts), `style_analysis_daily`, `style_palettes`, `products` counts; quota seed in migration 133. Railway logs not read (CLI auth expired).
