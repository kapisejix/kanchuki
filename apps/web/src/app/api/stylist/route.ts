import { NextResponse } from 'next/server'
import { API_URL as apiUrl } from '@/lib/apiUrl'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const res = await fetch(`${apiUrl}/v1/public/stylist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
