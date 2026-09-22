import { STUDIO_ENGINES, STUDIO_ENGINE_INFO, studioEngineCost } from '@kanchuki/shared';
import { describe, expect, it } from 'vitest';
import {
  BENCH_POSES,
  BENCH_SCENES,
  SCENE,
  audFor,
  benchPoseChoices,
  composeBenchPrompt,
  pickPose,
} from '../studio-effects';

// Every rand value a caller could produce, so a filter hole cannot hide.
const SWEEP = Array.from({ length: 100 }, (_, i) => i / 100);

describe('auto pose', () => {
  it('never offers a dupatta pose when the garment has no dupatta', () => {
    for (const r of SWEEP) {
      expect(['hold_dupatta', 'dupatta_flow']).not.toContain(pickPose('suit', false, () => r));
    }
  });

  it('offers dupatta poses when there is a dupatta', () => {
    expect(benchPoseChoices('suit', true)).toEqual(expect.arrayContaining(['hold_dupatta', 'dupatta_flow']));
  });

  it('never shows a stride, a seat or a flare for a half-body garment', () => {
    for (const r of SWEEP) {
      expect(['walking', 'sitting', 'twirl']).not.toContain(pickPose('kurti', true, () => r));
    }
  });

  it('only ever picks from the owner-approved list', () => {
    for (const r of SWEEP) expect(BENCH_POSES).toContain(pickPose('lehenga', true, () => r));
  });

  it('is deterministic for a given random value', () => {
    expect(pickPose('suit', true, () => 0)).toBe(pickPose('suit', true, () => 0));
  });
});

describe('gender + age bucket', () => {
  it.each([
    ['female', 'kid', 'kids_girl', false],
    ['male', 'kid', 'kids_boy', false],
    ['female', 'teen', 'teen_girl', false],
    ['male', 'teen', 'teen_boy', false],
    ['female', 'adult', 'womens', false],
    ['male', 'adult', 'mens', false],
    ['female', 'senior', 'womens', true],
    ['male', 'senior', 'mens', true],
  ] as const)('%s %s → %s (senior=%s)', (gender, age, aud, senior) => {
    expect(audFor(gender, age)).toEqual({ aud, senior });
  });
});

describe('bench scenes and prompt', () => {
  it('has the 17 indoor scenes and every one resolves in SCENE', () => {
    expect(BENCH_SCENES).toHaveLength(17);
    for (const s of BENCH_SCENES) expect(SCENE[s.id][1]).toBe('indoor');
  });

  it('names scene, pose, person and the garment-preservation guard', () => {
    const p = composeBenchPrompt({
      scene: 'penthouse',
      pose: 'twirl',
      cls: 'lehenga',
      gender: 'female',
      age: 'adult',
    });
    expect(p).toContain('penthouse');
    expect(p).toContain('twirl');
    expect(p).toContain('woman');
    expect(p).toContain('100% preserved');
  });

  it('writes an older model for the senior bucket', () => {
    const p = composeBenchPrompt({
      scene: 'hotel',
      pose: 'standing',
      cls: 'saree',
      gender: 'female',
      age: 'senior',
    });
    expect(p).toContain('60s');
  });
});

describe('bench light + shot', () => {
  const base = { scene: 'showroom', pose: 'standing', gender: 'female', age: 'adult' } as const;
  it('writes light and shot into the prompt, indoors', () => {
    const p = composeBenchPrompt({ ...base, cls: 'suit', light: 'window', shot: 'profile' });
    expect(p).toContain('window light');
    expect(p).toContain('profile shot');
    expect(p).not.toContain('outdoors');
  });
  it('never frames a half-body garment below the hip', () => {
    const p = composeBenchPrompt({ ...base, cls: 'kurti', shot: 'full' });
    expect(p).toContain('waist-up');
  });
});

describe('engine cost estimate', () => {
  it('prices the default Kontext shot at ₹3.84 / 8 credits', () => {
    expect(studioEngineCost('bfl_kontext')).toEqual({ usd: 0.04, inr: 3.84, credits: 8 });
  });

  it('rounds credits up (0.219 / 0.005 = 43.8 → 44)', () => {
    expect(studioEngineCost('gpt_image_2_high')?.credits).toBe(44);
  });

  it('returns null — never a guess — when the price is unverified', () => {
    // Use engines that are STILL `usd: null` in STUDIO_ENGINE_INFO. `grok_imagine`
    // was the second example here, but its price got verified (0.04) and the
    // assertion was left behind — it kept passing only because this package's
    // `dist` is gitignored and was stale, so the test ran against an old table.
    // A fresh `pnpm build` turned it red. Prefer naming an engine whose row says
    // null today over pinning a fixed expectation to a mutable data table.
    expect(studioEngineCost('vton_kontext')).toBeNull();
    expect(studioEngineCost('vton_gemini')).toBeNull();
  });

  it('has an info row for every engine', () => {
    for (const e of STUDIO_ENGINES) expect(STUDIO_ENGINE_INFO[e]).toBeDefined();
  });
});
