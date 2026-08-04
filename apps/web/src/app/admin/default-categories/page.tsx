'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { LayoutGrid, Save, Loader2, Plus, Trash2, Sparkles } from 'lucide-react'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type DefaultCategory = {
  id: string
  name: string
  sort_order: number
  is_active: boolean
}

export default function DefaultCategoriesPage() {
  const [categories, setCategories] = useState<DefaultCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [newName, setNewName] = useState('')
  const [newSort, setNewSort] = useState('')

  const load = async () => {
    const res = await fetch(`${API_URL}/v1/admin/default-categories`, adminGetOptions())
    const json = await res.json()
    setCategories(json.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const update = (id: string, patch: Partial<DefaultCategory>) => {
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  const save = async (cat: DefaultCategory) => {
    setSaving(cat.id)
    setStatus('')
    try {
      const res = await fetch(`${API_URL}/v1/admin/default-categories/${cat.id}`, {
        ...(await adminMutateOptions()),
        method: 'PATCH',
        body: JSON.stringify({ name: cat.name, sort_order: cat.sort_order, is_active: cat.is_active }),
      })
      if (!res.ok) throw new Error('Save failed')
      setStatus('✅ Template saved — new signups get this category')
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Save failed'}`)
    } finally {
      setSaving(null)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Remove this category from the template? Existing retailers keep their copies.')) return
    await fetch(`${API_URL}/v1/admin/default-categories/${id}`, {
      ...(await adminMutateOptions()),
      method: 'DELETE',
    })
    setCategories((prev) => prev.filter((c) => c.id !== id))
  }

  const create = async () => {
    if (!newName.trim()) {
      setStatus('❌ Name is required')
      return
    }
    setSaving('new')
    try {
      const res = await fetch(`${API_URL}/v1/admin/default-categories`, {
        ...(await adminMutateOptions()),
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim(),
          sort_order: newSort ? Number(newSort) : categories.length,
        }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json?.error?.message ?? 'Create failed')
      }
      const json = await res.json()
      setCategories((prev) => [...prev, json.data].sort((a, b) => a.sort_order - b.sort_order))
      setNewName('')
      setNewSort('')
      setStatus('✅ Template category added')
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Create failed'}`)
    } finally {
      setSaving(null)
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
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-4xl">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Default Categories</h1>
          <LayoutGrid size={20} className="text-cyan-500" />
        </div>
        <p className="text-sm text-gray-500">
          F-024 — the global template copied into every new retailer&apos;s Shop-By-Categories at signup. AI
          tagging auto-assigns each product to the matching category in the retailer&apos;s own list (seeded
          defaults + their custom ones). Template edits are forward-only: existing retailers keep their
          current copies. &quot;New Arrivals&quot; and &quot;Sale&quot; are computed at query time, not here — a photo can&apos;t
          reveal stock age or discount status.
        </p>
      </div>

      <div className="flex items-start gap-2 bg-cyan-50/80 border border-cyan-200/80 rounded-xl px-4 py-3 text-xs text-cyan-800">
        <Sparkles size={14} className="shrink-0 mt-0.5" />
        <span>
          AI auto-assignment matches the tagger&apos;s free-text category (e.g. &quot;Saree&quot;) against the
          retailer&apos;s list case-insensitively. No match → the product stays uncategorized for manual
          assignment, exactly like before.
        </span>
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
            {categories.map((cat) => (
              <tr key={cat.id} className="border-b border-gray-50">
                <td className="px-3 py-2">
                  <input
                    type="number"
                    value={cat.sort_order}
                    onChange={(e) => update(cat.id, { sort_order: Number(e.target.value) })}
                    className="w-20 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    value={cat.name}
                    onChange={(e) => update(cat.id, { name: e.target.value })}
                    className="w-full min-w-[180px] px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => {
                      update(cat.id, { is_active: !cat.is_active })
                      void save({ ...cat, is_active: !cat.is_active })
                    }}
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-all cursor-pointer ${
                      cat.is_active
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${cat.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                    {cat.is_active ? 'Active' : 'Off'}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => save(cat)}
                      disabled={saving === cat.id}
                      className="p-1.5 text-gray-400 hover:text-cyan-600 disabled:opacity-50 transition-colors"
                      aria-label="Save category"
                    >
                      {saving === cat.id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    </button>
                    <button
                      onClick={() => remove(cat.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                      aria-label="Delete category"
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
                  placeholder="New category name"
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
                  aria-label="Add category"
                >
                  {saving === 'new' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </motion.div>
  )
}
