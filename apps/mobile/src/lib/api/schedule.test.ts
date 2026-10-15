import { describe, expect, it, vi } from 'vitest';
import { staffCan } from '../staff-can';
import { EDITABLE_POST_STATUSES, formatIst, istDayKey, tokenLabel } from './schedule';

// The helpers under test are pure; the real client pulls in Expo native modules.
vi.mock('./client', () => ({ request: vi.fn() }));

describe('schedule display helpers', () => {
  // 2026-10-17T14:00:00Z is 19:30 IST the same day; 2026-10-17T19:00:00Z is
  // already 00:30 IST on the 18th — the calendar must group by IST day.
  it('groups by the IST day, not the UTC day', () => {
    expect(istDayKey('2026-10-17T14:00:00Z')).toBe('2026-10-17');
    expect(istDayKey('2026-10-17T19:00:00Z')).toBe('2026-10-18');
  });

  it('formats the time in IST regardless of device timezone', () => {
    expect(formatIst('2026-10-17T14:00:00Z', false).toLowerCase()).toBe('7:30 pm');
  });

  it('labels token state for the status card', () => {
    expect(tokenLabel({ state: 'EXPIRED', days_left: 0 })).toBe('Expired — reconnect');
    expect(tokenLabel({ state: 'EXPIRING', days_left: 1 })).toBe('Expires in 1 day');
    expect(tokenLabel({ state: 'EXPIRING', days_left: 5 })).toBe('Expires in 5 days');
    expect(tokenLabel({ state: 'OK', days_left: null })).toBe('Connected');
  });

  it('only offers edits on the statuses the server allows', () => {
    expect(EDITABLE_POST_STATUSES).toEqual(['DRAFT', 'READY', 'FAILED', 'MISSED']);
  });
});

describe('scheduler role gating (mirrors MANAGER_ALLOWED_ROUTES)', () => {
  it('owner: view and plan', () => {
    expect(staffCan('owner', 'social.schedule')).toBe(true);
    expect(staffCan('owner', 'social.schedule.plan')).toBe(true);
  });
  it('manager: view, retry/skip/pause — but not create/confirm/end', () => {
    expect(staffCan('manager', 'social.schedule')).toBe(true);
    expect(staffCan('manager', 'social.schedule.plan')).toBe(false);
  });
  it('salesperson: nothing', () => {
    expect(staffCan('salesperson', 'social.schedule')).toBe(false);
  });
});
