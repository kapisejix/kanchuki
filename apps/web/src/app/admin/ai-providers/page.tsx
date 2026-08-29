'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Bot,
  Plus,
  Save,
  Trash2,
  Loader2,
  ArrowUp,
  ArrowDown,
  Power,
  KeyRound,
  Edit3,
  X,
  Eye,
  AlertTriangle,
  HelpCircle,
} from 'lucide-react'
import { classifyVisionModel } from '@/lib/vision-model'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type ProviderType = 'ANTHROPIC' | 'OPENAI_COMPAT' | 'GEMINI'

type AiProviderRow = {
  id: string
  provider_type: ProviderType
  label: string
  model_name: string
  lite_model_name: string | null
  base_url: string | null
  api_key_name: string
  priority: number
  is_active: boolean
  credits_per_call: number
  key_configured: boolean
  created_at: string
}

const TYPE_LABELS: Record<ProviderType, string> = {
  ANTHROPIC: 'Claude (Anthropic)',
  OPENAI_COMPAT: 'OpenAI-compatible (OpenRouter/DeepSeek/Mistral/Groq…)',
  GEMINI: 'Google Gemini',
}

const EMPTY_FORM = {
  provider_type: 'OPENAI_COMPAT' as ProviderType,
  label: '',
  model_name: '',
  lite_model_name: '',
  base_url: '',
  api_key_name: 'OPENROUTER_API_KEY',
  credits_per_call: '1',
}

// Badge showing whether a model can read product images (AI tagging sends
// images, so a text-only model would fail over every call).
function VisionBadge({ modelName }: { modelName: string }) {
  const capability = classifyVisionModel(modelName)
  if (capability === 'vision') {
    return (
      <span
        className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 border border-green-200 text-green-600 flex items-center gap-1"
        title="Vision-capable — can read product images"
      >
        <Eye size={10} /> Vision
      </span>
    )
  }
  if (capability === 'text-only') {
    return (
      <span
        className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 border border-red-200 text-red-600 flex items-center gap-1"
        title="Text-only — cannot read product images; every tagging call fails over to the next provider"
      >
        <AlertTriangle size={10} /> Text-only
      </span>
    )
  }
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 border border-gray-200 text-gray-400 flex items-center gap-1"
      title="Unverified — confirm this model accepts image inputs before using it for tagging"
    >
      <HelpCircle size={10} /> Unverified
    </span>
  )
}

export default function AiProvidersPage() {
  const [rows, setRows] = useState<AiProviderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<AiProviderRow | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const load = useCallback(async () => {
    const res = await fetch(`${API_URL}/v1/admin/ai-providers`, adminGetOptions())
    const json = await res.json()
    setRows((json.data ?? []).sort((a: AiProviderRow, b: AiProviderRow) => a.priority - b.priority))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const reorder = async (id: string, direction: -1 | 1) => {
    const idx = rows.findIndex((r) => r.id === id)
    const swapIdx = idx + direction
    if (idx < 0 || swapIdx < 0 || swapIdx >= rows.length) return
    const next = [...rows]
    ;[next[idx], next[swapIdx]] = [next[swapIdx]!, next[idx]!]
    setRows(next)
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/v1/admin/ai-providers/reorder`, {
        ...(await adminMutateOptions()),
        method: 'POST',
        body: JSON.stringify({ ordered_ids: next.map((r) => r.id) }),
      })
      if (!res.ok) throw new Error('Reorder failed')
      setStatus('✅ Provider order saved')
      await load()
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Reorder failed'}`)
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async (row: AiProviderRow) => {
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/v1/admin/ai-providers/${row.id}`, {
        ...(await adminMutateOptions()),
        method: 'PATCH',
        body: JSON.stringify({ is_active: !row.is_active }),
      })
      if (!res.ok) throw new Error('Update failed')
      await load()
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Update failed'}`)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (row: AiProviderRow) => {
    if (!confirm(`Delete ${row.label}? Calls will skip this provider.`)) return
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/v1/admin/ai-providers/${row.id}`, {
        ...(await adminMutateOptions()),
        method: 'DELETE',
        // adminMutateOptions() sets Content-Type: application/json — Fastify
        // 500s on an empty body ("body must be object"). Send an empty object.
        body: '{}',
      })
      if (!res.ok) throw new Error('Delete failed')
      setStatus(`✅ ${row.label} deleted`)
      await load()
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Delete failed'}`)
    } finally {
      setBusy(false)
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const openEdit = (row: AiProviderRow) => {
    setEditing(row)
    setForm({
      provider_type: row.provider_type,
      label: row.label,
      model_name: row.model_name,
      lite_model_name: row.lite_model_name ?? '',
      base_url: row.base_url ?? '',
      api_key_name: row.api_key_name,
      credits_per_call: String(row.credits_per_call),
    })
    setShowForm(true)
  }

  const saveForm = async () => {
    if (!form.label.trim() || !form.model_name.trim() || !form.api_key_name.trim()) {
      setStatus('❌ Label, model name and key name are required')
      return
    }
    setBusy(true)
    setStatus('')
    const payload = {
      provider_type: form.provider_type,
      label: form.label.trim(),
      model_name: form.model_name.trim(),
      lite_model_name: form.lite_model_name.trim() || null,
      base_url: form.base_url.trim() || null,
      api_key_name: form.api_key_name.trim(),
      credits_per_call: Number(form.credits_per_call) || 1,
    }
    try {
      const opts = await adminMutateOptions()
      const res = editing
        ? await fetch(`${API_URL}/v1/admin/ai-providers/${editing.id}`, {
            ...opts,
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await fetch(`${API_URL}/v1/admin/ai-providers`, {
            ...opts,
            method: 'POST',
            body: JSON.stringify(payload),
          })
      if (!res.ok) throw new Error((await res.json())?.error?.message ?? 'Save failed')
      setStatus(`✅ ${editing ? 'Updated' : 'Added'} ${payload.label}`)
      setShowForm(false)
      await load()
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Save failed'}`)
    } finally {
      setBusy(false)
    }
  }

  const textOnlyActive = rows.filter(
    (r) => r.is_active && classifyVisionModel(r.model_name) === 'text-only',
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-cyan-500" />
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">AI Providers</h1>
            <Bot size={20} className="text-cyan-500" />
          </div>
          <p className="text-sm text-gray-500">
            Models the AI tagging engine tries, in priority order (1 = first). When a provider is
            out of credits / rate-limited / down, the next one is tried automatically. Each model&apos;s
            <span className="font-mono"> credits_per_call</span> weights how fast it drains a
            retailer&apos;s AI quota — expensive models cost more credits.
          </p>
        </div>
        <motion.button
          onClick={openCreate}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center gap-2 px-4 py-2.5 bg-cyan-500 text-white rounded-xl text-sm font-medium shadow-lg shadow-cyan-500/20 shrink-0"
        >
          <Plus size={16} /> Add model
        </motion.button>
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

      {textOnlyActive.length > 0 && (
        <div className="flex items-start gap-2 text-sm rounded-xl px-4 py-3 border bg-red-50/80 border-red-200 text-red-700">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <p>
            <strong>Text-only model{textOnlyActive.length > 1 ? 's' : ''} in the active chain:</strong>{' '}
            {textOnlyActive.map((r) => r.label).join(', ')}. AI tagging sends product images, so
            every call to {textOnlyActive.length > 1 ? 'these models' : 'this model'} fails over to
            the next provider — or fails entirely if it&apos;s the only one. Swap in a vision-capable
            model.
          </p>
        </div>
      )}

      {rows.length === 0 && (
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-10 text-center">
          <Bot size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">
            No AI providers configured. Add a model to enable AI tagging — or make sure the legacy
            env-based Claude/OpenAI/Gemini keys are set.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {rows.map((row, index) => (
          <motion.div
            key={row.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            className={`bg-white/80 backdrop-blur-xl rounded-2xl border p-4 ${
              row.is_active ? 'border-gray-200/80' : 'border-gray-100 opacity-60'
            }`}
          >
            <div className="flex items-center gap-3">
              {/* Priority controls */}
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => reorder(row.id, -1)}
                  disabled={index === 0 || busy}
                  className="p-0.5 text-gray-300 hover:text-cyan-600 disabled:opacity-30 transition-colors"
                  aria-label={`Move ${row.label} up`}
                >
                  <ArrowUp size={14} />
                </button>
                <span className="text-center text-[10px] font-mono text-gray-400">{index + 1}</span>
                <button
                  onClick={() => reorder(row.id, 1)}
                  disabled={index === rows.length - 1 || busy}
                  className="p-0.5 text-gray-300 hover:text-cyan-600 disabled:opacity-30 transition-colors"
                  aria-label={`Move ${row.label} down`}
                >
                  <ArrowDown size={14} />
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-800 truncate">{row.label}</p>
                  <VisionBadge modelName={row.model_name} />
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                    {row.provider_type}
                  </span>
                  {!row.key_configured && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-600">
                      key not set
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 font-mono truncate">
                  {row.model_name}
                  {row.lite_model_name ? ` · lite: ${row.lite_model_name}` : ''}
                  {row.base_url ? ` · ${row.base_url}` : ''}
                </p>
                <p className="text-[10px] text-gray-400 font-mono">
                  key: {row.api_key_name} · {row.credits_per_call} credit{row.credits_per_call === 1 ? '' : 's'}/call
                </p>
              </div>

              <button
                onClick={() => toggleActive(row)}
                disabled={busy}
                className={`p-2 rounded-xl transition-colors ${
                  row.is_active
                    ? 'text-green-600 hover:bg-green-50'
                    : 'text-gray-400 hover:bg-gray-100'
                } disabled:opacity-50`}
                aria-label={row.is_active ? 'Deactivate' : 'Activate'}
                title={row.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
              >
                <Power size={16} />
              </button>
              <button
                onClick={() => openEdit(row)}
                disabled={busy}
                className="p-2 rounded-xl text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 transition-colors disabled:opacity-50"
                aria-label={`Edit ${row.label}`}
              >
                <Edit3 size={16} />
              </button>
              <button
                onClick={() => remove(row)}
                disabled={busy}
                className="p-2 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                aria-label={`Delete ${row.label}`}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Add / edit form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">
                {editing ? 'Edit AI provider' : 'Add AI provider'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Provider type</label>
                <select
                  value={form.provider_type}
                  onChange={(e) => setForm({ ...form, provider_type: e.target.value as ProviderType })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                >
                  {(Object.keys(TYPE_LABELS) as ProviderType[]).map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                {form.provider_type === 'OPENAI_COMPAT' && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    OpenAI-protocol providers (OpenRouter, DeepSeek, Mistral, Groq, Together…) work
                    through the same adapter — set <span className="font-mono">base_url</span> to
                    their endpoint, model name to any model they host.
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Label</label>
                <input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="e.g. Claude Sonnet"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Model name</label>
                  <input
                    value={form.model_name}
                    onChange={(e) => setForm({ ...form, model_name: e.target.value })}
                    placeholder="e.g. claude-sonnet-4-5"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                  {form.model_name.trim() &&
                    classifyVisionModel(form.model_name) === 'text-only' && (
                      <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                        <AlertTriangle size={12} className="flex-shrink-0" /> Looks text-only — AI
                        tagging sends images, so every call will fail over to the next provider.
                      </p>
                    )}
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Lite model <span className="text-gray-400">(color detect)</span>
                  </label>
                  <input
                    value={form.lite_model_name}
                    onChange={(e) => setForm({ ...form, lite_model_name: e.target.value })}
                    placeholder="e.g. claude-haiku"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                  {form.lite_model_name.trim() &&
                    classifyVisionModel(form.lite_model_name) === 'text-only' && (
                      <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                        <AlertTriangle size={12} className="flex-shrink-0" /> Color detection also
                        sends images — a text-only model fails over every call.
                      </p>
                    )}
                </div>
              </div>

              {form.provider_type === 'OPENAI_COMPAT' && (
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Base URL <span className="text-gray-400">(default: api.openai.com)</span>
                  </label>
                  <input
                    value={form.base_url}
                    onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                    placeholder="https://openrouter.ai/api/v1"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    API key name
                  </label>
                  <input
                    value={form.api_key_name}
                    onChange={(e) => setForm({ ...form, api_key_name: e.target.value })}
                    placeholder="OPENROUTER_API_KEY"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Stored via Admin → Integrations, or as a .env var of the same name.
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Credits per call
                  </label>
                  <input
                    value={form.credits_per_call}
                    onChange={(e) => setForm({ ...form, credits_per_call: e.target.value })}
                    type="number"
                    min={1}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    1 = cheapest model. Expensive models cost more AI quota per call.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-6">
              <p className="text-[11px] text-gray-400 flex items-center gap-1">
                <KeyRound size={12} /> Keys are never stored here — set them in Integrations.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveForm}
                  disabled={busy}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-cyan-500 text-white rounded-xl hover:bg-cyan-600 disabled:opacity-50 transition-colors"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {editing ? 'Save changes' : 'Add provider'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  )
}
