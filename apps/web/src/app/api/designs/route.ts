import { NextResponse } from 'next/server'
import { API_URL as apiUrl } from '@/lib/apiUrl'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const category = url.searchParams.get('category')
  const qs = category ? `?category=${encodeURIComponent(category)}` : ''

  try {
    const res = await fetch(`${apiUrl}/v1/public/designs${qs}`, {
      next: { revalidate: 300 },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'PROXY_ERROR', message: err instanceof Error ? err.message : 'Request failed', status: 500 } },
      { status: 500 },
    )
  }
}
