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

export const FABRIC_TYPES = [
  'Cotton',
  'Silk',
  'Georgette',
  'Chiffon',
  'Chanderi',
  'Crepe',
  'Rayon',
  'Modal',
  'Net',
  'Organza',
  'Linen',
  'Cotton-Silk Blend',
  'Cotton-Poly Blend',
  'Satin',
] as const;

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

export const SIZE_OPTIONS = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'] as const;

export const OCCASION_TYPES = [
  'Casual',
  'Office Wear',
  'Party Wear',
  'Wedding',
  'Festive',
  'Sangeet',
  'Mehendi',
  'Pooja',
  'Daily Wear',
  'Special Occasion',
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

/** Resolve a retailer-entered color name to a hex swatch, falling back to
 * neutral grey for anything unmapped rather than rendering invisible/black. */
export function resolveFashionColor(name: string): string {
  const key = name.trim().toLowerCase();
  return FASHION_COLOR_ALIASES[key] ?? '#d1d5db';
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
  spinFrame: (retailerId: string, productId: string, frameIndex: number) =>
    `retailers/${retailerId}/products/${productId}/spin/frame-${frameIndex}.jpg`,
  backgroundImage: (filename: string) => `admin/background-images/${filename}`,
  categoryImage: (retailerId: string, filename: string) =>
    `retailers/${retailerId}/categories/${filename}`,
  retailerBanner: (retailerId: string, filename: string) =>
    `retailers/${retailerId}/banner/${filename}`,
  ghostMannequin: (retailerId: string, productId: string) =>
    `retailers/${retailerId}/products/${productId}/ghost-mannequin.jpg`,
} as const;

// ─── Integration Settings (F-012) ──────────────────────────────────
// Canonical catalog of third-party credentials the super admin can manage
// in DB (Integrations section) instead of only via .env. Bootstrap secrets
// that resolve this table (DATABASE_URL, ENCRYPTION_MASTER_KEY,
// SUPABASE_JWT_SECRET, TEAM_JWT_SECRET) are deliberately excluded — see
// docs/SECURITY.md.

export const INTEGRATION_KEYS = [
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
    label: 'Google Gemini API Key (AI tagging failover)',
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
  { key_name: 'SNAPPYIT_API_KEY', category: 'AI', label: 'Snappyit API Key (ghost mannequin generation)' },
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
  CLEANUP: 'kanchuki-cleanup',
  ORDER_EXPIRY: 'kanchuki-order-expiry',
  MEASUREMENT_EXTRACTION: 'kanchuki-measurement-extraction',
  FASHION_DNA: 'kanchuki-fashion-dna',
  SPIN_FRAME_EXTRACTION: 'kanchuki-spin-frame-extraction',
  DATABASE_BACKUP: 'kanchuki-database-backup',
  GHOST_MANNEQUIN: 'kanchuki-ghost-mannequin',
  PURGE_SOFT_DELETED: 'kanchuki-purge-soft-deleted',
} as const;

// ─── Cache TTLs (seconds) ─────────────────────────────────────────

export const CACHE_TTL = {
  AI_TAG_RESULT: 86400, // 24h — same image = same tags
  SESSION: 900, // 15min
  COLLECTION_VIEWS: 300, // 5min — flush to DB
  RATE_LIMIT_WINDOW: 60, // 1min
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
