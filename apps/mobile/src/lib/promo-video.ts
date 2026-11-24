/**
 * F-034 AI promo video — pure rules shared by useProductPromoVideo and
 * ProductVideoModal. No React, no API: unit-tested directly.
 */
import type { PromoVideoAspect } from './api/products';

/** Shape chips, named for where the clip goes (spec D3: no 16:9). */
export const PROMO_ASPECTS: { value: PromoVideoAspect; label: string }[] = [
  { value: '9:16', label: 'Reels' },
  { value: '4:5', label: 'Feed' },
  { value: '1:1', label: 'Square' },
];

/** Same cap the server enforces (D4: uploads + slideshow + AI clips together). */
export const MAX_VIDEOS_PER_PRODUCT = 3;

/** The status route can answer "processing" forever if Redis lost the job, so the UI gives up waiting itself. */
export const PROMO_STALL_MS = 5 * 60_000;

const isAspect = (v: unknown): v is PromoVideoAspect => PROMO_ASPECTS.some((a) => a.value === v);

/** Derived, never auto-selected in an effect (RC-017): the retailer's pick, else the style's default, else Reels. */
export function resolveAspect(
  chosen: PromoVideoAspect | null,
  style: { default_aspect: string | null } | undefined,
): PromoVideoAspect {
  if (chosen) return chosen;
  const d = style?.default_aspect;
  return isAspect(d) ? d : '9:16';
}

export interface PromoBlockInput {
  online: boolean;
  videoCount: number;
  quota: { remaining: number; unlimited: boolean } | undefined;
  styleCount: number;
}

/** Why Make video cannot run, shown as the button label. `null` = ready to go. */
export function promoBlockReason(i: PromoBlockInput): { reason: string; limit: boolean } | null {
  if (i.quota && !i.quota.unlimited && i.quota.remaining <= 0)
    return { reason: 'Video limit reached this month', limit: true };
  if (i.videoCount >= MAX_VIDEOS_PER_PRODUCT)
    return {
      reason: `This product has ${MAX_VIDEOS_PER_PRODUCT} videos. Delete one to make a new clip.`,
      limit: false,
    };
  if (i.styleCount === 0) return { reason: 'No video styles for this item yet.', limit: false };
  if (!i.online) return { reason: 'Internet needed', limit: false };
  return null;
}

/** 42_000 -> "0:42". The only number shown while waiting, and it is true. */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function isKidsAudience(audience: string | null | undefined): boolean {
  return audience === 'BOYS' || audience === 'GIRLS' || audience === 'KIDS_UNISEX';
}
