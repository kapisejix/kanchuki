import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCountProduct = vi.fn();

vi.mock('@kanchuki/db', () => ({
  prisma: {
    product: { count: mockCountProduct },
  },
}));

const { skuPrefix, generateSku, withUniqueSku, createSkuSequencer } = await import('./sku.js');

beforeEach(() => {
  mockCountProduct.mockReset().mockResolvedValue(0);
});

describe('skuPrefix', () => {
  it('takes first letters of up to 2 words', () => {
    expect(skuPrefix('Lehenga Skirt')).toBe('LS');
    expect(skuPrefix('Kurta')).toBe('KP'); // single word: 1 letter + PR fallback, sliced to 2
    expect(skuPrefix('Suit with Dupatta')).toBe('SW');
  });

  it('falls back to PR for null/empty input', () => {
    expect(skuPrefix(null)).toBe('PR');
    expect(skuPrefix('')).toBe('PR');
  });
});

describe('generateSku', () => {
  it('zero-pads the sequence based on existing count', async () => {
    mockCountProduct.mockResolvedValue(3);
    expect(await generateSku('retailer_1', 'Kurta')).toBe('KP0004');
  });

  it('shifts the sequence forward by `attempt`', async () => {
    mockCountProduct.mockResolvedValue(0);
    expect(await generateSku('retailer_1', 'Kurta', 2)).toBe('KP0003');
  });
});

describe('withUniqueSku', () => {
  it('returns the result on first success, no retry', async () => {
    mockCountProduct.mockResolvedValue(0);
    const apply = vi.fn().mockResolvedValue('ok');

    const result = await withUniqueSku('retailer_1', 'Kurta', apply);

    expect(result).toBe('ok');
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith('KP0001');
  });

  it('retries with an incremented sequence on a P2002 collision', async () => {
    mockCountProduct.mockResolvedValue(0);
    const apply = vi.fn().mockRejectedValueOnce({ code: 'P2002' }).mockResolvedValueOnce('ok');

    const result = await withUniqueSku('retailer_1', 'Kurta', apply);

    expect(result).toBe('ok');
    expect(apply).toHaveBeenNthCalledWith(1, 'KP0001');
    expect(apply).toHaveBeenNthCalledWith(2, 'KP0002');
  });

  it('rethrows a non-collision error immediately without retrying', async () => {
    mockCountProduct.mockResolvedValue(0);
    const apply = vi.fn().mockRejectedValue(new Error('db down'));

    await expect(withUniqueSku('retailer_1', 'Kurta', apply)).rejects.toThrow('db down');
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('gives up after MAX_SKU_ATTEMPTS collisions', async () => {
    mockCountProduct.mockResolvedValue(0);
    const apply = vi.fn().mockRejectedValue({ code: 'P2002' });

    await expect(withUniqueSku('retailer_1', 'Kurta', apply)).rejects.toMatchObject({
      code: 'P2002',
    });
    expect(apply).toHaveBeenCalledTimes(5);
  });
});

describe('createSkuSequencer', () => {
  it('increments sequentially within one batch without re-querying per item', async () => {
    mockCountProduct.mockResolvedValue(0);
    const next = createSkuSequencer('retailer_1');

    expect(await next('Kurta')).toBe('KP0001');
    expect(await next('Kurta')).toBe('KP0002');
    expect(await next('Kurta')).toBe('KP0003');
    expect(mockCountProduct).toHaveBeenCalledTimes(1);
  });

  it('tracks separate sequences per prefix', async () => {
    mockCountProduct.mockResolvedValue(0);
    const next = createSkuSequencer('retailer_1');

    expect(await next('Kurta')).toBe('KP0001');
    expect(await next('Lehenga Skirt')).toBe('LS0001');
    expect(await next('Kurta')).toBe('KP0002');
  });
});
