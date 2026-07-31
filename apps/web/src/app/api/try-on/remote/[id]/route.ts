import { NextResponse } from 'next/server'
import { API_URL } from '@/lib/apiUrl'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const res = await fetch(`${API_URL}/v1/try-on/remote/${id}`)
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'PROXY_ERROR', message: err instanceof Error ? err.message : 'Request failed', status: 500 } },
      { status: 500 },
    )
  }
}
