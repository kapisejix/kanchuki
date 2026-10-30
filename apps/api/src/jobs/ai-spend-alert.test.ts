// Platform-wide daily AI spend alert (security audit T2.4). There is no ₹ cost
// column, so the job counts credits logged in the last 24 h and alerts above
// a threshold derived from the ₹15,000/day owner figure.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_DAILY_CREDIT_ALERT, handleAiSpendAlert } from './ai-spend-alert.js';

const { mockAggregate, mockCapture } = vi.hoisted(() => ({
  mockAggregate: vi.fn(),
  mockCapture: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({ prisma: { aiUsageLog: { aggregate: mockAggregate } } }));
vi.mock('@sentry/node', () => ({ captureMessage: mockCapture }));

const NOW = new Date('2026-10-22T10:00:00Z');

describe('handleAiSpendAlert', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sums the last 24 h of credits', async () => {
    mockAggregate.mockResolvedValue({ _sum: { credits_used: 10 } });
    await handleAiSpendAlert(NOW);
    expect(mockAggregate).toHaveBeenCalledWith({
      _sum: { credits_used: true },
      where: { created_at: { gte: new Date('2026-10-21T10:00:00Z') } },
    });
  });

  it('stays quiet at or below the threshold', async () => {
    mockAggregate.mockResolvedValue({ _sum: { credits_used: AI_DAILY_CREDIT_ALERT } });
    const r = await handleAiSpendAlert(NOW);
    expect(r).toEqual({ credits: AI_DAILY_CREDIT_ALERT, alerted: false });
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('alerts above the threshold', async () => {
    mockAggregate.mockResolvedValue({ _sum: { credits_used: AI_DAILY_CREDIT_ALERT + 1 } });
    const r = await handleAiSpendAlert(NOW);
    expect(r.alerted).toBe(true);
    expect(mockCapture).toHaveBeenCalledWith(expect.stringContaining('AI usage'), 'warning');
  });

  it('treats no rows (null sum) as zero', async () => {
    mockAggregate.mockResolvedValue({ _sum: { credits_used: null } });
    expect(await handleAiSpendAlert(NOW)).toEqual({ credits: 0, alerted: false });
  });
});
