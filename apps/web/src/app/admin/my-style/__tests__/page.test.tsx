import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MyStyleAdminPage from '../page';

const FAMILIES = [{ id: 'cf_yellow', name: 'yellow', aliases: ['mustard'], is_active: true }];
const PALETTES = [
  {
    id: 'sp_1',
    undertone: 'warm',
    depth: 'medium',
    good_families: ['yellow'],
    avoid_families: ['beige'],
    version: 3,
    is_active: true,
  },
];
const USAGE = {
  days: 3,
  totals: { analyses: 7, cost_paise: 231, failures: 6 },
  cost_per_analysis_paise: 33,
  by_day: [
    { day: '2026-10-16', count: 0, cost_paise: 0 },
    { day: '2026-10-17', count: 7, cost_paise: 231 },
    { day: '2026-10-18', count: 0, cost_paise: 0 },
  ],
  failures: [
    { mode: 'selfie', reason: 'too_dark', count: 4 },
    { mode: 'garment', reason: 'no_garment', count: 2 },
  ],
  limit: { limit_per_period: 3, period: 'MONTH' },
  similar_limit: { limit_per_period: 10, period: 'MONTH' },
};

type Call = { url: string; method: string; body: unknown };
function stubFetch(over: Record<string, { status?: number; body: unknown }> = {}) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    const path = url.split('/v1/admin')[1] ?? '';
    if (path === '/csrf-token')
      return { ok: true, status: 200, json: async () => ({ data: { csrf_token: 't' } }) };
    const hit = Object.entries(over).find(([k]) => path.startsWith(k));
    if (hit)
      return {
        ok: (hit[1].status ?? 200) < 400,
        status: hit[1].status ?? 200,
        json: async () => hit[1].body,
      };
    const data = path.startsWith('/color-families')
      ? FAMILIES
      : path.startsWith('/my-style/palettes')
        ? PALETTES
        : path.startsWith('/my-style/usage')
          ? USAGE
          : [];
    return { ok: true, status: 200, json: async () => ({ data }) };
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

describe('Admin My Style page', () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem('admin_key', 'k-test');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lists colour families and saves an edited alias list as a PATCH', async () => {
    const calls = stubFetch();
    render(<MyStyleAdminPage />);
    const box = await screen.findByLabelText('yellow aliases');
    fireEvent.change(box, { target: { value: 'mustard, haldi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({
        url: expect.stringContaining('/color-families/cf_yellow'),
        body: { aliases: ['mustard', 'haldi'] },
      }),
    );
  });

  it('palette tab saves good and avoid lists, and shows the version', async () => {
    const calls = stubFetch();
    render(<MyStyleAdminPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Palettes' }));
    const suits = await screen.findByLabelText('warm medium suits');
    expect(screen.getByText('v3')).toBeTruthy();
    fireEvent.change(suits, { target: { value: 'yellow, teal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save palette' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({
        url: expect.stringContaining('/my-style/palettes/sp_1'),
        body: { good_families: ['yellow', 'teal'], avoid_families: ['beige'] },
      }),
    );
  });

  it('surfaces the server message when a save is rejected', async () => {
    stubFetch({
      '/color-families/cf_yellow': {
        status: 403,
        body: { error: { message: 'Only a Super Admin can remove an alias' } },
      },
    });
    render(<MyStyleAdminPage />);
    fireEvent.change(await screen.findByLabelText('yellow aliases'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Only a Super Admin can remove an alias')).toBeTruthy();
  });

  it('usage tab draws one bar per day with totals, an estimate label and the limit', async () => {
    stubFetch();
    render(<MyStyleAdminPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Usage' }));
    const chart = await screen.findByRole('img', {
      name: 'Analyses per day over the last 3 days, 7 in total',
    });
    expect(chart.children).toHaveLength(3);
    expect(chart.children[1]?.getAttribute('title')).toBe('2026-10-17: 7 (Rs 2.31)');
    expect(screen.getByText('Rs 2.31')).toBeTruthy();
    expect(screen.getByText('3 / month')).toBeTruthy();
    expect(screen.getByText(/not a bill/)).toBeTruthy();
  });

  it('usage tab shows the Find similar limit and failed reads by mode and reason (D5, R10)', async () => {
    stubFetch();
    render(<MyStyleAdminPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Usage' }));
    expect(await screen.findByText('10 / month')).toBeTruthy();
    const table = screen.getByRole('table', { name: /failed reads/i });
    const rows = table.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toMatch(/Selfie.*too dark.*4/);
    expect(rows[1]?.textContent).toMatch(/Find similar.*no garment.*2/);
    expect(screen.getByText('6')).toBeTruthy(); // the failures tile
  });

  it('usage tab says when there are no failed reads instead of an empty table', async () => {
    stubFetch({
      '/my-style/usage': {
        body: { data: { ...USAGE, failures: [], totals: { ...USAGE.totals, failures: 0 } } },
      },
    });
    render(<MyStyleAdminPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Usage' }));
    expect(await screen.findByText(/no failed reads/i)).toBeTruthy();
    expect(screen.queryByRole('table', { name: /failed reads/i })).toBeNull();
  });

  it('usage tab explains a non-Super-Admin refusal instead of an empty chart', async () => {
    stubFetch({
      '/my-style/usage': {
        status: 403,
        body: { error: { message: 'Only a Super Admin can view My Style usage and cost' } },
      },
    });
    render(<MyStyleAdminPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Usage' }));
    expect(await screen.findByText(/Only a Super Admin can view My Style usage/)).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
