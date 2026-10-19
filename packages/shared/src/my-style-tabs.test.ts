import { describe, expect, it } from 'vitest';
import { PRODUCT_OCCASIONS } from './occasions.js';
import { FESTIVAL_OCCASIONS, MY_STYLE_TABS, STYLE_TREND_KINDS } from './my-style-tabs.js';
import { occasionTargets } from './style-quiz.js';

describe('occasionTargets (RC-070)', () => {
  it.each([
    ['Party / Festive', ['party wear', 'festive']],
    ['Wedding / Bridal', ['wedding']],
    ['Office / Formal', ['daily wear']],
    ['  daily wear ', ['daily wear']],
    ['Party Wear', ['party wear']],
    ['Wedding', ['wedding']],
    ['Festive', ['festive']],
  ])('%s -> %j', (label, want) => {
    expect(occasionTargets(label)).toEqual(want);
  });

  it('gives [] for an unknown label instead of throwing', () => {
    expect(occasionTargets('Beach party')).toEqual([]);
    expect(occasionTargets('')).toEqual([]);
  });

  it('every canonical occasion is reachable, so the Occasion tab chips always rank something', () => {
    for (const o of PRODUCT_OCCASIONS) expect(occasionTargets(o)).toEqual([o.toLowerCase()]);
  });
});

describe('tab vocabulary', () => {
  it('festival occasions are real canonical occasions', () => {
    for (const o of FESTIVAL_OCCASIONS) {
      expect(PRODUCT_OCCASIONS.map((p) => p.toLowerCase())).toContain(o);
    }
  });

  it('pins the tab and trend-kind lists the admin and feed share', () => {
    expect([...MY_STYLE_TABS]).toEqual(['foryou', 'festival', 'occasion', 'trending']);
    expect([...STYLE_TREND_KINDS]).toEqual(['trending', 'festival']);
  });
});
