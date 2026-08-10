import {
  SITEMAP_REVALIDATE,
  URLS_PER_SITEMAP,
  buildAllEntries,
  serializeUrlset,
  xmlResponse,
} from '@/lib/sitemap';

// /sitemap/{id} — one chunk of the storefront sitemap. The index
// (/sitemap.xml) links here; each chunk holds up to 10,000 URLs with their
// Google image-sitemap extensions (<image:image>) so product photos on
// category and All Products pages are indexed.
export const revalidate = SITEMAP_REVALIDATE;

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: Props): Promise<Response> {
  const { id } = await params;
  // Tolerate a legacy .xml suffix (the pre-route-handler generateSitemaps
  // version served /sitemap/{id}.xml) so crawlers holding stale chunk URLs
  // get real data instead of an empty urlset.
  const chunkId = Number(id.replace(/\.xml$/, ''));
  // Non-numeric id (or NaN) — not one of ours.
  if (!Number.isInteger(chunkId) || chunkId < 0) {
    return xmlResponse(
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n',
    );
  }

  const all = await buildAllEntries();
  const start = chunkId * URLS_PER_SITEMAP;
  // slice() is safe when id points past the end (data shrank between index
  // and chunk generation) — returns an empty-but-valid sitemap, never throws.
  return xmlResponse(serializeUrlset(all.slice(start, start + URLS_PER_SITEMAP)));
}
