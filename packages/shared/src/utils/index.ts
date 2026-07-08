import { HINDI_TO_ENGLISH } from '../constants/index.js'

// ─── Price Formatting ─────────────────────────────────────────────

/** paise → ₹ display string */
export function formatPrice(paise: number | null | undefined): string {
  if (paise == null) return '—'
  const rupees = paise / 100
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(1)}K`
  return `₹${rupees.toLocaleString('en-IN')}`
}

export function formatPriceRange(
  min: number | null | undefined,
  max: number | null | undefined,
): string {
  if (!min && !max) return 'Price on request'
  if (!max || min === max) return formatPrice(min)
  return `${formatPrice(min)} – ${formatPrice(max)}`
}

/** ₹ rupees → paise integer */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100)
}

/** paise → ₹ float */
export function paiseToRupees(paise: number): number {
  return paise / 100
}

// ─── Search / Query Utils ─────────────────────────────────────────

/** Normalize Hindi/transliterated query terms to English equivalents */
export function normalizeSearchQuery(query: string): string {
  let normalized = query.toLowerCase().trim()
  for (const [hindi, english] of Object.entries(HINDI_TO_ENGLISH)) {
    normalized = normalized.replace(
      new RegExp(`\\b${hindi}\\b`, 'gi'),
      english,
    )
  }
  return normalized
}

/** Extract budget filter from natural language query */
export function extractBudgetFromQuery(query: string): {
  min: number | null
  max: number | null
} {
  const lower = query.toLowerCase()

  // Match "under ₹2500", "below 2500", "less than 2500"
  const underMatch = lower.match(/(?:under|below|less than|upto|up to)\s*[₹rs]?\s*(\d[\d,]*)/i)
  if (underMatch?.[1]) {
    const max = parseInt(underMatch[1].replace(/,/g, ''))
    return { min: null, max: rupeesToPaise(max) }
  }

  // Match "₹1000 to ₹3000", "1000-3000"
  const rangeMatch = lower.match(/[₹rs]?\s*(\d[\d,]*)\s*(?:to|-)\s*[₹rs]?\s*(\d[\d,]*)/i)
  if (rangeMatch?.[1] && rangeMatch[2]) {
    const min = parseInt(rangeMatch[1].replace(/,/g, ''))
    const max = parseInt(rangeMatch[2].replace(/,/g, ''))
    return { min: rupeesToPaise(min), max: rupeesToPaise(max) }
  }

  return { min: null, max: null }
}

// ─── Slug Generation ─────────────────────────────────────────────

/** Generate URL-safe collection slug from title + random suffix */
export function generateCollectionSlug(title: string): string {
  const titlePart = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join('-')

  const random = Math.random().toString(36).slice(2, 6)
  return `${titlePart}-${random}`
}

// ─── WhatsApp Utils ───────────────────────────────────────────────

/** Build WhatsApp deep link for enquiry */
export function buildWhatsAppEnquiryLink(
  retailerPhone: string,
  message: string,
): string {
  const phone = retailerPhone.replace(/\D/g, '')
  const fullPhone = phone.startsWith('91') ? phone : `91${phone}`
  const encoded = encodeURIComponent(message)
  return `https://wa.me/${fullPhone}?text=${encoded}`
}

/** Build pre-filled WhatsApp enquiry message */
export function buildEnquiryMessage(params: {
  shopName: string
  collectionTitle: string
  products: Array<{ name: string | null; price_min: number | null }>
}): string {
  const productList = params.products
    .map((p) => `• ${p.name ?? 'Product'} ${p.price_min ? `- ${formatPrice(p.price_min)}` : ''}`)
    .join('\n')

  return `Namaste! I saw your collection "${params.collectionTitle}" from ${params.shopName}.

I'm interested in:
${productList}

Please share availability and details. 🙏`
}

// ─── Phone Number Utils ───────────────────────────────────────────

export function normalizeIndianPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('91') && digits.length === 12) return digits.slice(2)!
  if (digits.length === 10) return digits
  return digits
}

export function maskPhone(phone: string): string {
  const normalized = normalizeIndianPhone(phone)
  return `****${normalized.slice(-4)}`
}

// ─── Date Utils ───────────────────────────────────────────────────

export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function isExpired(expiresAt: Date | string | null): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

// ─── String Utils ─────────────────────────────────────────────────

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}
