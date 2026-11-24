// One-off: fill products.audience for rows that predate the column, from category/subtype/name
// keywords only (no AI call, no cost). Owner-run, dry-run first (scripts/backfill-product-audience.ts).
//
// Only live rows whose audience is still NULL are read, and every write is guarded with
// `audience: null`, so it never overwrites a retailer pick or an AI value and a re-run only sees
// what is left. Rows the keywords cannot place stay NULL (the My Style feed keeps treating those as
// adult / unknown via its own keyword rule) and are listed so the owner can see them.
import { prisma } from '@kanchuki/db';
import { type ProductAudienceValue, audienceForText } from '@kanchuki/shared';

export function classifyProduct(p: {
  category: string | null;
  subtype: string | null;
  name: string | null;
}): { audience: ProductAudienceValue | null } {
  return { audience: audienceForText(p.category, p.subtype, p.name) };
}

export interface BackfillResult {
  dryRun: boolean;
  scanned: number;
  updated: number;
  counts: Partial<Record<ProductAudienceValue, number>>;
  undecided: { id: string; retailer_id: string; category: string | null; subtype: string | null }[];
}

export async function handleProductAudienceBackfill(opts: {
  dryRun: boolean;
  batch?: number;
  retailerId?: string;
}): Promise<BackfillResult> {
  const batch = opts.batch ?? 500;
  const res: BackfillResult = {
    dryRun: opts.dryRun,
    scanned: 0,
    updated: 0,
    counts: {},
    undecided: [],
  };
  // Id cursor: undecided rows stay NULL, so "audience IS NULL" alone would re-read them forever.
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.product.findMany({
      where: {
        audience: null,
        deleted_at: null,
        ...(opts.retailerId ? { retailer_id: opts.retailerId } : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: batch,
      select: { id: true, retailer_id: true, name: true, category: true, subtype: true },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]?.id;
    res.scanned += rows.length;

    const byAudience = new Map<ProductAudienceValue, string[]>();
    for (const r of rows) {
      const { audience } = classifyProduct(r);
      if (!audience) {
        res.undecided.push({
          id: r.id,
          retailer_id: r.retailer_id,
          category: r.category,
          subtype: r.subtype,
        });
        continue;
      }
      byAudience.set(audience, [...(byAudience.get(audience) ?? []), r.id]);
    }
    for (const [audience, ids] of byAudience) {
      res.counts[audience] = (res.counts[audience] ?? 0) + ids.length;
      if (!opts.dryRun) {
        await prisma.product.updateMany({
          where: { id: { in: ids }, audience: null },
          data: { audience },
        });
        res.updated += ids.length;
      }
    }
  }
  return res;
}
