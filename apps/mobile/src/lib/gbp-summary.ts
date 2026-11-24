// Wording for the Google-reviews summary. The server keeps review_count NULL until a sync has
// succeeded, so null must never read as "0 reviews" (RC-030 shape: a failure looking like an
// empty profile). sync_failed distinguishes "still fetching" from "could not reach Google".

export type GbpSummary = {
  review_count?: number | null;
  avg_rating?: number | null;
  sync_failed?: boolean;
};

export function gbpCountLabel(s: GbpSummary): string {
  if (s.review_count == null) {
    return s.sync_failed
      ? 'Could not load your reviews from Google yet. We will keep trying.'
      : 'Fetching your reviews from Google…';
  }
  const n = `${s.review_count} ${s.review_count === 1 ? 'review' : 'reviews'}`;
  return s.avg_rating != null ? `${n} · ${s.avg_rating.toFixed(1)} average` : n;
}

/** Note under an EMPTY list; null = say nothing (the count line already explains it). */
export function gbpEmptyNote(s: GbpSummary): string | null {
  if (s.review_count == null) return null;
  return s.review_count === 0
    ? 'No Google reviews yet. They appear here when customers post them.'
    : 'Your Google reviews are still loading. Check back in a moment.';
}
