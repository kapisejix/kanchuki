'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Image as ImageIcon, Upload, Loader2, Eye, EyeOff, Trash2, Sparkles } from 'lucide-react'
import Image from 'next/image'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type DesignOwner = { type: 'global' } | { type: 'retailer'; id: string; shop_name: string | null }

type DesignRow = {
  id: string
  name: string | null
  image_url: string
  category_id: string
  category_slug: string
  category_name: string | null
  is_active: boolean
  sort_order: number
  owner: DesignOwner
  created_at: string
}

type DesignCategory = {
  id: string
  name: string
  slug: string
  is_active: boolean
  sort_order: number
  design_count: number
}

type Scope = 'all' | 'global' | 'retailer'

type RetailerOwner = { id: string; shop_name: string | null; design_count: number }

export default function SuitsDesignsPage() {
  const [rows, setRows] = useState<DesignRow[]>([])
  const [categories, setCategories] = useState<DesignCategory[]>([])
  const [scope, setScope] = useState<Scope>('all')
  // Owner filter — only meaningful in the retailer scope. Options resolve
  // server-side (GET /owners: distinct retailers owning ≥1 design); null =
  // every retailer.
  const [owners, setOwners] = useState<RetailerOwner[]>([])
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Upload form state — a category is REQUIRED (every design belongs to one);
  // the name is optional and stays blank → row.name = null.
  const [selectedCategory, setSelectedCategory] = useState('')
  const [designName, setDesignName] = useState('')

  const load = async (activeScope: Scope, activeOwner: string | null) => {
    const params = new URLSearchParams()
    if (activeScope !== 'all') params.set('scope', activeScope)
    if (activeScope === 'retailer' && activeOwner) params.set('retailer_id', activeOwner)
    const qs = params.toString()
    const res = await fetch(
      `${API_URL}/v1/admin/showcase-designs${qs ? `?${qs}` : ''}`,
      adminGetOptions(),
    )
    const json = await res.json()
    setRows(json.data ?? [])
    setLoading(false)
  }

  // The owner dropdown is server-resolved — fetch the distinct retailer list
  // once so the filter options never depend on which rows are loaded.
  useEffect(() => {
    fetch(`${API_URL}/v1/admin/showcase-designs/owners`, adminGetOptions())
      .then((res) => res.json())
      .then((json) => setOwners(json.data ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    load(scope, ownerId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, ownerId])

  // Categories drive the upload picker (required field) + row labels.
  useEffect(() => {
    fetch(`${API_URL}/v1/admin/showcase-design-categories`, adminGetOptions())
      .then((res) => res.json())
      .then((json) => {
        const cats: DesignCategory[] = json.data ?? []
        setCategories(cats)
        // Pre-select the first ACTIVE category so the upload button is never
        // dead on arrival — inactive categories stay pickable for curation.
        if (!selectedCategory && cats.length > 0) {
          setSelectedCategory((cats.find((c) => c.is_active) ?? cats[0])!.id)
        }
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (!selectedCategory) {
      setStatus('❌ Pick a category first — every design needs one')
      return
    }

    setUploading(true)
    setStatus('')
    try {
      const presign = await fetch(`${API_URL}/v1/admin/showcase-designs/upload-url`, {
        ...(await adminMutateOptions()),
        method: 'POST',
        body: JSON.stringify({ content_type: file.type, filename: file.name }),
      })
      if (!presign.ok) throw new Error('Failed to get upload URL')
      const { data } = await presign.json()

      const put = await fetch(data.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!put.ok) throw new Error('Upload to storage failed')

      // Server watermarks the raw upload (showcase-watermark.ts) — the admin
      // only ever sends the raw R2 key + category; owner defaults to global.
      const create = await fetch(`${API_URL}/v1/admin/showcase-designs`, {
        ...(await adminMutateOptions()),
        method: 'POST',
        body: JSON.stringify({
          category_id: selectedCategory,
          ...(designName.trim() ? { name: designName.trim() } : {}),
          raw_r2_key: data.r2_key,
        }),
      })
      if (!create.ok) {
        const detail = await create.text().catch(() => '')
        throw new Error(`Failed to register design (HTTP ${create.status})${detail ? ` — ${detail.slice(0, 160)}` : ''}`)
      }
      const { data: created } = await create.json()

      setDesignName('')
      setStatus(`✅ Design ${created?.name ? `"${created.name}" ` : ''}added (Global)`)
      await load(scope, ownerId)
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Upload failed'}`)
    } finally {
      setUploading(false)
    }
  }

  const deleteRow = async (row: DesignRow) => {
    const who = row.owner.type === 'global' ? 'this global design' : `this retailer design${row.owner.shop_name ? ` (${row.owner.shop_name})` : ''}`
    if (!confirm(`Delete ${who}? Its watermarked photo is removed from R2 too.`)) return
    const res = await fetch(`${API_URL}/v1/admin/showcase-designs/${row.id}`, {
      ...(await adminMutateOptions()),
      method: 'DELETE',
      // adminMutateOptions() sets Content-Type: application/json — Fastify then
      // 500s on an empty body ("body must be object"). Send an empty object.
      body: '{}',
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      setStatus(`❌ Delete failed (HTTP ${res.status})${detail ? ` — ${detail.slice(0, 200)}` : ''}`)
      return
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id))
    setStatus(`✅ ${row.name ? `"${row.name}" ` : 'Design '}deleted`)
  }

  const toggleActive = async (row: DesignRow) => {
    // Optimistic flip; revert on failure.
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: !r.is_active } : r)))
    const res = await fetch(`${API_URL}/v1/admin/showcase-designs/${row.id}`, {
      ...(await adminMutateOptions()),
      method: 'PATCH',
      body: JSON.stringify({ is_active: !row.is_active }),
    })
    if (!res.ok) setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: row.is_active } : r)))
  }

  const categoryLabel = (row: DesignRow) =>
    row.category_name ?? row.category_slug.replace(/-/g, ' ')

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
          <h1 className="text-2xl font-bold text-gray-900">Suits Designs</h1>
          <Sparkles size={20} className="text-cyan-500" />
        </div>
        <p className="text-sm text-gray-500">
          Suits-design library shown on storefront product pages under &ldquo;Related
          products&rdquo;. Uploads default to <span className="font-medium">Global</span> (every store) and are
          watermarked server-side. The retailer scope lets you moderate rows
          stores published themselves — deactivate hides a design everywhere.
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

      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[220px]">
            <label htmlFor="design-category" className="block text-xs font-medium text-gray-500 mb-1.5">
              Category <span className="text-red-500">*</span>
            </label>
            <select
              id="design-category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            >
              {categories.length === 0 && <option value="">No categories — seed migration first</option>}
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.is_active ? 'active' : 'inactive'})
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="design-name" className="block text-xs font-medium text-gray-500 mb-1.5">
              Name <span className="text-gray-400">(optional)</span>
            </label>
            <input
              id="design-name"
              value={designName}
              onChange={(e) => setDesignName(e.target.value)}
              placeholder="e.g. Anarkali Suit — Maroon"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-white text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            />
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || categories.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-xl disabled:opacity-60 transition-colors"
            >
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {uploading ? 'Watermarking…' : 'Upload design'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white/80 border border-gray-200/80 rounded-xl p-1">
            {(
              [
                { key: 'all', label: 'All' },
                { key: 'global', label: 'Global' },
                { key: 'retailer', label: 'Retailer' },
              ] as { key: Scope; label: string }[]
            ).map((opt) => (
              <button
                key={opt.key}
                onClick={() => {
                  setScope(opt.key)
                  // Owner filter only applies inside the retailer scope —
                  // leaving it (or switching retailer→retailer after a stale
                  // pick) must not silently keep narrowing.
                  if (opt.key !== 'retailer') setOwnerId(null)
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  scope === opt.key ? 'bg-cyan-600 text-white' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {scope === 'retailer' && (
            <div className="flex items-center gap-1.5 bg-white/80 border border-gray-200/80 rounded-xl px-2.5 py-1.5">
              <label htmlFor="owner-filter" className="text-xs font-semibold text-gray-500">
                Owner
              </label>
              <select
                id="owner-filter"
                value={ownerId ?? ''}
                onChange={(e) => setOwnerId(e.target.value || null)}
                className="text-xs border-0 bg-transparent text-gray-700 focus:outline-none focus:ring-0 max-w-[160px]"
              >
                <option value="">All retailers</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.shop_name ?? 'Unnamed store'}
                    {o.design_count > 0 ? ` (${o.design_count})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <span className="text-xs text-gray-400">
          {rows.length} design{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {rows.map((row) => (
          <div
            key={row.id}
            className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setPreview(row.image_url)}
              className="aspect-[3/4] bg-gray-100 relative block w-full cursor-zoom-in"
              aria-label={`View ${row.name ?? 'design'} full size`}
            >
              <Image
                src={row.image_url}
                alt={row.name ?? 'Suits design'}
                fill
                className={`object-cover ${row.is_active ? '' : 'opacity-40'}`}
              />
              {!row.is_active && (
                <span className="absolute top-2 left-2 text-[9px] font-bold bg-gray-900/80 text-white px-1.5 py-0.5 rounded-md">
                  HIDDEN
                </span>
              )}
            </button>
            <div className="p-3 flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-gray-700 truncate" title={row.name ?? undefined}>
                  {row.name ?? '(unnamed)'}
                </span>
                <div className="flex items-center shrink-0">
                  <button
                    onClick={() => toggleActive(row)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      row.is_active ? 'text-cyan-600 hover:bg-cyan-50' : 'text-gray-400 hover:bg-gray-50'
                    }`}
                    aria-label={row.is_active ? `Deactivate ${row.name ?? 'design'}` : `Activate ${row.name ?? 'design'}`}
                  >
                    {row.is_active ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button
                    onClick={() => deleteRow(row)}
                    className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    aria-label={`Delete ${row.name ?? 'design'}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500 truncate max-w-full">
                  {categoryLabel(row)}
                </span>
                {row.owner.type === 'global' ? (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-700">
                    Global
                  </span>
                ) : (
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 truncate max-w-[90px]"
                    title={row.owner.shop_name ?? undefined}
                  >
                    {row.owner.shop_name ?? 'Retailer'}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="col-span-full text-sm text-gray-400 py-8 text-center">
            {scope === 'retailer'
              ? ownerId
                ? 'No designs from this retailer.'
                : 'No retailer-published designs yet.'
              : scope === 'global'
                ? 'No global designs yet — upload one above.'
                : 'No designs yet — upload one above.'}
          </p>
        )}
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 cursor-zoom-out"
          onClick={() => setPreview(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Design full size"
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </motion.div>
  )
}
