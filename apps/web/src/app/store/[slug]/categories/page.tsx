import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ slug: string }>
}

// Legacy /store/{public_slug}/categories → /{public_slug}/categories.
export default async function LegacyStoreCategoriesPage({ params }: Props) {
  const { slug } = await params
  redirect(`/${slug}/categories`)
}
