// F-045 PR-6 — My Style analysis job state (in-memory under VITEST, Redis in prod).
// The store must hand out COPIES (RC-037): a caller that mutates what it got back must
// not change what the next reader sees.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetMyStyleState,
  cancelInflightAnalysis,
  completeAnalysis,
  getAnalysis,
  startAnalysis,
} from './my-style-analysis.js';

beforeEach(() => {
  __resetMyStyleState();
});

describe('my-style analysis state', () => {
  it('start creates a processing job and takes the per-account lock', async () => {
    expect(await startAnalysis('job1', 'acct1')).toBe('started');
    expect(await getAnalysis('job1')).toEqual({ account_id: 'acct1', status: 'processing' });
  });

  it('a second start for the same account is busy; another account is fine', async () => {
    await startAnalysis('job1', 'acct1');
    expect(await startAnalysis('job2', 'acct1')).toBe('busy');
    expect(await getAnalysis('job2')).toBeNull();
    expect(await startAnalysis('job3', 'acct2')).toBe('started');
  });

  it('complete moves processing to ready/failed and releases the lock', async () => {
    await startAnalysis('job1', 'acct1');
    const profile = { undertone: 'warm', depth: 'fair', frame: 'tall' } as const;
    expect(await completeAnalysis('job1', { status: 'ready', profile })).toBe(true);
    expect(await getAnalysis('job1')).toEqual({ account_id: 'acct1', status: 'ready', profile });
    expect(await startAnalysis('job2', 'acct1')).toBe('started');
  });

  it('complete after cancel loses and reports false', async () => {
    await startAnalysis('job1', 'acct1');
    await cancelInflightAnalysis('acct1');
    expect((await getAnalysis('job1'))?.status).toBe('cancelled');
    expect(await completeAnalysis('job1', { status: 'failed', reason: 'read_failed' })).toBe(false);
    expect((await getAnalysis('job1'))?.status).toBe('cancelled');
    expect(await startAnalysis('job2', 'acct1')).toBe('started');
  });

  it('complete on an unknown or finished job is false', async () => {
    expect(await completeAnalysis('nope', { status: 'failed', reason: 'expired' })).toBe(false);
    await startAnalysis('job1', 'acct1');
    await completeAnalysis('job1', { status: 'failed', reason: 'expired' });
    expect(await completeAnalysis('job1', { status: 'failed', reason: 'again' })).toBe(false);
  });

  it('cancel with nothing in flight is a no-op', async () => {
    await expect(cancelInflightAnalysis('acct9')).resolves.toBeUndefined();
  });

  it('returns copies, not the stored object (RC-037)', async () => {
    await startAnalysis('job1', 'acct1');
    const first = await getAnalysis('job1');
    if (first) first.status = 'ready';
    expect((await getAnalysis('job1'))?.status).toBe('processing');
  });
});
