# AI Studio Shoot — Demographic Models + Scene Expansion

**Status:** Steps 1–5 BUILT (unmerged, admin-bench only) 2026-08-30 — see BUILD-LOG §2026-08-30 (demographic). Step 6 pending owner testing.
**Created:** 2026-08-30
**Owner workflow:** build steps 1–5 → owner tests every scene × demographic in the admin bench → owner finalises the subset to ship in the retailer mobile AI Studio → step 6 (mobile auto-filter) + un-draft the chosen scenes.

---

## Goal

Kill the "which model do I pick" confusion. The product's AI-tagged category decides **who** stands in the shot; the scene template decides **only the setting**. Every scene works with a person (swapped per demographic) or as a product-only shot.

Owner wants:
- New model demographics: **male, teenage boy, teenage girl, kids boy, kids girl** (no new female models — Priya/Ananya/Meera already cover womens).
- Scenes usable **with or without a model** — e.g. White Studio, Warm Luxury, Mannequin Presentation, Wedding Florals, Professional Studio, Warm Beige Studio (product-only, always available).
- The good scenes available across **all** demographics: Copper Diamond Backdrop, Modern Mall Concourse, Seated on couch/sofa/chair, Tree-Tunnel Avenue, plus "Male model with Car/Bike".
- Admin bench: pick demographic + scene, generate, compare. Then finalise the shipped set.
- Reference pics in `docs/photoshoots/models/` are **inspiration for prompt text only** — not hosted, not runtime inputs.

---

## Concept

### Demographic (derived, no schema change)

Keyword match on the product `category` string (extends the existing `resolveIndianModelDescription` in `apps/api/src/lib/studio-shoot.ts` that already detects men/kid).

| Demographic  | Category / name keywords |
|--------------|--------------------------|
| `womens` (default) | saree, lehenga, kurti, ladies suit, anarkali, sharara, blouse, gown, salwar |
| `mens`       | men's, gents, sherwani, kurta pajama / pyjama, nehru jacket, bandhgala, pathani, dhoti kurta, menswear |
| `teen_girl`  | teen + girl / girls; "15" age hint |
| `teen_boy`   | teen + boy / boys |
| `kids_girl`  | kid / child / toddler / infant + girl / frock |
| `kids_boy`   | kid / child / toddler / infant + boy |

Ambiguous → fall back to `womens` (current default behaviour).

### Person clause (6-way, built in `generateStudioImage`)

- `womens`   → "a graceful adult Indian woman fashion model"
- `mens`     → "a dignified adult Indian man fashion model"
- `teen_girl`→ "an Indian teenage girl model, about 15 years old"
- `teen_boy` → "an Indian teenage boy model, about 15 years old"
- `kids_girl`→ "a young Indian girl child model, about 6 years old"
- `kids_boy` → "a young Indian boy child model, about 6 years old"

### Scene tags (new optional fields on `STUDIO_TEMPLATES`)

- `noModel?: true` — product-only scene. Person clause skipped, demographic ignored. Always shown.
- `audience?: Demographic[]` — scene only fits these demographics. Omitted = fits everyone.

### Prompt assembly

- `noModel` scene → existing `prompt` as-is + colour-lock guard (unchanged path).
- model scene → `sceneGuard` + `"Place this exact garment on <personClause>, "` + `<scene setting>` + `<colourEnforcement>`.
  - Scene setting comes from a cleaned `scene` string per template (person prefix + trailing colour sentence stripped from today's `prompt`).
  - `womens` + no demographic passed → behaviour identical to today (backward compatible).

---

## Scene tagging

**Product-only (`noModel: true`, always shown):**
White Studio, Pure White Studio, Warm Beige Studio, Warm Luxury, Premium Luxury Studio, Minimal Clean Studio, Professional Studio, Lifestyle Home Studio, Boutique Rail, Mannequin Presentation, Clothing Flat-Lay, Styled Hanger, Flat-Lay Linen, Gold Festive, Diwali Lights, Wedding Florals, Macro Fabric Detail.

**Womens-only (`audience: ['womens']`):**
Dupatta in Motion, Seated Haveli Steps, Royal Bridal Palace.

**Mens / teen-boy (`audience: ['mens','teen_boy']`):**
Male with Car (new), Male with Bike (new).

**Kids (`audience: ['kids_boy','kids_girl']`):**
Kids Playing Outdoors (new).

**Teens (`audience: ['teen_girl','teen_boy']`):**
Teen Street Style (new).

**Universal (no `audience` — all demographics):**
Studio Editorial, Gradient Campaign Hero, Boutique Showroom, Golden-Hour Rooftop, Vogue Editorial, Catwalk Runway, Blossom Atrium, Bougainvillea Corner, Tree-Tunnel Avenue, Sunset Arch Alcove, Pastel Gradient Lounge, Whitewashed Villa Arch, Sunlit Ocean Arches, Modern Mall Concourse, Copper Diamond Backdrop, Lakeside Deck View, Royal Botanical Garden, Jaipur Heritage Street, Royal Palace Courtyard, Grand Heritage Library, Dark Dramatic Low-Key, Cinematic Film Grade, Seated Lounge (new).

**New scene rows to author:**
1. **Seated Lounge** — model seated on a mid-century sofa / accent chair, styled cushions, soft window light, neutral wall. Universal.
2. **Male with Car** — model leaning against / beside a premium car, urban driveway or open road, golden-hour. `['mens','teen_boy']`.
3. **Male with Bike** — model with a classic motorcycle, city street or garage backdrop. `['mens','teen_boy']`.
4. **Kids Playing Outdoors** — child mid-play in a sunny park / garden, candid, soft bokeh greenery. `['kids_boy','kids_girl']`.
5. **Teen Street Style** — teen model against a graffiti / brick urban wall, candid streetwear stance, daylight. `['teen_girl','teen_boy']`.

---

## Build steps (this session's scope: 1–5)

### 1. `packages/shared/src/constants/index.ts`
- Add `Demographic` union + `PRODUCT_DEMOGRAPHICS` list + `demographicForCategory(category?: string | null, name?: string | null): Demographic`.
- Extend `STUDIO_TEMPLATES` element type with `noModel?: boolean` and `audience?: readonly Demographic[]`.
- Add a `scene?: string` field (setting-only text) to model scenes; author it for each by stripping the person prefix + trailing colour clause from the current `prompt`. Keep `prompt` for the `noModel` rows.
- Tag every existing row per the table above.
- Add the 5 new scene rows.
- Add `studioTemplatesFor(demo: Demographic): STUDIO_TEMPLATES[]` → rows where `noModel || !audience || audience.includes(demo)`.
- Leave `STUDIO_MODELS` + `getStudioModel` untouched (IDM-VTON / retailer fashion-model path still uses them).

### 2. `apps/api/src/lib/studio-shoot.ts`
- `generateStudioImage` accepts `options.demographic?: Demographic`.
- Add the 6-way `personClause` map.
- Prompt assembly: `noModel` template → current behaviour. Else → compose `sceneGuard + "Place this exact garment on " + personClause + ", " + (template.scene ?? strippedPrompt) + colourEnforcement`.
- `resolveIndianModelDescription` → replace with / delegate to `demographicForCategory` + `personClause` so the no-template and `runway` paths also honour demographic.
- IDM-VTON branch: only run when demographic is `womens`/`mens` adult AND a real `modelId` was passed — for teen/kid, skip straight to the prompt path (a stock adult VTON result would otherwise be returned and never corrected).

### 3. `apps/api/src/routes/admin/admin-photo-cleanup.ts`
- Add `demographic` (enum, optional) to the `studio-shoot` body schema; pass to `generateStudioImage`.

### 4. `apps/web/src/app/admin/photo-cleanup-test/page.tsx`
- New **Product demographic** `<select>`: Womens / Mens / Teen girl / Teen boy / Kids girl / Kids boy / "— any / product-only —".
- Filter the scene `<select>` through `studioTemplatesFor(selectedDemographic)` (show all when "any").
- Send `demographic` in the `/studio-shoot` POST body.
- Keep the existing "Fashion model" dropdown as an advanced override (relabel "Fashion model — advanced override").
- Scene `<option>` label: show `label` + a small `[audience]` / `[product-only]` hint so the tester sees why a scene appears.

### 5. Docs
- `docs/BUILD-LOG.md` — new entry.
- `CLAUDE.md` — What's Built index row.

---

## After owner testing (separate session — step 6)

- Owner picks the final scene set + which stay `draft: true` (admin-only) vs ship to retailer mobile.
- Un-draft the chosen rows.
- **Mobile auto-filter:** `apps/mobile/src/components/product-detail/ProductStudioModal.tsx` — read `product.category`, call `demographicForCategory`, show only `studioTemplatesFor(demo)` in the picker. No manual demographic pick for the retailer.
- Optional: `ProductStudioModal` "no model" toggle so a retailer can force a product-only scene on any product.

---

## Notes / decisions

- No DB migration. Demographic is inferred at generation time from the category string.
- No asset hosting. `docs/photoshoots/models/*` pics are prompt-writing reference only.
- `STUDIO_MODELS` array stays — do not break the IDM-VTON path or the retailer fashion-model picker.
- Backward compatible: existing callers that pass no `demographic` and no `noModel` tag render exactly as today (womens).
- Colour-lock guard (`sceneGuard` + `colourEnforcement`) unchanged — the whole point of Kontext is garment pixels stay identical.
