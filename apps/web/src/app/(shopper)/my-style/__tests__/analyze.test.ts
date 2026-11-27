// F-045 PR-7: the client half of selfie analysis - photo prep + the three API calls.
// Every call returns a value, never throws, and turns the API's statuses into plain
// copy (no raw API sentence reaches the screen, no fake success: RC-059/060).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearProfile,
  confirmProfile,
  fetchProfile,
  pollAnalysis,
  prepareUpload,
  startAnalysis,
} from '../analyze';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('prepareUpload', () => {
  function fakeCanvas(blob: Blob | null = new Blob(['jpeg'], { type: 'image/jpeg' })) {
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toBlob: (cb: (b: Blob | null) => void, type?: string, q?: number) => {
        canvas.toBlobArgs = [type, q];
        cb(blob);
      },
      toBlobArgs: [] as unknown[],
    };
    vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLElement);
    return { canvas, drawImage };
  }

  it('downscales a large photo to 1568px on the long edge and re-encodes as JPEG', async () => {
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 4000, height: 3000, close }),
    );
    const { canvas, drawImage } = fakeCanvas();

    const out = await prepareUpload(new File(['x'], 'a.heic', { type: 'image/heic' }));

    expect(out.photo.type).toBe('image/jpeg');
    // The fake canvas has no getImageData: pixel checks cannot run, so nothing is reported.
    expect(out.problems).toEqual([]);
    expect(canvas.width).toBe(1568);
    expect(canvas.height).toBe(1176);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1568, 1176);
    expect(canvas.toBlobArgs).toEqual(['image/jpeg', 0.85]);
    expect(close).toHaveBeenCalled();
  });

  it('never upscales a small photo', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 800, height: 600, close: vi.fn() }),
    );
    const { canvas } = fakeCanvas();
    await prepareUpload(new File(['x'], 'a.jpg'));
    expect([canvas.width, canvas.height]).toEqual([800, 600]);
  });

  it('rejects with "unreadable" when the browser cannot decode the file (e.g. HEIC on Chrome)', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode')));
    await expect(prepareUpload(new File(['x'], 'a.heic'))).rejects.toThrow('unreadable');
  });

  it('rejects when createImageBitmap does not exist', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    await expect(prepareUpload(new File(['x'], 'a.jpg'))).rejects.toThrow('unreadable');
  });

  it('rejects non-photo types and oversize files as "unsupported" before decoding', async () => {
    const decode = vi.fn();
    vi.stubGlobal('createImageBitmap', decode);
    for (const type of ['image/svg+xml', 'image/gif', 'application/pdf', 'text/html']) {
      await expect(prepareUpload(new File(['x'], 'a', { type }))).rejects.toThrow('unsupported');
    }
    const big = new File([new Uint8Array(25 * 1024 * 1024 + 1)], 'a.jpg', { type: 'image/jpeg' });
    await expect(prepareUpload(big)).rejects.toThrow('unsupported');
    expect(decode).not.toHaveBeenCalled();
  });

  it('accepts the Android/iOS photo types (and a missing type) through to the decoder', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 10, height: 10, close: vi.fn() }),
    );
    fakeCanvas();
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/HEIF', '']) {
      expect((await prepareUpload(new File(['x'], 'a', { type }))).photo).toBeInstanceOf(Blob);
    }
  });

  // Phase 2 (research §7.2 step 4): the on-device check runs on the canvas just drawn.
  function pixelCanvas(rgb: [number, number, number]) {
    const { canvas } = fakeCanvas();
    const ctx = {
      drawImage: vi.fn(),
      getImageData: (_x: number, _y: number, w: number, h: number) => {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < w * h; i++) data.set([...rgb, 255], i * 4);
        return { data, width: w, height: h };
      },
    };
    canvas.getContext = () => ctx as never;
    return canvas;
  }
  const decode10 = () =>
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 10, height: 10, close: vi.fn() }),
    );

  it('reports a dark photo as a blocking problem with a fix', async () => {
    decode10();
    pixelCanvas([10, 10, 10]);
    const { problems } = await prepareUpload(new File(['x'], 'a.jpg'));
    expect(problems.find((p) => p.code === 'too_dark')).toMatchObject({ blocking: true });
  });

  it('selfie: runs the face check where FaceDetector exists; garment: never', async () => {
    decode10();
    pixelCanvas([10, 10, 10]);
    const detect = vi.fn().mockResolvedValue([]);
    vi.stubGlobal(
      'FaceDetector',
      vi.fn(() => ({ detect })),
    );
    const selfie = await prepareUpload(new File(['x'], 'a.jpg'));
    expect(selfie.problems.map((p) => p.code)).toContain('no_face');
    detect.mockClear();
    const garment = await prepareUpload(new File(['x'], 'a.jpg'), 'garment');
    expect(detect).not.toHaveBeenCalled();
    expect(garment.problems.map((p) => p.code)).not.toContain('no_face');
  });

  it('rejects when the canvas yields no blob', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 10, height: 10, close: vi.fn() }),
    );
    fakeCanvas(null);
    await expect(prepareUpload(new File(['x'], 'a.jpg'))).rejects.toThrow('unreadable');
  });
});

describe('startAnalysis', () => {
  const photo = new Blob(['jpeg'], { type: 'image/jpeg' });

  it('POSTs multipart to the proxy with the consent version in the query', async () => {
    fetchMock.mockResolvedValue(json({ data: { job_id: 'mystyle_a', status: 'processing' } }, 202));

    const r = await startAnalysis(photo);

    expect(r).toEqual({ kind: 'started', jobId: 'mystyle_a' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/my-style/analyze?consent_version=mystyle-1.0');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('photo')).toBeTruthy();
    // multipart boundary must come from the browser, not be set by us
    expect(init.headers).toBeUndefined();
  });

  it('401 -> unauthorized (the sheet shows the sign-in step)', async () => {
    fetchMock.mockResolvedValue(
      json({ error: { code: 'UNAUTHORIZED', message: 'Passport session required' } }, 401),
    );
    expect(await startAnalysis(photo)).toEqual({ kind: 'unauthorized' });
  });

  it.each([
    [402, /limit/i],
    [409, /still being read/i],
    [503, /not available/i],
    [404, /switched off|not available/i],
    [413, /too large/i],
    [422, /couldn.t use that photo/i],
    [500, /something went wrong/i],
  ])('status %i gets plain copy, never the API sentence', async (status, copy) => {
    fetchMock.mockResolvedValue(
      json({ error: { code: 'X', message: 'RAW API SENTENCE' } }, status),
    );
    const r = await startAnalysis(photo);
    expect(r.kind).toBe('error');
    expect((r as { message: string }).message).toMatch(copy);
    expect((r as { message: string }).message).not.toContain('RAW API SENTENCE');
  });

  it('a 202 with no job id is an error, not a started job', async () => {
    fetchMock.mockResolvedValue(json({ data: {} }, 202));
    expect((await startAnalysis(photo)).kind).toBe('error');
  });

  it('a network failure is an error with connection copy', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const r = await startAnalysis(photo);
    expect(r).toMatchObject({ kind: 'error', message: expect.stringMatching(/connection/i) });
  });

  it('aborting from outside (sheet closed) is "aborted", not an error (RC-014)', async () => {
    const ctrl = new AbortController();
    fetchMock.mockImplementation((_u: string, init: RequestInit) => {
      return new Promise((_res, rej) => {
        init.signal!.addEventListener('abort', () =>
          rej(new DOMException('The operation was aborted.', 'AbortError')),
        );
      });
    });
    const p = startAnalysis(photo, ctrl.signal);
    ctrl.abort();
    expect(await p).toEqual({ kind: 'aborted' });
  });
});

describe('pollAnalysis', () => {
  it('GETs the job through the proxy', async () => {
    fetchMock.mockResolvedValue(json({ data: { status: 'processing' } }));
    expect(await pollAnalysis('mystyle_a')).toEqual({ kind: 'processing' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/my-style/analyze/mystyle_a');
    expect(init.method ?? 'GET').toBe('GET');
    expect(init.credentials).toBe('include');
  });

  it('ready carries the profile', async () => {
    const profile = { undertone: 'warm', depth: 'medium', frame: 'tall' };
    fetchMock.mockResolvedValue(json({ data: { status: 'ready', profile, confidence: 'high' } }));
    expect(await pollAnalysis('mystyle_a')).toEqual({ kind: 'ready', profile, confidence: 'high' });
  });

  it('a ready reply without a known confidence counts as low (drape test, D4)', async () => {
    const profile = { undertone: 'cool', depth: 'deep', frame: 'tall' };
    for (const confidence of [undefined, 'sure']) {
      fetchMock.mockResolvedValueOnce(json({ data: { status: 'ready', profile, confidence } }));
      expect(await pollAnalysis('mystyle_a')).toMatchObject({ confidence: 'low' });
    }
  });

  it('a ready reply with no profile is not a success (RC-060)', async () => {
    fetchMock.mockResolvedValue(json({ data: { status: 'ready' } }));
    expect((await pollAnalysis('mystyle_a')).kind).toBe('error');
  });

  it.each([
    ['no_person', /person|you in/i],
    ['face_not_clear', /face/i],
    ['multiple_people', /one person|only you|alone/i],
    ['too_dark', /light|dark/i],
    ['read_failed', /could not read|try again/i],
    ['expired', /took too long|expired|try again/i],
  ])('failed reason %s gets its own plain copy', async (reason, copy) => {
    fetchMock.mockResolvedValue(json({ data: { status: 'failed', reason } }));
    const r = await pollAnalysis('mystyle_a');
    expect(r.kind).toBe('failed');
    expect((r as { message: string }).message).toMatch(copy);
    expect((r as { message: string }).message).not.toContain(reason);
  });

  it('an unknown failed reason falls back to generic copy', async () => {
    fetchMock.mockResolvedValue(json({ data: { status: 'failed', reason: 'weird' } }));
    const r = await pollAnalysis('mystyle_a');
    expect(r).toMatchObject({
      kind: 'failed',
      message: expect.stringMatching(/could not read/i),
      fix: expect.stringMatching(/try another photo/i),
    });
  });

  it('cancelled says the data was cleared', async () => {
    fetchMock.mockResolvedValue(json({ data: { status: 'cancelled' } }));
    expect(await pollAnalysis('mystyle_a')).toMatchObject({
      kind: 'failed',
      message: expect.stringMatching(/cleared/i),
    });
  });

  it('401 -> unauthorized, 404 -> gone, other -> error', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 401));
    expect(await pollAnalysis('mystyle_a')).toEqual({ kind: 'unauthorized' });
    fetchMock.mockResolvedValueOnce(json({}, 404));
    expect(await pollAnalysis('mystyle_a')).toEqual({ kind: 'gone' });
    fetchMock.mockResolvedValueOnce(json({}, 503));
    expect(await pollAnalysis('mystyle_a')).toEqual({ kind: 'error' });
  });

  it('a network failure is a transient error, not a throw', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    expect(await pollAnalysis('mystyle_a')).toEqual({ kind: 'error' });
  });

  it('an abort is "aborted" (RC-014)', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    fetchMock.mockRejectedValue(new DOMException('aborted', 'AbortError'));
    expect(await pollAnalysis('mystyle_a', ctrl.signal)).toEqual({ kind: 'aborted' });
  });
});

describe('clearProfile', () => {
  it('POSTs profile/clear and reports ok only on {data:{ok:true}}', async () => {
    fetchMock.mockResolvedValue(json({ data: { ok: true } }));
    expect(await clearProfile()).toBe('ok');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/my-style/profile/clear');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
  });

  it('a 200 without ok:true is not success', async () => {
    fetchMock.mockResolvedValue(json({ data: {} }));
    expect(await clearProfile()).toBe('error');
  });

  it('401 -> unauthorized; failure -> error; network throw -> error', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 401));
    expect(await clearProfile()).toBe('unauthorized');
    fetchMock.mockResolvedValueOnce(json({}, 500));
    expect(await clearProfile()).toBe('error');
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    expect(await clearProfile()).toBe('error');
  });
});

describe('garment mode (find similar)', () => {
  const garment = { category: 'Kurti', color_family: 'yellow', embellishments: ['Zari Work'] };

  it('startAnalysis adds mode=garment to the query; selfie stays unchanged', async () => {
    fetchMock.mockResolvedValue(json({ data: { job_id: 'j1' } }, 202));
    await startAnalysis(new Blob(['x']), undefined, 'garment');
    expect(fetchMock.mock.calls[0]![0]).toMatch(/consent_version=mystyle-1\.0&mode=garment$/);
    await startAnalysis(new Blob(['x']));
    expect(fetchMock.mock.calls[1]![0]).not.toMatch(/mode=/);
  });

  it('a ready garment poll returns the validated descriptor', async () => {
    fetchMock.mockResolvedValue(json({ data: { status: 'ready', garment } }));
    expect(await pollAnalysis('j1', undefined, 'garment')).toEqual({ kind: 'ready', garment });
  });

  it('a ready garment poll without a valid descriptor is an error, not a success (RC-060)', async () => {
    for (const bad of [undefined, { category: 'Spaceship', color_family: 'x' }, 'Kurti']) {
      fetchMock.mockResolvedValueOnce(json({ data: { status: 'ready', garment: bad } }));
      expect(await pollAnalysis('j1', undefined, 'garment')).toEqual({ kind: 'error' });
    }
  });

  it('a ready poll that carries only a profile is an error in garment mode', async () => {
    fetchMock.mockResolvedValue(
      json({
        data: { status: 'ready', profile: { undertone: 'warm', depth: 'fair', frame: 'tall' } },
      }),
    );
    expect(await pollAnalysis('j1', undefined, 'garment')).toEqual({ kind: 'error' });
  });

  it.each([
    ['no_garment', /clothing item/],
    ['blurry', /blurry/],
    ['multiple_garments', /several pieces/],
  ])('maps the %s reason to plain copy', async (reason, re) => {
    fetchMock.mockResolvedValue(json({ data: { status: 'failed', reason } }));
    const r = await pollAnalysis('j1', undefined, 'garment');
    expect(r.kind).toBe('failed');
    expect((r as { message: string }).message).toMatch(re);
  });
});

// Phase 1: every failed read says what to do next, in its own line, not just what went wrong.
describe('failed reads carry a one-line fix', () => {
  it.each([
    ['no_person', 'selfie'],
    ['face_not_clear', 'selfie'],
    ['multiple_people', 'selfie'],
    ['too_dark', 'selfie'],
    ['face_too_small', 'selfie'],
    ['filter_or_edit', 'selfie'],
    ['face_covered', 'selfie'],
    ['read_failed', 'selfie'],
    ['expired', 'selfie'],
    ['no_garment', 'garment'],
    ['blurry', 'garment'],
    ['multiple_garments', 'garment'],
  ] as const)('%s has a fix that differs from the message', async (reason, mode) => {
    fetchMock.mockResolvedValue(json({ data: { status: 'failed', reason } }));
    const r = (await pollAnalysis('j1', undefined, mode)) as { message: string; fix?: string };
    expect(r.fix).toBeTruthy();
    expect(r.fix).not.toBe(r.message);
    expect(r.fix).not.toContain(reason);
  });

  it('an unknown reason still gets the generic fix', async () => {
    fetchMock.mockResolvedValue(json({ data: { status: 'failed', reason: 'weird' } }));
    expect(((await pollAnalysis('j1')) as { fix?: string }).fix).toBeTruthy();
  });

  it('selfie fixes never promise measurements or ask for a full-body photo', async () => {
    for (const reason of ['no_person', 'face_not_clear', 'read_failed']) {
      fetchMock.mockResolvedValue(json({ data: { status: 'failed', reason } }));
      const r = (await pollAnalysis('j1')) as { message: string; fix?: string };
      expect(`${r.message} ${r.fix}`).not.toMatch(/full.body|measure/i);
    }
  });
});

// D5: the two reads have separate monthly limits, so the 402 copy names the right one.
describe('quota copy per mode', () => {
  it('a selfie 402 names photo reads; a find-similar 402 names searches', async () => {
    fetchMock.mockResolvedValue(json({ error: {} }, 402));
    const selfie = (await startAnalysis(new Blob(['x']))) as { message: string };
    const similar = (await startAnalysis(new Blob(['x']), undefined, 'garment')) as {
      message: string;
    };
    expect(selfie.message).toMatch(/photo reads/i);
    expect(similar.message).toMatch(/find similar/i);
    expect(similar.message).not.toBe(selfie.message);
  });
});

describe('confirmProfile (drape test)', () => {
  it('POSTs the three picks and returns the saved profile', async () => {
    const style_profile = { undertone: 'cool', depth: 'medium', frame: null, palette: null };
    fetchMock.mockResolvedValue(json({ data: { style_profile } }));
    const r = await confirmProfile(['cool', 'cool', 'warm']);
    expect(r).toEqual({ kind: 'ok', profile: style_profile });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/my-style/profile/confirm');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ picks: ['cool', 'cool', 'warm'] });
  });

  it('401, a 409 (nothing saved), a 200 without a profile and a network error are not ok', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 401));
    expect(await confirmProfile(['warm', 'warm', 'warm'])).toEqual({ kind: 'unauthorized' });
    // Cleared in another tab: retrying can never work, so it is its own outcome.
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'NO_PROFILE' } }, 409));
    expect((await confirmProfile(['warm', 'warm', 'warm'])).kind).toBe('no_profile');
    fetchMock.mockResolvedValueOnce(json({ data: {} }));
    expect((await confirmProfile(['warm', 'warm', 'warm'])).kind).toBe('error');
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect((await confirmProfile(['warm', 'warm', 'warm'])).kind).toBe('error');
  });
});

describe('fetchProfile', () => {
  const data = { style_profile: null, measurements: null, taste: null };

  it('GETs /api/my-style/profile with credentials and no body', async () => {
    fetchMock.mockResolvedValue(json({ data }));
    expect(await fetchProfile()).toEqual({ kind: 'ok', data });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/my-style/profile');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
    expect(init.body).toBeUndefined();
  });

  it('401 -> unauthorized; 500, a body with no data, or a network error -> error (never throws)', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 401));
    expect((await fetchProfile()).kind).toBe('unauthorized');
    fetchMock.mockResolvedValueOnce(json({}, 500));
    expect((await fetchProfile()).kind).toBe('error');
    fetchMock.mockResolvedValueOnce(json({}));
    expect((await fetchProfile()).kind).toBe('error');
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    expect((await fetchProfile()).kind).toBe('error');
  });
});
