'use client'

import { PUBLIC_PRICE_BUCKETS } from '@kanchuki/shared'

// Facet option shape returned by the public API: a value plus how many
// products carry it (drives the "All (10)", "Kurta (1)" chip labels).
export interface FilterOption {
  value: string
  count: number
}

function chipClass(active: boolean): string {
  return `flex-shrink-0 text-xs font-semibold px-3.5 py-1.5 rounded-full border transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#231F48] focus-visible:ring-offset-1 ${
    active
      ? 'bg-[#231F48] text-white border-[#231F48] shadow-sm'
      : 'bg-white text-[#231F48] border-[#E0E1F6] hover:border-[#BB3F95] hover:text-[#BB3F95]'
  }`
}

// Always-visible category chip row rendered above the product grid — the
// category filter is the primary browse axis, so it's never hidden behind
// the filter toggle. The "All" chip carries the collection total.
interface CategoryChipsProps {
  categories: FilterOption[]
  filterCategory: string | null
  totalCount: number
  onCategoryChange: (category: string | null) => void
}

export function CategoryChips({
  categories,
  filterCategory,
  totalCount,
  onCategoryChange,
}: CategoryChipsProps) {
  if (categories.length === 0) return null

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide" role="group" aria-label="Filter by category">
      <span className="text-xs text-gray-500 flex-shrink-0">Category:</span>
      <button
        onClick={() => onCategoryChange(null)}
        className={chipClass(filterCategory === null)}
      >
        All ({totalCount})
      </button>
      {categories.map((category) => (
        <button
          key={category.value}
          onClick={() => onCategoryChange(filterCategory === category.value ? null : category.value)}
          className={chipClass(filterCategory === category.value)}
        >
          {category.value} ({category.count})
        </button>
      ))}
    </div>
  )
}

// Secondary filters (price / color) — revealed behind the filter toggle. The
// category row lives in CategoryChips above the grid instead.
interface FilterBarProps {
  colors: FilterOption[]
  filterPrice: string | null
  filterColor: string | null
  onPriceChange: (price: string | null) => void
  onColorChange: (color: string | null) => void
}

export function FilterBar({
  colors,
  filterPrice,
  filterColor,
  onPriceChange,
  onColorChange,
}: FilterBarProps) {
  return (
    <div className="mt-2 space-y-2">
      {/* Price filter */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <span className="text-xs text-gray-500 flex-shrink-0">Price:</span>
        <button
          onClick={() => onPriceChange(null)}
          className={chipClass(filterPrice === null)}
        >
          All
        </button>
        {PUBLIC_PRICE_BUCKETS.map((bucket) => (
          <button
            key={bucket.label}
            onClick={() => onPriceChange(filterPrice === bucket.label ? null : bucket.label)}
            className={chipClass(filterPrice === bucket.label)}
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
            className={chipClass(filterColor === null)}
          >
            All
          </button>
          {colors.map((color) => (
            <button
              key={color.value}
              onClick={() => onColorChange(filterColor === color.value ? null : color.value)}
              className={`flex-shrink-0 flex items-center gap-1.5 ${chipClass(filterColor === color.value)}`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full border border-current/30"
                style={{ backgroundColor: color.value.toLowerCase() }}
              />
              {color.value} ({color.count})
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
