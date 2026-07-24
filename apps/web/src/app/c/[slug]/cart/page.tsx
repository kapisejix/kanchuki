import { notFound } from 'next/navigation'
import { fetchCollection } from '../lib/fetchCollection'
import { CartPage } from './CartPage'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function CartPageRoute({ params }: Props) {
  const { slug } = await params
  const collection = await fetchCollection(slug)
  if (!collection) notFound()

  return (
    <CartPage
      slug={slug}
      shopName={collection.retailer.shop_name}
      checkoutEnabled={false} // checked client-side via retailer-status endpoint
    />
  )
}
