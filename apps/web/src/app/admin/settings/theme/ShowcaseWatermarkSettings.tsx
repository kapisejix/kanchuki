'use client'

import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'
import {
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Save,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type WatermarkGravity =
  | 'northwest'
  | 'north'
  | 'northeast'
  | 'west'
  | 'center'
  | 'east'
  | 'southwest'
  | 'south'
  | 'southeast'

type WatermarkConfig = {
  logo_r2_key: string | null
  opacity: number // 0.05–1
  scale: number // 0.02–1 (logo width as a fraction of the design width)
  gravity: WatermarkGravity
  strip_count: number // 1–24 thumbs before "View more"
  /** Server-derived R2 public URL for the configured logo (null = built-in). */
  logo_url: string | null
}

const GRAVITY_OPTIONS: { value: WatermarkGravity; label: string }[] = [
  { value: 'northwest', label: 'Top-left' },
  { value: 'north', label: 'Top-centre' },
  { value: 'northeast', label: 'Top-right' },
  { value: 'west', label: 'Middle-left' },
  { value: 'center', label: 'Centre' },
  { value: 'east', label: 'Middle-right' },
  { value: 'southwest', label: 'Bottom-left' },
  { value: 'south', label: 'Bottom-centre' },
  { value: 'southeast', label: 'Bottom-right' },
]

// Defaults mirror the API's code fallback (lib/showcase-watermark.ts) so the
// sliders/selects render sane positions before the GET resolves.
const DEFAULT_CONFIG: WatermarkConfig = {
  logo_r2_key: null,
  opacity: 0.35,
  scale: 0.18,
  gravity: 'southeast',
  strip_count: 6,
  logo_url: null,
}

const fmt = (pct: number) => `${Math.round(pct * 100)}%`

export default function ShowcaseWatermarkSettings() {
  const [saved, setSaved] = useState<WatermarkConfig>(DEFAULT_CONFIG)
  const [draft, setDraft] = useState<WatermarkConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setStatus(null)
    try {
      const res = await fetch(`${API_URL}/v1/admin/settings/showcase-watermark`, adminGetOptions())
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const cfg = { ...DEFAULT_CONFIG, ...(json.data ?? {}) } as WatermarkConfig
      setSaved(cfg)
      setDraft(cfg)
    } catch (err) {
      setStatus({ kind: 'err', text: err instanceof Error ? err.message : 'Failed to load watermark config' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const isDirty =
    draft.logo_r2_key !== saved.logo_r2_key ||
    draft.opacity !== saved.opacity ||
    draft.scale !== saved.scale ||
    draft.gravity !== saved.gravity ||
    draft.strip_count !== saved.strip_count

  const handleSave = async () => {
    setSaving(true)
    setStatus(null)
    try {
      const res = await fetch(`${API_URL}/v1/admin/settings/showcase-watermark`, {
        ...(await adminMutateOptions()),
        method: 'PUT',
        body: JSON.stringify({
          logo_r2_key: draft.logo_r2_key,
          opacity: draft.opacity,
          scale: draft.scale,
          gravity: draft.gravity,
          strip_count: draft.strip_count,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const cfg = { ...DEFAULT_CONFIG, ...(json.data ?? {}) } as WatermarkConfig
      setSaved(cfg)
      setDraft(cfg)
      setStatus({ kind: 'ok', text: 'Watermark config saved — new design uploads use it' })
      setTimeout(() => setStatus(null), 5000)
    } catch (err) {
      setStatus({ kind: 'err', text: err instanceof Error ? err.message : 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy('Uploading logo…')
    setStatus(null)
    try {
      const presign = await fetch(`${API_URL}/v1/admin/settings/showcase-watermark/logo-upload-url`, {
        ...(await adminMutateOptions()),
        method: 'POST',
        body: JSON.stringify({ content_type: file.type || 'image/png', filename: file.name }),
      })
      if (!presign.ok) throw new Error('Failed to get an upload URL')
      const { data } = await presign.json()

      const put = await fetch(data.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'image/png' },
        body: file,
      })
      if (!put.ok) throw new Error('Upload to storage failed')

      // Draft-only until Save — admins can swap logos without persisting.
      setDraft((prev) => ({ ...prev, logo_r2_key: data.r2_key, logo_url: data.public_url }))
      setStatus({ kind: 'ok', text: 'Logo uploaded — press Save to apply it' })
      setTimeout(() => setStatus(null), 5000)
    } catch (err) {
      setStatus({ kind: 'err', text: err instanceof Error ? err.message : 'Logo upload failed' })
    } finally {
      setBusy(null)
    }
  }

  const clearLogo = () => {
    setDraft((prev) => ({ ...prev, logo_r2_key: null, logo_url: null }))
    setStatus({ kind: 'ok', text: 'Built-in Kanchuki logo selected — press Save to apply it' })
    setTimeout(() => setStatus(null), 5000)
  }

  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 shadow-lg p-6">
      <div className="flex items-center gap-2 mb-1">
        <ImageIcon size={16} className="text-cyan-500" />
        <h2 className="text-sm font-semibold text-gray-700">Suits Designs — watermark</h2>
        {isDirty && (
          <span className="text-[10px] font-medium text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded-full">
            Unsaved changes
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-5">
        Stamped on every design (retailer uploads fall back to this when the store has no own
        logo). Applies to designs uploaded <span className="font-medium">after</span> saving —
        existing designs keep the watermark they were created with.
      </p>

      {status && (
        <div
          className={`flex items-center gap-2 text-sm rounded-xl px-3 py-2.5 border mb-5 ${
            status.kind === 'ok'
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-700'
              : 'bg-red-50/80 border-red-200 text-red-600'
          }`}
        >
          {status.kind === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          <span>{status.text}</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <div className="h-5 bg-gray-200/60 rounded w-1/3 animate-pulse" />
          <div className="h-3 bg-gray-200/60 rounded w-2/3 animate-pulse" />
          <div className="h-3 bg-gray-200/60 rounded w-1/2 animate-pulse" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Default logo */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="w-24 h-16 rounded-lg border border-gray-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={draft.logo_url ?? '/kanchuki-logo.png'}
                alt="Watermark logo preview"
                className="max-h-full max-w-full object-contain"
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <p className="text-xs font-semibold text-gray-700">Default logo</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {draft.logo_r2_key
                  ? 'Custom logo (retailers without their own logo fall back to this)'
                  : 'Built-in Kanchuki logo'}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleLogoFile}
              />
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium rounded-lg disabled:opacity-60 transition-colors"
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  {busy ?? 'Upload logo'}
                </button>
                {draft.logo_r2_key && (
                  <button
                    onClick={clearLogo}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 border border-gray-200 hover:border-gray-300 rounded-lg transition-colors"
                  >
                    <RotateCcw size={13} />
                    Use built-in logo
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2 border-t border-gray-100 pt-5">
            {/* Opacity */}
            <label className="block">
              <span className="flex items-center justify-between text-xs font-semibold text-gray-700">
                <span>Opacity</span>
                <span className="font-mono text-gray-400">{fmt(draft.opacity)}</span>
              </span>
              <input
                type="range"
                min={5}
                max={100}
                step={1}
                value={Math.round(draft.opacity * 100)}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, opacity: Number(e.target.value) / 100 }))
                }
                aria-label="Watermark opacity"
                className="w-full mt-2 accent-cyan-600"
              />
            </label>

            {/* Scale */}
            <label className="block">
              <span className="flex items-center justify-between text-xs font-semibold text-gray-700">
                <span>Logo width (of the design)</span>
                <span className="font-mono text-gray-400">{fmt(draft.scale)}</span>
              </span>
              <input
                type="range"
                min={2}
                max={100}
                step={1}
                value={Math.round(draft.scale * 100)}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, scale: Number(e.target.value) / 100 }))
                }
                aria-label="Watermark logo width"
                className="w-full mt-2 accent-cyan-600"
              />
            </label>

            {/* Corner */}
            <label className="block">
              <span className="text-xs font-semibold text-gray-700 block mb-1.5">Corner</span>
              <select
                value={draft.gravity}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, gravity: e.target.value as WatermarkGravity }))
                }
                aria-label="Watermark corner"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
              >
                {GRAVITY_OPTIONS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>

            {/* Strip count */}
            <label className="block">
              <span className="flex items-center justify-between text-xs font-semibold text-gray-700">
                <span>Designs before “View more”</span>
                <span className="font-mono text-gray-400">{draft.strip_count}</span>
              </span>
              <input
                type="number"
                min={1}
                max={24}
                step={1}
                value={draft.strip_count}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  if (Number.isInteger(n)) {
                    setDraft((prev) => ({
                      ...prev,
                      strip_count: Math.min(24, Math.max(1, n)),
                    }))
                  }
                }}
                aria-label="Designs shown before View more"
                className="w-full mt-2 text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
              />
            </label>
          </div>

          <div className="flex items-center justify-end border-t border-gray-100 pt-4">
            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-cyan-500/25 disabled:opacity-60"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {saving ? 'Saving…' : 'Save watermark'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
