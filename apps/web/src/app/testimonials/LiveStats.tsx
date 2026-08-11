'use client'

// Client-only (needs useEffect to fetch live stats) — kept separate from
// page.tsx so the page stays a Server Component and can export `metadata`.
// Unlike the homepage StatsBar, this page's whole point is "real proof,
// never invented" — so there is no fake fallback number here. No data yet
// means an honest empty state, not a placeholder count.

import { useEffect, useState } from 'react'
import { Shirt, Share2, Store, MessageCircle } from 'lucide-react'

interface Stats {
  total_products: number
  total_collections: number
  total_retailers: number
  enquiries_this_month: number
}

export function LiveStats() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'
    fetch(`${apiUrl}/v1/public/stats`)
      .then((r) => r.json())
      .then((res) => {
        if (res?.data) setStats(res.data)
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  if (loaded && (!stats || stats.total_retailers === 0)) {
    return (
      <div className="text-center py-10 border border-dashed border-carbon/25 rounded-2xl bg-white">
        <p className="text-carbon/60">We&apos;re just getting started — be one of the first stores on Kanchuki.</p>
      </div>
    )
  }

  const items = [
    { label: 'Retailers onboarded', value: stats?.total_retailers, icon: Store },
    { label: 'Products digitized', value: stats?.total_products, icon: Shirt },
    { label: 'Collections shared', value: stats?.total_collections, icon: Share2 },
    { label: 'Enquiries this month', value: stats?.enquiries_this_month, icon: MessageCircle },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 bg-white rounded-2xl border border-carbon/10 p-8">
      {items.map((item) => (
        <div key={item.label} className="text-center">
          <item.icon size={22} strokeWidth={1.5} className="mx-auto mb-2 text-cobalt-600" />
          <div className="font-display text-2xl sm:text-3xl font-semibold text-carbon tabular-nums">
            {item.value !== undefined ? item.value.toLocaleString('en-IN') : '—'}
          </div>
          <div className="text-sm text-carbon/50 mt-1">{item.label}</div>
        </div>
      ))}
    </div>
  )
}
