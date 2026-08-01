import { NextResponse } from 'next/server'
import { API_URL as apiUrl } from '@/lib/apiUrl'

// Proxies Razorpay payment verification to the public API so the browser never
// needs the internal API_URL. X-Forwarded-For forwarded to preserve the API's
// per-IP rate limit (10/min, SECURITY §11.5) across the proxy hop.
export async function POST(request: Request) {
  const body = await request.text()
  const xff = request.headers.get('x-forwarded-for')

  const res = await fetch(`${apiUrl}/v1/public/checkout/verify-payment`, {
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
