'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Image as ImageIcon, Upload, Loader2, Eye, EyeOff, Trash2 } from 'lucide-react'
import Image from 'next/image'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type BackgroundImage = {
  id: string
  name: string
  image_url: string
  thumbnail_url: string | null
  is_active: boolean
  tone: 'LIGHT' | 'DARK' | null
  created_at: string
}

export default function BackgroundImagesPage() {
  const [rows, setRows] = useState<BackgroundImage[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    const res = await fetch(`${API_URL}/v1/admin/background-images`, adminGetOptions())
    const json = await res.json()
    setRows(json.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    setUploading(true)
    setStatus('')
    try {
      const presign = await fetch(`${API_URL}/v1/admin/background-images/upload-url`, {
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

      // No name sent — the API auto-names the scene from the image (AI).
      const create = await fetch(`${API_URL}/v1/admin/background-images`, {
        ...(await adminMutateOptions()),
        method: 'POST',
        body: JSON.stringify({ image_url: data.public_url }),
      })
      if (!create.ok) throw new Error('Failed to register background image')
      const { data: created } = await create.json()

      setStatus(`✅ "${created?.name ?? 'Background'}" added`)
      await load()
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Upload failed'}`)
    } finally {
      setUploading(false)
    }
  }

  const deleteRow = async (row: BackgroundImage) => {
    if (!confirm(`Delete "${row.name}"? Products using it fall back to Auto backdrop.`)) return
    const res = await fetch(`${API_URL}/v1/admin/background-images/${row.id}`, {
      ...(await adminMutateOptions()),
      method: 'DELETE',
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      setStatus(`❌ Delete failed (HTTP ${res.status})${detail ? ` — ${detail.slice(0, 200)}` : ''}`)
      return
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id))
    setStatus(`✅ "${row.name}" deleted`)
  }

  const toggleActive = async (row: BackgroundImage) => {
    await fetch(`${API_URL}/v1/admin/background-images/${row.id}`, {
      ...(await adminMutateOptions()),
      method: 'PATCH',
      body: JSON.stringify({ is_active: !row.is_active }),
    })
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: !r.is_active } : r)))
  }

  // F-028: admin can override the auto-computed tone (used by the
  // dark-garment→light / light-garment→dark auto-contrast backdrop picker).
  const setTone = async (row: BackgroundImage, tone: 'LIGHT' | 'DARK' | null) => {
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, tone } : r)))
    try {
      await fetch(`${API_URL}/v1/admin/background-images/${row.id}`, {
        ...(await adminMutateOptions()),
        method: 'PATCH',
        body: JSON.stringify({ tone }),
      })
    } catch {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, tone: row.tone } : r)))
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
          <h1 className="text-2xl font-bold text-gray-900">Background Images</h1>
          <ImageIcon size={20} className="text-cyan-500" />
        </div>
        <p className="text-sm text-gray-500">
          F-011: curated backdrops retailers can pick for their product photos and 360° spin.
          F-028: each backdrop carries a tone (auto-computed, admin-overridable) so the AI pipeline
          auto-picks a contrasting backdrop — dark garment → light, light garment → dark. Inactive
          backgrounds stay applied to products that already use them, but drop out of the picker.
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
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileSelect}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-xl disabled:opacity-60 transition-colors"
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          Upload background image
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {rows.map((row) => (
          <div
            key={row.id}
            className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setPreview(row.image_url)}
              className="aspect-square bg-gray-100 relative block w-full cursor-zoom-in"
              aria-label={`View ${row.name} full size`}
            >
              <Image
                src={row.thumbnail_url ?? row.image_url}
                alt={row.name}
                fill
                className={`object-cover ${row.is_active ? '' : 'opacity-40'}`}
              />
            </button>
            <div className="p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-gray-700 truncate">{row.name}</span>
                <div className="flex items-center shrink-0">
                  <button
                    onClick={() => toggleActive(row)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      row.is_active ? 'text-cyan-600 hover:bg-cyan-50' : 'text-gray-400 hover:bg-gray-50'
                    }`}
                    aria-label={row.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {row.is_active ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button
                    onClick={() => deleteRow(row)}
                    className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    aria-label="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    row.tone === 'LIGHT'
                      ? 'bg-amber-100 text-amber-700'
                      : row.tone === 'DARK'
                        ? 'bg-gray-800 text-gray-100'
                        : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {row.tone === 'LIGHT' ? 'Light' : row.tone === 'DARK' ? 'Dark' : 'Unclassified'}
                </span>
                <select
                  value={row.tone ?? ''}
                  onChange={(e) =>
                    void setTone(
                      row,
                      (e.target.value || null) as 'LIGHT' | 'DARK' | null,
                    )
                  }
                  className="text-[10px] border border-gray-200 rounded-lg px-1.5 py-1 bg-white text-gray-600"
                  aria-label={`Tone for ${row.name}`}
                >
                  <option value="">Auto</option>
                  <option value="LIGHT">Light</option>
                  <option value="DARK">Dark</option>
                </select>
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="col-span-full text-sm text-gray-400 py-8 text-center">
            No background images yet — upload one above.
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
            alt="Background full size"
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </motion.div>
  )
}
