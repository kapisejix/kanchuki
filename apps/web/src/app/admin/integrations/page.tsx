'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { KeyRound, Save, Trash2, Loader2, ShieldCheck, ShieldOff } from 'lucide-react'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type Category = 'AI' | 'PAYMENT' | 'STORAGE' | 'WHATSAPP'

type IntegrationRow = {
  id: string | null
  key_name: string
  category: Category
  label: string
  masked_preview: string | null
  is_active: boolean
  updated_at: string | null
  configured: boolean
}

const CATEGORY_LABELS: Record<Category, string> = {
  AI: 'AI (Claude, OpenAI, V-Tone)',
  PAYMENT: 'Payment Gateway (Razorpay)',
  STORAGE: 'Storage (Cloudflare R2)',
  WHATSAPP: 'WhatsApp Business API',
}

function getHeaders() {
  const key = sessionStorage.getItem('admin_key')
  return { 'x-admin-key': key ?? '', 'Content-Type': 'application/json' }
}

export default function IntegrationsPage() {
  const [rows, setRows] = useState<IntegrationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState('')

  const load = useCallback(async () => {
    const res = await fetch(`${API_URL}/v1/admin/integrations`, { headers: getHeaders() })
    const json = await res.json()
    setRows(json.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = async (row: IntegrationRow) => {
    const value = (drafts[row.key_name] ?? '').trim()
    if (!value) {
      setStatus('❌ Enter a value first')
      return
    }
    setBusy(row.key_name)
    setStatus('')
    try {
      const res = row.configured
        ? await fetch(`${API_URL}/v1/admin/integrations/${row.id}`, {
            method: 'PATCH',
            headers: getHeaders(),
            body: JSON.stringify({ value }),
          })
        : await fetch(`${API_URL}/v1/admin/integrations`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ key_name: row.key_name, value }),
          })
      if (!res.ok) throw new Error((await res.json())?.error?.message ?? 'Save failed')
      setDrafts((d) => ({ ...d, [row.key_name]: '' }))
      setStatus(`✅ ${row.label} saved`)
      await load()
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Save failed'}`)
    } finally {
      setBusy(null)
    }
  }

  const remove = async (row: IntegrationRow) => {
    if (!row.id) return
    if (!confirm(`Remove ${row.label}? The app will fall back to its .env value, if any.`)) return
    setBusy(row.key_name)
    try {
      const res = await fetch(`${API_URL}/v1/admin/integrations/${row.id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      })
      if (!res.ok) throw new Error('Delete failed')
      setStatus(`✅ ${row.label} removed — using .env fallback`)
      await load()
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Delete failed'}`)
    } finally {
      setBusy(null)
    }
  }

  const toggleActive = async (row: IntegrationRow) => {
    if (!row.id) return
    setBusy(row.key_name)
    try {
      await fetch(`${API_URL}/v1/admin/integrations/${row.id}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ is_active: !row.is_active }),
      })
      await load()
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-cyan-500" />
      </div>
    )
  }

  const categories = Array.from(new Set(rows.map((r) => r.category))) as Category[]

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-4xl">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
          <KeyRound size={20} className="text-cyan-500" />
        </div>
        <p className="text-sm text-gray-500">
          Third-party API keys and secrets, encrypted at rest (AES-256-GCM). Super admin only.
          Values are never shown again after saving — paste a new value to rotate. Leave a key
          unconfigured to keep using its <span className="font-mono">.env</span> value.
        </p>
      </div>

      {status && (
        <div
          className={`text-sm rounded-xl px-4 py-3 border ${
            status.startsWith('✅')
              ? 'bg-green-50/80 border-green-200 text-green-700'
              : 'bg-red-50/80 border-red-200 text-red-600'
          }`}
        >
          {status}
        </div>
      )}

      {categories.map((category) => (
        <div key={category} className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">{CATEGORY_LABELS[category]}</h2>
          <div className="space-y-3">
            {rows
              .filter((r) => r.category === category)
              .map((row) => (
                <div
                  key={row.key_name}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 border-b border-gray-50 pb-3 last:border-0 last:pb-0"
                >
                  <div className="sm:w-56 shrink-0">
                    <p className="text-sm font-medium text-gray-800">{row.label}</p>
                    <p className="text-xs font-mono text-gray-400">{row.key_name}</p>
                  </div>

                  <div className="flex-1 flex items-center gap-1.5">
                    <span
                      className={`text-xs font-mono px-2 py-1.5 rounded-lg border ${
                        row.configured
                          ? row.is_active
                            ? 'bg-green-50 border-green-200 text-green-700'
                            : 'bg-gray-50 border-gray-200 text-gray-400'
                          : 'bg-amber-50 border-amber-200 text-amber-600'
                      }`}
                    >
                      {row.configured ? row.masked_preview : 'not set — using .env'}
                    </span>
                    {row.configured && (
                      <button
                        onClick={() => toggleActive(row)}
                        disabled={busy === row.key_name}
                        className="p-1.5 text-gray-400 hover:text-cyan-600 disabled:opacity-50"
                        aria-label={row.is_active ? 'Deactivate' : 'Activate'}
                        title={row.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                      >
                        {row.is_active ? <ShieldCheck size={16} /> : <ShieldOff size={16} />}
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <input
                      type="password"
                      value={drafts[row.key_name] ?? ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [row.key_name]: e.target.value }))}
                      placeholder={row.configured ? 'Rotate value…' : 'Paste value…'}
                      className="w-48 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                    />
                    <button
                      onClick={() => save(row)}
                      disabled={busy === row.key_name}
                      className="p-1.5 text-gray-400 hover:text-cyan-600 disabled:opacity-50 transition-colors"
                      aria-label={`Save ${row.label}`}
                    >
                      {busy === row.key_name ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    </button>
                    {row.configured && (
                      <button
                        onClick={() => remove(row)}
                        disabled={busy === row.key_name}
                        className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-50 transition-colors"
                        aria-label={`Remove ${row.label}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
    </motion.div>
  )
}
