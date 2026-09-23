import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Settings, buildPatch } from '../build-patch';
import ReferralSettingsPage from '../page';

// A deliberately unusual row. If any term were hardcoded in the screen instead
// of read from the API, these assertions would fail — which is the point.
const ROW = {
  id: 'singleton',
  commission_pct: 37,
  duration_months: 9,
  qualify_days: 45,
  referred_bonus_type: 'FREE_MONTH' as const,
  referred_bonus_value: 2,
  second_tier_enabled: false,
  second_tier_pct: null,
  payout_min_amount: 12345, // paise → ₹123.45
  payout_cadence: 'MONTHLY' as const,
};

let puts: { url: string; body: Record<string, unknown> }[] = [];

function makeFetchStub(opts?: {
  getFails?: boolean;
  putStatus?: number;
  putBody?: unknown;
  /** Override the served row — used for a legacy value in the DB. */
  row?: Record<string, unknown>;
}) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (method === 'GET') {
      if (opts?.getFails) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: { message: 'Database connection refused' } }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ data: opts?.row ?? ROW }) };
    }

    puts.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
    if (opts?.putStatus && opts.putStatus >= 400) {
      return {
        ok: false,
        status: opts.putStatus,
        json: async () => opts.putBody,
      };
    }
    const patch = JSON.parse(String(init?.body ?? '{}'));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: { ...ROW, ...patch },
        changed: Object.keys(patch),
      }),
    };
  });
}

beforeEach(() => {
  puts = [];
  sessionStorage.setItem('admin_key', 'test-key');
});

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

// ─── Pure diff ─────────────────────────────────────────────────────

describe('buildPatch', () => {
  const stored: Settings = { ...ROW };

  it('returns only the keys that actually moved', () => {
    expect(buildPatch(stored, { ...stored }, false)).toEqual({});
    expect(buildPatch(stored, { ...stored, commission_pct: 40 }, false)).toEqual({
      commission_pct: 40,
    });
  });

  it('forces the bonus value in when only its UNIT changed', () => {
    // Same numeral, different unit: 2 months becomes 2 paise. Comparing
    // numbers alone would call this "unchanged" and silently reinterpret the
    // stored value in the new unit.
    const next = { ...stored, referred_bonus_type: 'FLAT_DISCOUNT' as const };
    expect(next.referred_bonus_value).toBe(stored.referred_bonus_value); // same number...
    expect(buildPatch(stored, next, false)).toEqual({ referred_bonus_type: 'FLAT_DISCOUNT' });
    expect(buildPatch(stored, next, true)).toEqual({
      referred_bonus_type: 'FLAT_DISCOUNT',
      referred_bonus_value: stored.referred_bonus_value, // ...but sent anyway
    });
  });

  it('leaves an unchanged nullable field out of the patch', () => {
    expect(buildPatch(stored, { ...stored, second_tier_pct: null }, false)).toEqual({});
  });
});

// ─── Screen ────────────────────────────────────────────────────────

describe('ReferralSettingsPage', () => {
  it('renders the terms the API returned, not built-in defaults', async () => {
    vi.stubGlobal('fetch', makeFetchStub());
    render(<ReferralSettingsPage />);

    // 37% / 9 months / 45 days have to come from the fixture row.
    expect(await screen.findByDisplayValue('37')).toBeInTheDocument();
    expect(screen.getByDisplayValue('9')).toBeInTheDocument();
    expect(screen.getByDisplayValue('45')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2')).toBeInTheDocument(); // bonus value, in months
    // 12345 paise rendered as rupees
    expect(screen.getByDisplayValue('123.45')).toBeInTheDocument();
  });

  it('sends only the field the operator changed', async () => {
    vi.stubGlobal('fetch', makeFetchStub());
    render(<ReferralSettingsPage />);

    const commission = await screen.findByDisplayValue('37');
    fireEvent.change(commission, { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(puts).toHaveLength(1));
    // qualify_days and the rest were untouched — resubmitting them unchanged
    // is what RC-010 says must never happen.
    expect(puts[0].body).toEqual({ commission_pct: 40 });
  });

  it('does not write at all when nothing changed', async () => {
    vi.stubGlobal('fetch', makeFetchStub());
    render(<ReferralSettingsPage />);

    await screen.findByDisplayValue('37');
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/nothing to save/i)).toBeInTheDocument();
    expect(puts).toHaveLength(0);
  });

  it('converts the payout minimum from ₹ to paise at the boundary', async () => {
    vi.stubGlobal('fetch', makeFetchStub());
    render(<ReferralSettingsPage />);

    const payout = await screen.findByDisplayValue('123.45');
    fireEvent.change(payout, { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ payout_min_amount: 50000 });
  });

  it("surfaces the server's own 422 message instead of a constant", async () => {
    vi.stubGlobal(
      'fetch',
      makeFetchStub({
        putStatus: 422,
        putBody: {
          error: {
            message: 'second_tier_pct is required when second_tier_enabled is true',
          },
        },
      }),
    );
    render(<ReferralSettingsPage />);

    const commission = await screen.findByDisplayValue('37');
    fireEvent.change(commission, { target: { value: '41' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    // The named setting, not "Save failed".
    expect(
      await screen.findByText(/second_tier_pct is required when second_tier_enabled is true/),
    ).toBeInTheDocument();
  });

  it('shows the API error when the initial load fails', async () => {
    vi.stubGlobal('fetch', makeFetchStub({ getFails: true }));
    render(<ReferralSettingsPage />);

    // `fetch` does not throw on a non-2xx — RC-025/RC-026 are what happen when
    // a page assumes it does.
    expect(await screen.findByText('Database connection refused')).toBeInTheDocument();
  });

  it('does not offer a bonus type no code path can honour', async () => {
    vi.stubGlobal('fetch', makeFetchStub());
    render(<ReferralSettingsPage />);

    await screen.findByDisplayValue('37');
    const select = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);

    // FLAT_DISCOUNT sits in the PostgreSQL enum (migration 109) but nothing
    // discounts a payment, so the API 422s it. Offering it here would let an
    // operator store a term that never reaches the store.
    expect(values).not.toContain('FLAT_DISCOUNT');
    expect(values).toEqual(['FREE_MONTH', 'NONE']);
  });

  it('still renders a legacy bonus type the row already holds, marked and disabled', async () => {
    // A row written before the narrowing (or by hand in SQL) holds the value. A
    // <select> with no matching <option> renders blank, which would hide the
    // stored term from the operator altogether.
    vi.stubGlobal(
      'fetch',
      makeFetchStub({
        row: { ...ROW, referred_bonus_type: 'FLAT_DISCOUNT', referred_bonus_value: 50000 },
      }),
    );
    render(<ReferralSettingsPage />);

    const select = (await screen.findByRole('combobox', {
      name: /bonus type/i,
    })) as HTMLSelectElement;
    expect(select.value).toBe('FLAT_DISCOUNT');

    const legacy = Array.from(select.options).find((o) => o.value === 'FLAT_DISCOUNT');
    expect(legacy).toBeDefined();
    expect(legacy?.disabled).toBe(true);
    // Named, not the raw enum string.
    expect(legacy?.textContent).toMatch(/Flat discount off first payment/);
    // And the operator is told what to do about it.
    expect(screen.getByText(/pick another type to replace it/i)).toBeInTheDocument();
  });

  it('sends the paired 0 when the referred bonus is switched off', async () => {
    vi.stubGlobal('fetch', makeFetchStub());
    render(<ReferralSettingsPage />);

    await screen.findByDisplayValue('37');
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'NONE' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ referred_bonus_type: 'NONE', referred_bonus_value: 0 });
  });
});
