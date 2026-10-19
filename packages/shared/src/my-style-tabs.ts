// F-045 PR-10 (docs/tasks/pending/my-style.md §3.2): the My Style feed tabs and the
// vocabulary the admin and the feed share, so the two cannot drift.

export const MY_STYLE_TABS = ['foryou', 'festival', 'occasion', 'trending'] as const;
export type MyStyleTab = (typeof MY_STYLE_TABS)[number];

/**
 * `style_trends.kind`. trending = shown on the Trending tab (and nudges every feed);
 * festival = keywords for the Festival tab (e.g. "bandhani" for Navratri).
 */
export const STYLE_TREND_KINDS = ['trending', 'festival'] as const;
export type StyleTrendKind = (typeof STYLE_TREND_KINDS)[number];

/** The Festival tab opens this many days before a festival starts, and stays until it ends. */
export const FESTIVAL_LOOKAHEAD_DAYS = 30;

/** Product occasions (lowercase) that count as festival wear. */
export const FESTIVAL_OCCASIONS = ['festive', 'wedding'] as const;
