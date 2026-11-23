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
  /** 'RETAILER_PIN' = shop pinned in the app; 'GEOCODED_APPROX' = guessed from the typed address. */
  location_source: string | null
  address_line1: string | null
  address_line2: string | null
  pincode: string | null
  public_slug: string | null
  product_count: number
  /** Only on "nearby" results: straight-line km from the searched pincode/city centre. */
  distance_km?: number
}

type Nearby = {
  center: { lat: number; lng: number; label: string; level: 'address' | 'pincode' | 'city' }
  radius_km: number
  count: number
  retailers: RetailerLocation[]
}

const RADIUS_OPTIONS = [5, 10, 25, 50, 100, 200]

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
  const [totalAll, setTotalAll] = useState(0)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // "Stores near a pincode / city" search. null = not searching (show every located store).
  const [place, setPlace] = useState('')
  const [radius, setRadius] = useState(25)
  const [nearby, setNearby] = useState<Nearby | null>(null)
  const [nearbyError, setNearbyError] = useState('')
  const [nearbyLoading, setNearbyLoading] = useState(false)

  const runNearby = async () => {
    const q = place.trim()
    if (q.length < 2) return
    setNearbyLoading(true)
    setNearbyError('')
    try {
      const res = await fetch(
        `${API_URL}/v1/admin/discovery/nearby?query=${encodeURIComponent(q)}&radius_km=${radius}`,
        adminGetOptions(),
      )
      const json = await res.json()
      if (!res.ok) {
        throw new Error(
          res.status === 404
            ? `Could not find "${q}" in India. Check the pincode or city name.`
            : (json?.error?.message ?? `Search failed (HTTP ${res.status})`),
        )
      }
      setNearby(json.data)
    } catch (err) {
      setNearby(null)
      setNearbyError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setNearbyLoading(false)
    }
  }

  const clearNearby = () => {
    setNearby(null)
    setNearbyError('')
    setPlace('')
  }

  const load = async () => {
    try {
      // Only retailers with coordinates can appear in "Near Me" discovery, so ask the
      // API for just those (has_location) and walk its cursor, 100 per page (API max).
      const located: RetailerLocation[] = []
      let cursor: string | null = null
      do {
        const qs: string = `limit=100&has_location=true${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
        const res = await fetch(`${API_URL}/v1/admin/retailers?${qs}`, adminGetOptions())
        if (!res.ok) throw new Error(`Failed to load retailers (HTTP ${res.status})`)
        const json = await res.json()
        located.push(...(json?.data ?? []))
        cursor = json?.pagination?.has_more ? (json.pagination.cursor ?? null) : null
      } while (cursor)

      const statsRes = await fetch(`${API_URL}/v1/admin/stats`, adminGetOptions())
      const stats = statsRes.ok ? await statsRes.json() : null
      setTotalAll(stats?.data?.total_retailers ?? located.length)
      setRetailers(located.map((r) => ({ ...r, product_count: r.product_count ?? 0 })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load retailer locations')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = (nearby?.retailers ?? retailers ?? []).filter((r) => {
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
          <StatsCard icon={Store} label="Total Retailers" value={String(totalAll)} color="emerald" />
          <StatsCard
            icon={MapPin}
            label="With Location"
            value={`${retailers.length} of ${totalAll}`}
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

      {/* Stores near a pincode / city, within a radius */}
      <motion.div
        variants={itemVariants}
        className="bg-white rounded-2xl border border-gray-200/80 p-4 space-y-3"
      >
        <p className="text-sm font-semibold text-gray-900">Find stores near a pincode or city</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void runNearby()
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            placeholder="Pincode (e.g. 160022) or city (e.g. Mohali)"
            className="flex-1 min-w-[220px] border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 outline-none focus:border-emerald-400 bg-white"
          />
          <select
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            aria-label="Radius"
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-white"
          >
            {RADIUS_OPTIONS.map((km) => (
              <option key={km} value={km}>
                Within {km} km
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={nearbyLoading || place.trim().length < 2}
            className="px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
          >
            {nearbyLoading ? 'Searching…' : 'Search'}
          </button>
          {(nearby || nearbyError) && (
            <button
              type="button"
              onClick={clearNearby}
              className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 bg-white"
            >
              Clear
            </button>
          )}
        </form>
        {nearbyError && <p className="text-sm text-red-600">{nearbyError}</p>}
        {nearby && (
          <p className="text-xs text-gray-500">
            <span className="font-semibold text-gray-700">{nearby.count}</span> store
            {nearby.count === 1 ? '' : 's'} within {nearby.radius_km} km of{' '}
            <span className="font-medium text-gray-700">{nearby.center.label}</span>
            {nearby.center.level !== 'address' &&
              ` (centre of the ${nearby.center.level === 'pincode' ? 'pincode area' : 'city'}, straight-line distance)`}
          </p>
        )}
      </motion.div>

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
            className={`bg-white rounded-2xl border p-5 cursor-pointer transition ${
              r.id === selectedId
                ? 'border-emerald-400 shadow-lg'
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
                {r.distance_km !== undefined && (
                  <span className="shrink-0 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    {r.distance_km} km
                  </span>
                )}
                {r.location_source === 'GEOCODED_APPROX' && (
                  <span
                    title="Guessed from the typed address. Replaced when the retailer pins their shop."
                    className="shrink-0 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
                  >
                    Approx
                  </span>
                )}
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
                  href={`/${r.public_slug}`}
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
            {search
              ? 'No retailers match your search.'
              : nearby
                ? `No stores with a location within ${nearby.radius_km} km. Try a bigger radius.`
                : 'No retailers have location data yet.'}
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
      className="bg-white rounded-2xl border border-gray-200/80 p-5"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-9 h-9 rounded-xl ${c.bg} border flex items-center justify-center`}>
          <Icon size={17} className={c.icon} />
        </div>
        <span className="text-xs font-semibold text-gray-500 uppercase">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
    </motion.div>
  )
}
