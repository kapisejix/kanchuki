import { NextResponse } from 'next/server'
import { API_URL as apiUrl } from '@/lib/apiUrl'

// Proxies order creation to the public API so the browser never needs the
// internal API_URL — same pattern as apps/web/src/app/api/c/[slug]/products.
//
// X-Forwarded-For is forwarded because the API rate-limits create-order per IP
// (5/min, SECURITY §11.5) and trustProxy=true makes request.ip come from that
// header — without it every customer would share the web service's IP bucket.
export async function POST(request: Request) {
  const body = await request.text()
  const xff = request.headers.get('x-forwarded-for')

  const res = await fetch(`${apiUrl}/v1/public/checkout/create-order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(xff ? { 'X-Forwarded-For': xff } : {}),
    },
    body,
  })
  const text = await res.text()
  return new NextResponse(text, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
