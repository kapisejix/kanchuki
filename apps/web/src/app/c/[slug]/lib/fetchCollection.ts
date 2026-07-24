import type { PublicCollection } from '@kanchuki/shared'

export interface FetchCollectionParams {
  page?: number
  pageSize?: number
}

// No params (e.g. the wishlist page, which needs every product to match
// saved ids regardless of which page they'd fall on) => API returns everything.
export async function fetchCollection(
  slug: string,
  params?: FetchCollectionParams,
): Promise<PublicCollection | null> {
  const apiUrl = process.env['API_URL'] ?? 'http://localhost:3001'
  const qs = params
    ? `?${new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      )}`
    : ''
  try {
    const res = await fetch(`${apiUrl}/v1/public/collections/${slug}${qs}`, {
      next: { revalidate: 60 }, // ISR — revalidate every 60s
    })
    if (!res.ok) {
      console.error(`fetchCollection(${slug}): API returned ${res.status} from ${apiUrl}`)
      return null
    }
    const json = (await res.json()) as { data: PublicCollection }
    return json.data
  } catch (err) {
    console.error(`fetchCollection(${slug}): request to ${apiUrl} failed —`, err)
    return null
  }
}
