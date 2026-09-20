// AI Studio effects catalog — the "combination" behind Studio Shoot presets.
// Ported from docs/tasks/AI Studio Effects.html. Each effect is a bundle of
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

export interface ComposeOpts {
  cls: Cls;
  aud: Aud;
  senior?: boolean;
  po?: string;
  li?: LightId;
}

export function composePrompt(p: Preset, o: ComposeOpts): string {
  const cls = CLS[o.cls].toLowerCase();
  const scene = SCENE[p.sc][3];
  const light = LIGHT[o.li ?? p.li][1];
  const action = poseOrPres(p.mode, o.po ?? p.po)[1];
  const frame = FRAME[p.fr][1];
  if (p.mode === 'product')
    return `Present this ${cls} ${action}, set in ${scene}. Lit by ${light}. ${frame}. ${GUARD}`;
  const who = (o.senior && SENIOR_DESC[o.aud]) || AUD_DESC[o.aud];
  const where = p.env === 'indoor' ? 'in' : 'outdoors in';
  return `Place this ${cls} on ${who}, ${action}, ${where} ${scene}. Lit by ${light}. ${frame}. ${HALF.has(o.cls) ? `${HALF_GUARD} ` : ''}${GUARD}`;
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
  return composePrompt(preset, { cls: o.cls, aud, senior });
}
