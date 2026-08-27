'use client'

import { motion } from 'framer-motion'

// Route-level loading skeletons for the admin panel. These flash for well
// under a second on navigation, so they signal "a page with this shape is
// loading" — they are not pixel-clones of each screen. One <PageSkeleton
// variant> covers every admin route; admin/loading.tsx maps pathname → variant.
// (Was 25 hand-maintained per-page components + a 1024-line file; collapsed
// 2026-08-27 — see audit report.)

// ─── Primitives ──────────────────────────────────────────────────

function ShimmerOverlay() {
  return (
    <div className="absolute inset-0 -translate-x-full overflow-hidden">
      <motion.div
        animate={{ x: ['-100%', '200%'] }}
        transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
      />
    </div>
  )
}

function P({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`bg-gray-200/70 rounded animate-pulse ${className}`} style={style} />
}

function Header() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <P className="h-7 w-48 rounded-lg" />
        <P className="h-7 w-7 rounded-lg" />
      </div>
      <P className="h-3 w-56 mt-1 rounded" />
    </div>
  )
}

function FilterBar() {
  return (
    <div className="flex flex-wrap gap-3">
      <P className="h-10 flex-1 min-w-[220px] rounded-xl" />
      <P className="h-10 w-36 rounded-xl" />
      <P className="h-10 w-36 rounded-xl" />
    </div>
  )
}

function MetricCard() {
  return (
    <div className="relative bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200/80 p-5 overflow-hidden">
      <ShimmerOverlay />
      <div className="flex items-start justify-between mb-3">
        <P className="h-3 w-20 rounded" />
        <P className="h-9 w-9 rounded-xl" />
      </div>
      <P className="h-8 w-24 mb-2 rounded" />
      <P className="h-3 w-32 rounded" />
    </div>
  )
}

function Card({ lines = 3 }: { lines?: number }) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200/80 p-6 overflow-hidden relative">
      <ShimmerOverlay />
      {Array.from({ length: lines }).map((_, i) => (
        <P key={i} className="h-4 mb-3 last:mb-0 rounded" style={{ width: `${60 - i * 12}%` }} />
      ))}
    </div>
  )
}

function Table({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/80">
              {Array.from({ length: cols }).map((_, i) => (
                <th key={i} className="px-4 py-3.5">
                  <P className="h-3 w-16 rounded" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r} className="border-b border-gray-50">
                {Array.from({ length: cols }).map((_, c) => (
                  <td key={c} className="px-4 py-4">
                    <P className="h-4 rounded" style={{ width: `${45 + ((r + c) % 4) * 12}%` }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RowCards({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <P className="h-4 w-3/4 rounded" />
              <P className="h-3 w-32 rounded" />
            </div>
            <div className="flex items-center gap-2">
              <P className="h-9 w-24 rounded-xl" />
              <P className="h-9 w-20 rounded-xl" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── One skeleton for every admin route ──────────────────────────

export type SkeletonVariant = 'table' | 'dashboard' | 'form' | 'list'

export function PageSkeleton({ variant = 'table' }: { variant?: SkeletonVariant }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="space-y-6">
      <Header />

      {variant === 'dashboard' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <MetricCard key={i} />
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card lines={5} />
            <Card lines={5} />
          </div>
        </>
      )}

      {variant === 'form' && (
        <div className="space-y-6 max-w-4xl">
          <Card lines={3} />
          <Card lines={4} />
          <Card lines={2} />
        </div>
      )}

      {variant === 'list' && <RowCards count={5} />}

      {variant === 'table' && (
        <>
          <FilterBar />
          <Table rows={8} cols={7} />
        </>
      )}
    </motion.div>
  )
}
