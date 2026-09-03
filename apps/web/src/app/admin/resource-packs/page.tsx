'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Layers, Plus, Pencil, Trash2, Power, Save, X, Loader2 } from 'lucide-react'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type Plan = 'STARTER' | 'GROWTH' | 'PRO'
type ResourceType =
  | 'PRODUCT_UPLOAD'
  | 'AI_TAGGING_CALL'
  | 'IMAGE_CROP'
  | 'BG_REMOVAL'
  | 'API_REQUEST'
  | 'STUDIO_SHOOT'
  | 'AI_VIDEO'

type ResourcePack = {
  id: string
  resource_type: ResourceType
  label: string
  unit_label: string
  pack_size: number
  price_paise: number
  plans: Plan[]
  is_active: boolean
  sort_order: number
}

const PLANS: Plan[] = ['STARTER', 'GROWTH', 'PRO']
const RESOURCE_TYPES: { value: ResourceType; label: string }[] = [
  { value: 'PRODUCT_UPLOAD', label: 'Product Upload' },
  { value: 'AI_TAGGING_CALL', label: 'AI Tagging' },
  { value: 'IMAGE_CROP', label: 'Image Crop' },
  { value: 'BG_REMOVAL', label: 'Bg Removal' },
  { value: 'API_REQUEST', label: 'API Request' },
  { value: 'STUDIO_SHOOT', label: 'Studio Shoot' },
  { value: 'AI_VIDEO', label: 'AI Video (promo clips)' },
]
const resourceLabel = (r: ResourceType) => RESOURCE_TYPES.find((x) => x.value === r)?.label ?? r

// Rupees as strings while editing — paise only at the API boundary.
const paiseToRupees = (paise: number) => String(paise / 100)
const rupeesToPaise = (rupees: string) => Math.round(Number(rupees) * 100)
const formatINR = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`

type FormState = {
  resource_type: ResourceType
  label: string
  unit_label: string
  pack_size: string
  price: string // rupees string
  plans: Plan[]
  is_active: boolean
  sort_order: string
}

const emptyForm: FormState = {
  resource_type: 'AI_VIDEO',
  label: '',
  unit_label: 'videos',
  pack_size: '',
  price: '',
  plans: [],
  is_active: true,
  sort_order: '0',
}

const formToPayload = (f: FormState) => ({
  resource_type: f.resource_type,
  label: f.label.trim(),
  unit_label: f.unit_label.trim(),
  pack_size: Number(f.pack_size),
  price_paise: rupeesToPaise(f.price),
  plans: f.plans,
  is_active: f.is_active,
  sort_order: Number(f.sort_order || 0),
})

export default function ResourcePacksPage() {
  const [rows, setRows] = useState<ResourcePack[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const res = await fetch(`${API_URL}/v1/admin/resource-packs`, adminGetOptions())
    const json = await res.json()
    setRows(json.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const patch = (p: Partial<FormState>) => setForm((prev) => ({ ...prev, ...p }))

  const startEdit = (row: ResourcePack) => {
    setEditingId(row.id)
    setForm({
      resource_type: row.resource_type,
      label: row.label,
      unit_label: row.unit_label,
      pack_size: String(row.pack_size),
      price: paiseToRupees(row.price_paise),
      plans: row.plans,
      is_active: row.is_active,
      sort_order: String(row.sort_order),
    })
    setStatus('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setForm(emptyForm)
    setStatus('')
  }

  const validate = (): string | null => {
    if (!form.label.trim()) return 'Enter a label (e.g. "20 promo videos")'
    if (!form.unit_label.trim()) return 'Enter a unit label (e.g. "videos")'
    if (!form.pack_size || Number(form.pack_size) < 1) return 'Enter a pack size ≥ 1'
    if (form.price === '' || Number.isNaN(Number(form.price)) || Number(form.price) < 0)
      return 'Enter a price in ₹'
    return null
  }

  const save = async () => {
    const err = validate()
    if (err) {
      setStatus(`❌ ${err}`)
      return
    }
    setSaving(true)
    setStatus('')
    try {
      const payload = formToPayload(form)
      const res = editingId
        ? await fetch(`${API_URL}/v1/admin/resource-packs/${editingId}`, {
            ...(await adminMutateOptions()),
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await fetch(`${API_URL}/v1/admin/resource-packs`, {
            ...(await adminMutateOptions()),
            method: 'POST',
            body: JSON.stringify(payload),
          })
      if (!res.ok) throw new Error('Save failed')
      await load()
      setStatus(editingId ? `✅ Pack updated` : `✅ Pack added — live on the dashboard config`)
      cancelEdit()
    } catch (e) {
      setStatus(`❌ ${e instanceof Error ? e.message : 'Save failed'}`)
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (row: ResourcePack) => {
    try {
      const res = await fetch(`${API_URL}/v1/admin/resource-packs/${row.id}`, {
        ...(await adminMutateOptions()),
        method: 'PATCH',
        body: JSON.stringify({ is_active: !row.is_active }),
      })
      if (!res.ok) throw new Error('Toggle failed')
      setStatus(`✅ Pack ${row.is_active ? 'deactivated' : 'activated'}`)
      await load()
    } catch (e) {
      setStatus(`❌ ${e instanceof Error ? e.message : 'Toggle failed'}`)
    }
  }

  const remove = async (row: ResourcePack) => {
    if (!window.confirm(`Delete pack "${row.label}"? Past purchases are unaffected.`)) return
    try {
      const res = await fetch(`${API_URL}/v1/admin/resource-packs/${row.id}`, {
        ...(await adminMutateOptions()),
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Delete failed')
      setStatus(`✅ Pack deleted`)
      if (editingId === row.id) cancelEdit()
      await load()
    } catch (e) {
      setStatus(`❌ ${e instanceof Error ? e.message : 'Delete failed'}`)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-cyan-500" />
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-6xl">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Addon Packs</h1>
          <Layers size={20} className="text-cyan-500" />
        </div>
        <p className="text-sm text-gray-500">
          Admin-managed overage packs (F-034). You add, approve, price and assign packs per plan — nothing is
          hardcoded. Retailers buy what you publish here.
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

      {/* ── Add / Edit form ───────────────────────────────────────── */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {editingId ? <Pencil size={16} className="text-cyan-500" /> : <Plus size={16} className="text-cyan-500" />}
            <h2 className="text-sm font-semibold text-gray-900">{editingId ? 'Edit pack' : 'Add a pack'}</h2>
          </div>
          {editingId && (
            <button onClick={cancelEdit} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
              <X size={12} /> Cancel
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Resource</label>
            <select
              value={form.resource_type}
              onChange={(e) => patch({ resource_type: e.target.value as ResourceType })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            >
              {RESOURCE_TYPES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Label (shown at checkout)</label>
            <input
              value={form.label}
              onChange={(e) => patch({ label: e.target.value })}
              placeholder="20 promo videos"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Pack size</label>
            <input
              type="number"
              min={1}
              value={form.pack_size}
              onChange={(e) => patch({ pack_size: e.target.value })}
              placeholder="20"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Unit label</label>
            <input
              value={form.unit_label}
              onChange={(e) => patch({ unit_label: e.target.value })}
              placeholder="videos"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Price (₹)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.price}
              onChange={(e) => patch({ price: e.target.value })}
              placeholder="599"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Sort order</label>
            <input
              type="number"
              min={0}
              value={form.sort_order}
              onChange={(e) => patch({ sort_order: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-gray-500">Assign to plans</span>
            </div>
            <p className="text-[11px] text-gray-400 mb-1">None checked = every plan can buy</p>
            <div className="flex gap-4">
              {PLANS.map((p) => (
                <label key={p} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.plans.includes(p)}
                    onChange={(e) =>
                      patch({
                        plans: e.target.checked
                          ? [...form.plans, p]
                          : form.plans.filter((x) => x !== p),
                      })
                    }
                    className="accent-cyan-600"
                  />
                  {p}
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => patch({ is_active: e.target.checked })}
              className="accent-cyan-600"
            />
            Active (approved — visible at checkout)
          </label>

          <button
            onClick={save}
            disabled={saving}
            className="ml-auto inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 rounded-lg transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {editingId ? 'Save changes' : 'Add pack'}
          </button>
        </div>
      </div>

      {/* ── Packs table ──────────────────────────────────────────── */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Resource</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Pack</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Price</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Plans</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-400">
                  No packs configured yet — add one above. Packs appear at retailer checkout once active.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-gray-50">
                <td className="px-3 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">
                  {resourceLabel(row.resource_type)}
                </td>
                <td className="px-3 py-3">
                  <div className="text-gray-800 font-medium">{row.label}</div>
                  <div className="text-xs text-gray-400">{row.pack_size} {row.unit_label}</div>
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-gray-700">{formatINR(row.price_paise)}</td>
                <td className="px-3 py-3">
                  {row.plans.length === 0 ? (
                    <span className="text-xs text-gray-400">All plans</span>
                  ) : (
                    <span className="flex gap-1">
                      {row.plans.map((p) => (
                        <span key={p} className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-cyan-50 text-cyan-700">
                          {p}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <button
                    onClick={() => toggleActive(row)}
                    className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full border transition-colors ${
                      row.is_active
                        ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                        : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    <Power size={11} />
                    {row.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => startEdit(row)}
                      className="p-1.5 text-gray-400 hover:text-cyan-600 transition-colors"
                      aria-label={`Edit ${row.label}`}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => remove(row)}
                      className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                      aria-label={`Delete ${row.label}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  )
}
