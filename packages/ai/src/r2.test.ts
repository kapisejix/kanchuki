import { describe, expect, it } from 'vitest';
import { summarizeR2Objects } from './r2.js';

// Contract: roll a bucket listing into the same totals scripts/measure-r2-storage.ts
// prints — total/object count, image-vs-other split, per-prefix breakdown sorted
// largest-first, with a safe image_pct when the bucket is empty.

describe('summarizeR2Objects', () => {
  it('rolls up totals, image split, and per-prefix breakdown', () => {
    const m = summarizeR2Objects(
      [
        { key: 'retailers/r1/products/p1.jpg', size: 100_000 }, // image
        { key: 'retailers/r1/products/p2.png', size: 200_000 }, // image
        { key: 'retailers/r1/products/p3.webp', size: 50_000 }, // image
        { key: 'retailers/r2/logo.svg', size: 5_000 }, // not image-format
        { key: 'backups/db.sql.gz', size: 1_000_000 }, // other prefix
      ],
      'kanchuki-prod',
    );

    expect(m.bucket).toBe('kanchuki-prod');
    expect(m.total_objects).toBe(5);
    expect(m.total_bytes).toBe(1_355_000);
    expect(m.image_objects).toBe(3);
    expect(m.image_bytes).toBe(350_000);
    expect(m.image_pct).toBeCloseTo(25.83, 1);
    // largest prefix first
    expect(m.by_prefix.map((p) => p.prefix)).toEqual(['backups', 'retailers']);
    const retailers = m.by_prefix.find((p) => p.prefix === 'retailers')!;
    expect(retailers).toEqual({
      prefix: 'retailers',
      count: 4,
      bytes: 355_000,
      image_bytes: 350_000,
    });
  });

  it('keeps root-level keys as their own prefix (script-consistent) and counts uppercase image exts', () => {
    const m = summarizeR2Objects(
      [
        { key: 'og-image.PNG', size: 10_000 },
        { key: 'favicon.ico', size: 1_000 },
      ],
      'b',
    );

    // mirrors scripts/measure-r2-storage.ts: key.split('/')[0], so a key with
    // no slash reports itself as the prefix, largest first
    expect(m.by_prefix).toEqual([
      { prefix: 'og-image.PNG', count: 1, bytes: 10_000, image_bytes: 10_000 },
      { prefix: 'favicon.ico', count: 1, bytes: 1_000, image_bytes: 0 },
    ]);
    expect(m.image_objects).toBe(1); // .PNG uppercase still counts
  });

  it('handles an empty listing (image_pct = 0, no prefix rows)', () => {
    const m = summarizeR2Objects([], 'b');

    expect(m.total_objects).toBe(0);
    expect(m.total_bytes).toBe(0);
    expect(m.image_objects).toBe(0);
    expect(m.image_pct).toBe(0);
    expect(m.by_prefix).toEqual([]);
  });
});
