'use client'

import type { PublicProduct } from '@kanchuki/shared'

interface Props {
  products: PublicProduct[]
  filterColor: string | null
  filterOccasion: string | null
  onColorChange: (color: string | null) => void
  onOccasionChange: (occasion: string | null) => void
}

export function FilterBar({
  products,
  filterColor,
  filterOccasion,
  onColorChange,
  onOccasionChange,
}: Props) {
  // Collect unique values
  const colors = Array.from(new Set(products.map((p) => p.primary_color).filter((c): c is string => c !== null)))
  const occasions = Array.from(new Set(products.flatMap((p) => p.occasions)))

  return (
    <div className="mt-2 space-y-2">
      {/* Color filter */}
      {colors.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <span className="text-xs text-gray-500 flex-shrink-0">Color:</span>
          <button
            onClick={() => onColorChange(null)}
            className={`flex-shrink-0 text-xs px-3 py-1 rounded-full border transition-colors ${
              filterColor === null
                ? 'bg-violet-600 text-white border-violet-600'
                : 'bg-white text-gray-600 border-gray-200'
            }`}
          >
            All
          </button>
          {colors.map((color) => (
            <button
              key={color}
              onClick={() => onColorChange(filterColor === color ? null : color)}
              className={`flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-colors ${
                filterColor === color
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full border border-current/30"
                style={{ backgroundColor: color.toLowerCase() }}
              />
              {color}
            </button>
          ))}
        </div>
      )}

      {/* Occasion filter */}
      {occasions.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <span className="text-xs text-gray-500 flex-shrink-0">For:</span>
          <button
            onClick={() => onOccasionChange(null)}
            className={`flex-shrink-0 text-xs px-3 py-1 rounded-full border transition-colors ${
              filterOccasion === null
                ? 'bg-violet-600 text-white border-violet-600'
                : 'bg-white text-gray-600 border-gray-200'
            }`}
          >
            All
          </button>
          {occasions.map((occasion) => (
            <button
              key={occasion}
              onClick={() => onOccasionChange(filterOccasion === occasion ? null : occasion)}
              className={`flex-shrink-0 text-xs px-3 py-1 rounded-full border transition-colors ${
                filterOccasion === occasion
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {occasion}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
