import { afterAll, describe, expect, it } from 'vitest';
import { buildCollectionUrl, buildProductUrl, buildStoreUrl } from './store-urls.js';

describe('store-urls builders', () => {
  const OLD_WEB_URL = process.env.WEB_URL;

  afterAll(() => {
    // Assignment-only restore (biome bans `delete process.env.X`); an unset
    // WEB_URL is equivalent to '' for these builders (webBase() ?? '').
    process.env.WEB_URL = OLD_WEB_URL ?? '';
  });

  it('buildProductUrl uses the store scheme when a public_slug exists', () => {
    process.env.WEB_URL = 'https://kanchuki.app';
    expect(buildProductUrl('priya-house-a1b2c3', 'festive-edit', 'prod_42')).toBe(
      'https://kanchuki.app/priya-house-a1b2c3/festive-edit/product/prod_42',
    );
  });

  it('buildProductUrl falls back to the legacy /c/ scheme without a public_slug', () => {
    process.env.WEB_URL = 'https://kanchuki.app';
    expect(buildProductUrl(null, 'festive-edit', 'prod_42')).toBe(
      'https://kanchuki.app/c/festive-edit/product/prod_42',
    );
    expect(buildProductUrl(undefined, 'festive-edit', 'prod_42')).toBe(
      'https://kanchuki.app/c/festive-edit/product/prod_42',
    );
  });

  it('buildProductUrl matches the collection/store URL shape end to end', () => {
    process.env.WEB_URL = 'https://kanchuki.app';
    const storeUrl = buildStoreUrl('priya-house-a1b2c3');
    const collectionUrl = buildCollectionUrl('priya-house-a1b2c3', 'festive-edit');
    const productUrl = buildProductUrl('priya-house-a1b2c3', 'festive-edit', 'prod_42');
    expect(productUrl.startsWith(`${storeUrl}/`)).toBe(true);
    expect(productUrl).toBe(`${collectionUrl}/product/prod_42`);
  });

  it('builds relative fallback URLs when WEB_URL is unset (mirrors existing helpers)', () => {
    process.env.WEB_URL = '';
    expect(buildProductUrl('s', 'c', 'p')).toBe('/s/c/product/p');
    expect(buildProductUrl(null, 'c', 'p')).toBe('/c/c/product/p');
  });
});
