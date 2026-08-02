'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Shield,
  Clock,
  History,
  type LucideIcon,
} from 'lucide-react'
import { adminGetOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type Gate = {
  name: string
  description: string
  passed: boolean
  details: string
}

type GateCheck = {
  gates: Gate[]
  all_passed: boolean
  checked_at: string
  summary: string
}

type GateHistoryItem = {
  action: string
  result: string
  summary: string
  checked_at: string
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 200, damping: 22 } },
}

export default function DeploymentGatePage() {
  const [gateCheck, setGateCheck] = useState<GateCheck | null>(null)
  const [history, setHistory] = useState<GateHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError('')

    try {
      const opts = adminGetOptions()
      const [checkRes, historyRes] = await Promise.all([
        fetch(`${API_URL}/v1/admin/deployment-gate/check`, opts),
        fetch(`${API_URL}/v1/admin/deployment-gate/history`, opts),
      ])

      if (!checkRes.ok) throw new Error('Failed to check deployment gates')
      const checkJson = await checkRes.json()
      setGateCheck(checkJson.data)

      if (historyRes.ok) {
        const historyJson = await historyRes.json()
        setHistory(historyJson.data ?? [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load gate status')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Gate descriptions for tooltips
  const gateLabels: Record<string, { title: string; icon: LucideIcon }> = {
    pending_operations: { title: 'Pending Operations', icon: Clock },
    no_recent_failures: { title: 'Recent Failures', icon: XCircle },
    recent_backup: { title: 'Recent Backup', icon: Clock },
    integrity_checks: { title: 'Integrity Checks', icon: Shield },
  }

  if (loading) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={24} className="animate-spin text-cyan-500" />
          <p className="text-sm text-gray-400">Checking deployment gates...</p>
        </div>
      </motion.div>
    )
  }

  const passCount = gateCheck?.gates.filter((g) => g.passed).length ?? 0
  const totalCount = gateCheck?.gates.length ?? 0

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Activity size={24} className="text-gray-700" />
            <h1 className="text-2xl font-bold text-gray-900">Deployment Gate</h1>
          </div>
          <p className="text-sm text-gray-500">
            Pre-deployment condition checks — all gates must pass before deploying
          </p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            onClick={() => setShowHistory(!showHistory)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
          >
            <History size={13} />
            History
          </motion.button>
          <motion.button
            onClick={() => loadData(true)}
            disabled={refreshing}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            Re-check
          </motion.button>
        </div>
      </motion.div>

      {/* Error state */}
      {error && (
        <motion.div variants={itemVariants} className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl px-5 py-4 flex items-center gap-2">
          <XCircle size={15} />
          <span>{error}</span>
        </motion.div>
      )}

      {/* Summary banner */}
      {gateCheck && (
        <motion.div variants={itemVariants}>
          <div
            className={`rounded-2xl border p-6 ${
              gateCheck.all_passed
                ? 'bg-emerald-50/80 border-emerald-200'
                : 'bg-rose-50/80 border-rose-200'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className={`p-2 rounded-xl ${
                gateCheck.all_passed ? 'bg-emerald-100' : 'bg-rose-100'
              }`}>
                {gateCheck.all_passed ? (
                  <CheckCircle2 size={28} className="text-emerald-600" />
                ) : (
                  <AlertTriangle size={28} className="text-rose-600" />
                )}
              </div>
              <div className="flex-1">
                <h2 className={`text-lg font-bold ${
                  gateCheck.all_passed ? 'text-emerald-800' : 'text-rose-800'
                }`}>
                  {gateCheck.all_passed ? 'All Gates Passed' : 'Deployment Blocked'}
                </h2>
                <p className={`text-sm mt-1 ${
                  gateCheck.all_passed ? 'text-emerald-600' : 'text-rose-600'
                }`}>
                  {gateCheck.summary}
                </p>
                <div className="flex items-center gap-4 mt-3">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-2xl font-bold ${
                      gateCheck.all_passed ? 'text-emerald-700' : 'text-rose-700'
                    }`}>
                      {passCount}
                    </span>
                    <span className="text-xs text-gray-500">/ {totalCount} gates passing</span>
                  </div>
                  {gateCheck.checked_at && (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock size={11} />
                      Checked {new Date(gateCheck.checked_at).toLocaleTimeString('en-IN', {
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Individual gates */}
      {gateCheck && (
        <motion.div variants={containerVariants} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {gateCheck.gates.map((gate) => {
            const label = gateLabels[gate.name]
            const GateIcon = label?.icon ?? Shield

            return (
              <motion.div
                key={gate.name}
                variants={itemVariants}
                className={`bg-white/80 backdrop-blur-sm rounded-2xl border p-5 transition-all hover:shadow-md ${
                  gate.passed ? 'border-gray-200/80' : 'border-rose-200/80 bg-rose-50/30'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-2 rounded-xl ${
                      gate.passed ? 'bg-emerald-100' : 'bg-rose-100'
                    }`}>
                      <GateIcon size={18} className={
                        gate.passed ? 'text-emerald-600' : 'text-rose-600'
                      } />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {label?.title ?? gate.name.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-gray-400">{gate.description}</p>
                    </div>
                  </div>
                  {gate.passed ? (
                    <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle size={20} className="text-rose-500 shrink-0" />
                  )}
                </div>
                <div className={`text-xs mt-2 px-3 py-2 rounded-lg ${
                  gate.passed
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-rose-50 text-rose-700'
                }`}>
                  {gate.details}
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      )}

      {/* History panel */}
      <AnimatePresence>
        {showHistory && history.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <History size={16} className="text-gray-400" />
                Gate Check History
              </h2>
              <div className="space-y-2">
                {history.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-gray-50/50 transition-colors">
                    {item.result === 'passed' ? (
                      <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle size={14} className="text-rose-500 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 truncate">{item.summary}</p>
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0">
                      {new Date(item.checked_at).toLocaleString('en-IN', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty history */}
      {showHistory && history.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-8 text-gray-400"
        >
          <History size={32} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No gate check history yet</p>
        </motion.div>
      )}
    </motion.div>
  )
}
