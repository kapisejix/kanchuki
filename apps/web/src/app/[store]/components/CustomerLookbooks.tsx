'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { BookOpen, Eye, Share2 } from 'lucide-react'

interface Lookbook {
  id: string
  name: string
  description: string | null
  format: string
  cover_url: string | null
  output_url: string | null
  share_url: string | null
  view_count: number
  share_count: number
}

interface Props {
  storeSlug: string
}

const FORMAT_LABELS: Record<string, string> = {
  CAROUSEL: 'Carousel',
  GRID: 'Grid',
  EDITORIAL: 'Editorial',
  PDF: 'PDF',
}

export function CustomerLookbooks({ storeSlug }: Props) {
  const [lookbooks, setLookbooks] = useState<Lookbook[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLookbook, setSelectedLookbook] = useState<Lookbook | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/${storeSlug}/lookbooks`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data: Lookbook[] } | null) => {
        if (!cancelled && json?.data) setLookbooks(json.data)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [storeSlug])

  // Track view when opening a lookbook
  const handleOpen = async (lb: Lookbook) => {
    setSelectedLookbook(lb)
    // Fire-and-forget view increment
    void fetch(`/api/${storeSlug}/lookbooks`, { method: 'POST' }).catch(() => undefined)
  }

  if (loading || lookbooks.length === 0) return null

  return (
    <>
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3 px-1">
          <BookOpen size={16} className="text-indigo-500" />
          <h2 className="text-sm font-bold text-gray-900">Style Lookbooks</h2>
        </div>
        <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 scrollbar-hide snap-x snap-mandatory">
          {lookbooks.map((lb) => (
            <button
              key={lb.id}
              onClick={() => void handleOpen(lb)}
              className="flex-shrink-0 w-44 snap-start group text-left"
            >
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm group-hover:shadow-md transition-shadow">
                {/* Cover image */}
                <div className="relative aspect-[3/4] bg-gray-100 overflow-hidden">
                  {lb.cover_url ? (
                    <Image
                      src={lb.cover_url}
                      alt={lb.name}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                      sizes="176px"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <BookOpen size={24} className="text-gray-300" />
                    </div>
                  )}
                  {/* Format badge */}
                  <span className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full text-gray-600">
                    {FORMAT_LABELS[lb.format] ?? lb.format}
                  </span>
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-semibold text-gray-900 truncate">{lb.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                      <Eye size={9} /> {lb.view_count}
                    </span>
                    <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                      <Share2 size={9} /> {lb.share_count}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Lookbook viewer modal */}
      {selectedLookbook && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setSelectedLookbook(null)}
        >
          <div
            className="relative w-full max-w-lg max-h-[90vh] bg-white rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">{selectedLookbook.name}</h3>
              {selectedLookbook.description && (
                <p className="text-xs text-gray-500 mt-0.5">{selectedLookbook.description}</p>
              )}
            </div>
            {selectedLookbook.output_url ? (
              <iframe
                src={selectedLookbook.output_url}
                className="w-full"
                style={{ height: '70vh' }}
                title={selectedLookbook.name}
              />
            ) : (
              <div className="p-8 text-center text-sm text-gray-400">
                Lookbook is being generated. Check back soon!
              </div>
            )}
            <button
              onClick={() => setSelectedLookbook(null)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center text-gray-500 hover:text-gray-700"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  )
}
