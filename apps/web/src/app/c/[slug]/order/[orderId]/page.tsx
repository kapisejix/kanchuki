import { notFound } from 'next/navigation'
import { fetchCollection } from '../../lib/fetchCollection'
import { OrderView } from './OrderView'

interface Props {
  params: Promise<{ slug: string; orderId: string }>
}

export default async function OrderPage({ params }: Props) {
  const { slug, orderId } = await params
  const collection = await fetchCollection(slug)
  if (!collection) notFound()

  return <OrderView slug={slug} orderId={orderId} />
}
