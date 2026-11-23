'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sheet } from '@/components/Sheet'
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
  type LucideIcon,
} from 'lucide-react'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type TeamRole = 'SUPER_ADMIN' | 'ADMIN' | 'MARKETING_MANAGER' | 'MARKETING_AGENT' | 'SUPPORT_MANAGER' | 'SUPPORT_AGENT'

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
  phone: string | null
  role: TeamRole
  is_active: boolean
  max_retailers: number | null
  territories: { id: string; name: string; level: string }[]
  retailer_count: number
  over_capacity: boolean
}

const ROLE_LABELS: Record<TeamRole, string> = {
  SUPER_ADMIN: 'Super Admin (Full Access)',
  ADMIN: 'Admin (Standard Access + Plan Changes)',
  MARKETING_MANAGER: 'Marketing Manager (Standard Access)',
  MARKETING_AGENT: 'Sales / Field Surveyor (Survey Only)',
  SUPPORT_MANAGER: 'Support Manager (Support & Tickets)',
  SUPPORT_AGENT: 'Support Agent (Tickets Only)',
}

const ROLE_DESCRIPTIONS: Record<TeamRole, string> = {
  SUPER_ADMIN: 'Full unrestricted access to all admin tools, Settings, API keys/Integrations, Billing/Payments, and Operations.',
  ADMIN: 'Everything a Marketing Manager has, plus change a retailer\'s plan and extend trials (audit-logged). Plus manage per-retailer limit overrides. Excludes API keys, Payments, Team, Reports, Settings, and Operations.',
  MARKETING_MANAGER: 'Admin dashboard access (Retailers, Customers, Catalog, Social). Cannot change plans or trials. Excludes API keys, Payments, Settings, Team, Reports, and Operations.',
  MARKETING_AGENT: 'Field staff access for the /survey field survey and mobile staff tools only. Has NO access to the Admin dashboard.',
  SUPPORT_MANAGER: 'Access to manage support tickets, customer inquiries, and retailer support issues.',
  SUPPORT_AGENT: 'Access to resolve assigned support tickets only. Has NO access to Admin Settings or Operations.',
}

const ROLE_COLORS: Record<TeamRole, string> = {
  SUPER_ADMIN: 'bg-purple-100 text-purple-700 border-purple-200',
  ADMIN: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  MARKETING_MANAGER: 'bg-blue-100 text-blue-700 border-blue-200',
  MARKETING_AGENT: 'bg-ink-100 text-ink-700 border-ink-200',
  SUPPORT_MANAGER: 'bg-amber-100 text-amber-700 border-amber-200',
  SUPPORT_AGENT: 'bg-green-100 text-green-700 border-green-200',
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
  onSaved: (created?: { email: string; password: string }) => void
  editMember: TeamMember | null
  territories: Territory[]
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
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
      setPhone(editMember.phone ?? '')
      setRole(editMember.role)
      setMaxRetailers(String(editMember.max_retailers ?? ''))
      setSelectedTerritories(editMember.territories.map((t) => t.id))
    } else {
      setName('')
      setEmail('')
      setPhone('')
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
      let generated: string | undefined
      if (editMember) {
        const res = await fetch(`${API_URL}/v1/team/members/${editMember.id}`, {
          ...(await adminMutateOptions()),
          method: 'PATCH',
          body: JSON.stringify({
            territory_ids: selectedTerritories,
            ...(maxRetailers ? { max_retailers: Number(maxRetailers) } : { max_retailers: null }),
            ...(phone.trim() ? { phone: phone.trim() } : { phone: null }),
          }),
        })
        if (!res.ok) {
          const json = await res.json()
          throw new Error(json?.error?.message ?? 'Update failed')
        }
      } else {
        const res = await fetch(`${API_URL}/v1/team/members`, {
          ...(await adminMutateOptions()),
          method: 'POST',
          body: JSON.stringify({
            name,
            email,
            role,
            max_retailers: Number(maxRetailers) || undefined,
            territory_ids: selectedTerritories,
            ...(phone.trim() ? { phone: phone.trim() } : {}),
          }),
        })
        if (!res.ok) {
          const json = await res.json()
          throw new Error(json?.error?.message ?? 'Create failed')
        }
        const created = (await res.json().catch(() => null)) as {
          data?: { generated_password?: string }
        } | null
        generated = created?.data?.generated_password
      }
      onSaved(generated ? { email, password: generated } : undefined)
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
        // The panel used to be a second `fixed` sibling of the scrim, which no
        // overlay padding can reach — it is the scrim's flex child now, so the
        // keyboard inset moves it like every other sheet. Losing `inset-4`
        // costs nothing on a phone (a `p-4` gutter with `max-h-full` is the
        // same box) and `sm:pt-10` keeps the desktop top alignment.
        <Sheet
          open
          onClose={onClose}
          overlayClassName="z-50 flex items-start justify-center p-4 bg-black/50 sm:pt-10"
          panelClassName="w-full max-w-lg max-h-full sm:max-h-[85vh] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-y-auto"
          overlayAnimation={{ initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }}
          panelAnimation={{
            initial: { opacity: 0, scale: 0.95, y: 20 },
            animate: { opacity: 1, scale: 1, y: 0 },
            exit: { opacity: 0, scale: 0.95, y: 20 },
            transition: { type: 'spring', stiffness: 300, damping: 30 },
          }}
          ariaLabel={editMember ? 'Edit Team Member' : 'Add Team Member'}
        >
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-2.5">
                <div className="bg-ink-600 w-9 h-9 rounded-xl flex items-center justify-center">
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
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ink-500/40 focus:border-ink-400 transition"
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
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ink-500/40 focus:border-ink-400 transition"
                      />
                    </div>
                  </div>

                  <div className="bg-ink-50 border border-ink-200/70 rounded-xl p-3.5 flex items-start gap-2.5">
                    <Sparkles size={16} className="text-ink-600 mt-0.5 shrink-0" />
                    <div className="text-xs text-ink-900 leading-relaxed">
                      <span className="font-semibold text-ink-900">Automated Credentials &amp; OTP:</span> A secure temporary password and login instructions will be sent automatically to this email. The member can also log in directly using mobile OTP.
                    </div>
                  </div>
                </>
              )}

              {/* Phone — enables phone-OTP login into the mobile staff
                  screens. Optional; email+password stays the primary
                  credential. Show in both create and edit. */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                  Phone{' '}
                  <span className="text-gray-400 font-normal">(for OTP login to mobile staff screens)</span>
                </label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="10-digit mobile number"
                  inputMode="tel"
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ink-500/40 focus:border-ink-400 transition"
                />
              </div>

              {/* Role */}
              {!editMember && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Access Level / Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as TeamRole)}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ink-500/40 focus:border-ink-400 transition"
                  >
                    {Object.entries(ROLE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                  <div className="mt-2 p-2.5 bg-gray-50 border border-gray-200/80 rounded-xl text-xs text-gray-600 flex items-start gap-2">
                    <Shield size={14} className="text-ink-600 mt-0.5 shrink-0" />
                    <span>{ROLE_DESCRIPTIONS[role]}</span>
                  </div>
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
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ink-500/40 focus:border-ink-400 transition"
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
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-200/80 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-ink-600 hover:bg-ink-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition shadow-lg disabled:opacity-60 flex items-center gap-2"
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
        </Sheet>
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
  // Shown once after create or reset; never stored.
  const [revealed, setRevealed] = useState<{ email: string; password: string; emailed?: boolean } | null>(null)
  const [copied, setCopied] = useState(false)
  const [resettingId, setResettingId] = useState<string | null>(null)
  const [resetError, setResetError] = useState('')
  // Reset is Super Admin only (API 403s otherwise). Fail closed until the role is known.
  const [canReset, setCanReset] = useState(false)
  useEffect(() => {
    try {
      setCanReset(sessionStorage.getItem('admin_role') === 'SUPER_ADMIN')
    } catch {
      setCanReset(false)
    }
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [m, t] = await Promise.all([
        fetch(`${API_URL}/v1/team/members`, adminGetOptions()).then((r) => r.json()),
        fetch(`${API_URL}/v1/team/territories`, adminGetOptions()).then((r) => r.json()),
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

  const handleSaved = (created?: { email: string; password: string }) => {
    loadData()
    if (created) {
      setCopied(false)
      setRevealed(created)
    }
  }

  const resetPassword = async (member: TeamMember) => {
    if (!confirm(`Generate a new password for ${member.email} and email it to them? Their current password stops working.`)) return
    setResetError('')
    setResettingId(member.id)
    try {
      const res = await fetch(`${API_URL}/v1/team/members/${member.id}/reset-password`, {
        ...(await adminMutateOptions()),
        method: 'POST',
        body: JSON.stringify({}),
      })
      const json = (await res.json().catch(() => null)) as {
        error?: { message?: string }
        data?: { generated_password?: string; email_sent?: boolean }
      } | null
      if (!res.ok || !json?.data?.generated_password) {
        throw new Error(json?.error?.message ?? 'Could not reset the password')
      }
      setCopied(false)
      setRevealed({
        email: member.email,
        password: json.data.generated_password,
        emailed: json.data.email_sent === true,
      })
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Could not reset the password')
    } finally {
      setResettingId(null)
    }
  }

  const copyPassword = async () => {
    if (!revealed) return
    try {
      await navigator.clipboard.writeText(revealed.password)
      setCopied(true)
    } catch {
      // clipboard blocked: the password stays selectable on screen
    }
  }

  const toggleActive = async (member: TeamMember) => {
    try {
      await fetch(`${API_URL}/v1/team/members/${member.id}`, {
        ...(await adminMutateOptions()),
        method: 'PATCH',
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

  const selectClass = "border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ink-500/40 focus:border-ink-400 transition"

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
          </div>
          <p className="text-sm text-gray-500">Manage field agents, managers, and support staff</p>
        </div>
        <motion.button
          onClick={handleAdd}
          whileTap={{ scale: 0.98 }}
          className="bg-ink-600 hover:bg-ink-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition shadow-lg flex items-center gap-2"
        >
          <UserPlus size={16} />
          Add Member
        </motion.button>
      </div>

      {/* Stats cards */}
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatsCard icon={Users} label="Total" value={stats.total} />
        <StatsCard icon={Check} label="Active" value={stats.active} />
        <StatsCard icon={UserCog} label="Managers" value={stats.managers} />
        <StatsCard icon={Shield} label="Agents" value={stats.agents} />
        <StatsCard
          icon={AlertCircle}
          label="Over Capacity"
          value={stats.overCapacity}
          pulse={stats.overCapacity > 0}
        />
      </motion.div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px] group">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-ink-500 transition-colors" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ink-500/40 focus:border-ink-400 transition"
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
      <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500">Member</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500">Role</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500">Territories</th>
                <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500">Retailers</th>
                <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500">Capacity</th>
                <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500">Status</th>
                <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-500">Actions</th>
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
                      <p className="text-xs mt-1 text-gray-400">Click {'"'}Add Member{'"'} to create the first one</p>
                    </motion.div>
                  </td>
                </tr>
              ) : (
                filtered.map((m) => (
                  <motion.tr
                    key={m.id}
                    variants={rowVariants}
                    className="border-b border-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                          m.role === 'SUPER_ADMIN' ? 'bg-purple-100 text-purple-700' :
                          m.role.includes('MANAGER') ? 'bg-blue-100 text-blue-700' :
                          'bg-ink-100 text-ink-700'
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
                        className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition cursor-pointer ${
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
                          whileTap={{ scale: 0.95 }}
                          className="p-1.5 text-gray-400 hover:text-ink-600 hover:bg-ink-50 rounded-lg transition"
                          title="Edit member"
                        >
                          <UserCog size={15} />
                        </motion.button>
                        {canReset && (
                          <motion.button
                            onClick={() => resetPassword(m)}
                            disabled={resettingId === m.id}
                            whileTap={{ scale: 0.95 }}
                            className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition disabled:opacity-40"
                            title="Generate new password"
                            aria-label={`Generate new password for ${m.email}`}
                          >
                            {resettingId === m.id ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
                          </motion.button>
                        )}
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

      {resetError && (
        <div role="alert" className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{resetError}</span>
        </div>
      )}

      {/* One-time password reveal (after create without a typed password, or after reset) */}
      <AnimatePresence>
        {revealed && (
          <Sheet
            open
            onClose={() => setRevealed(null)}
            overlayClassName="z-50 flex items-start justify-center p-4 bg-black/50 sm:pt-10"
            panelClassName="w-full max-w-md max-h-full bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-y-auto"
            overlayAnimation={{ initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }}
            panelAnimation={{
              initial: { opacity: 0, scale: 0.95, y: 20 },
              animate: { opacity: 1, scale: 1, y: 0 },
              exit: { opacity: 0, scale: 0.95, y: 20 },
              transition: { type: 'spring', stiffness: 300, damping: 30 },
            }}
            ariaLabel="Generated password"
          >
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="bg-amber-600 w-9 h-9 rounded-xl flex items-center justify-center">
                  <KeyRound size={18} className="text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900">Password generated</h2>
                  <p className="text-xs text-gray-600">{revealed.email}</p>
                </div>
              </div>
              <code className="block select-all break-all rounded-lg bg-gray-100 px-3 py-2.5 font-mono text-sm text-gray-900">
                {revealed.password}
              </code>
              {revealed.emailed !== undefined && (
                <p className={`text-xs font-medium ${revealed.emailed ? 'text-green-700' : 'text-red-700'}`}>
                  {revealed.emailed
                    ? `Also emailed to ${revealed.email}.`
                    : `Email was NOT sent (no email provider configured or it failed). Share this password yourself.`}
                </p>
              )}
              <p className="text-xs text-gray-600">
                Shown once. Copy it and share it with the member now; it cannot be shown again, only replaced with a new one.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={copyPassword}
                  className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50"
                >
                  {copied ? 'Copied' : 'Copy password'}
                </button>
                <button
                  onClick={() => setRevealed(null)}
                  className="bg-ink-600 px-4 py-2 text-xs font-semibold text-white rounded-xl"
                >
                  Done
                </button>
              </div>
            </div>
          </Sheet>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Sub-components ─────────────────────────────────────────────

function StatsCard({
  icon: Icon,
  label,
  value,
  pulse,
}: {
  icon: LucideIcon
  label: string
  value: number
  pulse?: boolean
}) {
  return (
    <motion.div
      variants={rowVariants}
      className="relative bg-white rounded-xl border border-gray-200/80 p-4 transition hover:shadow-md overflow-hidden"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={14} className={`${pulse ? 'text-red-500 animate-pulse' : 'text-gray-400'}`} />
        <span className="text-[10px] font-semibold text-gray-500 uppercase">{label}</span>
      </div>
      <div className={`text-xl font-bold ${pulse ? 'text-red-600' : 'text-gray-900'}`}>
        {value}
      </div>
    </motion.div>
  )
}
