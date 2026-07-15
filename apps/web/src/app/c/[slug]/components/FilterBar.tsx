'use client'

import type { PublicProduct } from '@kanchuki/shared'

// Price buckets (paise, matches formatPriceRange units)
const PRICE_BUCKETS = [
  { label: 'Under ₹1000', max: 100_000 },
  { label: '₹1000–2500', min: 100_000, max: 250_000 },
  { label: '₹2500–5000', min: 250_000, max: 500_000 },
  { label: 'Above ₹5000', min: 500_000 },
] as const

export function priceMatchesBucket(priceMin: number | null, bucketLabel: string | null): boolean {
  if (!bucketLabel) return true
  const bucket = PRICE_BUCKETS.find((b) => b.label === bucketLabel)
  if (!bucket) return true
  const price = priceMin ?? 0
  if ('min' in bucket && price < bucket.min) return false
  if ('max' in bucket && price >= bucket.max) return false
  return true
}

interface Props {
  products: PublicProduct[]
  filterCategory: string | null
  filterOccasion: string | null
  filterPrice: string | null
  filterColor: string | null
  onCategoryChange: (category: string | null) => void
  onOccasionChange: (occasion: string | null) => void
  onPriceChange: (price: string | null) => void
  onColorChange: (color: string | null) => void
}

export function FilterBar({
  products,
  filterCategory,
  filterOccasion,
  filterPrice,
  filterColor,
  onCategoryChange,
  onOccasionChange,
  onPriceChange,
  onColorChange,
}: Props) {
  // Collect unique values
  const categories = Array.from(new Set(products.map((p) => p.category).filter((c): c is string => c !== null)))
  const occasions = Array.from(new Set(products.flatMap((p) => p.occasions)))
  const colors = Array.from(new Set(products.map((p) => p.primary_color).filter((c): c is string => c !== null)))

  return (
    <div className="mt-2 space-y-2">
      {/* Category filter */}
      {categories.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <span className="text-xs text-gray-500 flex-shrink-0">Category:</span>
          <button
            onClick={() => onCategoryChange(null)}
            className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1 ${
              filterCategory === null
                ? 'bg-cyan-600 text-white border-cyan-600 shadow-soft'
                : 'bg-white text-gray-600 border-gray-200 hover:border-cyan-200 hover:text-cyan-700'
            }`}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => onCategoryChange(filterCategory === category ? null : category)}
              className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1 ${
                filterCategory === category
                  ? 'bg-cyan-600 text-white border-cyan-600 shadow-soft'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-cyan-200 hover:text-cyan-700'
              }`}
            >
              {category}
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
            className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1 ${
              filterOccasion === null
                ? 'bg-cyan-600 text-white border-cyan-600 shadow-soft'
                : 'bg-white text-gray-600 border-gray-200 hover:border-cyan-200 hover:text-cyan-700'
            }`}
          >
            All
          </button>
          {occasions.map((occasion) => (
            <button
              key={occasion}
              onClick={() => onOccasionChange(filterOccasion === occasion ? null : occasion)}
              className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1 ${
                filterOccasion === occasion
                  ? 'bg-cyan-600 text-white border-cyan-600 shadow-soft'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-cyan-200 hover:text-cyan-700'
              }`}
            >
              {occasion}
            </button>
          ))}
        </div>
      )}

      {/* Price filter */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <span className="text-xs text-gray-500 flex-shrink-0">Price:</span>
        <button
          onClick={() => onPriceChange(null)}
          className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1 ${
            filterPrice === null
              ? 'bg-cyan-600 text-white border-cyan-600 shadow-soft'
              : 'bg-white text-gray-600 border-gray-200 hover:border-cyan-200 hover:text-cyan-700'
          }`}
        >
          All
        </button>
        {PRICE_BUCKETS.map((bucket) => (
          <button
            key={bucket.label}
            onClick={() => onPriceChange(filterPrice === bucket.label ? null : bucket.label)}
            className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1 ${
              filterPrice === bucket.label
                ? 'bg-cyan-600 text-white border-cyan-600 shadow-soft'
                : 'bg-white text-gray-600 border-gray-200 hover:border-cyan-200 hover:text-cyan-700'
            }`}
          >
            {bucket.label}
          </button>
        ))}
      </div>

      {/* Color filter */}
      {colors.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <span className="text-xs text-gray-500 flex-shrink-0">Color:</span>
          <button
            onClick={() => onColorChange(null)}
            className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1 ${
              filterColor === null
                ? 'bg-cyan-600 text-white border-cyan-600 shadow-soft'
                : 'bg-white text-gray-600 border-gray-200 hover:border-cyan-200 hover:text-cyan-700'
            }`}
          >
            All
          </button>
          {colors.map((color) => (
            <button
              key={color}
              onClick={() => onColorChange(filterColor === color ? null : color)}
              className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1 ${
                filterColor === color
                  ? 'bg-cyan-600 text-white border-cyan-600 shadow-soft'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-cyan-200 hover:text-cyan-700'
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
    </div>
  )
}
