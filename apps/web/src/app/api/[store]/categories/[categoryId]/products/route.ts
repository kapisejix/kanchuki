import { API_URL as apiUrl } from '@/lib/apiUrl';
import { type NextRequest, NextResponse } from 'next/server';

// Proxies paginated/filtered product-grid requests for a category listing to
// the public categories API — canonical equivalent of the legacy
// /api/store/[slug]/categories/[categoryId]/products route.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ store: string; categoryId: string }> },
) {
  const { store, categoryId } = await params;
  const qs = request.nextUrl.search;

  const res = await fetch(`${apiUrl}/v1/public/retailers/${store}/categories/${categoryId}${qs}`, {
    next: { revalidate: 0 },
  });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
