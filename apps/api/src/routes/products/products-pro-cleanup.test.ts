import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCompressImageToTarget,
  mockUploadBuffer,
  mockPublicUrl,
  mockScoreSharpness,
  mockPickSharpest,
  mockBackgroundFindFirst,
  mockAuditCreate,
  mockRunCleanup,
  mockCheckQuota,
  mockIncrementUsage,
  mockGetSecret,
  mockSpawnSync,
  mockFetchImageBuffer,
  mockIsDarkImage,
} = vi.hoisted(() => ({
  mockCompressImageToTarget: vi.fn(),
  mockUploadBuffer: vi.fn(),
  mockPublicUrl: vi.fn(),
  mockScoreSharpness: vi.fn(),
  mockPickSharpest: vi.fn(),
  mockBackgroundFindFirst: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockRunCleanup: vi.fn(),
  mockCheckQuota: vi.fn(),
  mockIncrementUsage: vi.fn(),
  mockGetSecret: vi.fn(),
  mockSpawnSync: vi.fn(),
  mockFetchImageBuffer: vi.fn(),
  mockIsDarkImage: vi.fn(),
}));

vi.mock('@kanchuki/ai', () => ({
  compressImageToTarget: mockCompressImageToTarget,
  uploadBuffer: mockUploadBuffer,
  publicUrl: mockPublicUrl,
  scoreSharpness: mockScoreSharpness,
  pickSharpest: mockPickSharpest,
  fetchImageBuffer: mockFetchImageBuffer,
  isDarkImage: mockIsDarkImage,
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    backgroundImage: { findFirst: mockBackgroundFindFirst },
    auditLog: { create: mockAuditCreate },
  },
  getSecret: mockGetSecret,
}));

// The status route checks for a local python binary via spawnSync; the real
// runner module is fully mocked above, so this only affects the route under
// test. execFile is stubbed too so any accidental real import stays inert.
vi.mock('node:child_process', () => ({
  spawnSync: mockSpawnSync,
  execFile: vi.fn(),
}));

// The route delegates the whole pipeline (fetch + python/SAM2 + output) to
// the shared runner — the mock returns a cleaned JPEG + stdout directly.
vi.mock('../../lib/photo-cleanup-runner.js', () => ({
  runPhotoCleanup: mockRunCleanup,
  serializePhotoCleanup: (fn: () => Promise<unknown>) => fn(),
}));

vi.mock('../../lib/quota.js', () => ({
  checkQuota: mockCheckQuota,
  incrementUsage: mockIncrementUsage,
}));

import { errorHandler } from '../../plugins/error-handler.js';
import { productsProCleanupRoutes } from './products-pro-cleanup.js';

const RETAILER_ID = 'retailer_1';

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.addHook('preHandler', async (request) => {
    request.retailerId = RETAILER_ID;
  });
  await app.register(productsProCleanupRoutes, { prefix: '/v1/products' });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPublicUrl.mockImplementation((key: string) => `https://cdn.example/${key}`);
  mockCompressImageToTarget.mockResolvedValue({ buffer: Buffer.from('cleaned-jpeg') });
  mockUploadBuffer.mockResolvedValue(undefined);
  mockCheckQuota.mockResolvedValue(undefined);
  mockIncrementUsage.mockResolvedValue(undefined);
  mockGetSecret.mockResolvedValue('');
  // F-028 auto-contrast path: default fetch rejects (no network in tests)
  // so the fallback-to-white branch runs unless a test overrides it.
  mockFetchImageBuffer.mockReset().mockRejectedValue(new Error('mock: no network'));
  mockIsDarkImage.mockReset();
  // Default: the runner "runs" the pipeline and returns a cleaned JPEG +
  // stdout. Per-test overrides can replace this.
  mockRunCleanup.mockResolvedValue({
    jpeg: Buffer.from('cleaned-jpeg'),
    output: 'done: photo.jpg -> photo.jpg\nremove-hardware: inpainted 100 hardware pixels',
  });
});

const validBody = {
  photos: [
    { r2_key: `retailers/${RETAILER_ID}/products/p1/a.jpg`, url: 'https://cdn.example/a.jpg' },
    { r2_key: `retailers/${RETAILER_ID}/products/p1/b.jpg`, url: 'https://cdn.example/b.jpg' },
  ],
  remove_hardware: true,
  tight_crop: true,
  background_image_id: null,
};

describe('POST /products/pro-cleanup', () => {
  it('cleans kept photos, flags the sharpest primary, meters quota and audits', async () => {
    mockScoreSharpness.mockResolvedValueOnce(5).mockResolvedValueOnce(12);
    mockPickSharpest.mockReturnValue(1);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/pro-cleanup',
      payload: validBody,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.photos).toHaveLength(2);
    expect(body.photos[0]).toMatchObject({
      r2_key: `retailers/${RETAILER_ID}/products/p1/a-pro.jpg`,
      is_primary: false,
      hardware_removed: true,
      error: null,
    });
    expect(body.photos[1].is_primary).toBe(true);
    expect(body.primary_url).toBe(body.photos[1].url);

    // Quota: BG_REMOVAL for both photos; pipeline delegated to the shared
    // runner with the long SAM2 cap (remove_hardware=true).
    expect(mockCheckQuota).toHaveBeenCalledWith(RETAILER_ID, 'BG_REMOVAL', 2);
    expect(mockIncrementUsage).toHaveBeenCalledWith(RETAILER_ID, 'BG_REMOVAL');
    expect(mockRunCleanup).toHaveBeenCalledTimes(2);
    expect(mockRunCleanup).toHaveBeenCalledWith(
      expect.objectContaining({ removeHardware: true, tightCrop: true, bgImageUrl: null }),
      600_000,
    );

    // Audit entry recorded.
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actor_type: 'retailer',
          action: 'PHOTO_CLEANUP',
          metadata: expect.objectContaining({ photo_count: 2, primary_score: 12 }),
        }),
      }),
    );
    await app.close();
  });

  it('rejects an r2_key outside the retailer path prefix (ownership guard)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/pro-cleanup',
      payload: {
        photos: [
          { r2_key: 'retailers/other_store/products/p1/a.jpg', url: 'https://cdn.example/a.jpg' },
        ],
      },
    });
    expect(res.statusCode).toBe(422);
    expect(mockRunCleanup).not.toHaveBeenCalled();
    await app.close();
  });

  it('422s on an unknown/inactive background image', async () => {
    mockBackgroundFindFirst.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/pro-cleanup',
      payload: { ...validBody, background_image_id: 'bg_nope' },
    });
    expect(res.statusCode).toBe(422);
    expect(mockRunCleanup).not.toHaveBeenCalled();
    await app.close();
  });

  it('per-photo failure lands in the row error instead of failing the batch', async () => {
    // First photo's pipeline throws; second succeeds.
    mockRunCleanup
      .mockRejectedValueOnce(new Error('fetch failed (500)'))
      .mockResolvedValueOnce({ jpeg: Buffer.from('x'), output: '' });
    mockScoreSharpness.mockResolvedValueOnce(7);
    mockPickSharpest.mockReturnValue(0);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/pro-cleanup',
      payload: validBody,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.photos[0].error).toContain('fetch failed');
    expect(body.photos[1].error).toBeNull();
    expect(body.primary_url).toBe(body.photos[1].url);
    await app.close();
  });

  it('422s when every photo fails on a photo-quality problem', async () => {
    mockRunCleanup.mockRejectedValue(
      new Error('cannot identify image file — unsupported or corrupt JPEG'),
    );
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/pro-cleanup',
      payload: validBody,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toContain('failed to process');
    await app.close();
  });

  it('503 SERVICE_UNAVAILABLE when every photo fails on an environment problem (cleanup service/python down)', async () => {
    mockRunCleanup.mockRejectedValue(
      new Error(
        'python3/python not found on this host. Install Python + `pip install rembg pillow simple-lama-inpainting` to use photo cleanup.',
      ),
    );
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/pro-cleanup',
      payload: validBody,
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('SERVICE_UNAVAILABLE');
    expect(res.json().error.message).toContain('Photo mode');
    await app.close();
  });

  it('surfaces the PLAN_LIMIT_EXCEEDED quota gate', async () => {
    const { AppError } = await import('../../plugins/error-handler.js');
    mockCheckQuota.mockRejectedValue(new AppError('PLAN_LIMIT_EXCEEDED', 'bg removal', 409));
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/pro-cleanup',
      payload: validBody,
    });
    expect(res.statusCode).toBe(409);
    expect(mockRunCleanup).not.toHaveBeenCalled();
    await app.close();
  });

  it('requires at least 1 photo and at most 5', async () => {
    const app = await buildApp();
    const none = await app.inject({
      method: 'POST',
      url: '/v1/products/pro-cleanup',
      payload: { photos: [] },
    });
    expect(none.statusCode).toBe(422);
    await app.close();
  });

  it('tap-to-fix: passes hardware/garment points to the runner and flags tap_removed', async () => {
    mockScoreSharpness.mockResolvedValueOnce(9);
    mockPickSharpest.mockReturnValue(0);
    // Sidecar/pipeline reports a point-prompt inpainting run.
    mockRunCleanup.mockResolvedValue({
      jpeg: Buffer.from('cleaned-jpeg'),
      output:
        'done: photo.jpg -> photo.jpg\nremove-hardware: point-prompt inpainted 5123 px (4.2% of frame)',
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/pro-cleanup',
      payload: {
        photos: [
          {
            r2_key: `retailers/${RETAILER_ID}/products/p1/a.jpg`,
            url: 'https://cdn.example/a.jpg',
            hardware_points: [
              [0.5, 0.35],
              [0.6, 0.25],
            ],
            garment_points: [[0.5, 0.6]],
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.photos[0].tap_removed).toBe(true);
    expect(mockRunCleanup).toHaveBeenCalledWith(
      expect.objectContaining({
        promptPoints: [
          [0.5, 0.35],
          [0.6, 0.25],
        ],
        promptExcludes: [[0.5, 0.6]],
        removeHardware: false,
      }),
      600_000, // tap-to-fix counts as a SAM2 run -> long cap
    );
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ tap_removed_count: 1 }),
        }),
      }),
    );
    await app.close();
  });

  it('rejects out-of-range tap points (must be normalized 0..1)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/pro-cleanup',
      payload: {
        photos: [
          {
            r2_key: `retailers/${RETAILER_ID}/products/p1/a.jpg`,
            url: 'https://cdn.example/a.jpg',
            hardware_points: [[1.5, 0.5]],
          },
        ],
      },
    });
    expect(res.statusCode).toBe(422);
    expect(mockRunCleanup).not.toHaveBeenCalled();
    await app.close();
  });
  it('F-028 auto-contrast: dark first shot → picks a LIGHT backdrop', async () => {
    mockFetchImageBuffer.mockResolvedValue(Buffer.from('dark-raw'));
    mockIsDarkImage.mockResolvedValue(true);
    mockBackgroundFindFirst.mockResolvedValue({
      id: 'bg1',
      image_url: 'https://cdn.example/backdrops/light.jpg',
      is_active: true,
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/pro-cleanup',
      payload: validBody,
    });

    expect(res.statusCode).toBe(200);
    // Auto-contrast asked for the opposite tone (dark garment → LIGHT):
    // isDarkImage(true) → pickContrastBackground('dark') → findFirst LIGHT.
    expect(mockIsDarkImage).toHaveBeenCalledWith(Buffer.from('dark-raw'));
    expect(mockBackgroundFindFirst).toHaveBeenCalledWith({
      where: { is_active: true, tone: 'LIGHT' },
      orderBy: { created_at: 'desc' },
    });
    // The picked backdrop flows into every cleaned photo.
    expect(mockRunCleanup).toHaveBeenCalledWith(
      expect.objectContaining({ bgImageUrl: 'https://cdn.example/backdrops/light.jpg' }),
      expect.any(Number),
    );
    await app.close();
  });

  it('F-028 auto-contrast: light first shot → picks a DARK backdrop', async () => {
    mockFetchImageBuffer.mockResolvedValue(Buffer.from('light-raw'));
    mockIsDarkImage.mockResolvedValue(false);
    mockBackgroundFindFirst.mockResolvedValue({
      id: 'bg2',
      image_url: 'https://cdn.example/backdrops/dark.jpg',
      is_active: true,
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/pro-cleanup',
      payload: validBody,
    });

    expect(res.statusCode).toBe(200);
    expect(mockRunCleanup).toHaveBeenCalledWith(
      expect.objectContaining({ bgImageUrl: 'https://cdn.example/backdrops/dark.jpg' }),
      expect.any(Number),
    );
    await app.close();
  });

  it('F-028 auto-contrast: unclassifiable mid-tone → falls back to white (no backdrop)', async () => {
    mockFetchImageBuffer.mockResolvedValue(Buffer.from('mid-raw'));
    mockIsDarkImage.mockResolvedValue(null);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/pro-cleanup',
      payload: validBody,
    });

    expect(res.statusCode).toBe(200);
    // No pick, no background query — plain white composite as before F-028.
    expect(mockBackgroundFindFirst).not.toHaveBeenCalled();
    expect(mockRunCleanup).toHaveBeenCalledWith(
      expect.objectContaining({ bgImageUrl: null }),
      expect.any(Number),
    );
    await app.close();
  });

  it('F-028 auto-contrast: classification failure (fetch down) falls back to white', async () => {
    mockFetchImageBuffer.mockRejectedValue(new Error('sidecar unreachable'));
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/pro-cleanup',
      payload: validBody,
    });

    expect(res.statusCode).toBe(200);
    expect(mockBackgroundFindFirst).not.toHaveBeenCalled();
    expect(mockRunCleanup).toHaveBeenCalledWith(
      expect.objectContaining({ bgImageUrl: null }),
      expect.any(Number),
    );
    await app.close();
  });
});

describe('GET /products/pro-cleanup/status', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('service mode + healthy sidecar → available', async () => {
    mockGetSecret.mockResolvedValue('http://cleanup.example');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/products/pro-cleanup/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      available: true,
      mode: 'service',
      service_url_set: true,
      service_healthy: true,
      local_python_available: false,
    });
    await app.close();
  });

  it('service mode + sidecar connection refused → unavailable', async () => {
    mockGetSecret.mockResolvedValue('http://cleanup.example');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/products/pro-cleanup/status' });
    expect(res.json().data).toMatchObject({ available: false, service_healthy: false });
    await app.close();
  });

  it('service mode + sidecar answers non-ok → unavailable', async () => {
    mockGetSecret.mockResolvedValue('http://cleanup.example');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/products/pro-cleanup/status' });
    expect(res.json().data).toMatchObject({ available: false, service_healthy: false });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'http://cleanup.example/health',
      expect.objectContaining({ signal: expect.anything() }),
    );
    await app.close();
  });

  it('local mode + python binary exists → available', async () => {
    mockGetSecret.mockResolvedValue('');
    mockSpawnSync.mockReturnValue({ error: null, status: 0 });
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/products/pro-cleanup/status' });
    expect(res.json().data).toMatchObject({
      available: true,
      mode: 'local',
      service_url_set: false,
      local_python_available: true,
    });
    await app.close();
  });

  it('local mode + no python binary → unavailable', async () => {
    mockGetSecret.mockResolvedValue('');
    mockSpawnSync.mockReturnValue({ error: new Error('ENOENT'), status: null });
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/products/pro-cleanup/status' });
    expect(res.json().data).toMatchObject({
      available: false,
      mode: 'local',
      local_python_available: false,
    });
    await app.close();
  });
});
