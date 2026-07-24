import { notFound } from 'next/navigation'
import { fetchCollection } from '../lib/fetchCollection'
import { CheckoutForm } from './CheckoutForm'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function CheckoutPageRoute({ params }: Props) {
  const { slug } = await params
  const collection = await fetchCollection(slug)
  if (!collection) notFound()

  return (
    <CheckoutForm
      slug={slug}
      shopName={collection.retailer.shop_name}
      retailerPhone={collection.retailer.phone}
    />
  )
}

