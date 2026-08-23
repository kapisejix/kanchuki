'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bug,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Eye,
  Ban,
  Store,
  Phone,
  MapPin,
  Smartphone,
  Monitor,
  AppWindow,
  MessageSquare,
  Image as ImageIcon,
  ChevronRight,
  Loader2,
  X,
  Save,
  RefreshCw,
  Shield,
  type LucideIcon,
} from 'lucide-react'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type BugReportSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
type BugReportStatus = 'NEW' | 'REVIEWED' | 'IN_PROGRESS' | 'RESOLVED' | 'DISMISSED'

type BugReport = {
  id: string
  retailer_id: string
  description: string
  severity: BugReportSeverity
  status: BugReportStatus
  app_version: string | null
  os_version: string | null
  device_model: string | null
  screen_name: string | null
  last_screen: string | null
  error_message: string | null
  screenshot_url: string | null
  notes: string | null
  admin_note: string | null
  resolved_by_id: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  retailer: { id: string; shop_name: string; city: string; phone: string }
}

type BugReportStats = {
  new: number
  reviewed: number
  in_progress: number
  resolved: number
  dismissed: number
  total: number
}

const STATUS_LABELS: Record<BugReportStatus, string> = {
  NEW: 'New',
  REVIEWED: 'Reviewed',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  DISMISSED: 'Dismissed',
}

const STATUS_COLORS: Record<BugReportStatus, string> = {
  NEW: 'bg-red-100 text-red-700 border-red-200',
  REVIEWED: 'bg-blue-100 text-blue-700 border-blue-200',
  IN_PROGRESS: 'bg-amber-100 text-amber-700 border-amber-200',
  RESOLVED: 'bg-green-100 text-green-700 border-green-200',
  DISMISSED: 'bg-gray-100 text-gray-500 border-gray-200',
}

const SEVERITY_LABELS: Record<BugReportSeverity, string> = {
  LOW: 'Minor',
  MEDIUM: 'Moderate',
  HIGH: 'Major',
  CRITICAL: 'Critical',
}

const SEVERITY_COLORS: Record<BugReportSeverity, string> = {
  LOW: 'bg-green-100 text-green-700 border-green-200',
  MEDIUM: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  HIGH: 'bg-orange-100 text-orange-700 border-orange-200',
  CRITICAL: 'bg-red-100 text-red-700 border-red-200',
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.1 } },
}

const rowVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 200, damping: 25 } },
}

// ─── Detail Panel ─────────────────────────────────────────────────

function BugReportDetailPanel({
  report,
  onClose,
  onUpdated,
}: {
  report: BugReport
  onClose: () => void
  onUpdated: () => void
}) {
  const [status, setStatus] = useState(report.status)
  const [severity, setSeverity] = useState(report.severity)
  const [adminNote, setAdminNote] = useState(report.admin_note ?? '')
  const [saving, setSaving] = useState(false)
  const [showScreenshot, setShowScreenshot] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const body: Record<string, unknown> = {}
      if (status !== report.status) body.status = status
      if (severity !== report.severity) body.severity = severity
      if (adminNote !== (report.admin_note ?? '')) body.admin_note = adminNote

      if (Object.keys(body).length === 0) {
        onClose()
        return
      }

      await fetch(`${API_URL}/v1/admin/bug-reports/${report.id}`, {
        ...(await adminMutateOptions()),
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      onUpdated()
      onClose()
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  const statusOptions: BugReportStatus[] = ['NEW', 'REVIEWED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED']
  const severityOptions: BugReportSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

  return (
    <motion.div
      initial={{ opacity: 0, x: 300 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 300 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="bg-white border-l border-gray-200 w-full sm:w-[420px] overflow-y-auto shrink-0"
    >
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <Bug size={16} className="text-red-500" />
          <span className="text-sm font-bold text-gray-900">Bug Report</span>
        </div>
        <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all cursor-pointer">
          <X size={16} />
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* Retailer info */}
        <div className="bg-gray-50/80 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <Store size={14} className="text-gray-400" />
            <span className="text-sm font-semibold text-gray-900">{report.retailer.shop_name}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <MapPin size={12} />
            {report.retailer.city}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Phone size={12} />
            {report.retailer.phone}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Description</label>
          <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-3.5 leading-relaxed">
            {report.description}
          </p>
        </div>

        {/* Status */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Status</label>
          <div className="flex gap-1.5 flex-wrap">
            {statusOptions.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                  status === s
                    ? STATUS_COLORS[s]
                    : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'
                }`}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Severity */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Severity</label>
          <div className="flex gap-1.5 flex-wrap">
            {severityOptions.map((s) => (
              <button
                key={s}
                onClick={() => setSeverity(s)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                  severity === s
                    ? SEVERITY_COLORS[s]
                    : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'
                }`}
              >
                {SEVERITY_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Device Context */}
        <div className="bg-gray-50/80 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Device Context</p>
          <div className="grid grid-cols-2 gap-3">
            <ContextRow icon={AppWindow} label="App Version" value={report.app_version} />
            <ContextRow icon={Monitor} label="OS" value={report.os_version} />
            <ContextRow icon={Smartphone} label="Device" value={report.device_model} />
            <ContextRow icon={Eye} label="Screen" value={report.screen_name} />
          </div>
          {report.last_screen && (
            <div className="text-xs text-gray-400">
              Previous screen: {report.last_screen}
            </div>
          )}
        </div>

        {/* Error message */}
        {report.error_message && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Auto-captured Error</label>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3.5">
              <p className="text-xs text-red-700 font-mono leading-relaxed break-all">
                {report.error_message}
              </p>
            </div>
          </div>
        )}

        {/* Screenshot */}
        {report.screenshot_url && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Screenshot</label>
            <button
              onClick={() => setShowScreenshot(true)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl overflow-hidden hover:border-cyan-300 transition-all cursor-pointer"
            >
              <img
                src={report.screenshot_url}
                alt="Bug report screenshot"
                className="w-full h-48 object-cover"
              />
            </button>
          </div>
        )}

        {/* Retailer notes */}
        {report.notes && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Retailer Notes</label>
            <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3.5 italic">
              &ldquo;{report.notes}&rdquo;
            </p>
          </div>
        )}

        {/* Admin note */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Admin Response</label>
          <textarea
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            rows={3}
            placeholder="Add a note about this report..."
            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-400 transition-all resize-none"
          />
        </div>

        {/* Timestamps */}
        <div className="text-xs text-gray-400 space-y-1">
          <p>Created: {new Date(report.created_at).toLocaleString('en-IN')}</p>
          <p>Updated: {new Date(report.updated_at).toLocaleString('en-IN')}</p>
          {report.resolved_at && (
            <p>Resolved: {new Date(report.resolved_at).toLocaleString('en-IN')}</p>
          )}
        </div>
      </div>

      {/* Save button */}
      <div className="sticky bottom-0 bg-gray-50/80 border-t border-gray-100 px-5 py-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-cyan-500/25 disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
        >
          {saving ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save size={15} />
              Save Changes
            </>
          )}
        </button>
      </div>

      {/* Screenshot lightbox */}
      <AnimatePresence>
        {showScreenshot && report.screenshot_url && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-8"
            onClick={() => setShowScreenshot(false)}
          >
            <motion.img
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              src={report.screenshot_url}
              alt="Bug report screenshot"
              className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain"
            />
            <button className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all cursor-pointer">
              <X size={20} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function ContextRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string | null
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={12} className="text-gray-400 mt-0.5 shrink-0" />
      <div>
        <p className="text-[10px] text-gray-400">{label}</p>
        <p className="text-xs text-gray-700 font-medium">{value || '—'}</p>
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────

export default function BugReportsPage() {
  const [reports, setReports] = useState<BugReport[]>([])
  const [stats, setStats] = useState<BugReportStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedReport, setSelectedReport] = useState<BugReport | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [search, setSearch] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [r, s] = await Promise.all([
        fetch(`${API_URL}/v1/admin/bug-reports`, adminGetOptions()).then((r) => r.json()),
        fetch(`${API_URL}/v1/admin/bug-reports/stats`, adminGetOptions()).then((r) => r.json()),
      ])
      setReports(r.data ?? [])
      setStats(s.data ?? null)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filtered = reports.filter((r) => {
    if (search) {
      const q = search.toLowerCase()
      if (
        !r.retailer.shop_name.toLowerCase().includes(q) &&
        !r.retailer.city.toLowerCase().includes(q) &&
        !r.description.toLowerCase().includes(q)
      )
        return false
    }
    if (statusFilter && r.status !== statusFilter) return false
    if (severityFilter && r.severity !== severityFilter) return false
    return true
  })

  const selectClass = "border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-400 transition-all"

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">Bug Reports</h1>
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 5 }}
            >
              <Bug size={18} className="text-red-500" />
            </motion.div>
          </div>
          <p className="text-sm text-gray-500">Retailer-submitted issues and feature requests from the mobile app</p>
        </div>
        <motion.button
          onClick={loadData}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="p-2.5 text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-xl transition-all cursor-pointer"
          title="Refresh"
        >
          <RefreshCw size={18} />
        </motion.button>
      </div>

      {/* Stats cards */}
      {stats && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 sm:grid-cols-6 gap-3"
        >
          <StatsCard icon={AlertCircle} label="New" value={stats.new} color="red" />
          <StatsCard icon={Eye} label="Reviewed" value={stats.reviewed} color="blue" />
          <StatsCard icon={Clock} label="In Progress" value={stats.in_progress} color="amber" />
          <StatsCard icon={CheckCircle2} label="Resolved" value={stats.resolved} color="green" />
          <StatsCard icon={Ban} label="Dismissed" value={stats.dismissed} color="gray" />
          <StatsCard icon={Bug} label="Total" value={stats.total} color="cyan" />
        </motion.div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px] group">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-cyan-500 transition-colors" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by shop name, city, or description..."
            className="w-full pl-10 pr-4 py-2.5 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-400 transition-all"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={selectClass}
        >
          <option value="">All Status</option>
          <option value="NEW">New</option>
          <option value="REVIEWED">Reviewed</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="RESOLVED">Resolved</option>
          <option value="DISMISSED">Dismissed</option>
        </select>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className={selectClass}
        >
          <option value="">All Severity</option>
          <option value="LOW">Minor</option>
          <option value="MEDIUM">Moderate</option>
          <option value="HIGH">Major</option>
          <option value="CRITICAL">Critical</option>
        </select>
      </div>

      {/* Main area: table + detail panel */}
      <div className="flex gap-0 sm:gap-4">
        {/* Table */}
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden flex-1 min-w-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Retailer</th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                  <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Severity</th>
                  <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Screenshot</th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                  <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider" />
                </tr>
              </thead>
              <motion.tbody
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      {[...Array(6)].map((_, j) => (
                        <td key={j} className="px-4 py-4">
                          <div className="h-4 bg-gray-200/60 rounded animate-pulse" style={{ width: `${40 + Math.random() * 40}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center text-gray-400">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                      >
                        <Bug size={40} className="mx-auto mb-3 text-gray-300" />
                        <p className="text-sm font-medium">No bug reports found</p>
                        <p className="text-xs mt-1 text-gray-400">All clear — no retailer issues reported</p>
                      </motion.div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <motion.tr
                      key={r.id}
                      variants={rowVariants}
                      whileHover={{ backgroundColor: 'rgba(6,182,212,0.03)', transition: { duration: 0.2 } }}
                      onClick={() => setSelectedReport(r)}
                      className={`border-b border-gray-50 transition-colors cursor-pointer ${
                        selectedReport?.id === r.id ? 'bg-cyan-50/50' : ''
                      }`}
                    >
                      <td className="px-4 py-3.5">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">{r.retailer.shop_name}</p>
                          <p className="text-xs text-gray-400">{r.retailer.city}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="text-sm text-gray-600 truncate max-w-[280px]">{r.description}</p>
                        {r.error_message && (
                          <p className="text-[10px] text-red-500 font-mono truncate max-w-[280px] mt-0.5">
                            {r.error_message}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${SEVERITY_COLORS[r.severity]}`}>
                          {SEVERITY_LABELS[r.severity]}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_COLORS[r.status]}`}>
                          {STATUS_LABELS[r.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {r.screenshot_url ? (
                          <span className="inline-flex items-center gap-1 text-xs text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded-full">
                            <ImageIcon size={11} />
                            Yes
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(r.created_at).toLocaleDateString('en-IN', {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <ChevronRight size={16} className="text-gray-300" />
                      </td>
                    </motion.tr>
                  ))
                )}
              </motion.tbody>
            </table>
          </div>
        </div>

        {/* Detail panel */}
        <AnimatePresence>
          {selectedReport && (
            <BugReportDetailPanel
              report={selectedReport}
              onClose={() => setSelectedReport(null)}
              onUpdated={loadData}
            />
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// ── Stats Card ─────────────────────────────────────────────────

function StatsCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: LucideIcon
  label: string
  value: number
  color: 'red' | 'blue' | 'amber' | 'green' | 'gray' | 'cyan'
}) {
  const colorMap = {
    red: 'from-red-500/20 to-transparent',
    blue: 'from-blue-500/20 to-transparent',
    amber: 'from-amber-500/20 to-transparent',
    green: 'from-green-500/20 to-transparent',
    gray: 'from-gray-500/20 to-transparent',
    cyan: 'from-cyan-500/20 to-transparent',
  }

  return (
    <motion.div
      variants={rowVariants}
      whileHover={{ y: -2 }}
      className="relative bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200/80 p-4 transition-all hover:shadow-md overflow-hidden"
    >
      <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${colorMap[color]}`} />
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={14} className="text-gray-400" />
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">{label}</span>
      </div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
    </motion.div>
  )
}
