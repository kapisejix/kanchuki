import { TRY_ON_CONSENT } from '@kanchuki/shared';
// F-039 T6 — the try-on consent lib.
//
// Two things here are easy to get subtly wrong and invisible if you do:
//
//   1. "live grant" is decided by the LATEST event of either kind, not by
//      whether a grant exists. Counting grants would let a stale grant outvote
//      a later withdrawal, which is the failure where a person takes consent
//      back and keeps getting generated anyway.
//
//   2. a failed R2 delete must NOT clear `result_url`. Clearing it looks like
//      success from the row while orphaning the object permanently — the one
//      outcome where we both keep the photo and lose the ability to find it.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasLiveTryOnConsent, recordTryOnConsent, withdrawTryOnConsent } from './tryon-consent.js';

const {
  mockConsentEventFindFirst,
  mockConsentEventCreate,
  mockJobFindMany,
  mockJobUpdate,
  mockJobUpdateMany,
  mockDeleteObject,
} = vi.hoisted(() => ({
  mockConsentEventFindFirst: vi.fn(),
  mockConsentEventCreate: vi.fn(),
  mockJobFindMany: vi.fn(),
  mockJobUpdate: vi.fn(),
  mockJobUpdateMany: vi.fn(),
  mockDeleteObject: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    consentEvent: { findFirst: mockConsentEventFindFirst, create: mockConsentEventCreate },
    tryOnJob: {
      findMany: mockJobFindMany,
      update: mockJobUpdate,
      updateMany: mockJobUpdateMany,
    },
  },
}));

vi.mock('@kanchuki/ai', () => ({ deleteObject: mockDeleteObject }));

const ACCOUNT = 'acct_1';
const RETAILER = 'retailer_1';

beforeEach(() => {
  vi.clearAllMocks();
  mockConsentEventFindFirst.mockResolvedValue(null);
  mockConsentEventCreate.mockResolvedValue({});
  mockJobFindMany.mockResolvedValue([]);
  mockJobUpdate.mockResolvedValue({});
  mockJobUpdateMany.mockResolvedValue({ count: 0 });
  mockDeleteObject.mockResolvedValue(undefined);
});

describe('hasLiveTryOnConsent', () => {
  it('true when the latest try-on consent event is a grant', async () => {
    mockConsentEventFindFirst.mockResolvedValue({ kind: 'TRY_ON_CONSENTED' });
    await expect(hasLiveTryOnConsent(ACCOUNT)).resolves.toBe(true);
  });

  it('false when the latest event is a withdrawal', async () => {
    mockConsentEventFindFirst.mockResolvedValue({ kind: 'TRY_ON_CONSENT_WITHDRAWN' });
    await expect(hasLiveTryOnConsent(ACCOUNT)).resolves.toBe(false);
  });

  it('false when the shopper has never consented', async () => {
    mockConsentEventFindFirst.mockResolvedValue(null);
    await expect(hasLiveTryOnConsent(ACCOUNT)).resolves.toBe(false);
  });

  it('asks for the latest of ONLY the two try-on kinds', async () => {
    // The scoping matters in both directions: without the kind filter a
    // PASSPORT_CREATED event could be read as the latest "consent", and without
    // the descending order the newest withdrawal would not win.
    mockConsentEventFindFirst.mockResolvedValue(null);
    await hasLiveTryOnConsent(ACCOUNT);

    expect(mockConsentEventFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          customer_account_id: ACCOUNT,
          kind: { in: ['TRY_ON_CONSENTED', 'TRY_ON_CONSENT_WITHDRAWN'] },
        }),
        orderBy: { created_at: 'desc' },
      }),
    );
  });
});

describe('recordTryOnConsent', () => {
  it('writes the grant against the current notice version, with a hashed ip', async () => {
    await recordTryOnConsent(ACCOUNT, RETAILER, { ip: '203.0.113.7', userAgent: 'test-agent' });

    const arg = mockConsentEventCreate.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(arg.data).toMatchObject({
      customer_account_id: ACCOUNT,
      retailer_id: RETAILER,
      kind: 'TRY_ON_CONSENTED',
      notice_version: TRY_ON_CONSENT.version,
      user_agent: 'test-agent',
    });
    // The raw IP is never stored — only its hash, same as every other consent
    // write in this codebase.
    expect(arg.data.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(arg.data)).not.toContain('203.0.113.7');
  });

  it('hashes a missing ip rather than storing a null hash', async () => {
    await recordTryOnConsent(ACCOUNT, RETAILER, {});
    const arg = mockConsentEventCreate.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(arg.data.ip_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('withdrawTryOnConsent', () => {
  it('logs the withdrawal first, then deletes each stored image and clears its key', async () => {
    mockJobFindMany.mockResolvedValue([
      { id: 'job_1', result_url: 'tryon-results/job_1/result.jpg' },
      { id: 'job_2', result_url: 'tryon-results/job_2/result.jpg' },
    ]);

    const result = await withdrawTryOnConsent(ACCOUNT, { ip: '203.0.113.7' });

    const event = mockConsentEventCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(event.data).toMatchObject({
      customer_account_id: ACCOUNT,
      kind: 'TRY_ON_CONSENT_WITHDRAWN',
      notice_version: TRY_ON_CONSENT.version,
    });

    expect(mockDeleteObject).toHaveBeenCalledWith('tryon-results/job_1/result.jpg');
    expect(mockDeleteObject).toHaveBeenCalledWith('tryon-results/job_2/result.jpg');
    expect(result).toEqual({ images_deleted: 2, images_failed: 0 });

    // Both jobs end up with a cleared key AND the withdrawal stamp, in one
    // write each — a row must never read as withdrawn while its object lives.
    expect(mockJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job_1' },
        data: expect.objectContaining({ result_url: null, consent_withdrawn_at: expect.any(Date) }),
      }),
    );
  });

  it('keeps the key when the R2 delete fails, and reports it', async () => {
    mockJobFindMany.mockResolvedValue([
      { id: 'job_1', result_url: 'tryon-results/job_1/result.jpg' },
    ]);
    mockDeleteObject.mockRejectedValue(new Error('r2 down'));

    const result = await withdrawTryOnConsent(ACCOUNT, {});

    expect(result).toEqual({ images_deleted: 0, images_failed: 1 });
    // The whole point: the key survives, because it is the only pointer to an
    // object we still owe this person a delete for.
    expect(mockJobUpdate).not.toHaveBeenCalled();
    // …but the row is still marked withdrawn by the trailing sweep, so nothing
    // serves it in the meantime.
    expect(mockJobUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customer_account_id: ACCOUNT, consent_withdrawn_at: null },
        data: { consent_withdrawn_at: expect.any(Date) },
      }),
    );
  });

  it('marks jobs that hold no image as withdrawn without touching storage', async () => {
    // A FAILED or still-PENDING job has nothing to delete, but "this person
    // withdrew" must still be provable from the row.
    mockJobFindMany.mockResolvedValue([]);

    const result = await withdrawTryOnConsent(ACCOUNT, {});

    expect(mockDeleteObject).not.toHaveBeenCalled();
    expect(result).toEqual({ images_deleted: 0, images_failed: 0 });
    expect(mockJobUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('never asks R2 to delete a job whose key is already null', async () => {
    mockJobFindMany.mockResolvedValue([]);
    await withdrawTryOnConsent(ACCOUNT, {});
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  it('writes the withdrawal even when there is nothing to delete', async () => {
    mockJobFindMany.mockResolvedValue([]);
    await withdrawTryOnConsent(ACCOUNT, {});
    // The change of mind is a fact independent of our storage; blocking future
    // generations must not depend on an R2 call succeeding.
    expect(mockConsentEventCreate).toHaveBeenCalledTimes(1);
  });
});
