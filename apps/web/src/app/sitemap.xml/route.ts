import {
  SITEMAP_REVALIDATE,
  URLS_PER_SITEMAP,
  buildAllEntries,
  serializeSitemapIndex,
  serializeUrlset,
  xmlResponse,
} from '@/lib/sitemap';

// /sitemap.xml — sitemap index. Points crawlers at the chunked
// /sitemap/{id} files (one per 10,000 URLs, well under Google's 50k/file
// limit). Serves a plain <urlset> instead when everything fits in a single
// chunk, so small installs never incur an extra fetch hop.
export const revalidate = SITEMAP_REVALIDATE;

export async function GET(): Promise<Response> {
  const all = await buildAllEntries();
  const chunkCount = Math.max(1, Math.ceil(all.length / URLS_PER_SITEMAP));

  if (chunkCount === 1) {
    return xmlResponse(serializeUrlset(all));
  }
  // The index lastmod is the newest entry's — lets crawlers skip unchanged
  // chunks after the first change.
  const lastModified = all.reduce<Date | undefined>((latest, e) => {
    if (!e.lastModified) return latest;
    return !latest || e.lastModified > latest ? e.lastModified : latest;
  }, undefined);
  return xmlResponse(serializeSitemapIndex(chunkCount, lastModified));
}
