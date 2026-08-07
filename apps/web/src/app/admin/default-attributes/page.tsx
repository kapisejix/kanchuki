'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Tags, Save, Loader2, Plus, Trash2, Sparkles } from 'lucide-react'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type Kind = 'STYLE' | 'OCCASION' | 'FABRIC'
const KINDS: { value: Kind; label: string }[] = [
  { value: 'STYLE', label: 'Style' },
  { value: 'OCCASION', label: 'Occasion' },
  { value: 'FABRIC', label: 'Fabric' },
]

type DefaultAttribute = {
  id: string
  kind: Kind
  name: string
  sort_order: number
  is_active: boolean
}

export default function DefaultAttributesPage() {
  const [kind, setKind] = useState<Kind>('STYLE')
  const [attributes, setAttributes] = useState<DefaultAttribute[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [newName, setNewName] = useState('')
  const [newSort, setNewSort] = useState('')

  const load = async (k: Kind) => {
    setLoading(true)
    const res = await fetch(`${API_URL}/v1/admin/default-attributes?kind=${k}`, adminGetOptions())
    const json = await res.json()
    setAttributes(json.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load(kind)
  }, [kind])

  const update = (id: string, patch: Partial<DefaultAttribute>) => {
    setAttributes((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  const save = async (attr: DefaultAttribute) => {
    setSaving(attr.id)
    setStatus('')
    try {
      const res = await fetch(`${API_URL}/v1/admin/default-attributes/${attr.id}`, {
        ...(await adminMutateOptions()),
        method: 'PATCH',
        body: JSON.stringify({ name: attr.name, sort_order: attr.sort_order, is_active: attr.is_active }),
      })
      if (!res.ok) throw new Error('Save failed')
      setStatus('✅ Template saved — new signups get this value')
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Save failed'}`)
    } finally {
      setSaving(null)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Remove this value from the template? Existing retailers keep their copies.')) return
    await fetch(`${API_URL}/v1/admin/default-attributes/${id}`, {
      ...(await adminMutateOptions()),
      method: 'DELETE',
    })
    setAttributes((prev) => prev.filter((a) => a.id !== id))
  }

  const create = async () => {
    if (!newName.trim()) {
      setStatus('❌ Name is required')
      return
    }
    setSaving('new')
    try {
      const res = await fetch(`${API_URL}/v1/admin/default-attributes`, {
        ...(await adminMutateOptions()),
        method: 'POST',
        body: JSON.stringify({
          kind,
          name: newName.trim(),
          sort_order: newSort ? Number(newSort) : attributes.length,
        }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json?.error?.message ?? 'Create failed')
      }
      const json = await res.json()
      setAttributes((prev) => [...prev, json.data].sort((a, b) => a.sort_order - b.sort_order))
      setNewName('')
      setNewSort('')
      setStatus('✅ Template value added')
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Create failed'}`)
    } finally {
      setSaving(null)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-4xl">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Default Attributes</h1>
          <Tags size={20} className="text-cyan-500" />
        </div>
        <p className="text-sm text-gray-500">
          Global template for the Style/Occasion/Fabric taxonomy, copied into every new retailer&apos;s own
          list at signup (mirrors Default Categories). AI tagging writes its raw per-photo guesses directly
          into a product&apos;s Style/Occasion/Fabric fields — the product-add screen offers the retailer&apos;s own
          list (seeded defaults + custom) as select/multi-select options. Template edits are forward-only:
          existing retailers keep their current copies. Ladies-only today — a `segment` column on this table
          is ready for Men/Kids later with no schema change.
        </p>
      </div>

      <div className="flex items-start gap-2 bg-cyan-50/80 border border-cyan-200/80 rounded-xl px-4 py-3 text-xs text-cyan-800">
        <Sparkles size={14} className="shrink-0 mt-0.5" />
        <span>
          Category has its own dedicated template (Default Categories) since it drives a real
          <code className="mx-1 px-1 bg-cyan-100 rounded">category_id</code>
          foreign key. Style/Occasion/Fabric are soft-matched name lists instead — no FK, same
          convention Occasion already used before this taxonomy existed.
        </span>
      </div>

      <div className="flex gap-2">
        {KINDS.map((k) => (
          <button
            key={k.value}
            onClick={() => setKind(k.value)}
            className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
              kind === k.value
                ? 'bg-cyan-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {k.label}
          </button>
        ))}
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

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={24} className="animate-spin text-cyan-500" />
        </div>
      ) : (
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Order</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Name</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Active</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {attributes.map((attr) => (
                <tr key={attr.id} className="border-b border-gray-50">
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={attr.sort_order}
                      onChange={(e) => update(attr.id, { sort_order: Number(e.target.value) })}
                      className="w-20 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={attr.name}
                      onChange={(e) => update(attr.id, { name: e.target.value })}
                      className="w-full min-w-[180px] px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => {
                        update(attr.id, { is_active: !attr.is_active })
                        void save({ ...attr, is_active: !attr.is_active })
                      }}
                      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-all cursor-pointer ${
                        attr.is_active
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${attr.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                      {attr.is_active ? 'Active' : 'Off'}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => save(attr)}
                        disabled={saving === attr.id}
                        className="p-1.5 text-gray-400 hover:text-cyan-600 disabled:opacity-50 transition-colors"
                        aria-label="Save attribute"
                      >
                        {saving === attr.id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      </button>
                      <button
                        onClick={() => remove(attr.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                        aria-label="Delete attribute"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              <tr>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    value={newSort}
                    placeholder="order"
                    onChange={(e) => setNewSort(e.target.value)}
                    className="w-20 px-2 py-1.5 text-sm border border-dashed border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    value={newName}
                    placeholder={`New ${kind.toLowerCase()} value`}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full min-w-[180px] px-2 py-1.5 text-sm border border-dashed border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                </td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2">
                  <button
                    onClick={create}
                    disabled={saving === 'new'}
                    className="p-1.5 text-gray-400 hover:text-cyan-600 disabled:opacity-50 transition-colors"
                    aria-label="Add attribute"
                  >
                    {saving === 'new' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  )
}
