import type { Metadata } from 'next'
import { SurveyGate } from './SurveyGate'

// Staff-only field tool (not linked from the public marketing nav) — a
// Kanchuki agent fills this in while standing in a retailer's shop.
// robots: noindex since this must not surface in search results either.
export const metadata: Metadata = {
  title: 'Retailer Sales Form — Kanchuki',
  robots: { index: false, follow: false },
}

export default function SurveyPage() {
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px 80px' }}>
      <SurveyGate />
    </div>
  )
}
