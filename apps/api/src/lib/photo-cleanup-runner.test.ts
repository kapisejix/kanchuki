import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFetch, mockGetSecret, mockExecFile } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockGetSecret: vi.fn(),
  mockExecFile: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({ getSecret: mockGetSecret }));

// ssrfSafeFetch/readCappedBuffer are imported but only exercised through the
// fetch of the input photo. Stub them so the module loads and local mode
// works without real HTTP.
vi.mock('@kanchuki/ai', () => ({
  ssrfSafeFetch: vi.fn(async () => ({ ok: true })),
  readCappedBuffer: vi.fn(async () => Buffer.from('raw-jpeg')),
}));

// runPhotoCleanupScript uses promisify(execFile) — the mock must be
// callback-style. Local mode writes the output file where the runner reads it
// back (args[1] = output dir passed to batch-clean-photos.py).
vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
}));

import { buildCleanupScriptArgs, runPhotoCleanup } from './photo-cleanup-runner.js';

beforeEach(() => {
  vi.clearAllMocks();
  // Empty (not undefined — Node coerces undefined to the string "undefined",
  // which is truthy and would send the test down the service path).
  process.env.PHOTO_CLEANUP_SERVICE_URL = '';
  process.env.CLEANUP_SHARED_SECRET = 'test-secret';
  // The runner reads BOTH via getSecret (F-012 pattern) — mirror the real
  // env-fallback semantics per key.
  mockGetSecret.mockImplementation(async (key: string) => {
    if (key === 'PHOTO_CLEANUP_SERVICE_URL') return process.env.PHOTO_CLEANUP_SERVICE_URL?.trim() || undefined;
    if (key === 'CLEANUP_SHARED_SECRET') return process.env.CLEANUP_SHARED_SECRET || undefined;
    return undefined;
  });
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => '',
    json: async () => ({ output: 'done', image_b64: Buffer.from('jpeg-bytes').toString('base64') }),
  });
  vi.stubGlobal('fetch', mockFetch);
  mockExecFile.mockImplementation(
    (
      _bin: string,
      args: string[],
      _opts: unknown,
      cb: (err: Error | null, result: { stdout: string; stderr: string }) => void,
    ) => {
      // runPhotoCleanupScript prepends the script path: args = [script,
      // inputDir, outputDir, ...flags] — so outputDir is args[2].
      const outDir = args[2] as string;
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, 'photo.jpg'), 'jpeg-bytes');
      cb(null, { stdout: 'done: photo.jpg -> photo.jpg', stderr: '' });
    },
  );
});

describe('buildCleanupScriptArgs', () => {
  const base = { photoUrl: 'x' };

  it('composite mode: bg-image, hardware, tight-crop', () => {
    expect(
      buildCleanupScriptArgs('i', 'o', {
        ...base,
        bgImagePath: '/tmp/bg.jpg',
        removeHardware: true,
        tightCrop: true,
      }),
    ).toEqual(['i', 'o', '--bg-image', '/tmp/bg.jpg', '--remove-hardware', '--tight-crop']);
  });

  it('blur (portrait) mode wins over bg-image and drops other flags', () => {
    expect(
      buildCleanupScriptArgs('i', 'o', {
        ...base,
        bgImagePath: '/tmp/bg.jpg',
        blur: 25,
        removeHardware: true,
        tightCrop: true,
      }),
    ).toEqual(['i', 'o', '--blur', '25']);
  });

  it('ghost-mannequin forces composite (blur ignored)', () => {
    expect(
      buildCleanupScriptArgs('i', 'o', {
        ...base,
        blur: 25,
        ghostMannequin: true,
      }),
    ).toEqual(['i', 'o', '--ghost-mannequin']);
  });

  it('tap-to-fix points serialize as normalized x,y;x,y', () => {
    expect(
      buildCleanupScriptArgs('i', 'o', {
        ...base,
        promptPoints: [
          [0.5, 0.35],
          [0.6, 0.25],
        ],
        promptExcludes: [[0.5, 0.6]],
        crop: { x1: 10, y1: 20, x2: 300, y2: 400 },
      }),
    ).toEqual([
      'i',
      'o',
      '--prompt-points',
      '0.5,0.35;0.6,0.25',
      '--prompt-excludes',
      '0.5,0.6',
      '--crop',
      '10,20,300,400',
    ]);
  });
});

describe('runPhotoCleanup dispatch', () => {
  it('service mode: POSTs multipart to PHOTO_CLEANUP_SERVICE_URL with X-Cleanup-Key', async () => {
    process.env.PHOTO_CLEANUP_SERVICE_URL = 'http://cleanup.example:8001/';

    const result = await runPhotoCleanup(
      { photoUrl: 'https://cdn.example/a.jpg', removeHardware: true },
      60_000,
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://cleanup.example:8001/clean');
    expect((init.headers as Record<string, string>)['X-Cleanup-Key']).toBe('test-secret');
    expect(init.body).toBeInstanceOf(FormData);
    expect(result.jpeg).toEqual(Buffer.from('jpeg-bytes'));
    expect(result.output).toBe('done');
  });

  it('service mode: no X-Cleanup-Key header when secret unset', async () => {
    process.env.PHOTO_CLEANUP_SERVICE_URL = 'http://cleanup.example:8001';
    process.env.CLEANUP_SHARED_SECRET = '';

    await runPhotoCleanup({ photoUrl: 'https://cdn.example/a.jpg' }, 60_000);

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['X-Cleanup-Key']).toBeUndefined();
  });

  it('service mode: non-ok response surfaces the sidecar detail', async () => {
    process.env.PHOTO_CLEANUP_SERVICE_URL = 'http://cleanup.example:8001';
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => '{"detail":"pipeline failed"}',
    });

    await expect(
      runPhotoCleanup({ photoUrl: 'https://cdn.example/a.jpg' }, 60_000),
    ).rejects.toThrow('cleanup service 500');
  });

  it('service mode: AbortSignal timeout passes through', async () => {
    process.env.PHOTO_CLEANUP_SERVICE_URL = 'http://cleanup.example:8001';

    await runPhotoCleanup({ photoUrl: 'https://cdn.example/a.jpg' }, 123_456);

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect((init.signal as AbortSignal).aborted).toBe(false);
  });

  it('local mode (no service URL): shells out via execFile, never calls fetch', async () => {
    const result = await runPhotoCleanup({ photoUrl: 'https://cdn.example/a.jpg' }, 5_000);

    expect(mockExecFile).toHaveBeenCalledTimes(1);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.jpeg).toEqual(Buffer.from('jpeg-bytes'));
    expect(result.output).toContain('done');
  });
});
