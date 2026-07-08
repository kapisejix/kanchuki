import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { PublicCollection } from '@kanchuki/shared'
import { CollectionView } from './components/CollectionView'

interface Props {
  params: Promise<{ slug: string }>
}

async function fetchCollection(slug: string): Promise<PublicCollection | null> {
  const apiUrl = process.env['API_URL'] ?? 'http://localhost:3001'
  try {
    const res = await fetch(`${apiUrl}/v1/public/collections/${slug}`, {
      next: { revalidate: 60 }, // ISR — revalidate every 60s
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data: PublicCollection }
    return json.data
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const collection = await fetchCollection(slug)
  if (!collection) return { title: 'Collection Not Found | Kanchuki' }

  return {
    title: `${collection.title} — ${collection.retailer.shop_name} | Kanchuki`,
    description: `Browse ${collection.products.length} handpicked outfits from ${collection.retailer.shop_name}, ${collection.retailer.city}`,
    openGraph: {
      title: collection.title,
      description: `${collection.products.length} products from ${collection.retailer.shop_name}`,
      images: collection.products[0]?.primary_photo_url
        ? [{ url: collection.products[0].primary_photo_url }]
        : [],
    },
  }
}

export default async function CollectionPage({ params }: Props) {
  const { slug } = await params
  const collection = await fetchCollection(slug)
  if (!collection) notFound()

  return <CollectionView collection={collection} slug={slug} />
}
