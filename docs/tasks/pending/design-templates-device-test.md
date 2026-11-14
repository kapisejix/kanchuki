# Design templates — device test checklist

**Covers:** retailer design picker (`apps/mobile/app/social/design.tsx`), scheduler design step (`apps/mobile/app/social/schedule/[id].tsx`), AI design (`apps/mobile/app/social/ai-design.tsx`).
**Spec:** `docs/tasks/pending/admin-social-design-templates.md` (§4.5, §5, §10 acceptance). **Status 2026-11-14:** all three built and merged, **never run on a device**. Seen only: 5 designs rendered with synthetic data (by eye), unit tests.
**Entry points:** Growth hub → "Design a Post" (`/social/design`) and "AI Design" (`/social/ai-design`); scheduler → a post → style sheet.

Record result per row: ✅ / ❌ + note + screenshot. A ❌ gets an RC entry if it is a root-cause bug.

## 0. Setup (owner, before any device run)

| # | Step | Why |
|---|---|---|
| 0.1 | Test retailer exists, **PRO plan**, has ≥8 products with photos, a logo, a shop name. A second retailer with **no logo** and one with a **product that has no photo**. | Logo-missing and no-photo paths (spec §4.5) |
| 0.2 | In `/admin/design-templates`: publish **at least 4 designs**: one single-product, one multi-slot (≥3 slots), one with a headline/offer layer, one festival frame. Leave 2 DRAFT and 1 HIDDEN. | Draft/Hidden must not reach retailers |
| 0.3 | Starter-plan test retailer, to test the plan gate (spec D5: Starter 3 designs, Growth/Pro all — **confirm what was actually built before testing**). | Server-side gate |
| 0.4 | For §3 only: `plan_features` row `AI_CUSTOM_TEMPLATE` and `plan_limits` rows for the test plan, quota set to **2**. No row = refused (METERED, RC-103). | T5 is off without these |
| 0.5 | Android release/dev build with the merged `main`. Note build number. Test on a mid-range Android and, if possible, a slow connection. | Real conditions |
| 0.6 | Facebook Page + Instagram connected on the test retailer (or a Meta test page). | Needed to publish for real |

## 1. Design a Post (`/social/design`)

| # | Check | Expect |
|---|---|---|
| 1.1 | Open from Growth hub | List shows **only PUBLISHED** designs for the plan; DRAFT/HIDDEN absent; thumbnails load |
| 1.2 | Airplane mode, reopen | "Could not load designs. Check your connection…" (not a blank screen) |
| 1.3 | Tap a single-product design | Highlighted border; title says "Pick a product"; picker allows exactly 1 (tapping a second swaps) |
| 1.4 | Tap a multi-slot design | "Pick up to N products"; cannot select N+1; selection order badges 1..N |
| 1.5 | Switch design after picking products | Selection and preview cleared |
| 1.6 | "Make design" with 0 products | Button disabled |
| 1.7 | Make design (single) | Spinner, then preview with **correct ₹ price, product name, shop name, logo**, product photo not distorted |
| 1.8 | Check the price against the product's real price | Exact (paise→rupees right; ₹2,100 not ₹2,10,000) |
| 1.9 | Edit headline/offer after a preview | Preview clears; "Remake design" re-renders with the new text |
| 1.10 | **Hindi/Devanagari** headline, e.g. `दिवाली स्पेशल` and offer `20% छूट` | Renders as glyphs, **not boxes** (Noto Sans Devanagari is bundled in the API image since `2e468ae3`; never verified in a built image on Railway. Quick check without a device: type the text in the `/admin/design-templates` live preview) |
| 1.11 | 80-char headline, and a very long product name | Shrinks or ellipsises, nothing runs off the canvas |
| 1.12 | Emoji and `<script>` / `&` in headline | Rendered literally, no crash, no blank image |
| 1.13 | Retailer with **no logo** | Logo layer hidden, no broken box |
| 1.14 | Product with **no photo** | Blocked with a plain message, not a 500 / generic error |
| 1.15 | Story 9:16 and 1:1 designs | Preview letterboxed inside the 4:5 frame; check the posted image is the true aspect |
| 1.16 | Multi-slot with fewer products than slots | Wraps/filled per spec (slots filled from next products); no empty hole |
| 1.17 | "Post this design" | Opens composer as an **IMAGE** post with the design image preloaded |
| 1.18 | Publish to FB + IG from there | Post appears on both with the design image; caption works |
| 1.19 | Tap Make design twice fast | One render, no duplicate |
| 1.20 | Time the render on 4G | Note seconds. >10 s is a finding (client timeout is the default 10 s unless raised) |

## 2. Scheduler design step (`/social/schedule/[id]`)

| # | Check | Expect |
|---|---|---|
| 2.1 | Open a scheduled post, open a slide's **style sheet** | "Your designs" list shows published designs |
| 2.2 | Apply a design to one slide | Slide badge shows the **design name** (not "Styled") after the list loads |
| 2.3 | Type a headline and offer line on that slide, apply | Both saved per slide; reopen sheet, values persist |
| 2.4 | Leave headline empty | That text layer skipped, no empty box |
| 2.5 | Apply a **multi-slot** design | Slots filled from that slide's next products, wrapping if fewer |
| 2.6 | Apply designs to 2 slides with different text | Each keeps its own text |
| 2.7 | Swap a slide from design back to a built-in style (white price, badge) | Design id cleared, built-in applies |
| 2.8 | Hide the design in admin (HIDDEN), reopen the post | Slide badge does not crash; at publish it **falls back to the original photo** |
| 2.9 | Schedule for ~10 min ahead, wait for the tick (every 5 min) | Post publishes with the **rendered design** (render-at-publish), correct price/text |
| 2.10 | Hindi headline in a scheduled slide, let it publish | Glyphs correct in the published image |
| 2.11 | Product price edited between scheduling and publish | Published image shows the **new** price (rendered at publish) |
| 2.12 | Delete the retailer logo before publish | Publishes without a broken logo box |
| 2.13 | Downgrade plan / turn off feature, then publish | Publish-time plan re-check behaves (refused or skipped with plain reason), no crash loop |
| 2.14 | Status card on the scheduler home | Counts correct after the above; failures show a plain-language reason |

## 3. AI design (`/social/ai-design`) — needs 0.4

| # | Check | Expect |
|---|---|---|
| 3.1 | Open with **no** plan rows / on a plan without the feature | Refused with a clear message, no spinner stuck, **no quota charged** |
| 3.2 | "Make AI design" disabled until product picked and prompt ≥5 chars | Yes |
| 3.3 | Prompt `Warm Diwali evening, soft diya glow, festive bokeh` | Spinner "about a minute"; polls every 3 s; result appears |
| 3.4 | Result looks right | **Garment kept** (same product), scene changed, **no AI-drawn text** |
| 3.5 | Quota after success | Used exactly **1** (not 2) |
| 3.6 | Format chips: Original / Square / Portrait / Story | Output matches; choosing an overlay disables format chips and says 4:5 |
| 3.7 | Overlay Price strip / New arrival / Your logo | Drawn by us, exact digits; logo overlay with no logo handled |
| 3.8 | Prompt with a URL, a brand name, "make it look like <celebrity>" | Rejected or cleaned with a plain message; no model call charged |
| 3.9 | 300-char prompt; Hindi prompt | Accepted; no crash |
| 3.10 | Kill the app mid-generation, reopen later | Result in "My AI designs" (saved on the server), quota not double-charged |
| 3.11 | Force a failure (admin disables provider / bad key on a test env) | Row FAILED, plain error, **slot refunded** (quota back), "Try again" works |
| 3.12 | Stay >4 min without finishing | "Taking longer than usual…" message, not an infinite spinner |
| 3.13 | Use all quota (2), try a 3rd | Refused at 0, nothing charged |
| 3.14 | "Report this AI content" | Sheet opens, tagged `[AI content report: AI custom design · id]`, submits |
| 3.15 | "Post this design" and a tile in "My AI designs" | Opens composer as IMAGE; publishes to FB/IG |
| 3.16 | "Reuse a prompt on another product" chip | Fills the prompt box; new product → new generation, charged 1 |
| 3.17 | Two retailers | Retailer B cannot see or open A's AI designs (list is own-only) |

## 4. Cross-cutting

| # | Check | Expect |
|---|---|---|
| 4.1 | **Retailer A renders with retailer B's product id** (API call, not UI) | 403/404, not a render (assertOwnProducts) |
| 4.2 | Composer refuses an `image_url` outside `R2_PUBLIC_URL` | Refused |
| 4.3 | Back-button and keyboard: open the keyboard on the headline field | Field not covered; Android Back leaves the screen cleanly |
| 4.4 | Salesperson/manager login | Behaviour matches their allowlist (can/can't open Growth designs); no crash |
| 4.5 | Text scaling 130% / small phone (360 px) | Chips and buttons not cut off |
| 4.6 | Screen reader labels ("Design <name>", "Headline text", "Describe the design") | Announced |
| 4.7 | Sentry after the run | No new unhandled errors from render/publish/ai-design |
| 4.8 | R2 after the run | Rendered images exist at the URLs posted; no orphan growth (staged uploads sweep unaffected) |

## 5. Known gaps (do not file as new)

- Hindi font: Noto Sans Devanagari is bundled (`apps/api/fonts/`, Dockerfile lines 45-48, `FONT_STACK` in `design-render.ts`) but **unverified on Railway** (1.10, 2.10 are the real test). Old built-in scheduler templates (`schedule-templates.ts`) do not list it and may still show boxes.
- 1.91:1 format `LANDSCAPE_1_91_1` (1200×628) added 2026-11-14 on `feat/design-landscape-format` (migration 157, owner applies first). No starter design uses it yet; `design.tsx` letterboxes it inside the 4:5 preview. Never rendered with a real photo.
- Backdrop/starter designs seen only with synthetic data, never with real product photos.
- `design.tsx` previews at a fixed 4:5; non-4:5 designs are letterboxed (cosmetic).
- Real FLUX quality/latency never measured (3.3–3.4 are the first real run).

## 6. Result log

| Date | Tester | Build | Device | Sections run | Failures (row ids) |
|---|---|---|---|---|---|
| | | | | | |
