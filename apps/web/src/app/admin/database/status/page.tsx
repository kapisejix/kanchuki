'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Database,
  Server,
  Activity,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  HardDrive,
  Shield,
  TrendingUp,
  Zap,
  Layers,
  Wifi,
  WifiOff,
  Archive,
  BarChart3,
  FileText,
} from 'lucide-react'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

// ─── Types ─────────────────────────────────────────────────────

type DatabaseStatusResponse = {
  data: {
    primary:
      | {
          server_version: string
          active_connections: number
          max_connections: number
          connection_usage_pct: number
          database_size: string
          cache_hit_ratio: number
          uptime_seconds: number
          transactions: {
            committed: number
            rolled_back: number
            total: number
          }
          deadlocks: number
          temp_files: number
          temp_bytes: string
          healthy: boolean
        }
      | { error: string }
    replica: {
      connected: boolean
      lag_bytes: number | null
      lag_seconds: number | null
      error: string | null
    } | null
    backup: {
      latest_key: string | null
      latest_age_hours: number | null
      total_count: number
      total_size_formatted: string
    } | null
    vault: {
      connected: boolean
      record_count: number
      db_size: string | null
    }
    guardrails: {
      active: boolean
    }
  }
}

// ─── Helpers ───────────────────────────────────────────────────

function getAdminHeaders() {
  const key = sessionStorage.getItem('admin_key')
  return { 'x-admin-key': key ?? '', 'Content-Type': 'application/json' }
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  parts.push(`${mins}m`)
  return parts.join(' ')
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString('en-IN')
}

function formatAgeHours(hours: number | null): string {
  if (hours === null) return 'Unknown'
  if (hours < 1) return `${Math.round(hours * 60)}m ago`
  if (hours < 24) return `${hours.toFixed(1)}h ago`
  return `${(hours / 24).toFixed(1)}d ago`
}

function formatLag(seconds: number | null): string {
  if (seconds === null) return 'N/A'
  if (seconds < 0.001) return '<1ms'
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`
  return `${seconds.toFixed(1)}s`
}

// ─── Animations ────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 200, damping: 20 },
  },
}

// ─── Status Badge ──────────────────────────────────────────────

function StatusBadge({ healthy }: { healthy: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
        healthy
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-red-100 text-red-700'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          healthy ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
        }`}
      />
      {healthy ? 'Healthy' : 'Unhealthy'}
    </span>
  )
}

// ─── Main Page ─────────────────────────────────────────────────

export default function DatabaseStatusPage() {
  const [status, setStatus] = useState<DatabaseStatusResponse['data'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  // ── Fetch status ──────────────────────────────────────────────
  const fetchStatus = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError('')

    try {
      const res = await fetch(`${API_URL}/v1/admin/database/status`, {
        headers: getAdminHeaders(),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)

      const json = (await res.json()) as DatabaseStatusResponse
      setStatus(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load database status')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* ── Page Header ────────────────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Activity size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Database Health</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Primary stats, replica lag, backup status &amp; guardrail monitoring
              </p>
            </div>
          </div>
          <motion.button
            onClick={() => fetchStatus(true)}
            disabled={refreshing}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </motion.button>
        </div>
      </motion.div>

      {/* ── Error ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3"
          >
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Loading State ───────────────────────────────────────── */}
      {loading && (
        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white/80 rounded-2xl border border-gray-200/80 p-6">
              <div className="h-5 bg-gray-200/80 rounded w-1/3 mb-4 animate-pulse" />
              <div className="space-y-3">
                <div className="h-3 bg-gray-200/80 rounded w-full animate-pulse" />
                <div className="h-3 bg-gray-200/80 rounded w-3/4 animate-pulse" />
                <div className="h-3 bg-gray-200/80 rounded w-1/2 animate-pulse" />
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {/* ── Primary DB Card ──────────────────────────────────────── */}
      {!loading && status && (
        <motion.div variants={itemVariants}>
          <DbCard
            title="Primary Database"
            icon={Server}
            gradient="from-blue-500/10 to-transparent"
            iconColor="text-blue-500"
            borderAccent="border-blue-100"
          >
            {'error' in status.primary ? (
              <div className="flex items-start gap-2 text-sm text-red-600">
                <XCircle size={16} className="mt-0.5 shrink-0" />
                <span>Failed to query primary DB: {status.primary.error}</span>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Status row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StatusBadge healthy={status.primary.healthy} />
                    <span className="text-xs text-gray-400 font-mono">
                      v{status.primary.server_version}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Clock size={12} />
                    <span>Uptime: {formatUptime(status.primary.uptime_seconds)}</span>
                  </div>
                </div>

                {/* Metric tiles */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <MetricTile
                    icon={Database}
                    label="DB Size"
                    value={status.primary.database_size}
                    color="blue"
                  />
                  <MetricTile
                    icon={Activity}
                    label="Connections"
                    value={`${status.primary.active_connections}/${status.primary.max_connections}`}
                    subtext={`${status.primary.connection_usage_pct}% used`}
                    color={status.primary.connection_usage_pct > 70 ? 'amber' : 'blue'}
                  />
                  <MetricTile
                    icon={Zap}
                    label="Cache Hit Ratio"
                    value={`${status.primary.cache_hit_ratio.toFixed(2)}%`}
                    color={status.primary.cache_hit_ratio > 95 ? 'emerald' : 'amber'}
                  />
                  <MetricTile
                    icon={BarChart3}
                    label="Transactions"
                    value={formatNumber(status.primary.transactions.total)}
                    subtext={`${formatNumber(status.primary.transactions.committed)} commit · ${formatNumber(status.primary.transactions.rolled_back)} rollback`}
                    color="blue"
                  />
                </div>

                {/* Detail row */}
                <div className="flex flex-wrap gap-4 text-[11px] text-gray-500 pt-2 border-t border-gray-100">
                  <span className="flex items-center gap-1">
                    <AlertCircle size={11} />
                    Deadlocks: {formatNumber(status.primary.deadlocks)}
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText size={11} />
                    Temp files: {formatNumber(status.primary.temp_files)}
                  </span>
                  <span className="flex items-center gap-1">
                    <HardDrive size={11} />
                    Temp bytes: {status.primary.temp_bytes}
                  </span>
                </div>
              </div>
            )}
          </DbCard>
        </motion.div>
      )}

      {/* ── Replica & Backup Grid ───────────────────────────────── */}
      {!loading && status && (
        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Replica */}
          <DbCard
            title="Read Replica"
            icon={Layers}
            gradient="from-violet-500/10 to-transparent"
            iconColor="text-violet-500"
            borderAccent="border-violet-100"
          >
            {status.replica?.error ? (
              <div className="flex items-start gap-2 text-sm text-amber-600">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>Replica error: {status.replica.error}</span>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {status.replica?.connected ? (
                      <>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                          <Wifi size={10} />
                          Streaming
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500">
                          <WifiOff size={10} />
                          Not Configured
                        </span>
                      </>
                    )}
                  </div>
                  {status.replica?.lag_seconds !== null && (
                    <span className="text-xs text-gray-400">
                      Replication lag: {formatLag(status.replica!.lag_seconds)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  {status.replica?.connected
                    ? 'Read replica is streaming and up to date.'
                    : 'No read replica is configured. The query console runs against the primary database as a fallback.'}
                </p>
              </div>
            )}
          </DbCard>

          {/* Backup Info */}
          <DbCard
            title="Backup Status"
            icon={HardDrive}
            gradient="from-emerald-500/10 to-transparent"
            iconColor="text-emerald-500"
            borderAccent="border-emerald-100"
          >
            {status.backup === null ? (
              <div className="flex items-start gap-2 text-sm text-amber-600">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>
                  Backup status unavailable. R2 storage not configured — set
                  {' '}<code className="text-[10px] font-mono">CLOUDFLARE_R2_*</code> env vars to enable backup monitoring.
                </span>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {status.backup.latest_key ? (
                      <StatusBadge
                        healthy={(status.backup.latest_age_hours ?? Infinity) < 48}
                      />
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">
                        No Backups
                      </span>
                    )}
                  </div>
                  {status.backup.latest_key && (
                    <span className="text-xs text-gray-400">
                      Latest: {formatAgeHours(status.backup.latest_age_hours)}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <MetricTile
                    icon={HardDrive}
                    label="Total Backups"
                    value={String(status.backup.total_count)}
                    color="emerald"
                  />
                  <MetricTile
                    icon={Database}
                    label="Total Size"
                    value={status.backup.total_size_formatted}
                    color="emerald"
                  />
                </div>

                {status.backup.latest_key && (
                  <div className="text-[10px] text-gray-400 font-mono truncate pt-2 border-t border-gray-100">
                    Latest: {status.backup.latest_key}
                  </div>
                )}
              </div>
            )}
          </DbCard>
        </motion.div>
      )}

      {/* ── Vault & Guardrails Grid ──────────────────────────────── */}
      {!loading && status && (
        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Deletion Vault */}
          <DbCard
            title="Deletion Vault (F-016)"
            icon={Archive}
            gradient="from-amber-500/10 to-transparent"
            iconColor="text-amber-500"
            borderAccent="border-amber-100"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {status.vault.connected ? (
                    <StatusBadge healthy={true} />
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500">
                      <WifiOff size={10} />
                      Not Configured
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <MetricTile
                  icon={Archive}
                  label="Vault Records"
                  value={formatNumber(status.vault.record_count)}
                  color="amber"
                />
                <MetricTile
                  icon={Shield}
                  label="INSERT-Only"
                  value={status.vault.connected ? '✅ Enforced' : '—'}
                  color="gray"
                />
              </div>

              <p className="text-[11px] text-gray-400 pt-2 border-t border-gray-100">
                {status.vault.connected
                  ? `Vault DB is connected with ${status.vault.record_count} soft-delete records stored.`
                  : 'Vault DB is not configured. Set VAULT_DATABASE_URL to enable deletion vault.'}
              </p>
            </div>
          </DbCard>

          {/* DB Guardrails */}
          <DbCard
            title="DB Guardrails (F-017)"
            icon={Shield}
            gradient="from-red-500/10 to-transparent"
            iconColor="text-red-500"
            borderAccent="border-red-100"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {status.guardrails.active ? (
                    <StatusBadge healthy={true} />
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">
                      <AlertCircle size={10} />
                      Migration Pending
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2.5">
                <GuardrailRow
                  label="BEFORE DELETE triggers"
                  active={status.guardrails.active}
                  description="Blocks hard deletes on business tables"
                />
                <GuardrailRow
                  label="CI grep guard"
                  active={true}
                  description="scripts/check-delete-guard.sh blocks raw .delete() calls"
                />
                <GuardrailRow
                  label="Role separation"
                  active={false}
                  description="kanchuki_app role (no DELETE) — needs superuser SQL setup"
                />
                <GuardrailRow
                  label="Purge cron"
                  active={false}
                  description="Daily soft-delete purge with session flag — needs deployment"
                />
              </div>

              <p className="text-[11px] text-gray-400 pt-2 border-t border-gray-100">
                {status.guardrails.active
                  ? 'Guardrail triggers are active on business tables.'
                  : 'Run migration 037_db_guardrails to activate the BEFORE DELETE triggers.'}
              </p>
            </div>
          </DbCard>
        </motion.div>
      )}

      {/* ── Empty state ──────────────────────────────────────────── */}
      {!loading && !status && !error && (
        <motion.div variants={itemVariants} className="text-center py-16">
          <Activity size={48} className="mx-auto text-gray-200 mb-4" />
          <p className="text-sm text-gray-500">Unable to load database status</p>
          <motion.button
            onClick={() => fetchStatus()}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-blue-500 to-cyan-600 rounded-xl shadow-lg shadow-blue-500/20"
          >
            <RefreshCw size={14} />
            Retry
          </motion.button>
        </motion.div>
      )}

      {/* ── Last refreshed ───────────────────────────────────────── */}
      <motion.div variants={itemVariants} className="text-center">
        <p className="text-[10px] text-gray-400">
          All queries are read-only. Audit logged via SECURITY §18.
        </p>
      </motion.div>
    </motion.div>
  )
}

// ─── DbCard ────────────────────────────────────────────────────

function DbCard({
  title,
  icon: Icon,
  gradient,
  iconColor,
  borderAccent,
  children,
}: {
  title: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  gradient: string
  iconColor: string
  borderAccent: string
  children: React.ReactNode
}) {
  return (
    <motion.div
      variants={itemVariants}
      className={`relative bg-white/80 backdrop-blur-sm rounded-2xl border ${borderAccent} border-opacity-50 p-6 overflow-hidden shadow-sm hover:shadow-md transition-shadow`}
    >
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${gradient} opacity-60`} />
      <div className="flex items-center gap-2 mb-4">
        <Icon size={18} className={iconColor} />
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
      </div>
      {children}
    </motion.div>
  )
}

// ─── MetricTile ────────────────────────────────────────────────

function MetricTile({
  icon: Icon,
  label,
  value,
  subtext,
  color,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: string
  subtext?: string
  color: 'blue' | 'emerald' | 'amber' | 'gray'
}) {
  const colorMap = {
    blue: 'text-blue-500 bg-blue-50',
    emerald: 'text-emerald-500 bg-emerald-50',
    amber: 'text-amber-500 bg-amber-50',
    gray: 'text-gray-400 bg-gray-50',
  }

  const iconBg = colorMap[color]

  return (
    <div className="bg-gray-50/80 rounded-xl p-3.5 border border-gray-100/60">
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`p-1 rounded-lg ${iconBg} bg-opacity-50`}>
          <Icon size={12} className={iconBg.split(' ')[0]} />
        </div>
        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="text-base font-bold text-gray-900">{value}</div>
      {subtext && (
        <div className="text-[10px] text-gray-400 mt-0.5 truncate">{subtext}</div>
      )}
    </div>
  )
}

// ─── GuardrailRow ──────────────────────────────────────────────

function GuardrailRow({
  label,
  active,
  description,
}: {
  label: string
  active: boolean
  description: string
}) {
  return (
    <div className="flex items-start gap-2.5">
      {active ? (
        <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 shrink-0" />
      ) : (
        <XCircle size={14} className="text-gray-300 mt-0.5 shrink-0" />
      )}
      <div className="min-w-0">
        <div className="text-xs font-medium text-gray-700">{label}</div>
        <div className="text-[10px] text-gray-400">{description}</div>
      </div>
    </div>
  )
}
