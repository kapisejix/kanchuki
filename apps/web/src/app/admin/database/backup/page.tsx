'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Database,
  HardDrive,
  Download,
  Upload,
  RefreshCw,
  Clock,
  AlertCircle,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Terminal,
  Trash2,
  Server,
  ShieldCheck,
  ShieldAlert,
  Bell,
  Calendar,
} from 'lucide-react'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

// ─── Types ─────────────────────────────────────────────────────

type BackupEntry = {
  prefix: string
  key: string
  size: number
  size_formatted: string
  last_modified: string | null
  metadata: Record<string, unknown> | null
  has_metadata: boolean
}

type BackupSummary = {
  total_count: number
  total_size: number
  total_size_formatted: string
  latest_backup: {
    key: string
    size_formatted: string
    last_modified: string | null
    has_metadata: boolean
  } | null
}

type BackupListResponse = {
  data: {
    backups: BackupEntry[]
    summary: BackupSummary
    environment: {
      docker_available: boolean
      backup_command: string
      restore_command: string
    }
  }
}

type ActionResponse = {
  data: {
    status: string
    message: string
    commands: string[]
    cli_command: string
    audit_logged: boolean
  }
}

// ─── Helpers ───────────────────────────────────────────────────

/** CSRF token state — fetched once, reused for all POST requests */
let cachedCsrfToken: string | null = null
let csrfFetchPromise: Promise<string> | null = null

async function ensureCsrfToken(): Promise<string> {
  if (cachedCsrfToken) return cachedCsrfToken
  if (csrfFetchPromise) return csrfFetchPromise

  csrfFetchPromise = (async () => {
    const key = sessionStorage.getItem('admin_key')
    const res = await fetch(`${API_URL}/v1/admin/csrf-token`, {
      headers: { 'x-admin-key': key ?? '' },
    })
    if (!res.ok) throw new Error(`CSRF token fetch failed: HTTP ${res.status}`)
    const json = await res.json()
    const token = json.data.csrf_token as string
    cachedCsrfToken = token
    return token
  })()

  return csrfFetchPromise
}

function getAdminHeaders() {
  const key = sessionStorage.getItem('admin_key')
  return { 'x-admin-key': key ?? '', 'Content-Type': 'application/json' }
}

async function getCsrfHeaders(): Promise<Record<string, string>> {
  const csrf = await ensureCsrfToken()
  return {
    ...getAdminHeaders(),
    'Cookie': `csrf-token=${csrf}`,
    'x-csrf-token': csrf,
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateShort(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)

  if (diffHours < 1) {
    const mins = Math.round(diffMs / (1000 * 60))
    return `${mins}m ago`
  }
  if (diffHours < 24) {
    return `${Math.round(diffHours)}h ago`
  }
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
}

// ─── Container Variants ────────────────────────────────────────

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

// ─── Main Page ─────────────────────────────────────────────────

export default function DatabaseBackupPage() {
  const [backups, setBackups] = useState<BackupEntry[]>([])
  const [summary, setSummary] = useState<BackupSummary | null>(null)
  const [environment, setEnvironment] = useState<{ backup_command: string; restore_command: string; docker_available: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  // Trigger backup state
  const [triggering, setTriggering] = useState(false)
  const [triggerResult, setTriggerResult] = useState<ActionResponse['data'] | null>(null)

  // Restore state
  const [restoringKey, setRestoringKey] = useState<string | null>(null)
  const [restoreResult, setRestoreResult] = useState<string | null>(null)

  // Expanded rows
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  // ── Fetch backups ────────────────────────────────────────────
  const fetchBackups = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError('')
    setTriggerResult(null)
    setRestoreResult(null)

    try {
      const res = await fetch(`${API_URL}/v1/admin/backups`, {
        headers: getAdminHeaders(),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)

      const json = (await res.json()) as BackupListResponse
      setBackups(json.data.backups)
      setSummary(json.data.summary)
      setEnvironment(json.data.environment)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load backups')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchBackups()
  }, [fetchBackups])

  // ── CSRF state ────────────────────────────────────────────────
  const [csrfReady, setCsrfReady] = useState(false)

  // Ensure CSRF token is fetched on mount
  useEffect(() => {
    ensureCsrfToken().then(() => setCsrfReady(true)).catch(() => setCsrfReady(false))
  }, [])

  // ── Trigger backup ───────────────────────────────────────────
  const handleTriggerBackup = async () => {
    setTriggering(true)
    setTriggerResult(null)
    setError('')

    try {
      const res = await fetch(`${API_URL}/v1/admin/backup/create`, {
        method: 'POST',
        headers: await getCsrfHeaders(),
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)

      const json = (await res.json()) as ActionResponse
      setTriggerResult(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger backup')
    } finally {
      setTriggering(false)
    }
  }

  // ── Trigger restore ──────────────────────────────────────────
  const handleRestore = async (key: string) => {
    if (!confirm(`Are you sure you want to restore from this backup?\n\n${key}\n\nThis will overwrite the target database.`)) return

    setRestoringKey(key)
    setRestoreResult(null)
    setError('')

    try {
      const res = await fetch(`${API_URL}/v1/admin/backups/restore`, {
        method: 'POST',
        headers: await getCsrfHeaders(),
        body: JSON.stringify({ key }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)

      const json = (await res.json()) as ActionResponse
      setRestoreResult(json.data.cli_command)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger restore')
    } finally {
      setRestoringKey(null)
    }
  }

  // ── Toggle metadata expansion ────────────────────────────────
  const toggleRow = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <HardDrive size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Database Backup & Restore</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                SECURITY §13 — Manage backups and disaster recovery
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <motion.button
              onClick={() => fetchBackups(true)}
              disabled={refreshing}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </motion.button>
            <motion.button
              onClick={handleTriggerBackup}
              disabled={triggering}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20"
            >
              {triggering ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Upload size={14} />
              )}
              {triggering ? 'Triggering...' : 'Trigger Backup'}
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* ── Summary Cards ───────────────────────────────────────── */}
      {summary && (
        <motion.div variants={containerVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <SummaryCard
            icon={Database}
            label="Total Backups"
            value={summary.total_count}
            color="emerald"
          />
          <SummaryCard
            icon={HardDrive}
            label="Total Size"
            value={summary.total_size_formatted}
            color="blue"
          />
          <SummaryCard
            icon={Clock}
            label="Latest Backup"
            value={summary.latest_backup ? formatDateShort(summary.latest_backup.last_modified) : 'None'}
            color="amber"
          />
          <SummaryCard
            icon={Server}
            label="Docker Available"
            value={environment?.docker_available === false ? 'No (CLI only)' : 'Unknown'}
            color="gray"
          />
        </motion.div>
      )}

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

      {/* ── Trigger Result ──────────────────────────────────────── */}
      <AnimatePresence>
        {triggerResult && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 size={20} className="text-emerald-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-emerald-800 mb-1">{triggerResult.message}</p>

                {/* CLI commands */}
                <div className="mt-3 space-y-1.5">
                  {triggerResult.commands.map((cmd, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <code className="flex-1 text-[11px] font-mono bg-emerald-100/80 text-emerald-700 px-3 py-1.5 rounded-lg overflow-x-auto whitespace-nowrap">
                        {cmd}
                      </code>
                      <motion.button
                        onClick={() => copyToClipboard(cmd.replace(/^#.*$/, '').trim())}
                        whileHover={{ scale: 1.05 }}
                        className="p-1.5 text-emerald-500 hover:text-emerald-600 shrink-0"
                        title="Copy command"
                      >
                        <Terminal size={14} />
                      </motion.button>
                    </div>
                  ))}
                </div>

                <p className="text-[11px] text-emerald-600 mt-2">
                  Audit logged · Run the CLI command on a machine with Docker installed
                </p>
              </div>
              <button
                onClick={() => setTriggerResult(null)}
                className="text-emerald-400 hover:text-emerald-600"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Restore Result ──────────────────────────────────────── */}
      <AnimatePresence>
        {restoreResult && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-amber-50 border border-amber-200 rounded-2xl p-5"
          >
            <div className="flex items-start gap-3">
              <AlertCircle size={20} className="text-amber-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-800 mb-1">Restore Request Logged</p>
                <p className="text-xs text-amber-600 mb-2">
                  Run this command on a machine with Docker to execute the restore:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-[11px] font-mono bg-amber-100/80 text-amber-700 px-3 py-1.5 rounded-lg overflow-x-auto whitespace-nowrap">
                    {restoreResult}
                  </code>
                  <motion.button
                    onClick={() => copyToClipboard(restoreResult)}
                    whileHover={{ scale: 1.05 }}
                    className="p-1.5 text-amber-500 hover:text-amber-600 shrink-0"
                    title="Copy command"
                  >
                    <Terminal size={14} />
                  </motion.button>
                </div>
                <p className="text-[11px] text-amber-600 mt-2">
                  ⚠️ This will overwrite the target database. Ensure you have a current backup before restoring.
                </p>
              </div>
              <button
                onClick={() => setRestoreResult(null)}
                className="text-amber-400 hover:text-amber-600"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Loading State ───────────────────────────────────────── */}
      {loading && (
        <motion.div variants={itemVariants} className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white/80 rounded-xl border border-gray-200/80 p-5">
              <div className="h-4 bg-gray-200/80 rounded w-3/4 mb-3 animate-pulse" />
              <div className="h-3 bg-gray-200/80 rounded w-1/2 animate-pulse" />
            </div>
          ))}
        </motion.div>
      )}

      {/* ── Backup List ─────────────────────────────────────────── */}
      {!loading && backups.length === 0 && !error && (
        <motion.div variants={itemVariants} className="text-center py-16">
          <HardDrive size={48} className="mx-auto text-gray-200 mb-4" />
          <p className="text-sm text-gray-500">No backups found</p>
          <p className="text-xs text-gray-400 mt-1">
            Backups are stored in Cloudflare R2 under the <code className="text-gray-500 font-mono">backups/</code> prefix.
            Run <code className="text-gray-500 font-mono">pnpm db:backup</code> from a machine with Docker to create the first backup.
          </p>
          <motion.button
            onClick={handleTriggerBackup}
            disabled={triggering}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 rounded-xl transition-all shadow-lg shadow-emerald-500/20"
          >
            <Upload size={14} />
            Trigger Backup
          </motion.button>
        </motion.div>
      )}

      {/* ── Backup Table ────────────────────────────────────────── */}
      {!loading && backups.length > 0 && (
        <motion.div variants={itemVariants} className="space-y-4">
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden shadow-lg">
            {/* Table header */}
            <div className="flex items-center gap-4 px-5 py-3 bg-gray-50/80 border-b border-gray-200/80 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              <div className="flex-1 min-w-0">Backup</div>
              <div className="w-20 text-right shrink-0">Size</div>
              <div className="w-28 text-right shrink-0 hidden sm:block">Age</div>
              <div className="w-20 text-center shrink-0">Meta</div>
              <div className="w-28 text-right shrink-0 hidden md:block">Actions</div>
            </div>

            {/* Table body */}
            {backups.map((backup) => (
              <div key={backup.key}>
                <div
                  className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-100/60 hover:bg-gray-50/50 transition-colors cursor-pointer last:border-b-0"
                  onClick={() => toggleRow(backup.key)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Database size={14} className="text-emerald-500 shrink-0" />
                      <span className="text-xs font-medium text-gray-700 truncate">
                        {backup.key.split('/').pop()?.replace('.sql.gz', '') ?? backup.key}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-400 font-mono truncate mt-0.5 ml-6">
                      {backup.key}
                    </div>
                  </div>
                  <div className="w-20 text-right shrink-0">
                    <span className="text-xs font-mono text-gray-500">{backup.size_formatted}</span>
                  </div>
                  <div className="w-28 text-right shrink-0 hidden sm:block">
                    <span className="text-xs text-gray-400">{formatDateShort(backup.last_modified)}</span>
                  </div>
                  <div className="w-20 text-center shrink-0">
                    {backup.has_metadata ? (
                      <CheckCircle2 size={14} className="inline text-emerald-400" />
                    ) : (
                      <XCircle size={14} className="inline text-gray-300" />
                    )}
                  </div>
                  <div className="w-28 text-right shrink-0 hidden md:flex items-center justify-end gap-1">
                    <motion.button
                      onClick={(e) => { e.stopPropagation(); handleRestore(backup.key) }}
                      disabled={restoringKey === backup.key}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.98 }}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-all disabled:opacity-40"
                      title="Restore from this backup"
                    >
                      {restoringKey === backup.key ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <Download size={11} />
                      )}
                      Restore
                    </motion.button>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleRow(backup.key) }}
                      className="p-1 text-gray-300 hover:text-gray-500"
                    >
                      {expandedRows.has(backup.key) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                {/* Expanded metadata */}
                {expandedRows.has(backup.key) && (
                  <div className="bg-gray-50/80 border-b border-gray-100/60 px-5 py-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                      <div>
                        <span className="text-gray-400 block mb-0.5">Key</span>
                        <code className="text-gray-700 font-mono text-[10px] break-all">{backup.key}</code>
                      </div>
                      <div>
                        <span className="text-gray-400 block mb-0.5">Size</span>
                        <span className="text-gray-700">{backup.size_formatted} ({backup.size.toLocaleString()} bytes)</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block mb-0.5">Last Modified</span>
                        <span className="text-gray-700">{formatDate(backup.last_modified)}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block mb-0.5">Metadata File</span>
                        <span className={backup.has_metadata ? 'text-emerald-600' : 'text-gray-400'}>
                          {backup.has_metadata ? 'Available' : 'Not found'}
                        </span>
                      </div>
                      <div className="sm:col-span-2 lg:col-span-2">
                        <span className="text-gray-400 block mb-0.5">Prefix</span>
                        <code className="text-gray-700 font-mono text-[10px] break-all">{backup.prefix}</code>
                      </div>
                    </div>

                    {/* Metadata JSON */}
                    {backup.metadata && (
                      <div className="mt-3">
                        <span className="text-[10px] text-gray-400 block mb-1">Metadata</span>
                        <pre className="bg-white rounded-lg border border-gray-200 p-3 text-[10px] text-gray-600 font-mono overflow-x-auto max-h-40 whitespace-pre-wrap">
                          {JSON.stringify(backup.metadata, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Mobile actions */}
                    <div className="mt-3 flex items-center gap-2 md:hidden">
                      <motion.button
                        onClick={() => handleRestore(backup.key)}
                        disabled={restoringKey === backup.key}
                        whileHover={{ scale: 1.02 }}
                        className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-all disabled:opacity-40"
                      >
                        <Download size={11} />
                        Restore
                      </motion.button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer stats */}
          <div className="flex items-center justify-between text-[10px] text-gray-400 px-1">
            <span>
              {backups.length} backup{backups.length !== 1 ? 's' : ''} · {summary?.total_size_formatted ?? '?'} total
            </span>
            <span>
              Last refreshed: {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </motion.div>
      )}

      {/* ── Environment Info ─────────────────────────────────────── */}
      {environment && (
        <motion.div variants={itemVariants}>
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200/80 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Terminal size={14} className="text-gray-400" />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                CLI Commands (for Docker-enabled machines)
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[11px] font-mono bg-gray-100 text-gray-700 px-3 py-2 rounded-lg overflow-x-auto whitespace-nowrap">
                  {environment.backup_command}
                </code>
                <motion.button
                  onClick={() => copyToClipboard(environment.backup_command)}
                  whileHover={{ scale: 1.05 }}
                  className="p-1.5 text-gray-400 hover:text-gray-600 shrink-0"
                  title="Copy backup command"
                >
                  <Terminal size={13} />
                </motion.button>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[11px] font-mono bg-gray-100 text-gray-700 px-3 py-2 rounded-lg overflow-x-auto whitespace-nowrap">
                  {environment.restore_command}
                </code>
                <motion.button
                  onClick={() => copyToClipboard(environment.restore_command)}
                  whileHover={{ scale: 1.05 }}
                  className="p-1.5 text-gray-400 hover:text-gray-600 shrink-0"
                  title="Copy restore command"
                >
                  <Terminal size={13} />
                </motion.button>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-3 flex items-center gap-1">
              <AlertCircle size={10} />
              Docker is required for pg_dump/pg_restore. The API server cannot execute backups directly —
              run these commands from a machine with Docker and the same R2 credentials.
            </p>
          </div>
        </motion.div>
      )}

      {/* ── Security Notice ─────────────────────────────────────── */}
      <motion.div variants={itemVariants} className="text-center">
        <p className="text-[10px] text-gray-400 flex items-center justify-center gap-1">
          <AlertCircle size={10} />
          All backup and restore operations are logged to the audit trail (SECURITY §13, §18)
        </p>
      </motion.div>
    </motion.div>
  )
}

// ─── Summary Card ──────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: string | number
  color: 'emerald' | 'blue' | 'amber' | 'gray'
}) {
  const colorMap = {
    emerald: 'from-emerald-500/10 to-transparent border-emerald-100',
    blue: 'from-blue-500/10 to-transparent border-blue-100',
    amber: 'from-amber-500/10 to-transparent border-amber-100',
    gray: 'from-gray-500/10 to-transparent border-gray-100',
  }

  const iconColorMap = {
    emerald: 'text-emerald-500',
    blue: 'text-blue-500',
    amber: 'text-amber-500',
    gray: 'text-gray-400',
  }

  return (
    <motion.div
      variants={itemVariants}
      className="relative bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200/80 p-4 overflow-hidden"
    >
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${colorMap[color]} opacity-50`} />
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className={iconColorMap[color]} />
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-base font-bold text-gray-900">
        {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
      </div>
    </motion.div>
  )
}
