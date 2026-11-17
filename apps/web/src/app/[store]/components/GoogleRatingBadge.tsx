import { Star } from 'lucide-react';

export interface GoogleRating {
  rating: number;
  count: number;
  url: string;
}

// The shop's own rating on Google, as served by GET /v1/public/retailers/:slug. The API sends
// null whenever it cannot show an honest figure, and then nothing renders here (no placeholder,
// no "0"). Kept separate from Kanchuki's own product/store ratings and always labelled "Google".
// The link is only followed when it is a Google Maps https URL, whatever the API returned.
const GOOGLE_MAPS = 'https://www.google.com/maps/';

export function GoogleRatingBadge({ google }: { google?: GoogleRating | null }) {
  if (!google || !google.url.startsWith(GOOGLE_MAPS)) return null;
  const reviews = `${google.count} ${google.count === 1 ? 'review' : 'reviews'}`;
  return (
    <a
      href={google.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Rated ${google.rating.toFixed(1)} out of 5 on Google, ${reviews}`}
      className="inline-flex items-center gap-1 text-xs font-medium text-[#6B4773]"
    >
      <Star size={12} aria-hidden="true" className="text-amber-400 fill-amber-400" />
      <span className="font-bold text-[#231F48]">{google.rating.toFixed(1)}</span>
      <span>· {google.count} on Google</span>
    </a>
  );
}
