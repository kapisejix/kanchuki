'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Ticket,
  Search,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Phone,
  Store,
  UserCheck,
  Sparkles,
  ChevronRight,
  Loader2,
  X,
  Save,
  RefreshCw,
} from 'lucide-react'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type TicketStatus = 'OPEN' | 'ASSIGNED' | 'RESOLVED' | 'CLOSED'

type Ticket = {
  id: string
  retailer_id: string
  requires_visit: boolean
  region_scope_id: string | null
  assigned_to_id: string | null
  status: TicketStatus
  note: string | null
  created_at: string
  resolved_at: string | null
  assigned_to: { id: string; name: string } | null
  retailer: { id: string; shop_name: string; city: string; phone: string }
}

type TicketStats = {
  open: number
  assigned: number
  resolved: number
  closed: number
  total: number
  requires_visit: number
}

type TeamMember = {
  id: string
  name: string
  role: string
}

const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Open',
  ASSIGNED: 'Assigned',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
}

const STATUS_COLORS: Record<TicketStatus, string> = {
  OPEN: 'bg-amber-100 text-amber-700 border-amber-200',
  ASSIGNED: 'bg-blue-100 text-blue-700 border-blue-200',
  RESOLVED: 'bg-green-100 text-green-700 border-green-200',
  CLOSED: 'bg-gray-100 text-gray-500 border-gray-200',
}

function getHeaders() {
  const key = sessionStorage.getItem('admin_key')
  return { 'x-admin-key': key ?? '', 'Content-Type': 'application/json' }
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.1 } },
}

const rowVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 200, damping: 25 } },
}

// ─── Ticket Detail Panel ─────────────────────────────────────────

function TicketDetailPanel({
  ticket,
  supportMembers,
  onClose,
  onUpdated,
}: {
  ticket: Ticket
  supportMembers: TeamMember[]
  onClose: () => void
  onUpdated: () => void
}) {
  const [status, setStatus] = useState(ticket.status)
  const [assignedTo, setAssignedTo] = useState(ticket.assigned_to_id ?? '')
  const [note, setNote] = useState(ticket.note ?? '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const body: Record<string, unknown> = {}
      if (status !== ticket.status) body.status = status
      if (assignedTo !== (ticket.assigned_to_id ?? '')) body.assigned_to_id = assignedTo || null
      if (note !== (ticket.note ?? '')) body.note = note

      if (Object.keys(body).length === 0) {
        onClose()
        return
      }

      await fetch(`${API_URL}/v1/team/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: getHeaders(),
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

  const statusOptions: TicketStatus[] = ['OPEN', 'ASSIGNED', 'RESOLVED', 'CLOSED']

  return (
    <motion.div
      initial={{ opacity: 0, x: 300 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 300 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="bg-white border-l border-gray-200 w-full sm:w-96 overflow-y-auto shrink-0"
    >
      <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ticket size={16} className="text-cyan-500" />
          <span className="text-sm font-bold text-gray-900">Ticket Detail</span>
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
            <span className="text-sm font-semibold text-gray-900">{ticket.retailer.shop_name}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <MapPin size={12} />
            {ticket.retailer.city}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Phone size={12} />
            {ticket.retailer.phone}
          </div>
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

        {/* Assignment */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Assigned To</label>
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-400 transition-all"
          >
            <option value="">Unassigned (pool)</option>
            {supportMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.name} ({m.role.replace('_', ' ')})</option>
            ))}
          </select>
        </div>

        {/* Visit Required */}
        <div className="flex items-center gap-2.5 bg-amber-50/80 border border-amber-200 rounded-xl px-4 py-3">
          <MapPin size={14} className="text-amber-500 shrink-0" />
          <div>
            <p className="text-xs font-medium text-amber-700">
              {ticket.requires_visit ? 'Requires physical visit' : 'Backend-manageable'}
            </p>
            <p className="text-[10px] text-amber-600/70 mt-0.5">
              {ticket.requires_visit
                ? 'An agent needs to visit the retailer in person'
                : 'Can be resolved remotely via phone or WhatsApp'}
            </p>
          </div>
        </div>

        {/* Note */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Internal Note</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="Add a note about this ticket..."
            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-400 transition-all resize-none"
          />
        </div>

        {/* Timestamps */}
        <div className="text-xs text-gray-400 space-y-1">
          <p>Created: {new Date(ticket.created_at).toLocaleString('en-IN')}</p>
          {ticket.resolved_at && (
            <p>Resolved: {new Date(ticket.resolved_at).toLocaleString('en-IN')}</p>
          )}
        </div>
      </div>

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
    </motion.div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────

export default function SupportTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [stats, setStats] = useState<TicketStats | null>(null)
  const [supportMembers, setSupportMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [t, s, m] = await Promise.all([
        fetch(`${API_URL}/v1/team/tickets`, { headers: getHeaders() }).then((r) => r.json()),
        fetch(`${API_URL}/v1/team/tickets/stats`, { headers: getHeaders() }).then((r) => r.json()),
        fetch(`${API_URL}/v1/team/members`, { headers: getHeaders() }).then((r) => r.json()),
      ])
      setTickets(t.data ?? [])
      setStats(s.data ?? null)
      const all = (m.data ?? []) as TeamMember[]
      setSupportMembers(all.filter((mem) => mem.role.includes('SUPPORT') || mem.role === 'SUPER_ADMIN'))
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filtered = tickets.filter((t) => {
    if (search) {
      const q = search.toLowerCase()
      if (
        !t.retailer.shop_name.toLowerCase().includes(q) &&
        !t.retailer.city.toLowerCase().includes(q) &&
        !t.retailer.phone.includes(q)
      )
        return false
    }
    if (statusFilter && t.status !== statusFilter) return false
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
            <h1 className="text-2xl font-bold text-gray-900">Support Tickets</h1>
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 5 }}
            >
              <Sparkles size={18} className="text-cyan-500" />
            </motion.div>
          </div>
          <p className="text-sm text-gray-500">Manage retailer support requests and field agent tasks</p>
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
          <TicketStatsCard icon={AlertCircle} label="Open" value={stats.open} color="amber" />
          <TicketStatsCard icon={UserCheck} label="Assigned" value={stats.assigned} color="blue" />
          <TicketStatsCard icon={CheckCircle2} label="Resolved" value={stats.resolved} color="green" />
          <TicketStatsCard icon={X} label="Closed" value={stats.closed} color="gray" />
          <TicketStatsCard icon={Ticket} label="Total" value={stats.total} color="cyan" />
          <TicketStatsCard icon={MapPin} label="Visit Req." value={stats.requires_visit} color="purple" />
        </motion.div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px] group">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-cyan-500 transition-colors" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by shop name, city, or phone..."
            className="w-full pl-10 pr-4 py-2.5 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-400 transition-all"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={selectClass}
        >
          <option value="">All Status</option>
          <option value="OPEN">Open</option>
          <option value="ASSIGNED">Assigned</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
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
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Assigned To</th>
                  <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Visit</th>
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
                    <td colSpan={6} className="px-4 py-16 text-center text-gray-400">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                      >
                        <Ticket size={40} className="mx-auto mb-3 text-gray-300" />
                        <p className="text-sm font-medium">No tickets found</p>
                        <p className="text-xs mt-1 text-gray-400">All clear — no open support requests</p>
                      </motion.div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((t) => (
                    <motion.tr
                      key={t.id}
                      variants={rowVariants}
                      whileHover={{ backgroundColor: 'rgba(6,182,212,0.03)', transition: { duration: 0.2 } }}
                      onClick={() => setSelectedTicket(t)}
                      className={`border-b border-gray-50 transition-colors cursor-pointer ${
                        selectedTicket?.id === t.id ? 'bg-cyan-50/50' : ''
                      }`}
                    >
                      <td className="px-4 py-3.5">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">{t.retailer.shop_name}</p>
                          <p className="text-xs text-gray-400">{t.retailer.city}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_COLORS[t.status]}`}>
                          {STATUS_LABELS[t.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {t.assigned_to ? (
                          <div className="flex items-center gap-1.5">
                            <UserCheck size={13} className="text-blue-500" />
                            <span className="text-sm text-gray-700">{t.assigned_to.name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {t.requires_visit ? (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                            <MapPin size={11} />
                            Visit
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(t.created_at).toLocaleDateString('en-IN', {
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
        {selectedTicket && (
          <TicketDetailPanel
            ticket={selectedTicket}
            supportMembers={supportMembers}
            onClose={() => setSelectedTicket(null)}
            onUpdated={loadData}
          />
        )}
      </div>
    </motion.div>
  )
}

// ── Sub-components ─────────────────────────────────────────────

function TicketStatsCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: number
  color: 'amber' | 'blue' | 'green' | 'gray' | 'cyan' | 'purple'
}) {
  const colorMap = {
    amber: 'from-amber-500/20 to-transparent',
    blue: 'from-blue-500/20 to-transparent',
    green: 'from-green-500/20 to-transparent',
    gray: 'from-gray-500/20 to-transparent',
    cyan: 'from-cyan-500/20 to-transparent',
    purple: 'from-purple-500/20 to-transparent',
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
