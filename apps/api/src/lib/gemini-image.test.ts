// Gemini native image client (Interactions API) — tests.
//
// The point of this file is that the product photo is actually SENT. The
// client it replaces built `instances: [{ prompt }]` and was handed no image at
// all, which is why three rounds of prompt tuning could not change the output:
// the model was rendering a garment it had never seen. So the assertions that
// matter most are the ones on the request body's image block.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFetch, mockReadCapped } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockReadCapped: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  getSecret: vi.fn().mockResolvedValue(null),
}));

vi.mock('@kanchuki/ai', () => ({
  readCappedBuffer: mockReadCapped,
  ssrfSafeFetch: mockFetch,
}));

import { generateGeminiImage, inferImageMimeType, parseInteractionImage } from './gemini-image.js';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('GEMINI_API_KEY', 'gemini-key');
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockReadCapped.mockResolvedValue(Buffer.from('photo-bytes'));
});

afterEach(() => {
  vi.unstubAllEnvs();
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

/** An Interaction resource containing one image block, plus a leading one. */
function interactionBody(data = 'RklOQUw=') {
  return {
    id: 'v1_x',
    object: 'interaction',
    model: 'gemini-3.1-flash-image',
    status: 'completed',
    steps: [
      // Gemini 3 image models emit interim thought images. Taking the FIRST
      // image block would return this one.
      {
        type: 'model_output',
        content: [{ type: 'image', data: 'VEhPVUdIVA==', mime_type: 'image/png' }],
      },
      {
        type: 'model_output',
        content: [
          { type: 'text', text: 'done' },
          { type: 'image', data, mime_type: 'image/jpeg' },
        ],
      },
    ],
  };
}

/**
 * `mock.calls` is indexed `T | undefined` under noUncheckedIndexedAccess, so
 * narrow once here (same reason `submitPrompt` in studio-shoot.test.ts casts).
 */
function callAt(i: number): [string, RequestInit] {
  return mockFetch.mock.calls[i] as unknown as [string, RequestInit];
}

/** The API call is the second request: the photo download is the first. */
function apiCall(): [string, RequestInit] {
  return callAt(1);
}

describe('inferImageMimeType', () => {
  it('reads the extension, ignoring query strings', () => {
    expect(inferImageMimeType('https://r2.example/p.png')).toBe('image/png');
    expect(inferImageMimeType('https://r2.example/p.webp?token=abc')).toBe('image/webp');
  });

  it('falls back to JPEG — our compressor outputs JPEG', () => {
    expect(inferImageMimeType('https://r2.example/studio-1.jpg')).toBe('image/jpeg');
    expect(inferImageMimeType('https://r2.example/no-extension')).toBe('image/jpeg');
  });
});

describe('parseInteractionImage', () => {
  it('takes the LAST image block, not the first', () => {
    expect(parseInteractionImage(interactionBody('RklOQUw='))).toEqual({
      base64Data: 'RklOQUw=',
      mimeType: 'image/jpeg',
    });
  });

  it('returns null when no step carries an image', () => {
    expect(
      parseInteractionImage({
        status: 'completed',
        steps: [{ type: 'model_output', content: [{ type: 'text', text: 'no image' }] }],
      }),
    ).toBeNull();
  });

  it('survives a malformed response instead of throwing', () => {
    expect(parseInteractionImage(null)).toBeNull();
    expect(parseInteractionImage({ steps: 'nope' })).toBeNull();
    expect(parseInteractionImage({ steps: [null, { content: [{}] }] })).toBeNull();
  });

  it('defaults the mime type rather than emitting undefined', () => {
    expect(
      parseInteractionImage({
        steps: [{ type: 'model_output', content: [{ type: 'image', data: 'QUJD' }] }],
      }),
    ).toEqual({ base64Data: 'QUJD', mimeType: 'image/jpeg' });
  });
});

describe('generateGeminiImage', () => {
  it('sends the product photo as an image input block', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, body: null }) // photo download
      .mockResolvedValueOnce(jsonResponse(interactionBody()));

    const out = await generateGeminiImage('Edit only the background.', {
      inputImageUrl: 'https://r2.example/product.jpg',
    });

    expect(out).toEqual({ base64Data: 'RklOQUw=', mimeType: 'image/jpeg' });

    // The photo was actually fetched…
    expect(callAt(0)[0]).toBe('https://r2.example/product.jpg');

    const [url, init] = apiCall();
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
    // …and the key is a header, not a `?key=` query param (which lands in logs).
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('gemini-key');
    expect(url).not.toContain('key=');

    const body = JSON.parse(init.body as string) as {
      model: string;
      input: { type: string; text?: string; data?: string; mime_type?: string }[];
      response_format: { type: string; aspect_ratio: string };
    };
    expect(body.model).toBe('gemini-3.1-flash-image');
    expect(body.input[0]).toEqual({ type: 'text', text: 'Edit only the background.' });
    // THE regression this client exists for: base64 of the fetched photo bytes.
    expect(body.input[1]).toEqual({
      type: 'image',
      mime_type: 'image/jpeg',
      data: Buffer.from('photo-bytes').toString('base64'),
    });
    expect(body.response_format).toEqual({ type: 'image', aspect_ratio: '3:4' });
  });

  it('switches model + aspect ratio on request', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, body: null })
      .mockResolvedValueOnce(jsonResponse(interactionBody()));

    await generateGeminiImage('x', {
      inputImageUrl: 'https://r2.example/p.jpg',
      model: 'gemini-3-pro-image',
      aspectRatio: '1:1',
    });

    const body = JSON.parse(apiCall()[1].body as string) as {
      model: string;
      response_format: { aspect_ratio: string };
    };
    expect(body.model).toBe('gemini-3-pro-image');
    expect(body.response_format.aspect_ratio).toBe('1:1');
  });

  it('is text-to-image when no photo is supplied', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(interactionBody()));

    await generateGeminiImage('A studio backdrop.');

    // One request only — nothing was downloaded.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(callAt(0)[1].body as string) as {
      input: unknown[];
    };
    expect(body.input).toEqual([{ type: 'text', text: 'A studio backdrop.' }]);
  });

  it('maps a non-ok response to a safe AppError', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, body: null })
      .mockResolvedValueOnce(jsonResponse({ error: 'bad key' }, false, 400));

    await expect(
      generateGeminiImage('x', { inputImageUrl: 'https://r2.example/p.jpg' }),
    ).rejects.toThrow(/Gemini image generation failed \(400\)/);
  });

  it('surfaces a failed interaction rather than reporting "no image"', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, body: null }).mockResolvedValueOnce(
      jsonResponse({
        status: 'failed',
        errors: [{ message: 'blocked by safety policy' }],
      }),
    );

    await expect(
      generateGeminiImage('x', { inputImageUrl: 'https://r2.example/p.jpg' }),
    ).rejects.toThrow(/blocked by safety policy/);
  });

  it('throws when the photo cannot be read', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, body: null });

    await expect(
      generateGeminiImage('x', { inputImageUrl: 'https://r2.example/gone.jpg' }),
    ).rejects.toThrow(/Could not read the source photo for Gemini \(404\)/);
  });

  it('throws 503 when GEMINI_API_KEY is unset', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    await expect(generateGeminiImage('x')).rejects.toThrow(/not configured/i);
  });

  it('reports a completed interaction with no image as a failure, not a blank image', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ status: 'completed', steps: [{ type: 'model_output', content: [] }] }),
    );
    await expect(generateGeminiImage('x')).rejects.toThrow(/No image was returned by Gemini/);
  });
});
