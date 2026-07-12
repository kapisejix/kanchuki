// ─── Plan Limits ──────────────────────────────────────────────────

export const PLAN_LIMITS = {
  STARTER: {
    max_products: 500,
    max_customers: 200,
    max_collection_links_per_month: 50,
    try_on_credits: 0,
    whatsapp_api: false,
  },
  GROWTH: {
    max_products: 2000,
    max_customers: 1000,
    max_collection_links_per_month: Infinity,
    try_on_credits: 100,
    whatsapp_api: false,
  },
  PRO: {
    max_products: Infinity,
    max_customers: Infinity,
    max_collection_links_per_month: Infinity,
    try_on_credits: 500,
    whatsapp_api: true,
  },
} as const

// ─── Plan Pricing (paise) ─────────────────────────────────────────

export const PLAN_PRICING = {
  STARTER: { monthly: 99900, annual: 999900 },   // ₹999/mo, ₹9999/yr
  GROWTH:  { monthly: 249900, annual: 2499900 },  // ₹2499/mo, ₹24999/yr
  PRO:     { monthly: 499900, annual: 4999900 },  // ₹4999/mo, ₹49999/yr
} as const

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
] as const

// Categories where a retailer can tag separate upper/lower garment photos so
// try-on chains two CatVTON calls instead of masking a whole-outfit photo as
// one region (see packages/ai/src/tryon.ts, PRO-REQUIREMENTS.md F-102).
// Saree is deliberately excluded — it's one continuous drape, not two
// separate garment pieces, so there's no natural upper/lower photo split.
export const PIECE_TAGGABLE_CATEGORIES = [
  'Ladies Suit',
  'Readymade Suit',
  "Men's Kurta Pajama",
  'Lehenga',
] as const

export const PRODUCT_TYPES = [
  'Unstitched',
  'Semi-Stitched',
  'Readymade',
] as const

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
] as const

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
] as const

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
] as const

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
] as const

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
}

// ─── R2 Storage Paths ─────────────────────────────────────────────

export const R2_PATHS = {
  productPhoto: (retailerId: string, productId: string, filename: string) =>
    `retailers/${retailerId}/products/${productId}/${filename}`,
  tryonInput: (jobId: string) => `tryon/${jobId}/input.jpg`,
  tryonResult: (jobId: string) => `tryon/${jobId}/result.jpg`,
  measurementPhoto: (customerId: string, measurementId: string, side: 'front' | 'back') =>
    `measurements/${customerId}/${measurementId}/${side}.jpg`,
} as const

// ─── BullMQ Queue Names ───────────────────────────────────────────

export const QUEUES = {
  AI_TAGGING: 'kanchuki-ai-tagging',
  EMBEDDINGS: 'kanchuki-embeddings',
  TRY_ON: 'kanchuki-try-on',
  CLEANUP: 'kanchuki-cleanup',
  MEASUREMENT_EXTRACTION: 'kanchuki-measurement-extraction',
} as const

// ─── Cache TTLs (seconds) ─────────────────────────────────────────

export const CACHE_TTL = {
  AI_TAG_RESULT: 86400,       // 24h — same image = same tags
  SESSION: 900,               // 15min
  COLLECTION_VIEWS: 300,      // 5min — flush to DB
  RATE_LIMIT_WINDOW: 60,      // 1min
} as const

// ─── Collection Slug Config ───────────────────────────────────────

export const COLLECTION_SLUG_LENGTH = 8
export const COLLECTION_DEFAULT_EXPIRY_DAYS = 30

// ─── Indian States ────────────────────────────────────────────────

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim',
  'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal', 'Delhi', 'Jammu & Kashmir', 'Ladakh',
] as const
