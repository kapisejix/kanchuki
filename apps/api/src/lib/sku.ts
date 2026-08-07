import { prisma } from '@kanchuki/db';

// ponytail: 2-letter prefix from the subtype/category words, fallback 'PR'
// (Product) when nothing usable is present.
export function skuPrefix(subtypeOrCategory: string | null | undefined): string {
  const words = (subtypeOrCategory ?? '').trim().split(/\s+/).filter(Boolean);
  const letters = words
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  return letters.length >= 2 ? letters : `${letters}PR`.slice(0, 2);
}

// Retailer-scoped, monotonic per-prefix sequence, zero-padded to 4 digits
// (e.g. "Lehenga Skirt" -> "LS0001"). `attempt` shifts the sequence forward
// for retry-on-collision callers (see withUniqueSku below).
export async function generateSku(
  retailerId: string,
  subtypeOrCategory: string | null | undefined,
  attempt = 0,
): Promise<string> {
  const prefix = skuPrefix(subtypeOrCategory);
  const count = await prisma.product.count({
    where: { retailer_id: retailerId, sku: { startsWith: prefix } },
  });
  const seq = count + 1 + attempt;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

const MAX_SKU_ATTEMPTS = 5;

// ponytail: low-concurrency path (per-retailer product tagging), so a plain
// count-then-retry is enough — no advisory lock or DB sequence needed unless
// collisions start showing up in practice.
export async function withUniqueSku<T>(
  retailerId: string,
  subtypeOrCategory: string | null | undefined,
  apply: (sku: string) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < MAX_SKU_ATTEMPTS; attempt++) {
    const sku = await generateSku(retailerId, subtypeOrCategory, attempt);
    try {
      return await apply(sku);
    } catch (err) {
      // Duck-typed rather than `instanceof Prisma.PrismaClientKnownRequestError`
      // — Prisma errors always carry `.code`, and this avoids a hard dependency
      // on the Prisma error class shape (which tests mock away).
      const isCollision = (err as { code?: string } | null)?.code === 'P2002';
      if (!isCollision || attempt === MAX_SKU_ATTEMPTS - 1) throw err;
    }
  }
  /* c8 ignore next */
  throw new Error('unreachable');
}

// Batch variant: caches one count-query per prefix across an entire bulk-
// import request instead of re-querying (and colliding) per item when
// several items in the same batch share a prefix (e.g. 5 kurtas at once).
export function createSkuSequencer(
  retailerId: string,
): (subtypeOrCategory: string | null | undefined) => Promise<string> {
  const nextSeq = new Map<string, number>();
  return async (subtypeOrCategory) => {
    const prefix = skuPrefix(subtypeOrCategory);
    if (!nextSeq.has(prefix)) {
      const existing = await prisma.product.count({
        where: { retailer_id: retailerId, sku: { startsWith: prefix } },
      });
      nextSeq.set(prefix, existing);
    }
    const seq = nextSeq.get(prefix)! + 1;
    nextSeq.set(prefix, seq);
    return `${prefix}${String(seq).padStart(4, '0')}`;
  };
}
