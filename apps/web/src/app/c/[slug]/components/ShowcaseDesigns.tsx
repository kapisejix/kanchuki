'use client'

// Suits Designs strip — rendered in ProductDetailSheet below the Related
// products block (docs/tasks/suits-designs.md §2.3). Shows the N (admin-
// configured) watermarked design thumbs for the product's garment category
// (+ related categories) with a "View more" link into the full browse route
// in a new tab. Hidden entirely when no designs match or no store slug exists
// (the web designs surface is store-scoped — legacy /c/{slug} pages without a
// public_slug have no /{store}/designs route behind them).
import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'

interface ShowcaseThumb {
  id: string
  name: string | null
  image_url: string
  category: { slug: string; name: string | null }
}

interface Props {
  productId: string
  storeSlug: string | null
}

export function ShowcaseDesigns({ productId, storeSlug }: Props) {
  const [designs, setDesigns] = useState<ShowcaseThumb[]>([])
  const [categoryName, setCategoryName] = useState<string | null>(null)

  useEffect(() => {
    if (!storeSlug) return
    let cancelled = false
    fetch(`/api/showcase-designs?product_id=${encodeURIComponent(productId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data?: { designs?: ShowcaseThumb[]; category?: { name: string | null } | null } } | null) => {
        if (!cancelled && json?.data) {
          setDesigns(json.data.designs ?? [])
          setCategoryName(json.data.category?.name ?? null)
        }
      })
      .catch(() => undefined) // Public read fails open — the strip stays hidden.
    return () => {
      cancelled = true
    }
  }, [productId, storeSlug])

  if (!storeSlug || designs.length === 0) return null

  const browseHref = `/${storeSlug}/designs?ref=${encodeURIComponent(productId)}`

  return (
    <div className="px-4 pb-2">
      <div className="border-t border-gray-100 pt-4 mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Sparkles size={14} className="text-fuchsia-600" />
          {categoryName ? `${categoryName} Designs` : 'Suits Designs'}
        </h3>
        <a
          href={browseHref}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-bold text-fuchsia-600 hover:text-fuchsia-700 transition-colors"
        >
          View more
        </a>
      </div>
      <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 scrollbar-hide snap-x snap-mandatory">
        {designs.map((d) => (
          <Link
            key={d.id}
            href={`/${storeSlug}/designs/${d.id}`}
            className="flex-shrink-0 w-28 snap-start group"
          >
            <div className="relative w-28 h-36 rounded-xl overflow-hidden bg-gray-50 border border-gray-100 group-hover:border-fuchsia-200 group-hover:shadow-soft transition-all">
              {d.image_url ? (
                <Image
                  src={d.image_url}
                  alt={d.name ?? d.category.name ?? 'Design'}
                  fill
                  sizes="112px"
                  className="object-cover group-hover:scale-[1.05] transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Sparkles size={20} className="text-gray-300" />
                </div>
              )}
            </div>
            {d.name ? (
              <p className="text-xs font-medium text-gray-900 mt-1.5 truncate">{d.name}</p>
            ) : (
              <p className="text-[10px] font-medium text-gray-500 mt-1.5 truncate">
                {d.category.name ?? 'Design'}
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
