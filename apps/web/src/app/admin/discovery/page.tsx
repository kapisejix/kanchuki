'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  MapPin,
  Store,
  Navigation,
  Phone,
  Package,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react'
import { adminGetOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

// ─── Types ─────────────────────────────────────────────────────────

type RetailerLocation = {
  id: string
  shop_name: string | null
  phone: string
  city: string | null
  state: string | null
  latitude: number | null
  longitude: number | null
  address_line1: string | null
  address_line2: string | null
  pincode: string | null
  public_slug: string | null
  product_count: number
}

// ─── Helpers ──────────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 220, damping: 24 } },
}

// ─── Main Page ────────────────────────────────────────────────────

export default function DiscoveryPage() {
  const [retailers, setRetailers] = useState<RetailerLocation[] | null>(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = async () => {
    try {
      const res = await fetch(`${API_URL}/v1/admin/retailers?limit=500`, adminGetOptions())
      const json = await res.json()
      if (json?.data) {
        // Filter to retailers with location data
        const withLocation = json.data
          .filter((r: RetailerLocation) => r.latitude != null && r.longitude != null)
          .map((r: RetailerLocation) => ({
            ...r,
            product_count: r.product_count ?? 0,
          }))
        setRetailers(withLocation)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load retailer locations')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = (retailers ?? []).filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (r.shop_name?.toLowerCase().includes(q) ?? false) ||
      (r.city?.toLowerCase().includes(q) ?? false) ||
      (r.state?.toLowerCase().includes(q) ?? false) ||
      r.phone.includes(q)
    )
  })

  const selected = filtered.find((r) => r.id === selectedId)

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Local Discovery</h1>
          <MapPin size={20} className="text-emerald-500" />
        </div>
        <p className="text-sm text-gray-500 max-w-2xl">
          Retailer locations with geo-coordinates. Customers use &ldquo;Near Me&rdquo; search
          to discover nearby stores. Retailers without coordinates won&apos;t appear.
        </p>
      </motion.div>

      {error && (
        <motion.div
          variants={itemVariants}
          className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl px-6 py-4"
        >
          {error}
        </motion.div>
      )}

      {/* Stats */}
      {retailers && (
        <motion.div variants={containerVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard icon={Store} label="Total Retailers" value={String(retailers.length)} color="emerald" />
          <StatsCard
            icon={MapPin}
            label="With Location"
            value={String(retailers.filter((r) => r.latitude != null).length)}
            color="blue"
          />
          <StatsCard
            icon={Navigation}
            label="Cities"
            value={String(new Set(retailers.map((r) => r.city).filter(Boolean)).size)}
            color="purple"
          />
          <StatsCard
            icon={Package}
            label="Avg Products"
            value={String(
              retailers.length > 0
                ? Math.round(retailers.reduce((s, r) => s + r.product_count, 0) / retailers.length)
                : 0,
            )}
            color="amber"
          />
        </motion.div>
      )}

      {/* Search */}
      <motion.div variants={itemVariants}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, city, state, or phone…"
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 outline-none focus:border-emerald-400 bg-white/80"
        />
      </motion.div>

      {/* Retailer grid */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((r, i) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            onClick={() => setSelectedId(r.id === selectedId ? null : r.id)}
            className={`bg-white/80 backdrop-blur-sm rounded-2xl border p-5 cursor-pointer transition-all ${
              r.id === selectedId
                ? 'border-emerald-400 shadow-lg shadow-emerald-500/10'
                : 'border-gray-200/80 hover:border-emerald-200'
            }`}
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                <Store size={18} className="text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{r.shop_name ?? 'Unnamed'}</p>
                <p className="text-xs text-gray-400 truncate">
                  {[r.city, r.state].filter(Boolean).join(', ') || 'No city'}
                </p>
              </div>
            </div>

            <div className="space-y-1.5 text-xs text-gray-500">
              <div className="flex items-center gap-2">
                <MapPin size={12} className="text-gray-400 shrink-0" />
                <span className="truncate">
                  {r.latitude?.toFixed(4)}, {r.longitude?.toFixed(4)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Phone size={12} className="text-gray-400 shrink-0" />
                <span>{r.phone}</span>
              </div>
              <div className="flex items-center gap-2">
                <Package size={12} className="text-gray-400 shrink-0" />
                <span>{r.product_count} products</span>
              </div>
            </div>

            {r.public_slug && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <a
                  href={`/c/${r.public_slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700"
                >
                  <ExternalLink size={11} />
                  View storefront
                </a>
              </div>
            )}
          </motion.div>
        ))}
      </motion.div>

      {!retailers && !error && (
        <div className="text-center text-sm text-gray-400 animate-pulse py-12">Loading retailer locations…</div>
      )}

      {retailers && filtered.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-gray-500">
            {search ? 'No retailers match your search.' : 'No retailers have location data yet.'}
          </p>
        </div>
      )}
    </motion.div>
  )
}

// ── Stats card ─────────────────────────────────────────────────────

function StatsCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: LucideIcon
  label: string
  value: string
  color: 'emerald' | 'blue' | 'purple' | 'amber'
}) {
  const colorMap = {
    emerald: { bg: 'bg-emerald-50 border-emerald-100', icon: 'text-emerald-500' },
    blue: { bg: 'bg-blue-50 border-blue-100', icon: 'text-blue-500' },
    purple: { bg: 'bg-purple-50 border-purple-100', icon: 'text-purple-500' },
    amber: { bg: 'bg-amber-50 border-amber-100', icon: 'text-amber-500' },
  }
  const c = colorMap[color]
  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -2 }}
      className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200/80 p-5"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-9 h-9 rounded-xl ${c.bg} border flex items-center justify-center`}>
          <Icon size={17} className={c.icon} />
        </div>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
    </motion.div>
  )
}
