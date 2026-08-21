'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { X, Share2, Scissors, ChevronDown } from 'lucide-react'

interface Design {
  id: string
  category: string
  option: string
  name: string
  image_url: string
  description: string | null
}

interface Props {
  retailerPhone: string
  retailerName: string
}

const CATEGORY_LABELS: Record<string, string> = {
  NECKLINE: 'Neckline (Gala)',
  BLOUSE_BACK: 'Blouse Back Design',
  SLEEVE: 'Sleeve / Shoulder',
  SALWAR: 'Salwar / Bottom',
  SILHOUETTE: 'Kurti / Silhouette',
}

const CATEGORY_ICONS: Record<string, string> = {
  NECKLINE: '✂️',
  BLOUSE_BACK: '👗',
  Sleeve: '💪',
  SALWAR: '👖',
  SILHOUETTE: '👗',
}

export function DesignGallery({ retailerPhone, retailerName }: Props) {
  const [designs, setDesigns] = useState<Design[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [selectedDesign, setSelectedDesign] = useState<Design | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/designs')
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data: Design[] } | null) => {
        if (!cancelled && json?.data) {
          setDesigns(json.data)
          // Auto-select first category
          if (json.data.length > 0) {
            const cats = Array.from(new Set(json.data.map((d) => d.category)))
            if (cats.length > 0) setActiveCategory(cats[0]!)
          }
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const categories = Array.from(new Set(designs.map((d) => d.category)))
  const filteredDesigns = activeCategory
    ? designs.filter((d) => d.category === activeCategory)
    : designs

  const handleShare = useCallback((design: Design) => {
    const message = `Hi! I'd like this design for my unstitched suit:\n\n${design.name} (${design.category.replace(/_/g, ' ').toLowerCase()})\n\nPlease share this with my tailor.`
    const phone = retailerPhone.replace(/\D/g, '')
    const fullPhone = phone.startsWith('91') ? phone : `91${phone}`
    const url = `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`
    window.open(url, '_blank')
  }, [retailerPhone])

  if (loading) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-4">
        <div className="flex items-center justify-center py-6">
          <div className="w-6 h-6 border-2 border-gray-200 border-t-cyan-600 rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (designs.length === 0) return null

  return (
    <>
      <section className="bg-white border border-gray-100 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Scissors size={16} className="text-pink-500" />
          <h3 className="text-sm font-bold text-gray-900">Explore Designs</h3>
          <span className="text-[10px] text-gray-400 ml-auto">{designs.length} references</span>
        </div>
        <p className="text-[10px] text-gray-500 mb-3">
          Browse neckline, sleeve, and silhouette references — share to your tailor via WhatsApp
        </p>

        {/* Category tabs */}
        <div className="flex gap-1.5 overflow-x-auto mb-3 scrollbar-hide">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[10px] font-semibold transition-all ${
                activeCategory === cat
                  ? 'bg-pink-600 text-white'
                  : 'bg-gray-50 text-gray-600 border border-gray-200 hover:border-pink-200'
              }`}
            >
              {CATEGORY_LABELS[cat] ?? cat}
            </button>
          ))}
        </div>

        {/* Design grid */}
        <div className="grid grid-cols-3 gap-2">
          {filteredDesigns.map((design) => (
            <button
              key={design.id}
              onClick={() => setSelectedDesign(design)}
              className="group relative aspect-[3/4] rounded-xl overflow-hidden bg-gray-100 border border-gray-100 hover:border-pink-200 transition-colors"
            >
              <Image
                src={design.image_url}
                alt={design.name}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-300"
                sizes="120px"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent pt-6 px-1.5 pb-1.5">
                <p className="text-white text-[9px] font-semibold truncate">{design.name}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Design detail modal */}
      {selectedDesign && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setSelectedDesign(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-sm w-full mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative aspect-[3/4] bg-gray-100">
              <Image
                src={selectedDesign.image_url}
                alt={selectedDesign.name}
                fill
                className="object-cover"
                sizes="400px"
              />
              <button
                onClick={() => setSelectedDesign(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center"
              >
                <X size={14} className="text-gray-600" />
              </button>
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                <p className="text-white text-sm font-bold">{selectedDesign.name}</p>
                <p className="text-white/70 text-xs capitalize">
                  {selectedDesign.category.replace(/_/g, ' ').toLowerCase()}
                </p>
              </div>
            </div>
            {selectedDesign.description && (
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs text-gray-600">{selectedDesign.description}</p>
              </div>
            )}
            <div className="p-4 space-y-2">
              <button
                onClick={() => handleShare(selectedDesign)}
                className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <Share2 size={16} />
                Share to Tailor via WhatsApp
              </button>
              <button
                onClick={() => setSelectedDesign(null)}
                className="w-full text-xs text-gray-500 hover:text-gray-700 py-2 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
