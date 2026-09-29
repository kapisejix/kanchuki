// How many products one catalog page holds.
//
// One constant, because six places have to agree on it: the five server
// components that render a catalog's first page (SSR must ask the API for the
// same slice the client will page through, or the grid re-fetches on mount and
// the count jumps) plus CollectionView's own Prev/Next and append-on-scroll.
// They each hard-coded 12 before this — the same shape RC-043 was minted for,
// where one value copied N times drifts in one of them and nothing notices.
//
// 20 is deliberate: two per row on a phone is ten rows, which fills a scroll
// without making the first paint wait on 20 signed photo URLs.
export const CATALOG_PAGE_SIZE = 20;
