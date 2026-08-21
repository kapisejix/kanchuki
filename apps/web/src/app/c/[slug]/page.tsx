import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { CollectionView } from './components/CollectionView'
import { SuspendedNotice } from './components/SuspendedNotice'
import { fetchCollection } from './lib/fetchCollection'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const collection = await fetchCollection(slug, { page: 1, pageSize: 1 })
  if (!collection) return { title: 'Collection Not Found | Kanchuki' }

  return {
    title: `${collection.title} — ${collection.retailer.shop_name} | Kanchuki`,
    description: `Browse ${collection.total} handpicked outfits from ${collection.retailer.shop_name}, ${collection.retailer.city}`,
    openGraph: {
      title: collection.title,
      description: `${collection.total} products from ${collection.retailer.shop_name}`,
      images: collection.products[0]?.primary_photo_url
        ? [{ url: collection.products[0].primary_photo_url }]
        : [],
    },
  }
}

export default async function LegacyCollectionPage({ params }: Props) {
  const { slug } = await params
  const collection = await fetchCollection(slug, { page: 1, pageSize: 12 })
  if (!collection) notFound()

  // F-015: suspended retailer — retailer/products fields aren't populated,
  // show a notice instead of rendering CollectionView against missing data.
  if (collection.suspended) {
    return <SuspendedNotice shopName={collection.retailer.shop_name} />
  }

  // Legacy /c/{slug} link: redirect to the canonical /{public_slug}/{slug}
  // when the retailer has a store slug (shared links sent before the 2026-08-09
  // URL change keep working). Retailers without a public_slug get /c/{slug}
  // links from the API — render the legacy page for those.
  const store = collection.retailer.public_slug
  if (store) redirect(`/${store}/${slug}`)

  return <CollectionView collection={collection} slug={slug} productsApiPath={`/api/c/${slug}/products`} />
}
