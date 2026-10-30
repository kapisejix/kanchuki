// Platform-wide daily AI spend alert (security audit T2.4). `ai_usage_logs` has
// no ₹ cost column, so this counts logged credits over a rolling 24 h and
// alerts (Sentry, no blocking) above a threshold. Owner cap: ₹15,000/day at
// ~₹0.33 per call (CLAUDE.md §5 cost budget) = 45,000 credits.
// ponytail: counts retailer-attributed calls only; the anonymous /stylist and
// My Style calls are not logged here (they have per-route rate limits). Add a
// cost column and an anonymous log row if a true ₹ figure is needed.
import { prisma } from '@kanchuki/db';
import * as Sentry from '@sentry/node';

export const AI_DAILY_CREDIT_ALERT = 45_000;

export async function handleAiSpendAlert(
  now = new Date(),
): Promise<{ credits: number; alerted: boolean }> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const agg = await prisma.aiUsageLog.aggregate({
    _sum: { credits_used: true },
    where: { created_at: { gte: since } },
  });
  const credits = agg._sum.credits_used ?? 0;
  const alerted = credits > AI_DAILY_CREDIT_ALERT;
  if (alerted) {
    Sentry.captureMessage(
      `AI usage ${credits} credits in 24 h exceeds ${AI_DAILY_CREDIT_ALERT} (~₹15,000/day)`,
      'warning',
    );
  }
  console.info(`[ai-spend-alert] credits_24h=${credits} alerted=${alerted}`);
  return { credits, alerted };
}
