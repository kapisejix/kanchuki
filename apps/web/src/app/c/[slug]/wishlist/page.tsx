import { notFound } from 'next/navigation'
import { fetchCollection } from '../lib/fetchCollection'
import { WishlistView } from './WishlistView'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function WishlistPage({ params }: Props) {
  const { slug } = await params
  const collection = await fetchCollection(slug)
  if (!collection) notFound()

  return <WishlistView collection={collection} slug={slug} />
}
