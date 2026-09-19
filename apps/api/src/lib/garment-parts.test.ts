import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunVisionExtract = vi.fn();

vi.mock('@kanchuki/ai', () => ({
  runVisionExtract: mockRunVisionExtract,
}));

const {
  expectedParts,
  readVisibleParts,
  detectGarmentParts,
  missingParts,
  partNoun,
  setCompletenessClause,
  framingClause,
  describeParts,
} = await import('./garment-parts.js');

const READYMADE = { productType: 'Readymade' };

beforeEach(() => {
  mockRunVisionExtract.mockReset();
});

describe('expectedParts — what the product contains', () => {
  it('reads a set from the subtype when the tagger names a bottom', () => {
    const parts = expectedParts({ ...READYMADE, subtype: 'Kurta Set' });
    expect(parts).toMatchObject({ top: true, bottom: true, drape: false, completable: true });
    expect(parts.source).toBe('subtype');
  });

  it('claims a bottom for a "suit" but never invents a dupatta that is not named', () => {
    // A drape is visually dominant — adding one to a set that ships without it
    // is a worse error than omitting it from a set that ships with one.
    const parts = expectedParts({ ...READYMADE, subtype: 'Palazzo Suit' });
    expect(parts.bottom).toBe(true);
    expect(parts.drape).toBe(false);
  });

  it('claims a dupatta only when the subtype names one', () => {
    const parts = expectedParts({ ...READYMADE, subtype: 'Suit with Dupatta' });
    expect(parts).toMatchObject({ bottom: true, drape: true, completable: true });
  });

  it('leaves a kurti sold alone with no bottom to complete', () => {
    const parts = expectedParts({ ...READYMADE, category: 'Kurti', subtype: 'Kurti' });
    expect(parts).toMatchObject({ bottom: false, drape: false, completable: false });
    expect(parts.reason).toMatch(/no separate bottom or drape/);
  });

  it('never completes a top-only product just because the category looks like a set', () => {
    // subtype is the finer signal and wins when both are present.
    const parts = expectedParts({ ...READYMADE, category: 'Ladies Suit', subtype: 'Kurti' });
    expect(parts.bottom).toBe(false);
    expect(parts.completable).toBe(false);
  });

  it('falls back to the category enum when the subtype is null', () => {
    const parts = expectedParts({ ...READYMADE, category: 'Ladies Suit', subtype: null });
    expect(parts).toMatchObject({ bottom: true, completable: true });
    expect(parts.source).toBe('category');
  });

  it('treats a one-piece category as having nothing to complete', () => {
    for (const category of ['Saree', 'Gown', 'Dupatta']) {
      const parts = expectedParts({ ...READYMADE, category, subtype: null });
      expect(parts.completable).toBe(false);
      expect(parts.reason).toMatch(/single-piece/);
    }
  });

  it('refuses to complete an unstitched set — the halves are fabric, not a garment', () => {
    const parts = expectedParts({
      category: 'Ladies Suit',
      subtype: 'Kurta Set',
      productType: 'Unstitched',
    });
    expect(parts.completable).toBe(false);
    expect(parts.reason).toMatch(/only Readymade sets are completed/);
  });

  it('refuses to complete when product_type is missing or N/A', () => {
    for (const productType of [null, '', 'N/A']) {
      const parts = expectedParts({ category: 'Ladies Suit', subtype: 'Kurta Set', productType });
      expect(parts.completable).toBe(false);
    }
  });

  it('refuses to complete when nothing names the garment type', () => {
    const parts = expectedParts({ ...READYMADE, category: 'Other', subtype: null });
    expect(parts).toMatchObject({ completable: false, source: 'unknown' });
    expect(parts.reason).toMatch(/names no garment type/);
  });
});

describe('visible parts — reading the photograph', () => {
  it('parses a complete answer', () => {
    const visible = readVisibleParts({
      framing: 'three-quarter',
      top_visible: true,
      bottom_visible: false,
      drape_visible: true,
      footwear_visible: false,
      garment_type: 'kurta with dupatta, salwar out of frame',
    });
    expect(visible).toMatchObject({
      framing: 'three-quarter',
      top: true,
      bottom: false,
      drape: true,
      footwear: false,
    });
    expect(visible.garmentType).toContain('kurta');
  });

  it('reads a hanger / flat-lay photo as having no person', () => {
    expect(readVisibleParts({ framing: 'full-length', person_present: false }).hasPerson).toBe(
      false,
    );
    expect(readVisibleParts({ framing: 'flat-lay' }).hasPerson).toBe(false);
  });

  it("assumes a person when the answer is silent or unusable (today's behaviour)", () => {
    expect(readVisibleParts({}).hasPerson).toBe(true);
    expect(readVisibleParts({ framing: 'full-length', person_present: 'no' }).hasPerson).toBe(true);
    expect(readVisibleParts({ framing: 'full-length', person_present: true }).hasPerson).toBe(true);
  });

  it('degrades an unrecognised framing value to unknown rather than trusting it', () => {
    expect(readVisibleParts({ framing: 'portrait' }).framing).toBe('unknown');
    expect(readVisibleParts({}).framing).toBe('unknown');
  });

  it('reads absent booleans as "not visible" — the conservative direction', () => {
    const visible = readVisibleParts({ framing: 'full-length' });
    expect(visible).toMatchObject({ top: false, bottom: false, drape: false });
  });

  it('does not treat a truthy string as a visible part', () => {
    // A model that answers "yes" instead of true must not read as visible.
    const visible = readVisibleParts({
      framing: 'full-length',
      top_visible: 'yes',
      bottom_visible: 'true',
      drape_visible: 1,
    });
    expect(visible).toMatchObject({ top: false, bottom: false, drape: false });
  });
});

describe('detectGarmentParts — the provider call', () => {
  it('sends the photograph and asks for the part list', async () => {
    mockRunVisionExtract.mockResolvedValue({
      framing: 'full-length',
      top_visible: true,
      bottom_visible: true,
      drape_visible: true,
    });
    const image = { buffer: Buffer.from('photo-bytes'), mediaType: 'image/jpeg' as const };
    const visible = await detectGarmentParts(image);

    expect(visible?.bottom).toBe(true);
    const req = mockRunVisionExtract.mock.calls[0]?.[0] as {
      images: unknown[];
      schema: { name: string };
      resourceType: string;
    };
    expect(req.images).toHaveLength(1);
    expect(req.schema.name).toBe('garment_parts');
    // Must not be billed as a generation.
    expect(req.resourceType).toBe('AI_ITEM_DETECT');
  });

  it('fails open — a provider outage must not start inventing garments', async () => {
    mockRunVisionExtract.mockRejectedValue(new Error('No AI provider configured'));
    await expect(
      detectGarmentParts({ buffer: Buffer.from('x'), mediaType: 'image/jpeg' }),
    ).resolves.toBeNull();
  });

  it('fails open when the model answers without the fields', async () => {
    mockRunVisionExtract.mockResolvedValue({});
    const visible = await detectGarmentParts({
      buffer: Buffer.from('x'),
      mediaType: 'image/jpeg',
    });
    expect(visible).not.toBeNull();
    expect(visible?.bottom).toBe(false);
  });
});

describe('the difference, as prompt language', () => {
  it('reports the missing bottom on the case that started this', () => {
    // A readymade kurta set photographed from the waist up.
    const expected = expectedParts({ ...READYMADE, subtype: 'Kurta Set' });
    const visible = readVisibleParts({
      framing: 'upper-body',
      top_visible: true,
      bottom_visible: false,
      drape_visible: false,
      garment_type: 'kameez only',
    });
    expect(missingParts(expected, visible)).toEqual(['bottom']);
    // And the framing requirement fires with it — a salwar cannot be visible in
    // an upper-body crop, so completeness and framing are one requirement.
    expect(framingClause(visible.framing)).toMatch(/head to feet/);
  });

  it('reports nothing missing when the photo already shows the whole set', () => {
    const expected = expectedParts({ ...READYMADE, subtype: 'Suit with Dupatta' });
    const visible = readVisibleParts({
      framing: 'full-length',
      top_visible: true,
      bottom_visible: true,
      drape_visible: true,
    });
    expect(missingParts(expected, visible)).toEqual([]);
    expect(setCompletenessClause({ missing: [], subtype: 'Suit with Dupatta' })).toBe('');
    expect(framingClause('full-length')).toBe('');
  });

  it('names the missing piece the way the product data names it', () => {
    expect(partNoun('bottom', 'Churidar Set')).toBe('the churidar');
    expect(partNoun('bottom', 'Sharara Set')).toBe('the sharara');
    expect(partNoun('bottom', 'Kurta Set')).toBe('the matching bottom (salwar or churidar)');
    expect(partNoun('drape')).toBe('the dupatta');
  });

  it('requires the added piece to match the upper garment, not substitute for it', () => {
    const clause = setCompletenessClause({ missing: ['bottom'], subtype: 'Salwar Set' });
    expect(clause).toContain('salwar');
    expect(clause).toMatch(/same fabric, colour, dye, print, embroidery/);
    expect(clause).toMatch(/NOT be a plain, contrasting or generic substitute/);
    // The upper garment must survive the edit — this is the whole point.
    expect(clause).toMatch(/pixel-identical/);
  });

  it('pluralises when both a bottom and a drape are added', () => {
    const clause = setCompletenessClause({ missing: ['bottom', 'drape'], subtype: 'Salwar Suit' });
    expect(clause).toContain('the salwar and the dupatta');
    expect(clause).toContain('are part of this product');
  });

  it('summarises an expectation for logs and the audit script', () => {
    expect(describeParts({ top: true, bottom: true, drape: false })).toBe('top + bottom');
    expect(describeParts({ top: false, bottom: false, drape: false })).toBe('none');
  });
});
