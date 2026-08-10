import { prisma } from '@kanchuki/db';
import { findBestMatch } from './name-match.js';

/**
 * Soft-match a list of AI-detected names (styles, fabrics) against THIS
 * retailer's own ProductAttribute rows of the given kind, returning the
 * canonical DB names. Mirrors resolveCategoryId (default-categories.ts):
 * the AI returns singular/loose forms ("Anarkali Suit") while the seeded
 * attribute rows are the merchandising vocabulary ("Anarkali Suits"), so
 * a strict === never lights up the chips — case/plural/token-tolerant
 * matching makes AI-detected Style/Fabric actually land on the retailer's
 * pickable options. Names with no match are kept as-is (a custom value the
 * retailer may or may not have, still useful free-text). Best-effort: any
 * lookup failure returns the input unchanged.
 */
export async function resolveAttributeNames(
  retailerId: string,
  kind: 'STYLE' | 'FABRIC',
  names: string[],
): Promise<string[]> {
  if (names.length === 0) return names;
  try {
    const rows = await prisma.productAttribute.findMany({
      where: { retailer_id: retailerId, kind },
      select: { name: true },
    });
    if (rows.length === 0) return names;
    const candidates = rows.map((r) => r.name);
    return names.map((n) => findBestMatch(n, candidates) ?? n);
  } catch (err) {
    console.error(`Failed to resolve ${kind} names for retailer ${retailerId}:`, err);
    return names;
  }
}

/**
 * Style/Occasion/Fabric taxonomy — same seed-once-at-signup pattern as
 * seedDefaultCategories (default-categories.ts). Copies the admin-editable
 * DefaultProductAttribute template into one retailer's own ProductAttribute
 * rows, across all three kinds in one query. Called at onboarding (auth.ts
 * self-serve signup, team-retailers.ts agent-created signup). Idempotent and
 * best-effort: existing retailer rows are never touched, a template-read
 * failure degrades to "retailer starts empty" per kind.
 */
export async function seedDefaultAttributes(retailerId: string): Promise<void> {
  try {
    const defaults = await prisma.defaultProductAttribute.findMany({
      where: { is_active: true },
      orderBy: [{ kind: 'asc' }, { sort_order: 'asc' }],
      select: { kind: true, segment: true, name: true, sort_order: true },
    });
    if (defaults.length === 0) return;

    const existing = await prisma.productAttribute.findMany({
      where: { retailer_id: retailerId },
      select: { kind: true, name: true },
    });
    const existingKeys = new Set(existing.map((e) => `${e.kind}:${e.name.trim().toLowerCase()}`));

    const toCreate = defaults.filter(
      (d) => !existingKeys.has(`${d.kind}:${d.name.trim().toLowerCase()}`),
    );
    if (toCreate.length === 0) return;

    await prisma.productAttribute.createMany({
      data: toCreate.map((d) => ({
        retailer_id: retailerId,
        kind: d.kind,
        segment: d.segment,
        name: d.name,
        sort_order: d.sort_order,
      })),
      skipDuplicates: true,
    });
  } catch (err) {
    console.error(`Failed to seed default attributes for retailer ${retailerId}:`, err);
  }
}
