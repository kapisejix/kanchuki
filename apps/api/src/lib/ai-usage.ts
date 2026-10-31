import { type ProviderUsedInfo, reserveAiCredits } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { incrementUsage, reserveQuota } from './quota.js';

// F-023: weighted AI usage recording. The failover engine (packages/ai)
// fires onProviderUsed once per successfully-served call; this helper turns
// that into (a) a weighted AI_TAGGING_CALL quota increment and (b) a
// per-call AiUsageLog row for the Admin → AI Usage dashboard.
//
// Both are best-effort: a DB hiccup must never fail the tagging job that
// just succeeded. Errors are logged, not thrown.

/** Legacy fallback rows (providers.ts, migration not run) have synthetic
 * 'legacy-*' ids that don't exist in ai_provider_configs — never FK to them. */
function realProviderId(id: string): string | null {
  return id.startsWith('legacy-') ? null : id;
}

// F-032: record a BFL FLUX Kontext studio-shoot generation as one credit
// per retailer. Admin → AI Usage dashboard shows these under the BFL provider
// type so retailers can see their studio-shoot consumption at a glance.
//
// Best-effort: a DB write failure must not fail the completed generation.
export function recordBflStudioUsage(retailerId: string, template: string): void {
  prisma.aiUsageLog
    .create({
      data: {
        retailer_id: retailerId,
        provider_id: null, // no AiProviderConfig row for BFL (external API)
        provider_type: 'BFL',
        model_name: 'flux-kontext-pro',
        resource_type: `STUDIO_SHOOT_${template.toUpperCase()}`,
        credits_used: 1,
      },
    })
    .catch((err) => {
      console.error(`[ai-usage] failed to log BFL studio shoot for ${retailerId}:`, err);
    });
}

export function recordAiUsage(retailerId: string, opts: { meter?: boolean } = {}) {
  return (info: ProviderUsedInfo): void => {
    // Quota consumption is gated on the AI_TAGGING_CALL resource only — that's
    // the metered quota retailers see and purchase addons against. Detection
    // and color calls are bundled into the catalog-import tagging gate (the
    // checkQuota that runs before the batch) and are logged for attribution
    // without a separate quota drain.
    //
    // info.resource_type (not a captured param) is used so the dashboard
    // distinguishes tagging (AI_TAGGING_CALL) from item detection
    // (AI_ITEM_DETECT) and color detection (AI_COLOR_DETECT) even when a
    // single route fires multiple call types (detectCropAndTag fires both a
    // detect extract and per-item tag extracts).
    // `meter: false` = the caller reserved up front and settles itself (reserveTaggingQuota).
    if (info.resource_type === 'AI_TAGGING_CALL' && opts.meter !== false) {
      incrementUsage(retailerId, 'AI_TAGGING_CALL', info.credits_per_call).catch((err) => {
        console.error(`[ai-usage] failed to record AI_TAGGING_CALL usage for ${retailerId}:`, err);
      });
    }

    prisma.aiUsageLog
      .create({
        data: {
          retailer_id: retailerId,
          provider_id: realProviderId(info.provider_id),
          provider_type: info.provider_type,
          model_name: info.model_name,
          resource_type: info.resource_type,
          credits_used: info.credits_per_call,
        },
      })
      .catch((err) => {
        console.error(`[ai-usage] failed to log ${info.resource_type} for ${retailerId}:`, err);
      });
  };
}

/**
 * H6-2 (RC-155): weighted AI tagging spend, reserved atomically BEFORE the provider call.
 * Reserves the most expensive healthy provider's credits (`reserveAiCredits`, so failover can
 * never be unaffordable), `onProviderUsed` adds up what the serving provider really charged,
 * and `settle()` hands the unspent part back. Call `settle()` once, in a `finally`: it gives
 * everything back when no provider served. Best-effort like `recordAiUsage` — a failed give-back
 * is logged (credits stay reserved until the period ends), never thrown over the caller's result.
 * An unlimited plan reserves nothing, and its spend is still counted (as before).
 */
export async function reserveTaggingQuota(retailerId: string) {
  const reserved = await reserveAiCredits();
  const refund = await reserveQuota(retailerId, 'AI_TAGGING_CALL', reserved);
  const record = recordAiUsage(retailerId, { meter: false });
  let spent = 0;
  return {
    onProviderUsed(info: ProviderUsedInfo): void {
      if (info.resource_type === 'AI_TAGGING_CALL') spent += info.credits_per_call;
      record(info);
    },
    async settle(): Promise<void> {
      try {
        if (!refund.reserved) {
          if (spent > 0) await incrementUsage(retailerId, 'AI_TAGGING_CALL', spent);
        } else if (spent < reserved) {
          await refund(reserved - spent);
        } else if (spent > reserved) {
          await incrementUsage(retailerId, 'AI_TAGGING_CALL', spent - reserved); // pricier provider mid-call
        }
      } catch (err) {
        console.error(`[ai-usage] failed to settle AI_TAGGING_CALL for ${retailerId}:`, err);
      }
    },
  };
}
