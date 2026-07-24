import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { PublicCollection } from '@kanchuki/shared'
import { CollectionView } from '../../../../c/[slug]/components/CollectionView'

interface Props {
  params: Promise<{ slug: string; categoryId: string }>
}

async function fetchCategory(
  slug: string,
  categoryId: string,
  params?: { page?: number; pageSize?: number },
): Promise<PublicCollection | null> {
  const apiUrl = process.env['API_URL'] ?? 'http://localhost:3001'
  const qs = params
    ? `?${new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      )}`
    : ''
  try {
    const res = await fetch(`${apiUrl}/v1/public/retailers/${slug}/categories/${categoryId}${qs}`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data: PublicCollection }
    return json.data
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, categoryId } = await params
  const category = await fetchCategory(slug, categoryId, { page: 1, pageSize: 1 })
  if (!category) return { title: 'Category Not Found | Kanchuki' }
  return {
    title: `${category.title} — ${category.retailer.shop_name} | Kanchuki`,
    description: `Browse ${category.total} products from ${category.retailer.shop_name}`,
  }
}

export default async function StoreCategoryProductsPage({ params }: Props) {
  const { slug, categoryId } = await params
  const category = await fetchCategory(slug, categoryId, { page: 1, pageSize: 12 })
  if (!category) notFound()

  // Reuses CollectionView as-is — the public API shapes category products
  // identically to a collection. `slug` here only scopes the client-side
  // wishlist localStorage key and the best-effort favorite-count ping.
  return (
    <CollectionView
      collection={category}
      slug={`cat-${categoryId}`}
      productsApiPath={`/api/store/${slug}/categories/${categoryId}/products`}
    />
  )
}
