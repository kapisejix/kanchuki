const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

export type Plan = 'STARTER' | 'GROWTH' | 'PRO'
export type PlanPrices = Record<Plan, { monthly: number }>

/**
 * Live plan prices (paise, ex-GST) from the admin-editable plan_pricing table —
 * the only source. Returns null when the API is down or any plan is missing;
 * callers hide the price rather than show a stale hardcoded one.
 */
export async function getPlanPricing(): Promise<PlanPrices | null> {
  try {
    const res = await fetch(`${API_URL}/v1/public/pricing`, { next: { revalidate: 60 } })
    if (!res.ok) return null
    const rows: { plan: Plan; monthly: number }[] = (await res.json()).data ?? []
    const byPlan = new Map(rows.map((r) => [r.plan, r.monthly]))
    const get = (p: Plan) => byPlan.get(p)
    const [s, g, p] = [get('STARTER'), get('GROWTH'), get('PRO')]
    if (s == null || g == null || p == null) return null
    return { STARTER: { monthly: s }, GROWTH: { monthly: g }, PRO: { monthly: p } }
  } catch {
    return null
  }
}

export const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`
