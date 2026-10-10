// AI Studio effects catalog — the "combination" behind Studio Shoot presets.
// Ported from docs/ai-studio/AI Studio Effects.html. Each effect is a bundle of
// scene + pose/presentation + lighting + framing; prompts are COMPOSED from
// those short clauses, so the whole catalog is data, not 45 hand-written prompts.
// Admin bench only for now — not wired to studio_styles.
import type { Demographic } from '@kanchuki/shared';

export type Aud = Demographic;
export const AUD_LABEL: Record<Aud, string> = {
  womens: 'Women',
  mens: 'Men',
  teen_girl: 'Teen girl',
  teen_boy: 'Teen boy',
  kids_girl: 'Kid girl',
  kids_boy: 'Kid boy',
};
const AUD_DESC: Record<Aud, string> = {
  womens: 'an Indian woman in her early 30s',
  mens: 'an Indian man in his mid 30s',
  teen_girl: 'an Indian teenage girl (about 16)',
  teen_boy: 'an Indian teenage boy (about 18)',
  kids_girl: 'a 4-year-old Indian girl',
  kids_boy: 'a 4-year-old Indian boy',
};
const SENIOR_DESC: Partial<Record<Aud, string>> = {
  womens: 'an Indian woman in her 60s with silver-streaked hair',
  mens: 'an Indian man in his 70s with a trimmed white beard',
};

export const CLS = {
  top: 'Top / T-shirt / Shirt',
  kurti: 'Kurti',
  shorts: 'Shorts',
  pant: 'Pant',
  suit: 'Suit set',
  saree: 'Saree',
  lehenga: 'Lehenga',
  dress: 'Dress / Set',
  unstitched: 'Unstitched material',
} as const;
export type Cls = keyof typeof CLS;
/** Half-body garments (owner rule): only waist-up effects, never invented legs. */
export const HALF = new Set<Cls>(['top', 'kurti', 'shorts']);

// [title, env, group, clause]
export type Env = 'indoor' | 'outdoor';
export const SCENE = {
  white_studio: ['Pure White Studio', 'indoor', 'Studio', 'a seamless pure-white studio backdrop'],
  grey_studio: [
    'Grey Softbox Studio',
    'indoor',
    'Studio',
    'a seamless soft grey-beige studio backdrop',
  ],
  beige_studio: ['Warm Beige Studio', 'indoor', 'Studio', 'a seamless warm beige studio backdrop'],
  luxury_studio: [
    'Premium Luxury Studio',
    'indoor',
    'Studio',
    'a premium dark-toned luxury studio with polished floor and subtle gold accents',
  ],
  editorial: [
    'Vogue Editorial Studio',
    'indoor',
    'Studio',
    'a dark seamless editorial studio backdrop',
  ],
  marketplace: [
    'Marketplace White',
    'indoor',
    'Studio',
    'a clean e-commerce pure-white background with soft grounding shadow',
  ],
  indian_home: [
    'Indian Home',
    'indoor',
    'Indian',
    'a warm Indian home interior with a wooden console, cosy sofa and potted plant softly out of focus',
  ],
  festive_diya: [
    'Festive Diya Glow',
    'indoor',
    'Indian',
    'a festive Diwali interior with glowing brass diyas, marigold garlands and drifting golden bokeh, a few rose petals scattered',
  ],
  boutique: [
    'Boutique',
    'indoor',
    'Commercial',
    'a chic boutique with clothing racks softly out of focus',
  ],
  runway: [
    'Catwalk Runway',
    'indoor',
    'Commercial',
    'a high-fashion catwalk runway with overhead spotlights and a blurred audience',
  ],
  marble: [
    'Marble Hall',
    'indoor',
    'Luxury',
    'an elegant marble-clad luxury interior with subtle gold accents softly out of focus',
  ],
  rose_garden: [
    'Royal Garden',
    'outdoor',
    'Nature',
    'a lush Mughal garden with marble fountains and exotic florals',
  ],
  mountain: [
    'Himalayan Resort',
    'outdoor',
    'Nature',
    'a Himalayan mountain resort with pines and misty peaks',
  ],
  golden_field: [
    'Golden Hour Greenery',
    'outdoor',
    'Nature',
    'open soft-blurred greenery at golden hour',
  ],
  modern_wall: [
    'Contemporary Wall',
    'outdoor',
    'Urban',
    'a modern contemporary street wall with clean architectural lines',
  ],
  rooftop_cafe: [
    'Rooftop Cafe',
    'outdoor',
    'Urban',
    'a chic rooftop cafe with warm string lights and city bokeh',
  ],
  park: [
    'Sunny Park',
    'outdoor',
    'Urban',
    'a sunny neighbourhood park with soft green grass and a gentle playground blur',
  ],
  heritage_street: [
    'Jaipur Heritage Street',
    'outdoor',
    'Heritage',
    'a Jaipur heritage street wall of pink sandstone with carved jharokha windows',
  ],
  palace: [
    'Royal Palace Courtyard',
    'outdoor',
    'Heritage',
    'a royal palace courtyard with ornate arches and sandstone pillars',
  ],
  beach: ['Goa Sunset Beach', 'outdoor', 'Resort', 'a Goa beach at sunset with soft waves'],
  // Added for the model bench (BENCH_SCENES below). No preset uses these.
  courtyard: [
    'Courtyard',
    'indoor',
    'Indian',
    'a traditional Indian haveli courtyard with carved stone pillars, a tulsi planter and soft light from an open sky',
  ],
  royal_interior: [
    'Royal Interior',
    'indoor',
    'Indian',
    'an opulent royal Indian interior with ornate gilded arches, rich drapes and a crystal chandelier softly out of focus',
  ],
  showroom: [
    'Showroom',
    'indoor',
    'Commercial',
    'a bright modern clothing showroom with clean display plinths and softly blurred garment racks',
  ],
  designer_store: [
    'Designer Store',
    'indoor',
    'Commercial',
    'an upscale designer boutique with warm spotlit mannequins and minimal wooden shelving softly out of focus',
  ],
  fashion_gallery: [
    'Fashion Gallery',
    'indoor',
    'Commercial',
    'a minimalist fashion gallery with white walls, framed editorial prints and a polished concrete floor',
  ],
  hotel: [
    'Hotel',
    'indoor',
    'Luxury',
    'a five-star hotel lobby with a grand staircase, warm lamps and polished stone floors softly out of focus',
  ],
  penthouse: [
    'Penthouse',
    'indoor',
    'Luxury',
    'a high-rise penthouse living room with floor-to-ceiling windows, a designer sofa and a soft city skyline beyond',
  ],
  luxury_lounge: [
    'Luxury Lounge',
    'indoor',
    'Luxury',
    'a plush luxury lounge with velvet armchairs, brass accents and low ambient lighting',
  ],
  heritage_room: [
    'Heritage Room',
    'indoor',
    'Heritage',
    'a heritage Indian room with carved teak furniture, jharokha windows and muted antique textiles',
  ],
} as const satisfies Record<string, readonly [string, Env, string, string]>;
export type SceneId = keyof typeof SCENE;

export const POSE = {
  standing: ['Standing', 'in a confident relaxed standing pose'],
  sitting: ['Sitting', 'seated elegantly, torso turned slightly to camera'],
  walking: ['Walking', 'mid-stride walking toward the camera with a slight natural fabric sway'],
  turning: ['Turning', 'turning from three-quarter back to face the lens'],
  looking_back: ['Looking back', 'looking back over the shoulder'],
  twirl: ['Twirl', 'mid-twirl, the garment flaring open in a circle'],
  hold_dupatta: ['Holding dupatta', 'gently holding the dupatta with one hand'],
  dupatta_flow: ['Dupatta flow', 'the dupatta/pallu lifted by a light breeze, floating outward'],
  adjust_dupatta: ['Adjusting dupatta', 'adjusting the dupatta drape with both hands'],
  candid: ['Candid', 'in a natural unposed candid moment, mid-smile'],
  breeze: ['Breeze', 'hair and loose fabric drifting in a gentle breeze, otherwise still'],
  mirror: ['Mirror selfie', 'taking a casual full-length mirror selfie, phone in one hand'],
  playing: ['Playing', 'playing happily with natural childlike movement'],
} as const;
export type PoseId = keyof typeof POSE;

export const LIGHT = {
  natural: ['Natural light', 'soft natural daylight'],
  soft: ['Soft light', 'soft diffused light'],
  window: ['Window light', 'soft window light from one side'],
  golden: ['Golden hour', 'warm golden-hour light'],
  sunset: ['Sunset', 'a low warm sunset glow'],
  daylight: ['Daylight', 'bright even daylight'],
  studio: ['Studio light', 'clean studio strobe lighting'],
  softbox: ['Softbox', 'a large softbox key light at eye level with subtle fill'],
  dramatic: ['Dramatic', 'dramatic directional light with deep shadows'],
  cinematic: ['Cinematic', 'cinematic light with gentle warm-cool contrast'],
  rim: ['Rim light', 'rim light outlining the shoulders'],
  highkey: ['High key', 'bright high-key lighting with minimal shadows'],
  lowkey: ['Low key', 'moody low-key lighting'],
} as const;
export type LightId = keyof typeof LIGHT;

export const FRAME = {
  full: ['Full body', 'full-body shot, head to feet'],
  three_q: ['Three-quarter', 'three-quarter shot, head to knee'],
  half: ['Half body', 'waist-up only, head to hip'],
  close: ['Close-up', 'tight chest-up close-up'],
  mid: ['Mid shot', 'mid shot, head to thigh'],
  front: ['Front view', 'straight-on front view, full body, facing the camera'],
  side: ['Side view', 'side view, full body, body turned 90 degrees to the camera'],
  profile: ['Profile', 'profile shot, head and shoulders in side profile'],
  wide: ['Wide shot', 'wide shot, full body small in frame with the scene visible around'],
  editorial: ['Editorial', 'editorial fashion framing, full body, dynamic angle, magazine composition'],
  product: ['Product', 'centred, entire product visible'],
} as const;
export type FrameId = keyof typeof FRAME;

export const PRES = {
  mannequin: ['Mannequin', 'on a plain headless mannequin'],
  ghost: [
    'Ghost mannequin',
    'as an invisible-mannequin shot, holding its worn 3D shape with no body',
  ],
  flatlay: ['Flat lay', 'neatly flat-laid and shot top-down'],
  hanger: ['Hanger', 'on a wooden hanger'],
  folded: ['Folded', 'neatly folded'],
  styled: ['Styled display', 'as a styled display with subtle props'],
  plain: ['Product only', 'as a clean product-only shot'],
  macro: ['Macro detail', 'as a macro close-up of the fabric and embroidery'],
  rail: ['Boutique rail', 'hung on a boutique rail'],
  surface: ['On surface', 'laid on a polished marble surface'],
  bench: ['On bench', 'arranged on a wooden garden bench'],
} as const;
export type PresId = keyof typeof PRES;

export type Mode = 'model' | 'product';
export interface Preset {
  code: string;
  title: string;
  mode: Mode;
  sc: SceneId;
  po: PoseId | PresId;
  li: LightId;
  fr: FrameId;
  fit: readonly Cls[] | 'all';
  aud: readonly Aud[] | null;
  pri: number;
  env: Env;
  group: string;
  /** Indoor effects are combos (pose + lighting overridable); outdoor are fixed. */
  combo: boolean;
}

const ALL = 'all' as const;
const KIDS: readonly Aud[] = ['kids_girl', 'kids_boy'];
type Raw = [
  string,
  string,
  Mode,
  SceneId,
  PoseId | PresId,
  LightId,
  FrameId,
  readonly Cls[] | 'all',
  readonly Aud[] | null,
  number,
];
const RAW: Raw[] = [
  // MODEL · INDOOR
  [
    'M_WHITE_STUDIO',
    'White Studio Standing',
    'model',
    'white_studio',
    'standing',
    'softbox',
    'full',
    ALL,
    null,
    2,
  ],
  [
    'M_GREY_SOFTBOX',
    'Grey Softbox Studio',
    'model',
    'grey_studio',
    'standing',
    'softbox',
    'full',
    ALL,
    null,
    3,
  ],
  [
    'M_BEIGE_TURN',
    'Beige Studio Turn',
    'model',
    'beige_studio',
    'turning',
    'soft',
    'full',
    ['suit', 'lehenga', 'saree', 'dress'],
    null,
    2,
  ],
  [
    'M_LUXURY_STUDIO',
    'Luxury Studio',
    'model',
    'luxury_studio',
    'standing',
    'dramatic',
    'full',
    ['suit', 'lehenga', 'saree', 'dress'],
    null,
    3,
  ],
  [
    'M_EDITORIAL_FULL',
    'Editorial Full Look',
    'model',
    'editorial',
    'looking_back',
    'rim',
    'full',
    ['suit', 'lehenga', 'saree', 'dress'],
    null,
    1,
  ],
  [
    'M_EDITORIAL_CLOSE',
    'Editorial Close-Up',
    'model',
    'editorial',
    'standing',
    'rim',
    'half',
    ['top', 'kurti'],
    null,
    3,
  ],
  [
    'M_HOME_CANDID',
    'Home Candid',
    'model',
    'indian_home',
    'candid',
    'window',
    'full',
    ['suit', 'saree', 'dress', 'pant'],
    null,
    2,
  ],
  [
    'M_MIRROR_SELFIE',
    'Home Mirror Selfie',
    'model',
    'indian_home',
    'mirror',
    'window',
    'full',
    ['suit', 'dress', 'pant'],
    null,
    1,
  ],
  [
    'M_SEATED_SOFA',
    'Seated Lounge',
    'model',
    'indian_home',
    'sitting',
    'window',
    'full',
    ['suit', 'saree', 'lehenga', 'dress'],
    null,
    2,
  ],
  [
    'M_BOUTIQUE_WALK',
    'Boutique Walk',
    'model',
    'boutique',
    'walking',
    'soft',
    'full',
    ALL,
    null,
    1,
  ],
  [
    'M_RUNWAY',
    'Catwalk Runway',
    'model',
    'runway',
    'walking',
    'dramatic',
    'full',
    ['lehenga', 'saree', 'suit', 'dress'],
    null,
    2,
  ],
  [
    'M_MARBLE_LUXURY',
    'Marble Luxury',
    'model',
    'marble',
    'standing',
    'soft',
    'full',
    ['saree', 'lehenga', 'suit'],
    null,
    3,
  ],
  [
    'M_FESTIVE_DIYA',
    'Festive Diya Glow',
    'model',
    'festive_diya',
    'hold_dupatta',
    'cinematic',
    'full',
    ['suit', 'lehenga', 'saree', 'dress'],
    null,
    2,
  ],
  [
    'M_DUPATTA_FLOW',
    'Dupatta Flow',
    'model',
    'beige_studio',
    'dupatta_flow',
    'softbox',
    'full',
    ['suit', 'lehenga', 'saree'],
    null,
    3,
  ],
  [
    'M_TWIRL_FLARE',
    'Twirl Flare',
    'model',
    'white_studio',
    'twirl',
    'highkey',
    'full',
    ['lehenga', 'dress', 'suit'],
    null,
    2,
  ],
  [
    'M_LOOK_BACK',
    'Shoulder Glance',
    'model',
    'beige_studio',
    'looking_back',
    'soft',
    'three_q',
    ['saree', 'lehenga', 'suit', 'dress'],
    null,
    1,
  ],
  [
    'M_HALF_STUDIO',
    'Half-Body Studio',
    'model',
    'white_studio',
    'standing',
    'softbox',
    'half',
    ['top', 'kurti', 'shorts'],
    null,
    3,
  ],
  [
    'M_HALF_HOME',
    'Half-Body Home',
    'model',
    'indian_home',
    'candid',
    'window',
    'half',
    ['top', 'kurti'],
    null,
    2,
  ],
  [
    'M_HALF_BEIGE',
    'Half-Body Turn',
    'model',
    'beige_studio',
    'turning',
    'soft',
    'half',
    ['top', 'kurti', 'shorts'],
    null,
    2,
  ],
  [
    'M_HALF_BOUTIQUE',
    'Half-Body Boutique',
    'model',
    'boutique',
    'candid',
    'soft',
    'half',
    ['top', 'kurti'],
    null,
    1,
  ],
  [
    'M_KIDS_HOME_PLAY',
    'Kids Home Play',
    'model',
    'indian_home',
    'playing',
    'natural',
    'full',
    ALL,
    KIDS,
    3,
  ],
  [
    'M_KIDS_STUDIO',
    'Kids Bright Studio',
    'model',
    'white_studio',
    'candid',
    'highkey',
    'full',
    ALL,
    KIDS,
    2,
  ],
  [
    'M_MENS_LOUNGE',
    'Gentleman Lounge',
    'model',
    'luxury_studio',
    'sitting',
    'cinematic',
    'full',
    ALL,
    ['mens', 'teen_boy'],
    2,
  ],
  // MODEL · OUTDOOR (fixed)
  [
    'O_ROYAL_GARDEN',
    'Royal Garden Walk',
    'model',
    'rose_garden',
    'walking',
    'daylight',
    'full',
    ['suit', 'lehenga', 'saree', 'dress'],
    null,
    2,
  ],
  [
    'O_HERITAGE_STREET',
    'Jaipur Heritage Street',
    'model',
    'heritage_street',
    'standing',
    'daylight',
    'full',
    ['suit', 'lehenga', 'saree', 'dress', 'kurti'],
    null,
    2,
  ],
  [
    'O_PALACE_COURT',
    'Palace Courtyard',
    'model',
    'palace',
    'standing',
    'golden',
    'full',
    ['lehenga', 'saree', 'suit'],
    null,
    2,
  ],
  [
    'O_GOLDEN_HOUR',
    'Golden Hour Outdoor',
    'model',
    'golden_field',
    'turning',
    'golden',
    'full',
    ALL,
    null,
    3,
  ],
  [
    'O_BEACH_SUNSET',
    'Goa Sunset Beach',
    'model',
    'beach',
    'walking',
    'sunset',
    'full',
    ['dress', 'suit', 'pant', 'shorts'],
    null,
    1,
  ],
  [
    'O_MOUNTAIN',
    'Himalayan Resort',
    'model',
    'mountain',
    'standing',
    'daylight',
    'full',
    ['dress', 'suit', 'pant'],
    null,
    1,
  ],
  [
    'O_ROOFTOP_CAFE',
    'Rooftop Cafe',
    'model',
    'rooftop_cafe',
    'sitting',
    'soft',
    'full',
    ['dress', 'suit', 'pant'],
    null,
    1,
  ],
  [
    'O_URBAN_WALL',
    'Contemporary Wall',
    'model',
    'modern_wall',
    'candid',
    'daylight',
    'full',
    ['dress', 'pant', 'suit'],
    null,
    2,
  ],
  [
    'O_HALF_URBAN',
    'Half-Body Street',
    'model',
    'modern_wall',
    'candid',
    'natural',
    'half',
    ['top', 'kurti', 'shorts'],
    null,
    2,
  ],
  [
    'O_HALF_CAFE',
    'Half-Body Cafe',
    'model',
    'rooftop_cafe',
    'candid',
    'soft',
    'half',
    ['top', 'kurti'],
    null,
    1,
  ],
  ['O_KIDS_PARK', 'Kids Park Play', 'model', 'park', 'playing', 'daylight', 'full', ALL, KIDS, 3],
  // PRODUCT · INDOOR
  [
    'P_MANNEQUIN',
    'Mannequin',
    'product',
    'white_studio',
    'mannequin',
    'softbox',
    'product',
    ['suit', 'saree', 'lehenga', 'dress', 'pant', 'kurti', 'top'],
    null,
    3,
  ],
  [
    'P_GHOST',
    'Ghost Mannequin',
    'product',
    'white_studio',
    'ghost',
    'softbox',
    'product',
    ['top', 'kurti', 'suit', 'dress', 'pant', 'shorts'],
    null,
    3,
  ],
  [
    'P_FLATLAY',
    'Flat Lay',
    'product',
    'beige_studio',
    'flatlay',
    'softbox',
    'product',
    ALL,
    null,
    2,
  ],
  [
    'P_HANGER',
    'Hanger',
    'product',
    'white_studio',
    'hanger',
    'window',
    'product',
    ['top', 'kurti', 'suit', 'dress', 'shorts', 'pant'],
    null,
    2,
  ],
  [
    'P_FOLDED',
    'Folded',
    'product',
    'beige_studio',
    'folded',
    'soft',
    'product',
    ['top', 'kurti', 'shorts', 'pant', 'saree', 'unstitched'],
    null,
    1,
  ],
  [
    'P_STYLED',
    'Styled Display',
    'product',
    'indian_home',
    'styled',
    'window',
    'product',
    ALL,
    null,
    2,
  ],
  [
    'P_MARKETPLACE',
    'Marketplace Product Only',
    'product',
    'marketplace',
    'plain',
    'highkey',
    'product',
    ALL,
    null,
    3,
  ],
  [
    'P_MACRO',
    'Macro Fabric Detail',
    'product',
    'white_studio',
    'macro',
    'softbox',
    'close',
    ALL,
    null,
    1,
  ],
  [
    'P_BOUTIQUE_RAIL',
    'Boutique Rail',
    'product',
    'boutique',
    'rail',
    'soft',
    'product',
    ['top', 'kurti', 'suit', 'dress', 'pant'],
    null,
    1,
  ],
  [
    'P_LUXURY_SURFACE',
    'Luxury Marble Surface',
    'product',
    'marble',
    'surface',
    'soft',
    'product',
    ['suit', 'saree', 'lehenga', 'unstitched'],
    null,
    2,
  ],
  // PRODUCT · OUTDOOR (fixed)
  [
    'P_GARDEN_BENCH',
    'Garden Bench Display',
    'product',
    'rose_garden',
    'bench',
    'daylight',
    'product',
    ['suit', 'saree', 'unstitched', 'kurti', 'top'],
    null,
    1,
  ],
];

export const PRESETS: Preset[] = RAW.map(([code, title, mode, sc, po, li, fr, fit, aud, pri]) => ({
  code,
  title,
  mode,
  sc,
  po,
  li,
  fr,
  fit,
  aud,
  pri,
  env: SCENE[sc][1],
  group: SCENE[sc][2],
  combo: SCENE[sc][1] === 'indoor',
}));

/** Pose (model mode) or presentation (product mode) → [label, clause]. */
export const poseOrPres = (mode: Mode, id: string): readonly [string, string] =>
  (mode === 'model' ? POSE : PRES)[id as PoseId & PresId];

/** Effect eligible for this audience + garment? */
export function fits(p: Preset, cls: Cls, aud: Aud): boolean {
  if (p.fit !== ALL && !p.fit.includes(cls)) return false;
  if (p.aud && !p.aud.includes(aud)) return false;
  if (p.mode === 'model') {
    if (cls === 'unstitched') return false; // cloth can't be worn
    // half-body garment → half/close frames only; everything else → full/three-quarter only
    const halfFrame = p.fr === 'half' || p.fr === 'close';
    if (HALF.has(cls) !== halfFrame) return false;
  }
  return true;
}

export const score = (p: Preset, cls: Cls): number =>
  p.pri + (p.fit !== ALL && p.fit.includes(cls) ? 2 : 0);

/** Top-N indoor combo effects for this product, best first. */
export const recommend = (pool: Preset[], cls: Cls, n = 3): Preset[] =>
  pool
    .filter((p) => p.combo)
    .sort((a, b) => score(b, cls) - score(a, cls))
    .slice(0, n);

const GUARD =
  "The garment's exact colour, print, embroidery, fabric texture and original length are 100% preserved.";
const HALF_GUARD =
  'Do NOT show legs, hips-down or feet, and do NOT invent any trousers, palazzo, leggings or skirt not visible in the source photo.';

/** Photography style: an image-treatment clause, independent of scene, light and
 * framing (so it never restates them). Owner list 2026-09-30. */
export const PHOTO_STYLE = {
  catalog: [
    'Catalog',
    'Catalog photography: neutral, even and true to the garment, no props, no dramatic angles.',
  ],
  ecommerce: [
    'E-Commerce',
    'E-commerce photography: marketplace-ready, garment centred and fully visible, crisp clean edges, true-to-life colour, no props.',
  ],
  commercial: [
    'Commercial',
    'Commercial advertising photography: polished, aspirational, retouched brand-campaign look.',
  ],
  editorial: [
    'Editorial',
    'Editorial fashion photography: magazine composition, expressive styling, artistic and dynamic.',
  ],
  product: [
    'Product Photography',
    'Product photography: the garment is the hero, sharp fabric and embroidery detail, the model kept secondary.',
  ],
} as const;
export type PhotoStyleId = keyof typeof PHOTO_STYLE;
export const BENCH_PHOTO_STYLES = Object.keys(PHOTO_STYLE) as PhotoStyleId[];

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

export function resolveStylePrompt(s: Pick<StyleDef, 'prompt' | 'pools'> | undefined): string {
  if (!s) return '';
  return s.prompt.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    const pool = s.pools?.[k];
    return pool?.length ? pool[Math.floor(Math.random() * pool.length)] : '';
  });
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

export interface ComposeOpts {
  cls: Cls;
  aud: Aud;
  senior?: boolean;
  po?: string;
  li?: LightId;
  style?: PhotoStyleId;
}

export function composePrompt(p: Preset, o: ComposeOpts): string {
  const cls = CLS[o.cls].toLowerCase();
  const scene = SCENE[p.sc][3];
  const light = LIGHT[o.li ?? p.li][1];
  const action = poseOrPres(p.mode, o.po ?? p.po)[1];
  const frame = FRAME[p.fr][1];
  // style sits before the guards: the preservation clause stays last
  const style = o.style ? `${PHOTO_STYLE[o.style][1]} ` : '';
  if (p.mode === 'product')
    return `Present this ${cls} ${action}, set in ${scene}. Lit by ${light}. ${frame}. ${style}${GUARD}`;
  const who = (o.senior && SENIOR_DESC[o.aud]) || AUD_DESC[o.aud];
  const where = p.env === 'indoor' ? 'in' : 'outdoors in';
  return `Place this ${cls} on ${who}, ${action}, ${where} ${scene}. Lit by ${light}. ${frame}. ${style}${HALF.has(o.cls) ? `${HALF_GUARD} ` : ''}${GUARD}`;
}

// ── Real sample photos (public/effect-photos) ──
export interface Sample {
  f: string;
  label: string;
  aud: Aud;
  cls: Cls;
  worn: boolean;
}
const S = (f: string, label: string, aud: Aud, cls: Cls, worn = false): Sample => ({
  f,
  label,
  aud,
  cls,
  worn,
});
export const SAMPLES: Sample[] = [
  S('w-kurti-pink-embroidered', 'Kurti · pink', 'womens', 'kurti'),
  S('w-kurti-mustard', 'Kurti · mustard', 'womens', 'kurti'),
  S('w-kurti-green', 'Kurti · green', 'womens', 'kurti'),
  S('w-shirt-grey', 'Shirt · grey', 'womens', 'top'),
  S('w-anarkali-orange', 'Anarkali · orange', 'womens', 'suit'),
  S('w-suit-blue', 'Suit · blue', 'womens', 'suit'),
  S('w-suit-coral', 'Suit · coral', 'womens', 'suit'),
  S('w-suit-yellow', 'Suit · yellow', 'womens', 'suit'),
  S('w-lehenga-pink', 'Lehenga · pink', 'womens', 'lehenga'),
  S('w-saree-green', 'Saree · green', 'womens', 'saree'),
  S('w-unstitched-white', 'Unstitched · white', 'womens', 'unstitched'),
  S('w-unstitched-blue', 'Unstitched · blue', 'womens', 'unstitched'),
  S('w-kurta-palazzo-mustard-worn', 'Kurta set · worn (test)', 'womens', 'suit', true),
  S('w-kurta-palazzo-pink-worn', 'Kurta set · worn (test)', 'womens', 'suit', true),
  // boy-*/girl-* audience assumed kid — edit here if any are teen.
  S('b-shirt', 'Shirt · boy', 'kids_boy', 'top'),
  S('b-tshirt', 'T-shirt · boy', 'kids_boy', 'top'),
  S('b-sweater', 'Sweater · boy', 'kids_boy', 'top'),
  S('b-shorts', 'Shorts · boy', 'kids_boy', 'shorts'),
  S('b-pant', 'Pant · boy', 'kids_boy', 'pant'),
  S('g-top-bear', 'Tee · girl', 'kids_girl', 'top'),
  S('g-dress-1', 'Dress · girl', 'kids_girl', 'dress'),
  S('g-dress-2', 'Dress · girl', 'kids_girl', 'dress'),
  S('g-set-pinafore', 'Pinafore set · girl', 'kids_girl', 'dress'),
];

export interface ModelTile {
  f: string;
  aud: Aud;
  label: string;
  senior: boolean;
}
export const MODEL_TILES: ModelTile[] = [
  { f: 'woman-30', aud: 'womens', label: 'Woman · 30', senior: false },
  { f: 'woman-60', aud: 'womens', label: 'Woman · 60', senior: true },
  { f: 'man-35', aud: 'mens', label: 'Man · 35', senior: false },
  { f: 'man-70', aud: 'mens', label: 'Man · 70', senior: true },
  { f: 'teen-girl-16', aud: 'teen_girl', label: 'Teen girl · 16', senior: false },
  { f: 'teen-boy-18', aud: 'teen_boy', label: 'Teen boy · 18', senior: false },
  { f: 'kid-girl-4', aud: 'kids_girl', label: 'Girl · 4', senior: false },
  { f: 'kid-boy-4', aud: 'kids_boy', label: 'Boy · 4', senior: false },
];

// ── Model bench (admin test page) ─────────────────────────────────────
// Pick a scene, a gender and an age bucket; the pose is chosen from a fixed
// list. Reuses composePrompt() above so a bench prompt reads exactly like a
// catalog effect's prompt — the only new logic is which pose and who.

/** The indoor scene picker, grouped as the owner listed them. */
export const BENCH_SCENES = [
  { group: 'Studio', label: 'White Studio', id: 'white_studio' },
  { group: 'Studio', label: 'Beige Studio', id: 'beige_studio' },
  { group: 'Studio', label: 'Grey Studio', id: 'grey_studio' },
  { group: 'Studio', label: 'Luxury Studio', id: 'luxury_studio' },
  { group: 'Studio', label: 'Editorial Studio', id: 'editorial' },
  { group: 'Indian', label: 'Indian Home', id: 'indian_home' },
  { group: 'Indian', label: 'Courtyard', id: 'courtyard' },
  { group: 'Indian', label: 'Royal Interior', id: 'royal_interior' },
  { group: 'Commercial', label: 'Boutique', id: 'boutique' },
  { group: 'Commercial', label: 'Showroom', id: 'showroom' },
  { group: 'Commercial', label: 'Designer Store', id: 'designer_store' },
  { group: 'Commercial', label: 'Fashion Gallery', id: 'fashion_gallery' },
  { group: 'Luxury', label: 'Hotel', id: 'hotel' },
  { group: 'Luxury', label: 'Penthouse', id: 'penthouse' },
  { group: 'Luxury', label: 'Luxury Lounge', id: 'luxury_lounge' },
  { group: 'Luxury', label: 'Marble Hall', id: 'marble' },
  { group: 'Heritage', label: 'Heritage Room', id: 'heritage_room' },
] as const satisfies readonly { group: string; label: string; id: SceneId }[];

/** Owner-approved bench lighting (2026-09-20). */
export const BENCH_LIGHTS = ['natural', 'soft', 'window', 'sunset', 'studio', 'highkey', 'lowkey'] as const satisfies readonly LightId[];
export type BenchLight = (typeof BENCH_LIGHTS)[number];

/** Owner-approved bench photography / framing (2026-09-20). */
export const BENCH_SHOTS = ['full', 'three_q', 'mid', 'close', 'front', 'side', 'profile', 'wide', 'editorial'] as const satisfies readonly FrameId[];
export type BenchShot = (typeof BENCH_SHOTS)[number];
// A half-body garment cannot be framed below the hip (no invented legs).
const LEGS_SHOTS = new Set<BenchShot>(['full', 'three_q', 'front', 'side', 'wide', 'editorial']);

/** The only poses the bench uses (owner list, 2026-09-19). */
export const BENCH_POSES = [
  'standing',
  'sitting',
  'walking',
  'turning',
  'looking_back',
  'twirl',
  'hold_dupatta',
  'dupatta_flow',
  'candid',
] as const satisfies readonly PoseId[];
export type BenchPose = (typeof BENCH_POSES)[number];

const DUPATTA_POSES = new Set<BenchPose>(['hold_dupatta', 'dupatta_flow']);
// A waist-up frame cannot show a stride, a seat or a flare.
const FULL_BODY_POSES = new Set<BenchPose>(['walking', 'sitting', 'twirl']);

/** Poses that make sense for this garment: dupatta poses only when there is a
 * dupatta, and no full-body poses for a half-body garment (top / kurti / shorts). */
export function benchPoseChoices(cls: Cls, hasDupatta: boolean): BenchPose[] {
  return BENCH_POSES.filter(
    (p) => (hasDupatta || !DUPATTA_POSES.has(p)) && !(HALF.has(cls) && FULL_BODY_POSES.has(p)),
  );
}

/** "Auto pose": one random pick from benchPoseChoices. `rand` is injectable for tests. */
export function pickPose(cls: Cls, hasDupatta: boolean, rand: () => number = Math.random): BenchPose {
  const choices = benchPoseChoices(cls, hasDupatta);
  return choices[Math.floor(rand() * choices.length)] ?? 'standing';
}

export const BENCH_GENDERS = ['female', 'male'] as const;
export const BENCH_AGES = ['kid', 'teen', 'adult', 'senior'] as const;
export type BenchGender = (typeof BENCH_GENDERS)[number];
export type BenchAge = (typeof BENCH_AGES)[number];

/** Gender + age bucket → the demographic the API renders, plus the senior flag
 * composePrompt() uses for an older model (only defined for adults). */
export function audFor(gender: BenchGender, age: BenchAge): { aud: Aud; senior: boolean } {
  const f = gender === 'female';
  if (age === 'kid') return { aud: f ? 'kids_girl' : 'kids_boy', senior: false };
  if (age === 'teen') return { aud: f ? 'teen_girl' : 'teen_boy', senior: false };
  return { aud: f ? 'womens' : 'mens', senior: age === 'senior' };
}

export function composeBenchPrompt(o: {
  scene: SceneId;
  pose: PoseId;
  cls: Cls;
  gender: BenchGender;
  age: BenchAge;
  light?: BenchLight;
  shot?: BenchShot;
  style?: PhotoStyleId;
}): string {
  const { aud, senior } = audFor(o.gender, o.age);
  const shot = o.shot ?? 'full';
  const preset: Preset = {
    code: 'BENCH',
    title: 'Bench',
    mode: 'model',
    sc: o.scene,
    po: o.pose,
    li: o.light ?? 'soft',
    fr: HALF.has(o.cls) && LEGS_SHOTS.has(shot) ? 'half' : shot,
    fit: 'all',
    aud: null,
    pri: 0,
    env: 'indoor',
    group: SCENE[o.scene][2],
    combo: false,
  };
  return composePrompt(preset, { cls: o.cls, aud, senior, style: o.style });
}
