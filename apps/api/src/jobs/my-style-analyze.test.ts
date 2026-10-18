// F-045 PR-6 T14 — the My Style analyze job. Weight sits on: quota is spent only when a
// profile was actually produced, a withdrawal that lands mid-run wins (no resurrected
// profile), a bad/failed read never invents a profile, and the photo is taken exactly once.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAnalyze, mockUpdate, mockIncrement } = vi.hoisted(() => ({
  mockAnalyze: vi.fn(),
  mockUpdate: vi.fn(),
  mockIncrement: vi.fn(),
}));

vi.mock('@kanchuki/ai', () => ({ analyzeStyleImage: mockAnalyze, deleteObject: vi.fn() }));
vi.mock('@kanchuki/db', () => ({
  prisma: { customerAccount: { update: mockUpdate }, consentEvent: {} },
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
