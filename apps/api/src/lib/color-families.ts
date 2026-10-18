// F-045 My Style — active colour families for products.color_family, with a small
// in-process TTL cache (the table is ~22 admin-edited rows; a 60 s lag after an admin
// edit is fine, and the admin routes call clearColorFamilyCache() for their own process).
import { prisma } from '@kanchuki/db';
import { type ColorFamilyDef, normalizeColorFamily } from '@kanchuki/shared';

const TTL_MS = 60_000;
let cache: { at: number; rows: ColorFamilyDef[] } | null = null;
let generation = 0; // bumped by clear: an in-flight read must not write stale rows back

/** Throws on a DB failure and never caches one — callers decide whether that is fatal. */
export async function getActiveColorFamilies(now = Date.now()): Promise<ColorFamilyDef[]> {
  if (cache && now - cache.at < TTL_MS) return cache.rows;
  const gen = generation;
  const rows = await prisma.colorFamily.findMany({
    where: { is_active: true },
    select: { name: true, aliases: true },
    orderBy: { name: 'asc' },
  });
  if (gen === generation) cache = { at: now, rows };
  return rows;
}

export function clearColorFamilyCache(): void {
  generation++;
  cache = null;
}

/**
 * primary_color -> family name for a write path that must not fail because of this
 * (tagging, product edit). Returns string | null (unmapped) | undefined (lookup FAILED —
 * the caller must then leave color_family as it is rather than write null over a good
 * value). Failures are logged (RC-059); the backfill job repairs NULLs later.
 */
export async function resolveColorFamily(
  primaryColor: string | null | undefined,
): Promise<string | null | undefined> {
  if (!primaryColor?.trim()) return null;
  try {
    return normalizeColorFamily(primaryColor, await getActiveColorFamilies());
  } catch (err) {
    console.error('[color-family] lookup failed; leaving color_family unchanged:', err);
    return undefined;
  }
}
