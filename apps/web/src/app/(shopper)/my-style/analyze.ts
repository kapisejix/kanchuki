// F-045 PR-7: client half of selfie analysis - photo prep + the three API calls.
//
// Every call returns a value and never throws. Statuses become plain copy here, once:
// the API's own sentences never reach the screen, and a reply that is not a clear
// success is never shown as one (RC-059/060).
import {
  type GarmentDescriptor,
  MY_STYLE_CONFIDENCES,
  MY_STYLE_CONSENT,
  type MyStyleConfidence,
  type MyStyleProfile,
  parseGarmentDescriptor,
} from '@kanchuki/shared';
import type { Measurements, StyleProfile, TasteSummary } from './lib';
import {
  PHOTO_QUALITY,
  type PhotoProblem,
  checkFaces,
  checkPixels,
  detectFaces,
  measurePixels,
} from './photo-quality';

const BASE = '/api/my-style';
// Matches the server-side downscale, so the upload is never bigger than the model sees.
const MAX_EDGE = 1568;
const START_TIMEOUT_MS = 30_000;
const POLL_TIMEOUT_MS = 10_000;

// What Android and iOS cameras/galleries produce. HEIC/HEIF is only accepted here because
// it is decoded and re-encoded below; the API itself sniffs bytes and takes JPEG/PNG/WebP.
// An empty type is let through (some Android pickers omit it): the decode is the real gate.
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const MAX_PICK_BYTES = 25 * 1024 * 1024;

/**
 * Re-encode any photo the browser can decode as a <=1568px JPEG (the API refuses HEIC).
 * Rejects 'unsupported' (not a phone photo format, or over 25 MB) before decoding anything.
 * The JPEG re-encode also drops EXIF (GPS) and anything appended to the original bytes.
 *
 * Phase 2: also runs the on-device quality check (photo-quality.ts) on the decoded image and
 * returns its problems. The caller uploads only when none is blocking. Face checks are selfie
 * only, and skipped where the browser has no FaceDetector (most browsers today).
 */
export async function prepareUpload(
  file: Blob,
  mode: AnalyzeMode = 'selfie',
): Promise<{ photo: Blob; problems: PhotoProblem[] }> {
  if ((file.type && !PHOTO_TYPES.has(file.type.toLowerCase())) || file.size > MAX_PICK_BYTES) {
    throw new Error('unsupported');
  }
  const unreadable = () => new Error('unreadable');
  if (typeof createImageBitmap !== 'function') throw unreadable();
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file); // honours EXIF orientation
  } catch {
    throw unreadable(); // e.g. HEIC on a browser that cannot decode it
  }
  const problems = pixelProblems(bitmap);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw unreadable();
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  if (mode === 'selfie') {
    const faces = await detectFaces(canvas); // null = no detector: face checks skipped
    if (faces) problems.push(...checkFaces(faces, canvas.width, canvas.height));
  }
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85),
  );
  if (!blob) throw unreadable();
  return { photo: blob, problems };
}

// Light/blur/cast on a small copy (PHOTO_QUALITY.analysisEdge): fast, and the thresholds are set
// for that size. A browser without getImageData cannot run them; it reports nothing rather than
// refusing a photo it could not judge (the server read still judges it).
function pixelProblems(bitmap: ImageBitmap): PhotoProblem[] {
  const k = Math.min(1, PHOTO_QUALITY.analysisEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * k));
  const h = Math.max(1, Math.round(bitmap.height * k));
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const ctx = small.getContext('2d', { willReadFrequently: true });
  if (!ctx || typeof ctx.getImageData !== 'function') return [];
  ctx.drawImage(bitmap, 0, 0, w, h);
  return checkPixels(measurePixels(ctx.getImageData(0, 0, w, h).data, w, h));
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/** fetch with a timeout; `outer` (sheet closed) aborts it too. */
async function timedFetch(url: string, init: RequestInit, ms: number, outer?: AbortSignal) {
  const ctrl = new AbortController();
  const stop = () => ctrl.abort();
  const timer = setTimeout(stop, ms);
  outer?.addEventListener('abort', stop);
  try {
    return await fetch(url, { ...init, credentials: 'include', signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', stop);
  }
}

/** "1 December": the day the monthly photo-read allowance starts over (counters reset by calendar month). */
export function resetDay(now = new Date()): string {
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `1 ${next.toLocaleString('en-IN', { month: 'long' })}`;
}

const START_ERRORS: Record<number, string> = {
  409: 'Your last photo is still being read. Please wait a moment.',
  503: 'Photo reading is not available right now. Please try later.',
  404: 'Photo reading is switched off for now. Please try later.',
  413: 'That photo is too large. Please take a smaller one.',
  422: "We couldn't use that photo. Please take a clear photo and try again.",
};
const GENERIC = 'Something went wrong. Please try again.';

export type StartResult =
  | { kind: 'started'; jobId: string }
  | { kind: 'unauthorized' }
  | { kind: 'error'; message: string }
  | { kind: 'aborted' };

/** 'garment' = find similar: the photo is of a garment, not of the shopper. */
export type AnalyzeMode = 'selfie' | 'garment';

export async function startAnalysis(
  photo: Blob,
  signal?: AbortSignal,
  mode: AnalyzeMode = 'selfie',
): Promise<StartResult> {
  const form = new FormData();
  form.append('photo', photo, 'photo.jpg');
  try {
    const res = await timedFetch(
      `${BASE}/analyze?consent_version=${encodeURIComponent(MY_STYLE_CONSENT.version)}${
        mode === 'garment' ? '&mode=garment' : ''
      }`,
      { method: 'POST', body: form }, // no content-type: the browser adds the boundary
      START_TIMEOUT_MS,
      signal,
    );
    if (res.status === 401) return { kind: 'unauthorized' };
    if (res.status === 402) {
      // D5: selfie reads and Find similar searches have separate monthly limits.
      return {
        kind: 'error',
        message:
          mode === 'garment'
            ? `You've used this month's Find similar searches. They start over on ${resetDay()}. Your photo reads are not affected.`
            : `You've used this month's limit of photo reads. It starts over on ${resetDay()}. You can still browse, filter and take the quick quiz.`,
      };
    }
    if (!res.ok) return { kind: 'error', message: START_ERRORS[res.status] ?? GENERIC };
    const json = (await res.json().catch(() => null)) as { data?: { job_id?: string } } | null;
    const jobId = json?.data?.job_id;
    return jobId ? { kind: 'started', jobId } : { kind: 'error', message: GENERIC };
  } catch (e) {
    if (isAbort(e) && signal?.aborted) return { kind: 'aborted' };
    return {
      kind: 'error',
      message: 'Could not send your photo. Please check your connection and try again.',
    };
  }
}

// What went wrong (`message`) and what to do about it (`fix`), one line each (Phase 1). Selfie
// copy asks for a face photo only: the read gives colours, never measurements.
const FAILED: Record<string, { message: string; fix: string }> = {
  no_person: {
    message: "We couldn't see a person in that photo.",
    fix: "Hold the phone at arm's length so your face fills most of the frame.",
  },
  face_not_clear: {
    message: "We couldn't see your face clearly.",
    fix: 'Face a window or a light, keep hair off your face and take off sunglasses.',
  },
  multiple_people: {
    message: 'There is more than one person in that photo.',
    fix: 'Take a photo with only you in it, or crop the others out first.',
  },
  too_dark: {
    message: 'That photo is too dark.',
    fix: 'Move near a window in daylight, or turn on a bright light.',
  },
  face_too_small: {
    message: 'Your face is too far away in that photo.',
    fix: 'Come closer, so your face fills most of the frame.',
  },
  filter_or_edit: {
    message: 'That photo looks filtered or edited.',
    fix: 'Take a fresh photo with the beauty filter and effects turned off.',
  },
  face_covered: {
    message: 'Part of your face is covered.',
    fix: 'Take off sunglasses or a mask, and keep hair and hands away from your face.',
  },
  no_garment: {
    message: "We couldn't see a clothing item in that photo.",
    fix: 'Lay the piece flat or hang it up, and fill the frame with it.',
  },
  blurry: {
    message: 'That photo is too blurry.',
    fix: 'Hold still, tap the screen to focus, and wipe the camera lens.',
  },
  multiple_garments: {
    message: 'That photo has several pieces in it.',
    fix: 'Crop the photo to the one piece you like.',
  },
  read_failed: {
    message: 'We could not read that photo.',
    fix: 'Try another photo: daylight, facing the camera, no beauty filter.',
  },
  expired: {
    message: 'That took too long and the photo was dropped.',
    fix: 'Check your connection and try once more.',
  },
};

export type PollResult =
  | { kind: 'processing' }
  | {
      kind: 'ready';
      profile?: MyStyleProfile;
      /** Selfie only. Low (or unknown) opens the drape test (D4). */
      confidence?: MyStyleConfidence;
      garment?: GarmentDescriptor;
    }
  | { kind: 'failed'; message: string; fix?: string }
  | { kind: 'unauthorized' }
  | { kind: 'gone' }
  | { kind: 'error' }
  | { kind: 'aborted' };

export async function pollAnalysis(
  jobId: string,
  signal?: AbortSignal,
  mode: AnalyzeMode = 'selfie',
): Promise<PollResult> {
  try {
    const res = await timedFetch(
      `${BASE}/analyze/${encodeURIComponent(jobId)}`,
      { method: 'GET' },
      POLL_TIMEOUT_MS,
      signal,
    );
    if (res.status === 401) return { kind: 'unauthorized' };
    if (res.status === 404) return { kind: 'gone' };
    if (!res.ok) return { kind: 'error' };
    const json = (await res.json().catch(() => null)) as {
      data?: {
        status?: string;
        profile?: MyStyleProfile;
        confidence?: string;
        garment?: unknown;
        reason?: string;
      };
    } | null;
    const d = json?.data;
    if (d?.status === 'processing') return { kind: 'processing' };
    if (d?.status === 'ready') {
      // A ready without what this mode needs is an error, never a success (RC-060).
      if (mode === 'garment') {
        const garment = parseGarmentDescriptor(d.garment);
        return garment ? { kind: 'ready', garment } : { kind: 'error' };
      }
      if (!d.profile) return { kind: 'error' };
      // Unknown or missing = not sure, so the shopper is asked (never treated as high).
      const confidence = MY_STYLE_CONFIDENCES.find((c) => c === d.confidence) ?? 'low';
      return { kind: 'ready', profile: d.profile, confidence };
    }
    if (d?.status === 'failed') {
      const f = FAILED[d.reason ?? ''] ?? FAILED.read_failed;
      return { kind: 'failed', message: f.message, fix: f.fix };
    }
    if (d?.status === 'cancelled') {
      return {
        kind: 'failed',
        message: 'Your style data was cleared, so this photo was not used.',
      };
    }
    return { kind: 'error' };
  } catch (e) {
    return isAbort(e) && signal?.aborted ? { kind: 'aborted' } : { kind: 'error' };
  }
}

export type ProfileResult =
  | {
      kind: 'ok';
      data: {
        style_profile: StyleProfile | null;
        measurements: Measurements | null;
        taste: TasteSummary | null;
      };
    }
  | { kind: 'unauthorized' }
  | { kind: 'error' };

/** The saved palette, measurements and taste, read on their own so they never wait on the feed. */
export async function fetchProfile(signal?: AbortSignal): Promise<ProfileResult> {
  try {
    const res = await timedFetch(`${BASE}/profile`, { method: 'GET' }, POLL_TIMEOUT_MS, signal);
    if (res.status === 401) return { kind: 'unauthorized' };
    if (!res.ok) return { kind: 'error' };
    const json = (await res.json().catch(() => null)) as {
      data?: Extract<ProfileResult, { kind: 'ok' }>['data'];
    } | null;
    return json?.data ? { kind: 'ok', data: json.data } : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

/** The drape test's answers (D4): per pair, the side that made the face look brighter. */
export type DrapePick = 'warm' | 'cool';

export type ConfirmResult =
  | { kind: 'ok'; profile: StyleProfile }
  | { kind: 'unauthorized' }
  /** 409 NO_PROFILE: cleared meanwhile (another tab); a retry can never work. */
  | { kind: 'no_profile' }
  | { kind: 'error' };

/** Save the drape-test answer; the server works out the undertone. Only a saved profile is ok. */
export async function confirmProfile(picks: DrapePick[]): Promise<ConfirmResult> {
  try {
    const res = await timedFetch(
      `${BASE}/profile/confirm`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ picks }),
      },
      START_TIMEOUT_MS,
    );
    if (res.status === 401) return { kind: 'unauthorized' };
    if (res.status === 409) return { kind: 'no_profile' };
    if (!res.ok) return { kind: 'error' };
    const json = (await res.json().catch(() => null)) as {
      data?: { style_profile?: StyleProfile | null };
    } | null;
    const profile = json?.data?.style_profile;
    return profile ? { kind: 'ok', profile } : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

/** "Clear my data". Only {data:{ok:true}} counts as cleared. */
export async function clearProfile(): Promise<'ok' | 'unauthorized' | 'error'> {
  try {
    const res = await timedFetch(`${BASE}/profile/clear`, { method: 'POST' }, START_TIMEOUT_MS);
    if (res.status === 401) return 'unauthorized';
    if (!res.ok) return 'error';
    const json = (await res.json().catch(() => null)) as { data?: { ok?: boolean } } | null;
    return json?.data?.ok === true ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

/** Save self-entered centimetres. A field set to null removes it. Only {data:{measurements}} counts as saved. */
export async function saveMeasurements(
  body: Partial<Record<'height_cm' | 'bust_cm' | 'waist_cm' | 'hip_cm', number | null>> & {
    usual_size?: string | null;
    consent_version?: string;
  },
): Promise<'ok' | 'unauthorized' | 'invalid' | 'error'> {
  try {
    const res = await timedFetch(
      `${BASE}/measurements`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
      START_TIMEOUT_MS,
    );
    if (res.status === 401) return 'unauthorized';
    if (res.status === 422) return 'invalid';
    if (!res.ok) return 'error';
    const json = (await res.json().catch(() => null)) as {
      data?: { measurements?: unknown };
    } | null;
    return json?.data?.measurements ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

/** "Remove my measurements": deletes the numbers and ends the measurements consent. Only {data:{ok:true}} counts. */
export async function withdrawMeasurements(): Promise<'ok' | 'unauthorized' | 'error'> {
  try {
    const res = await timedFetch(
      `${BASE}/measurements/withdraw`,
      { method: 'POST' },
      START_TIMEOUT_MS,
    );
    if (res.status === 401) return 'unauthorized';
    if (!res.ok) return 'error';
    const json = (await res.json().catch(() => null)) as { data?: { ok?: boolean } } | null;
    return json?.data?.ok === true ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}
