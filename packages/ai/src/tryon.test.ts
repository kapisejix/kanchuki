import { beforeEach, describe, expect, it, vi } from 'vitest';

// Controllable secret store so a test can simulate "endpoint unset", "endpoint
// + key set", etc. — the real getSecret() reads IntegrationSetting rows from
// the DB, which this package has no business touching in a unit test.
const secretState = { keys: new Map<string, string>() };

vi.mock('@kanchuki/db', () => ({
  getSecret: vi.fn(async (keyName: string) => secretState.keys.get(keyName)),
}));

const uploads: { key: string; buffer: Buffer; contentType: string }[] = [];
vi.mock('./r2.js', () => ({
  uploadBuffer: vi.fn(async (key: string, buffer: Buffer, contentType: string) => {
    uploads.push({ key, buffer, contentType });
  }),
}));

const ssrfCalls: string[] = [];
vi.mock('./safe-fetch.js', () => ({
  ssrfSafeFetch: vi.fn(async (url: string) => {
    ssrfCalls.push(url);
    return { ok: true } as Response;
  }),
  readCappedBuffer: vi.fn(async () => Buffer.from('downloaded-result')),
}));

const {
  TryOnNotConfiguredError,
  clothTypeForCategory,
  generateTryOn,
  isCatVtonConfigured,
  isUnsupportedTryOnCategory,
  saveTryOnResultToR2,
  tryonResultR2Key,
} = await import('./tryon.js');

const ENDPOINT = 'https://api.runpod.ai/v2/pnvchif9f4bcom';

/** A tiny but real "photo" — bytes we can prove round-trip through base64. */
const PERSON_BYTES = Buffer.from('fake-jpeg-person-photo-bytes');
const PERSON_B64 = PERSON_BYTES.toString('base64');

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const res = {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
  const fn = vi.fn().mockResolvedValue(res);
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** The parsed request body of the single fetch call. */
function sentBody(fn: ReturnType<typeof vi.fn>): Record<string, any> {
  return JSON.parse(String(fn.mock.calls[0]?.[1]?.body));
}

const request = {
  personImage: PERSON_BYTES,
  personImageContentType: 'image/jpeg',
  garmentImageUrl: 'https://cdn.example.com/garment.jpg',
  clothType: 'upper' as const,
};

beforeEach(() => {
  secretState.keys.clear();
  uploads.length = 0;
  ssrfCalls.length = 0;
  vi.unstubAllGlobals();
});

describe('clothTypeForCategory', () => {
  it('sends whole-outfit categories as "overall"', () => {
    for (const category of [
      'Ladies Suit',
      'Readymade Suit',
      "Men's Kurta Pajama",
      'Lehenga',
      'Saree',
    ]) {
      expect(clothTypeForCategory(category)).toBe('overall');
    }
  });

  it('treats everything else, and an untagged product, as "upper"', () => {
    expect(clothTypeForCategory('Kurti')).toBe('upper');
    expect(clothTypeForCategory(null)).toBe('upper');
    expect(clothTypeForCategory(undefined)).toBe('upper');
  });

  it('keeps Dupatta out of try-on entirely', () => {
    expect(isUnsupportedTryOnCategory('Dupatta')).toBe(true);
    expect(isUnsupportedTryOnCategory('Kurti')).toBe(false);
    expect(isUnsupportedTryOnCategory(null)).toBe(false);
  });
});

describe('configuration', () => {
  it('reports not-configured when no endpoint is stored', async () => {
    expect(await isCatVtonConfigured()).toBe(false);
  });

  it('reports configured once CATVTON_API_URL is stored', async () => {
    secretState.keys.set('CATVTON_API_URL', ENDPOINT);
    expect(await isCatVtonConfigured()).toBe(true);
  });

  it('refuses to call anything without an endpoint', async () => {
    const fetchFn = mockFetchOnce({});
    await expect(generateTryOn(request)).rejects.toBeInstanceOf(TryOnNotConfiguredError);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('generateTryOn', () => {
  it('posts the wearer photo inline to /runsync and never uploads it', async () => {
    secretState.keys.set('CATVTON_API_URL', ENDPOINT);
    secretState.keys.set('RUNPOD_API_KEY', 'rp-key');
    const fetchFn = mockFetchOnce({
      output: { result_url: 'https://r2.example.com/out.jpg', latency_ms: 34_000, status: 'completed' },
    });

    const result = await generateTryOn(request);

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(`${ENDPOINT}/runsync`);
    expect(init.headers.Authorization).toBe('Bearer rp-key');

    const body = sentBody(fetchFn);
    // The person image arrives as bytes in the payload — the whole reason this
    // path can claim "the wearer's photo is never persisted".
    expect(body.input.person_image_base64).toBe(`data:image/jpeg;base64,${PERSON_B64}`);
    expect(body.input.garment_image_url).toBe(request.garmentImageUrl);
    expect(body.input.cloth_type).toBe('upper');

    // Nothing was written to storage on the generation path.
    expect(uploads).toHaveLength(0);

    expect(result).toEqual({
      outputUrl: 'https://r2.example.com/out.jpg',
      latencyMs: 34_000,
    });
  });

  it('tolerates a missing RUNPOD_API_KEY header-less call for a self-hosted URL', async () => {
    secretState.keys.set('CATVTON_API_URL', 'http://localhost:8000');
    const fetchFn = mockFetchOnce({ output: { result_url: 'https://r2.example.com/out.jpg' } });

    await generateTryOn(request);

    expect(fetchFn.mock.calls[0]![1].headers.Authorization).toBeUndefined();
  });

  it('surfaces a worker-level error (arrives inside output)', async () => {
    secretState.keys.set('CATVTON_API_URL', ENDPOINT);
    mockFetchOnce({ output: { error: 'Model not loaded', status: 'failed' } });

    await expect(generateTryOn(request)).rejects.toThrow(/CatVTON handler error: Model not loaded/);
  });

  it('surfaces a RunPod-level error (the job never reached the handler)', async () => {
    secretState.keys.set('CATVTON_API_URL', ENDPOINT);
    mockFetchOnce({ error: 'Job timed out' });

    await expect(generateTryOn(request)).rejects.toThrow(/RunPod error: Job timed out/);
  });

  it('names the worker status when the response carries no result_url', async () => {
    secretState.keys.set('CATVTON_API_URL', ENDPOINT);
    mockFetchOnce({ output: { status: 'failed' } });

    await expect(generateTryOn(request)).rejects.toThrow(/no result_url \(worker status: failed\)/);
  });

  it('reports an HTTP failure with the status and body', async () => {
    secretState.keys.set('CATVTON_API_URL', ENDPOINT);
    mockFetchOnce({ message: 'unauthorized' }, { ok: false, status: 401 });

    await expect(generateTryOn(request)).rejects.toThrow(/CatVTON request failed \(401\)/);
  });

  it('rejects an empty wearer photo before making a call', async () => {
    secretState.keys.set('CATVTON_API_URL', ENDPOINT);
    const fetchFn = mockFetchOnce({});

    await expect(generateTryOn({ ...request, personImage: Buffer.alloc(0) })).rejects.toThrow(
      /non-empty wearer photo/,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('saveTryOnResultToR2', () => {
  it('keys the result under try-on-results and stores only the result image', async () => {
    expect(tryonResultR2Key('job-1')).toBe('tryon-results/job-1/result.jpg');

    const key = await saveTryOnResultToR2('job-1', 'https://r2.example.com/out.jpg');

    expect(key).toBe('tryon-results/job-1/result.jpg');
    // Exactly one write, and it is the generated image — not the wearer's photo.
    expect(uploads).toEqual([
      { key: 'tryon-results/job-1/result.jpg', buffer: Buffer.from('downloaded-result'), contentType: 'image/jpeg' },
    ]);
    expect(uploads[0]!.buffer.toString()).not.toContain(PERSON_B64);
    expect(ssrfCalls).toEqual(['https://r2.example.com/out.jpg']);
  });

  it('decodes the worker\'s data: URI fallback without a network fetch', async () => {
    const key = await saveTryOnResultToR2(
      'job-2',
      `data:image/jpeg;base64,${Buffer.from('inline-result').toString('base64')}`,
    );

    expect(key).toBe('tryon-results/job-2/result.jpg');
    expect(uploads[0]!.buffer.toString()).toBe('inline-result');
    // A data: URI is not a URL — routing it through ssrfSafeFetch would throw.
    expect(ssrfCalls).toEqual([]);
  });

  it('refuses a malformed data: URI rather than uploading garbage', async () => {
    await expect(saveTryOnResultToR2('job-3', 'data:image/jpeg;base64')).rejects.toThrow(
      /malformed data: URI/,
    );
    expect(uploads).toHaveLength(0);
  });
});
