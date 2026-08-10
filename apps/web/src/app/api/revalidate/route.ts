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
 *       path: "/priya-cloth-house-x1a2b3/festive-edit",
 *     }),
 *   })
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      secret?: string
      path?: string
      collection_slug?: string // legacy field — accepted for backward compat
    }

    // Verify secret
    const expected = process.env['REVALIDATION_SECRET']
    if (!expected || body.secret !== expected) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Invalid secret', status: 401 } },
        { status: 401 },
      )
    }

    // Legacy callers send collection_slug; canonical callers send a full path
    const path = body.path ?? (body.collection_slug ? `/c/${body.collection_slug}` : null)
    if (!path) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'path is required', status: 400 } },
        { status: 400 },
      )
    }

    // Revalidate the specific collection page
    revalidatePath(path)

    return NextResponse.json({
      data: { revalidated: true, path },
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
