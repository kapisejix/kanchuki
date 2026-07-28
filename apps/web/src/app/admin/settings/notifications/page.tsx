'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  HardDrive,
  ShieldAlert,
  Mail,
  Monitor,
  Info,
  ChevronDown,
  ChevronUp,
  X,
  Send,
  Sparkles,
} from 'lucide-react'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type NotificationPreferences = {
  backup_failure: { enabled: boolean; channels: ('admin_bell' | 'email')[] }
  consecutive_failures: { enabled: boolean; threshold: number }
  integrity_failure: { enabled: boolean }
  last_alert: { time: string; type: string; message: string } | null
  consecutive_failures_count: number
}

function getHeaders() {
  const key = sessionStorage.getItem('admin_key')
  return { 'x-admin-key': key ?? '', 'Content-Type': 'application/json' }
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 200, damping: 22 } },
}

export default function NotificationsSettingsPage() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [saveResult, setSaveResult] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [expandedSection, setExpandedSection] = useState<string | null>('backup')

  // ── Load preferences ───────────────────────────────────────
  const loadPrefs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/v1/admin/settings/notifications`, {
        headers: getHeaders(),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setPrefs(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preferences')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPrefs()
  }, [loadPrefs])

  // ── Save preferences ───────────────────────────────────────
  const handleSave = async () => {
    if (!prefs) return
    setSaving(true)
    setSaveResult(null)
    setError('')
    try {
      const res = await fetch(`${API_URL}/v1/admin/settings/notifications`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          backup_failure: prefs.backup_failure,
          consecutive_failures: prefs.consecutive_failures,
          integrity_failure: prefs.integrity_failure,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSaveResult('Preferences saved successfully')
      setTimeout(() => setSaveResult(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // ── Test notification ──────────────────────────────────────
  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    setError('')
    try {
      const res = await fetch(`${API_URL}/v1/admin/notify/test`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setTestResult(json.data.message)
      setTimeout(() => setTestResult(null), 5000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed')
    } finally {
      setTesting(false)
    }
  }

  // ── Toggle channel ─────────────────────────────────────────
  const toggleChannel = (channel: 'admin_bell' | 'email') => {
    if (!prefs) return
    const channels = prefs.backup_failure.channels
    const updated = channels.includes(channel)
      ? channels.filter((c) => c !== channel)
      : [...channels, channel]
    setPrefs({
      ...prefs,
      backup_failure: { ...prefs.backup_failure, channels: updated },
    })
  }

  const SectionHeader = ({
    id,
    title,
    icon: Icon,
    description,
  }: {
    id: string
    title: string
    icon: React.ComponentType<{ size?: number; className?: string }>
    description: string
  }) => (
    <button
      onClick={() => setExpandedSection(expandedSection === id ? null : id)}
      className="w-full flex items-center justify-between px-5 py-4 bg-white/50 hover:bg-white/80 rounded-xl border border-gray-200/60 transition-all cursor-pointer"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-xl flex items-center justify-center">
          <Icon size={18} className="text-cyan-600" />
        </div>
        <div className="text-left">
          <p className="text-sm font-semibold text-gray-800">{title}</p>
          <p className="text-xs text-gray-400">{description}</p>
        </div>
      </div>
      {expandedSection === id ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
    </button>
  )

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Bell size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Notification Preferences</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Configure alert channels for backup failures and system events
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            onClick={loadPrefs}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="p-2 text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-xl transition-all"
          >
            <RefreshCw size={16} />
          </motion.button>
          <motion.button
            onClick={handleSave}
            disabled={saving || !prefs}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-amber-500/25 disabled:opacity-60"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? 'Saving...' : 'Save'}
          </motion.button>
        </div>
      </motion.div>

      {/* Status messages */}
      <AnimatePresence>
        {saveResult && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl px-4 py-3"
          >
            <CheckCircle2 size={15} />
            <span>{saveResult}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {testResult && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded-xl px-4 py-3"
          >
            <CheckCircle2 size={15} />
            <span>{testResult}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3"
          >
            <AlertCircle size={15} />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading */}
      {loading ? (
        <motion.div variants={itemVariants} className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white/60 rounded-xl border border-gray-200/60 p-6">
              <div className="h-5 bg-gray-200/60 rounded w-1/3 mb-3 animate-pulse" />
              <div className="h-3 bg-gray-200/60 rounded w-2/3 animate-pulse" />
            </div>
          ))}
        </motion.div>
      ) : !prefs ? (
        <motion.div variants={itemVariants} className="text-center py-16 text-gray-400">
          <Bell size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm">Could not load notification preferences</p>
        </motion.div>
      ) : (
        <>
          {/* Alert Status Card */}
          <motion.div
            variants={itemVariants}
            className={`rounded-2xl border p-6 ${
              prefs.consecutive_failures_count >= (prefs.consecutive_failures.threshold ?? 2)
                ? 'bg-red-50 border-red-200'
                : 'bg-emerald-50 border-emerald-200'
            }`}
          >
            <div className="flex items-center gap-3">
              {prefs.consecutive_failures_count >= (prefs.consecutive_failures.threshold ?? 2) ? (
                <ShieldAlert size={24} className="text-red-500" />
              ) : (
                <CheckCircle2 size={24} className="text-emerald-500" />
              )}
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {prefs.consecutive_failures_count >= (prefs.consecutive_failures.threshold ?? 2)
                    ? `${prefs.consecutive_failures_count} consecutive backup failures`
                    : 'Backup system healthy'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {prefs.last_alert
                    ? `Last alert: ${prefs.last_alert.message} (${new Date(prefs.last_alert.time).toLocaleString('en-IN')})`
                    : 'No recent alerts'}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Backup Alerts Section */}
          <motion.div variants={itemVariants} className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden shadow-lg">
            <SectionHeader id="backup" title="Backup Failure Alerts" icon={HardDrive} description="Get notified when database backups fail" />

            <AnimatePresence>
              {expandedSection === 'backup' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-5 py-5 space-y-5 border-t border-gray-100">
                    {/* Backup failure toggle */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Backup failure notifications</p>
                        <p className="text-xs text-gray-400 mt-0.5">Alert when a scheduled backup fails</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={prefs.backup_failure.enabled}
                          onChange={() =>
                            setPrefs({
                              ...prefs,
                              backup_failure: { ...prefs.backup_failure, enabled: !prefs.backup_failure.enabled },
                            })
                          }
                          className="sr-only peer"
                        />
                        <div className="w-10 h-5.5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-amber-500/30 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500" />
                      </label>
                    </div>

                    {/* Channels */}
                    {prefs.backup_failure.enabled && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notification Channels</p>
                        <div className="flex gap-3">
                          <button
                            onClick={() => toggleChannel('admin_bell')}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all cursor-pointer ${
                              prefs.backup_failure.channels.includes('admin_bell')
                                ? 'bg-amber-50 border-amber-200 text-amber-700'
                                : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-gray-300'
                            }`}
                          >
                            <Monitor size={15} />
                            Admin Bell
                          </button>
                          <button
                            onClick={() => toggleChannel('email')}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all cursor-pointer ${
                              prefs.backup_failure.channels.includes('email')
                                ? 'bg-amber-50 border-amber-200 text-amber-700'
                                : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-gray-300'
                            }`}
                          >
                            <Mail size={15} />
                            Email
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Separator */}
                    <div className="border-t border-gray-100" />

                    {/* Consecutive failures threshold */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-sm font-medium text-gray-800">Consecutive failure threshold</p>
                          <p className="text-xs text-gray-400 mt-0.5">Alert after N consecutive backup failures</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={prefs.consecutive_failures.enabled}
                            onChange={() =>
                              setPrefs({
                                ...prefs,
                                consecutive_failures: { ...prefs.consecutive_failures, enabled: !prefs.consecutive_failures.enabled },
                              })
                            }
                            className="sr-only peer"
                          />
                          <div className="w-10 h-5.5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-amber-500/30 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500" />
                        </label>
                      </div>
                      {prefs.consecutive_failures.enabled && (
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400">Alert after</span>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 5].map((n) => (
                              <button
                                key={n}
                                onClick={() =>
                                  setPrefs({
                                    ...prefs,
                                    consecutive_failures: { ...prefs.consecutive_failures, threshold: n },
                                  })
                                }
                                className={`w-9 h-9 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                                  prefs.consecutive_failures.threshold === n
                                    ? 'bg-amber-50 border-amber-200 text-amber-700'
                                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                                }`}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                          <span className="text-xs text-gray-400">consecutive failures</span>
                        </div>
                      )}
                    </div>

                    {/* Separator */}
                    <div className="border-t border-gray-100" />

                    {/* Integrity failure */ }
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Integrity check failures</p>
                        <p className="text-xs text-gray-400 mt-0.5">Alert when restored backup table count doesn&apos;t match source</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={prefs.integrity_failure.enabled}
                          onChange={() =>
                            setPrefs({
                              ...prefs,
                              integrity_failure: { ...prefs.integrity_failure, enabled: !prefs.integrity_failure.enabled },
                            })
                          }
                          className="sr-only peer"
                        />
                        <div className="w-10 h-5.5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-amber-500/30 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500" />
                      </label>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Test Notification */}
          <motion.div variants={itemVariants} className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-br from-blue-500/20 to-indigo-500/20 rounded-xl flex items-center justify-center">
                  <Send size={16} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Test Notification</p>
                  <p className="text-xs text-gray-400">Send a test notification to verify your alert channels are working</p>
                </div>
              </div>
              <motion.button
                onClick={handleTest}
                disabled={testing}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/25 disabled:opacity-60"
              >
                {testing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {testing ? 'Sending...' : 'Send Test'}
              </motion.button>
            </div>
          </motion.div>

          {/* Info note */}
          <motion.div variants={itemVariants} className="flex items-start gap-2 bg-gray-50/80 border border-gray-200 rounded-xl px-4 py-3">
            <Info size={14} className="text-gray-400 mt-0.5 shrink-0" />
            <p className="text-xs text-gray-500">
              Email notifications require an SMTP provider to be configured (Phase 2). Currently,
              alerts are delivered via the admin panel bell icon. Backup failure alerts are
              automatically generated by the scheduled backup job.
            </p>
          </motion.div>
        </>
      )}
    </motion.div>
  )
}
