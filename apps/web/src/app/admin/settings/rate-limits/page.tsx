'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Gauge, Loader2, AlertCircle, Save, RefreshCw } from 'lucide-react'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type RateLimitEntry = {
  window_ms: number
  max_requests: number
  description: string
  is_default: boolean
}

type RateLimits = Record<string, RateLimitEntry>

function getHeaders() {
  const key = sessionStorage.getItem('admin_key')
  return { 'x-admin-key': key ?? '', 'Content-Type': 'application/json' }
}

export default function RateLimitsPage() {
  const [limits, setLimits] = useState<RateLimits>({})
  const [originalLimits, setOriginalLimits] = useState<RateLimits>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editedKeys, setEditedKeys] = useState<Set<string>>(new Set())

  const loadLimits = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/v1/admin/settings/rate-limits`, { headers: getHeaders() })
      if (!res.ok) throw new Error('Failed to load')
      const json = await res.json()
      setLimits(json.data ?? {})
      setOriginalLimits(JSON.parse(JSON.stringify(json.data ?? {})))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadLimits() }, [loadLimits])

  const updateLimit = (key: string, field: 'window_ms' | 'max_requests', value: number) => {
    setLimits((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value, is_default: false },
    }))
    setEditedKeys((prev) => new Set(prev).add(key))
  }

  const hasChanges = Object.keys(limits).some((k) => {
    const orig = originalLimits[k]
    const curr = limits[k]
    return orig && curr && (orig.window_ms !== curr.window_ms || orig.max_requests !== curr.max_requests)
  })

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const payload: Record<string, { window_ms: number; max_requests: number }> = {}
      for (const [key, val] of Object.entries(limits)) {
        payload[key] = { window_ms: val.window_ms, max_requests: val.max_requests }
      }
      const res = await fetch(`${API_URL}/v1/admin/settings/rate-limits`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ limits: payload }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setOriginalLimits(JSON.parse(JSON.stringify(limits)))
      setEditedKeys(new Set())
      setSuccess('Rate limits updated successfully')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const formatWindow = (ms: number): string => {
    if (ms >= 3600000) return `${ms / 3600000}h`
    if (ms >= 60000) return `${ms / 60000}min`
    return `${ms / 1000}s`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Gauge size={24} className="text-gray-700" />
            <h1 className="text-2xl font-bold text-gray-900">Rate Limits</h1>
          </div>
          <p className="text-sm text-gray-500">Configure request rate limits per endpoint — changes apply immediately</p>
        </div>
        <div className="flex items-center gap-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={loadLimits}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600 hover:text-gray-800 transition-all"
          >
            <RefreshCw size={14} />
            Reset
          </motion.button>
          {hasChanges && (
            <motion.button
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-cyan-500/25"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Changes
            </motion.button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl px-4 py-3">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-600 text-sm rounded-2xl px-4 py-3">
          <Save size={14} />
          <span>{success}</span>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Endpoint</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Description</th>
              <th className="text-right px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Window</th>
              <th className="text-right px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Max Requests</th>
              <th className="text-right px-5 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Rate</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(limits).map(([key, entry], i) => {
              const isEdited = editedKeys.has(key)
              const ratePerSec = entry.window_ms > 0 ? (entry.max_requests / (entry.window_ms / 1000)).toFixed(1) : '∞'
              return (
                <motion.tr
                  key={key}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={`border-b border-gray-50 last:border-0 ${isEdited ? 'bg-cyan-50/50' : ''}`}
                >
                  <td className="px-5 py-4">
                    <code className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-md font-mono">{key}</code>
                    {isEdited && <span className="ml-2 text-[10px] text-cyan-600 font-medium">Edited</span>}
                  </td>
                  <td className="px-5 py-4 text-gray-500 text-xs">{entry.description}</td>
                  <td className="px-5 py-4 text-right">
                    <select
                      value={entry.window_ms}
                      onChange={(e) => updateLimit(key, 'window_ms', Number(e.target.value))}
                      className="px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                    >
                      <option value={60000}>1 min</option>
                      <option value={300000}>5 min</option>
                      <option value={900000}>15 min</option>
                      <option value={3600000}>1 hr</option>
                      <option value={86400000}>24 hr</option>
                    </select>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={entry.max_requests}
                      onChange={(e) => updateLimit(key, 'max_requests', Math.max(1, Number(e.target.value)))}
                      className="w-20 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 text-right focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                    />
                  </td>
                  <td className="px-5 py-4 text-right text-xs text-gray-400 font-mono">
                    {ratePerSec}/s
                  </td>
                </motion.tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {Object.keys(limits).length === 0 && (
        <div className="text-center py-16">
          <Gauge size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No rate limits configured</p>
        </div>
      )}
    </motion.div>
  )
}
