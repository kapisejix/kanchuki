import { describe, expect, it } from 'vitest';
import { MY_STYLE_FIT, MY_STYLE_WEIGHTS } from './my-style-weights.js';

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

describe('my-style weights', () => {
  it('score weights sum to 1', () => {
    expect(sum(MY_STYLE_WEIGHTS)).toBeCloseTo(1, 10);
  });

  it('fit parts sum to 1 so a perfect match can reach 1', () => {
    expect(sum(MY_STYLE_FIT)).toBeCloseTo(1, 10);
  });

  it('palette avoid is able to push a neutral product below the floor', () => {
    expect(MY_STYLE_FIT.base - MY_STYLE_FIT.palette).toBeLessThan(0);
  });
});
