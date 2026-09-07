'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Tags, Save, Loader2, Plus, Trash2, Link2 } from 'lucide-react'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type RelatedRef = { id: string; name: string; slug: string }

type CategoryRow = {
  id: string
  name: string
  slug: string
  sort_order: number
  is_active: boolean
  design_count: number
  related: RelatedRef[]
}

type CategoryPatch = {
  id: string
  name: string
  sort_order: number
  is_active: boolean
}

export default function SuitsDesignCategoriesPage() {
  const [rows, setRows] = useState<CategoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [newName, setNewName] = useState('')
  const [newSort, setNewSort] = useState('')
  const [drafts, setDrafts] = useState<Record<string, CategoryPatch>>({})

  const load = async () => {
    const res = await fetch(`${API_URL}/v1/admin/showcase-design-categories`, adminGetOptions())
    const json = await res.json()
    setRows(json.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  // Silent refetch after any successful write keeps chips + counts in sync
  // without flashing the whole-page loader.
  const quietReload = async () => {
    const res = await fetch(`${API_URL}/v1/admin/showcase-design-categories`, adminGetOptions())
    const json = await res.json()
    setRows(json.data ?? [])
    setDrafts({})
  }

  const draft = (row: CategoryRow): CategoryPatch => drafts[row.id] ?? { ...row }

  const patchDraft = (id: string, patch: Partial<CategoryPatch>) =>
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? rows.find((r) => r.id === id)!), ...patch },
    }))

  const save = async (id: string) => {
    const d = drafts[id]
    if (!d) return // untouched row — nothing to persist
    setStatus('')
    try {
      const res = await fetch(`${API_URL}/v1/admin/showcase-design-categories/${id}`, {
        ...(await adminMutateOptions()),
        method: 'PATCH',
        body: JSON.stringify({ name: d.name.trim(), sort_order: d.sort_order, is_active: d.is_active }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error?.message ?? `Save failed (HTTP ${res.status})`)
      }
      await quietReload()
      setStatus(`✅ "${d.name.trim()}" saved`)
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Save failed'}`)
    }
  }

  const toggleActive = async (row: CategoryRow) => {
    // Flip optimistically, then persist + let the server truth reload.
    patchDraft(row.id, { is_active: !row.is_active })
    setStatus('')
    try {
      const res = await fetch(`${API_URL}/v1/admin/showcase-design-categories/${row.id}`, {
        ...(await adminMutateOptions()),
        method: 'PATCH',
        body: JSON.stringify({ is_active: !row.is_active }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error?.message ?? `Update failed (HTTP ${res.status})`)
      }
      await quietReload()
    } catch (err) {
      patchDraft(row.id, { is_active: row.is_active })
      setStatus(`❌ ${err instanceof Error ? err.message : 'Update failed'}`)
    }
  }

  const saveRelated = async (id: string, relatedIds: string[]) => {
    setStatus('')
    try {
      const res = await fetch(`${API_URL}/v1/admin/showcase-design-categories/${id}/related`, {
        ...(await adminMutateOptions()),
        method: 'PUT',
        body: JSON.stringify({ related_ids: relatedIds }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error?.message ?? `Save failed (HTTP ${res.status})`)
      }
      await quietReload()
      const name = rows.find((r) => r.id === id)?.name ?? 'Category'
      setStatus(`✅ "${name}" related set saved`)
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Save failed'}`)
    }
  }

  const remove = async (row: CategoryRow) => {
    // The API refuses while designs sit in the category (FK RESTRICT) — the
    // UI disables the button then, so this confirm only fires when it can go.
    if (!confirm(`Delete "${row.name}"? This cannot be undone.`)) return
    const res = await fetch(`${API_URL}/v1/admin/showcase-design-categories/${row.id}`, {
      ...(await adminMutateOptions()),
      method: 'DELETE',
      // adminMutateOptions() sets Content-Type: application/json — Fastify then
      // 500s on an empty body ("body must be object"). Send an empty object.
      body: '{}',
    })
    if (!res.ok) {
      const json = await res.json().catch(() => null)
      setStatus(`❌ ${json?.error?.message ?? `Delete failed (HTTP ${res.status})`}`)
      return
    }
    setRows((prev) => prev.filter((c) => c.id !== row.id))
    setStatus(`✅ "${row.name}" deleted`)
  }

  const create = async () => {
    const name = newName.trim()
    if (!name) {
      setStatus('❌ Name is required')
      return
    }
    setStatus('')
    try {
      const res = await fetch(`${API_URL}/v1/admin/showcase-design-categories`, {
        ...(await adminMutateOptions()),
        method: 'POST',
        body: JSON.stringify({
          name,
          ...(newSort ? { sort_order: Number(newSort) } : {}),
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error?.message ?? 'Create failed')
      }
      setNewName('')
      setNewSort('')
      await quietReload()
      setStatus(`✅ "${name}" added — pick its related categories below`)
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Create failed'}`)
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
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-5xl">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Suits Design Categories</h1>
          <Tags size={20} className="text-cyan-500" />
        </div>
        <p className="text-sm text-gray-500">
          The category list behind the Suits Designs strips — and the rows that make
          &ldquo;browse Sarees → also see Blouse designs&rdquo; work. A product whose category is{' '}
          <span className="font-medium">Saree</span> shows designs from every category ticked as its{' '}
          <span className="font-medium">related</span> set (Saree itself is always included). Links are
          stored as DB rows, not code — a new relation ships the moment you save it here.
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

      {/* ─── Add-category row ─────────────────────────────────────── */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4 flex flex-wrap items-end gap-3">
        <div className="w-24">
          <label htmlFor="new-cat-sort" className="block text-xs font-medium text-gray-500 mb-1.5">
            Order
          </label>
          <input
            id="new-cat-sort"
            type="number"
            value={newSort}
            placeholder={String(rows.length)}
            onChange={(e) => setNewSort(e.target.value)}
            className="w-full px-2 py-2 text-sm border border-dashed border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
          />
        </div>
        <div className="flex-1 min-w-[220px]">
          <label htmlFor="new-cat-name" className="block text-xs font-medium text-gray-500 mb-1.5">
            New category name <span className="text-red-500">*</span>
          </label>
          <input
            id="new-cat-name"
            value={newName}
            placeholder="e.g. Lehenga"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void create()}
            className="w-full px-3 py-2 text-sm border border-dashed border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
          />
        </div>
        <button
          onClick={create}
          className="flex items-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-xl transition-colors"
        >
          <Plus size={16} />
          Add category
        </button>
      </div>

      {/* ─── Category rows ────────────────────────────────────────── */}
      <div className="space-y-3">
        {rows.map((row) => {
          const d = draft(row)
          const slugDirty = d.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') !== row.slug
          return (
            <div key={row.id} className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 p-4">
                <input
                  type="number"
                  value={d.sort_order}
                  onChange={(e) => patchDraft(row.id, { sort_order: Number(e.target.value) })}
                  aria-label={`Order for ${row.name}`}
                  className="w-20 px-2 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                />
                <input
                  value={d.name}
                  onChange={(e) => patchDraft(row.id, { name: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && drafts[row.id] && void save(row.id)}
                  aria-label={`Name for ${row.name}`}
                  className="flex-1 min-w-[180px] px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                />
                <code className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1.5">
                  /{row.slug}
                  {slugDirty && (
                    <span className="text-amber-500 ml-1" title="Slug re-derives from the name on save">
                      *
                    </span>
                  )}
                </code>
                <button
                  onClick={() => toggleActive(row)}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full transition-all ${
                    row.is_active
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${row.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                  {row.is_active ? 'Active' : 'Off'}
                </button>
                <span className="text-[11px] text-gray-400 tabular-nums">
                  {row.design_count} design{row.design_count === 1 ? '' : 's'}
                </span>
                <div className="flex items-center gap-1 ml-auto">
                  {drafts[row.id] && (
                    <button
                      onClick={() => save(row.id)}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-xl transition-colors"
                    >
                      <Save size={13} />
                      Save
                    </button>
                  )}
                  <button
                    onClick={() => remove(row)}
                    disabled={row.design_count > 0}
                    title={
                      row.design_count > 0
                        ? 'This category still has designs — deactivate it instead'
                        : `Delete ${row.name}`
                    }
                    className="p-2 text-gray-400 hover:text-red-600 disabled:text-gray-200 disabled:cursor-not-allowed transition-colors"
                    aria-label={`Delete ${row.name}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Related multi-select */}
              <div className="flex flex-wrap items-center gap-2 px-4 pb-4 pt-1">
                <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide mr-1">
                  <Link2 size={12} />
                  Shows designs from
                </span>
                <RelatedPicker
                  key={`${row.id}:${row.related
                    .map((r) => r.id)
                    .sort()
                    .join(',')}`}
                  row={row}
                  all={rows}
                  onSave={saveRelated}
                />
              </div>
            </div>
          )
        })}

        {rows.length === 0 && (
          <p className="text-sm text-gray-400 py-8 text-center bg-white/60 rounded-2xl border border-dashed border-gray-200">
            No categories yet — add one above. The product strip + browse page read from this list.
          </p>
        )}
      </div>
    </motion.div>
  )
}

/** Chip multi-select for one category's related set. Self is always implied
 * (the resolver union always includes the category itself) so it renders as
 * a locked chip rather than a toggleable one. */
function RelatedPicker({
  row,
  all,
  onSave,
}: {
  row: CategoryRow
  all: CategoryRow[]
  onSave: (id: string, relatedIds: string[]) => Promise<void>
}) {
  // Local copy of the related ids; the parent reloads server truth after save.
  const [ids, setIds] = useState<string[]>(row.related.map((r) => r.id))
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify([...ids].sort()) !== JSON.stringify(row.related.map((r) => r.id).sort())

  const others = all.filter((c) => c.id !== row.id).sort((a, b) => a.sort_order - b.sort_order)

  const toggle = (id: string) =>
    setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  return (
    <>
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full bg-violet-100 text-violet-700">
        <Link2 size={10} />
        {row.name} (always)
      </span>
      {others.map((c) => {
        const on = ids.includes(c.id)
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => toggle(c.id)}
            disabled={saving}
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-all disabled:opacity-60 ${
              on
                ? 'bg-cyan-600 text-white hover:bg-cyan-500'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
            aria-pressed={on}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${on ? 'bg-white/80' : c.is_active ? 'bg-green-400' : 'bg-gray-300'}`}
            />
            {c.name}
          </button>
        )
      })}
      {dirty && (
        <button
          onClick={async () => {
            setSaving(true)
            await onSave(row.id, ids)
            setSaving(false)
          }}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-full transition-colors disabled:opacity-60"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Save links
        </button>
      )}
    </>
  )
}
