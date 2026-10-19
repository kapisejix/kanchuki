// F-045 PR-9 — find-similar scoring. Weight sits on: the query text is built exactly like the
// stored product vectors, a missing embedding degrades to attribute overlap instead of
// zero, an embedding failure never throws into the feed, and the cache stops per-click
// OpenAI calls.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEmbed, mockQueryRaw } = vi.hoisted(() => ({
  mockEmbed: vi.fn(),
  mockQueryRaw: vi.fn(),
}));

vi.mock('@kanchuki/ai', async (orig) => ({
  ...(await orig<typeof import('@kanchuki/ai')>()),
  generateEmbedding: mockEmbed,
}));
vi.mock('@kanchuki/db', () => ({
  Prisma: { sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }) },
  prisma: { $queryRaw: mockQueryRaw },
}));

import type { GarmentDescriptor } from '@kanchuki/shared';
import {
  __resetSimilarCache,
  attributeScore,
  combineSimilarity,
  descriptorText,
  embedDescriptor,
  embeddingSimilarities,
} from './my-style-similar.js';

const G: GarmentDescriptor = {
  category: 'Kurti',
  product_type: 'Readymade',
  color_family: 'yellow',
  pattern: 'Printed',
  embellishments: ['Zari Work'],
};
const P = {
  category: 'Kurti',
  product_type: 'Readymade',
  color_family: 'yellow',
  pattern: 'Printed',
  embellishments: ['Zari Work'],
};

beforeEach(() => {
  __resetSimilarCache();
  mockEmbed.mockReset().mockResolvedValue([0.1, 0.2]);
  mockQueryRaw.mockReset();
});

describe('descriptorText', () => {
  it('uses the product-embedding text shape: category, type, colour, pattern, work', () => {
    expect(descriptorText(G)).toBe('Kurti Readymade yellow Printed Zari Work');
  });
  it('skips what the descriptor does not state', () => {
    expect(descriptorText({ category: 'Saree', color_family: 'red', embellishments: [] })).toBe(
      'Saree red',
    );
  });
});

describe('attributeScore', () => {
  it('is 1 for a full match and 0 for nothing in common', () => {
    expect(attributeScore(G, P)).toBeCloseTo(1);
    expect(
      attributeScore(G, {
        category: 'Saree',
        product_type: 'Unstitched',
        color_family: 'blue',
        pattern: 'Plain',
        embellishments: [],
      }),
    ).toBe(0);
  });
  it('category and colour matter most', () => {
    const catOnly = attributeScore(G, {
      ...P,
      color_family: 'blue',
      pattern: null,
      embellishments: [],
      product_type: null,
    });
    const colourOnly = attributeScore(G, {
      ...P,
      category: 'Saree',
      pattern: null,
      embellishments: [],
      product_type: null,
    });
    expect(catOnly).toBeGreaterThan(colourOnly);
    expect(colourOnly).toBeGreaterThan(0);
  });
  it('unstated attributes neither help nor hurt', () => {
    const bare: GarmentDescriptor = {
      category: 'Kurti',
      color_family: 'yellow',
      embellishments: [],
    };
    expect(attributeScore(bare, { ...P, pattern: 'Plain', embellishments: [] })).toBeCloseTo(1);
  });
  it('matches case-insensitively and gives partial credit for some of the work', () => {
    const two: GarmentDescriptor = { ...G, embellishments: ['Zari Work', 'Sequin'] };
    const half = attributeScore(two, { ...P, category: 'kurti', embellishments: ['zari work'] });
    expect(half).toBeGreaterThan(0.9);
    expect(half).toBeLessThan(1);
  });
  it('null product fields do not throw', () => {
    expect(
      attributeScore(G, {
        category: null,
        product_type: null,
        color_family: null,
        pattern: null,
        embellishments: [],
      }),
    ).toBe(0);
  });
});

describe('combineSimilarity', () => {
  it('no embedding = attributes alone', () => {
    expect(combineSimilarity(0.7, null)).toBeCloseTo(0.7);
  });
  it('blends embedding and attributes, each clamped to 0..1', () => {
    expect(combineSimilarity(1, 0.9)).toBe(1);
    expect(combineSimilarity(0, 0.1)).toBe(0);
    expect(combineSimilarity(1, 0.1)).toBeCloseTo(0.5);
    expect(combineSimilarity(0, 0.75)).toBeCloseTo(0.5);
  });
  it('a strong embedding lifts a weak attribute match above the same match without one', () => {
    expect(combineSimilarity(0.3, 0.7)).toBeGreaterThan(combineSimilarity(0.3, null) - 0.01);
  });
});

describe('embedDescriptor', () => {
  it('embeds the descriptor text and caches by text', async () => {
    expect(await embedDescriptor(G)).toEqual([0.1, 0.2]);
    expect(await embedDescriptor({ ...G })).toEqual([0.1, 0.2]);
    expect(mockEmbed).toHaveBeenCalledTimes(1);
    expect(mockEmbed).toHaveBeenCalledWith('Kurti Readymade yellow Printed Zari Work');
  });
  it('a different descriptor is a different cache entry', async () => {
    await embedDescriptor(G);
    await embedDescriptor({ ...G, color_family: 'red' });
    expect(mockEmbed).toHaveBeenCalledTimes(2);
  });
  it('returns null (and does not cache) when the provider fails - never throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockEmbed.mockRejectedValueOnce(new Error('no key'));
    expect(await embedDescriptor(G)).toBeNull();
    expect(await embedDescriptor(G)).toEqual([0.1, 0.2]); // the failure was not remembered
  });
});

describe('embeddingSimilarities', () => {
  it('maps product id to cosine; products without a row are simply absent', async () => {
    mockQueryRaw.mockResolvedValue([{ product_id: 'p1', cos: '0.8' }]);
    const m = await embeddingSimilarities([0.1, 0.2], ['p1', 'p2']);
    expect([...m]).toEqual([['p1', 0.8]]);
    const sql = mockQueryRaw.mock.calls[0]?.[0];
    expect(sql.values).toContain('[0.1,0.2]');
    expect(sql.values).toContainEqual(['p1', 'p2']);
  });
  it('no ids = no query', async () => {
    expect((await embeddingSimilarities([0.1], [])).size).toBe(0);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });
});
