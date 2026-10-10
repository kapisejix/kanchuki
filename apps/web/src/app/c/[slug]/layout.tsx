import { API_URL as apiUrl } from '@/lib/apiUrl'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import CollectionShell from './components/CollectionShell'

// Existence is decided here, outside the shell's <Suspense>, so an unknown slug
// gets a real 404 instead of a streamed 200 "not found" (soft-404; same fix as
// [store]/layout.tsx). Only a definite API 404 counts — outages fall through.
export default async function LegacyCollectionLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  try {
    const res = await fetch(`${apiUrl}/v1/public/collections/${encodeURIComponent(slug)}?page=1&pageSize=1`, {
      next: { revalidate: 15 },
    })
    if (res.status === 404) notFound()
  } catch (e) {
    if (e instanceof Error && 'digest' in e) throw e // let notFound() through
  }
  return <CollectionShell>{children}</CollectionShell>
}
