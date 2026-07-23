'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Image as ImageIcon, Upload, Loader2, Eye, EyeOff } from 'lucide-react'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type BackgroundImage = {
  id: string
  name: string
  image_url: string
  thumbnail_url: string | null
  is_active: boolean
  created_at: string
}

function getHeaders() {
  const key = sessionStorage.getItem('admin_key')
  return { 'x-admin-key': key ?? '', 'Content-Type': 'application/json' }
}

export default function BackgroundImagesPage() {
  const [rows, setRows] = useState<BackgroundImage[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    const res = await fetch(`${API_URL}/v1/admin/background-images`, { headers: getHeaders() })
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
        method: 'POST',
        headers: getHeaders(),
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

      const name = file.name.replace(/\.[^.]+$/, '')
      const create = await fetch(`${API_URL}/v1/admin/background-images`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ name, image_url: data.public_url }),
      })
      if (!create.ok) throw new Error('Failed to register background image')

      setStatus(`✅ "${name}" added`)
      await load()
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Upload failed'}`)
    } finally {
      setUploading(false)
    }
  }

  const toggleActive = async (row: BackgroundImage) => {
    await fetch(`${API_URL}/v1/admin/background-images/${row.id}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ is_active: !row.is_active }),
    })
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: !r.is_active } : r)))
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
          Inactive backgrounds stay applied to products that already use them, but drop out of the picker.
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
            <div className="aspect-square bg-gray-100">
              <img
                src={row.thumbnail_url ?? row.image_url}
                alt={row.name}
                className={`w-full h-full object-cover ${row.is_active ? '' : 'opacity-40'}`}
              />
            </div>
            <div className="p-3 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-gray-700 truncate">{row.name}</span>
              <button
                onClick={() => toggleActive(row)}
                className={`p-1.5 rounded-lg transition-colors ${
                  row.is_active ? 'text-cyan-600 hover:bg-cyan-50' : 'text-gray-400 hover:bg-gray-50'
                }`}
                aria-label={row.is_active ? 'Deactivate' : 'Activate'}
              >
                {row.is_active ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="col-span-full text-sm text-gray-400 py-8 text-center">
            No background images yet — upload one above.
          </p>
        )}
      </div>
    </motion.div>
  )
}
