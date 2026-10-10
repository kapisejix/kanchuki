import { API_URL as apiUrl } from '@/lib/apiUrl';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

// Decide "does this store exist" ABOVE the segment's loading.tsx Suspense
// boundary. A notFound() thrown inside the page runs after loading.tsx has
// already flushed the 200 status line, so unknown stores soft-404'd (see
// docs/tasks/pending/storefront-soft-404.md). A layout is outside that
// boundary, so notFound() here still produces a real 404.
// Same URL + revalidate as the pages' own profile fetch → Next dedupes it.
// ponytail: only a definite 404 is trusted; API 5xx/network errors fall through
// to the page's own handling instead of 404ing a real store during an outage.
export default async function StoreLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ store: string }>;
}) {
  const { store } = await params;
  try {
    const res = await fetch(`${apiUrl}/v1/public/retailers/${store}`, {
      next: { revalidate: 60 },
    });
    if (res.status === 404) notFound();
  } catch (e) {
    if (e instanceof Error && 'digest' in e) throw e; // let notFound() through
  }
  return children;
}
