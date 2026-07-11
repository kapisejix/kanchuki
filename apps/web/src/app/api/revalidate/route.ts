import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

/**
 * On-demand ISR revalidation endpoint.
 *
 * Called by the backend API (or admin panel) when a product status changes
 * (AVAILABLE → SOLD / RESERVED), so collection link pages reflect the
 * update immediately instead of waiting up to 60s for ISR revalidation.
 *
 * Usage (from backend API):
 *   fetch('https://kanchuki.app/api/revalidate', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({
 *       secret: process.env.REVALIDATION_SECRET,
 *       collection_slug: "abc123",
 *     }),
 *   })
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      secret?: string
      collection_slug?: string
    }

    // Verify secret
    const expected = process.env['REVALIDATION_SECRET']
    if (!expected || body.secret !== expected) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Invalid secret', status: 401 } },
        { status: 401 },
      )
    }

    if (!body.collection_slug) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'collection_slug is required', status: 400 } },
        { status: 400 },
      )
    }

    // Revalidate the specific collection page
    revalidatePath(`/c/${body.collection_slug}`)

    return NextResponse.json({
      data: { revalidated: true, slug: body.collection_slug },
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: 'REVALIDATION_FAILED',
          message: err instanceof Error ? err.message : 'Unknown error',
          status: 500,
        },
      },
      { status: 500 },
    )
  }
}
