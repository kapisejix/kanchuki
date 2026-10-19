// F-045 PR-6 T15 — /v1/public/my-style analyze, poll and profile/clear.
//
// Real: the analysis state lib, the consent lib, the photo store. Mocked at the boundary:
// the DB, the passport session, quota, the provider check, the queue. So a route that
// skips the lock, the consent event or the discard fails here instead of passing on a
// stubbed call shape (RC-037).
import { MY_STYLE_CONSENT } from '@kanchuki/shared';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError, errorHandler } from '../../../plugins/error-handler.js';

const {
  flags,
  mockSession,
  mockConsentFind,
  mockConsentCreate,
  mockAccountUpdate,
  mockCheckQuota,
  mockProvider,
  mockEnqueue,
} = vi.hoisted(() => ({
  flags: { analysis: true },
  mockSession: vi.fn(),
  mockConsentFind: vi.fn(),
  mockConsentCreate: vi.fn(),
  mockAccountUpdate: vi.fn(),
  mockCheckQuota: vi.fn(),
  mockProvider: vi.fn(),
  mockEnqueue: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    consentEvent: { findFirst: mockConsentFind, create: mockConsentCreate },
    customerAccount: { update: mockAccountUpdate },
  },
}));
vi.mock('@kanchuki/ai', () => ({
  hasConfiguredVisionProvider: mockProvider,
  deleteObject: vi.fn(),
}));
vi.mock('../passport/passport-helpers.js', () => ({ getPassportSession: mockSession }));
vi.mock('../../../lib/quota.js', () => ({ checkCustomerQuota: mockCheckQuota }));
vi.mock('../../../jobs/index.js', () => ({ addMyStyleAnalyzeJob: mockEnqueue }));
vi.mock('../../../lib/features.js', () => ({
  get CUSTOMER_STYLE_ANALYSIS() {
    return flags.analysis;
  },
}));

import {
  __resetMyStyleState,
  completeAnalysis,
  getAnalysis,
  startAnalysis,
} from '../../../lib/my-style-analysis.js';
import { tryOnPhotoCount } from '../../../lib/tryon-photo-store.js';

// The photo store is process-global and has no reset; count relative to the test's start.
let baseline = 0;
const photos = () => tryOnPhotoCount() - baseline;
import { publicMyStyleAnalyzeRoutes } from '../public-my-style-analyze.js';

const ACCT = 'acct_1';
const BOUNDARY = 'kanchuki-test-boundary';
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('fake-jpeg-body')]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('x'),
]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);

function payload(bytes: Buffer = JPEG, contentType = 'image/jpeg') {
  return Buffer.concat([
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="photo"; filename="s.jpg"\r\nContent-Type: ${contentType}\r\n\r\n`,
    ),
    bytes,
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
  ]);
}

async function build() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(publicMyStyleAnalyzeRoutes, { prefix: '/my-style' });
  await app.ready();
  return app;
}
type App = Awaited<ReturnType<typeof build>>;

function analyze(
  app: App,
  o: {
    bytes?: Buffer;
    type?: string;
    consent?: string | null;
    query?: string;
    multipart?: boolean;
  } = {},
) {
  const v = o.consent === undefined ? MY_STYLE_CONSENT.version : o.consent;
  const q = [v === null ? '' : `consent_version=${encodeURIComponent(v)}`, o.query ?? '']
    .filter(Boolean)
    .join('&');
  return app.inject({
    method: 'POST',
    url: `/my-style/analyze${q ? `?${q}` : ''}`,
    headers:
      o.multipart === false
        ? { 'content-type': 'application/json' }
        : { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
    payload: o.multipart === false ? '{}' : payload(o.bytes, o.type),
  });
}

beforeEach(() => {
  baseline = tryOnPhotoCount();
  __resetMyStyleState();
  flags.analysis = true;
  mockSession.mockReset().mockResolvedValue({ customer_account_id: ACCT, customer_account: {} });
  mockConsentFind.mockReset().mockResolvedValue(null);
  mockConsentCreate.mockReset().mockResolvedValue({});
  mockAccountUpdate.mockReset().mockResolvedValue({});
  mockCheckQuota.mockReset().mockResolvedValue(undefined);
  mockProvider.mockReset().mockResolvedValue(true);
  mockEnqueue.mockReset().mockResolvedValue(undefined);
});

describe('POST /analyze', () => {
  it('202 with a job id; consent recorded; photo stashed in-process, not in the job payload', async () => {
    const app = await build();
    const res = await analyze(app);
    expect(res.statusCode).toBe(202);
    expect(res.headers['cache-control']).toBe('private, no-store');
    const { job_id, status } = res.json().data;
    expect(job_id).toMatch(/^mystyle_/);
    expect(status).toBe('processing');

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    const payloadSent = mockEnqueue.mock.calls[0]?.[0];
    expect(payloadSent).toEqual({ job_id, customer_account_id: ACCT, mode: 'selfie' });
    expect(JSON.stringify(payloadSent)).not.toContain('fake-jpeg');
    expect(photos()).toBe(1);

    expect(mockConsentCreate).toHaveBeenCalledTimes(1);
    expect(mockConsentCreate.mock.calls[0]?.[0].data).toMatchObject({
      customer_account_id: ACCT,
      kind: 'MY_STYLE_PHOTO_CONSENTED',
      notice_version: MY_STYLE_CONSENT.version,
    });
    expect(await getAnalysis(job_id)).toEqual({ account_id: ACCT, status: 'processing' });
  });

  it.each([
    ['png', PNG, 'image/png'],
    ['webp', WEBP, 'image/webp'],
  ])('accepts a %s by its signature', async (_n, bytes, type) => {
    const res = await analyze(await build(), { bytes, type });
    expect(res.statusCode).toBe(202);
  });

  it('401 without a passport session, and nothing is spent', async () => {
    mockSession.mockResolvedValue(null);
    const res = await analyze(await build());
    expect(res.statusCode).toBe(401);
    expect(mockCheckQuota).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('kill-switch off: 404 before anything else', async () => {
    flags.analysis = false;
    const res = await analyze(await build());
    expect(res.statusCode).toBe(404);
    expect(mockSession).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('503 and no spend when no vision provider is configured (never a fake success)', async () => {
    mockProvider.mockResolvedValue(false);
    const res = await analyze(await build());
    expect(res.statusCode).toBe(503);
    expect(mockCheckQuota).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(photos()).toBe(0);
  });

  describe('consent gate', () => {
    it('422 with no consent_version and no remembered grant', async () => {
      const res = await analyze(await build(), { consent: null });
      expect(res.statusCode).toBe(422);
      expect(mockConsentCreate).not.toHaveBeenCalled();
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('422 on a stale notice version', async () => {
      const res = await analyze(await build(), { consent: 'mystyle-0.1' });
      expect(res.statusCode).toBe(422);
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('a remembered live grant needs no version and writes no new event', async () => {
      mockConsentFind.mockResolvedValue({ kind: 'MY_STYLE_PHOTO_CONSENTED' });
      const res = await analyze(await build(), { consent: null });
      expect(res.statusCode).toBe(202);
      expect(mockConsentCreate).not.toHaveBeenCalled();
    });

    it('a later withdrawal revokes the remembered grant', async () => {
      mockConsentFind.mockResolvedValue({ kind: 'MY_STYLE_PHOTO_CONSENT_WITHDRAWN' });
      const res = await analyze(await build(), { consent: null });
      expect(res.statusCode).toBe(422);
    });
  });

  it('402 CUSTOMER_LIMIT_EXCEEDED when over quota, checked for STYLE_ANALYSIS', async () => {
    mockCheckQuota.mockRejectedValue(
      new AppError('CUSTOMER_LIMIT_EXCEEDED', 'You have reached your limit', 402),
    );
    const res = await analyze(await build());
    expect(res.statusCode).toBe(402);
    expect(res.json().error.code).toBe('CUSTOMER_LIMIT_EXCEEDED');
    expect(mockCheckQuota).toHaveBeenCalledWith(ACCT, 'STYLE_ANALYSIS');
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  describe('the photo', () => {
    it('422 when the request is not multipart', async () => {
      expect((await analyze(await build(), { multipart: false })).statusCode).toBe(422);
    });

    it('422 for a non-image MIME', async () => {
      const res = await analyze(await build(), { bytes: Buffer.from('hello'), type: 'text/plain' });
      expect(res.statusCode).toBe(422);
    });

    it('422 when the bytes are not an image even though the client says image/jpeg', async () => {
      const res = await analyze(await build(), { bytes: Buffer.from('<?php evil ?>') });
      expect(res.statusCode).toBe(422);
      expect(mockEnqueue).not.toHaveBeenCalled();
      expect(photos()).toBe(0);
    });

    it('422 for an empty file', async () => {
      const res = await analyze(await build(), { bytes: Buffer.alloc(0) });
      expect(res.statusCode).toBe(422);
    });

    it('413 over 10 MB', async () => {
      const big = Buffer.concat([JPEG, Buffer.alloc(11 * 1024 * 1024)]);
      const res = await analyze(await build(), { bytes: big });
      expect(res.statusCode).toBe(413);
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('mode=garment (find similar) is accepted and enqueued as a garment job', async () => {
      const res = await analyze(await build(), { query: 'mode=garment' });
      expect(res.statusCode).toBe(202);
      expect(mockEnqueue.mock.calls[0]?.[0]).toMatchObject({
        customer_account_id: ACCT,
        mode: 'garment',
      });
      expect(JSON.stringify(mockEnqueue.mock.calls[0]?.[0])).not.toContain('fake-jpeg');
    });

    it('garment mode passes the same gates: consent, quota (STYLE_ANALYSIS) and provider', async () => {
      expect(
        (await analyze(await build(), { query: 'mode=garment', consent: null })).statusCode,
      ).toBe(422);
      mockProvider.mockResolvedValue(false);
      expect((await analyze(await build(), { query: 'mode=garment' })).statusCode).toBe(503);
      mockProvider.mockResolvedValue(true);
      await analyze(await build(), { query: 'mode=garment' });
      expect(mockCheckQuota).toHaveBeenCalledWith(ACCT, 'STYLE_ANALYSIS');
    });

    it('an unknown mode is a 422', async () => {
      const res = await analyze(await build(), { query: 'mode=banana' });
      expect(res.statusCode).toBe(422);
    });
  });

  it('409 while the shopper already has an analysis running', async () => {
    const app = await build();
    expect((await analyze(app)).statusCode).toBe(202);
    const second = await analyze(app);
    expect(second.statusCode).toBe(409);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(photos()).toBe(1);
  });

  it('a failed enqueue drops the photo, frees the lock and fails loudly', async () => {
    mockEnqueue.mockRejectedValue(new Error('redis down'));
    const app = await build();
    const res = await analyze(app);
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
    expect(photos()).toBe(0);
    mockEnqueue.mockResolvedValue(undefined);
    expect((await analyze(app)).statusCode).toBe(202); // lock was released
  });
});

describe('GET /analyze/:jobId', () => {
  it('returns the caller’s job state with no-store', async () => {
    await startAnalysis('mystyle_a', ACCT);
    const res = await (await build()).inject({ method: 'GET', url: '/my-style/analyze/mystyle_a' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.json()).toEqual({ data: { status: 'processing' } });
  });

  it('ready carries the profile; failed carries the reason code', async () => {
    const app = await build();
    const profile = { undertone: 'cool', depth: 'deep', frame: 'tall' } as const;
    await startAnalysis('mystyle_a', ACCT);
    await completeAnalysis('mystyle_a', { status: 'ready', profile });
    expect(
      (await app.inject({ method: 'GET', url: '/my-style/analyze/mystyle_a' })).json(),
    ).toEqual({ data: { status: 'ready', profile } });
    await startAnalysis('mystyle_b', ACCT);
    await completeAnalysis('mystyle_b', { status: 'failed', reason: 'face_not_clear' });
    expect(
      (await app.inject({ method: 'GET', url: '/my-style/analyze/mystyle_b' })).json(),
    ).toEqual({ data: { status: 'failed', reason: 'face_not_clear' } });
  });

  it('a ready garment job carries the descriptor and no profile', async () => {
    const garment = { category: 'Kurti', color_family: 'yellow', embellishments: [] } as const;
    await startAnalysis('mystyle_g', ACCT);
    await completeAnalysis('mystyle_g', {
      status: 'ready',
      garment: { ...garment, embellishments: [] },
    });
    const res = await (await build()).inject({ method: 'GET', url: '/my-style/analyze/mystyle_g' });
    expect(res.json()).toEqual({ data: { status: 'ready', garment } });
  });

  it('404 for another shopper’s job (no IDOR) and for an unknown id', async () => {
    await startAnalysis('mystyle_x', 'someone_else');
    const app = await build();
    expect(
      (await app.inject({ method: 'GET', url: '/my-style/analyze/mystyle_x' })).statusCode,
    ).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/my-style/analyze/nope' })).statusCode).toBe(
      404,
    );
  });

  it('401 without a session; 404 when the kill-switch is off', async () => {
    const app = await build();
    mockSession.mockResolvedValue(null);
    expect((await app.inject({ method: 'GET', url: '/my-style/analyze/x' })).statusCode).toBe(401);
    mockSession.mockResolvedValue({ customer_account_id: ACCT });
    flags.analysis = false;
    expect((await app.inject({ method: 'GET', url: '/my-style/analyze/x' })).statusCode).toBe(404);
  });
});

describe('POST /profile/clear', () => {
  it('logs the withdrawal, nulls the profile (UPDATE), cancels a running job', async () => {
    await startAnalysis('mystyle_a', ACCT);
    const res = await (await build()).inject({ method: 'POST', url: '/my-style/profile/clear' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: { ok: true } });
    expect(mockConsentCreate.mock.calls[0]?.[0].data).toMatchObject({
      customer_account_id: ACCT,
      kind: 'MY_STYLE_PHOTO_CONSENT_WITHDRAWN',
    });
    expect(mockAccountUpdate).toHaveBeenCalledWith({
      where: { id: ACCT },
      data: { skin_undertone: null, skin_depth: null, body_frame: null, style_profile_at: null },
    });
    expect((await getAnalysis('mystyle_a'))?.status).toBe('cancelled');
  });

  it('stays live with the kill-switch off, so people can always delete', async () => {
    flags.analysis = false;
    const res = await (await build()).inject({ method: 'POST', url: '/my-style/profile/clear' });
    expect(res.statusCode).toBe(200);
    expect(mockAccountUpdate).toHaveBeenCalledTimes(1);
  });

  it('401 without a session and nothing is cleared', async () => {
    mockSession.mockResolvedValue(null);
    const res = await (await build()).inject({ method: 'POST', url: '/my-style/profile/clear' });
    expect(res.statusCode).toBe(401);
    expect(mockAccountUpdate).not.toHaveBeenCalled();
  });
});
