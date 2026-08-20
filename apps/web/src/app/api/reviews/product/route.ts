import { NextResponse } from 'next/server'
import { API_URL as apiUrl } from '@/lib/apiUrl'

// Proxies customer product review submission to the public API.
export async function POST(request: Request) {
  const body = await request.text()

  const res = await fetch(`${apiUrl}/v1/public/reviews/product`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })

  const responseBody = await res.text()
  return new NextResponse(responseBody, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
