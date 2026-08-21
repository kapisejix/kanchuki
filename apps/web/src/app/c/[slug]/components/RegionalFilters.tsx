'use client'

import { MapPin } from 'lucide-react'

const REGIONAL_STYLES = [
  { key: 'banarasi', label: 'Banarasi', icon: '🪷', region: 'Varanasi, UP' },
  { key: 'kanjeevaram', label: 'Kanjeevaram', icon: '🏛️', region: 'Tamil Nadu' },
  { key: 'chanderi', label: 'Chanderi', icon: '✨', region: 'Madhya Pradesh' },
  { key: 'bandhani', label: 'Bandhani', icon: '🔴', region: 'Rajasthan/Gujarat' },
  { key: 'chikankari', label: 'Chikankari', icon: '🌸', region: 'Lucknow, UP' },
  { key: 'phulkari', label: 'Phulkari', icon: '🌻', region: 'Punjab' },
  { key: 'ikat', label: 'Ikat', icon: '🎨', region: 'Odisha/Andhra' },
  { key: 'paithani', label: 'Paithani', icon: '🦚', region: 'Maharashtra' },
  { key: 'pochampally', label: 'Pochampally', icon: '🌈', region: 'Telangana' },
  { key: 'block_print', label: 'Block Print', icon: '🧱', region: 'Rajasthan' },
  { key: 'zari', label: 'Zari Work', icon: '💎', region: 'Pan-India' },
  { key: 'embroidered', label: 'Embroidered', icon: '🪡', region: 'Pan-India' },
] as const

interface Props {
  activeFilter: string | null
  onFilterChange: (filter: string | null) => void
}

export function RegionalFilters({ activeFilter, onFilterChange }: Props) {
  return (
    <section className="mb-4">
      <div className="flex items-center gap-2 mb-2 px-1">
        <MapPin size={14} className="text-orange-500" />
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Shop by Region & Weave</h2>
      </div>
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-hide snap-x snap-mandatory">
        {REGIONAL_STYLES.map((style) => (
          <button
            key={style.key}
            onClick={() => onFilterChange(activeFilter === style.key ? null : style.key)}
            className={`flex-shrink-0 snap-start flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all ${
              activeFilter === style.key
                ? 'bg-orange-100 border border-orange-300 shadow-sm'
                : 'bg-white border border-gray-100 hover:border-orange-200'
            }`}
          >
            <span className="text-base">{style.icon}</span>
            <span className={`text-[10px] font-semibold whitespace-nowrap ${
              activeFilter === style.key ? 'text-orange-800' : 'text-gray-700'
            }`}>
              {style.label}
            </span>
            <span className="text-[8px] text-gray-400 whitespace-nowrap">{style.region}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
