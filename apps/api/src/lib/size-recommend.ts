import { prisma, SizeChartCategory, type SizeChartRow } from '@kanchuki/db';
import { findRecommendedSize } from '../routes/size-chart.js';

// ─── Roadmap N — Indian Size & Fit: per-customer size recommendation ──
// Decision order (pure core, testable):
//   1. USUAL   — customer's captured usual_size, when the product carries it
//   2. HISTORY — most-purchased size across the customer's purchase history
//                (purchase-type interactions → their products' sizes)
//   3. CHART   — nearest size from the retailer's SizeChart (F-102c range
//                lookup, no GPU) using the customer's latest MANUAL
//                measurement and the chart for the product's body category
// Null when nothing matches. `basis` tells the caller which signal fired.

export type SizeBasis = 'USUAL' | 'HISTORY' | 'CHART';
export type SizeRecommendation = { suggested_size: string | null; basis: SizeBasis | null };

type CustomerLike = { usual_size: string | null };
type ProductLike = { sizes: string[] };

// LOWER-body category keywords (pants/palazzos/skirts …). Anything else is
// treated as UPPER (kurtas/tops/dresses) — the size chart has only two
// bodies, so a keyword miss degrades gracefully to the nearest upper row.
const LOWER_CATEGORY_KEYWORDS = [
  'pant', 'palazzo', 'skirt', 'trouser', 'lehenga', 'salwar', 'jeans',
  'churidar', 'legging', 'bottom', 'pyjama', 'dhoti', 'sharara',
];

export function chartCategoryForProduct(category: string | null | undefined): SizeChartCategory {
  if (!category) return SizeChartCategory.UPPER;
  const c = category.toLowerCase();
  return LOWER_CATEGORY_KEYWORDS.some((k) => c.includes(k))
    ? SizeChartCategory.LOWER
    : SizeChartCategory.UPPER;
}

/** Whether a suggested label is actually sold in this product's size list. */
function inProductSizes(label: string | null | undefined, product: ProductLike): boolean {
  if (!label) return false;
  return product.sizes.includes(label);
}

/** Pure core — no DB access. */
export function recommendSizeFromSignals(
  customer: CustomerLike,
  product: ProductLike,
  historySizes: string[],
  chartRow: SizeChartRow | null,
): SizeRecommendation {
  // 1. Usual size — strongest signal, wins when the product stocks it.
  if (inProductSizes(customer.usual_size, product)) {
    return { suggested_size: customer.usual_size, basis: 'USUAL' };
  }
  // 2. Purchase history — most frequent size bought, if the product stocks it.
  if (historySizes.length > 0) {
    const counts = new Map<string, number>();
    for (const s of historySizes) {
      if (inProductSizes(s, product)) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestCount = 0;
    for (const [size, count] of counts) {
      if (count > bestCount) {
        bestCount = count;
        best = size;
      }
    }
    if (best) return { suggested_size: best, basis: 'HISTORY' };
  }
  // 3. Size chart — nearest row from the latest MANUAL measurement.
  if (chartRow && inProductSizes(chartRow.size_label, product)) {
    return { suggested_size: chartRow.size_label, basis: 'CHART' };
  }
  return { suggested_size: null, basis: null };
}

/** DB-aware wrapper: pulls the signals (purchase history + latest MANUAL
 *  measurement + the retailer's chart for the product's body category) and
 *  runs the pure core. */
export async function recommendSizeForProduct(
  retailerId: string,
  customer: CustomerLike & { id: string },
  product: ProductLike & { category: string | null },
): Promise<SizeRecommendation> {
  // History: purchase-type interactions → their products' size lists.
  const purchases = await prisma.customerInteraction.findMany({
    where: { retailer_id: retailerId, customer_id: customer.id, type: 'purchase' },
    select: { product: { select: { sizes: true } } },
    take: 50,
  });
  const historySizes = purchases.flatMap((i) => i.product?.sizes ?? []);

  // Chart: latest MANUAL measurement + the retailer's chart for the category.
  const category = chartCategoryForProduct(product.category);
  const [measurement, chart] = await Promise.all([
    prisma.customerMeasurement.findFirst({
      where: { retailer_id: retailerId, customer_id: customer.id, source: 'MANUAL' },
      orderBy: { created_at: 'desc' },
    }),
    prisma.sizeChart.findUnique({
      where: { retailer_id_category: { retailer_id: retailerId, category } },
      include: { rows: { orderBy: { sort_order: 'asc' } } },
    }),
  ]);
  const chartRow = measurement && chart?.rows.length ? findRecommendedSize(chart.rows, chart.category, measurement) : null;

  return recommendSizeFromSignals(customer, product, historySizes, chartRow);
}
