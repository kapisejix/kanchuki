const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

export type Plan = 'STARTER' | 'GROWTH' | 'PRO';
/** max_products: the cap the server enforces (RC-179); null = unlimited. */
export type PlanPrices = Record<Plan, { monthly: number; max_products: number | null }>;

/** "500 products" / "Unlimited products" — always from the API, never a constant. */
export const productsLabel = (n: number | null) =>
  n === null ? 'Unlimited products' : `${n.toLocaleString('en-IN')} products`;

/**
 * Live plan prices (paise, ex-GST) from the admin-editable plan_pricing table —
 * the only source. Returns null when the API is down or any plan is missing;
 * callers hide the price rather than show a stale hardcoded one.
 */
export async function getPlanPricing(): Promise<PlanPrices | null> {
  try {
    const res = await fetch(`${API_URL}/v1/public/pricing`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const rows: { plan: Plan; monthly: number; max_products?: number | null }[] =
      (await res.json()).data ?? [];
    const byPlan = new Map(rows.map((r) => [r.plan, r]));
    const get = (p: Plan) => {
      const r = byPlan.get(p);
      return r ? { monthly: r.monthly, max_products: r.max_products ?? null } : undefined;
    };
    const [s, g, p] = [get('STARTER'), get('GROWTH'), get('PRO')];
    if (!s || !g || !p) return null;
    return { STARTER: s, GROWTH: g, PRO: p };
  } catch {
    return null;
  }
}

export const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;
