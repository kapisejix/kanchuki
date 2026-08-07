import { prisma } from '@kanchuki/db';

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
