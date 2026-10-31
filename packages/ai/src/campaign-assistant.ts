import { type ProviderUsedInfo, type VisionAskRequest, runVisionAsk } from './providers.js';
import type { AiJsonSchema } from './providers.js';

/** The `ask()` (free-text) path has no schema enforcement, so providers
 * routinely wrap their JSON in a ```json … ``` fence. Strip the fence before
 * JSON.parse so callers get structured data instead of the raw fenced string
 * leaking into a caption/message.
 * ponytail: fence-strip only — real structured output would need the
 * schema-backed extract() path. */
function parseJsonLoose<T>(raw: string): T {
  let s = raw.trim();
  const fenced = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) s = fenced[1].trim();
  return JSON.parse(s) as T;
}

// ─── Types ────────────────────────────────────────────────────────────

export interface ProductCriteria {
  category?: string;
  colors?: string[];
  styles?: string[];
  fabrics?: string[];
  max_price_paise?: number;
  min_price_paise?: number;
  limit?: number;
}

export interface AudienceFilters {
  all?: boolean;
  colors?: string[];
  styles?: string[];
  fabrics?: string[];
  min_total_spent_paise?: number;
  max_budget_paise?: number;
  inactive_days?: number;
  never_purchased?: boolean;
  sources?: ('MANUAL' | 'QR_SCAN' | 'STORE_SCAN' | 'REFERRAL' | 'CAMPAIGN')[];
}

export interface CampaignIntent {
  campaign_type: 'FESTIVAL' | 'REACTIVATION' | 'PROMOTION';
  name: string;
  festival_id: number | null;
  audience: AudienceFilters;
  product_criteria: ProductCriteria;
  message_tone: 'formal' | 'casual' | 'urgent' | 'festive';
  schedule_hint: string | null;
}

export interface SuggestedProduct {
  id: string;
  name: string | null;
  category: string | null;
  primary_color: string | null;
  price_min: number | null;
}

export interface CampaignDraft {
  name: string;
  type: CampaignIntent['campaign_type'];
  festival_id: number | null;
  message_template: string;
  audience: AudienceFilters;
  product_ids: string[];
  schedule_hint: string | null;
  rationale: string;
  matched_products: SuggestedProduct[];
  audience_estimate_note: string;
}

// ─── Prompts ──────────────────────────────────────────────────────────

const PARSE_SYSTEM = `You are a marketing assistant for an Indian small clothing retailer. Your job is to understand a retailer's natural-language request and turn it into structured campaign filters.

Rules:
- Convert Indian rupee amounts to paise (₹2000 = 200000).
- "premium" / "VIP" customers = min_total_spent_paise >= 200000 (₹2000).
- "regular" customers = below that threshold.
- "new arrivals" / "just landed" = no specific product filter needed unless the prompt mentions a category.
- If the retailer mentions a specific category (saree, kurti, lehenga, suit, etc.), put it in product_criteria.category.
- If colours, styles, or fabrics are mentioned, capture them in both audience and product_criteria where relevant.
- For REACTIVATION campaigns, set inactive_days (default 60 if not specified).
- For FESTIVAL campaigns, try to infer the festival from context. If unknown, leave festival_id null and set campaign_type to FESTIVAL anyway.
- Always return a short, actionable campaign name.
- Never invent filters that aren't supported — keep arrays empty instead.`;

const PARSE_USER = (prompt: string): string =>
  `Parse this retailer request:\n\n"${prompt}"\n\nReturn structured intent.`;

const MESSAGE_SYSTEM = `You are a WhatsApp marketing copywriter for an Indian clothing store. Write short, warm, sales-friendly messages. Keep them under 1600 characters so they fit comfortably in a WhatsApp bubble. Use the retailer's tone preference.`;

const MESSAGE_USER = (intent: CampaignIntent, products: SuggestedProduct[]): string => {
  const productSummary = products
    .slice(0, 12)
    .map(
      (p) =>
        `- ${p.name ?? p.category ?? 'Product'} ${p.primary_color ? `(${p.primary_color})` : ''}${p.price_min ? ` · ₹${(p.price_min / 100).toFixed(0)}` : ''}`,
    )
    .join('\n');

  const audienceSummary =
    [
      intent.audience.all ? 'all consented customers' : '',
      intent.audience.colors?.length ? `prefers ${intent.audience.colors.join(', ')}` : '',
      intent.audience.styles?.length ? `likes ${intent.audience.styles.join(', ')}` : '',
      intent.audience.fabrics?.length ? `likes ${intent.audience.fabrics.join(', ')}` : '',
      intent.audience.min_total_spent_paise
        ? `lifetime spend >= ₹${(intent.audience.min_total_spent_paise / 100).toFixed(0)}`
        : '',
      intent.audience.inactive_days ? `inactive for ${intent.audience.inactive_days} days` : '',
      intent.audience.never_purchased ? 'never purchased' : '',
    ]
      .filter(Boolean)
      .join('; ') || 'broad audience';

  return `Generate a WhatsApp message template for this campaign.

Campaign name: ${intent.name}
Type: ${intent.campaign_type}
Tone: ${intent.message_tone}
Audience: ${audienceSummary}
Schedule hint: ${intent.schedule_hint ?? 'anytime'}

Available products in this campaign:
${productSummary || 'No specific products — make it a general brand message.'}

Requirements:
- Use {{name}}, {{shop}}, {{link}} placeholders where appropriate.
- If it's a festival campaign, use {{festival}}.
- If it's a promotion, use {{offer}}.
- Keep it under 1600 characters.
- No marketing fluff like "stunning" or "must-have".
- Make it sound like a real Indian retailer on WhatsApp.`;
};

// ─── Public API ───────────────────────────────────────────────────────

// ─── Social post caption (Create Post Composer, R-9 / T-6.1) ────────

export interface SocialCaptionInput {
  productNames: string[];
  category?: string;
  priceRange?: string; // e.g. "₹1,999" or "₹999 – ₹2,499"
  storeName?: string;
  festival?: string;
  postType: 'SINGLE_PRODUCT' | 'CAROUSEL' | 'COLLECTION_LINK';
  // Optional usage hook (F-023) — fired with the real serving provider.
  onProviderUsed?: (info: ProviderUsedInfo) => void;
}

export interface SocialCaptionResult {
  caption: string;
  hashtags: string[];
}

const CAPTION_SYSTEM = `You are a social media copywriter for an Indian small clothing store. You write Instagram and Facebook captions that feel real, warm, and sales-friendly — never corporate, never fluff words like "stunning" or "must-have".

Rules:
- 2–3 short lines, under 1800 characters total.
- Mention the product(s) concretely (name, colour, category) and the price.
- If a festival was provided, weave it in naturally (e.g. "Diwali ready ✨").
- Never use placeholders like {{name}} or {price} — write actual text.
- End with an invitation to shop (visit the store / DM / WhatsApp).
- 5–8 hashtags, relevant to Indian fashion (e.g. #indianfashion #festivewear).`;

const CAPTION_USER = (input: SocialCaptionInput): string => `Write a social post caption for:

Post type: ${input.postType === 'COLLECTION_LINK' ? 'a collection link post (no product media)' : input.postType === 'CAROUSEL' ? 'a carousel of products' : 'a single product'}
Products: ${input.productNames.join(', ') || 'not specified'}
${input.category ? `Category: ${input.category}\n` : ''}${input.priceRange ? `Price: ${input.priceRange}\n` : ''}${input.festival ? `Occasion: ${input.festival}\n` : ''}${input.storeName ? `Store: ${input.storeName}\n` : ''}

Return structured JSON with caption + hashtags.`;

export async function generateSocialPostCaption(
  input: SocialCaptionInput,
): Promise<SocialCaptionResult> {
  const req: VisionAskRequest = {
    images: [],
    systemPrompt: CAPTION_SYSTEM,
    userPrompt: CAPTION_USER(input),
    maxTokens: 1024,
    resourceType: 'AI_TAGGING_CALL',
    ...(input.onProviderUsed ? { onProviderUsed: input.onProviderUsed } : {}),
  };

  const raw = await runVisionAsk(req);
  const cleaned = raw.trim();

  try {
    const parsed = parseJsonLoose<{
      caption?: unknown;
      hashtags?: unknown;
    }>(cleaned);
    if (typeof parsed.caption === 'string' && parsed.caption.trim()) {
      // Models sometimes return hashtags as one space-joined string instead
      // of an array — accept both.
      const hashtags = Array.isArray(parsed.hashtags)
        ? parsed.hashtags.filter((h): h is string => typeof h === 'string').slice(0, 8)
        : typeof parsed.hashtags === 'string'
          ? parsed.hashtags.split(/\s+/).filter(Boolean).slice(0, 8)
          : [];
      return { caption: parsed.caption.trim(), hashtags };
    }
  } catch {
    // fall through to raw-text fallback
  }

  // Fallback: wrap raw text as the caption if JSON parsing fails (same
  // fail-open pattern as generateCampaignMessage).
  return { caption: cleaned.slice(0, 1800), hashtags: [] };
}

// ─── Intent normalization ──────────────────────────────────────────────
// parseCampaignIntent uses the free-text `ask()` path — no schema enforcement —
// so models return shapes the DB route cannot safely dereference: missing
// product_criteria/audience objects, nested JSON strings, enums outside the
// union, numbers as strings, comma-joined arrays. Every one of those used to
// crash POST /v1/growth/ai-campaign with an unhandled 500 ("Failed to
// generate campaign" on the AI Campaign Assistant screen). Normalize
// everything here so the route always receives a well-typed CampaignIntent.

function asTrimmedString(v: unknown): string | undefined {
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length > 0 ? t : undefined;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (v == null) return undefined;
  // Model may return one comma-joined string instead of an array.
  if (typeof v === 'string') {
    const parts = v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts : undefined;
  }
  if (Array.isArray(v)) {
    const parts = v.map((item) => asTrimmedString(item)).filter((s): s is string => s != null);
    return parts.length > 0 ? parts : undefined;
  }
  return undefined;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(/[₹,\s]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Possibly-stringified nested object (models love "product_criteria": "{...}"). */
function asJsonObject(v: unknown): Record<string, unknown> | undefined {
  if (v == null) return undefined;
  if (typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === 'string' && v.trim().startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(v);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // fell out of the fence — treat as absent
    }
  }
  return undefined;
}

const CAMPAIGN_TYPES = ['FESTIVAL', 'REACTIVATION', 'PROMOTION'] as const;
const MESSAGE_TONES = ['formal', 'casual', 'urgent', 'festive'] as const;
const AUDIENCE_SOURCES = ['MANUAL', 'QR_SCAN', 'STORE_SCAN', 'REFERRAL', 'CAMPAIGN'] as const;

/**
 * Coerce an arbitrary AI response into a valid CampaignIntent.
 * Never throws for shape problems — missing/invalid fields become safe
 * defaults so the route can always build a draft the retailer can edit.
 */
export function normalizeCampaignIntent(raw: unknown): CampaignIntent {
  const obj = asJsonObject(raw);
  if (!obj) throw new Error('AI returned unparseable campaign intent');

  // Nested stringified objects are re-parsed before field reads.
  const audienceRaw = asJsonObject(obj.audience);
  const criteriaRaw = asJsonObject(obj.product_criteria);

  const rawType = asTrimmedString(obj.campaign_type)?.toUpperCase() ?? '';
  const campaignType = (CAMPAIGN_TYPES as readonly string[]).includes(rawType)
    ? (rawType as CampaignIntent['campaign_type'])
    : 'PROMOTION';

  const rawTone = asTrimmedString(obj.message_tone)?.toLowerCase() ?? '';
  const tone = (MESSAGE_TONES as readonly string[]).includes(rawTone)
    ? (rawTone as CampaignIntent['message_tone'])
    : 'casual';

  const name = asTrimmedString(obj.name)?.slice(0, 120) ?? 'AI campaign';

  // festival_id may arrive as a number, numeric string, or null.
  const festivalIdNum = asNumber(obj.festival_id);

  const scheduleHint = asTrimmedString(obj.schedule_hint) ?? null;

  // Audience filters — only keep well-formed values.
  const audience: AudienceFilters = {};
  if (audienceRaw) {
    if (audienceRaw.all === true) audience.all = true;
    const colors = asStringArray(audienceRaw.colors);
    if (colors) audience.colors = colors;
    const styles = asStringArray(audienceRaw.styles);
    if (styles) audience.styles = styles;
    const fabrics = asStringArray(audienceRaw.fabrics);
    if (fabrics) audience.fabrics = fabrics;
    const minSpent = asNumber(audienceRaw.min_total_spent_paise);
    if (minSpent != null && minSpent >= 0) audience.min_total_spent_paise = Math.round(minSpent);
    const maxBudget = asNumber(audienceRaw.max_budget_paise);
    if (maxBudget != null && maxBudget >= 0) audience.max_budget_paise = Math.round(maxBudget);
    const inactive = asNumber(audienceRaw.inactive_days);
    if (inactive != null && inactive >= 1)
      audience.inactive_days = Math.min(Math.round(inactive), 3650);
    if (audienceRaw.never_purchased === true) audience.never_purchased = true;
    const sources = asStringArray(audienceRaw.sources);
    if (sources) {
      const valid = sources.filter((s): s is (typeof AUDIENCE_SOURCES)[number] =>
        (AUDIENCE_SOURCES as readonly string[]).includes(s),
      );
      if (valid.length > 0) {
        audience.sources = valid;
      }
    }
  }

  // Product criteria — same treatment, plus bounded limit.
  const criteria: ProductCriteria = {};
  if (criteriaRaw) {
    const category = asTrimmedString(criteriaRaw.category);
    if (category) criteria.category = category.slice(0, 100);
    const colors = asStringArray(criteriaRaw.colors);
    if (colors) criteria.colors = colors;
    const styles = asStringArray(criteriaRaw.styles);
    if (styles) criteria.styles = styles;
    const fabrics = asStringArray(criteriaRaw.fabrics);
    if (fabrics) criteria.fabrics = fabrics;
    const maxPrice = asNumber(criteriaRaw.max_price_paise);
    if (maxPrice != null && maxPrice >= 0) criteria.max_price_paise = Math.round(maxPrice);
    const minPrice = asNumber(criteriaRaw.min_price_paise);
    if (minPrice != null && minPrice >= 0) criteria.min_price_paise = Math.round(minPrice);
    const limit = asNumber(criteriaRaw.limit);
    if (limit != null && limit >= 1) criteria.limit = Math.min(Math.round(limit), 20);
  }

  return {
    campaign_type: campaignType,
    name,
    festival_id: festivalIdNum != null && Number.isInteger(festivalIdNum) ? festivalIdNum : null,
    audience,
    product_criteria: criteria,
    message_tone: tone,
    schedule_hint: scheduleHint,
  };
}

export async function parseCampaignIntent(
  prompt: string,
  opts?: { onProviderUsed?: (info: ProviderUsedInfo) => void },
): Promise<CampaignIntent> {
  const req: VisionAskRequest = {
    images: [],
    systemPrompt: PARSE_SYSTEM,
    userPrompt: PARSE_USER(prompt),
    maxTokens: 1024,
    resourceType: 'AI_TAGGING_CALL',
    ...(opts?.onProviderUsed ? { onProviderUsed: opts.onProviderUsed } : {}),
  };

  const raw = await runVisionAsk(req);
  const cleaned = raw.trim();

  try {
    return normalizeCampaignIntent(parseJsonLoose<unknown>(cleaned));
  } catch {
    throw new Error('AI returned unparseable campaign intent');
  }
}

export async function generateCampaignMessage(
  intent: CampaignIntent,
  products: SuggestedProduct[],
  opts?: { onProviderUsed?: (info: ProviderUsedInfo) => void },
): Promise<{ message_template: string; rationale: string; audience_estimate_note: string }> {
  const req: VisionAskRequest = {
    images: [],
    systemPrompt: MESSAGE_SYSTEM,
    userPrompt: MESSAGE_USER(intent, products),
    maxTokens: 512,
    resourceType: 'AI_TAGGING_CALL',
    ...(opts?.onProviderUsed ? { onProviderUsed: opts.onProviderUsed } : {}),
  };

  const raw = await runVisionAsk(req);
  const cleaned = raw.trim();

  try {
    const parsed = parseJsonLoose<{
      message_template: string;
      rationale: string;
      audience_estimate_note: string;
    }>(cleaned);
    if (!parsed.message_template) throw new Error('Missing message_template');
    return parsed;
  } catch {
    // Fallback: wrap raw text as the template if JSON parsing fails
    return {
      message_template: cleaned.slice(0, 2000),
      rationale: 'AI-generated message',
      audience_estimate_note: '',
    };
  }
}
