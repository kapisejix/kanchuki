// ─── Plan Limits ──────────────────────────────────────────────────

export const PLAN_LIMITS = {
  STARTER: {
    max_products: 500,
    max_customers: Number.POSITIVE_INFINITY,
    max_collection_links_per_month: 50,
    try_on_credits: 0,
    whatsapp_api: false,
  },
  GROWTH: {
    max_products: 2000,
    max_customers: Number.POSITIVE_INFINITY,
    max_collection_links_per_month: Number.POSITIVE_INFINITY,
    try_on_credits: 100,
    whatsapp_api: false,
  },
  PRO: {
    max_products: Number.POSITIVE_INFINITY,
    max_customers: Number.POSITIVE_INFINITY,
    max_collection_links_per_month: Number.POSITIVE_INFINITY,
    try_on_credits: 500,
    whatsapp_api: true,
  },
} as const;

// ─── Plan Pricing (paise) ─────────────────────────────────────────

export const PLAN_PRICING = {
  STARTER: { monthly: 99900, annual: 999900 }, // ₹999/mo, ₹9999/yr
  GROWTH: { monthly: 249900, annual: 2499900 }, // ₹2499/mo, ₹24999/yr
  PRO: { monthly: 499900, annual: 4999900 }, // ₹4999/mo, ₹49999/yr
} as const;

// ─── Indian Ethnic Wear Categories ───────────────────────────────

export const PRODUCT_CATEGORIES = [
  'Ladies Suit',
  'Kurti',
  'Saree',
  'Lehenga',
  'Gown',
  'Dupatta',
  'Blouse',
  "Men's Kurta Pajama",
  'Sherwani',
  'Kids Ethnic Wear',
  'Readymade Suit',
  'Other',
] as const;

// Categories where a retailer can tag separate upper/lower garment photos so
// try-on chains two V-Tone calls (tops → bottoms) instead of treating the
// whole outfit as one region (see packages/ai/src/tryon.ts, PRO-REQUIREMENTS.md F-102).
// Saree is deliberately excluded — it's one continuous drape, not two
// separate garment pieces, so there's no natural upper/lower photo split.
export const PIECE_TAGGABLE_CATEGORIES = [
  'Ladies Suit',
  'Readymade Suit',
  "Men's Kurta Pajama",
  'Lehenga',
] as const;

export const PRODUCT_TYPES = ['Unstitched', 'Semi-Stitched', 'Readymade'] as const;

export const PATTERN_TYPES = [
  'Plain',
  'Printed',
  'Embroidered',
  'Block Print',
  'Bandhani',
  'Chikankari',
  'Phulkari',
  'Woven',
  'Checked',
  'Striped',
] as const;

export const EMBELLISHMENT_TYPES = [
  'Zari Work',
  'Zardozi',
  'Gota Patti',
  'Mirror Work',
  'Sequin',
  'Stone Work',
  'Resham Embroidery',
  'Thread Work',
  'None',
] as const;

// Roadmap N — Indian Size & Fit: standard labels S–XXXL plus plus-size
// ranges properly labeled (XS + 4XL–8XL). Products store their own size
// arrays, so adding options is backward-compatible.
export const SIZE_OPTIONS = [
  'XS',
  'S',
  'M',
  'L',
  'XL',
  'XXL',
  'XXXL',
  '4XL',
  '5XL',
  '6XL',
  '7XL',
  '8XL',
] as const;

// ─── Color Swatch Resolution ──────────────────────────────────────
// Common Indian-fashion color names aren't valid CSS/RN color keywords
// (e.g. "Bottle Green", "Rani Pink", "Mustard") — used directly as a
// backgroundColor they render black/transparent. Shared between web
// (which adds a browser color-parser probe on top) and mobile (which has
// no DOM to probe, so this map is its only source of truth).
export const FASHION_COLOR_ALIASES: Record<string, string> = {
  mustard: '#c9a227',
  'bottle green': '#0a4d3c',
  'rani pink': '#e0218a',
  'navy blue': '#1a2b4c',
  wine: '#722f37',
  burgundy: '#800020',
  peach: '#ffcba4',
  emerald: '#50c878',
  mint: '#98ff98',
  mauve: '#e0b0ff',
  copper: '#b87333',
  cream: '#fffdd0',
  'off-white': '#faf6f0',
  'off white': '#faf6f0',
  red: '#dc2626',
  blue: '#2563eb',
  green: '#16a34a',
  yellow: '#eab308',
  orange: '#ea580c',
  purple: '#9333ea',
  pink: '#ec4899',
  brown: '#78350f',
  black: '#1c1917',
  white: '#f5f5f4',
  grey: '#78716c',
  gray: '#78716c',
  maroon: '#7f1d1d',
  navy: '#1e3a5f',
  teal: '#0d9488',
  olive: '#65760a',
  gold: '#d4af37',
  silver: '#c0c0c0',
  beige: '#e8dcc8',
  tan: '#d2b48c',
  coral: '#ff7f50',
  turquoise: '#40e0d0',
  indigo: '#4338ca',
  violet: '#7c3aed',
  magenta: '#c026d3',
  cyan: '#06b6d4',
  lavender: '#c4b5fd',
  khaki: '#bdb76b',
  ivory: '#fffff0',
  crimson: '#dc143c',
  salmon: '#fa8072',
  rust: '#b7410e',
  charcoal: '#36454f',
  chocolate: '#7b3f00',
  lilac: '#c8a2c8',
};

/** Resolve a retailer-entered or AI-detected color name to a hex swatch,
 * falling back to neutral grey for anything unmapped rather than rendering
 * invisible/black. AI color detection returns free text ("Dark Navy Blue",
 * "Dusty Rose Pink") that rarely exact-matches an alias key — so after an
 * exact match, fall back to the longest alias key contained in the name. */
export function resolveFashionColor(name: string): string {
  const key = name.trim().toLowerCase();
  const exact = FASHION_COLOR_ALIASES[key];
  if (exact) return exact;
  let best: { alias: string; hex: string } | null = null;
  for (const [alias, hex] of Object.entries(FASHION_COLOR_ALIASES)) {
    if (key.includes(alias) && (!best || alias.length > best.alias.length)) best = { alias, hex };
  }
  return best?.hex ?? '#d1d5db';
}

/** WCAG-style relative luminance of a hex color (0 = black, 1 = white) —
 * linearized sRGB channels. Drives the auto-contrast background picker:
 * a dark garment gets a light backdrop and vice versa. */
export function hexRelativeLuminance(hex: string): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return 0.5;
  const n = Number.parseInt(match[1] ?? '000000', 16);
  const channels = [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

/** Classify an AI-detected fashion color name into a tone for the
 * auto-contrast background picker.
 *   - 'dark'  (luminance < 0.35) → wants a LIGHT backdrop
 *   - 'light' (luminance > 0.6)  → wants a DARK backdrop
 *   - null    (unmapped name or a mid-tone) → keep the default background
 *             instead of guessing, e.g. white.
 * Unmapped names are detected via the alias table directly (NOT the grey
 * fallback of resolveFashionColor) so an unknown color can't confidently
 * pick a background. */
export function classifyColorTone(name: string | null | undefined): 'dark' | 'light' | null {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  const hex = FASHION_COLOR_ALIASES[key];
  if (!hex) return null;
  const luminance = hexRelativeLuminance(hex);
  if (luminance < 0.35) return 'dark';
  if (luminance > 0.6) return 'light';
  return null;
}

// ─── Hindi → English Search Mapping ──────────────────────────────

export const HINDI_TO_ENGLISH: Record<string, string> = {
  suit: 'ladies suit',
  salwar: 'ladies suit',
  kurti: 'kurti',
  kurta: 'kurta',
  sadi: 'saree',
  saadi: 'saree',
  lehnga: 'lehenga',
  shadi: 'wedding',
  vyah: 'wedding',
  shaadi: 'wedding',
  pooja: 'festive pooja',
  neela: 'blue',
  neeli: 'blue',
  lal: 'red',
  lali: 'red',
  pila: 'yellow',
  peela: 'yellow',
  hara: 'green',
  hari: 'green',
  kala: 'black',
  kali: 'black',
  safed: 'white',
  sufi: 'cotton',
  kapas: 'cotton',
  reshmi: 'silk',
  silky: 'silk',
  festive: 'festive occasion',
  dulhan: 'wedding bridal',
  office: 'office wear',
  casual: 'casual daily wear',
  party: 'party wear',
};

// ─── Roadmap M — Supported Locales ────────────────────────────────
// Canonical list of locales the platform supports for AI descriptions,
// campaign/WhatsApp message translation, and (post-launch) UI language.
// Shared between web (customer PWA), mobile (retailer app), and API
// (validation + content generation).
export const SUPPORTED_LOCALES = [
  { key: 'en-IN', label: 'English', native: 'English', script: 'latin' },
  { key: 'hi-IN', label: 'Hindi', native: 'हिन्दी', script: 'devanagari' },
  { key: 'hi-Latn-IN', label: 'Hinglish', native: 'Hinglish', script: 'latin' },
  { key: 'ta-IN', label: 'Tamil', native: 'தமிழ்', script: 'tamil' },
  { key: 'te-IN', label: 'Telugu', native: 'తెలుగు', script: 'telugu' },
  { key: 'mr-IN', label: 'Marathi', native: 'मराठी', script: 'devanagari' },
  { key: 'gu-IN', label: 'Gujarati', native: 'ગુજરાતી', script: 'gujarati' },
  { key: 'bn-IN', label: 'Bengali', native: 'বাংলা', script: 'bengali' },
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]['key'];

/** Default locale fallback chain: selected → retailer default → Hindi → English. */
export const LOCALE_FALLBACK_CHAIN: readonly SupportedLocale[] = [
  'hi-IN',
  'en-IN',
] as const;

// ─── R2 Storage Paths ─────────────────────────────────────────────

export const R2_PATHS = {
  productPhoto: (retailerId: string, productId: string, filename: string) =>
    `retailers/${retailerId}/products/${productId}/${filename}`,
  tryonInput: (jobId: string) => `tryon/${jobId}/input.jpg`,
  tryonResult: (jobId: string) => `tryon/${jobId}/result.jpg`,
  measurementPhoto: (customerId: string, measurementId: string, side: 'front' | 'back') =>
    `measurements/${customerId}/${measurementId}/${side}.jpg`,
  retailerLogo: (retailerId: string, filename: string) =>
    `retailers/${retailerId}/logo/${filename}`,
  retailerKyc: (
    retailerId: string,
    docType: 'gst' | 'aadhar_front' | 'aadhar_back',
    filename: string,
  ) => `retailers/${retailerId}/kyc/${docType}/${filename}`,
  spinVideo: (retailerId: string, productId: string) =>
    `retailers/${retailerId}/products/${productId}/spin/video.mp4`,
  productVideo: (retailerId: string, productId: string, filename: string) =>
    `retailers/${retailerId}/products/${productId}/videos/${filename}`,
  spinFrame: (retailerId: string, productId: string, frameIndex: number) =>
    `retailers/${retailerId}/products/${productId}/spin/frame-${frameIndex}.jpg`,
  backgroundImage: (filename: string) => `admin/background-images/${filename}`,
  categoryImage: (retailerId: string, filename: string) =>
    `retailers/${retailerId}/categories/${filename}`,
  retailerBanner: (retailerId: string, filename: string) =>
    `retailers/${retailerId}/banner/${filename}`,
  photoCleanupTest: (filename: string) => `admin/photo-cleanup-tests/${filename}`,
  // F-032 Phase A: AI studio-shoot results. New KEY per generation (never
  // overwrites the source photo) — the result is a new ProductPhoto row the
  // retailer can promote to primary, keeping the original one tap away.
  studioShot: (retailerId: string, productId: string, filename: string) =>
    `retailers/${retailerId}/products/${productId}/studio/${filename}`,
  lookbookOutput: (retailerId: string, lookbookId: string, filename: string) =>
    `retailers/${retailerId}/lookbooks/${lookbookId}/${filename}`,
} as const;

// ─── F-032 AI Studio Shoots — template presets (2026-08-13) ───────
// PhotoRoom-style TEMPLATE-ONLY generation (no free-text prompts): the
// retailer picks a preset, the API sends a fixed prompt to FLUX Kontext.
// Shared with the mobile app so the picker labels can't drift from the
// prompts the API uses. The prompts instruct subject preservation — keep
// the product's pixels identical and generate only the scene (the "own the
// subject, not the scene" lesson; see docs/PRO-REQUIREMENTS.md §24).

// AI Studio Shoot bills the retailer 8 credits per generated image. The
// STUDIO_SHOOT quota counter (F-010) still counts images (1 per shoot);
// this is the credits-per-image multiplier the UI shows the retailer.
export const STUDIO_CREDITS_PER_IMAGE = 8;

export const STUDIO_TEMPLATES = [
  {
    id: 'studiomodel',
    command: '/studiomodel',
    label: 'Studio Editorial',
    description: 'High-fashion Indian studio model wearing the outfit with softbox lighting',
    preview_image_url: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600&auto=format&fit=crop&q=80',
    prompt:
      'Place this garment naturally onto a professional Indian fashion model in a clean editorial studio. The model has an elegant posture and natural expression. The garment shape, exact original color, dye, pattern, and embroidery are 100% preserved with realistic draping. Color-true 5500K neutral studio softbox lighting with soft grounding shadows. No color shifts.',
  },
  {
    id: 'bridalwear',
    command: '/bridalwear',
    label: 'Royal Bridal Palace',
    description: 'Royal wedding palace courtyard setting with warm ambient background',
    preview_image_url: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=600&auto=format&fit=crop&q=80',
    prompt:
      'Place this ethnic outfit in a royal Indian palace courtyard setting (Rajasthan heritage architecture) with carved arches and gentle ambient evening light in the background bokeh. The garment itself is lit with neutral 5500K color-true key lighting to 100% preserve its exact original fabric color, embroidery, zari work, and hue without amber tinting or color shifts.',
  },
  {
    id: 'seasoncollection',
    command: '/seasoncollection',
    label: 'Festive Celebration',
    description: 'Festive celebration backdrop with warm background marigolds & light bokeh',
    preview_image_url: 'https://images.unsplash.com/photo-1606293926075-69a00dbfde81?w=600&auto=format&fit=crop&q=80',
    prompt:
      'Place this ethnic garment in a festive celebration backdrop with subtle glowing diya light bokeh and marigold floral accents strictly in the background. The garment itself is illuminated with neutral daylight studio lighting, keeping the product shape, exact original color, pattern, and fabric details 100% unaltered.',
  },
  {
    id: 'clothingdetail',
    command: '/clothingdetail',
    label: 'Macro Fabric Detail',
    description: 'Ultra-sharp macro close-up highlighting fine embroidery and weave',
    preview_image_url: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80',
    prompt:
      'An ultra-detailed macro close-up photograph highlighting the fine craftsmanship, texture, zari embroidery, and fabric weave of this garment. Sharp focus on the intricate details with natural soft depth of field and 100% color-true, neutral daylight studio lighting.',
  },
  {
    id: 'runway',
    command: '/runway',
    label: 'Catwalk Runway',
    description: 'High-fashion catwalk runway setting with dramatic spotlights',
    preview_image_url: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=600&auto=format&fit=crop&q=80',
    prompt:
      'Place this outfit in a high-fashion catwalk runway show with overhead spotlights and soft blurred audience bokeh in the background. A graceful Indian fashion model (Indian lady for womenswear / Indian gentleman for menswear / Indian boy for kids) is walking gracefully. The garment shape, drape, exact original color, embroidery, and texture are 100% preserved with true-tone lighting.',
  },
  {
    id: 'white_studio',
    command: '/white_studio',
    label: 'White Studio',
    description: 'Clean white backdrop, soft even lighting — marketplace ready',
    preview_image_url: 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=600&auto=format&fit=crop&q=80',
    prompt:
      'Replace the background of this product photo with a clean, seamless white studio backdrop. Neutral 5500K daylight-balanced CRI-98 studio lighting. Keep the product itself completely unchanged — exact same color, hue, saturation, pattern, and fabric details with soft natural grounding shadow.',
  },
  {
    id: 'warm_luxury',
    command: '/warm_luxury',
    label: 'Warm Luxury',
    description: 'Rich warm beige backdrop with color-true subject lighting',
    preview_image_url: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=600&auto=format&fit=crop&q=80',
    prompt:
      'Replace the background of this product photo with a warm, luxurious beige studio backdrop with subtle depth. The product itself is lit with neutral, color-true 5500K studio light so the garment fabric color, dye, and embroidery remain 100% faithful to the original photo with natural grounding shadow.',
  },
  {
    id: 'gold_festive',
    command: '/gold_festive',
    label: 'Gold Festive',
    description: 'Festive gold-tone backdrop (Diwali/wedding ready)',
    preview_image_url: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=600&auto=format&fit=crop&q=80',
    prompt:
      'Replace the background of this product photo with an elegant festive gold-toned backdrop with soft depth. The product itself is illuminated with neutral daylight studio lighting so the exact garment color, fabric shade, and embroidery remain completely unchanged and true to life.',
  },
  {
    id: 'diwali_lights',
    command: '/diwali_lights',
    label: 'Diwali Lights',
    description: 'Diwali-specific backdrop with diyas and rangoli patterns',
    preview_image_url: 'https://images.unsplash.com/photo-1514517521153-1be72277b32f?w=600&auto=format&fit=crop&q=80',
    prompt:
      'Replace the background of this product photo with a vibrant Diwali backdrop featuring glowing diyas and rangoli patterns strictly in the background. The garment itself is lit with neutral 5500K color-true studio lighting, keeping the product shape, exact color, pattern, and fabric details 100% unaltered.',
  },
  {
    id: 'wedding_elegant',
    command: '/wedding_elegant',
    label: 'Wedding Florals',
    description: 'Elegant wedding backdrop with floral arrangements and draping',
    preview_image_url: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=600&auto=format&fit=crop&q=80',
    prompt:
      'Replace the background of this product photo with an elegant wedding backdrop featuring soft floral arrangements and pastel draping in the background. The garment itself is lit with neutral daylight studio lighting, keeping its original fabric color, embroidery, and textures 100% faithful to the original photo.',
  },
  {
    id: 'flat_lay',
    command: '/flat_lay',
    label: 'Flat-Lay Linen',
    description: 'Casual flat-lay style on a neutral textured surface',
    preview_image_url: 'https://images.unsplash.com/photo-1523381294911-8d3cead13475?w=600&auto=format&fit=crop&q=80',
    prompt:
      'Replace the background of this product photo with a neutral, textured flat-lay surface (like a light linen or stone tabletop), shot from directly above. Keep the product itself completely unchanged — same shape, exact original color, pattern, and fabric details. Soft, even, neutral 5500K lighting.',
  },

  // ─── DRAFT styles (2026-08-29) — admin test bench only ───────────
  // `draft: true` → hidden from the retailer mobile picker
  // (ProductStudioModal filters them), shown in the admin photo-cleanup-test
  // dropdown. Prompts are scene-only; generateStudioImage() appends the
  // colour-fidelity tail. Drop the `draft` flag to ship a style to mobile.
  // No `audience` tag yet — category auto-filter is separate work
  // (docs/photoshoots/ChatGPT-style.md §5).
  {
    id: 'editorial_vogue',
    command: '/editorial',
    label: 'Vogue Editorial',
    description: 'Magazine editorial — grey cyclorama, softbox key + hair light',
    draft: true,
    prompt:
      'Place this outfit on a graceful Indian fashion model in a high-fashion editorial studio with a seamless mid-grey backdrop, softbox key light and a subtle hair light, confident straight-on pose. The garment shape, drape, exact original colour, pattern and embroidery are 100% preserved.',
  },
  {
    id: 'botanical_garden',
    command: '/garden',
    label: 'Royal Botanical Garden',
    description: 'Outdoor — Mughal garden, marble fountain, golden-hour bokeh',
    draft: true,
    prompt:
      'Place this outfit on a graceful Indian fashion model in a lush Mughal-style botanical garden with manicured hedges, a marble fountain and blooming flowerbeds, soft golden-hour daylight and greenery bokeh behind. Neutral daylight on the garment keeps its true colour, texture and embroidery.',
  },
  {
    id: 'heritage_street',
    command: '/street',
    label: 'Jaipur Heritage Street',
    description: 'Outdoor — terracotta-pink walls, carved doors, candid stride',
    draft: true,
    prompt:
      'Place this garment on a graceful Indian fashion model on a Jaipur old-city street with terracotta-pink carved walls, antique wooden doors and brass lanterns, soft morning light, candid mid-stride pose. Exact dyes, weave and embroidery stay faithful to the original.',
  },
  {
    id: 'palace_courtyard',
    command: '/palace',
    label: 'Royal Palace Courtyard',
    description: 'Outdoor — Rajasthan palace, sandstone arches, warm evening light',
    draft: true,
    prompt:
      'Place this outfit on a graceful Indian fashion model in a Rajasthan palace courtyard with carved sandstone arches and jharokha windows, warm ambient evening light blurred in the background. The garment is lit with neutral key light so colour, zari and embroidery are 100% preserved.',
  },
  {
    id: 'heritage_library',
    command: '/indoor',
    label: 'Grand Heritage Library',
    description: 'Indoor — wood panelling, tall bookshelves, brass lamps',
    draft: true,
    prompt:
      'Place this garment on a graceful Indian fashion model inside a grand wood-panelled heritage library with tall bookshelves and brass reading lamps, warm soft interior light behind and neutral light on the subject, poised standing pose. Colour, texture and embroidery preserved exactly.',
  },
  {
    id: 'rooftop_golden',
    command: '/rooftop',
    label: 'Golden-Hour Rooftop',
    description: 'City rooftop, string lights, blurred skyline, sun flare',
    draft: true,
    prompt:
      'Place this outfit on a graceful Indian fashion model on a chic city rooftop at golden hour with string lights and a blurred skyline, warm sun flare behind, relaxed editorial pose. Neutral light on the fabric keeps the garment colour and detail true.',
  },
  {
    id: 'boutique_showroom',
    command: '/boutique',
    label: 'Boutique Showroom',
    description: 'Indoor — upscale boutique, spot-lit displays, racks bokeh',
    draft: true,
    prompt:
      'Place this outfit on a graceful Indian fashion model inside an upscale fashion boutique with warm spot-lit displays and clothing racks softly out of focus behind. Even neutral lighting on the garment so its exact colour, pattern and embroidery stay unchanged.',
  },
  {
    id: 'seated_haveli_steps',
    command: '/sitting',
    label: 'Seated Haveli Steps',
    description: 'Pose — seated on carved stone steps, dupatta on lap',
    draft: true,
    prompt:
      'Place this outfit on a graceful Indian fashion model seated on carved stone haveli steps with the dupatta arranged across the lap, potted palms and a lantern softly out of focus behind, full garment visible. Neutral daylight keeps true colour and zari.',
  },
  {
    id: 'dupatta_motion',
    command: '/twirl',
    label: 'Dupatta in Motion',
    description: 'Pose — mid-turn, dupatta and skirt caught in the air',
    draft: true,
    prompt:
      'Place this outfit on a graceful Indian fashion model captured mid-motion, turning with the dupatta and skirt caught in the air and a slight wind, soft neutral backdrop with gentle motion blur only in the background. The garment stays sharp with colour, drape and embroidery 100% preserved.',
  },
  {
    id: 'low_key_dark',
    command: '/dark',
    label: 'Dark Dramatic Low-Key',
    description: 'Near-black backdrop, single side key + rim light',
    draft: true,
    prompt:
      'Place this garment on a graceful Indian fashion model against a near-black seamless backdrop with a single dramatic side key light and a soft rim light on the shoulder. Fabric texture and embroidery catch the light while the exact garment colour is held true with no colour shift.',
  },
  {
    id: 'cinematic_film',
    command: '/cinematic',
    label: 'Cinematic Film Grade',
    description: '35mm film look — moody directional light, shallow DOF',
    draft: true,
    prompt:
      'Place this outfit on a graceful Indian fashion model in a cinematic 35mm-film-graded scene with moody directional light and shallow depth of field, muted filmic colour in the environment only. The garment keeps its exact original colour, saturation and embroidery.',
  },
  {
    id: 'gradient_hero',
    command: '/hero',
    label: 'Gradient Campaign Hero',
    description: 'Colour-gradient backdrop, beauty light, room for text',
    draft: true,
    prompt:
      'Place this outfit on a graceful Indian fashion model against a smooth studio colour-gradient backdrop (deep plum to warm rose) with even beauty lighting, centred campaign-hero framing with head-to-hem clearance for text. The garment colour, pattern and embroidery are exactly preserved.',
  },
] as const satisfies readonly {
  id: string;
  command?: string;
  label: string;
  description: string;
  preview_image_url?: string;
  /** Draft styles are hidden from the retailer mobile picker (admin test bench only). */
  draft?: boolean;
  prompt: string;
}[];

export type StudioTemplateId = (typeof STUDIO_TEMPLATES)[number]['id'];

export function getStudioTemplate(id: string): (typeof STUDIO_TEMPLATES)[number] | undefined {
  const normalized = id.startsWith('/') ? id.slice(1) : id;
  return STUDIO_TEMPLATES.find((t) => t.id === normalized || t.command === `/${normalized}`);
}

// ─── AI Fashion Models (Virtual Try-On / IDM-VTON) ───────────────
export const STUDIO_MODELS = [
  {
    id: 'priya_bridal',
    name: 'Priya',
    title: 'Royal Bridal',
    description: 'Royal bridal posture with traditional jewelry and lehenga/saree drape',
    gender: 'female',
    pose: 'standing_royal',
    model_image_url: 'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'ananya_saree',
    name: 'Ananya',
    title: 'Saree & Kurti',
    description: 'Graceful modern Indian model pose for sarees, suits, and daily ethnic wear',
    gender: 'female',
    pose: 'standing_graceful',
    model_image_url: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'meera_festive',
    name: 'Meera',
    title: 'Festive & Gown',
    description: 'Vibrant festive pose for Anarkalis, gowns, and fusion wear',
    gender: 'female',
    pose: 'standing_festive',
    model_image_url: 'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'kabir_menswear',
    name: 'Kabir',
    title: "Men's Ethnic",
    description: 'Dignified male model pose for Kurtas, Sherwanis, and Nehru jackets',
    gender: 'male',
    pose: 'standing_confident',
    model_image_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop&q=80',
  },
] as const;

export type StudioModelId = (typeof STUDIO_MODELS)[number]['id'];

export function getStudioModel(id: string): (typeof STUDIO_MODELS)[number] | undefined {
  return STUDIO_MODELS.find((m) => m.id === id);
}

// ─── Integration Settings (F-012) ──────────────────────────────────
// Canonical catalog of third-party credentials the super admin can manage
// in DB (Integrations section) instead of only via .env. Bootstrap secrets
// that resolve this table (DATABASE_URL, ENCRYPTION_MASTER_KEY,
// SUPABASE_JWT_SECRET, TEAM_JWT_SECRET) are deliberately excluded — see
// docs/SECURITY.md.

export const INTEGRATION_KEYS = [
  {
    key_name: 'FAL_API_KEY',
    category: 'AI',
    label: 'Fal.ai API Key (Flux 1.1 Pro, Flux Schnell, IDM-VTON / CatVTON)',
  },
  {
    key_name: 'BFL_API_KEY',
    category: 'AI',
    label: 'Black Forest Labs Key (FLUX Kontext Pro)',
  },
  {
    key_name: 'ANTHROPIC_API_KEY',
    category: 'AI',
    label: 'Claude API Key (AI tagging + color detection)',
  },
  {
    key_name: 'OPENAI_API_KEY',
    category: 'AI',
    label: 'OpenAI API Key (embeddings + AI tagging failover)',
  },
  {
    key_name: 'GEMINI_API_KEY',
    category: 'AI',
    label: 'Google Gemini / Imagen 3 API Key (AI tagging & Imagen generation)',
  },
  // Generic OpenAI-protocol providers — same key mechanism, used via the
  // Admin → AI Providers registry (provider_type OPENAI_COMPAT + base_url).
  // OpenRouter gives access to 100s of models (Claude, GPT, Gemini, Llama,
  // DeepSeek, ...) behind one key + one credit balance.
  {
    key_name: 'OPENROUTER_API_KEY',
    category: 'AI',
    label: 'OpenRouter API Key (any model, one key)',
  },
  {
    key_name: 'DEEPSEEK_API_KEY',
    category: 'AI',
    label: 'DeepSeek API Key',
  },
  {
    key_name: 'MISTRAL_API_KEY',
    category: 'AI',
    label: 'Mistral API Key',
  },
  {
    key_name: 'GROQ_API_KEY',
    category: 'AI',
    label: 'Groq API Key',
  },
  {
    key_name: 'TOGETHER_API_KEY',
    category: 'AI',
    label: 'Together AI API Key',
  },
  {
    key_name: 'NVIDIA_API_KEY',
    category: 'AI',
    label: 'NVIDIA NIM API Key (free Llama 3.2 Vision fallbacks)',
  },
  { key_name: 'VTONE_API_URL', category: 'AI', label: 'Fashion V-Tone Endpoint URL' },
  { key_name: 'VTONE_SHARED_SECRET', category: 'AI', label: 'Fashion V-Tone Shared Secret' },
  {
    key_name: 'PHOTO_CLEANUP_SERVICE_URL',
    category: 'AI',
    label: 'Photo-Cleanup Sidecar Endpoint URL (torch/SAM2 service)',
  },
  {
    key_name: 'CLEANUP_SHARED_SECRET',
    category: 'AI',
    label: 'Photo-Cleanup Sidecar Shared Secret',
  },
  { key_name: 'RAZORPAY_KEY_ID', category: 'PAYMENT', label: 'Razorpay Key ID' },
  { key_name: 'RAZORPAY_KEY_SECRET', category: 'PAYMENT', label: 'Razorpay Key Secret' },
  { key_name: 'RAZORPAY_WEBHOOK_SECRET', category: 'PAYMENT', label: 'Razorpay Webhook Secret' },
  { key_name: 'R2_ACCESS_KEY_ID', category: 'STORAGE', label: 'Cloudflare R2 Access Key ID' },
  {
    key_name: 'R2_SECRET_ACCESS_KEY',
    category: 'STORAGE',
    label: 'Cloudflare R2 Secret Access Key',
  },
  { key_name: 'R2_BUCKET_NAME', category: 'STORAGE', label: 'Cloudflare R2 Bucket Name' },
  { key_name: 'META_APP_SECRET', category: 'WHATSAPP', label: 'Meta App Secret (WhatsApp API)' },
  { key_name: 'META_VERIFY_TOKEN', category: 'WHATSAPP', label: 'Meta Webhook Verify Token' },
] as const;

export type IntegrationKeyName = (typeof INTEGRATION_KEYS)[number]['key_name'];

// ─── Addon Pricing (F-010 self-serve overage) ──────────────────────
// Each pack gives the retailer additional units of a metered resource.
// Pricing in paise (₹).

export const ADDON_PRICING: Record<
  string,
  { label: string; unit_label: string; pack_size: number; price_paise: number }[]
> = {
  PRODUCT_UPLOAD: [
    { label: 'Extra 100 products', unit_label: 'products', pack_size: 100, price_paise: 9900 },
    { label: 'Extra 500 products', unit_label: 'products', pack_size: 500, price_paise: 39900 },
  ],
  AI_TAGGING_CALL: [
    { label: 'Extra 100 AI tags', unit_label: 'tags', pack_size: 100, price_paise: 14900 },
    { label: 'Extra 500 AI tags', unit_label: 'tags', pack_size: 500, price_paise: 59900 },
  ],
  TRY_ON: [
    { label: 'Extra 10 try-ons', unit_label: 'try-ons', pack_size: 10, price_paise: 9900 },
    { label: 'Extra 50 try-ons', unit_label: 'try-ons', pack_size: 50, price_paise: 39900 },
  ],
  IMAGE_CROP: [
    { label: 'Extra 100 crops', unit_label: 'crops', pack_size: 100, price_paise: 9900 },
  ],
  BG_REMOVAL: [
    { label: 'Extra 100 bg removals', unit_label: 'removals', pack_size: 100, price_paise: 9900 },
  ],
  API_REQUEST: [
    { label: 'Extra 1,000 API calls', unit_label: 'calls', pack_size: 1000, price_paise: 9900 },
  ],
} as const;

// ─── BullMQ Queue Names ───────────────────────────────────────────

export const QUEUES = {
  AI_TAGGING: 'kanchuki-ai-tagging',
  EMBEDDINGS: 'kanchuki-embeddings',
  TRY_ON: 'kanchuki-try-on',
  MEASUREMENT_EXTRACTION: 'kanchuki-measurement-extraction',
  FASHION_DNA: 'kanchuki-fashion-dna',
  SPIN_FRAME_EXTRACTION: 'kanchuki-spin-frame-extraction',
  // F-032 Phase A: AI studio-shoot generation (FLUX Kontext API). Own queue
  // (not MAINTENANCE) — it's a retailer-facing, potentially concurrent hot
  // path, and BFL caps active tasks (24 for kontext-pro / 6 for kontext-max),
  // so a dedicated Worker with bounded concurrency protects that limit.
  STUDIO_SHOOT: 'kanchuki-studio-shoot',
  // Phase II: WhatsApp native catalog sync. Retailer-facing sync jobs.
  CATALOG_SYNC: 'kanchuki-catalog-sync',
  // Cron-only, low-volume jobs share one queue — one Worker dispatches by job.name
  // instead of 4 separate Workers each holding their own duplicated Redis connection.
  MAINTENANCE: 'kanchuki-maintenance',
} as const;

// ─── Collection Slug Config ───────────────────────────────────────

export const COLLECTION_SLUG_LENGTH = 8;
export const COLLECTION_DEFAULT_EXPIRY_DAYS = 30;

// ─── Public Collection Price Buckets (paise) ─────────────────────
// Shared by the public API filter query and the web FilterBar so labels
// and boundaries can't drift between client display and server filtering.

export const PUBLIC_PRICE_BUCKETS = [
  { label: 'Under ₹1000', max: 100_000 },
  { label: '₹1000–2500', min: 100_000, max: 250_000 },
  { label: '₹2500–5000', min: 250_000, max: 500_000 },
  { label: 'Above ₹5000', min: 500_000 },
] as const satisfies { label: string; min?: number; max?: number }[];

// ─── Indian States ────────────────────────────────────────────────

export const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Delhi',
  'Jammu & Kashmir',
  'Ladakh',
] as const;
