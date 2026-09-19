import { describe, expect, it } from 'vitest';
import {
  CLS,
  HALF,
  PRESETS,
  SAMPLES,
  composePrompt,
  fits,
  poseOrPres,
  recommend,
} from '../studio-effects';

const byCode = (c: string) => {
  const p = PRESETS.find((x) => x.code === c);
  if (!p) throw new Error(`missing preset ${c}`);
  return p;
};

describe('studio effects catalog', () => {
  it('every preset resolves its pose/presentation and has a unique code', () => {
    expect(new Set(PRESETS.map((p) => p.code)).size).toBe(PRESETS.length);
    for (const p of PRESETS) expect(poseOrPres(p.mode, p.po), p.code).toBeDefined();
  });

  it('half-body garments only get half/close frames; full garments never do', () => {
    for (const s of SAMPLES.filter((x) => x.cls !== 'unstitched')) {
      for (const p of PRESETS.filter((x) => x.mode === 'model' && fits(x, s.cls, s.aud))) {
        const half = p.fr === 'half' || p.fr === 'close';
        expect(half, `${s.cls} × ${p.code}`).toBe(HALF.has(s.cls));
      }
    }
  });

  it('unstitched cloth has no model effects but has product effects', () => {
    expect(PRESETS.some((p) => p.mode === 'model' && fits(p, 'unstitched', 'womens'))).toBe(false);
    expect(PRESETS.some((p) => p.mode === 'product' && fits(p, 'unstitched', 'womens'))).toBe(true);
  });

  it('every wearable sample gets model effects and a recommendation', () => {
    for (const s of SAMPLES.filter((x) => x.cls !== 'unstitched')) {
      const pool = PRESETS.filter((p) => p.mode === 'model' && fits(p, s.cls, s.aud));
      expect(pool.length, s.f).toBeGreaterThan(0);
      expect(recommend(pool, s.cls).length, s.f).toBeGreaterThan(0);
    }
  });

  it('kids-only effects never show for adults', () => {
    expect(fits(byCode('M_KIDS_HOME_PLAY'), 'dress', 'womens')).toBe(false);
    expect(fits(byCode('M_KIDS_HOME_PLAY'), 'dress', 'kids_girl')).toBe(true);
  });

  it('prompt carries the half-body guard for tops and not for a saree', () => {
    const top = composePrompt(byCode('M_HALF_STUDIO'), { cls: 'kurti', aud: 'womens' });
    expect(top).toMatch(/Do NOT show legs/);
    expect(top).toMatch(/waist-up only/);
    const saree = composePrompt(byCode('M_MARBLE_LUXURY'), { cls: 'saree', aud: 'womens' });
    expect(saree).not.toMatch(/Do NOT show legs/);
    expect(saree).toContain(CLS.saree.toLowerCase());
  });

  it('overrides change the prompt; senior swaps the model description', () => {
    const p = byCode('M_WHITE_STUDIO');
    expect(composePrompt(p, { cls: 'suit', aud: 'womens', po: 'sitting', li: 'golden' })).toMatch(
      /seated.*golden-hour/,
    );
    expect(composePrompt(p, { cls: 'suit', aud: 'womens', senior: true })).toMatch(/in her 60s/);
  });
});
