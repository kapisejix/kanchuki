// post-schedule-builder.ts — F-043 plan builder (pure; no DB, no clock).
//
// Given an already-filtered, priority-ordered product list (newest unposted
// in-stock first — the route does the query), lays batches onto a calendar:
// one post per selected weekday, batch size from that weekday's [min,max]
// range, hard cap 10 (IG carousel limit), products grouped by category.
//
// Calendar maths is IST (UTC+5:30, no DST), so a weekday is the IST weekday and
// `scheduled_at` is the UTC instant of `post_time` IST.

export const MAX_SLIDES = 10;
export const IST_OFFSET_MS = 330 * 60_000;

export interface BuilderProduct {
  id: string;
  category: string | null;
}

export interface WeekdayRange {
  min: number;
  max: number;
}

export interface BuildInput {
  products: BuilderProduct[]; // priority order, no duplicates
  weekdays: number[]; // 0=Sun … 6=Sat (IST)
  ranges: Record<number, WeekdayRange>;
  post_time: string; // 'HH:mm' IST
  starts_on: string; // 'YYYY-MM-DD' IST
  horizon_days: number;
  single?: boolean; // post_type SINGLE_PRODUCT → one product per post
}

export interface PlannedPost {
  scheduled_at: Date; // UTC
  product_ids: string[]; // in slide order
}

/** UTC instant of `hhmm` on the IST calendar date y-m-d (m is 0-based). */
export function istToUtc(y: number, m: number, d: number, hhmm: string): Date {
  const [h, mi] = hhmm.split(':').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, d, h, mi) - IST_OFFSET_MS);
}

/** Today's IST calendar date as 'YYYY-MM-DD' (clock injected for tests). */
export function istDateString(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' + n days (calendar arithmetic, timezone-free). */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function buildSchedule(input: BuildInput): PlannedPost[] {
  const pool = [...input.products];
  const out: PlannedPost[] = [];

  for (let n = 0; n < input.horizon_days && pool.length > 0; n++) {
    const date = addDays(input.starts_on, n);
    const [y, m, d] = date.split('-').map(Number) as [number, number, number];
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (!input.weekdays.includes(weekday)) continue;

    const range = input.ranges[weekday];
    if (!range) continue;
    // ponytail: take as many as the range allows — a short pool yields a short
    // day rather than a skipped one. Skip only when the pool is empty.
    const want = input.single ? 1 : Math.min(range.max, MAX_SLIDES);
    const take = Math.min(want, pool.length);

    // Group by category: the lead product's category first, then fill from the rest.
    const lead = pool[0]?.category ?? '';
    const picked: BuilderProduct[] = [];
    for (const p of pool) {
      if (picked.length >= take) break;
      if ((p.category ?? '') === lead) picked.push(p);
    }
    for (const p of pool) {
      if (picked.length >= take) break;
      if (!picked.includes(p)) picked.push(p);
    }
    for (const p of picked) pool.splice(pool.indexOf(p), 1);

    out.push({
      scheduled_at: istToUtc(y, m - 1, d, input.post_time),
      product_ids: picked.map((p) => p.id),
    });
  }
  return out;
}
