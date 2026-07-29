'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Palette, Save, Loader2, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

const HEX_RE = /^#[0-9A-Fa-f]{6}$/

// A few sane starting points — not a constraint, admin can type any hex below.
const PRESETS = ['#1E2A3D', '#D41E2A', '#0F5132', '#4C1D95', '#7C2D12']

function getHeaders() {
  const key = sessionStorage.getItem('admin_key')
  return { 'x-admin-key': key ?? '', 'Content-Type': 'application/json' }
}

export default function ThemeSettingsPage() {
  const [savedColor, setSavedColor] = useState<string | null>(null)
  const [color, setColor] = useState('#1E2A3D')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/v1/admin/settings/theme`, { headers: getHeaders() })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setSavedColor(json.data.primary_color)
      setColor(json.data.primary_color)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load theme')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const isValid = HEX_RE.test(color)

  const handleSave = async () => {
    if (!isValid) return
    setSaving(true)
    setSaveResult(null)
    setError('')
    try {
      const res = await fetch(`${API_URL}/v1/admin/settings/theme`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ primary_color: color }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSavedColor(color)
      setSaveResult('Theme saved — live on the site within 60s, on next app launch for mobile')
      setTimeout(() => setSaveResult(null), 5000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Palette size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Theme</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Primary brand color — applies to buttons, links, and accents platform-wide
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            onClick={load}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="p-2 text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-xl transition-all"
          >
            <RefreshCw size={16} />
          </motion.button>
          <motion.button
            onClick={handleSave}
            disabled={saving || !isValid || loading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-cyan-500/25 disabled:opacity-60"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? 'Saving...' : 'Save'}
          </motion.button>
        </div>
      </div>

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

      {loading ? (
        <div className="bg-white/60 rounded-xl border border-gray-200/60 p-6">
          <div className="h-5 bg-gray-200/60 rounded w-1/3 mb-3 animate-pulse" />
          <div className="h-3 bg-gray-200/60 rounded w-2/3 animate-pulse" />
        </div>
      ) : (
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 shadow-lg p-6 space-y-5">
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-2xl border border-gray-200 shrink-0"
              style={{ backgroundColor: isValid ? color : '#00000010' }}
            />
            <div className="flex-1 space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Primary color (hex)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={isValid ? color : '#000000'}
                  onChange={(e) => setColor(e.target.value.toUpperCase())}
                  className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
                />
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="#1E2A3D"
                  className={`px-3 py-2 rounded-lg border text-sm font-mono w-32 ${
                    isValid ? 'border-gray-200' : 'border-red-300 text-red-600'
                  }`}
                />
                {!isValid && <span className="text-xs text-red-500">Invalid hex color</span>}
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Presets</p>
            <div className="flex gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setColor(p)}
                  className={`w-8 h-8 rounded-lg border-2 transition-all cursor-pointer ${
                    color.toUpperCase() === p ? 'border-cyan-500 scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: p }}
                  title={p}
                />
              ))}
            </div>
          </div>

          {savedColor && (
            <p className="text-xs text-gray-400">
              Currently live: <span className="font-mono">{savedColor}</span>
            </p>
          )}
        </div>
      )}

      <div className="flex items-start gap-2 bg-gray-50/80 border border-gray-200 rounded-xl px-4 py-3">
        <AlertCircle size={14} className="text-gray-400 mt-0.5 shrink-0" />
        <p className="text-xs text-gray-500">
          Applies to marketing site + customer PWA immediately (60s cache). The retailer mobile app
          picks it up on next launch/network refresh — no app-store release needed. This admin
          panel&apos;s own colors are unaffected by design (kept motion/decoration-restrained).
        </p>
      </div>
    </motion.div>
  )
}
