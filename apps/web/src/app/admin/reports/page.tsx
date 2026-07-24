'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart3,
  Users,
  MapPin,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Store,
  UserCheck,
  RefreshCw,
  Activity,
} from 'lucide-react'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type AgentReport = {
  id: string
  name: string
  email: string
  role: string
  territories: { id: string; name: string; level: string }[]
  max_retailers: number | null
  retailer_count: number
  over_capacity: boolean
  activated: number
  trial: number
  active_subscription: number
  activation_rate: number
}

type CoverageGap = {
  id: string
  name: string
  city: string
  retailer_count: number
}

type ActivationReport = {
  total_retailers: number
  onboarding_completed: number
  trial: number
  active_subscription: number
  cancelled: number
  onboarding_rate: number
  trial_to_active_rate: number
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

// ─── Agent Row (static, no expand) ──────────────────────────────

function AgentRow({
  agent,
  index,
}: {
  agent: AgentReport & { rank: number }
  index: number
}) {
  return (
    <motion.tr
      variants={itemVariants}
      whileHover={{ backgroundColor: 'rgba(6,182,212,0.03)', transition: { duration: 0.2 } }}
      className="border-b border-gray-50 transition-colors"
    >
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className={`text-xs font-bold w-5 text-center ${
            index === 0 ? 'text-yellow-500' : index === 1 ? 'text-gray-400' : index === 2 ? 'text-amber-700' : 'text-gray-300'
          }`}>
            #{index + 1}
          </span>
          <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-xs">
            {agent.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{agent.name}</p>
            <p className="text-[10px] text-gray-400">{agent.role.replace('_', ' ')}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {agent.territories.slice(0, 2).map((t) => (
            <span key={t.id} className="text-xs text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded-full">
              {t.name}
            </span>
          ))}
          {agent.territories.length > 2 && (
            <span className="text-[10px] text-gray-400">+{agent.territories.length - 2}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3.5 text-center font-medium text-gray-900">{agent.retailer_count}</td>
      <td className="px-4 py-3.5 text-center">
        <div className="flex items-center justify-center gap-1.5">
          <div className="w-14 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(agent.activation_rate, 100)}%` }}
              transition={{ duration: 1, ease: 'easeOut', delay: index * 0.1 }}
              className={`h-full rounded-full ${
                agent.activation_rate >= 60 ? 'bg-green-500' :
                agent.activation_rate >= 30 ? 'bg-amber-500' : 'bg-red-500'
              }`}
            />
          </div>
          <span className={`text-xs font-medium ${
            agent.activation_rate >= 60 ? 'text-green-600' :
            agent.activation_rate >= 30 ? 'text-amber-600' : 'text-red-600'
          }`}>{agent.activation_rate}%</span>
        </div>
      </td>
      <td className="px-4 py-3.5 text-center">
        <span className="text-sm font-semibold text-green-600">{agent.active_subscription}</span>
      </td>
      <td className="px-4 py-3.5 text-center">
        {agent.max_retailers ? (
          <span className={`text-xs font-medium ${agent.over_capacity ? 'text-red-600' : 'text-gray-500'}`}>
            {agent.retailer_count}/{agent.max_retailers}
          </span>
        ) : (
          <span className="text-xs text-gray-400">∞</span>
        )}
      </td>
      <td className="px-4 py-3.5 text-right" />
    </motion.tr>
  )
}

// ─── Main Page ───────────────────────────────────────────────────

export default function ReportsPage() {
  const [agents, setAgents] = useState<AgentReport[]>([])
  const [gaps, setGaps] = useState<{ total_gaps: number; gaps: CoverageGap[] }>({ total_gaps: 0, gaps: [] })
  const [activation, setActivation] = useState<ActivationReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'agents' | 'gaps' | 'funnel'>('agents')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const headers = getHeaders()
      const [a, g, f] = await Promise.all([
        fetch(`${API_URL}/v1/team/reporting/agents`, { headers }).then((r) => r.json()),
        fetch(`${API_URL}/v1/team/reporting/coverage-gaps`, { headers }).then((r) => r.json()),
        fetch(`${API_URL}/v1/team/reporting/retailer-activation`, { headers }).then((r) => r.json()),
      ])
      setAgents(a.data ?? [])
      setGaps(g.data ?? { total_gaps: 0, gaps: [] })
      setActivation(f.data ?? null)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  // Sort agents by activation rate descending, with rank
  const sortedAgents = [...agents]
    .sort((a, b) => b.activation_rate - a.activation_rate)
    .map((agent, i) => ({ ...agent, rank: i + 1 }))

  const avgActivation = agents.length > 0
    ? Math.round(agents.reduce((sum, a) => sum + a.activation_rate, 0) / agents.length)
    : 0

  const totalRetailersManaged = agents.reduce((sum, a) => sum + a.retailer_count, 0)

  const tabClass = (tab: string) =>
    `px-4 py-2.5 text-sm font-semibold rounded-xl transition-all cursor-pointer ${
      activeTab === tab
        ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/25'
        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100/80'
    }`

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Loading reports...</p>
        </div>
      </div>
    )
  }

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
            <h1 className="text-2xl font-bold text-gray-900">Manager Reports</h1>
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 5 }}
            >
              <Sparkles size={18} className="text-cyan-500" />
            </motion.div>
          </div>
          <p className="text-sm text-gray-500">Agent performance, coverage gaps, and activation funnel</p>
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

      {/* Summary banner */}
      <motion.div variants={containerVariants} initial="hidden" animate="visible">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard icon={Users} label="Total Agents" value={agents.length} color="blue" />
          <SummaryCard icon={CheckCircle2} label="Avg Activation" value={`${avgActivation}%`} color="green" />
          <SummaryCard icon={Store} label="Retailers Managed" value={totalRetailersManaged} color="cyan" />
          <SummaryCard icon={MapPin} label="Coverage Gaps" value={gaps.total_gaps} color="amber" pulse={gaps.total_gaps > 0} />
        </div>
      </motion.div>

      {/* Tab navigation */}
      <div className="flex items-center gap-2 bg-white/60 backdrop-blur-sm border border-gray-200/80 rounded-xl p-1.5 w-fit">
        <button onClick={() => setActiveTab('agents')} className={tabClass('agents')}>
          <div className="flex items-center gap-2">
            <Users size={15} />
            Agent Performance
          </div>
        </button>
        <button onClick={() => setActiveTab('gaps')} className={tabClass('gaps')}>
          <div className="flex items-center gap-2">
            <MapPin size={15} />
            Coverage Gaps
          </div>
        </button>
        <button onClick={() => setActiveTab('funnel')} className={tabClass('funnel')}>
          <div className="flex items-center gap-2">
            <Activity size={15} />
            Activation Funnel
          </div>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'agents' && (
        <motion.div
          key="agents"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Agent</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Territories</th>
                    <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Retailers</th>
                    <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Activation Rate</th>
                    <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Active</th>
                    <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Capacity</th>
                    <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider" />
                  </tr>
                </thead>
                <motion.tbody variants={containerVariants} initial="hidden" animate="visible">
                  {sortedAgents.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-16 text-center text-gray-400">
                        <Users size={40} className="mx-auto mb-3 text-gray-300" />
                        <p className="text-sm font-medium">No agents found</p>
                        <p className="text-xs mt-1 text-gray-400">Create team members with agent roles to see performance data</p>
                      </td>
                    </tr>
                  ) : (
                    sortedAgents.map((agent, i) => (
                      <AgentRow key={agent.id} agent={agent} index={i} />
                    ))
                  )}
                </motion.tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}

      {activeTab === 'gaps' && (
        <motion.div
          key="gaps"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-4"
        >
          {gaps.gaps.length === 0 ? (
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-12 text-center"
            >
              <CheckCircle2 size={48} className="mx-auto mb-4 text-green-400" />
              <h3 className="text-lg font-bold text-gray-900 mb-1">No Coverage Gaps</h3>
              <p className="text-sm text-gray-500">All territories with retailers have at least one team member assigned</p>
            </motion.div>
          ) : (
            <>
              <div className="bg-amber-50/80 border border-amber-200 rounded-xl px-5 py-4 flex items-start gap-3">
                <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">
                    {gaps.total_gaps} territory gap{gaps.total_gaps !== 1 ? 's' : ''} detected
                  </p>
                  <p className="text-xs text-amber-700/70 mt-0.5">
                    These territories have retailers but no assigned team members. Assign agents to ensure coverage.
                  </p>
                </div>
              </div>

              <div className="grid gap-3">
                {gaps.gaps.map((gap, i) => (
                  <motion.div
                    key={gap.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200/80 p-4 flex items-center justify-between hover:shadow-md transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                        <MapPin size={18} className="text-amber-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{gap.name}</p>
                        <p className="text-xs text-gray-400">{gap.city}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-900">{gap.retailer_count}</p>
                      <p className="text-[10px] text-gray-400">retailers</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </>
          )}
        </motion.div>
      )}

      {activeTab === 'funnel' && activation && (
        <motion.div
          key="funnel"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          {/* Funnel visualization */}
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Activity size={16} className="text-gray-400" />
              Retailer Activation Funnel
            </h2>
            <div className="space-y-3">
              <FunnelBar
                label="Total Retailers"
                value={activation.total_retailers}
                pct={100}
                color="from-blue-400 to-blue-500"
              />
              <FunnelBar
                label="Onboarding Completed"
                value={activation.onboarding_completed}
                pct={activation.total_retailers > 0 ? Math.round((activation.onboarding_completed / activation.total_retailers) * 100) : 0}
                color="from-cyan-400 to-cyan-500"
              />
              <FunnelBar
                label="On Trial"
                value={activation.trial}
                pct={activation.total_retailers > 0 ? Math.round((activation.trial / activation.total_retailers) * 100) : 0}
                color="from-amber-400 to-amber-500"
              />
              <FunnelBar
                label="Active Subscriptions"
                value={activation.active_subscription}
                pct={activation.total_retailers > 0 ? Math.round((activation.active_subscription / activation.total_retailers) * 100) : 0}
                color="from-green-400 to-green-500"
              />
              <FunnelBar
                label="Cancelled"
                value={activation.cancelled}
                pct={activation.total_retailers > 0 ? Math.round((activation.cancelled / activation.total_retailers) * 100) : 0}
                color="from-red-400 to-red-500"
              />
            </div>
          </div>

          {/* Conversion rates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <motion.div
              variants={itemVariants}
              className="bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200/80 p-5 hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 size={16} className="text-cyan-500" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Onboarding Rate</span>
              </div>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold text-gray-900">{activation.onboarding_rate}%</span>
                <span className="text-sm text-gray-400 mb-1">
                  ({activation.onboarding_completed}/{activation.total_retailers})
                </span>
              </div>
            </motion.div>

            <motion.div
              variants={itemVariants}
              className="bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200/80 p-5 hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={16} className="text-green-500" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Trial → Active Rate</span>
              </div>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold text-gray-900">{activation.trial_to_active_rate}%</span>
                <span className="text-sm text-gray-400 mb-1">
                  ({activation.active_subscription}/{activation.trial})
                </span>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}

// ── Sub-components ─────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
  pulse,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: string | number
  color: 'blue' | 'green' | 'cyan' | 'amber'
  pulse?: boolean
}) {
  const colorMap = {
    blue: 'from-blue-500/20 to-transparent',
    green: 'from-green-500/20 to-transparent',
    cyan: 'from-cyan-500/20 to-transparent',
    amber: 'from-amber-500/20 to-transparent',
  }

  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -2 }}
      className="relative bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200/80 p-4 transition-all hover:shadow-md overflow-hidden"
    >
      <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${colorMap[color]}`} />
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={14} className={pulse ? 'text-amber-500 animate-pulse' : 'text-gray-400'} />
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">{label}</span>
      </div>
      <div className={`text-xl font-bold ${pulse ? 'text-amber-600' : 'text-gray-900'}`}>
        {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
      </div>
    </motion.div>
  )
}

function FunnelBar({
  label,
  value,
  pct,
  color,
}: {
  label: string
  value: number
  pct: number
  color: string
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="text-sm text-gray-600 w-40 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100/80 rounded-full h-3.5 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(pct, 2)}%` }}
          transition={{ duration: 1, delay: 0.2, ease: 'easeOut' }}
          className={`h-full rounded-full bg-gradient-to-r ${color}`}
        />
      </div>
      <span className="text-sm font-semibold text-gray-900 w-16 text-right">
        {value.toLocaleString('en-IN')}
      </span>
      <span className="text-xs text-gray-400 w-10 text-right">{pct}%</span>
    </div>
  )
}
