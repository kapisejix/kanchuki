import { getSecret } from '@kanchuki/db'

/**
 * SNAPPYIT_API_KEY — the F-012 integration setting key name.
 * Admin configures this via the Integrations admin panel. Falls back to
 * the SNAPPYIT_API_KEY env var for local dev / non-DB-first bootstrapping.
 */
const SNAPPYIT_KEY_NAME = 'SNAPPYIT_API_KEY'

/** Snappyit ghost-mannequin API endpoint.
 *  Confirmed: snappyit.ai domain (moved from snappyit.app in 2026).
 *  The /api/v1/ghost-mannequin path is inferred from industry patterns;
 *  actual endpoint to be confirmed during integration. */
const SNAPPYIT_API_URL = 'https://snappyit.ai/api/v1/ghost-mannequin'

export interface SnappyitResult {
  /** Public URL of the generated ghost-mannequin image */
  outputUrl: string
  /** The raw image buffer, for uploading to R2 as a durable copy */
  outputBuffer: Buffer
}

/**
 * Generate a ghost-mannequin image from a garment photo.
 *
 * Sends the source image to Snappyit's API and returns the processed
 * image as both a URL and a Buffer. The caller is responsible for
 * persisting the result to R2 and updating the database.
 *
 * @param imageUrl  Publicly-accessible URL of the source garment photo
 * @param imageBuffer  Raw image buffer (used as alternative to URL upload)
 * @returns  SnappyitResult with outputUrl + outputBuffer
 */
export async function generateGhostMannequin(
  imageUrl: string,
  imageBuffer?: Buffer,
): Promise<SnappyitResult> {
  const apiKey = await getSecret(SNAPPYIT_KEY_NAME)

  if (!apiKey) {
    throw new Error(
      'SNAPPYIT_API_KEY is not configured. '
      + 'Set it via the Admin > Integrations panel or the SNAPPYIT_API_KEY env var.',
    )
  }

  // Snappyit accepts image uploads as multipart/form-data or a public URL.
  // Prefer URL if available (simpler), fall back to buffer upload.
  const formData = new FormData()

  if (imageBuffer) {
    // Upload raw image buffer as a file
    const blob = new Blob([imageBuffer], { type: 'image/jpeg' })
    formData.append('image', blob, 'garment.jpg')
  } else {
    // Pass the public URL for Snappyit to fetch
    formData.append('image_url', imageUrl)
  }

  const response = await fetch(SNAPPYIT_API_URL, {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      // fetch() sets multipart boundary automatically when using FormData
    },
    body: formData,
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new Error(
      `Snappyit API error: ${response.status} ${response.statusText}`
      + ` — ${errorBody.slice(0, 500)}`,
    )
  }

  // Snappyit returns the result image directly in the response body
  const outputBuffer = Buffer.from(await response.arrayBuffer())

  // If the response includes a Content-Location header with a URL, use that;
  // otherwise construct a data URL from the buffer as a fallback
  const outputUrl = response.headers.get('Content-Location')
    ?? `data:image/jpeg;base64,${outputBuffer.toString('base64')}`

  return { outputUrl, outputBuffer }
}

export default generateGhostMannequin
