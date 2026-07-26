'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Shield,
  Clock,
  GitBranch,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Activity,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import Link from 'next/link'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type OperationCounts = {
  pending_count: number
  recent_activity: Array<{ id: string; action: string; time: string; type: string }>
  gate_status: {
    all_passed: boolean
    summary: string
    checked_at: string | null
  } | null
  deployment_totals: { total: number; last24h: number; failed24h: number }
}

function getHeaders() {
  const key = sessionStorage.getItem('admin_key')
  return { 'x-admin-key': key ?? '' }
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 200, damping: 20 } },
}

export default function OperationsPage() {
  const [counts, setCounts] = useState<OperationCounts | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const headers = getHeaders()

        // Fetch pending count, gate status, and deployment totals in parallel
        const [pendingRes, gateRes, deployRes] = await Promise.allSettled([
          fetch(`${API_URL}/v1/admin/operations/pending`, { headers }),
          fetch(`${API_URL}/v1/admin/deployment-gate/check`, { headers }),
          fetch(`${API_URL}/v1/admin/deployments?limit=50`, { headers }),
        ])

        const pendingData = pendingRes.status === 'fulfilled' ? await pendingRes.value.json() : { data: [] }
        const gateData = gateRes.status === 'fulfilled' ? await gateRes.value.json() : null
        const deployData = deployRes.status === 'fulfilled' ? await deployRes.value.json() : { data: [] }

        const ops = pendingData.data ?? []
        const deploys = deployData.data ?? []

        const last24h = deploys.filter((d: { created_at: string }) =>
          new Date(d.created_at).getTime() > Date.now() - 86400000
        )

        setCounts({
          pending_count: ops.length,
          recent_activity: ops.slice(0, 5).map((op: { id: string; type: string; description: string; requested_at: string }) => ({
            id: op.id,
            action: `PENDING_${op.type}`,
            time: op.requested_at,
            type: op.type,
          })),
          gate_status: gateData?.data
            ? {
                all_passed: gateData.data.all_passed,
                summary: gateData.data.summary,
                checked_at: gateData.data.checked_at,
              }
            : null,
          deployment_totals: {
            total: deploys.length,
            last24h: last24h.length,
            failed24h: last24h.filter((d: { status: string }) => d.status === 'failed').length,
          },
        })
      } catch {
        setError('Failed to load operations data')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-8">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Shield size={24} className="text-gray-700" />
            <h1 className="text-2xl font-bold text-gray-900">Operations Center</h1>
          </div>
          <p className="text-sm text-gray-500">Manage platform operations, deployments, and configuration</p>
        </div>
        {!loading && (
          <Link
            href="/admin/operations/deployments"
            className="text-xs text-cyan-600 hover:text-cyan-700 font-medium flex items-center gap-1"
          >
            View all deployments <ArrowRight size={12} />
          </Link>
        )}
      </motion.div>

      {/* Loading state */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white/80 rounded-2xl border border-gray-200/80 p-6 animate-pulse">
              <div className="h-12 bg-gray-200/60 rounded-xl mb-4" />
              <div className="h-4 bg-gray-200/60 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-200/60 rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <motion.div variants={itemVariants} className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl px-5 py-4">
          {error}
        </motion.div>
      )}

      {/* Operation cards with live counts */}
      <motion.div variants={containerVariants} className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <OperationCard
          title="Pending Approvals"
          description="Review and approve/reject pending operations"
          href="/admin/operations/pending"
          icon={Clock}
          color="from-amber-500 to-amber-600"
          count={counts?.pending_count ?? null}
          countLabel="pending"
          countColor="amber"
        />
        <OperationCard
          title="Deployment Log"
          description="View deployment history and gate status"
          href="/admin/operations/deployments"
          icon={GitBranch}
          color="from-blue-500 to-blue-600"
          count={counts?.deployment_totals.last24h ?? null}
          countLabel="last 24h"
          countColor="blue"
        />
        <OperationCard
          title="Deployment Gate"
          description="Check pre-deployment conditions and gate status"
          href="/admin/operations/gate"
          icon={Activity}
          color="from-emerald-500 to-emerald-600"
          count={counts?.gate_status ? (counts.gate_status.all_passed ? 0 : 1) : null}
          countLabel={counts?.gate_status?.all_passed ? 'all clear' : 'blocked'}
          countColor={counts?.gate_status?.all_passed ? 'green' : 'red'}
        />
      </motion.div>

      {/* Quick activity feed */}
      {counts && counts.recent_activity.length > 0 && (
        <motion.div variants={itemVariants} className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Activity size={16} className="text-gray-400" />
              Recent Activity
            </h2>
            <Link
              href="/admin/operations/pending"
              className="text-xs text-cyan-600 hover:text-cyan-700 font-medium"
            >
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {counts.recent_activity.map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-gray-50/50 transition-colors">
                <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 truncate">{item.action}</p>
                  <p className="text-[10px] text-gray-400">
                    {new Date(item.time).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <Link
                  href="/admin/operations/pending"
                  className="text-[10px] text-cyan-600 hover:text-cyan-700 font-medium shrink-0"
                >
                  Review
                </Link>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Gate status banner */}
      {counts?.gate_status && (
        <motion.div variants={itemVariants}>
          <Link
            href="/admin/operations/gate"
            className={`block rounded-2xl border p-5 transition-all hover:shadow-md ${
              counts.gate_status.all_passed
                ? 'bg-emerald-50/80 border-emerald-200'
                : 'bg-amber-50/80 border-amber-200'
            }`}
          >
            <div className="flex items-center gap-3">
              {counts.gate_status.all_passed ? (
                <CheckCircle2 size={22} className="text-emerald-500 shrink-0" />
              ) : (
                <AlertTriangle size={22} className="text-amber-500 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${counts.gate_status.all_passed ? 'text-emerald-800' : 'text-amber-800'}`}>
                  Deployment Gate: {counts.gate_status.all_passed ? 'All Clear' : 'Blocked'}
                </p>
                <p className={`text-xs mt-0.5 ${counts.gate_status.all_passed ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {counts.gate_status.summary}
                  {counts.gate_status.checked_at && (
                    <span className="ml-2 opacity-70">
                      · Checked {new Date(counts.gate_status.checked_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </p>
              </div>
              <ArrowRight size={16} className="text-gray-400 shrink-0" />
            </div>
          </Link>
        </motion.div>
      )}

      {/* Settings card bottom row */}
      <motion.div variants={itemVariants}>
        <Link
          href="/admin/settings"
          className="group block bg-gradient-to-r from-purple-500 to-purple-600 rounded-2xl p-6 text-white hover:shadow-xl transition-all relative overflow-hidden"
        >
          <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <div className="flex items-start justify-between mb-4 relative">
            <Shield size={28} className="text-white/70" />
            <ArrowRight size={18} className="text-white/40 group-hover:text-white group-hover:translate-x-1 transition-all" />
          </div>
          <h3 className="font-semibold text-lg mb-1 relative">Platform Settings</h3>
          <p className="text-sm text-white/70 relative">Configure rate limits, AI models, notifications, and other platform settings</p>
        </Link>
      </motion.div>
    </motion.div>
  )
}

// ── Operation Card ─────────────────────────────────────────────

function OperationCard({
  title,
  description,
  href,
  icon: Icon,
  color,
  count,
  countLabel,
  countColor,
}: {
  title: string
  description: string
  href: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  color: string
  count: number | null
  countLabel: string
  countColor: string
}) {
  const countBgColor = {
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-emerald-100 text-emerald-700',
    red: 'bg-red-100 text-red-700',
  }[countColor]

  return (
    <motion.div variants={itemVariants} whileHover={{ y: -4, scale: 1.01 }}>
      <Link
        href={href}
        className={`group block bg-gradient-to-r ${color} rounded-2xl p-6 text-white hover:shadow-xl transition-all relative overflow-hidden`}
      >
        <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        <div className="flex items-start justify-between mb-4 relative">
          <Icon size={28} className="text-white/70" />
          <div className="flex items-center gap-2">
            {count !== null && (
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${countBgColor}`}>
                {count}
              </span>
            )}
            <ArrowRight size={18} className="text-white/40 group-hover:text-white group-hover:translate-x-1 transition-all" />
          </div>
        </div>
        <h3 className="font-semibold text-lg mb-1 relative">{title}</h3>
        <p className="text-sm text-white/70 relative">{description}</p>
        {count !== null && (
          <p className="text-[10px] text-white/50 mt-2 relative">{count} {countLabel}</p>
        )}
      </Link>
    </motion.div>
  )
}
