// F-043 Social Post Scheduler — mobile API client. Server: apps/api
// routes/retailers/retailers-social/retailers-social-schedule.ts.
import { request } from './client';

export type SchedulePlatform = 'FACEBOOK' | 'INSTAGRAM';
export type SchedulePlanStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED';
export type ScheduledPostStatus =
  | 'DRAFT'
  | 'READY'
  | 'PUBLISHING'
  | 'POSTED'
  | 'FAILED'
  | 'MISSED'
  | 'SKIPPED';

/** Statuses the server lets a retailer/manager still change. */
export const EDITABLE_POST_STATUSES: ScheduledPostStatus[] = ['DRAFT', 'READY', 'FAILED', 'MISSED'];

export interface ScheduleStatus {
  platforms: {
    account_id: string;
    platform: SchedulePlatform;
    account_name: string;
    token: { state: 'OK' | 'EXPIRING' | 'EXPIRED'; days_left: number | null };
    plan: {
      id: string;
      status: SchedulePlanStatus;
      pause_reason: string | null;
      post_time: string;
    } | null;
    next_post: { id: string; scheduled_at: string; slides: number } | null;
  }[];
  allowance: { used: number; limit: number | null; period: string };
  active_plans: { count: number; max: number | null };
  studio_shoots: {
    included: boolean;
    unlimited: boolean;
    used: number;
    limit: number;
    remaining: number;
  };
  failures: {
    id: string;
    plan_id: string;
    platform: SchedulePlatform;
    status: 'FAILED' | 'MISSED';
    scheduled_at: string;
    reason: string | null;
  }[];
  needs_attention: boolean;
}

export interface ScheduleItem {
  id: string;
  product_id: string;
  position: number;
  photo_id: string | null;
  product?: {
    name: string | null;
    photos: { id: string; url: string; is_primary: boolean }[];
  };
}

export interface SchedulePost {
  id: string;
  plan_id: string;
  scheduled_at: string;
  caption: string;
  status: ScheduledPostStatus;
  attempts: number;
  error: string | null;
  items: ScheduleItem[];
}

export interface SchedulePlan {
  id: string;
  platform: SchedulePlatform;
  post_type: 'CAROUSEL' | 'SINGLE_PRODUCT';
  status: SchedulePlanStatus;
  pause_reason: string | null;
  post_time: string;
  weekdays: number[];
  horizon_days: number;
  posts: SchedulePost[];
}

export interface CreatePlanInput {
  social_account_id: string;
  post_type: 'CAROUSEL' | 'SINGLE_PRODUCT';
  weekdays: number[];
  batch_ranges: Record<string, { min: number; max: number }>;
  post_time: string;
  source: 'NEWEST' | 'CATEGORY';
  category?: string;
  cover_style: null;
  rotation_pool: string[];
  horizon: '1W' | '2W' | '1M';
}

const BASE = '/v1/retailers/me/social/schedule';
const json = (body: unknown) => ({ body: JSON.stringify(body) });

export const scheduleApi = {
  status: () => request<{ data: ScheduleStatus }>(`${BASE}/status`),

  plan: (id: string) => request<{ data: SchedulePlan }>(`${BASE}/plans/${id}`),

  createPlan: (input: CreatePlanInput) =>
    request<{ data: SchedulePlan }>(`${BASE}/plans`, {
      method: 'POST',
      ...json(input),
      timeoutMs: 30_000,
    }),

  confirm: (id: string) =>
    request<{
      data: { plan_id: string; posts: number; slides_original: number; slides_templated: number };
    }>(`${BASE}/plans/${id}/confirm`, { method: 'POST' }),

  end: (id: string) =>
    request<{ data: { ended: boolean } }>(`${BASE}/plans/${id}/end`, { method: 'POST' }),

  setPlanState: (id: string, status: 'PAUSED' | 'ACTIVE') =>
    request<{ data: unknown }>(`${BASE}/plan-state/${id}`, {
      method: 'PATCH',
      ...json({ status }),
    }),

  patchPost: (id: string, body: { caption?: string; action?: 'skip' | 'retry' }) =>
    request<{ data: SchedulePost }>(`${BASE}/posts/${id}`, { method: 'PATCH', ...json(body) }),

  swapItem: (id: string, product_id: string) =>
    request<{ data: unknown }>(`${BASE}/items/${id}`, {
      method: 'PATCH',
      ...json({ action: 'swap', product_id }),
    }),

  photoItem: (id: string, photo_id: string) =>
    request<{ data: unknown }>(`${BASE}/items/${id}`, {
      method: 'PATCH',
      ...json({ action: 'photo', photo_id }),
    }),

  removeItem: (id: string) =>
    request<{ data: { removed: boolean } }>(`${BASE}/items/${id}`, { method: 'DELETE' }),
};

// ─── display helpers ───────────────────────────────────────────────

/** "Sat, 17 Oct · 7:30 PM" in IST regardless of the phone's timezone. */
export function formatIst(iso: string, withDay = true): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata' };
  const day = d.toLocaleDateString('en-IN', {
    ...opts,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const time = d.toLocaleTimeString('en-IN', { ...opts, hour: 'numeric', minute: '2-digit' });
  return withDay ? `${day} · ${time}` : time;
}

/** 'YYYY-MM-DD' IST day key, for grouping the calendar. */
export function istDayKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function tokenLabel(t: ScheduleStatus['platforms'][number]['token']): string {
  if (t.state === 'EXPIRED') return 'Expired — reconnect';
  if (t.state === 'EXPIRING') return `Expires in ${t.days_left} day${t.days_left === 1 ? '' : 's'}`;
  return t.days_left != null ? `Connected · ${t.days_left} days left` : 'Connected';
}
