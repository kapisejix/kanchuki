// API proxy for For You feed — forwards cookies for passport session.
import { type NextRequest, NextResponse } from 'next/server'
import { API_URL as apiUrl } from '@/lib/apiUrl'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const searchParams = url.searchParams.toString()

  try {
    const res = await fetch(`${apiUrl}/v1/public/for-you?${searchParams}`, {
      headers: {
        cookie: request.headers.get('cookie') ?? '',
      },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ items: [], next_cursor: null })
  }
}
