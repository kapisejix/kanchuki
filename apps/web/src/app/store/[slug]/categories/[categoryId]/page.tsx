import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ slug: string; categoryId: string }>
}

// Legacy /store/{public_slug}/categories/{categoryId} → canonical.
export default async function LegacyStoreCategoryPage({ params }: Props) {
  const { slug, categoryId } = await params
  redirect(`/${slug}/categories/${categoryId}`)
}
