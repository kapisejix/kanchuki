# ChatGPT "/catwalk" style commands → Kanchuki AI Studio Shoot

**Date:** 2026-08-29
**Question from owner:** the `/catwalk`, `/garden`, `/festival`… "commands" turn a
product photo into a styled shot. Can we bundle those into one library and
auto-generate 10–12 styles per audience (Female / Male / Kids / Teenager), then
auto-show only the relevant ones on the AI Studio Shoot picker based on the
product's category? First cut: 12 female styles.

---

## 1. How the ChatGPT "/command" thing actually works

There is **no real slash-command system** in ChatGPT Images. `/catwalk` is just a
label the user invented; ChatGPT reads it as "put this garment on a runway" and
runs an ordinary natural-language image edit. The whole "command library" is just
a lookup table:

```
/catwalk  →  "Model walking toward camera on a fashion runway, spotlights, …"
/garden   →  "Model in a botanical garden, golden-hour light, …"
```

One command = one canned prompt string. Nothing else.

## 2. Kanchuki already implements exactly this pattern

We shipped it as **F-032 Phase A — AI Studio Shoots** (2026-08-13). The command
library is `STUDIO_TEMPLATES` in `packages/shared/src/constants/index.ts`:

```ts
{
  id: 'runway',
  command: '/runway',                 // ← the "slash command"
  label: 'Catwalk Runway',
  description: 'High-fashion catwalk runway setting with dramatic spotlights',
  preview_image_url: '…',
  prompt: 'Place this outfit in a high-fashion catwalk runway show with …',
}
```

Flow (already live, no gaps):

| Step | Where |
|------|-------|
| Retailer opens a product photo → **AI Studio Shoot** | `apps/mobile/app/product/[id].tsx` → `ProductStudioModal.tsx` |
| Picks a **Scene** (template) or **Fashion Model** | modal maps `STUDIO_TEMPLATES` / `STUDIO_MODELS` |
| `POST /products/:id/photos/:photoId/studio-shoot { template }` → `202 { job_id }` | `apps/api/src/routes/products/products-studio.ts` |
| BullMQ job assembles `template.prompt` + product colour/fabric facts + a colour-fidelity tail, sends to Fal Flux Pro → Imagen 3 → Flux Schnell → BFL FLUX Kontext | `apps/api/src/jobs/studio-shoot.ts` + `apps/api/src/lib/studio-shoot.ts` (`generateStudioImage`) |
| Result downloaded, compressed ≤80 KB, stored as a **new** `ProductPhoto` (never overwrites the source), promotable to primary | same job |
| Mobile polls `…/studio-shoot/status?job_id=`; modal shows progress → result | `apps/mobile/src/hooks/useProductAiStudio.ts` |
| Quota: `STUDIO_SHOOT` `QuotaResourceType` (F-010), admin cap at `/admin/plan-limits`, 8 credits/image (`STUDIO_CREDITS_PER_IMAGE`) | `apps/api/src/lib/quota.ts` |

So **"collab the commands into one prompt" is already done** — every style *is*
one assembled prompt. The engine even accepts a raw `/whatever` passthrough and an
admin free-text `customPrompt`.

**Current inventory:** 11 scene templates + 4 fashion models. All 4 models are
adult (3 female, 1 male). No Kids, no Teen. Templates carry **no audience tag**, so
the picker shows all 11 for every product.

## 3. We already have the raw material for the bigger library

`docs/tasks/AI Models and Scenes.html` is a **built but never-wired-in** catalog:
**24 scenes + 18 models**, each with a full `prompt`, plus `gender`, `ageGroup`,
`garmentFit`, and — critically — **`categoryTag`**: one of
`scene | female | male | kids | teen | mature`.

That `categoryTag` is precisely the auto-population key the owner is asking for.
The models cover every audience:

- `kids`: Aarohi (girl 4–6), Aarav (boy 5–7), Diya (pre-teen girl), Vivaan (pre-teen boy)
- `teen`: Rhea (16–18), Rohan (17–19)
- `female`: Priya (bridal), Ananya (saree/kurti), Meera (festive), Tara (curvy/plus)
- `male`: Kabir (groom), Aditya (modern ethnic)
- `mature`: Nandini 35+, Vikram 35+, Sunita 45+, Harish 45+

The scenes are all `gender: "All Genders"` — a runway / garden / palace works for
any audience — but each has a `garmentFit` list ("Lehengas, Anarkalis, Kurta Sets…")
we can soft-match against the product's `category` / `subtype`.

## 4. Data model reality

`Product` (`packages/db/prisma/schema.prisma:530`) has:

- `segment  ProductSegment @default(LADIES)` — enum `LADIES | MEN | KIDS` (no TEEN)
- `category String?` — free-text AI tag ("Saree", "Kurti", "Sherwani")
- `subtype  String?` — finer ("Lehenga Skirt", "Kurta Set")

**Teenager is not a product segment — it's a model age group.** A teen lehenga is
still `segment = LADIES`. So audience routing is:

- **Models** → filter by `segment` (LADIES→female+mature, MEN→male+mature, KIDS→kids+teen). Teen/kid split can be a later refinement (age isn't captured on the product today).
- **Scenes** → keep all visible, but **sort** so the ones whose `garmentFit` keywords hit the product's `category`/`subtype` float to the top.

## 5. Proposed build — data-only, no new infra

### 5.1 What NOT to build (YAGNI)

- ❌ A "combine many commands into one meta-prompt" system — one style is already one prompt.
- ❌ A new DB table / migration / admin CRUD for templates — they're shared consts; the admin backdrop-library DB pattern is the upgrade path **if** owner later wants edit-without-deploy. Defer.
- ❌ A `TEEN` enum value — not needed for v1; age isn't on the product.
- ❌ New endpoints — `POST …/studio-shoot` already takes any `template` id.

### 5.2 What to build

**(a) Expand `STUDIO_TEMPLATES`** with an optional audience/garment tag:

```ts
export const STUDIO_TEMPLATES = [
  {
    id: 'garden_luxury',
    command: '/garden',
    label: 'Royal Botanical Garden',
    description: 'Lush Mughal garden, marble fountains, golden-hour bokeh',
    audience: ['female', 'male', 'kids', 'teen'],   // omit = universal
    garmentMatch: ['lehenga', 'anarkali', 'kurta set', 'floral', 'summer'],
    preview_image_url: '…',
    prompt: 'Place this outfit on a model standing in a luxury Indian botanical garden …',
  },
  // …
] as const satisfies readonly {
  id: string; command?: string; label: string; description: string;
  audience?: readonly ('female'|'male'|'kids'|'teen'|'mature')[];
  garmentMatch?: readonly string[];
  preview_image_url?: string; prompt: string;
}[];
```

Backfill `audience`/`garmentMatch` onto the 11 existing rows too (most = universal).
Port the useful scenes + all Kids/Teen models from `AI Models and Scenes.html`.

**(b) One filter in `ProductStudioModal.tsx`.** It already imports the arrays and
maps them. Add a `productSegment` (+ optional `productCategory`) prop, passed from
`product/[id].tsx`:

```ts
const seg = SEGMENT_TO_TAGS[productSegment]           // LADIES → ['female','mature']
const models = STUDIO_MODELS.filter(m => !m.audience || seg.includes(m.audience))
const scenes = [...STUDIO_TEMPLATES]
  .filter(t => !t.audience || t.audience.some(a => seg.includes(a) || a === 'scene'))
  .sort(byGarmentMatch(productCategory, productSubtype))   // matches float up
```

Nothing else in the pipeline changes — the job already takes the chosen id.

**(c) (optional, 3 lines)** pass `product.segment` into `generateStudioImage` so
`resolveIndianModelDescription()` stops regex-guessing gender from the title.

### 5.3 Files touched

| File | Change |
|------|--------|
| `packages/shared/src/constants/index.ts` | `STUDIO_TEMPLATES` grows to ~12/audience + `audience`/`garmentMatch` fields; add Kids/Teen entries to `STUDIO_MODELS`; export a `SEGMENT_TO_STUDIO_TAGS` map |
| `apps/mobile/src/components/product-detail/ProductStudioModal.tsx` | filter + sort the two lists by new `productSegment`/`productCategory` props |
| `apps/mobile/app/product/[id].tsx` | pass `product.segment` / `product.category` to the modal |
| `apps/api/src/lib/studio-shoot.ts` | *(optional)* accept `product.segment`, use it in `resolveIndianModelDescription` |
| `apps/api/src/routes/products-studio.test.ts` | assert an audience-tagged template still enqueues |
| assets | drop preview thumbnails under `apps/mobile/assets/studio-templates/<id>.png` (falls back to `preview_image_url`, so not blocking) |

No migration. No API contract change. Ship behind nothing — all plans already get
Studio Shoot (STARTER block was removed 2026-08-28).

## 6. The 12 female styles (v1) — ready to paste into `STUDIO_TEMPLATES`

The engine **auto-appends** the product's colour/fabric facts + a 5500K
colour-fidelity clause (`generateStudioImage` → `colorEnforcement`). Keep each
`prompt` **scene-focused**; one short "preserve colour/embroidery" reminder is
fine (matches the existing rows). All get `audience: ['female']` (+ `'teen'`/`'mature'`
where noted). `garmentMatch` shown as a hint list.

| # | id / command | label | garmentMatch | prompt (scene body) |
|---|---|---|---|---|
| 1 | `studio_editorial` / `/studio` | Vogue Studio Editorial | *(all)* | Place this garment on a graceful Indian female model in a clean high-fashion editorial studio, seamless mid-grey cyclorama, softbox key + hair light, confident straight-on pose. Preserve the garment shape, drape, exact colour and embroidery. |
| 2 | `catwalk_runway` / `/catwalk` | Catwalk Runway | couture, gown, lehenga, indo-western | Place this outfit on an Indian female model walking toward camera down a high-fashion runway, overhead spotlights, glossy black floor, soft blurred audience bokeh. Natural walk, one foot forward. Garment drape, colour, zari and texture 100% preserved. |
| 3 | `botanical_garden` / `/garden` | Royal Botanical Garden | lehenga, anarkali, kurta set, floral, cotton | Place this outfit on an Indian female model in a lush Mughal-style botanical garden — manicured hedges, marble fountain, blooming beds, soft golden-hour light and greenery bokeh behind. Neutral daylight on the garment, true colour and embroidery kept. |
| 4 | `festive_diwali` / `/festival` | Festive Diya Celebration | silk, festive saree, kurta set, anarkali, brocade | Place this outfit on an Indian female model in a warm festive setting — rows of glowing diyas, marigold garlands and rangoli strictly in the soft background bokeh. Neutral 5500K key light on the garment so fabric colour, pattern and zari stay exact. |
| 5 | `heritage_street` / `/street` | Jaipur Heritage Street | kurti, short kurta, saree drape, daily ethnic, fusion | Place this garment on an Indian female model on a Jaipur old-city street — terracotta-pink carved walls, antique wooden doors, brass lanterns, soft morning light. Candid mid-stride pose. Exact dyes, weave and embroidery faithful to the original. |
| 6 | `palace_courtyard` / `/palace` | Royal Palace Courtyard | bridal lehenga, heavy silk saree, sharara, gown | Place this outfit on an Indian female model in a Rajasthan palace courtyard — carved sandstone arches, jharokha windows, warm ambient evening light in the background bokeh. Garment lit with neutral key light, colour / zari / embroidery 100% preserved. |
| 7 | `rooftop_golden` / `/rooftop` | Golden-Hour City Rooftop | indo-western, co-ord, cocktail gown, party kurta, fusion | Place this outfit on an Indian female model on a chic city rooftop at golden hour — string lights, blurred skyline, warm sun flare behind. Relaxed editorial pose. Garment colour and detail kept true with neutral light on the fabric. |
| 8 | `heritage_library` / `/indoor` | Grand Heritage Library | chikankari, formal suit, office ethnic, blazer, straight kurta | Place this garment on an Indian female model inside a grand wood-panelled heritage library — tall bookshelves, brass reading lamps, warm soft interior light behind, subject lit neutrally. Poised standing pose. Colour, texture and embroidery preserved exactly. |
| 9 | `heritage_steps_sit` / `/sitting` | Seated Haveli Steps | lehenga, anarkali, saree, sharara, heavy ethnic | Place this outfit on an Indian female model seated gracefully on carved stone haveli steps, dupatta arranged across the lap, potted palms and a lantern softly out of focus behind. Full garment visible. Neutral daylight, true colour and zari kept. |
| 10 | `dupatta_motion` / `/running` | Dupatta in Motion | dupatta set, anarkali, sharara, lehenga, gown | Place this outfit on an Indian female model captured mid-motion — turning away with the dupatta and skirt caught in the air, slight wind, soft neutral backdrop with gentle motion blur only in the background. Garment sharp; colour, drape and embroidery 100% preserved. |
| 11 | `low_key_dark` / `/dark` | Dark Dramatic Low-Key | brocade, velvet, heavy embroidery, gown, silk saree | Place this garment on an Indian female model against a near-black seamless backdrop, single dramatic side key light with soft falloff, subtle rim light on the shoulder. Fabric texture and embroidery catch the light; exact garment colour held true, no colour shift. |
| 12 | `gradient_hero` / `/hero` | Coloured Gradient Hero | *(all)* — campaign / sale banners | Place this garment on an Indian female model against a smooth studio colour-gradient backdrop (deep plum to warm rose), even beauty lighting, centred campaign hero framing with head-to-hem clearance for text. Garment colour, pattern and embroidery exactly preserved. |

`#1 #2 #3 #4 #11 #12` are also good for `'teen'` and `'mature'` — add those tags.
Reuse `#2` in place of the current `runway` row (same intent, better prompt).

### After v1

Repeat the table for **Male** (sherwani/kurta/bandhgala scenes: palace, library,
mustard field, rooftop, desert, snowfall, studio, runway, low-key, gradient,
seated, street) and **Kids / Teen** (garden, festive, studio, palace, rooftop,
white marketplace + the age-appropriate models). All scene bodies already exist
in `AI Models and Scenes.html` — port + tag.

## 7. Effort

- Templates + models data + tag map: ~1 file, mechanical (port from the HTML catalog).
- Modal filter/sort: ~20 lines.
- Wiring prop through `[id].tsx`: ~2 lines.
- Optional API gender hint: ~3 lines.
- Preview thumbnails: nice-to-have, non-blocking (remote `preview_image_url` fallback).

No migration, no new endpoint, no plan-gate work.
