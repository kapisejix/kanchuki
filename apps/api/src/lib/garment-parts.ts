import {
  type AiImageInput,
  type AiJsonSchema,
  fetchImageBuffer,
  runVisionExtract,
} from '@kanchuki/ai';

/**
 * Garment-set completeness.
 *
 * Two different products look identical in a single photograph: a kurti sold
 * alone, and the kameez half of a kurta set whose salwar and dupatta are folded
 * out of frame. Until now both got the same treatment, so a set renders as a top
 * plus whatever bottom the model invents from its training data. That is two
 * complaints with one cause:
 *
 *   * "it auto-added a bottom my product does not have" — which
 *     `isTopOnlyGarment()` suppresses for kurtis, and
 *   * "it only put the kameez on the model, my salwar is missing" — which is the
 *     set case, and is the one we want to *cause* on purpose.
 *
 * The distinction is not visual. It is data: does the PRODUCT include a bottom
 * and a drape? `expectedParts()` answers that from the tagger's row,
 * `detectGarmentParts()` reads what the photograph actually shows, and the
 * clauses turn the difference into prompt language.
 *
 * Fail-open by design. Every failure path returns "nothing to complete", which
 * is exactly today's behaviour. A provider outage must never start inventing
 * garments, and a mistagged row must never lose its existing render.
 */

export type GarmentPartKey = 'top' | 'bottom' | 'drape';

export type Framing = 'full-length' | 'three-quarter' | 'upper-body' | 'flat-lay' | 'unknown';

export interface PartExpectation {
  /** Which parts the finished product contains. */
  top: boolean;
  bottom: boolean;
  drape: boolean;
  /**
   * Whether a missing part may be generated at all. False for unstitched and
   * semi-stitched sets (the halves are fabric lengths, not garments — rendering
   * a stitched salwar from them would depict something the retailer cannot
   * sell), for one-piece garments, and whenever the product data names no type.
   */
  completable: boolean;
  /** Why, for the audit trail and the retailer's explanation. */
  reason: string;
  source: 'subtype' | 'category' | 'unknown';
}

export interface VisibleParts {
  framing: Framing;
  /**
   * Someone is wearing the outfit. False for hanger / flat-lay shots — drives
   * the "put this garment on the model" prompt instead of "edit only the
   * background". Unknown reads as true, i.e. today's behaviour.
   */
  hasPerson: boolean;
  top: boolean;
  bottom: boolean;
  drape: boolean;
  footwear: boolean;
  /** What the model says it is looking at — debugging aid, never parsed back. */
  garmentType: string | null;
}

// ─── Expected parts: what the product contains ──────────────────────────────

/**
 * Only named parts are claimed. "Set"/"Suit" implies a bottom (in Indian retail
 * a suit is never the top alone) but NOT a dupatta — a drape is visually
 * dominant, and inventing one for a set that ships without it is a worse error
 * than omitting it for a set that ships with one.
 */
const SUBTYPE_BOTTOM =
  /\b(salwar|shalwar|churidar|chudidar|palazzo|sharara|gharara|patiala|pajama|payjama|pyjama|dhoti|lehenga|skirt|trouser|pant|capri|bottom|lower)\b/i;
const SUBTYPE_DRAPE = /\b(dupatta|duppatta|dupat|odhni|chunni|stole|shawl|scarf)\b/i;
const SUBTYPE_SET = /\b(set|suit|co-?ord|ensemble)\b/i;

/**
 * The `category` enum from the tagger's schema (packages/ai/src/tagger.ts).
 * `subtype` is free text, so this enum is the only signal that is guaranteed to
 * be one of a known set — but it is coarse, which is why subtype wins when both
 * are present.
 */
const CATEGORY_PARTS: Record<string, { top: boolean; bottom: boolean; drape: boolean }> = {
  'Ladies Suit': { top: true, bottom: true, drape: false },
  'Readymade Suit': { top: true, bottom: true, drape: false },
  Lehenga: { top: true, bottom: true, drape: false },
  "Men's Kurta Pajama": { top: true, bottom: true, drape: false },
  Sherwani: { top: true, bottom: true, drape: false },
  Kurti: { top: true, bottom: false, drape: false },
  Blouse: { top: true, bottom: false, drape: false },
  Saree: { top: false, bottom: false, drape: false },
  Gown: { top: false, bottom: false, drape: false },
  Dupatta: { top: false, bottom: false, drape: false },
};

/** Categories whose product is a single piece or a single component. */
const NO_SEPARATE_PARTS = new Set(['Saree', 'Gown', 'Dupatta', 'Kurti', 'Blouse']);

export function expectedParts(product: {
  category?: string | null;
  subtype?: string | null;
  productType?: string | null;
}): PartExpectation {
  const productType = (product.productType ?? '').trim();
  const subtype = (product.subtype ?? '').trim();
  const category = (product.category ?? '').trim();

  let parts = { top: true, bottom: false, drape: false };
  let source: PartExpectation['source'] = 'unknown';

  if (subtype) {
    source = 'subtype';
    parts = {
      top: true,
      bottom: SUBTYPE_BOTTOM.test(subtype) || SUBTYPE_SET.test(subtype),
      drape: SUBTYPE_DRAPE.test(subtype),
    };
  } else if (category && CATEGORY_PARTS[category]) {
    source = 'category';
    parts = { ...CATEGORY_PARTS[category] };
  }

  const reasons: string[] = [];
  if (source === 'unknown') {
    reasons.push('product data names no garment type — nothing to gate completion on');
  } else if (!parts.bottom && !parts.drape) {
    reasons.push(
      NO_SEPARATE_PARTS.has(category)
        ? 'a single-piece garment — no separate bottom or drape can be missing'
        : 'the product contains no separate bottom or drape',
    );
  }

  // The stitch gate. 'N/A' and an absent value are treated as "not readymade"
  // on purpose: completion is only allowed on a positive signal.
  const isReadymade = productType.toLowerCase() === 'readymade';
  if (reasons.length === 0 && !isReadymade) {
    reasons.push(
      productType
        ? `product_type is "${productType}" — only Readymade sets are completed (an unstitched or semi-stitched half is fabric, not a garment)`
        : 'product_type is not set to Readymade',
    );
  }

  return {
    ...parts,
    completable: reasons.length === 0,
    reason: reasons.length === 0 ? 'readymade set missing at least one part' : reasons.join('; '),
    source,
  };
}

// ─── Visible parts: what the photograph shows ───────────────────────────────

const PART_DETECT_SCHEMA: AiJsonSchema = {
  name: 'garment_parts',
  description:
    'Which pieces of an Indian outfit are actually visible in the photograph, and how the figure is framed.',
  schema: {
    type: 'object',
    properties: {
      framing: {
        type: 'string',
        enum: ['full-length', 'three-quarter', 'upper-body', 'flat-lay', 'unknown'],
        description:
          'How much of the model is in frame: "full-length" = head to feet; "three-quarter" = head to knee/calf; "upper-body" = head to hip or waist; "flat-lay" = the garment laid flat with no model; "unknown" = cannot tell.',
      },
      person_present: {
        type: 'boolean',
        description:
          'A real person (or mannequin torso) is wearing the outfit. Set false for a garment on a hanger, laid flat, folded or on a bare surface with nobody in it.',
      },
      top_visible: {
        type: 'boolean',
        description:
          'An upper garment (kameez, kurta, kurti, choli, blouse, shirt, top) is visible and worn.',
      },
      bottom_visible: {
        type: 'boolean',
        description:
          'A separate lower garment is visible and worn — salwar, churidar, palazzo, sharara, lehenga skirt, pajama, dhoti or trousers. A floor-length kameez that covers the legs is NOT a bottom garment. Set false when only the upper body is in frame.',
      },
      drape_visible: {
        type: 'boolean',
        description:
          'A dupatta, odhni, stole, shawl or scarf is present (worn or held). Set false if absent.',
      },
      footwear_visible: {
        type: 'boolean',
        description: 'The feet or footwear are inside the frame.',
      },
      garment_type: {
        type: 'string',
        description:
          'The outfit as worn, in a few words — e.g. "kurta set with salwar and dupatta", "kurti with palazzo", "saree", "lehenga with choli".',
      },
      notes: {
        type: 'string',
        description: 'Anything ambiguous about what is or is not in frame (one short sentence).',
      },
    },
    required: ['framing', 'top_visible', 'bottom_visible', 'drape_visible'],
  },
};

const FRAMING_VALUES: readonly Framing[] = [
  'full-length',
  'three-quarter',
  'upper-body',
  'flat-lay',
  'unknown',
];

const DETECT_SYSTEM_PROMPT =
  'You inspect product photographs for an Indian clothing retailer and report exactly which pieces of an outfit are visible. Report only what is in the frame: a piece that is out of frame, folded away or not worn must be reported as not visible. A floor-length kameez or gown that covers the legs is NOT a separate bottom garment. Never guess at a piece you cannot see.';

/** The model's structured answer, unvalidated — every field may be absent or wrong. */
export interface RawPartAnswer {
  framing?: unknown;
  person_present?: unknown;
  top_visible?: unknown;
  bottom_visible?: unknown;
  drape_visible?: unknown;
  footwear_visible?: unknown;
  garment_type?: unknown;
}

/**
 * Pure parse of the model's structured answer. Exported so the shape can be
 * pinned by tests without a provider call — an unrecognised framing value or a
 * missing boolean degrades to the conservative reading rather than throwing.
 */
export function readVisibleParts(raw: RawPartAnswer): VisibleParts {
  const framingValue = raw.framing as Framing;
  const framing = FRAMING_VALUES.includes(framingValue) ? framingValue : 'unknown';
  // `=== true` on purpose: a model that answers "yes"/"true"/1 has not told us
  // the part is visible in the way the schema asked, and the conservative
  // reading of an unusable answer is "cannot see it".
  const flag = (value: unknown): boolean => value === true;
  const garmentType = typeof raw.garment_type === 'string' ? raw.garment_type.trim() : '';
  return {
    framing,
    // Opposite polarity to the other flags on purpose: only an explicit
    // "nobody is wearing it" (or a flat-lay framing) switches to the bare-garment
    // prompt, so an unusable answer keeps today's behaviour.
    hasPerson: raw.person_present !== false && framing !== 'flat-lay',
    top: flag(raw.top_visible),
    bottom: flag(raw.bottom_visible),
    drape: flag(raw.drape_visible),
    footwear: flag(raw.footwear_visible),
    garmentType: garmentType ? garmentType.slice(0, 200) : null,
  };
}

/**
 * Reads which pieces of an outfit a photograph shows. Returns null on any
 * failure (no provider, schema error, unusable answer) so the caller keeps
 * today's behaviour instead of completing a set it could not verify.
 */
export async function detectGarmentParts(image: AiImageInput): Promise<VisibleParts | null> {
  try {
    const raw = await runVisionExtract({
      images: [image],
      systemPrompt: DETECT_SYSTEM_PROMPT,
      userPrompt:
        'Is anyone wearing this outfit? Which pieces are visible, and how is the figure framed?',
      maxTokens: 700,
      schema: PART_DETECT_SCHEMA,
      // A model that answers without the tool call means "I could not read this
      // photo" — an empty result, not an outage.
      missingToolUseIsEmpty: true,
      // Same attribution bucket as item detection: this is an analysis pass on a
      // product photo, not a generation, and it must not be billed as a shoot.
      resourceType: 'AI_ITEM_DETECT',
    });
    return readVisibleParts(raw);
  } catch (err) {
    console.error('[garment-parts] visibility check failed — set completion skipped:', err);
    return null;
  }
}

/** URL flavour of {@link detectGarmentParts}; null when the download fails too. */
export async function detectGarmentPartsFromUrl(url: string): Promise<VisibleParts | null> {
  try {
    const buffer = await fetchImageBuffer(url);
    const ext = (url.toLowerCase().split('?')[0] ?? '').split('.').pop();
    const mediaType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    return await detectGarmentParts({ buffer, mediaType });
  } catch (err) {
    console.error('[garment-parts] could not fetch photo for the visibility check:', err);
    return null;
  }
}

// ─── The difference, as prompt language ─────────────────────────────────────

export function missingParts(expected: PartExpectation, visible: VisibleParts): GarmentPartKey[] {
  const missing: GarmentPartKey[] = [];
  if (expected.bottom && !visible.bottom) missing.push('bottom');
  if (expected.drape && !visible.drape) missing.push('drape');
  return missing;
}

const BOTTOM_NOUNS: readonly (readonly [RegExp, string])[] = [
  [/\bsalwar|shalwar\b/i, 'salwar'],
  [/\bchuridar|chudidar\b/i, 'churidar'],
  [/\bpalazzo\b/i, 'palazzo'],
  [/\bsharara\b/i, 'sharara'],
  [/\bgharara\b/i, 'gharara'],
  [/\blehenga\b/i, 'lehenga skirt'],
  [/\bdhoti\b/i, 'dhoti'],
  [/\bpajama|payjama|pyjama\b/i, 'pajama'],
];

/** Names the missing piece the way the product data names it, not generically. */
export function partNoun(part: GarmentPartKey, subtype?: string | null): string {
  const text = subtype ?? '';
  if (part === 'bottom') {
    for (const [re, noun] of BOTTOM_NOUNS) {
      if (re.test(text)) return `the ${noun}`;
    }
    return 'the matching bottom (salwar or churidar)';
  }
  if (part === 'drape') return 'the dupatta';
  return 'the upper garment';
}

/**
 * The instruction that adds a piece the product contains but the photograph
 * does not show. Deliberately explicit about *matching* the upper garment:
 * the model's default for a missing bottom is a plain or contrasting one, which
 * reads as a different product.
 */
export function setCompletenessClause(opts: {
  missing: GarmentPartKey[];
  subtype?: string | null;
}): string {
  if (opts.missing.length === 0) return '';
  const nouns = opts.missing.map((part) => partNoun(part, opts.subtype));
  const list =
    nouns.length === 1
      ? nouns[0]
      : `${nouns.slice(0, -1).join(', ')} and ${nouns[nouns.length - 1]}`;
  const plural = opts.missing.length > 1;

  const pieces = plural ? 'pieces' : 'piece';
  return [
    'This product is a complete stitched set and the photograph shows only part of it.',
    `Dress the model in the FULL outfit by adding ${list}, which ${plural ? 'are' : 'is'} part of this product but out of frame in the input photograph.`,
    `The added ${pieces} must match the upper garment exactly — the same fabric, colour, dye, print, embroidery, border and trim, at the same quality — and must NOT be a plain, contrasting or generic substitute.`,
    'Keep the upper garment itself pixel-identical to the input: do not re-cut, re-colour, re-print or re-drape it.',
    `Dress the added ${pieces} the way the outfit is actually worn (correct length, waist placement, drape and proportion for that garment), with realistic folds and shadow.`,
  ].join(' ');
}

/**
 * A salwar cannot be "visible" if the crop is upper-body, so completeness and
 * framing are one requirement. Empty string when the framing already allows it.
 */
export function framingClause(framing: Framing): string {
  if (framing === 'full-length') return '';
  return 'Use a full-length composition: frame the model from head to feet so the entire outfit — including the hem of the lower garment and the feet — is inside the image.';
}

/** Compact human summary of an expectation, for the audit script and logs. */
export function describeParts(parts: {
  top: boolean;
  bottom: boolean;
  drape: boolean;
}): string {
  const names: string[] = [];
  if (parts.top) names.push('top');
  if (parts.bottom) names.push('bottom');
  if (parts.drape) names.push('drape');
  return names.length > 0 ? names.join(' + ') : 'none';
}
