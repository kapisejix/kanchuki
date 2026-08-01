import { notFound } from 'next/navigation'
import { API_URL as apiUrl } from '@/lib/apiUrl'
import { fetchCollection } from '../lib/fetchCollection'
import { CartPage } from './CartPage'

interface Props {
  params: Promise<{ slug: string }>
}

// Server-side checkout status for the cart's "Proceed to Checkout" gate —
// previously hardcoded `false`, which dead-ended the flow at the cart even for
// checkout-enabled retailers. Mirrors fetchCollection's API_URL + ISR pattern.
async function fetchCheckoutEnabled(slug: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${apiUrl}/v1/public/checkout/retailer-status/${slug}`,
      { next: { revalidate: 60 } },
    )
    if (!res.ok) return false
    const json = (await res.json()) as { data: { checkout_enabled: boolean } }
    return json.data?.checkout_enabled ?? false
  } catch {
    return false
  }
}

export default async function CartPageRoute({ params }: Props) {
  const { slug } = await params
  const collection = await fetchCollection(slug)
  if (!collection) notFound()

  return (
    <CartPage
      slug={slug}
      shopName={collection.retailer.shop_name}
      checkoutEnabled={await fetchCheckoutEnabled(slug)}
    />
  )
}
