import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock('@sentry/node', () => ({ captureException: m.capture }));

import { reportJobFailure } from './job-failure.js';

const job = (over: Partial<{ attemptsMade: number; attempts: number }> = {}) =>
  ({
    id: 'j1',
    name: 'publish',
    data: { phone: '9876543210' },
    attemptsMade: over.attemptsMade ?? 3,
    opts: { attempts: over.attempts ?? 3 },
  }) as unknown as Job;

beforeEach(() => vi.clearAllMocks());

describe('reportJobFailure (RC-113)', () => {
  it('reports the final failed attempt with queue/job tags', () => {
    const err = new Error('boom');
    reportJobFailure('push', job(), err);
    expect(m.capture).toHaveBeenCalledWith(err, {
      tags: { area: 'job', queue: 'push', job: 'publish' },
      extra: { job_id: 'j1', attempts_made: 3 },
    });
  });

  it('stays quiet while BullMQ will still retry', () => {
    reportJobFailure('push', job({ attemptsMade: 1, attempts: 3 }), new Error('boom'));
    expect(m.capture).not.toHaveBeenCalled();
  });

  it('treats a job with no attempts setting as single-shot', () => {
    const j = job({ attemptsMade: 1 });
    (j.opts as { attempts?: number }).attempts = undefined;
    reportJobFailure('push', j, new Error('boom'));
    expect(m.capture).toHaveBeenCalledTimes(1);
  });

  it('reports a stalled-out job (no job object)', () => {
    reportJobFailure('studio-shoot', undefined, new Error('job stalled more than allowable limit'));
    expect(m.capture).toHaveBeenCalledTimes(1);
  });

  it('never sends job.data (PII) to Sentry', () => {
    reportJobFailure('push', job(), new Error('boom'));
    expect(JSON.stringify(m.capture.mock.calls)).not.toContain('9876543210');
  });
});
