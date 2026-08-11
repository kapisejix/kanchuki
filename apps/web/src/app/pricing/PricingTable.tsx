'use client'

// Client-only piece of the pricing page (monthly/annual toggle needs
// useState) — kept separate from page.tsx so the page itself stays a
// Server Component and can export `metadata` + JSON-LD.

import { useState } from 'react'
import { IndianRupee } from 'lucide-react'
import Link from 'next/link'

type Period = 'monthly' | 'annual'
type PlanPricing = Record<'STARTER' | 'GROWTH' | 'PRO', { monthly: number; annual: number }>

const PLAN_KEYS: ('STARTER' | 'GROWTH' | 'PRO')[] = ['STARTER', 'GROWTH', 'PRO']
const PLAN_LABELS = { STARTER: 'Starter', GROWTH: 'Growth', PRO: 'Pro' } as const
const PLAN_NOTES = {
  STARTER: 'A single shop starting its first catalog.',
  GROWTH: 'A shop with a serious catalog and regular WhatsApp selling.',
  PRO: 'Busy multi-staff shops that want automation and unlimited everything.',
} as const

export function PricingTable({ pricing, rows }: { pricing: PlanPricing; rows: { label: string; values: [string, string, string] }[] }) {
  const [period, setPeriod] = useState<Period>('monthly')

  return (
    <div>
      <div className="flex items-center justify-center gap-4 mb-10">
        <button onClick={() => setPeriod('monthly')} className={`text-sm font-medium transition-colors ${period === 'monthly' ? 'text-charcoal' : 'text-sand-400'}`}>Monthly</button>
        <button onClick={() => setPeriod(period === 'monthly' ? 'annual' : 'monthly')} className={`relative w-12 h-6 rounded-full transition-colors ${period === 'annual' ? 'bg-ink-600' : 'bg-sand-200'}`} aria-label="Toggle billing period">
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${period === 'annual' ? 'translate-x-6' : ''}`} />
        </button>
        <button onClick={() => setPeriod('annual')} className={`text-sm font-medium transition-colors ${period === 'annual' ? 'text-charcoal' : 'text-sand-400'}`}>Annual <span className="text-turmeric-700 font-semibold">(Save 20%)</span></button>
      </div>

      <div className="grid sm:grid-cols-3 gap-6 lg:gap-8 mb-14">
        {PLAN_KEYS.map((key) => {
          const planPricing = pricing[key]
          const price = (period === 'monthly' ? planPricing.monthly : planPricing.annual) / 100
          const periodLabel = period === 'monthly' ? '/mo' : '/yr'
          const highlight = key === 'GROWTH'
          return (
            <div key={key} className={`relative rounded-xl p-6 sm:p-8 border transition-colors duration-300 ${highlight ? 'border-ink-600 bg-ink-600 text-white' : 'border-sand-200 bg-white'}`}>
              {highlight && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-ink-700 text-xs font-semibold px-4 py-1 rounded-full border border-ink-100">MOST POPULAR</div>}
              <h3 className={`text-xl font-semibold mb-1 ${highlight ? 'text-white' : 'text-charcoal'}`}>{PLAN_LABELS[key]}</h3>
              <div className={`font-display text-3xl sm:text-4xl font-semibold mb-1 ${highlight ? 'text-white' : 'text-charcoal'}`}>
                <span className="inline-flex items-center"><IndianRupee size={22} strokeWidth={1.5} className={highlight ? 'text-white/80' : 'text-sand-400'} />{price.toLocaleString('en-IN')}</span>
                <span className={`text-base font-normal ${highlight ? 'text-white/70' : 'text-sand-400'}`}>{periodLabel}</span>
              </div>
              <p className={`text-sm mb-6 ${highlight ? 'text-white/70' : 'text-sand-400'}`}>{PLAN_NOTES[key]}</p>
              <Link href="/contact" className={`block text-center py-3.5 rounded-full font-semibold transition active:scale-[0.97] ${highlight ? 'bg-white text-ink-700 hover:bg-ink-50' : 'bg-ink-600 text-white hover:bg-ink-700'}`}>Start 14-day free trial</Link>
            </div>
          )
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border border-sand-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-sand-100 bg-sand-50">
              <th className="text-left px-5 py-4 text-sand-500 font-medium text-xs uppercase tracking-wider"> </th>
              {PLAN_KEYS.map((key) => (
                <th key={key} className="px-4 py-4 text-center text-sand-500 font-medium text-xs uppercase tracking-wider">{PLAN_LABELS[key]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.label} className={i % 2 === 0 ? 'bg-white' : 'bg-sand-50/50'}>
                <td className="px-5 py-3.5 text-sand-700 font-medium">{row.label}</td>
                {row.values.map((v, vi) => (
                  <td key={vi} className="px-4 py-3.5 text-center text-sand-600">{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
