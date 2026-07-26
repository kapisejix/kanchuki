'use client'

import { motion } from 'framer-motion'

// ─── Shared shimmer overlay ──────────────────────────────────────

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

// ─── Skeleton helpers ────────────────────────────────────────────

function P({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`bg-gray-200/70 rounded animate-pulse ${className}`} style={style} />
  )
}

function HeaderSkeleton() {
  return (
    <div className="flex items-center gap-3 mb-1">
      <P className="h-7 w-48 rounded-lg" />
      <P className="h-7 w-7 rounded-lg" />
    </div>
  )
}

function MetricCardSkeleton() {
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

function MiniCardSkeleton() {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200/80 p-4">
      <div className="flex items-center gap-2 mb-2">
        <P className="h-3.5 w-3.5 rounded" />
        <P className="h-3 w-20 rounded" />
      </div>
      <P className="h-6 w-16 rounded" />
    </div>
  )
}

function TableRowSkeleton({ cols = 6 }: { cols?: number }) {
  return (
    <tr className="border-b border-gray-50">
      {Array.from({ length: cols }).map((_, j) => (
        <td key={j} className="px-4 py-4">
          <P className="h-4 rounded" style={{ width: `${40 + Math.random() * 40}%` }} />
        </td>
      ))}
    </tr>
  )
}

function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
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
            {Array.from({ length: rows }).map((_, i) => (
              <TableRowSkeleton key={i} cols={cols} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200/80 p-6 overflow-hidden relative">
      <ShimmerOverlay />
      {Array.from({ length: lines }).map((_, i) => (
        <P key={i} className="h-4 mb-3 last:mb-0 rounded" style={{ width: `${60 - i * 15}%` }} />
      ))}
    </div>
  )
}

function StatsCardSkeleton() {
  return (
    <div className="relative bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200/80 p-4 overflow-hidden">
      <ShimmerOverlay />
      <div className="flex items-center gap-2 mb-1.5">
        <P className="h-3.5 w-3.5 rounded" />
        <P className="h-3 w-12 rounded" />
      </div>
      <P className="h-6 w-10 rounded" />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
//  Page-Specific Skeletons
// ══════════════════════════════════════════════════════════════════

// ─── 1. Dashboard ────────────────────────────────────────────────

export function DashboardSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
    >
      <div>
        <HeaderSkeleton />
        <P className="h-3 w-56 mt-1 rounded" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <MiniCardSkeleton key={i} />)}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white/80 rounded-2xl border border-gray-200/80 p-5 relative overflow-hidden">
            <ShimmerOverlay />
            <div className="flex items-start justify-between mb-3">
              <div className="space-y-2 flex-1">
                <P className="h-4 w-24 rounded" />
                <P className="h-3 w-40 rounded" />
              </div>
              <P className="h-6 w-6 rounded" />
            </div>
          </div>
        ))}
      </div>

      <CardSkeleton lines={5} />
    </motion.div>
  )
}

// ─── 2. Billing ──────────────────────────────────────────────────

export function BillingSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 max-w-4xl">
      <div>
        <HeaderSkeleton />
        <P className="h-3 w-40 mt-1 rounded" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)}
      </div>

      <CardSkeleton lines={3} />

      <CardSkeleton lines={2} />

      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6">
        <P className="h-4 w-32 mb-4 rounded" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <P className="h-3 w-40 rounded" />
              <P className="h-4 w-20 rounded" />
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

// ─── 3. Reports ──────────────────────────────────────────────────

export function ReportsSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <HeaderSkeleton />
          <P className="h-3 w-56 mt-1 rounded" />
        </div>
        <P className="h-8 w-8 rounded-xl" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <StatsCardSkeleton key={i} />)}
      </div>

      <div className="flex gap-2 bg-white/60 rounded-xl p-1.5 w-fit">
        {Array.from({ length: 3 }).map((_, i) => (
          <P key={i} className="h-9 w-36 rounded-xl" />
        ))}
      </div>

      <TableSkeleton rows={5} cols={7} />
    </motion.div>
  )
}

// ─── 4. Retailers ────────────────────────────────────────────────

export function RetailersSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center gap-3">
        <P className="h-7 w-32 rounded-lg" />
        <P className="h-7 w-7 rounded-lg" />
      </div>
      <P className="h-3 w-44 rounded" />

      <div className="flex flex-wrap gap-3">
        <P className="h-10 flex-1 min-w-[220px] rounded-xl" />
        <P className="h-10 w-36 rounded-xl" />
        <P className="h-10 w-36 rounded-xl" />
      </div>

      <TableSkeleton rows={8} cols={7} />
    </motion.div>
  )
}

// ─── 5. Customers ────────────────────────────────────────────────

export function CustomersSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <HeaderSkeleton />
      <P className="h-3 w-48 rounded" />

      <div className="flex flex-wrap gap-3">
        <P className="h-10 flex-1 min-w-[220px] rounded-xl" />
        <P className="h-10 w-36 rounded-xl" />
      </div>

      <TableSkeleton rows={8} cols={6} />
    </motion.div>
  )
}

// ─── 6. Team Members ─────────────────────────────────────────────

export function TeamMembersSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <HeaderSkeleton />
          <P className="h-3 w-52 mt-1 rounded" />
        </div>
        <P className="h-9 w-36 rounded-xl" />
      </div>

      <div className="flex flex-wrap gap-3">
        <P className="h-10 flex-1 min-w-[220px] rounded-xl" />
        <P className="h-10 w-36 rounded-xl" />
      </div>

      <TableSkeleton rows={6} cols={6} />
    </motion.div>
  )
}

// ─── 7. Support Tickets ──────────────────────────────────────────

export function SupportTicketsSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <HeaderSkeleton />
          <P className="h-3 w-56 mt-1 rounded" />
        </div>
        <div className="flex items-center gap-2">
          <P className="h-9 w-28 rounded-xl" />
          <P className="h-8 w-8 rounded-xl" />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <StatsCardSkeleton key={i} />)}
      </div>

      <div className="flex flex-wrap gap-3">
        <P className="h-10 flex-1 min-w-[220px] rounded-xl" />
        <P className="h-10 w-36 rounded-xl" />
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <TableSkeleton rows={5} cols={6} />
        </div>
        <P className="hidden sm:block w-80 rounded-2xl" style={{ minHeight: 400 }} />
      </div>
    </motion.div>
  )
}

// ─── 8. Audit Log ────────────────────────────────────────────────

export function AuditLogSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <P className="h-10 w-10 rounded-xl" />
          <div>
            <P className="h-6 w-24 rounded-lg" />
            <P className="h-3 w-64 mt-0.5 rounded" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <P className="h-8 w-20 rounded-xl" />
          <P className="h-8 w-16 rounded-xl" />
        </div>
      </div>

      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-5">
        <P className="h-3 w-16 mb-3 rounded" />
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <P key={i} className="h-9 rounded-xl" />)}
        </div>
        <P className="h-8 w-28 mt-3 rounded-xl" />
      </div>

      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white/80 rounded-xl border border-gray-200/80 p-4">
            <div className="flex items-center gap-3">
              <P className="h-2 w-2 rounded-full" />
              <P className="h-5 w-20 rounded-md" />
              <P className="h-4 flex-1 rounded" />
              <P className="h-3 w-16 rounded hidden sm:block" />
              <P className="h-3 w-12 rounded hidden md:block" />
              <P className="h-3 w-16 rounded hidden lg:block" />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

// ─── 9. Addon Purchases ──────────────────────────────────────────

export function AddonPurchasesSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-6xl">
      <div>
        <HeaderSkeleton />
        <P className="h-3 w-64 mt-1 rounded" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-5">
            <div className="flex items-center gap-3 mb-3">
              <P className="h-10 w-10 rounded-xl" />
              <P className="h-4 w-24 rounded" />
            </div>
            <P className="h-7 w-20 rounded" />
            <P className="h-3 w-28 mt-1 rounded" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-5">
          <P className="h-4 w-32 mb-4 rounded" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <div className="flex justify-between mb-1">
                  <P className="h-3 w-28 rounded" />
                  <P className="h-3 w-16 rounded" />
                </div>
                <P className="h-1.5 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="lg:col-span-2 bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-5">
          <P className="h-4 w-20 mb-4 rounded" />
          <TableSkeleton rows={4} cols={5} />
        </div>
      </div>
    </motion.div>
  )
}

// ─── 10. Plan Limits ─────────────────────────────────────────────

export function PlanLimitsSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-5xl">
      <div>
        <HeaderSkeleton />
        <P className="h-3 w-96 mt-1 rounded" />
      </div>

      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-3 py-2"><P className="h-3 w-16 rounded" /></th>
              {Array.from({ length: 3 }).map((_, i) => (
                <th key={i} className="px-3 py-2"><P className="h-3 w-16 rounded" /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="px-3 py-3"><P className="h-4 w-24 rounded" /></td>
                {Array.from({ length: 3 }).map((_, j) => (
                  <td key={j} className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <P className="h-8 w-20 rounded-lg" />
                      <P className="h-8 w-16 rounded-lg" />
                      <P className="h-8 w-8 rounded-lg" />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  )
}

// ─── 11. Rate Limits ─────────────────────────────────────────────

export function RateLimitsSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <HeaderSkeleton />
          <P className="h-3 w-72 mt-1 rounded" />
        </div>
        <div className="flex items-center gap-3">
          <P className="h-9 w-20 rounded-xl" />
          <P className="h-9 w-36 rounded-xl" />
        </div>
      </div>

      <TableSkeleton rows={8} cols={5} />
    </motion.div>
  )
}

// ─── 12. AI Config ───────────────────────────────────────────────

export function AiConfigSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <HeaderSkeleton />
          <P className="h-3 w-64 mt-1 rounded" />
        </div>
        <P className="h-9 w-36 rounded-xl" />
      </div>

      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5">
            <P className="h-5 w-32 mb-4 rounded" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j}>
                  <P className="h-3 w-16 mb-1 rounded" />
                  <P className="h-9 w-full rounded-xl" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

// ─── 13. Notifications ───────────────────────────────────────────

export function NotificationsSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <P className="h-10 w-10 rounded-xl" />
          <div>
            <P className="h-6 w-48 rounded-lg" />
            <P className="h-3 w-56 mt-0.5 rounded" />
          </div>
        </div>
        <P className="h-9 w-24 rounded-xl" />
      </div>

      <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-6">
        <div className="flex items-center gap-3">
          <P className="h-6 w-6 rounded-full" />
          <div>
            <P className="h-4 w-40 rounded" />
            <P className="h-3 w-64 mt-0.5 rounded" />
          </div>
        </div>
      </div>

      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden">
          <div className="px-5 py-4">
            <div className="flex items-center gap-3">
              <P className="h-9 w-9 rounded-xl" />
              <div className="flex-1">
                <P className="h-4 w-40 rounded" />
                <P className="h-3 w-56 mt-0.5 rounded" />
              </div>
              <P className="h-4 w-4 rounded" />
            </div>
          </div>
        </div>
      ))}
    </motion.div>
  )
}

// ─── 14. Retailer Detail ─────────────────────────────────────────

export function RetailerDetailSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <P className="h-9 w-9 rounded-xl" />
        <div>
          <div className="flex items-center gap-2">
            <P className="h-6 w-40 rounded-lg" />
            <P className="h-5 w-16 rounded-full" />
          </div>
          <P className="h-3 w-32 mt-0.5 rounded" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <CardSkeleton lines={10} />
          <CardSkeleton lines={4} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => <MiniCardSkeleton key={i} />)}
          </div>
          <CardSkeleton lines={5} />
        </div>
        <div className="space-y-6">
          <CardSkeleton lines={6} />
          <CardSkeleton lines={4} />
          <CardSkeleton lines={3} />
        </div>
      </div>
    </motion.div>
  )
}

// ─── 15. Operations (hub) ────────────────────────────────────────

export function OperationsSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <P className="h-6 w-6 rounded" />
          <P className="h-7 w-48 rounded-lg" />
        </div>
        <P className="h-3 w-64 rounded" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl p-6 relative overflow-hidden" style={{ background: '#f0f9ff' }}>
            <ShimmerOverlay />
            <div className="flex items-start justify-between mb-4">
              <P className="h-7 w-7 rounded-lg" />
              <P className="h-4 w-4 rounded" />
            </div>
            <P className="h-5 w-32 mb-1 rounded" />
            <P className="h-3 w-full rounded" />
            <P className="h-3 w-3/4 mt-1 rounded" />
          </div>
        ))}
      </div>
    </motion.div>
  )
}

// ─── 16. Pending Approvals ───────────────────────────────────────

export function PendingApprovalsSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <P className="h-6 w-6 rounded" />
            <P className="h-7 w-48 rounded-lg" />
          </div>
          <P className="h-3 w-72 rounded" />
        </div>
        <P className="h-9 w-24 rounded-xl" />
      </div>

      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <P className="h-5 w-20 rounded-full" />
                  <P className="h-3 w-24 rounded" />
                </div>
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
    </motion.div>
  )
}

// ─── 17. Deployments ─────────────────────────────────────────────

export function DeploymentsSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <P className="h-6 w-6 rounded" />
            <P className="h-7 w-40 rounded-lg" />
          </div>
          <P className="h-3 w-48 rounded" />
        </div>
        <div className="flex items-center gap-3">
          <P className="h-9 w-36 rounded-xl" />
          <P className="h-9 w-24 rounded-xl" />
        </div>
      </div>

      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <P className="h-5 w-20 rounded-full" />
                  <P className="h-3 w-24 rounded" />
                  <P className="h-3 w-14 rounded" />
                </div>
                <P className="h-4 w-1/2 rounded" />
                <div className="flex gap-3">
                  <P className="h-3 w-16 rounded" />
                  <P className="h-3 w-28 rounded" />
                  <P className="h-3 w-12 rounded" />
                </div>
              </div>
              <P className="h-8 w-20 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

// ─── 18. Database Backup ─────────────────────────────────────────

export function BackupSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <P className="h-10 w-10 rounded-xl" />
          <div>
            <P className="h-6 w-52 rounded-lg" />
            <P className="h-3 w-56 mt-0.5 rounded" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <P className="h-8 w-20 rounded-xl" />
          <P className="h-8 w-36 rounded-xl" />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)}
      </div>

      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden">
        <div className="flex items-center gap-4 px-5 py-3 bg-gray-50/80 border-b border-gray-200/80">
          {Array.from({ length: 5 }).map((_, i) => (
            <P key={i} className="h-3 rounded" style={{ width: `${i === 0 ? 30 : 15}%` }} />
          ))}
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-100/60">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <P className="h-3.5 w-3.5 rounded" />
                <P className="h-4 w-48 rounded" />
              </div>
              <P className="h-3 w-64 mt-0.5 rounded ml-5.5" />
            </div>
            <P className="h-3 w-16 rounded" />
            <P className="h-3 w-20 rounded hidden sm:block" />
            <P className="h-4 w-4 rounded" />
            <div className="flex items-center gap-1">
              <P className="h-7 w-16 rounded-lg" />
              <P className="h-4 w-4 rounded" />
            </div>
          </div>
        ))}
      </div>

      <CardSkeleton lines={2} />
    </motion.div>
  )
}

// ─── 19. Database Query ──────────────────────────────────────────

export function QuerySkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center gap-3">
        <P className="h-10 w-10 rounded-xl" />
        <div>
          <P className="h-6 w-36 rounded-lg" />
          <P className="h-3 w-48 mt-0.5 rounded" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <P key={i} className="h-9 rounded-xl" style={{ width: `${i === 1 ? 40 : 20}%` }} />
        ))}
      </div>

      <div className="bg-gray-900/95 backdrop-blur-xl rounded-2xl border border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-800/80 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <P className="h-3 w-16 rounded" style={{ background: '#4a5568' }} />
          </div>
          <div className="flex items-center gap-2">
            <P className="h-7 w-24 rounded-lg" style={{ background: '#4a5568' }} />
            <P className="h-7 w-20 rounded-lg" style={{ background: '#4a5568' }} />
          </div>
        </div>
        <div className="p-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <P key={i} className="h-4 rounded" style={{ width: `${70 - i * 10}%`, background: '#4a5568' }} />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <P className="h-8 w-24 rounded-lg" />
        <P className="h-8 w-24 rounded-lg" />
      </div>

      <TableSkeleton rows={5} cols={5} />
    </motion.div>
  )
}

// ─── 20. Settings (hub) ──────────────────────────────────────────

export function SettingsSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div>
        <P className="h-7 w-32 rounded-lg" />
        <P className="h-3 w-64 mt-1 rounded" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl p-6 relative overflow-hidden" style={{ background: '#f0f9ff' }}>
            <ShimmerOverlay />
            <div className="flex items-start justify-between mb-4">
              <P className="h-7 w-7 rounded-lg" />
              <P className="h-4 w-4 rounded" />
            </div>
            <P className="h-5 w-28 mb-1 rounded" />
            <P className="h-3 w-full rounded" />
            <P className="h-3 w-2/3 mt-1 rounded" />
          </div>
        ))}
      </div>
    </motion.div>
  )
}

// ─── 21. Background Images ───────────────────────────────────────

export function BackgroundImagesSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <HeaderSkeleton />
          <P className="h-3 w-64 mt-1 rounded" />
        </div>
        <P className="h-9 w-36 rounded-xl" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200/80 overflow-hidden">
            <P className="aspect-[3/4] w-full rounded-none" />
            <div className="p-3 space-y-2">
              <P className="h-3 w-20 rounded" />
              <P className="h-3 w-32 rounded" />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

// ─── 22. Integrations ────────────────────────────────────────────

export function IntegrationsSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <HeaderSkeleton />
        <P className="h-3 w-64 mt-1 rounded" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200/80 p-5 relative overflow-hidden">
            <ShimmerOverlay />
            <div className="flex items-center gap-3 mb-3">
              <P className="h-10 w-10 rounded-xl" />
              <div className="flex-1">
                <P className="h-4 w-28 rounded" />
                <P className="h-3 w-40 mt-1 rounded" />
              </div>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <P className="h-5 w-16 rounded-full" />
              <P className="h-3 w-20 rounded" />
            </div>
            <P className="h-8 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </motion.div>
  )
}
