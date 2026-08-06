'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Wand2, Upload, Loader2, ImageOff, ArrowRight } from 'lucide-react'
import Image from 'next/image'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type BackgroundImage = { id: string; name: string; image_url: string; is_active: boolean }

type RunResult = {
  id: string
  productUrl: string
  backgroundUrl: string
  sampleUrl: string | null
  resultUrl: string
  shine: boolean
  blur: number | null
  ranAt: string
}

// ponytail: presign-then-PUT straight to R2, same pattern as the existing
// background-images admin page — no multipart parsing on the API.
async function uploadToR2(file: File): Promise<string> {
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
  return data.public_url as string
}

export default function PhotoCleanupTestPage() {
  const [productFile, setProductFile] = useState<File | null>(null)
  const [sampleFile, setSampleFile] = useState<File | null>(null)
  const [bgFile, setBgFile] = useState<File | null>(null)
  const [bgLibrary, setBgLibrary] = useState<BackgroundImage[]>([])
  const [bgLibraryId, setBgLibraryId] = useState<string>('')
  const [shine, setShine] = useState(true)
  const [blurMode, setBlurMode] = useState(false)
  const [blurRadius, setBlurRadius] = useState(25)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<RunResult[]>([])

  const productRef = useRef<HTMLInputElement>(null)
  const sampleRef = useRef<HTMLInputElement>(null)
  const bgRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`${API_URL}/v1/admin/background-images`, adminGetOptions())
      .then((r) => r.json())
      .then((json) => setBgLibrary((json.data ?? []).filter((b: BackgroundImage) => b.is_active)))
      .catch(() => {})
  }, [])

  const canRun = productFile && !running && (blurMode || bgFile || bgLibraryId)

  const run = async () => {
    if (!productFile) return
    setRunning(true)
    setError('')
    try {
      const productUrl = await uploadToR2(productFile)
      const backgroundUrl = blurMode
        ? '' // ignored server-side in blur mode
        : bgFile
          ? await uploadToR2(bgFile)
          : (bgLibrary.find((b) => b.id === bgLibraryId)?.image_url ?? '')

      const res = await fetch(`${API_URL}/v1/admin/photo-cleanup/run`, {
        ...(await adminMutateOptions()),
        method: 'POST',
        body: JSON.stringify({
          product_url: productUrl,
          background_url: backgroundUrl || productUrl, // dummy, ignored by API when blur is set
          shine,
          blur: blurMode ? blurRadius : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message ?? 'Cleanup run failed')

      setResults((prev) => [
        {
          id: crypto.randomUUID(),
          productUrl,
          backgroundUrl: backgroundUrl || productUrl,
          sampleUrl: sampleFile ? URL.createObjectURL(sampleFile) : null,
          resultUrl: json.data.result_url,
          shine,
          blur: blurMode ? blurRadius : null,
          ranAt: new Date().toLocaleTimeString(),
        },
        ...prev,
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cleanup run failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-6xl">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Photo Cleanup Test</h1>
          <Wand2 size={20} className="text-cyan-500" />
        </div>
        <p className="text-sm text-gray-500">
          Runs <code className="text-xs">scripts/batch-clean-photos.py</code> against an uploaded product
          photo (bg-removal + shadow + composite onto a backdrop, or portrait blur). Python + rembg are wired
          into the API container (Dockerfile) — runs are serialized so only one cleanup process is in memory
          at a time. If the API host has no Python, the run fails with a clear error.
        </p>
      </div>

      {error && (
        <div className="text-sm rounded-xl px-4 py-3 border bg-red-50/80 border-red-200 text-red-600">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Dropzone
          label="Product photo"
          hint="the raw shot to clean"
          file={productFile}
          inputRef={productRef}
          onPick={setProductFile}
        />
        <Dropzone
          label="Sample image for output"
          hint="reference only — not sent to the script, shown next to the result for comparison"
          file={sampleFile}
          inputRef={sampleRef}
          onPick={setSampleFile}
        />
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-gray-800">Background image</p>
            <p className="text-xs text-gray-400">upload new or pick from the existing library</p>
          </div>
          <Dropzone compact file={bgFile} inputRef={bgRef} onPick={(f) => { setBgFile(f); setBgLibraryId('') }} disabled={blurMode} />
          {bgLibrary.length > 0 && (
            <select
              value={bgLibraryId}
              onChange={(e) => { setBgLibraryId(e.target.value); setBgFile(null) }}
              disabled={blurMode}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 disabled:opacity-40"
            >
              <option value="">— or select from library —</option>
              {bgLibrary.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4 flex flex-wrap items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={shine} onChange={(e) => setShine(e.target.checked)} />
          Shine (contrast/highlight boost)
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={blurMode} onChange={(e) => setBlurMode(e.target.checked)} />
          Blur mode (keep own background, ignore backdrop above)
        </label>
        {blurMode && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            Blur radius
            <input
              type="number"
              min={1}
              max={100}
              value={blurRadius}
              onChange={(e) => setBlurRadius(Number(e.target.value))}
              className="w-16 border border-gray-200 rounded-lg px-2 py-1"
            />
          </label>
        )}
        <button
          onClick={run}
          disabled={!canRun}
          className="ml-auto flex items-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-xl disabled:opacity-40 transition-colors"
        >
          {running ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
          Run cleanup
        </button>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Results this session</h2>
        {results.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center border border-dashed border-gray-200 rounded-2xl">
            No test runs yet — pick a product photo and background above, then Run cleanup.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((r) => (
              <div key={r.id} className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden">
                <div className="flex items-center gap-1 p-2 bg-gray-50">
                  <div className="flex-1 aspect-square relative rounded-lg overflow-hidden bg-gray-100">
                    <Image src={r.productUrl} alt="before" fill className="object-cover" unoptimized />
                  </div>
                  <ArrowRight size={14} className="text-gray-400 shrink-0" />
                  <div className="flex-1 aspect-square relative rounded-lg overflow-hidden bg-gray-100">
                    <Image src={r.resultUrl} alt="after" fill className="object-cover" unoptimized />
                  </div>
                  {r.sampleUrl && (
                    <>
                      <span className="text-[10px] text-gray-400 shrink-0 px-0.5">vs</span>
                      <div className="w-12 aspect-square relative rounded-lg overflow-hidden bg-gray-100 shrink-0 ring-1 ring-cyan-200">
                        <Image src={r.sampleUrl} alt="sample target" fill className="object-cover" unoptimized />
                      </div>
                    </>
                  )}
                </div>
                <div className="px-3 py-2 flex items-center justify-between text-xs text-gray-500">
                  <span>{r.blur !== null ? `blur ${r.blur}` : 'bg composite'}{r.shine ? ' + shine' : ''}</span>
                  <span>{r.ranAt}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

function Dropzone({
  label,
  hint,
  file,
  inputRef,
  onPick,
  compact,
  disabled,
}: {
  label?: string
  hint?: string
  file: File | null
  inputRef: React.RefObject<HTMLInputElement>
  onPick: (f: File) => void
  compact?: boolean
  disabled?: boolean
}) {
  const previewUrl = file ? URL.createObjectURL(file) : null
  return (
    <div className={compact ? '' : 'bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4 space-y-3'}>
      {label && (
        <div>
          <p className="text-sm font-medium text-gray-800">{label}</p>
          {hint && <p className="text-xs text-gray-400">{hint}</p>}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onPick(f)
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className={`w-full flex items-center justify-center gap-2 border border-dashed border-gray-300 rounded-xl text-xs text-gray-500 hover:border-cyan-400 hover:text-cyan-600 transition-colors disabled:opacity-40 ${
          compact ? 'h-20' : 'h-32'
        } relative overflow-hidden`}
      >
        {previewUrl ? (
          <Image src={previewUrl} alt={label ?? 'preview'} fill className="object-cover" unoptimized />
        ) : (
          <>
            <Upload size={16} />
            Choose file
          </>
        )}
      </button>
      {!file && !compact && (
        <p className="text-[10px] text-gray-300 flex items-center gap-1">
          <ImageOff size={10} /> nothing selected
        </p>
      )}
    </div>
  )
}
