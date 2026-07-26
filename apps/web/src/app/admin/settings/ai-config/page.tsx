'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Cpu, Loader2, AlertCircle, Save, RefreshCw } from 'lucide-react'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type AiConfigEntry = {
  model: string
  temperature: number
  max_tokens: number
  timeout_ms: number
  is_default: boolean
}

type AiConfigs = Record<string, AiConfigEntry>

function getHeaders() {
  const key = sessionStorage.getItem('admin_key')
  return { 'x-admin-key': key ?? '', 'Content-Type': 'application/json' }
}

export default function AiConfigPage() {
  const [configs, setConfigs] = useState<AiConfigs>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [testResult, setTestResult] = useState<string | null>(null)

  const loadConfigs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/v1/admin/settings/ai-config`, { headers: getHeaders() })
      if (!res.ok) throw new Error('Failed to load')
      const json = await res.json()
      setConfigs(json.data ?? {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadConfigs() }, [loadConfigs])

  const updateConfig = (key: string, field: string, value: string | number) => {
    setConfigs((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value, is_default: false },
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    setTestResult(null)
    try {
      const payload: Record<string, { model: string; temperature: number; max_tokens: number; timeout_ms: number }> = {}
      for (const [key, val] of Object.entries(configs)) {
        payload[key] = { model: val.model, temperature: val.temperature, max_tokens: val.max_tokens, timeout_ms: val.timeout_ms }
      }
      const res = await fetch(`${API_URL}/v1/admin/settings/ai-config`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ configs: payload }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setSuccess('AI config updated successfully')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const formatKey = (key: string): string =>
    key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())

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
            <Cpu size={24} className="text-gray-700" />
            <h1 className="text-2xl font-bold text-gray-900">AI Model Configuration</h1>
          </div>
          <p className="text-sm text-gray-500">Select AI models and parameters per operation type</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-cyan-500/25"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save Changes
        </motion.button>
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

      <div className="space-y-4">
        {Object.entries(configs).map(([key, entry], i) => (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">{formatKey(key)}</h3>
                {entry.is_default && (
                  <span className="text-[10px] text-gray-400 font-medium">Default config (not customized)</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Model</label>
                <input
                  type="text"
                  value={entry.model}
                  onChange={(e) => updateConfig(key, 'model', e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Temperature</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={entry.temperature}
                    onChange={(e) => updateConfig(key, 'temperature', Number.parseFloat(e.target.value))}
                    className="flex-1 accent-cyan-500"
                  />
                  <span className="text-xs font-mono text-gray-600 w-8 text-right">{entry.temperature.toFixed(2)}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Max Tokens</label>
                <input
                  type="number"
                  min={0}
                  max={100000}
                  step={100}
                  value={entry.max_tokens}
                  onChange={(e) => updateConfig(key, 'max_tokens', Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Timeout (ms)</label>
                <input
                  type="number"
                  min={1000}
                  max={600000}
                  step={1000}
                  value={entry.timeout_ms}
                  onChange={(e) => updateConfig(key, 'timeout_ms', Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
