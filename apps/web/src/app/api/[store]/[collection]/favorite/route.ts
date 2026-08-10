import { API_URL as apiUrl } from '@/lib/apiUrl';
import { type NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ store: string; collection: string }> },
) {
  const { collection } = await params;
  const body: unknown = await request.json();

  try {
    await fetch(`${apiUrl}/v1/public/collections/${collection}/favorite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // Non-critical analytics — swallow error
  }

  return new NextResponse(null, { status: 204 });
}
