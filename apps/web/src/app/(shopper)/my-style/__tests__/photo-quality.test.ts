// Phase 2 (customer-profile-research §7.2 step 4): the on-device photo check. Pure pixel maths on
// synthetic images, so each threshold is pinned by a photo that should and should not trip it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkFaces, checkPixels, detectFaces, measurePixels } from '../photo-quality';

const W = 64;
const H = 64;

/** RGBA pixels from a per-pixel colour function. */
function image(px: (x: number, y: number) => [number, number, number]) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = px(x, y);
      data.set([r, g, b, 255], (y * W + x) * 4);
    }
  }
  return data;
}
// Sharp detail at a mid level: a fine checkerboard around a grey.
const checker = (lo: number, hi: number) => (x: number, y: number) =>
  ((x + y) % 2 === 0 ? [lo, lo, lo] : [hi, hi, hi]) as [number, number, number];
const codes = (data: Uint8ClampedArray) =>
  checkPixels(measurePixels(data, W, H)).map((p) => p.code);

describe('checkPixels', () => {
  it('a sharp, evenly lit photo passes', () => {
    expect(codes(image(checker(90, 170)))).toEqual([]);
  });

  it('too dark and too bright block, each with a fix line', () => {
    const dark = checkPixels(measurePixels(image(checker(5, 40)), W, H));
    expect(dark.map((p) => p.code)).toContain('too_dark');
    expect(dark.find((p) => p.code === 'too_dark')).toMatchObject({ blocking: true });
    expect(dark[0]?.fix).toMatch(/window|light/i);
    expect(codes(image(checker(230, 255)))).toContain('too_bright');
  });

  it('a smooth (blurred) photo blocks as blurry', () => {
    const smooth = image((x) => [80 + x, 80 + x, 80 + x]);
    expect(codes(smooth)).toContain('blurry');
  });

  it('a strong yellow cast warns but does not block', () => {
    const yellow = checkPixels(
      measurePixels(
        image((x, y) => ((x + y) % 2 ? [250, 170, 60] : [200, 120, 30])),
        W,
        H,
      ),
    );
    const cast = yellow.find((p) => p.code === 'colour_cast');
    expect(cast).toMatchObject({ blocking: false });
    expect(cast?.message).toMatch(/yellow/i);
  });

  it('ordinary skin tones do not count as a colour cast', () => {
    expect(codes(image((x, y) => ((x + y) % 2 ? [205, 150, 120] : [150, 100, 75])))).not.toContain(
      'colour_cast',
    );
  });
});

describe('checkFaces', () => {
  const face = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
  const c = (faces: ReturnType<typeof face>[]) => checkFaces(faces, 1000, 1000).map((p) => p.code);

  it('one centred face of a good size passes', () => {
    expect(c([face(350, 300, 300, 380)])).toEqual([]);
  });
  it('no face, several faces, a far face and a cut-off face each block', () => {
    expect(c([])).toEqual(['no_face']);
    expect(c([face(100, 100, 300, 300), face(600, 100, 300, 300)])).toEqual(['multiple_faces']);
    expect(c([face(450, 450, 100, 120)])).toEqual(['face_too_small']);
    expect(c([face(0, 300, 300, 380)])).toEqual(['face_cut_off']);
    for (const p of checkFaces([], 1000, 1000)) expect(p.blocking).toBe(true);
  });
});

describe('detectFaces', () => {
  afterEach(() => vi.unstubAllGlobals());
  const canvas = {} as HTMLCanvasElement;

  it('answers null (skip the face checks) where the browser has no FaceDetector', async () => {
    vi.stubGlobal('FaceDetector', undefined);
    expect(await detectFaces(canvas)).toBeNull();
  });

  it('returns the boxes the browser found', async () => {
    const detect = vi
      .fn()
      .mockResolvedValue([{ boundingBox: { x: 1, y: 2, width: 3, height: 4 } }]);
    vi.stubGlobal(
      'FaceDetector',
      vi.fn(() => ({ detect })),
    );
    expect(await detectFaces(canvas)).toEqual([{ x: 1, y: 2, width: 3, height: 4 }]);
    expect(detect).toHaveBeenCalledWith(canvas);
  });

  it('a detector that throws skips the face checks instead of blocking the photo', async () => {
    vi.stubGlobal(
      'FaceDetector',
      vi.fn(() => ({ detect: vi.fn().mockRejectedValue(new Error('not supported')) })),
    );
    expect(await detectFaces(canvas)).toBeNull();
  });
});
