// F-032 AI Studio Shoot — owner-written style prompts (option matrix §14).
//
// One source for the admin bench (apps/web) and the retailer path (apps/api):
// the API cannot import from apps/web, and two copies of 27 prompts drift.
// A prompt may hold `{{Pool}}` tokens; `resolveStyleTokens()` replaces each with
// ONE pick from `pools[Pool]` — once per generation, on the server (§14.3).

/**
 * Owner-written style prompts (option matrix §14). Each carries its own
 * lighting; lighting is not a separate retailer choice. A prompt may hold
 * `{{Pool}}` tokens — `resolveStylePrompt()` replaces each with ONE random pick
 * from `pools[Pool]` (the server does the same, one pick per generation, §14.3).
 */
export interface StyleDef {
  readonly id: string;
  readonly label: string;
  readonly light: string;
  readonly prompt: string;
  readonly pools?: Readonly<Record<string, readonly string[]>>;
}

/** The picks made for one generation, e.g. `{ Scene: 'Courtyard', Pose: 'Gentle Walking' }`. */
export type StylePicks = Record<string, string>;

/**
 * Replace every `{{Pool}}` with one pick from `pools[Pool]`. `rng` is injectable
 * so the server can seed a retry and tests stay deterministic. A token with no
 * pool resolves to '' (never left raw in a prompt sent to an image model).
 */
export function resolveStyleTokens(
  prompt: string,
  pools?: Readonly<Record<string, readonly string[]>>,
  rng: () => number = Math.random,
): { prompt: string; picks: StylePicks } {
  const picks: StylePicks = {};
  const out = prompt.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    const pool = pools?.[k];
    if (!pool?.length) return '';
    const pick = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))] ?? '';
    picks[k] = pick;
    return pick;
  });
  return { prompt: out, picks };
}

export function resolveStylePrompt(
  s: Pick<StyleDef, 'prompt' | 'pools'> | undefined,
  rng: () => number = Math.random,
): string {
  return s ? resolveStyleTokens(s.prompt, s.pools, rng).prompt : '';
}

/**
 * Pools for a `studio_styles.slug`. Seeded rows use the lower-cased style id as
 * slug (`PS-16` → `ps-16`), so the DB row carries the prompt text and this
 * lookup supplies the pools the row has no column for.
 */
export function poolsForSlug(slug: string): StyleDef['pools'] {
  const id = slug.toUpperCase();
  const all: readonly StyleDef[] = [...PRODUCT_STYLES, ...MODEL_STYLES];
  return all.find((s) => s.id === id)?.pools;
}

const PROTECT = `STRICT GARMENT PROTECTION: Preserve the uploaded garment exactly as shown, including its original color, fabric, print, embroidery, motifs, neckline, sleeves, borders, length, texture, stitching, proportions, construction, dupatta and every visible design detail. Do not redesign, recolor, simplify, stretch, shorten, reshape, distort, replace, add, remove, duplicate or invent any garment detail.`;

/** Shared Model Only wrapper (§14.3 MX-0). */
const MX0 = `Create ONE premium commercial fashion photograph featuring one model wearing the uploaded garment. The uploaded garment is the single source of truth and must remain the primary visual focus. Keep the garment completely visible and unobstructed. Realistic anatomy, natural posture, realistic skin and hair, minimal elegant styling. Walking poses are toward the camera, never away.

STRICT GARMENT PROTECTION: Preserve the uploaded garment exactly — original color, fabric, texture, print, embroidery, motifs, neckline, sleeves, borders, trims, buttons, stitching, embellishments, proportions, length, silhouette, construction, dupatta/scarf, bottom piece and every visible detail. No redesign, recoloring, simplification, stretching, shortening, distortion, replacement, removal, duplication or invented details. Fit the exact garment naturally to the model without changing its construction. Show the garment from the front only; never show or invent the back.

FINAL: One model • One complete outfit • One environment • One natural fashion pose • No collage • No duplicate model • No additional featured clothing • No labels • No logos • No watermark • No readable text.

PRIORITY: Exact Garment → Natural Fit → Garment Visibility → Lighting → Model Presentation → Environment.`;

/** Shared outdoor block (§14.4 MO-0). */
const MO0 = `POSE: one natural, elegant fashion pose appropriate for the selected environment (standing, relaxed or gentle walking; walking is toward the camera).

SCENE ACCURACY: the selected environment must be immediately recognizable as its category. Never substitute a generic outdoor scene, garden, indoor room, studio, showroom or unrelated location.

LIGHTING: use only the lighting specified for the scene — Daylight or Natural Light. Realistic outdoor illumination, accurate colors, soft natural shadows and detailed fabric rendering. No studio softbox, flash, sunset, golden hour, evening or night lighting.

COMPOSITION: one full-body or three-quarter fashion photograph. The complete garment stays clearly visible and unobstructed. Show enough of the environment to establish the location while keeping the garment the visual hero.`;

const outdoor = (scene: string, light: string) =>
  `${MX0}\n\n${MO0}\n\nSCENE: ${scene}\nSCENE LIGHTING: ${light}.`;

const POSE_CORE = ['Natural Standing', 'Relaxed Standing', 'Slightly Angled Standing', 'Gentle Walking', 'Looking Slightly Away'] as const;

/**
 * Product Only base styles (option matrix §14.2, PS-03…16) — sent verbatim on
 * the PRODUCT tab. PS-01/02 are retired (no owner prompt).
 */
export const PRODUCT_STYLES = [
  {
    id: 'PS-03',
    label: 'Luxury Studio Product',
    light: 'Softbox',
    prompt: `Replace the existing product presentation completely while preserving the uploaded garment itself exactly.

Remove the original hanger, person, model, mannequin, or existing display method. Re-present the garment as a premium product display on a true headless torso dress form positioned on an elegant pedestal. The dress form has no head, face, ears, hair, skin, facial features, or human head shape; only the torso, shoulders and short neck/collar area are visible. This is a product display, not clothing worn by a person.

Place the garment inside a sophisticated luxury fashion studio featuring a warm gold architectural arch in the background and an elegant premium pedestal beneath the garment. Use refined warm softbox lighting with controlled highlights, realistic fabric shadows, dimensional depth and premium commercial composition. Show the complete garment in a centered, full-length, front-facing view with realistic fabric drape, accurate proportions, crisp textile detail and photorealistic high-end fashion-commerce quality.

${PROTECT}

Change only the product presentation, environment, composition, pedestal and lighting.`,
  },
  {
    id: 'PS-04',
    label: 'Editorial Studio Product',
    light: 'Natural Light',
    prompt: `Replace the existing product presentation completely while preserving the uploaded garment itself exactly.

Remove the original hanger, person, model, mannequin, or existing display method. Re-present the garment as a premium product display on a true headless torso dress form. The dress form has no head, face, ears, hair, skin, facial features, or human head shape; only the torso, shoulders and short neck/collar area are visible. This is a product display, not clothing worn by a person.

Place the garment in a sophisticated grey editorial studio with a textured grey wall, clean light floor, minimal architectural styling and elegant white decorative vases on simple pedestals. Use natural side window light creating distinct soft diagonal window shadows across the wall and floor, warm daylight highlights and gentle natural contrast. Show the complete garment in a centered, full-length, front-facing composition with realistic fabric drape, accurate proportions, detailed textile texture, refined editorial styling and premium photorealistic commercial quality.

${PROTECT}

Change only the product presentation, environment, composition and lighting.`,
  },
  {
    id: 'PS-05',
    label: 'Color Background',
    light: 'Softbox',
    prompt: `Replace the existing product presentation completely while preserving the uploaded garment itself exactly.

Present the complete garment as a premium product display against a clean, seamless flat-color backdrop. Use a sophisticated solid blue studio background with no gradients, patterns, textures, architectural elements, furniture, props, people, models, or mannequins. Center the complete garment in a full-length front-facing composition with generous clean space around it.

Use professional softbox lighting with even illumination, controlled highlights, realistic fabric shadows, accurate color reproduction, crisp textile detail and a polished commercial fashion-catalog appearance.

${PROTECT}

Change only the presentation, background, composition and lighting.`,
  },
  {
    id: 'PS-06',
    label: 'Premium Product Shot',
    light: 'Natural Light',
    prompt: `Replace the existing product presentation completely while preserving the uploaded garment itself exactly.

Present the complete garment as a premium full-length fashion product display against a warm sophisticated luxury backdrop. Use an elegant warm beige and cream environment with subtle architectural depth, refined decorative styling and soft premium visual character. Keep the entire garment fully visible from top to bottom in a centered front-facing composition. This is a complete product shot, not a close-up or detail photograph.

Use natural daylight with soft directional illumination, gentle highlights, realistic fabric shadows, dimensional depth, accurate textile texture and refined high-end fashion-commerce photography.

${PROTECT}

Change only the product presentation, environment, composition and lighting.`,
  },
  {
    id: 'PS-07',
    label: 'Flat Lay',
    light: 'Daylight',
    prompt: `Replace the existing product presentation completely while preserving the uploaded garment itself exactly.

Arrange the complete garment as a premium flat-lay composition on a clean elegant surface, viewed directly from above. Lay the garment naturally and fully visible, maintaining its original construction, proportions and recognizable arrangement. Surround it with tasteful fresh flowers and carefully arranged fashion jewellery as supporting props, creating a refined boutique flat-lay aesthetic without covering or obscuring the garment.

Use bright natural daylight with soft directional shadows, realistic fabric texture, crisp embroidery and print detail, balanced composition and premium editorial product photography.

STRICT GARMENT PROTECTION: Preserve the uploaded garment exactly as shown, including its original color, fabric, print, embroidery, motifs, neckline, sleeves, borders, length, texture, stitching, proportions, construction, dupatta and every visible design detail. Do not redesign, recolor, simplify, stretch, shorten, reshape, distort, replace, add or remove any garment detail. Props must never cover or alter the product.

Change only the product arrangement, surface, props, composition and lighting.`,
  },
  {
    id: 'PS-08',
    label: 'Folded Boutique Fold',
    light: 'Natural Light',
    prompt: `Replace the existing product presentation completely while preserving the uploaded garment itself exactly.

Present the garment as a single elegant boutique fold placed neatly on a natural rattan tray. Use one clearly defined folded presentation only, with the garment arranged carefully so its important fabric, print, embroidery and border details remain visible. Create a refined boutique merchandising composition with a warm neutral surface and subtle natural styling.

Use soft natural daylight with gentle directional shadows, realistic textile texture, accurate colors, crisp embroidery detail and premium boutique product photography.

STRICT GARMENT PROTECTION: Preserve the uploaded garment exactly as shown, including its original color, fabric, print, embroidery, motifs, neckline, sleeves, borders, length, texture, stitching, proportions and construction. Do not redesign, recolor, simplify, stretch, shorten, reshape, distort, replace, add, remove, duplicate or invent any garment detail.

Use exactly one folded garment presentation on the rattan tray. Do not create multiple folds or stacks. Change only the presentation, surface, composition and lighting.`,
  },
  {
    id: 'PS-09',
    label: 'Hanger Boutique',
    light: 'Natural Light',
    prompt: `Replace the existing product presentation completely while preserving the uploaded garment itself exactly.

Display the complete garment naturally on a premium wooden hanger within an elegant boutique setting. Use a refined boutique rail or sophisticated wall-mounted clothing rail as the presentation structure, with the garment centered and fully visible from top to bottom. Keep the environment warm, clean and professionally styled without people or models.

Use soft natural daylight entering the boutique space, creating gentle directional shadows, realistic fabric drape, accurate garment proportions, crisp textile detail and premium fashion-retail photography.

STRICT GARMENT PROTECTION: Preserve the uploaded garment exactly as shown, including its original color, fabric, print, embroidery, motifs, neckline, sleeves, borders, length, texture, stitching, proportions, construction and every visible design detail. Do not redesign, recolor, simplify, stretch, shorten, reshape, distort, replace, add, remove, duplicate or invent any garment detail.

Change only the hanger presentation, boutique environment, composition and lighting.`,
  },
  {
    id: 'PS-10',
    label: 'Boutique Fold',
    light: 'Natural Light',
    prompt: `Replace the existing product presentation completely while preserving the uploaded garment itself exactly.

Present the garment as a premium boutique two-stack folded display arranged neatly on a sophisticated wooden table. Create exactly two coordinated folded layers/stacks of the same garment presentation, arranged naturally for luxury retail merchandising. Keep important embroidery, print, borders and fabric details visible and unobstructed.

Use soft natural daylight with warm directional illumination, realistic fabric shadows, detailed textile texture and refined boutique-commerce photography. Create an elegant, warm and premium retail atmosphere.

STRICT GARMENT PROTECTION: Preserve the uploaded garment exactly as shown, including its original color, fabric, print, embroidery, motifs, neckline, sleeves, borders, length, texture, stitching, proportions and construction. Do not redesign, recolor, simplify, stretch, shorten, reshape, distort, replace, add, remove or invent any garment detail.

Use exactly a two-stack folded presentation on the wooden table. Do not create a single fold, flat lay or additional stacks. Change only the presentation, table, composition and lighting.`,
  },
  {
    id: 'PS-11',
    label: 'Table Display',
    light: 'Natural Light',
    prompt: `Replace the existing product presentation completely while preserving the uploaded garment itself exactly.

Present the garment naturally laid and elegantly draped across a premium wooden table. Allow part of the garment to flow naturally over the table edge while keeping the main product clearly visible and recognizable. Create a refined boutique merchandising scene with subtle luxury decor and an uncluttered composition.

Use soft natural daylight with realistic directional shadows, natural fabric folds, accurate textile texture, crisp embroidery and print detail, balanced composition and premium commercial product photography.

STRICT GARMENT PROTECTION: Preserve the uploaded garment exactly as shown, including its original color, fabric, print, embroidery, motifs, neckline, sleeves, borders, length, texture, stitching, proportions, construction and every visible design detail. Do not redesign, recolor, simplify, stretch, shorten, reshape, distort, replace, add, remove, duplicate or invent any garment detail.

Change only the product arrangement, table environment, composition and lighting.`,
  },
  {
    id: 'PS-12',
    label: 'Pedestal Display',
    light: 'Softbox',
    prompt: `Replace the existing product presentation completely while preserving the uploaded garment itself exactly.

Present the complete garment as a premium product display on an elegant round pedestal inside a sophisticated architectural studio. Place the garment centrally beneath a large refined arch structure in the background, creating a clean luxury fashion presentation. Keep the complete garment fully visible from top to bottom in a centered front-facing composition.

Use professional softbox lighting with controlled highlights, realistic fabric shadows, dimensional depth, crisp textile detail and polished high-end commercial fashion photography. Maintain a refined warm neutral luxury palette.

${PROTECT}

Change only the product presentation, pedestal, architectural environment, composition and lighting.`,
  },
  {
    id: 'PS-13',
    label: 'Product Commercial Shot',
    light: 'High Key',
    prompt: `Replace the existing product presentation completely while preserving the uploaded garment itself exactly.

Create a clean professional commercial product photograph of the complete garment against a seamless pure white background. Present the entire garment fully visible from top to bottom in a centered front-facing composition with clean edges and generous white space. Keep the scene completely free from decorative props, furniture, people, models and distracting elements.

Use high-key commercial lighting with bright even exposure and a controlled distinct hard grounding shadow beneath and behind the product. Maintain crisp garment edges, accurate color reproduction, sharp textile detail and clean marketplace-ready product photography.

${PROTECT}

Change only the product presentation, white background, composition and lighting.`,
  },
  {
    id: 'PS-14',
    label: 'Creative Display Product Composition',
    light: 'Softbox',
    prompt: `Replace the existing product presentation completely while preserving the uploaded garment itself exactly.

Create a premium creative product composition featuring the complete garment as the central subject. Display the garment within an elegant decorative frame structure surrounded by tasteful fresh florals and carefully selected luxury props. Arrange the elements as a sophisticated fashion campaign composition while keeping the garment clearly visible, dominant and unobstructed.

Use professional softbox lighting with refined controlled highlights, realistic shadows, dimensional depth and crisp textile detail. Create a polished editorial-commercial aesthetic with balanced composition and premium visual hierarchy.

${PROTECT}

Props and decorative elements must support the composition without covering, modifying or replacing any part of the garment. Change only the presentation, props, environment, composition and lighting.`,
  },
  {
    id: 'PS-15',
    label: 'Social Media Commerce',
    light: 'High Key',
    prompt: `Replace the existing product presentation completely while preserving the uploaded garment itself exactly.

Create a premium social-commerce product photograph with the complete garment as the central subject. Use a bright, clean high-key studio environment with a polished modern commercial background and a visually engaging but uncluttered composition optimized for social-media product presentation. Keep the entire garment fully visible from top to bottom, centered and immediately recognizable.

Use bright high-key lighting with clean exposure, crisp garment edges, realistic textile texture, subtle controlled shadows and strong product clarity. Create a polished, modern, scroll-stopping commercial image without adding any written content.

${PROTECT}

Do not generate text, words, letters, logos, captions, slogans, prices, promotional messages, watermarks or typography anywhere in the image. Change only the product presentation, environment, composition and lighting.`,
  },
  {
    id: 'PS-16',
    label: 'Editorial Product Display',
    light: 'Natural Light',
    prompt: `Replace the existing product presentation completely while preserving the uploaded garment itself exactly.

Create ONE premium editorial product photograph featuring the uploaded garment as the hero product, in this environment: {{Environment}}, using this presentation: {{Presentation}}. This is a product-focused image, not a model portrait: no person, no model and no mannequin. Arrange the garment and these accessories into a sophisticated, commercially usable bundled fashion presentation: {{Styling}}. Accessories complement the garment without covering, altering or competing with it.

Use beautiful natural light from a large window or open architectural source, with soft directional illumination, gentle realistic shadows, subtle highlights, accurate colors and authentic fabric texture. Create a refined editorial atmosphere with natural depth and premium photographic composition.

${PROTECT}

BUNDLED LOOK RULE: accessories are separate styling props only. They must never become part of the garment, change its design, hide embroidery or details, or read as additional clothing. One garment, one presentation, one styling arrangement. No text, labels, logos or watermark. Change only the presentation, environment, styling props, composition and lighting.`,
    pools: {
      Environment: ['Luxury Bedroom', 'Premium Living Room', 'Elegant Dressing Room', 'Boutique Corner', 'Heritage Interior', 'Modern Apartment', 'Designer Studio', 'Refined Courtyard', 'Minimal Editorial Interior'],
      Presentation: ['Styled Flat Lay', 'Elegant Hanger Display', 'Premium Garment Rack', 'Draped Product Display', 'Neatly Folded Product', 'Editorial Chair Display', 'Boutique Table Display'],
      Styling: ['Handbag + Shoes', 'Handbag + Jewellery', 'Shoes + Sunglasses', 'Jewellery + Perfume Bottle', 'Handbag + Jewellery + Shoes', 'Traditional Accessories + Handbag', 'Minimal Fashion Accessories'],
    },
  },
] as const satisfies readonly StyleDef[];
export type ProductStyleId = (typeof PRODUCT_STYLES)[number]['id'];

/**
 * Model Only base styles (option matrix §14.3 indoor MI-##, §14.4 outdoor MO-##).
 * Prompt = MX-0 wrapper + scene block (+ MO-0 outdoors); the person clause is
 * added by the pipeline. MI-03/06/07/09/11 are retired (no owner prompt).
 */
export const MODEL_STYLES = [
  {
    id: 'MI-01',
    label: 'Product Composition',
    light: 'Softbox',
    prompt: `${MX0}

ENVIRONMENT: {{Scene}}.
POSE: {{Pose}}.

Place the model in the selected sophisticated indoor fashion environment with tasteful coordinated props such as a small handbag, appropriate footwear, flowers, a mirror, a premium chair, a side table or subtle boutique décor. Props complement the outfit and never cover important garment details.

Use professional softbox lighting: bright clean exposure, gentle fill, soft natural shadows, accurate colors and crisp embroidery/print detail.`,
    pools: {
      Scene: ['Premium Luxury Studio', 'Editorial Fashion Studio', 'Modern Boutique Interior', 'Designer Dressing Room', 'Heritage Interior', 'Luxury Fashion Gallery', 'Minimalist Studio'],
      Pose: [...POSE_CORE, 'Simple Boutique Pose'],
    },
  },
  {
    id: 'MI-02',
    label: 'Courtyard',
    light: 'Daylight',
    prompt: `${MX0}

POSE: {{Pose}}.

Courtyard only. Place the model naturally in a refined courtyard during daytime, with elegant architectural details such as arches, carved stone, columns, warm neutral walls, greenery, flowers, subtle traditional décor or premium outdoor furniture. Keep the courtyard attractive but secondary to the garment.

Use natural daylight with soft directional sunlight, gentle ambient fill, realistic soft shadows and clean exposure. Preserve accurate garment colors and crisp fabric, embroidery and print detail, with realistic depth and a natural outdoor atmosphere.`,
    pools: { Pose: [...POSE_CORE, 'Standing Near an Architectural Feature'] },
  },
  {
    id: 'MI-04',
    label: 'Boutique',
    light: 'Softbox',
    prompt: `${MX0}

ENVIRONMENT: {{Scene}}.
POSE: {{Pose}}.

Place the model naturally inside the selected boutique with tasteful boutique elements such as curated clothing racks, elegant shelving, display tables, mirrors, subtle Indian décor, premium hangers, folded garments, handbags or minimal accessories. Props stay secondary and never hide or compete with the garment.

Use professional softbox lighting: large diffused key light, gentle fill, controlled highlights, accurate exposure, realistic soft grounding shadows and crisp textile detail. Maintain natural skin tones and accurate garment colors.`,
    pools: {
      Scene: ['Luxury Indian Boutique', 'Modern Designer Boutique', 'Premium Ethnic Wear Boutique', 'Elegant Fashion Showroom', 'Minimalist Designer Store', 'High-End Bridal Boutique', 'Contemporary Indian Fashion Store'],
      Pose: [...POSE_CORE, 'Browsing a Garment Rack', 'Standing Near Display Shelves', 'Elegant Boutique Pose'],
    },
  },
  {
    id: 'MI-05',
    label: 'Shopping Mall',
    light: 'High Key',
    prompt: `${MX0}

ENVIRONMENT: {{Scene}}.
POSE: {{Pose}}.

Place the model naturally inside the selected shopping-mall environment, using elegant storefronts, glass displays, polished flooring, escalators, architectural details and tasteful retail displays as background elements. Keep the environment sophisticated but secondary to the garment.

Use high-key commercial lighting with bright, clean, evenly diffused illumination, soft controlled shadows, accurate exposure, crisp textile detail and realistic depth. The garment must remain clearly visible from the chosen camera angle.

BLANK SIGNAGE ONLY: any visible storefront signs, banners, digital screens, posters or promotional panels must be completely blank, clean surfaces. No readable text, letters, numbers, brand names, logos, symbols or advertisements anywhere in the scene.`,
    pools: {
      Scene: ['Luxury Fashion Mall', 'Premium Shopping Atrium', 'Modern Indian Shopping Mall', 'Designer Retail Floor', 'Elegant Mall Corridor', 'High-End Fashion Wing', 'Contemporary Shopping Gallery'],
      Pose: [...POSE_CORE, 'Walking Through Mall', 'Standing Near Storefront', 'Browsing a Display'],
    },
  },
  {
    id: 'MI-08',
    label: 'Social Commerce',
    light: 'High Key',
    // Owner exception (§7): this style intentionally renders short AI headline text + detail panels.
    prompt: `Launch theme: {{Theme}}.

Create ONE premium social-media fashion launch post introducing the uploaded garment as a NEW PRODUCT / NEW DESIGN. It must look completely different from a traditional editorial product photo or e-commerce image.

FIXED COMPOSITION:
- LEFT 55–65%: one fashion model wearing the exact uploaded garment, full or three-quarter length, confident natural pose, complete outfit clearly visible.
- RIGHT 35–45%: 2–3 close-up detail panels from the SAME garment: (1) neckline / upper embroidery, (2) main embroidery / fabric texture, (3) bottom hem / border / sleeve finishing.

Detail panels must show real garment areas exactly as they appear in the reference — no invented details.

SOCIAL DESIGN: add tasteful premium fashion-brand typography and minimal graphic elements. Use only short messaging from this list: NEW ARRIVAL, NEW DESIGN, PREMIUM EMBROIDERY, NEW SEASON, DESIGNER PICK. Spell every word exactly; no other text, no prices, no brand names. Clean modern typography, elegant spacing, subtle lines/shapes, strong visual hierarchy. Never cover the model's face or important garment details.

STYLING: a sophisticated high-key fashion background with tasteful jewellery, earrings, bangles, handbag, perfume, shoes, flowers or other premium accessories. Props remain secondary to the garment.

LIGHTING: bright high-key commercial lighting, soft diffused illumination, clean highlights, realistic shadows, accurate colors and crisp textile/macro detail.

STRICT GARMENT PROTECTION: the uploaded garment is the ABSOLUTE SINGLE SOURCE OF TRUTH. Preserve exact color, fabric, texture, print, embroidery, motifs, neckline, sleeves, borders, trims, stitching, embellishments, proportions, length, silhouette, construction, dupatta/scarf, bottom piece and every visible detail. No redesign, recoloring, added embroidery, altered print, changed neckline/sleeves, invented details, removal, stretching, shortening or distortion.

IMPORTANT: this must look like a premium Instagram/Facebook fashion launch announcement, combining model + close-up product storytelling + graphic information + lifestyle styling. Not a simple catalogue photo, flat lay, mannequin shot or standard editorial image. Show the garment from the front only; never show or invent the back.

FINAL: Model left • 2–3 detail panels right • New-product launch aesthetic • High-key • Premium typography • Jewellery/lifestyle props • Exact garment preservation • No duplicate garments • No watermark.`,
    pools: { Theme: ['New Arrival', 'New Collection', 'Trending Design', 'Festive Edit', 'Designer Pick', 'New Season'] },
  },
  {
    id: 'MI-10',
    label: 'Grey Background Studio',
    light: 'Softbox',
    prompt: `${MX0}

POSE: {{Pose}}.

Plain seamless medium-light grey studio backdrop, clean and distraction-free, with a subtle tonal gradient and a smooth floor transition. No furniture, décor, artwork, shelves or unnecessary props. Show the complete outfit from head to toe whenever possible; no mannequin.

Use professional softbox lighting: large diffused key light, subtle fill, soft natural grounding shadow, controlled highlights, accurate exposure, realistic skin tones and crisp fabric/detail visibility.`,
    pools: { Pose: ['Natural Standing', 'Relaxed Standing', 'Slightly Angled Standing', 'Elegant Standing', 'Gentle Walking', 'Looking Slightly Away', 'Subtle Editorial Pose'] },
  },
  {
    id: 'MO-01',
    label: 'Modern Street',
    light: 'Daylight',
    prompt: outdoor('a stylish real urban street with sidewalks, buildings and street architecture.', 'Daylight'),
  },
  {
    id: 'MO-02',
    label: 'Cafe',
    light: 'Natural Light',
    prompt: outdoor('a clearly recognizable outdoor café with tables, chairs and café surroundings. Signage must be blank.', 'Natural Light'),
  },
  {
    id: 'MO-03',
    label: 'Terrace',
    light: 'Daylight',
    prompt: outdoor('an open terrace with visible railing, outdoor flooring and surrounding architecture.', 'Daylight'),
  },
  {
    id: 'MO-04',
    label: 'Balcony',
    light: 'Natural Light',
    prompt: outdoor('a clearly recognizable open balcony with visible railing and exterior surroundings. Never make it look like an indoor room.', 'Natural Light'),
  },
  {
    id: 'MO-05',
    label: 'Beach',
    light: 'Daylight',
    prompt: outdoor('a beach with visible sand, shoreline, ocean/water and open sky.', 'Daylight'),
  },
  {
    id: 'MO-06',
    label: 'Poolside',
    light: 'Daylight',
    prompt: outdoor('a poolside with a clearly visible swimming pool, water and pool deck.', 'Daylight'),
  },
  {
    id: 'MO-07',
    label: 'Tropical Resort',
    light: 'Natural Light',
    prompt: outdoor('a tropical resort with recognizable resort architecture, tropical plants, palms and landscaped surroundings.', 'Natural Light'),
  },
] as const satisfies readonly StyleDef[];
export type ModelStyleId = (typeof MODEL_STYLES)[number]['id'];
