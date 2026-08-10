import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ slug: string }>
}

// Legacy /store/{public_slug} → canonical /{public_slug} (QR codes printed
// before 2026-08-09 encode the /store/ prefix — keep them resolving).
export default async function LegacyStorePage({ params }: Props) {
  const { slug } = await params
  redirect(`/${slug}`)
}
