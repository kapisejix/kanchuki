// F-045 PR-6 T14 — the My Style analyze job. Weight sits on: quota is spent only when a
// profile was actually produced, a withdrawal that lands mid-run wins (no resurrected
// profile), a bad/failed read never invents a profile, and the photo is taken exactly once.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAnalyze,
  mockGarment,
  mockFamilies,
  mockUpdate,
  mockSpent,
  mockRefund,
  mockDaily,
  mockFailDaily,
} = vi.hoisted(() => ({
  mockAnalyze: vi.fn(),
  mockGarment: vi.fn(),
  mockFamilies: vi.fn(),
  mockUpdate: vi.fn(),
  mockSpent: vi.fn(),
  mockRefund: vi.fn(),
  mockDaily: vi.fn(),
  mockFailDaily: vi.fn(),
}));

vi.mock('@kanchuki/ai', () => ({
  analyzeStyleImage: mockAnalyze,
  analyzeGarmentImage: mockGarment,
  deleteObject: vi.fn(),
}));
vi.mock('../lib/color-families.js', () => ({ getActiveColorFamilies: mockFamilies }));
vi.mock('@kanchuki/db', () => ({
  prisma: {
    customerAccount: { update: mockUpdate },
    consentEvent: {},
    styleAnalysisDaily: { upsert: mockDaily },
    styleAnalysisFailureDaily: { upsert: mockFailDaily },
  },
}));
vi.mock('../lib/quota.js', () => ({
  markCustomerJobQuotaSpent: mockSpent,
  refundCustomerJobQuota: mockRefund,
}));

import {
  __resetMyStyleState,
  cancelInflightAnalysis,
  getAnalysis,
  startAnalysis,
} from '../lib/my-style-analysis.js';
import { putTryOnPhoto, tryOnPhotoCount } from '../lib/tryon-photo-store.js';
import { handleMyStyleAnalyze } from './my-style-analyze.js';

const JOB = 'mystyle_job1';
const ACCT = 'acct_1';
const PROFILE = { undertone: 'warm', depth: 'medium', frame: 'average' } as const;

async function queue(opts: { photo?: boolean } = {}) {
  await startAnalysis(JOB, ACCT);
  if (opts.photo !== false) putTryOnPhoto(JOB, Buffer.from('fake-jpeg'), 'image/jpeg');
}
const run = () => handleMyStyleAnalyze({ job_id: JOB, customer_account_id: ACCT });

beforeEach(() => {
  __resetMyStyleState();
  mockAnalyze.mockReset();
  mockGarment.mockReset();
  mockFamilies.mockReset().mockResolvedValue([{ name: 'red' }, { name: 'yellow' }]);
  mockUpdate.mockReset().mockResolvedValue({});
  mockSpent.mockReset().mockResolvedValue(undefined);
  mockRefund.mockReset().mockResolvedValue(undefined);
  mockDaily.mockReset().mockResolvedValue({});
  mockFailDaily.mockReset().mockResolvedValue({});
});

// Phase 2 (R10): failures per day, mode and reason - and never who sent the photo.
describe('failure counter', () => {
  const failKey = () => mockFailDaily.mock.calls[0]?.[0].where.day_mode_reason;

  it('counts an unusable selfie under its reason, with no customer id', async () => {
    await queue();
    mockAnalyze.mockResolvedValue({ usable: false, reason: 'face_too_small' });
    await run();
    expect(mockFailDaily).toHaveBeenCalledTimes(1);
    expect(failKey()).toMatchObject({ mode: 'selfie', reason: 'face_too_small' });
    expect(failKey().day).toBeInstanceOf(Date);
    expect(JSON.stringify(mockFailDaily.mock.calls[0]?.[0])).not.toContain(ACCT);
  });

  it('counts a failed read as read_failed and an expired photo as expired', async () => {
    await queue();
    mockAnalyze.mockRejectedValue(new Error('provider down'));
    await expect(run()).rejects.toThrow();
    expect(failKey()).toMatchObject({ mode: 'selfie', reason: 'read_failed' });

    __resetMyStyleState();
    mockFailDaily.mockClear();
    await queue({ photo: false });
    await run();
    expect(failKey()).toMatchObject({ mode: 'selfie', reason: 'expired' });
  });

  it('counts garment failures under mode garment', async () => {
    await queue();
    mockGarment.mockResolvedValue({ usable: false, reason: 'no_garment' });
    await handleMyStyleAnalyze({ job_id: JOB, customer_account_id: ACCT, mode: 'garment' });
    expect(failKey()).toMatchObject({ mode: 'garment', reason: 'no_garment' });
  });

  it('a success is not a failure, and a failed counter write never fails the job', async () => {
    await queue();
    mockAnalyze.mockResolvedValue({ usable: true, profile: PROFILE, confidence: 'high' });
    await run();
    expect(mockFailDaily).not.toHaveBeenCalled();

    __resetMyStyleState();
    await queue();
    mockFailDaily.mockRejectedValue(new Error('db down'));
    mockAnalyze.mockResolvedValue({ usable: false, reason: 'too_dark' });
    await expect(run()).resolves.toBeUndefined();
    expect(await getAnalysis(JOB)).toMatchObject({ status: 'failed', reason: 'too_dark' });
  });

  it('a counter that throws synchronously (stale client) still fails the job, not leaves it processing', async () => {
    await queue();
    mockFailDaily.mockImplementation(() => {
      throw new TypeError('upsert is not a function');
    });
    mockAnalyze.mockResolvedValue({ usable: false, reason: 'too_dark' });
    await expect(run()).resolves.toBeUndefined();
    expect(await getAnalysis(JOB)).toMatchObject({ status: 'failed', reason: 'too_dark' });
  });
});

describe('confidence and profile source (D4)', () => {
  it('stores profile_source photo and hands the confidence to the poll', async () => {
    await queue();
    mockAnalyze.mockResolvedValue({ usable: true, profile: PROFILE, confidence: 'low' });
    await run();
    expect(mockUpdate.mock.calls[0]?.[0].data.profile_source).toBe('photo');
    expect(await getAnalysis(JOB)).toEqual({
      account_id: ACCT,
      status: 'ready',
      profile: PROFILE,
      confidence: 'low',
    });
  });
});

describe('handleMyStyleAnalyze', () => {
  it('persists the profile, marks ready, spends quota once, and drops the photo', async () => {
    await queue();
    mockAnalyze.mockResolvedValue({ usable: true, profile: PROFILE });
    await run();

    expect(mockAnalyze).toHaveBeenCalledTimes(1);
    expect(mockAnalyze.mock.calls[0]?.[0]).toBeInstanceOf(Buffer);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0]?.[0]).toMatchObject({
      where: { id: ACCT },
      data: { skin_undertone: 'warm', skin_depth: 'medium', body_frame: 'average' },
    });
    expect(mockUpdate.mock.calls[0]?.[0].data.style_profile_at).toBeInstanceOf(Date);
    expect(mockSpent).toHaveBeenCalledWith(JOB, 'STYLE_ANALYSIS');
    expect(mockRefund).not.toHaveBeenCalled();
    expect(await getAnalysis(JOB)).toEqual({ account_id: ACCT, status: 'ready', profile: PROFILE });
    expect(tryOnPhotoCount()).toBe(0);
  });

  it('counts the analysis in the daily chart table - with no customer id', async () => {
    await queue();
    mockAnalyze.mockResolvedValue({ usable: true, profile: PROFILE });
    await run();

    expect(mockDaily).toHaveBeenCalledTimes(1);
    const arg = mockDaily.mock.calls[0]?.[0];
    expect(arg.where.day).toEqual(new Date(new Date().toISOString().slice(0, 10)));
    expect(arg.create).toEqual({ day: arg.where.day, count: 1 });
    expect(arg.update).toEqual({ count: { increment: 1 } });
    expect(JSON.stringify(arg)).not.toContain(ACCT);
  });

  it('a failed daily-count write never fails the analysis', async () => {
    await queue();
    mockAnalyze.mockResolvedValue({ usable: true, profile: PROFILE });
    mockDaily.mockRejectedValue(new Error('db down'));
    await run();
    expect(await getAnalysis(JOB)).toMatchObject({ status: 'ready' });
  });

  it('an unusable photo is not counted in the daily chart', async () => {
    await queue();
    mockAnalyze.mockResolvedValue({ usable: false, reason: 'no_face' });
    await run();
    expect(mockDaily).not.toHaveBeenCalled();
  });

  it('a photo that expired before the job ran fails without calling the model', async () => {
    await queue({ photo: false });
    await run();
    expect(mockAnalyze).not.toHaveBeenCalled();
    expect(await getAnalysis(JOB)).toMatchObject({ status: 'failed', reason: 'expired' });
    expect(mockSpent).not.toHaveBeenCalled();
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(mockRefund).toHaveBeenCalledWith(JOB, 'STYLE_ANALYSIS');
  });

  it('cancelled while queued: no model call, no write, no charge', async () => {
    await queue();
    await cancelInflightAnalysis(ACCT);
    await run();
    expect(mockAnalyze).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSpent).not.toHaveBeenCalled();
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(mockRefund).toHaveBeenCalledWith(JOB, 'STYLE_ANALYSIS');
    expect(tryOnPhotoCount()).toBe(0);
  });

  it('an unusable photo fails with the enum reason, writes nothing, charges nothing', async () => {
    await queue();
    mockAnalyze.mockResolvedValue({ usable: false, reason: 'face_not_clear' });
    await run();
    expect(await getAnalysis(JOB)).toMatchObject({ status: 'failed', reason: 'face_not_clear' });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSpent).not.toHaveBeenCalled();
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(mockRefund).toHaveBeenCalledWith(JOB, 'STYLE_ANALYSIS');
  });

  it('a model/provider failure fails the job, invents no profile, charges nothing', async () => {
    await queue();
    mockAnalyze.mockRejectedValue(new Error('All AI providers failed'));
    await expect(run()).rejects.toThrow(/providers failed/);
    expect(await getAnalysis(JOB)).toMatchObject({ status: 'failed', reason: 'read_failed' });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSpent).not.toHaveBeenCalled();
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(mockRefund).toHaveBeenCalledWith(JOB, 'STYLE_ANALYSIS');
    expect(tryOnPhotoCount()).toBe(0);
  });

  it('cleared during the model call: nothing is written, but the cost is still counted', async () => {
    await queue();
    mockAnalyze.mockImplementation(async () => {
      await cancelInflightAnalysis(ACCT);
      return { usable: true, profile: PROFILE };
    });
    await run();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSpent).toHaveBeenCalledWith(JOB, 'STYLE_ANALYSIS');
    expect(mockRefund).not.toHaveBeenCalled();
    expect((await getAnalysis(JOB))?.status).toBe('cancelled');
  });

  it('a throw after the model ran (account write fails) keeps the slot spent', async () => {
    await queue();
    mockAnalyze.mockResolvedValue({ usable: true, profile: PROFILE });
    mockUpdate.mockRejectedValue(new Error('db down'));
    await expect(run()).rejects.toThrow('db down');
    expect(mockSpent).toHaveBeenCalledWith(JOB, 'STYLE_ANALYSIS');
    expect(mockRefund).not.toHaveBeenCalled();
  });

  it('a failed mark-spent write is logged and does not refund a paid read', async () => {
    await queue();
    mockAnalyze.mockResolvedValue({ usable: true, profile: PROFILE });
    mockSpent.mockRejectedValue(new Error('db down'));
    await run();
    expect(await getAnalysis(JOB)).toMatchObject({ status: 'ready' });
    expect(mockRefund).not.toHaveBeenCalled();
  });

  it('cleared between the write and the completion: the job re-nulls the profile', async () => {
    await queue();
    mockAnalyze.mockResolvedValue({ usable: true, profile: PROFILE });
    mockUpdate.mockImplementationOnce(async () => {
      await cancelInflightAnalysis(ACCT);
      return {};
    });
    await run();
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    // RC-192: only the 5 photo columns this job wrote - never the measurements or usual size.
    expect(mockUpdate.mock.calls[1]?.[0]).toEqual({
      where: { id: ACCT },
      data: {
        skin_undertone: null,
        skin_depth: null,
        body_frame: null,
        style_profile_at: null,
        profile_source: null,
      },
    });
    expect((await getAnalysis(JOB))?.status).toBe('cancelled');
  });
});

// ─── PR-9: find similar ──────────────────────────────────────────────────────────────
describe('handleMyStyleAnalyze - garment mode', () => {
  const GARMENT = { category: 'Kurti', color_family: 'yellow', embellishments: [] } as const;
  const runGarment = () =>
    handleMyStyleAnalyze({ job_id: JOB, customer_account_id: ACCT, mode: 'garment' });

  it('stores the descriptor in job state only - never on the account - and spends quota once', async () => {
    await queue();
    mockGarment.mockResolvedValue({ usable: true, garment: GARMENT });
    await runGarment();

    expect(mockAnalyze).not.toHaveBeenCalled();
    expect(mockGarment.mock.calls[0]?.[0]).toBeInstanceOf(Buffer);
    expect(mockGarment.mock.calls[0]?.[2]).toEqual(['red', 'yellow']); // the admin family list
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSpent).toHaveBeenCalledTimes(1);
    expect(mockSpent).toHaveBeenCalledWith(JOB, 'STYLE_SIMILAR');
    expect(mockRefund).not.toHaveBeenCalled();
    expect(mockDaily).toHaveBeenCalledTimes(1);
    expect(await getAnalysis(JOB)).toEqual({ account_id: ACCT, status: 'ready', garment: GARMENT });
    expect(tryOnPhotoCount()).toBe(0);
  });

  it('an unusable garment photo is a result and costs nothing', async () => {
    await queue();
    mockGarment.mockResolvedValue({ usable: false, reason: 'no_garment' });
    await runGarment();
    expect(await getAnalysis(JOB)).toMatchObject({ status: 'failed', reason: 'no_garment' });
    expect(mockSpent).not.toHaveBeenCalled();
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(mockRefund).toHaveBeenCalledWith(JOB, 'STYLE_SIMILAR');
    expect(mockDaily).not.toHaveBeenCalled();
  });

  it('a failed read fails the job and rethrows - no guessed descriptor (RC-059)', async () => {
    await queue();
    mockGarment.mockRejectedValue(new Error('unreadable model reply'));
    await expect(runGarment()).rejects.toThrow('unreadable model reply');
    expect(await getAnalysis(JOB)).toMatchObject({ status: 'failed', reason: 'read_failed' });
    expect(mockSpent).not.toHaveBeenCalled();
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(mockRefund).toHaveBeenCalledWith(JOB, 'STYLE_SIMILAR');
  });

  it('a colour-family lookup failure fails the read instead of guessing', async () => {
    await queue();
    mockFamilies.mockRejectedValue(new Error('db down'));
    await expect(runGarment()).rejects.toThrow('db down');
    expect(mockGarment).not.toHaveBeenCalled();
    expect(await getAnalysis(JOB)).toMatchObject({ status: 'failed', reason: 'read_failed' });
  });

  it('cancelled mid-flight: the result is dropped, the model cost still counts', async () => {
    await queue();
    mockGarment.mockImplementation(async () => {
      await cancelInflightAnalysis(ACCT);
      return { usable: true, garment: GARMENT };
    });
    await runGarment();
    expect(await getAnalysis(JOB)).toMatchObject({ status: 'cancelled' });
    expect(mockSpent).toHaveBeenCalledTimes(1);
  });

  it('a job queued without a mode (pre-PR-9) still runs as a selfie', async () => {
    await queue();
    mockAnalyze.mockResolvedValue({ usable: true, profile: PROFILE });
    await run();
    expect(mockGarment).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
});
