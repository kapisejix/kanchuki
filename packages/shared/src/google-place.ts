// Google Places `place_id` helpers (docs/tasks/pending/google-business-profile-and-setup-checklist.md Part A).
// A place id is an opaque string; the format check is deliberately loose — the real
// validation is a Places lookup on the server. This only rejects obvious junk.

const PLACE_ID = /^[A-Za-z0-9_-]{20,255}$/;
const PLACE_ID_IN_TEXT = /ChIJ[A-Za-z0-9_-]{16,}/;
const PLACE_ID_PARAM = /[?&](?:query_place_id|place_id)=([A-Za-z0-9_-]{20,255})/;

export function isPlaceId(value: string): boolean {
  return PLACE_ID.test(value);
}

/**
 * Pull a place id out of a raw id or a pasted Google Maps URL.
 * Short share links (maps.app.goo.gl) carry no id and are never followed server-side.
 */
export function extractPlaceId(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  if (!/^https?:\/\//i.test(text)) return isPlaceId(text) ? text : null;
  const param = PLACE_ID_PARAM.exec(text);
  if (param?.[1]) return param[1];
  const inText = PLACE_ID_IN_TEXT.exec(text);
  return inText ? inText[0] : null;
}

/** Customer-facing "write a review" page for a place. */
export function buildGoogleReviewUrl(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}
