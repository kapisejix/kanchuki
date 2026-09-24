import { PLAN_PRICING } from '@kanchuki/shared'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

export type Plan = 'STARTER' | 'GROWTH' | 'PRO'
export type PlanPrices = Record<Plan, { monthly: number }>

/**
 * Live plan prices (paise, ex-GST) from the admin-editable plan_pricing table.
 * Falls back per plan to PLAN_PRICING — the same fallback the API applies — so a
 * marketing page never renders blank when the API is down.
 */
export async function getPlanPricing(): Promise<PlanPrices> {
  try {
    const res = await fetch(`${API_URL}/v1/public/pricing`, { next: { revalidate: 60 } })
    if (!res.ok) return PLAN_PRICING
    const rows: { plan: Plan; monthly: number }[] = (await res.json()).data ?? []
    const byPlan = new Map(rows.map((r) => [r.plan, r.monthly]))
    return {
      STARTER: { monthly: byPlan.get('STARTER') ?? PLAN_PRICING.STARTER.monthly },
      GROWTH: { monthly: byPlan.get('GROWTH') ?? PLAN_PRICING.GROWTH.monthly },
      PRO: { monthly: byPlan.get('PRO') ?? PLAN_PRICING.PRO.monthly },
    }
  } catch {
    return PLAN_PRICING
  }
}

export const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`
