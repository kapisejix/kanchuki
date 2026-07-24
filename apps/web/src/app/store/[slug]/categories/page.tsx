import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Store } from 'lucide-react'

interface PublicCategory {
  id: string
  name: string
  image_url: string | null
  product_count: number
}

interface StoreCategoriesData {
  shop_name: string
  city: string | null
  storefront_slug: string | null
  categories: PublicCategory[]
}

interface Props {
  params: Promise<{ slug: string }>
}

async function fetchData(slug: string): Promise<StoreCategoriesData | null> {
  const apiUrl = process.env['API_URL'] ?? 'http://localhost:3001'
  try {
    const [profileRes, categoriesRes] = await Promise.all([
      fetch(`${apiUrl}/v1/public/retailers/${slug}`, { next: { revalidate: 60 } }),
      fetch(`${apiUrl}/v1/public/retailers/${slug}/categories`, { next: { revalidate: 60 } }),
    ])
    if (!profileRes.ok) return null
    const profile = (await profileRes.json()) as {
      data: { shop_name: string; city: string | null; storefront_slug: string | null }
    }
    const categories = categoriesRes.ok
      ? ((await categoriesRes.json()) as { data: PublicCategory[] }).data
      : []
    return { ...profile.data, categories }
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const data = await fetchData(slug)
  if (!data) return { title: 'Store Not Found | Kanchuki' }
  return { title: `${data.shop_name} — Categories | Kanchuki` }
}

export default async function StoreCategoriesPage({ params }: Props) {
  const { slug } = await params
  const data = await fetchData(slug)
  if (!data) notFound()

  // No categories set up yet — fall back to the retailer's single storefront
  // collection (pre-category behavior), or a friendly "coming soon" state.
  if (data.categories.length === 0) {
    if (data.storefront_slug) redirect(`/c/${data.storefront_slug}`)
    return (
      <div className="min-h-screen bg-cyan-50 flex flex-col items-center justify-center px-6 gap-4">
        <div className="w-14 h-14 bg-cyan-100 rounded-full items-center justify-center flex">
          <Store size={26} className="text-cyan-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">{data.shop_name}</h1>
        <p className="text-sm text-gray-400">Catalog coming soon.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-md mx-auto px-4 py-3.5">
          <p className="text-[11px] text-cyan-700/80 font-semibold uppercase tracking-wider truncate">
            {data.shop_name}
            {data.city ? ` · ${data.city}` : ''}
          </p>
          <h1 className="font-display text-lg font-bold text-gray-900 leading-tight tracking-tight">
            Browse by Category
          </h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-5 grid grid-cols-2 gap-3">
        {data.categories.map((cat) => (
          <Link
            key={cat.id}
            href={`/store/${slug}/categories/${cat.id}`}
            className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm active:scale-[0.98] transition-transform"
          >
            <div className="w-full aspect-square bg-gray-100 relative">
              {cat.image_url ? (
                <Image src={cat.image_url} alt={cat.name} fill className="object-cover" sizes="200px" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl">🗂️</div>
              )}
            </div>
            <div className="p-3">
              <p className="text-sm font-semibold text-gray-900 truncate">{cat.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {cat.product_count} product{cat.product_count === 1 ? '' : 's'}
              </p>
            </div>
          </Link>
        ))}
      </main>
    </div>
  )
}
