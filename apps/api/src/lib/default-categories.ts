import { prisma } from '@kanchuki/db';
import { findBestMatch } from './name-match.js';

/**
 * F-024: copy the admin-editable DefaultProductCategory template into one
 * retailer's own ProductCategory rows. Called at onboarding (auth.ts
 * self-serve signup, team.ts agent-created signup). Idempotent and
 * best-effort: existing retailer categories are never touched (a retailer
 * who deleted a default keeps it deleted), and a template-read failure
 * degrades to "retailer starts empty", the pre-F-024 behavior.
 */
export async function seedDefaultCategories(retailerId: string): Promise<void> {
  try {
    const defaults = await prisma.defaultProductCategory.findMany({
      where: { is_active: true },
      orderBy: { sort_order: 'asc' },
      select: { name: true, sort_order: true },
    });
    if (defaults.length === 0) return;

    const existing = await prisma.productCategory.findMany({
      where: { retailer_id: retailerId },
      select: { name: true },
    });
    const existingNames = new Set(existing.map((e) => e.name.trim().toLowerCase()));

    const toCreate = defaults.filter((d) => !existingNames.has(d.name.trim().toLowerCase()));
    if (toCreate.length === 0) return;

    await prisma.productCategory.createMany({
      data: toCreate.map((d) => ({
        retailer_id: retailerId,
        name: d.name,
        sort_order: d.sort_order,
      })),
      skipDuplicates: true,
    });
  } catch (err) {
    console.error(`Failed to seed default categories for retailer ${retailerId}:`, err);
  }
}

/**
 * F-024: match the AI's free-text category result against THIS retailer's
 * own current ProductCategory list (seeded defaults + any custom rows — one
 * mechanism, no default-vs-custom special-casing) and return the matched
 * category_id. The AI returns singular/loose names ("Kurti", "Saree") while
 * the seeded catalog groups are plural/merchandising names ("Kurtis",
 * "Sarees") — matching is case-insensitive, singular/plural-tolerant, and
 * containment/token-based (see lib/name-match.ts), so the two vocabularies
 * actually connect. `subtype` is tried as a secondary needle when the AI's
 * coarse category enum doesn't resolve (e.g. subtype "Kurta Set" lands on the
 * retailer's "Kurtis" group). No match → null, which leaves the product
 * uncategorized for manual assignment exactly like today. A retailer's custom
 * category ("Bridal Wear") becomes an AI target for free the moment it
 * exists. Best-effort: any lookup failure returns null so a DB hiccup never
 * fails the whole tagging job.
 */
export async function resolveCategoryId(
  retailerId: string,
  category: string | null,
  subtype?: string | null,
): Promise<string | null> {
  const needles = [category, subtype].filter((n): n is string => !!n && !!n.trim());
  if (needles.length === 0) return null;
  try {
    const rows = await prisma.productCategory.findMany({
      where: { retailer_id: retailerId },
      select: { id: true, name: true },
    });
    if (rows.length === 0) return null;
    for (const needle of needles) {
      const match = findBestMatch(
        needle,
        rows.map((r) => r.name),
      );
      if (match) return rows.find((r) => r.name === match)?.id ?? null;
    }
    return null;
  } catch (err) {
    console.error(`Failed to resolve category for retailer ${retailerId}:`, err);
    return null;
  }
}
