// F-045 PR-6 T14 — the My Style analyze job. Weight sits on: quota is spent only when a
// profile was actually produced, a withdrawal that lands mid-run wins (no resurrected
// profile), a bad/failed read never invents a profile, and the photo is taken exactly once.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAnalyze, mockUpdate, mockIncrement, mockDaily } = vi.hoisted(() => ({
  mockAnalyze: vi.fn(),
  mockUpdate: vi.fn(),
  mockIncrement: vi.fn(),
  mockDaily: vi.fn(),
}));

vi.mock('@kanchuki/ai', () => ({ analyzeStyleImage: mockAnalyze, deleteObject: vi.fn() }));
vi.mock('@kanchuki/db', () => ({
  prisma: {
    customerAccount: { update: mockUpdate },
    consentEvent: {},
    styleAnalysisDaily: { upsert: mockDaily },
  },
}));
vi.mock('../lib/quota.js', () => ({ incrementCustomerUsage: mockIncrement }));

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
  mockUpdate.mockReset().mockResolvedValue({});
  mockIncrement.mockReset().mockResolvedValue(undefined);
  mockDaily.mockReset().mockResolvedValue({});
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
    expect(mockIncrement).toHaveBeenCalledWith(ACCT, 'STYLE_ANALYSIS');
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
    expect(mockIncrement).not.toHaveBeenCalled();
  });

  it('cancelled while queued: no model call, no write, no charge', async () => {
    await queue();
    await cancelInflightAnalysis(ACCT);
    await run();
    expect(mockAnalyze).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockIncrement).not.toHaveBeenCalled();
    expect(tryOnPhotoCount()).toBe(0);
  });

  it('an unusable photo fails with the enum reason, writes nothing, charges nothing', async () => {
    await queue();
    mockAnalyze.mockResolvedValue({ usable: false, reason: 'face_not_clear' });
    await run();
    expect(await getAnalysis(JOB)).toMatchObject({ status: 'failed', reason: 'face_not_clear' });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockIncrement).not.toHaveBeenCalled();
  });

  it('a model/provider failure fails the job, invents no profile, charges nothing', async () => {
    await queue();
    mockAnalyze.mockRejectedValue(new Error('All AI providers failed'));
    await expect(run()).rejects.toThrow(/providers failed/);
    expect(await getAnalysis(JOB)).toMatchObject({ status: 'failed', reason: 'read_failed' });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockIncrement).not.toHaveBeenCalled();
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
    expect(mockIncrement).toHaveBeenCalledWith(ACCT, 'STYLE_ANALYSIS');
    expect((await getAnalysis(JOB))?.status).toBe('cancelled');
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
    expect(mockUpdate.mock.calls[1]?.[0]).toMatchObject({
      where: { id: ACCT },
      data: { skin_undertone: null, skin_depth: null, body_frame: null, style_profile_at: null },
    });
    expect((await getAnalysis(JOB))?.status).toBe('cancelled');
  });
});
