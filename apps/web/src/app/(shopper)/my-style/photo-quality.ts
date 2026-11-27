// My Style Phase 2 (customer-profile-research §7.2 step 4): on-device photo check BEFORE upload.
//
// Runs in the browser on the canvas prepareUpload already drew. Nothing here leaves the phone:
// no network, no storage, no logging (my-style-privacy-guard.test.ts pins that). A blocking
// problem means the photo is never uploaded, so it never costs the shopper quota or us a model
// call. A warning (colour cast) lets the shopper continue.
//
// Face checks use the browser's FaceDetector (Shape Detection API) where it exists. Most
// browsers still ship it behind a flag, so on most phones today the face checks are SKIPPED and
// only light/blur/cast run; the server read (face_too_small, multiple_people, ...) still covers
// faces. ponytail: MediaPipe Face Detector (WASM) would make face checks work everywhere; it is a
// new dependency and waits on owner approval.

/**
 * Every threshold in one place.
 * ponytail: first guesses from synthetic images, NOT tuned on real phones. Tune with the device
 * checklist (dark room, window light, blurry hand-held, tungsten bulb) before trusting them.
 */
export const PHOTO_QUALITY = {
  /** Long edge of the small copy the pixel checks run on. */
  analysisEdge: 256,
  /** Mean luma (0-255, Rec.601) below this = too dark, above `lumaMax` = too bright. */
  lumaMin: 45,
  lumaMax: 225,
  /** Laplacian variance over the centre region, on the analysisEdge copy. Below = blurry. */
  blurMinVariance: 25,
  /** Share of each side trimmed before the blur check, so a plain background does not count. */
  blurCentreTrim: 0.2,
  /** Brightest / dimmest channel mean above this = strong colour cast. Skin alone sits ~1.4-1.9. */
  castMaxRatio: 2.2,
  /** Face box narrower than this share of the frame width = too far away. */
  faceMinWidthShare: 0.15,
  /** A face box within this share of an edge counts as cut off. */
  faceEdgeShare: 0.01,
} as const;

export type PhotoProblemCode =
  | 'too_dark'
  | 'too_bright'
  | 'blurry'
  | 'colour_cast'
  | 'no_face'
  | 'multiple_faces'
  | 'face_too_small'
  | 'face_cut_off';

export interface PhotoProblem {
  code: PhotoProblemCode;
  message: string;
  fix: string;
  /** false = a warning the shopper may ignore. */
  blocking: boolean;
}

export interface PixelStats {
  luma: number;
  blurVariance: number;
  mean: { r: number; g: number; b: number };
}

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const COPY: Record<PhotoProblemCode, Omit<PhotoProblem, 'code'>> = {
  too_dark: {
    message: 'This photo is too dark.',
    fix: 'Move near a window or turn on a light.',
    blocking: true,
  },
  too_bright: {
    message: 'This photo is too bright.',
    fix: 'Step out of direct sunlight or away from a bright lamp.',
    blocking: true,
  },
  blurry: {
    message: 'This photo is blurry.',
    fix: 'Hold still, tap the screen to focus and try again.',
    blocking: true,
  },
  colour_cast: {
    message: 'The light gives this photo a strong colour tint.',
    fix: 'Daylight from a window gives a truer result.',
    blocking: false,
  },
  no_face: {
    message: "We can't find your face.",
    fix: 'Face the camera, with your face inside the oval.',
    blocking: true,
  },
  multiple_faces: {
    message: 'There is more than one face in this photo.',
    fix: 'Only you in the photo, please.',
    blocking: true,
  },
  face_too_small: {
    message: 'Your face is too far away.',
    fix: 'Come closer: your face should fill the oval.',
    blocking: true,
  },
  face_cut_off: {
    message: 'Your face is cut off.',
    fix: 'Centre your face in the oval.',
    blocking: true,
  },
};

const problem = (code: PhotoProblemCode, over: Partial<PhotoProblem> = {}): PhotoProblem => ({
  code,
  ...COPY[code],
  ...over,
});

/** Mean luma, centre-region Laplacian variance and channel means of RGBA pixels. */
export function measurePixels(data: Uint8ClampedArray, w: number, h: number): PixelStats {
  const n = w * h;
  const grey = new Float32Array(n);
  let r = 0;
  let g = 0;
  let b = 0;
  let luma = 0;
  for (let i = 0; i < n; i++) {
    const R = data[i * 4] ?? 0;
    const G = data[i * 4 + 1] ?? 0;
    const B = data[i * 4 + 2] ?? 0;
    r += R;
    g += G;
    b += B;
    const y = 0.299 * R + 0.587 * G + 0.114 * B;
    grey[i] = y;
    luma += y;
  }

  const tx = Math.max(1, Math.floor(w * PHOTO_QUALITY.blurCentreTrim));
  const ty = Math.max(1, Math.floor(h * PHOTO_QUALITY.blurCentreTrim));
  let sum = 0;
  let sq = 0;
  let count = 0;
  for (let y = ty; y < h - ty; y++) {
    for (let x = tx; x < w - tx; x++) {
      const i = y * w + x;
      const lap =
        (grey[i - 1] ?? 0) +
        (grey[i + 1] ?? 0) +
        (grey[i - w] ?? 0) +
        (grey[i + w] ?? 0) -
        4 * (grey[i] ?? 0);
      sum += lap;
      sq += lap * lap;
      count++;
    }
  }
  const avg = count ? sum / count : 0;
  return {
    luma: n ? luma / n : 0,
    blurVariance: count ? sq / count - avg * avg : 0,
    mean: { r: n ? r / n : 0, g: n ? g / n : 0, b: n ? b / n : 0 },
  };
}

/** Light, blur and colour-cast problems. Dark/bright/blur block; a cast only warns. */
export function checkPixels(s: PixelStats): PhotoProblem[] {
  const out: PhotoProblem[] = [];
  if (s.luma < PHOTO_QUALITY.lumaMin) out.push(problem('too_dark'));
  else if (s.luma > PHOTO_QUALITY.lumaMax) out.push(problem('too_bright'));
  if (s.blurVariance < PHOTO_QUALITY.blurMinVariance) out.push(problem('blurry'));

  const { r, g, b } = s.mean;
  const hi = Math.max(r, g, b);
  const lo = Math.max(1, Math.min(r, g, b));
  if (hi / lo > PHOTO_QUALITY.castMaxRatio) {
    const tint = b === hi ? 'very blue' : b <= Math.min(r, g) ? 'very yellow' : 'strongly tinted';
    out.push(problem('colour_cast', { message: `The light in this photo is ${tint}.` }));
  }
  return out;
}

/** Face count, size and cut-off. Only call with a real detector result (see detectFaces). */
export function checkFaces(faces: FaceBox[], w: number, h: number): PhotoProblem[] {
  if (faces.length === 0) return [problem('no_face')];
  if (faces.length > 1) return [problem('multiple_faces')];
  const f = faces[0] as FaceBox;
  const ex = w * PHOTO_QUALITY.faceEdgeShare;
  const ey = h * PHOTO_QUALITY.faceEdgeShare;
  if (f.x <= ex || f.y <= ey || f.x + f.width >= w - ex || f.y + f.height >= h - ey) {
    return [problem('face_cut_off')];
  }
  if (f.width / w < PHOTO_QUALITY.faceMinWidthShare) return [problem('face_too_small')];
  return [];
}

type Detector = { detect(src: CanvasImageSource): Promise<{ boundingBox: FaceBox }[]> };

/**
 * Face boxes from the browser's FaceDetector, or null = "could not check, skip the face checks".
 * Null on a browser without it and on any detector error: an unavailable check must never block
 * a good photo (the server read still judges faces).
 */
export async function detectFaces(src: CanvasImageSource): Promise<FaceBox[] | null> {
  const Ctor = (globalThis as { FaceDetector?: new (o: object) => Detector }).FaceDetector;
  if (typeof Ctor !== 'function') return null;
  try {
    const found = await new Ctor({ maxDetectedFaces: 3, fastMode: true }).detect(src);
    return found.map(({ boundingBox: b }) => ({
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
    }));
  } catch {
    return null;
  }
}
