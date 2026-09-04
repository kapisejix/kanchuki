'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Save, Loader2, Trash2, Upload, ChevronDown, ChevronUp, Plus } from 'lucide-react'
import Image from 'next/image'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type PostTemplateRow = {
  id: string
  name: string
  description: string | null
  context: 'POST' | 'CAMPAIGN' | 'BOTH'
  post_type: 'SINGLE_PRODUCT' | 'COLLECTION_LINK' | 'CAROUSEL' | null
  caption_template: string
  hashtags: string[]
  occasion: string | null
  thumbnail_url: string | null
  status: 'DRAFT' | 'PUBLISHED' | 'HIDDEN'
  plans: string[]
  sort_order: number
  usage_count: number
  created_at: string
}

const PLANS = ['STARTER', 'GROWTH', 'PRO'] as const
const CONTEXTS = ['POST', 'CAMPAIGN', 'BOTH'] as const
const POST_TYPES = ['SINGLE_PRODUCT', 'COLLECTION_LINK', 'CAROUSEL'] as const
const STATUSES = ['DRAFT', 'PUBLISHED', 'HIDDEN'] as const

const hashtagsToInput = (tags: string[]) => tags.join(', ')
const inputToHashtags = (value: string) =>
  value.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 30)

// ─── Page ──────────────────────────────────────────────────────────────

export default function PostTemplatesPage() {
  const [rows, setRows] = useState<PostTemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [newFormOpen, setNewFormOpen] = useState(false)
  const [lightbox, setLightbox] = useState<{ url: string; label: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/v1/admin/post-templates`, adminGetOptions())
      const json = await res.json()
      setRows(json.data ?? [])
    } catch { setStatus('Failed to load post templates') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 size={24} className="animate-spin text-violet-500" /></div>
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-6xl">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Post Templates</h1>
          <Sparkles size={20} className="text-violet-500" />
        </div>
        <p className="text-sm text-gray-500">
          Admin-curated caption + hashtag templates for the Create Post composer and campaign
          creation. Assign to plan tiers and publish — retailers see only PUBLISHED templates
          matching their plan. Placeholders like {'{product_name}'}, {'{price}'}, {'{link}'}, {'{store_name}'},
          {'{festival}'} are resolved server-side at publish time.
        </p>
      </div>

      {status && (
        <div className={`text-sm rounded-xl px-4 py-3 border ${
          status.startsWith('✅') ? 'bg-green-50/80 border-green-200 text-green-700'
            : 'bg-red-50/80 border-red-200 text-red-600'
        }`}>{status}</div>
      )}

      <NewTemplateForm onCreated={(row) => { setRows((prev) => [row, ...prev]); setNewFormOpen(false); setStatus(`✅ "${row.name}" created`) }} setStatus={setStatus} open={newFormOpen} onToggle={() => setNewFormOpen(!newFormOpen)} />

      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <h2 className="text-sm font-bold text-gray-800">Templates</h2>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{rows.length}</span>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">No post templates yet — create the first one above.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {rows.map((row) => (
              <TemplateRow key={row.id} row={row} setRows={setRows} setStatus={setStatus} setLightbox={setLightbox} />
            ))}
          </div>
        )}
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 cursor-zoom-out" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox.url} alt={lightbox.label} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
        </div>
      )}
    </motion.div>
  )
}

// ─── Row ───────────────────────────────────────────────────────────────

function TemplateRow({ row, setRows, setStatus, setLightbox }: {
  row: PostTemplateRow
  setRows: React.Dispatch<React.SetStateAction<PostTemplateRow[]>>
  setStatus: (s: string) => void
  setLightbox: (l: { url: string; label: string } | null) => void
}) {
  const [edit, setEdit] = useState({
    name: row.name, description: row.description ?? '', context: row.context,
    post_type: row.post_type ?? '', caption_template: row.caption_template,
    hashtags: hashtagsToInput(row.hashtags), occasion: row.occasion ?? '',
    status: row.status, plans: [...row.plans], sort_order: row.sort_order,
  })
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const hasChanges = edit.name !== row.name || edit.description !== (row.description ?? '')
    || edit.context !== row.context || edit.post_type !== (row.post_type ?? '')
    || edit.caption_template !== row.caption_template
    || edit.hashtags !== hashtagsToInput(row.hashtags)
    || edit.occasion !== (row.occasion ?? '') || edit.status !== row.status
    || JSON.stringify(edit.plans.sort()) !== JSON.stringify([...row.plans].sort())
    || edit.sort_order !== row.sort_order

  const save = async () => {
    setSaving(true); setStatus('')
    try {
      const diff: Record<string, unknown> = {}
      if (edit.name !== row.name) diff.name = edit.name
      if (edit.description !== (row.description ?? '')) diff.description = edit.description || null
      if (edit.context !== row.context) diff.context = edit.context
      if (edit.post_type !== (row.post_type ?? '')) diff.post_type = edit.post_type || null
      if (edit.caption_template !== row.caption_template) diff.caption_template = edit.caption_template
      const tags = inputToHashtags(edit.hashtags)
      if (JSON.stringify(tags) !== JSON.stringify(row.hashtags)) diff.hashtags = tags
      if (edit.occasion !== (row.occasion ?? '')) diff.occasion = edit.occasion || null
      if (edit.status !== row.status) diff.status = edit.status
      if (JSON.stringify(edit.plans.sort()) !== JSON.stringify([...row.plans].sort())) diff.plans = edit.plans
      if (edit.sort_order !== row.sort_order) diff.sort_order = edit.sort_order

      if (Object.keys(diff).length === 0) { setSaving(false); return }

      const res = await fetch(`${API_URL}/v1/admin/post-templates/${row.id}`, {
        ...(await adminMutateOptions()), method: 'PATCH', body: JSON.stringify(diff),
      })
      if (!res.ok) throw new Error('Save failed')
      const { data } = await res.json()
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, ...data } : r))
      setStatus(`✅ "${edit.name}" saved`)
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Save failed'}`)
    } finally { setSaving(false) }
  }

  const deleteRow = async () => {
    if (!confirm(`Delete "${row.name}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`${API_URL}/v1/admin/post-templates/${row.id}`, {
        ...(await adminMutateOptions()), method: 'DELETE', body: '{}',
      })
      if (!res.ok) throw new Error('Delete failed')
      setRows((prev) => prev.filter((r) => r.id !== row.id))
      setStatus(`✅ "${row.name}" deleted`)
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Delete failed'}`)
    }
  }

  const uploadThumbnail = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; e.target.value = ''
    try {
      const presign = await fetch(`${API_URL}/v1/admin/post-templates/thumbnail-url`, {
        ...(await adminMutateOptions()), method: 'POST',
        body: JSON.stringify({ content_type: file.type, filename: file.name }),
      })
      if (!presign.ok) throw new Error('Failed to get upload URL')
      const { data } = await presign.json()
      const put = await fetch(data.upload_url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
      if (!put.ok) throw new Error('Upload to storage failed')
      const patchRes = await fetch(`${API_URL}/v1/admin/post-templates/${row.id}`, {
        ...(await adminMutateOptions()), method: 'PATCH',
        body: JSON.stringify({ thumbnail_url: data.public_url }),
      })
      if (!patchRes.ok) throw new Error('Failed to save thumbnail')
      const { data: updated } = await patchRes.json()
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, thumbnail_url: updated.thumbnail_url } : r))
      setStatus(`✅ Thumbnail uploaded for "${row.name}"`)
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

  return (
    <div className="px-5 py-4">
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={uploadThumbnail} />

      {/* Top row: thumbnail + name + context + post_type + status + plans + sort + save */}
      <div className="flex items-start gap-3 flex-wrap">
        {/* Thumbnail */}
        <button type="button" onClick={() => row.thumbnail_url && setLightbox({ url: row.thumbnail_url, label: row.name })}
          className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0 cursor-zoom-in relative">
          {row.thumbnail_url ? (
            <Image src={row.thumbnail_url} alt={row.name} fill className="object-cover" unoptimized />
          ) : <Sparkles size={16} className="text-gray-300" />}
        </button>

        {/* Name */}
        <div className="flex-1 min-w-40">
          <input value={edit.name} onChange={(e) => setEdit((p) => ({ ...p, name: e.target.value }))}
            className="text-sm font-bold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-violet-400 outline-none px-0.5 py-0.5 w-full" />
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-gray-400">{row.usage_count} uses</span>
            {row.occasion && (
              <>
                <span className="text-[10px] text-gray-300">·</span>
                <span className="text-[10px] font-medium text-violet-500">{row.occasion}</span>
              </>
            )}
          </div>
        </div>

        {/* Context segmented */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden shrink-0">
          {CONTEXTS.map((c) => (
            <button key={c} onClick={() => setEdit((p) => ({ ...p, context: c }))}
              className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                edit.context === c ? 'bg-violet-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}>{c}</button>
          ))}
        </div>

        {/* Post type */}
        <select value={edit.post_type} onChange={(e) => setEdit((p) => ({ ...p, post_type: e.target.value }))}
          className="text-[10px] border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 shrink-0 w-36">
          <option value="">— any post type —</option>
          {POST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        {/* Status segmented */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden shrink-0">
          {STATUSES.map((s) => (
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
                className="w-3 h-3 rounded border-gray-300 text-violet-600 focus:ring-violet-500" />
              {p}
            </label>
          ))}
        </div>

        {/* Sort order */}
        <input type="number" value={edit.sort_order} onChange={(e) => setEdit((p) => ({ ...p, sort_order: Number(e.target.value) }))}
          className="w-14 text-[10px] border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 text-center shrink-0" />

        {/* Save */}
        <button onClick={save} disabled={!hasChanges || saving}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold shrink-0 transition-colors ${
            hasChanges ? 'bg-violet-600 hover:bg-violet-500 text-white' : 'bg-gray-100 text-gray-400'
          } disabled:opacity-50`}>
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Save
        </button>

        {/* Expand / Thumbnail / Delete */}
        <button onClick={() => setExpanded(!expanded)} className="p-1.5 text-gray-400 hover:text-gray-600 shrink-0">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button onClick={() => fileRef.current?.click()} className="p-1.5 text-gray-400 hover:text-violet-600 shrink-0" title="Upload thumbnail">
          <Upload size={14} />
        </button>
        <button onClick={deleteRow} className="p-1.5 text-gray-400 hover:text-red-600 shrink-0" title="Delete">
          <Trash2 size={14} />
        </button>
      </div>

      {/* Expanded: description, occasion, caption template, hashtags */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden">
            <div className="mt-3 space-y-3 pl-15">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Description</label>
                  <input value={edit.description} onChange={(e) => setEdit((p) => ({ ...p, description: e.target.value }))}
                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 mt-1 bg-white" placeholder="Shown to the retailer in the picker" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Occasion</label>
                  <input value={edit.occasion} onChange={(e) => setEdit((p) => ({ ...p, occasion: e.target.value }))}
                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 mt-1 bg-white" placeholder="Diwali, Wedding, General…" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  Caption template — placeholders: {'{product_name}'} {'{product_names}'} {'{price}'} {'{category}'} {'{link}'} {'{store_name}'} {'{festival}'}
                </label>
                <textarea value={edit.caption_template} onChange={(e) => setEdit((p) => ({ ...p, caption_template: e.target.value }))}
                  rows={3} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 mt-1 bg-white font-mono"
                  placeholder="✨ New {product_name} at just ₹{price}! Shop now — {link}" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Hashtags (comma-separated)</label>
                <input value={edit.hashtags} onChange={(e) => setEdit((p) => ({ ...p, hashtags: e.target.value }))}
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 mt-1 bg-white font-mono"
                  placeholder="#newarrivals, #festivewear, #kanchuki" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── New Template Form ─────────────────────────────────────────────────

function NewTemplateForm({ onCreated, setStatus, open, onToggle }: {
  onCreated: (row: PostTemplateRow) => void; setStatus: (s: string) => void
  open: boolean; onToggle: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [context, setContext] = useState<'POST' | 'CAMPAIGN' | 'BOTH'>('POST')
  const [postType, setPostType] = useState('')
  const [captionTemplate, setCaptionTemplate] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [occasion, setOccasion] = useState('')
  const [status, setStatusLocal] = useState<'DRAFT' | 'PUBLISHED' | 'HIDDEN'>('DRAFT')
  const [plans, setPlans] = useState<string[]>([])
  const [sortOrder, setSortOrder] = useState(0)
  const [saving, setSaving] = useState(false)

  const canSubmit = name && captionTemplate && !saving

  const submit = async () => {
    if (!canSubmit) return
    setSaving(true); setStatus('')
    try {
      const res = await fetch(`${API_URL}/v1/admin/post-templates`, {
        ...(await adminMutateOptions()), method: 'POST',
        body: JSON.stringify({
          name, description: description || null, context, post_type: postType || null,
          caption_template: captionTemplate, hashtags: inputToHashtags(hashtags),
          occasion: occasion || null, status, plans, sort_order: sortOrder,
        }),
      })
      if (!res.ok) throw new Error('Create failed')
      const { data } = await res.json()
      onCreated(data)
      setName(''); setDescription(''); setContext('POST'); setPostType(''); setCaptionTemplate('')
      setHashtags(''); setOccasion(''); setStatusLocal('DRAFT'); setPlans([]); setSortOrder(0)
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Create failed'}`)
    } finally { setSaving(false) }
  }

  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center gap-2 px-5 py-3 text-sm font-bold text-gray-800 hover:bg-gray-50 transition-colors">
        <Plus size={16} className="text-violet-500" />
        New Template
        {open ? <ChevronUp size={14} className="ml-auto text-gray-400" /> : <ChevronDown size={14} className="ml-auto text-gray-400" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-gray-100">
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Diwali Carousel"
                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 mt-1 bg-white" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Occasion</label>
                  <input value={occasion} onChange={(e) => setOccasion(e.target.value)} placeholder="Diwali, Wedding…"
                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 mt-1 bg-white" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Sort order</label>
                  <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))}
                    className="w-full text-[10px] border border-gray-200 rounded-lg px-2 py-2 mt-1 bg-white text-center" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Description</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Festive multi-product post with hashtags"
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 mt-1 bg-white" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Context</label>
                  <div className="flex gap-2 mt-1">
                    {CONTEXTS.map((c) => (
                      <button key={c} onClick={() => setContext(c)}
                        className={`flex-1 text-[10px] font-semibold py-1.5 rounded-lg border transition-colors ${
                          context === c ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-500 border-gray-200'
                        }`}>{c}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Post type hint</label>
                  <select value={postType} onChange={(e) => setPostType(e.target.value)}
                    className="w-full text-[10px] border border-gray-200 rounded-lg px-2 py-2 mt-1 bg-white">
                    <option value="">— any —</option>
                    {POST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Status</label>
                  <div className="flex gap-2 mt-1">
                    {STATUSES.map((s) => (
                      <button key={s} onClick={() => setStatusLocal(s)}
                        className={`flex-1 text-[10px] font-semibold py-1.5 rounded-lg border transition-colors ${
                          status === s ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-500 border-gray-200'
                        }`}>{s}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  Caption template — placeholders: {'{product_name}'} {'{price}'} {'{link}'} {'{store_name}'} {'{festival}'}
                </label>
                <textarea value={captionTemplate} onChange={(e) => setCaptionTemplate(e.target.value)} rows={3}
                  placeholder="✨ New {product_name} at just ₹{price}! Shop now — {link}"
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 mt-1 bg-white font-mono" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Hashtags (comma-separated)</label>
                <input value={hashtags} onChange={(e) => setHashtags(e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 mt-1 bg-white font-mono"
                  placeholder="#newarrivals, #festivewear" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Plans</label>
                <div className="flex gap-3 mt-1">
                  {PLANS.map((p) => (
                    <label key={p} className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={plans.includes(p)} onChange={() => setPlans((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-violet-600 focus:ring-violet-500" />
                      {p}
                    </label>
                  ))}
                </div>
              </div>
              <button onClick={submit} disabled={!canSubmit}
                className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-xl disabled:opacity-40 transition-colors">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Create Template
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}