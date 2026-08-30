'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clapperboard, Save, Loader2, Trash2, Upload, ChevronDown, ChevronUp, Plus, Eye } from 'lucide-react'
import Image from 'next/image'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type StudioStyleRow = {
  id: string
  slug: string
  label: string
  description: string
  prompt: string
  tab: 'PRODUCT' | 'MODEL'
  status: 'DRAFT' | 'PUBLISHED' | 'HIDDEN'
  plans: string[]
  engine: string | null
  audience: string[]
  thumbnail_url: string | null
  thumbnail_r2_key: string | null
  sort_order: number
  usage_count: number
  created_at: string
}

const PLANS = ['STARTER', 'GROWTH', 'PRO'] as const
const ENGINES = ['flux_pro', 'imagen_3', 'imagen_3_fast', 'flux_schnell', 'bfl_kontext'] as const
const DEMOGRAPHICS = ['womens', 'mens', 'teen_girl', 'teen_boy', 'kids_girl', 'kids_boy'] as const
const DEMO_LABELS: Record<string, string> = {
  womens: 'Womens', mens: 'Mens', teen_girl: 'Teen girl', teen_boy: 'Teen boy',
  kids_girl: 'Kids girl', kids_boy: 'Kids boy',
}

// ─── Page ──────────────────────────────────────────────────────────────

export default function StudioStylesPage() {
  const [rows, setRows] = useState<StudioStyleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [newFormOpen, setNewFormOpen] = useState(false)
  const [lightbox, setLightbox] = useState<{ url: string; label: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/v1/admin/studio-styles`, adminGetOptions())
      const json = await res.json()
      setRows(json.data ?? [])
    } catch { setStatus('Failed to load studio styles') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const productRows = rows.filter((r) => r.tab === 'PRODUCT').sort((a, b) => a.sort_order - b.sort_order)
  const modelRows = rows.filter((r) => r.tab === 'MODEL').sort((a, b) => a.sort_order - b.sort_order)

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 size={24} className="animate-spin text-cyan-500" /></div>
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-6xl">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Studio Styles</h1>
          <Clapperboard size={20} className="text-fuchsia-500" />
        </div>
        <p className="text-sm text-gray-500">
          DB-backed AI Studio Shoot style catalog. Publish/hide/draft styles, assign to plan tiers,
          upload sample-output thumbnails. Retailers see only PUBLISHED styles matching their plan.
        </p>
      </div>

      {status && (
        <div className={`text-sm rounded-xl px-4 py-3 border ${
          status.startsWith('✅') ? 'bg-green-50/80 border-green-200 text-green-700'
            : 'bg-red-50/80 border-red-200 text-red-600'
        }`}>{status}</div>
      )}

      {/* New Style Form */}
      <NewStyleForm onCreated={(row) => { setRows((prev) => [row, ...prev]); setNewFormOpen(false); setStatus(`✅ "${row.label}" created`) }} setStatus={setStatus} open={newFormOpen} onToggle={() => setNewFormOpen(!newFormOpen)} />

      {/* Product Only Section */}
      <StyleSection title="Product Only" tab="PRODUCT" rows={productRows} setRows={setRows} setStatus={setStatus} setLightbox={setLightbox} />

      {/* Models Section */}
      <StyleSection title="Models" tab="MODEL" rows={modelRows} setRows={setRows} setStatus={setStatus} setLightbox={setLightbox} />

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 cursor-zoom-out" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox.url} alt={lightbox.label} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
        </div>
      )}
    </motion.div>
  )
}

// ─── Section ───────────────────────────────────────────────────────────

function StyleSection({ title, tab, rows, setRows, setStatus, setLightbox }: {
  title: string; tab: 'PRODUCT' | 'MODEL'
  rows: StudioStyleRow[]; setRows: React.Dispatch<React.SetStateAction<StudioStyleRow[]>>
  setStatus: (s: string) => void; setLightbox: (l: { url: string; label: string } | null) => void
}) {
  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <h2 className="text-sm font-bold text-gray-800">{title}</h2>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No {tab.toLowerCase()} styles yet.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {rows.map((row) => (
            <StyleRow key={row.id} row={row} setRows={setRows} setStatus={setStatus} setLightbox={setLightbox} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Row ───────────────────────────────────────────────────────────────

function StyleRow({ row, setRows, setStatus, setLightbox }: {
  row: StudioStyleRow
  setRows: React.Dispatch<React.SetStateAction<StudioStyleRow[]>>
  setStatus: (s: string) => void
  setLightbox: (l: { url: string; label: string } | null) => void
}) {
  const [edit, setEdit] = useState({
    label: row.label, description: row.description, prompt: row.prompt,
    status: row.status, plans: [...row.plans], engine: row.engine ?? '',
    audience: [...row.audience], sort_order: row.sort_order,
  })
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const hasChanges = edit.label !== row.label || edit.description !== row.description
    || edit.prompt !== row.prompt || edit.status !== row.status
    || JSON.stringify(edit.plans.sort()) !== JSON.stringify([...row.plans].sort())
    || edit.engine !== (row.engine ?? '')
    || JSON.stringify(edit.audience.sort()) !== JSON.stringify([...row.audience].sort())
    || edit.sort_order !== row.sort_order

  const save = async () => {
    setSaving(true); setStatus('')
    try {
      const diff: Record<string, unknown> = {}
      if (edit.label !== row.label) diff.label = edit.label
      if (edit.description !== row.description) diff.description = edit.description
      if (edit.prompt !== row.prompt) diff.prompt = edit.prompt
      if (edit.status !== row.status) diff.status = edit.status
      if (JSON.stringify(edit.plans.sort()) !== JSON.stringify([...row.plans].sort())) diff.plans = edit.plans
      if (edit.engine !== (row.engine ?? '')) diff.engine = edit.engine || null
      if (JSON.stringify(edit.audience.sort()) !== JSON.stringify([...row.audience].sort())) diff.audience = edit.audience
      if (edit.sort_order !== row.sort_order) diff.sort_order = edit.sort_order

      if (Object.keys(diff).length === 0) { setSaving(false); return }

      const res = await fetch(`${API_URL}/v1/admin/studio-styles/${row.id}`, {
        ...(await adminMutateOptions()), method: 'PATCH', body: JSON.stringify(diff),
      })
      if (!res.ok) throw new Error('Save failed')
      const { data } = await res.json()
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, ...data } : r))
      setStatus(`✅ "${edit.label}" saved`)
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Save failed'}`)
    } finally { setSaving(false) }
  }

  const deleteRow = async () => {
    if (!confirm(`Delete "${row.label}" (${row.slug})? This cannot be undone.`)) return
    try {
      const res = await fetch(`${API_URL}/v1/admin/studio-styles/${row.id}`, {
        ...(await adminMutateOptions()), method: 'DELETE', body: '{}',
      })
      if (!res.ok) throw new Error('Delete failed')
      setRows((prev) => prev.filter((r) => r.id !== row.id))
      setStatus(`✅ "${row.label}" deleted`)
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Delete failed'}`)
    }
  }

  const uploadThumbnail = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; e.target.value = ''
    try {
      const presign = await fetch(`${API_URL}/v1/admin/studio-styles/thumbnail-url`, {
        ...(await adminMutateOptions()), method: 'POST',
        body: JSON.stringify({ content_type: file.type, filename: file.name }),
      })
      if (!presign.ok) throw new Error('Failed to get upload URL')
      const { data } = await presign.json()
      const put = await fetch(data.upload_url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
      if (!put.ok) throw new Error('Upload to storage failed')
      const patchRes = await fetch(`${API_URL}/v1/admin/studio-styles/${row.id}`, {
        ...(await adminMutateOptions()), method: 'PATCH',
        body: JSON.stringify({ thumbnail_url: data.public_url, thumbnail_r2_key: data.r2_key }),
      })
      if (!patchRes.ok) throw new Error('Failed to save thumbnail')
      const { data: updated } = await patchRes.json()
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, thumbnail_url: updated.thumbnail_url, thumbnail_r2_key: updated.thumbnail_r2_key } : r))
      setStatus(`✅ Thumbnail uploaded for "${row.label}"`)
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Upload failed'}`)
    }
  }

  const togglePlan = (plan: string) => {
    setEdit((prev) => ({
      ...prev,
      plans: prev.plans.includes(plan) ? prev.plans.filter((p) => p !== plan) : [...prev.plans, plan],
    }))
  }

  const toggleDemo = (demo: string) => {
    setEdit((prev) => ({
      ...prev,
      audience: prev.audience.includes(demo) ? prev.audience.filter((d) => d !== demo) : [...prev.audience, demo],
    }))
  }

  return (
    <div className="px-5 py-4">
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={uploadThumbnail} />

      {/* Top row: thumbnail + label/slug + status + plans + engine + sort + save */}
      <div className="flex items-start gap-3">
        {/* Thumbnail */}
        <button type="button" onClick={() => row.thumbnail_url && setLightbox({ url: row.thumbnail_url, label: row.label })}
          className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0 cursor-zoom-in relative">
          {row.thumbnail_url ? (
            <Image src={row.thumbnail_url} alt={row.label} fill className="object-cover" unoptimized />
          ) : <Clapperboard size={16} className="text-gray-300" />}
        </button>

        {/* Label + slug */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <input value={edit.label} onChange={(e) => setEdit((p) => ({ ...p, label: e.target.value }))}
              className="text-sm font-bold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-cyan-400 outline-none px-0.5 py-0.5 w-full" />
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] font-mono text-gray-400">/{row.slug}</span>
            <span className="text-[10px] text-gray-300">·</span>
            <span className="text-[10px] text-gray-400">{row.usage_count} uses</span>
          </div>
        </div>

        {/* Status segmented */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden shrink-0">
          {(['DRAFT', 'PUBLISHED', 'HIDDEN'] as const).map((s) => (
            <button key={s} onClick={() => setEdit((p) => ({ ...p, status: s }))}
              className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                edit.status === s
                  ? s === 'PUBLISHED' ? 'bg-green-500 text-white' : s === 'HIDDEN' ? 'bg-amber-500 text-white' : 'bg-gray-600 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}>{s}</button>
          ))}
        </div>

        {/* Plan checkboxes */}
        <div className="flex gap-1.5 shrink-0">
          {PLANS.map((p) => (
            <label key={p} className="flex items-center gap-1 text-[10px] text-gray-600 cursor-pointer">
              <input type="checkbox" checked={edit.plans.includes(p)} onChange={() => togglePlan(p)}
                className="w-3 h-3 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500" />
              {p}
            </label>
          ))}
        </div>

        {/* Engine */}
        <select value={edit.engine} onChange={(e) => setEdit((p) => ({ ...p, engine: e.target.value }))}
          className="text-[10px] border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 shrink-0 w-28">
          <option value="">— default —</option>
          {ENGINES.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>

        {/* Sort order */}
        <input type="number" value={edit.sort_order} onChange={(e) => setEdit((p) => ({ ...p, sort_order: Number(e.target.value) }))}
          className="w-14 text-[10px] border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 text-center shrink-0" />

        {/* Save */}
        <button onClick={save} disabled={!hasChanges || saving}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold shrink-0 transition-colors ${
            hasChanges ? 'bg-cyan-600 hover:bg-cyan-500 text-white' : 'bg-gray-100 text-gray-400'
          } disabled:opacity-50`}>
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Save
        </button>

        {/* Expand / Thumbnail / Delete */}
        <button onClick={() => setExpanded(!expanded)} className="p-1.5 text-gray-400 hover:text-gray-600 shrink-0">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button onClick={() => fileRef.current?.click()} className="p-1.5 text-gray-400 hover:text-cyan-600 shrink-0" title="Upload thumbnail">
          <Upload size={14} />
        </button>
        <button onClick={deleteRow} className="p-1.5 text-gray-400 hover:text-red-600 shrink-0" title="Delete">
          <Trash2 size={14} />
        </button>
      </div>

      {/* Expanded: description, prompt, audience */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden">
            <div className="mt-3 space-y-3 pl-15">
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Description</label>
                <input value={edit.description} onChange={(e) => setEdit((p) => ({ ...p, description: e.target.value }))}
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 mt-1 bg-white" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Prompt</label>
                <textarea value={edit.prompt} onChange={(e) => setEdit((p) => ({ ...p, prompt: e.target.value }))}
                  rows={4} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 mt-1 bg-white font-mono" />
              </div>
              {row.tab === 'MODEL' && (
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Audience (demographics)</label>
                  <div className="flex gap-2 mt-1">
                    {DEMOGRAPHICS.map((d) => (
                      <label key={d} className="flex items-center gap-1 text-[10px] text-gray-600 cursor-pointer">
                        <input type="checkbox" checked={edit.audience.includes(d)} onChange={() => toggleDemo(d)}
                          className="w-3 h-3 rounded border-gray-300 text-fuchsia-600 focus:ring-fuchsia-500" />
                        {DEMO_LABELS[d]}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── New Style Form ────────────────────────────────────────────────────

function NewStyleForm({ onCreated, setStatus, open, onToggle }: {
  onCreated: (row: StudioStyleRow) => void; setStatus: (s: string) => void
  open: boolean; onToggle: () => void
}) {
  const [slug, setSlug] = useState('')
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [prompt, setPrompt] = useState('')
  const [tab, setTab] = useState<'PRODUCT' | 'MODEL'>('MODEL')
  const [plans, setPlans] = useState<string[]>([])
  const [engine, setEngine] = useState('')
  const [audience, setAudience] = useState<string[]>([])
  const [sortOrder, setSortOrder] = useState(0)
  const [saving, setSaving] = useState(false)
  const [slugError, setSlugError] = useState('')

  const canSubmit = slug && label && description && prompt && !saving

  const submit = async () => {
    if (!canSubmit) return
    setSaving(true); setSlugError(''); setStatus('')
    try {
      const res = await fetch(`${API_URL}/v1/admin/studio-styles`, {
        ...(await adminMutateOptions()), method: 'POST',
        body: JSON.stringify({
          slug, label, description, prompt, tab, plans, engine: engine || null,
          audience, sort_order: sortOrder,
        }),
      })
      if (res.status === 409) { setSlugError('Slug already exists'); setSaving(false); return }
      if (!res.ok) throw new Error('Create failed')
      const { data } = await res.json()
      onCreated(data)
      setSlug(''); setLabel(''); setDescription(''); setPrompt(''); setPlans([]); setEngine(''); setAudience([]); setSortOrder(0)
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Create failed'}`)
    } finally { setSaving(false) }
  }

  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center gap-2 px-5 py-3 text-sm font-bold text-gray-800 hover:bg-gray-50 transition-colors">
        <Plus size={16} className="text-fuchsia-500" />
        New Style
        {open ? <ChevronUp size={14} className="ml-auto text-gray-400" /> : <ChevronDown size={14} className="ml-auto text-gray-400" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-gray-100">
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Slug</label>
                  <input value={slug} onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40)); setSlugError('') }}
                    placeholder="pastel_gradient" className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 mt-1 bg-white font-mono" />
                  {slugError && <p className="text-[10px] text-red-500 mt-1">{slugError}</p>}
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Label</label>
                  <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Pastel Gradient Lounge"
                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 mt-1 bg-white" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Description</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Soft pastel gradient backdrop"
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 mt-1 bg-white" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Prompt</label>
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5}
                  placeholder="Place this outfit on a graceful Indian fashion model against..."
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 mt-1 bg-white font-mono" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Tab</label>
                  <div className="flex gap-2 mt-1">
                    {(['PRODUCT', 'MODEL'] as const).map((t) => (
                      <button key={t} onClick={() => setTab(t)}
                        className={`flex-1 text-[10px] font-semibold py-1.5 rounded-lg border transition-colors ${
                          tab === t ? 'bg-fuchsia-600 text-white border-fuchsia-600' : 'bg-white text-gray-500 border-gray-200'
                        }`}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Engine</label>
                  <select value={engine} onChange={(e) => setEngine(e.target.value)}
                    className="w-full text-[10px] border border-gray-200 rounded-lg px-2 py-2 mt-1 bg-white">
                    <option value="">— default —</option>
                    {ENGINES.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Sort order</label>
                  <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))}
                    className="w-full text-[10px] border border-gray-200 rounded-lg px-2 py-2 mt-1 bg-white text-center" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Plans</label>
                <div className="flex gap-3 mt-1">
                  {PLANS.map((p) => (
                    <label key={p} className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={plans.includes(p)} onChange={() => setPlans((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500" />
                      {p}
                    </label>
                  ))}
                </div>
              </div>
              {tab === 'MODEL' && (
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Audience</label>
                  <div className="flex gap-3 mt-1">
                    {DEMOGRAPHICS.map((d) => (
                      <label key={d} className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer">
                        <input type="checkbox" checked={audience.includes(d)} onChange={() => setAudience((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d])}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-fuchsia-600 focus:ring-fuchsia-500" />
                        {DEMO_LABELS[d]}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={submit} disabled={!canSubmit}
                className="flex items-center gap-2 px-4 py-2.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-medium rounded-xl disabled:opacity-40 transition-colors">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Create Style
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
