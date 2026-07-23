import type { PublicCollection } from '@kanchuki/shared'

export async function fetchCollection(slug: string): Promise<PublicCollection | null> {
  const apiUrl = process.env['API_URL'] ?? 'http://localhost:3001'
  try {
    const res = await fetch(`${apiUrl}/v1/public/collections/${slug}`, {
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
