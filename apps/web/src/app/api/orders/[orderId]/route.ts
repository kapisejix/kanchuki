import { NextResponse } from 'next/server'
import { API_URL as apiUrl } from '@/lib/apiUrl'

// Proxies the anonymous order-status lookup to the public API. The API requires
// a `phone` query param as an anti-IDOR second factor (SECURITY §11.10) — the
// full query string (including ?phone=...) is forwarded unchanged. The phone is
// read from the order page's sessionStorage (see ../lib/order.ts), never put
// in the URL. X-Forwarded-For forwarded to preserve the API's per-IP rate limit
// (30/min, SECURITY §11.5).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params
  const qs = new URL(request.url).search
  const xff = request.headers.get('x-forwarded-for')

  const res = await fetch(`${apiUrl}/v1/public/orders/${orderId}${qs}`, {
    headers: xff ? { 'X-Forwarded-For': xff } : {},
  })
  const body = await res.text()
  return new NextResponse(body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
