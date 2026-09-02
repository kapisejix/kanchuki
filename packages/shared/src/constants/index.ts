// ─── Plan Limits ──────────────────────────────────────────────────

export const PLAN_LIMITS = {
  STARTER: {
    max_products: 500,
    max_customers: Number.POSITIVE_INFINITY,
    max_collection_links_per_month: 50,
    whatsapp_api: false,
  },
  GROWTH: {
    max_products: 2000,
    max_customers: Number.POSITIVE_INFINITY,
    max_collection_links_per_month: Number.POSITIVE_INFINITY,
    whatsapp_api: false,
  },
  PRO: {
    max_products: Number.POSITIVE_INFINITY,
    max_customers: Number.POSITIVE_INFINITY,
    max_collection_links_per_month: Number.POSITIVE_INFINITY,
    whatsapp_api: true,
  },
} as const;

// ─── Plan Pricing (paise) ─────────────────────────────────────────

export const PLAN_PRICING = {
  STARTER: { monthly: 499900 }, // ₹4,999/mo base (ex-GST); retailer pays base + 18%
  GROWTH: { monthly: 999900 }, // ₹9,999/mo base (ex-GST)
  PRO: { monthly: 1499900 }, // ₹14,999/mo base (ex-GST)
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
  studioStyleThumb: (filename: string) => `admin/studio-styles/${filename}`,
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
  // `token` is a random UUID, not the (sequential, slash-bearing) invoice
  // number — the object key must not be guessable from the invoice series.
  // The real key is stored on subscription_payments.invoice_r2_key and served
  // only via a short-lived presigned URL.
  gstInvoice: (retailerId: string, token: string) =>
    `invoices/subscription/${retailerId}/${token}.pdf`,
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

// ─── Product demographic (derived from the AI-tagged category) ───────
// AI Studio Shoot no longer asks "which model?" — the product's category
// string tells us who wears it, and the scene picker is filtered to the
// scenes that suit that demographic. This is a heuristic keyword match
// (no schema field); ambiguous input falls back to 'womens' (today's
// default). The admin bench lets the tester override it manually.
export const PRODUCT_DEMOGRAPHICS = [
  'womens',
  'mens',
  'teen_girl',
  'teen_boy',
  'kids_girl',
  'kids_boy',
] as const;
export type Demographic = (typeof PRODUCT_DEMOGRAPHICS)[number];

export function demographicForCategory(category?: string | null, name?: string | null): Demographic {
  const s = `${category ?? ''} ${name ?? ''}`.toLowerCase();
  const kid = /\b(kid|kids|kid'?s|child|children|toddler|infant|baby)\b/.test(s) || /\bfrock\b/.test(s);
  const teen = /\b(teen|teens|teenage|teenager|junior)\b/.test(s);
  const girl = /\b(girl|girls|girl'?s)\b/.test(s);
  const boy = /\b(boy|boys|boy'?s)\b/.test(s);
  const mens =
    /\b(men'?s|mens|gents?|male|sherwani|nehru jacket|bandhgala|pathani|menswear|waistcoat)\b/.test(s) ||
    /\bkurta paja?ma\b/.test(s) ||
    /\bkurta pyjama\b/.test(s) ||
    /\bdhoti kurta\b/.test(s);
  const womensHint =
    /\b(women'?s|woman|ladies|lady|saree|sari|lehenga|choli|kurti|anarkali|sharara|salwar|blouse|gown)\b/.test(s);

  if (teen && girl) return 'teen_girl';
  if (teen && boy) return 'teen_boy';
  if (kid && girl) return 'kids_girl';
  if (kid && boy) return 'kids_boy';
  if (kid) return 'kids_boy'; // generic kidswear → boy bucket; tester can switch to girl in the bench
  if (mens && !womensHint) return 'mens';
  return 'womens';
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
