'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Eye, EyeOff, KeyRound, Save, Trash2, Loader2, ShieldCheck, ShieldOff } from 'lucide-react'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'

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

const CATEGORY_LABELS: Record<string, string> = {
  AI: 'AI Models & Generation (Fal.ai Flux / IDM-VTON, Google Imagen 3, Gemini, Claude, OpenAI)',
  PAYMENT: 'Payment Gateway (Razorpay)',
  STORAGE: 'Storage (Cloudflare R2)',
  WHATSAPP: 'WhatsApp Business API',
}

export default function IntegrationsPage() {
  const [rows, setRows] = useState<IntegrationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [showValues, setShowValues] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/v1/admin/integrations`, adminGetOptions())
      if (!res.ok) {
        const errorJson = await res.json().catch(() => null)
        throw new Error(errorJson?.error?.message ?? `HTTP ${res.status}`)
      }
      const json = await res.json()
      setRows(json.data ?? [])
    } catch (err) {
      setStatus(`❌ Failed to load integrations: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
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
      const opts = await adminMutateOptions()
      const res = row.configured
        ? await fetch(`${API_URL}/v1/admin/integrations/${row.id}`, {
            ...opts,
            method: 'PATCH',
            body: JSON.stringify({ value }),
          })
        : await fetch(`${API_URL}/v1/admin/integrations`, {
            ...opts,
            method: 'POST',
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
        ...(await adminMutateOptions()),
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error?.message ?? `Delete failed (${res.status})`)
      }
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
    setStatus('')
    try {
      const res = await fetch(`${API_URL}/v1/admin/integrations/${row.id}`, {
        ...(await adminMutateOptions()),
        method: 'PATCH',
        body: JSON.stringify({ is_active: !row.is_active }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error?.message ?? `Update failed (${res.status})`)
      }
      setStatus(`✅ ${row.label} ${!row.is_active ? 'activated' : 'deactivated'}`)
      await load()
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Toggle failed'}`)
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

  const filteredRows = rows.filter((r) => {
    const matchesCat = selectedCategory === 'ALL' || r.category === selectedCategory
    const q = searchQuery.toLowerCase().trim()
    const matchesSearch = !q || r.key_name.toLowerCase().includes(q) || r.label.toLowerCase().includes(q)
    return matchesCat && matchesSearch
  })

  const availableCategories = Array.from(new Set(rows.map((r) => r.category))) as Category[]
  const displayedCategories = Array.from(new Set(filteredRows.map((r) => r.category))) as Category[]

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
            <KeyRound size={20} className="text-cyan-500" />
          </div>
          <p className="text-sm text-gray-500">
            Third-party API keys and secrets, encrypted at rest (AES-256-GCM). Super admin only.
            Values are never shown again after saving — paste a new value to rotate.
          </p>
        </div>
        <button
          onClick={() => {
            setLoading(true)
            void load()
          }}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 shadow-xs"
        >
          Refresh Keys
        </button>
      </div>

      {/* Category Pills & Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedCategory === 'ALL'
                ? 'bg-cyan-500 text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All ({rows.length})
          </button>
          {availableCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-cyan-500 text-white shadow-xs'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat} ({rows.filter((r) => r.category === cat).length})
            </button>
          ))}
        </div>
        <div className="flex-1 sm:max-w-xs ml-auto">
          <input
            type="text"
            placeholder="Search keys (e.g. FAL, Gemini, Flux)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50 bg-white"
          />
        </div>
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

      {displayedCategories.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-500">
          {searchQuery
            ? `No integration keys found matching \u201C${searchQuery}\u201D.`
            : 'No integration keys found.'}
        </div>
      ) : (
        displayedCategories.map((category) => (
          <div key={category} className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">{CATEGORY_LABELS[category] ?? category}</h2>
            <div className="space-y-3">
              {filteredRows
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
                        onClick={() => void toggleActive(row)}
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
                    <div className="relative">
                      <input
                        type={showValues[row.key_name] ? 'text' : 'password'}
                        value={drafts[row.key_name] ?? ''}
                        onChange={(e) => setDrafts((d) => ({ ...d, [row.key_name]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void save(row)
                        }}
                        placeholder={row.configured ? 'Rotate value…' : 'Paste value…'}
                        className="w-52 px-2.5 py-1.5 pr-8 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                      />
                      {drafts[row.key_name] ? (
                        <button
                          type="button"
                          onClick={() =>
                            setShowValues((prev) => ({ ...prev, [row.key_name]: !prev[row.key_name] }))
                          }
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          aria-label={showValues[row.key_name] ? 'Hide password' : 'Show password'}
                        >
                          {showValues[row.key_name] ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      ) : null}
                    </div>
                    <button
                      onClick={() => void save(row)}
                      disabled={busy === row.key_name}
                      className="p-1.5 text-gray-400 hover:text-cyan-600 disabled:opacity-50 transition-colors"
                      aria-label={`Save ${row.label}`}
                    >
                      {busy === row.key_name ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    </button>
                    {row.configured && (
                      <button
                        onClick={() => void remove(row)}
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
        ))
      )}
    </motion.div>
  )
}
