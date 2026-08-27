'use client'
import { formatPaiseShort } from '@kanchuki/shared'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Handshake,
  Users,
  TrendingUp,
  Clock,
  IndianRupee,
  CalendarDays,
  X,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react'
import { adminGetOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

// ─── Types ─────────────────────────────────────────────────────────

type Partner = {
  id: string
  name: string
  type: string
  contact_person: string | null
  phone: string | null
  email: string | null
  referral_code: string
  commission_rate: number
  commission_type: string
  is_active: boolean
  created_at: string
  retailer: { id: string; shop_name: string | null; phone: string }
  _count: { referrals: number; events: number }
}

type PartnerDetail = Partner & {
  referrals: {
    id: string
    commission_paise: number
    status: string
    created_at: string
    customer: { id: string; name: string | null; phone: string }
  }[]
  events: {
    id: string
    name: string
    starts_at: string
    is_virtual: boolean
  }[]
}

type PartnerStats = {
  total_partners: number
  active_partners: number
  total_referrals: number
  pending_referrals: number
  total_events: number
  total_commission_paise: number
}

// ─── Helpers ──────────────────────────────────────────────────────


const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

const TYPE_LABELS: Record<string, string> = {
  SALON: 'Salon',
  TAILOR: 'Tailor',
  STYLIST: 'Stylist',
  MAKEUP_ARTIST: 'Makeup Artist',
  OTHER: 'Other',
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 220, damping: 24 } },
}

// ─── Main Page ────────────────────────────────────────────────────

export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[] | null>(null)
  const [stats, setStats] = useState<PartnerStats | null>(null)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<PartnerDetail | null>(null)

  const load = async () => {
    try {
      const [partnersRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/v1/admin/partners`, adminGetOptions()),
        fetch(`${API_URL}/v1/admin/partners/stats`, adminGetOptions()),
      ])
      const partnersJson = await partnersRes.json()
      const statsJson = await statsRes.json()
      if (partnersJson?.data) setPartners(partnersJson.data)
      if (statsJson?.data) setStats(statsJson.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load partner data')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const viewDetail = async (partner: Partner) => {
    try {
      const res = await fetch(`${API_URL}/v1/admin/partners/${partner.id}`, adminGetOptions())
      const json = await res.json()
      if (json?.data) setDetail(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load partner details')
    }
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Partner Network</h1>
          <Handshake size={20} className="text-amber-500" />
        </div>
        <p className="text-sm text-gray-500 max-w-2xl">
          B2B partnerships with salons, tailors, stylists, and makeup artists.
          Track referral codes, commission payouts, and co-hosted events.
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

      {/* Stats cards */}
      {stats && (
        <motion.div variants={containerVariants} className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatsCard icon={Users} label="Total Partners" value={String(stats.total_partners)} color="amber" />
          <StatsCard icon={TrendingUp} label="Active" value={String(stats.active_partners)} color="green" />
          <StatsCard icon={ExternalLink} label="Referrals" value={String(stats.total_referrals)} color="blue" />
          <StatsCard icon={Clock} label="Pending" value={String(stats.pending_referrals)} color="purple" />
          <StatsCard icon={IndianRupee} label="Paid Out" value={formatPaiseShort(stats.total_commission_paise)} color="green" />
        </motion.div>
      )}

      {/* Partners table */}
      <motion.div
        variants={itemVariants}
        className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden"
      >
        {!partners ? (
          <div className="p-12 text-center text-sm text-gray-400 animate-pulse">Loading…</div>
        ) : partners.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-3">
              <Handshake size={22} className="text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-600">No partners yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Retailers add partners from their mobile app.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500">Partner</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Retailer</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Commission</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Referrals</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Events</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Details</th>
                </tr>
              </thead>
              <tbody>
                {partners.map((p, i) => (
                  <motion.tr
                    key={p.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="border-b border-gray-50 hover:bg-amber-50/40 transition-colors"
                  >
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                          <Handshake size={16} className="text-amber-500" />
                        </div>
                        <div>
                          <span className="font-semibold text-gray-900">{p.name}</span>
                          <p className="text-xs text-gray-400">{p.referral_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-gray-600 text-xs">
                      {p.retailer.shop_name ?? p.retailer.phone}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs font-medium text-gray-600 bg-gray-100 rounded-full px-2.5 py-1">
                        {TYPE_LABELS[p.type] ?? p.type}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-sm font-medium text-gray-700">
                      {p.commission_type === 'PERCENTAGE_OF_SALE'
                        ? `${p.commission_rate}%`
                        : formatPaiseShort(p.commission_rate)}
                    </td>
                    <td className="px-4 py-3.5 text-right text-gray-600 tabular-nums">
                      {p._count.referrals}
                    </td>
                    <td className="px-4 py-3.5 text-right text-gray-600 tabular-nums">
                      {p._count.events}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`text-[10px] font-semibold rounded-full px-2.5 py-1 border ${
                          p.is_active
                            ? 'bg-green-50 text-green-600 border-green-100'
                            : 'bg-gray-50 text-gray-400 border-gray-100'
                        }`}
                      >
                        {p.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <button
                        onClick={() => void viewDetail(p)}
                        className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                        aria-label={`View ${p.name}`}
                      >
                        <ExternalLink size={15} />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Detail modal */}
      <AnimatePresence>
        {detail && (
          <PartnerDetailModal partner={detail} onClose={() => setDetail(null)} />
        )}
      </AnimatePresence>
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
  color: 'amber' | 'green' | 'blue' | 'purple'
}) {
  const colorMap = {
    amber: { bg: 'bg-amber-50 border-amber-100', icon: 'text-amber-500' },
    green: { bg: 'bg-green-50 border-green-100', icon: 'text-green-500' },
    blue: { bg: 'bg-blue-50 border-blue-100', icon: 'text-blue-500' },
    purple: { bg: 'bg-purple-50 border-purple-100', icon: 'text-purple-500' },
  }
  const c = colorMap[color]
  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -2 }}
      className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200/80 p-5"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-9 h-9 rounded-xl ${c.bg} border flex items-center justify-center`}>
          <Icon size={17} className={c.icon} />
        </div>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
    </motion.div>
  )
}

// ── Partner detail modal ───────────────────────────────────────────

function PartnerDetailModal({
  partner,
  onClose,
}: {
  partner: PartnerDetail
  onClose: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center">
              <Handshake size={20} className="text-amber-500" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">{partner.name}</h3>
              <p className="text-xs text-gray-400">
                {TYPE_LABELS[partner.type] ?? partner.type} · {partner.referral_code}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <InfoRow label="Retailer" value={partner.retailer.shop_name ?? partner.retailer.phone} />
          <InfoRow label="Commission" value={partner.commission_type === 'PERCENTAGE_OF_SALE' ? `${partner.commission_rate}%` : formatPaiseShort(partner.commission_rate)} />
          <InfoRow label="Contact" value={partner.contact_person ?? '—'} />
          <InfoRow label="Phone" value={partner.phone ?? '—'} />
          <InfoRow label="Email" value={partner.email ?? '—'} />
          <InfoRow label="Created" value={fmtDate(partner.created_at)} />
        </div>

        {/* Referrals */}
        <div className="mb-5">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Recent Referrals ({partner._count.referrals})
          </h4>
          {partner.referrals.length === 0 ? (
            <p className="text-xs text-gray-400">No referrals yet.</p>
          ) : (
            <div className="space-y-2">
              {partner.referrals.map((r) => (
                <div key={r.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                  <div>
                    <p className="text-xs font-medium text-gray-700">{r.customer.name ?? r.customer.phone}</p>
                    <p className="text-[10px] text-gray-400">{fmtDate(r.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-gray-900">{formatPaiseShort(r.commission_paise)}</p>
                    <span
                      className={`text-[10px] font-medium ${
                        r.status === 'PAID' ? 'text-green-600' : r.status === 'PENDING' ? 'text-amber-600' : 'text-gray-400'
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Events */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Events ({partner._count.events})
          </h4>
          {partner.events.length === 0 ? (
            <p className="text-xs text-gray-400">No events yet.</p>
          ) : (
            <div className="space-y-2">
              {partner.events.map((e) => (
                <div key={e.id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                  <CalendarDays size={14} className="text-gray-400 shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-gray-700">{e.name}</p>
                    <p className="text-[10px] text-gray-400">{fmtDate(e.starts_at)} {e.is_virtual ? '(Virtual)' : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-xs font-medium text-gray-700 mt-0.5">{value}</p>
    </div>
  )
}
