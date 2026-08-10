import { API_URL as apiUrl } from '@/lib/apiUrl';
import { type NextRequest, NextResponse } from 'next/server';

// Proxies paginated/filtered product-grid requests for the store's full
// catalog ("All Products" tile) to the public retailers API — canonical
// equivalent of the category-products proxy.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ store: string }> },
) {
  const { store } = await params;
  const qs = request.nextUrl.search;

  const res = await fetch(`${apiUrl}/v1/public/retailers/${store}/products${qs}`, {
    next: { revalidate: 0 },
  });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
