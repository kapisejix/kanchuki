'use client'

// Client half of the storefront designs browser (/{store}/designs) — chips +
// 2-col grid, refetching through the /api/showcase-designs proxy on category
// change. Server half (page.tsx) resolves the store + first feed.
import { useCallback, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, Sparkles, Store } from 'lucide-react'
import type { StoreProfile } from './lib'
import type { BrowseResponse, PublicShowcaseDesign } from './types'

interface Props {
  store: string
  profile: StoreProfile
  initialData: BrowseResponse
  initialCategory: string | null
}

// Chip set = the API's expanded `related` slugs (only present once a category
// filter is active) UNION the categories actually present in the returned
// rows — so an unfiltered browse still shows chips for what's on screen.
// Labels resolve from the rows' own category names (slugs are admin-set).
function deriveChips(data: BrowseResponse): { slug: string; name: string }[] {
  const chips: { slug: string; name: string }[] = []
  const seen = new Set<string>()
  for (const d of data.designs) {
    const slug = d.category.slug
    if (!seen.has(slug)) {
      seen.add(slug)
      chips.push({ slug, name: d.category.name ?? slug })
    }
  }
  for (const slug of data.related) {
    if (!seen.has(slug)) {
      seen.add(slug)
      chips.push({ slug, name: slug })
    }
  }
  return chips
}

export function DesignsBrowse({ store, profile, initialData, initialCategory }: Props) {
  const [activeSlug, setActiveSlug] = useState<string | null>(initialCategory)
  const [data, setData] = useState<BrowseResponse>(initialData)
  const [loading, setLoading] = useState(false)

  // Server renders the initial feed (with initialCategory applied, when set);
  // only chip clicks refetch through the proxy.
  const chips = useMemo(() => deriveChips(data), [data])
  const activeChip = chips.find((c) => c.slug === activeSlug)
  const title = activeChip ? `${activeChip.name} Designs` : 'Designs'

  const load = useCallback(
    async (slug: string | null) => {
      setLoading(true)
      setActiveSlug(slug)
      try {
        const qs = new URLSearchParams({ store })
        if (slug) qs.set('category', slug)
        const res = await fetch(`/api/showcase-designs?${qs}`)
        const json = (await res.json()) as { data?: BrowseResponse }
        if (json.data) setData(json.data)
      } catch {
        // Keep the last good feed on a network blip.
      } finally {
        setLoading(false)
      }
    },
    [store],
  )

  return (
    <div className="min-h-screen bg-[#F8F7FC] font-sans pb-16">
      {/* ── Storefront header — back to the store, shop identity ── */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E0E1F6] pt-safe">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link
            href={`/${store}`}
            prefetch
            className="w-9 h-9 rounded-2xl bg-white border border-[#E0E1F6] flex items-center justify-center text-[#231F48] shadow-sm hover:border-[#BB3F95] transition"
            aria-label="Back to store"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-0 text-center">
            <h1 className="font-bold text-sm text-[#231F48] truncate">{profile.shop_name} Designs</h1>
            {profile.city && <p className="text-[10px] text-[#6B4773] font-medium">{profile.city}</p>}
          </div>
          <div className="w-9 h-9 rounded-2xl overflow-hidden bg-[#E0E1F6] border border-[#E0E1F6] flex items-center justify-center flex-shrink-0">
            {profile.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- storefront avatar, no next/image optimiser parity needed
              <img src={profile.logo_url} alt={profile.shop_name} className="object-cover w-full h-full" />
            ) : (
              <span className="font-bold text-[#231F48] text-sm">{profile.shop_name.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-4">
        {/* ── Category chips (expanded related set) ── */}
        {chips.length > 0 && (
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-hide">
            <button
              onClick={() => void load(null)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-full border text-xs font-bold transition-all ${
                !activeSlug
                  ? 'bg-[#231F48] border-[#231F48] text-white'
                  : 'bg-white border-[#E0E1F6] text-[#231F48] hover:border-[#BB3F95]'
              }`}
            >
              All
            </button>
            {chips.map((c) => (
              <button
                key={c.slug}
                onClick={() => void load(c.slug)}
                className={`flex-shrink-0 px-3.5 py-1.5 rounded-full border text-xs font-bold transition-all ${
                  activeSlug === c.slug
                    ? 'bg-[#231F48] border-[#231F48] text-white'
                    : 'bg-white border-[#E0E1F6] text-[#231F48] hover:border-[#BB3F95]'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* ── Feed summary ── */}
        <p className="text-xs text-[#6B4773] font-medium mt-3 mb-3 flex items-center gap-1.5">
          <Sparkles size={13} className="text-[#BB3F95]" />
          {loading ? 'Loading designs…' : `${data.designs.length} design${data.designs.length === 1 ? '' : 's'}`}
        </p>

        {data.designs.length === 0 && !loading ? (
          <div className="py-16 text-center">
            <Store size={28} className="mx-auto text-[#E0E1F6] mb-2" />
            <p className="text-sm text-[#6B4773] font-medium">No designs here yet — check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {data.designs.map((d) => (
              <DesignCard key={d.id} design={d} storeSlug={store} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function DesignCard({ design, storeSlug }: { design: PublicShowcaseDesign; storeSlug: string }) {
  const alt = design.name ?? design.category.name ?? 'Design'
  return (
    <Link
      href={`/${storeSlug}/designs/${design.id}`}
      prefetch
      className="bg-white rounded-2xl overflow-hidden border border-[#E0E1F6] shadow-sm group hover:border-[#BB3F95]/40 transition-all"
    >
      <div className="relative w-full aspect-[3/4] bg-[#F8F7FC]">
        {design.image_url ? (
          <Image
            src={design.image_url}
            alt={alt}
            fill
            sizes="(max-width: 640px) 45vw, 240px"
            className="object-cover group-hover:scale-[1.03] transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Sparkles size={24} className="text-[#E0E1F6]" />
          </div>
        )}
      </div>
      <div className="px-2.5 py-2">
        <p className="text-xs font-bold text-[#231F48] truncate">{alt}</p>
        {design.store?.shop_name ? (
          <p className="text-[10px] text-[#6B4773] font-medium mt-0.5 truncate">{design.store.shop_name}</p>
        ) : (
          <p className="text-[10px] text-[#6B4773] font-medium mt-0.5 truncate">{design.category.name ?? 'Design'}</p>
        )}
      </div>
    </Link>
  )
}
