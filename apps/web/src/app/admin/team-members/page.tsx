'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users,
  Search,
  Shield,
  UserPlus,
  MapPin,
  Mail,
  KeyRound,
  X,
  Save,
  Loader2,
  Check,
  AlertCircle,
  UserCog,
  Sparkles,
  ChevronRight,
} from 'lucide-react'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type TeamRole = 'SUPER_ADMIN' | 'MARKETING_MANAGER' | 'MARKETING_AGENT' | 'SUPPORT_MANAGER' | 'SUPPORT_AGENT'

type Territory = {
  id: string
  name: string
  level: 'STATE' | 'CITY' | 'ZONE'
  parent_id: string | null
  pincodes: string[]
}

type TeamMember = {
  id: string
  name: string
  email: string
  role: TeamRole
  is_active: boolean
  max_retailers: number | null
  territories: { id: string; name: string; level: string }[]
  retailer_count: number
  over_capacity: boolean
}

const ROLE_LABELS: Record<TeamRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  MARKETING_MANAGER: 'Marketing Manager',
  MARKETING_AGENT: 'Marketing Agent',
  SUPPORT_MANAGER: 'Support Manager',
  SUPPORT_AGENT: 'Support Agent',
}

const ROLE_COLORS: Record<TeamRole, string> = {
  SUPER_ADMIN: 'bg-purple-100 text-purple-700 border-purple-200',
  MARKETING_MANAGER: 'bg-blue-100 text-blue-700 border-blue-200',
  MARKETING_AGENT: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  SUPPORT_MANAGER: 'bg-amber-100 text-amber-700 border-amber-200',
  SUPPORT_AGENT: 'bg-green-100 text-green-700 border-green-200',
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

// ─── Create/Edit Modal ───────────────────────────────────────────

function MemberModal({
  open,
  onClose,
  onSaved,
  editMember,
  territories,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editMember: TeamMember | null
  territories: Territory[]
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<TeamRole>('MARKETING_AGENT')
  const [maxRetailers, setMaxRetailers] = useState('100')
  const [selectedTerritories, setSelectedTerritories] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    if (editMember) {
      setName(editMember.name)
      setEmail(editMember.email)
      setPassword('')
      setRole(editMember.role)
      setMaxRetailers(String(editMember.max_retailers ?? ''))
      setSelectedTerritories(editMember.territories.map((t) => t.id))
    } else {
      setName('')
      setEmail('')
      setPassword('')
      setRole('MARKETING_AGENT')
      setMaxRetailers('100')
      setSelectedTerritories([])
    }
    setError('')
  }, [open, editMember])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      if (editMember) {
        const res = await fetch(`${API_URL}/v1/team/members/${editMember.id}`, {
          method: 'PATCH',
          headers: getHeaders(),
          body: JSON.stringify({
            territory_ids: selectedTerritories,
            ...(maxRetailers ? { max_retailers: Number(maxRetailers) } : { max_retailers: null }),
          }),
        })
        if (!res.ok) {
          const json = await res.json()
          throw new Error(json?.error?.message ?? 'Update failed')
        }
      } else {
        const res = await fetch(`${API_URL}/v1/team/members`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            name,
            email,
            password,
            role,
            max_retailers: Number(maxRetailers) || undefined,
            territory_ids: selectedTerritories,
          }),
        })
        if (!res.ok) {
          const json = await res.json()
          throw new Error(json?.error?.message ?? 'Create failed')
        }
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed')
    } finally {
      setSaving(false)
    }
  }

  const toggleTerritory = (id: string) => {
    setSelectedTerritories((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    )
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-4 sm:inset-auto sm:top-10 sm:left-1/2 sm:-translate-x-1/2 sm:max-w-lg sm:w-full sm:max-h-[85vh] bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 overflow-y-auto"
          >
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
                  {editMember ? <UserCog size={18} className="text-white" /> : <UserPlus size={18} className="text-white" />}
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900">{editMember ? 'Edit Member' : 'Add Team Member'}</h2>
                  <p className="text-xs text-gray-500">{editMember ? 'Update role, territories, or limits' : 'Create a new team member'}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Name */}
              {!editMember && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">Full Name</label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Rahul Sharma"
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-400 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="rahul@kanchuki.app"
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-400 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">Password</label>
                    <div className="relative">
                      <KeyRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min 8 characters"
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-400 transition-all"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Role */}
              {!editMember && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as TeamRole)}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-400 transition-all"
                  >
                    {Object.entries(ROLE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Max Retailers */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Max Retailers (capacity)</label>
                <input
                  type="number"
                  value={maxRetailers}
                  onChange={(e) => setMaxRetailers(e.target.value)}
                  placeholder="Unlimited"
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-400 transition-all"
                />
              </div>

              {/* Territory Assignment */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                  Assigned Territories
                  <span className="text-gray-400 font-normal ml-1">({selectedTerritories.length} selected)</span>
                </label>
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-50">
                  {territories.length === 0 ? (
                    <div className="px-4 py-6 text-center text-gray-400 text-sm">
                      <MapPin size={20} className="mx-auto mb-2 text-gray-300" />
                      <p>No territories created yet</p>
                      <p className="text-xs mt-1">Create territories first to assign members</p>
                    </div>
                  ) : (
                    territories.map((t) => (
                      <label
                        key={t.id}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedTerritories.includes(t.id)}
                          onChange={() => toggleTerritory(t.id)}
                          className="rounded border-gray-300"
                        />
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <MapPin size={14} className="shrink-0 text-gray-400" />
                          <span className="text-sm text-gray-700 truncate">{t.name}</span>
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{t.level}</span>
                          {t.pincodes.length > 0 && (
                            <span className="text-[10px] text-gray-400">{t.pincodes.length} pincodes</span>
                          )}
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-gray-50/80 border-t border-gray-100 px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-200/80 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-cyan-500/25 disabled:opacity-60 flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={15} />
                    {editMember ? 'Update Member' : 'Add Member'}
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ─── Main Page ───────────────────────────────────────────────────

export default function TeamMembersPage() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [territories, setTerritories] = useState<Territory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editMember, setEditMember] = useState<TeamMember | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [m, t] = await Promise.all([
        fetch(`${API_URL}/v1/team/members`, { headers: getHeaders() }).then((r) => r.json()),
        fetch(`${API_URL}/v1/team/territories`, { headers: getHeaders() }).then((r) => r.json()),
      ])
      setMembers(m.data ?? [])
      setTerritories(t.data ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleEdit = (member: TeamMember) => {
    setEditMember(member)
    setModalOpen(true)
  }

  const handleAdd = () => {
    setEditMember(null)
    setModalOpen(true)
  }

  const handleSaved = () => {
    loadData()
  }

  const toggleActive = async (member: TeamMember) => {
    try {
      await fetch(`${API_URL}/v1/team/members/${member.id}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ is_active: !member.is_active }),
      })
      loadData()
    } catch {
      // ignore
    }
  }

  const filtered = members.filter((m) => {
    if (search) {
      const q = search.toLowerCase()
      if (
        !m.name.toLowerCase().includes(q) &&
        !m.email.toLowerCase().includes(q)
      )
        return false
    }
    if (roleFilter && m.role !== roleFilter) return false
    return true
  })

  const stats = {
    total: members.length,
    active: members.filter((m) => m.is_active).length,
    managers: members.filter((m) => m.role.includes('MANAGER')).length,
    agents: members.filter((m) => m.role.includes('AGENT')).length,
    overCapacity: members.filter((m) => m.over_capacity).length,
  }

  const selectClass = "border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-400 transition-all"

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">Team Members</h1>
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 5 }}
            >
              <Sparkles size={18} className="text-cyan-500" />
            </motion.div>
          </div>
          <p className="text-sm text-gray-500">Manage field agents, managers, and support staff</p>
        </div>
        <motion.button
          onClick={handleAdd}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-cyan-500/25 flex items-center gap-2"
        >
          <UserPlus size={16} />
          Add Member
        </motion.button>
      </div>

      {/* Stats cards */}
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatsCard icon={Users} label="Total" value={stats.total} color="blue" />
        <StatsCard icon={Check} label="Active" value={stats.active} color="green" />
        <StatsCard icon={UserCog} label="Managers" value={stats.managers} color="amber" />
        <StatsCard icon={Shield} label="Agents" value={stats.agents} color="cyan" />
        <StatsCard
          icon={AlertCircle}
          label="Over Capacity"
          value={stats.overCapacity}
          color="red"
          pulse={stats.overCapacity > 0}
        />
      </motion.div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px] group">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-cyan-500 transition-colors" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-10 pr-4 py-2.5 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-400 transition-all"
          />
        </div>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={selectClass}>
          <option value="">All Roles</option>
          {Object.entries(ROLE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Member</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Territories</th>
                <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Retailers</th>
                <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Capacity</th>
                <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
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
                    {[...Array(7)].map((_, j) => (
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
                      <Users size={40} className="mx-auto mb-3 text-gray-300" />
                      <p className="text-sm font-medium">No team members found</p>
                      <p className="text-xs mt-1 text-gray-400">Click "Add Member" to create the first one</p>
                    </motion.div>
                  </td>
                </tr>
              ) : (
                filtered.map((m) => (
                  <motion.tr
                    key={m.id}
                    variants={rowVariants}
                    whileHover={{ backgroundColor: 'rgba(6,182,212,0.03)', transition: { duration: 0.2 } }}
                    className="border-b border-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                          m.role === 'SUPER_ADMIN' ? 'bg-purple-100 text-purple-700' :
                          m.role.includes('MANAGER') ? 'bg-blue-100 text-blue-700' :
                          'bg-cyan-100 text-cyan-700'
                        }`}>
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">{m.name}</p>
                          <p className="text-xs text-gray-400 truncate">{m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${ROLE_COLORS[m.role]}`}>
                        {ROLE_LABELS[m.role]}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {m.territories.length === 0 ? (
                          <span className="text-xs text-gray-400 italic">None</span>
                        ) : (
                          m.territories.slice(0, 2).map((t) => (
                            <span
                              key={t.id}
                              className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded-full"
                            >
                              <MapPin size={10} />
                              {t.name}
                            </span>
                          ))
                        )}
                        {m.territories.length > 2 && (
                          <span className="text-[10px] text-gray-400">+{m.territories.length - 2} more</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="font-medium text-gray-900">{m.retailer_count}</span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {m.max_retailers ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min((m.retailer_count / m.max_retailers) * 100, 100)}%` }}
                              transition={{ duration: 1, ease: 'easeOut' }}
                              className={`h-full rounded-full ${
                                m.over_capacity ? 'bg-red-500' : m.retailer_count / m.max_retailers > 0.8 ? 'bg-amber-500' : 'bg-green-500'
                              }`}
                            />
                          </div>
                          <span className={`text-xs ${m.over_capacity ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                            {m.retailer_count}/{m.max_retailers}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">∞</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <button
                        onClick={() => toggleActive(m)}
                        className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-all cursor-pointer ${
                          m.is_active
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-500'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${m.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                        {m.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <motion.button
                          onClick={() => handleEdit(m)}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="p-1.5 text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-all"
                          title="Edit member"
                        >
                          <UserCog size={15} />
                        </motion.button>
                        <ChevronRight size={16} className="text-gray-300" />
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </motion.tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      <MemberModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        editMember={editMember}
        territories={territories}
      />
    </motion.div>
  )
}

// ── Sub-components ─────────────────────────────────────────────

function StatsCard({
  icon: Icon,
  label,
  value,
  color,
  pulse,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: number
  color: 'blue' | 'green' | 'amber' | 'cyan' | 'red'
  pulse?: boolean
}) {
  const colorMap = {
    blue: 'from-blue-500/20 to-transparent',
    green: 'from-green-500/20 to-transparent',
    amber: 'from-amber-500/20 to-transparent',
    cyan: 'from-cyan-500/20 to-transparent',
    red: 'from-red-500/20 to-transparent',
    purple: 'from-purple-500/20 to-transparent',
    gray: 'from-gray-500/20 to-transparent',
  }

  return (
    <motion.div
      variants={rowVariants}
      whileHover={{ y: -2 }}
      className="relative bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200/80 p-4 transition-all hover:shadow-md overflow-hidden"
    >
      <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${colorMap[color]}`} />
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={14} className={`${pulse ? 'text-red-500 animate-pulse' : 'text-gray-400'}`} />
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">{label}</span>
      </div>
      <div className={`text-xl font-bold ${pulse ? 'text-red-600' : 'text-gray-900'}`}>
        {value}
      </div>
    </motion.div>
  )
}
