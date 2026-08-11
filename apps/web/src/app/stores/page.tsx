import type { Metadata } from 'next'
import { API_URL } from '@/lib/apiUrl'
import { Footer, Navbar, PageHero, Section } from '@/components/site/Chrome'
import StoresDirectory from './StoresDirectory'

export const metadata: Metadata = {
  title: 'Store Directory — Real Clothing Stores on Kanchuki',
  description:
    'Browse real clothing stores on Kanchuki — suits, sarees, kurtis, lehengas and more, searchable by city. Message shops directly on WhatsApp.',
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kanchuki.app'
export const revalidate = 300 // 5 min — the directory page itself; filters run client-side

export interface StoreCardData {
  public_slug: string
  shop_name: string
  city: string | null
  logo_url: string | null
  product_count: number
}

export interface StoresDirectoryData {
  stores: StoreCardData[]
  total: number
  page: number
  page_size: number
  total_pages: number
  cities: { city: string; count: number }[]
}

async function fetchDirectory(): Promise<StoresDirectoryData | null> {
  try {
    const res = await fetch(`${API_URL}/v1/public/stores?page=1&pageSize=12`, {
      next: { revalidate },
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data: StoresDirectoryData }
    return json.data
  } catch {
    return null
  }
}

export default async function StoresPage() {
  const initial = await fetchDirectory()

  // JSON-LD ItemList of ClothingStore — real stores only, from the live
  // directory (docs/content/pages/stores.md; honesty gate: never invent
  // entries, so this lists whatever page 1 actually returned).
  const itemList = initial?.stores.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Clothing stores on Kanchuki',
        itemListElement: initial.stores.map((s, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          item: {
            '@type': 'ClothingStore',
            name: s.shop_name,
            url: `${SITE_URL}/${s.public_slug}`,
            ...(s.city ? { address: { '@type': 'PostalAddress', addressLocality: s.city } } : {}),
          },
        })),
      }
    : null

  return (
    <>
      {itemList && (
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD built from our own retailer data, no user input
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
        />
      )}
      <Navbar />
      <PageHero
        tag="Store Directory"
        title="Shop real clothing stores on Kanchuki."
        lead="Every store here is a real shop — with a real owner you can message directly. Browse by city, search for a store, and see their actual catalog."
      />
      <Section className="pt-4 sm:pt-6">
        <StoresDirectory initial={initial} />
      </Section>
      <Footer />
    </>
  )
}
