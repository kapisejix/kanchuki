// IST calendar math for GST (RC-201). GST months, financial years and invoice
// dates follow India time, not the server TZ (Railway sets none → UTC).
// IST is a fixed UTC+05:30 with no DST, so a constant offset is exact.
// ponytail: admin-commission, referral-accrue and post-schedule-builder keep
// their own private copies of this offset; fold them in when next touched.

export const IST_OFFSET_MS = 330 * 60_000;
export const IST_TIME_ZONE = 'Asia/Kolkata';

/** Calendar year and 0-based month of `d` in IST. */
export function istParts(d: Date): { year: number; month: number } {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return { year: ist.getUTCFullYear(), month: ist.getUTCMonth() };
}

/**
 * Half-open range [IST midnight on the 1st of `month`, IST midnight on the 1st
 * of the next month). `month` is 1-12; omit it for the whole IST calendar year.
 */
export function istRange(year: number, month?: number): { gte: Date; lt: Date } {
  const [from, to] = month
    ? [Date.UTC(year, month - 1, 1), Date.UTC(year, month, 1)]
    : [Date.UTC(year, 0, 1), Date.UTC(year + 1, 0, 1)];
  return { gte: new Date(from - IST_OFFSET_MS), lt: new Date(to - IST_OFFSET_MS) };
}
