// My Style redesign + 6 reported problems (2026-11-15): card frame, chip bar, card actions,
// kids' wear request, quiz save + "Your style" summary, quota copy.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StyleCard } from '../StyleCard';
import { TasteCard } from '../TasteCard';
import { resetDay, startAnalysis } from '../analyze';
import MyStylePage from '../page';

// The shortlist loads from the account wishlist (Phase 3); not under test here, so it stays
// out of the fetch call order these tests count.
vi.mock('../shortlist', async (orig) => ({
  ...(await orig<typeof import('../shortlist')>()),
  fetchShortlist: async () => null,
  moveDeviceShortlist: async () => {},
}));
import { EMPTY_PROFILE, type SavedProfile, stubFetchWithProfile } from './profile-route';

// What GET /profile answers (see profile-route.ts); reset per test.
let savedProfile: SavedProfile = EMPTY_PROFILE;

const fetchMock = vi.fn();

const card = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  name: 'Wine Silk Suit',
  price_min: 210000,
  price_max: 210000,
  primary_photo_url: 'https://img.test/p1.jpg',
  distance_km: null,
  retailer: { shop_name: 'Shree Sarees', slug: 'shree-sarees', city: 'Surat' },
  ...over,
});

const feed = (meta: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      data: [card()],
      meta: {
        total: 1,
        page: 1,
        limit: 12,
        location_scope: 'city',
        rationale_source: 'none',
        ...meta,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

const feedBody = (call: number) =>
  JSON.parse((fetchMock.mock.calls[call]![1] as RequestInit).body as string);

beforeEach(() => {
  savedProfile = EMPTY_PROFILE;
  stubFetchWithProfile(fetchMock, () => savedProfile);
  window.scrollTo = vi.fn();
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('card (problems 1 and 3)', () => {
  const props = { saved: false, full: false, busy: false, onToggle: vi.fn(), onEnquire: vi.fn() };

  it('every photo sits in one clipped 4:5 frame, so a tall photo cannot stretch its card', () => {
    const { container } = render(<StyleCard card={card() as never} {...props} />);
    const frame = container.querySelector('img')!.parentElement!;
    expect(frame.className).toContain('aspect-[4/5]');
    expect(frame.className).toContain('overflow-hidden');
    expect(container.querySelector('img')!.className).toContain('absolute inset-0');
  });

  it('reserves two lines for the name so text blocks match across a row', () => {
    render(<StyleCard card={card() as never} {...props} />);
    const name = screen.getByText('Wine Silk Suit');
    expect(name.className).toContain('line-clamp-2');
    expect(name.className).toContain('min-h-10');
  });

  it('Complete the look is a bordered, single-line, 44px button', () => {
    render(<StyleCard card={card() as never} {...props} onLook={vi.fn()} />);
    const b = screen.getByRole('button', { name: 'Complete the look' });
    expect(b.className).toMatch(/border/);
    expect(b.className).toContain('whitespace-nowrap');
    expect(b.className).toContain('h-11');
  });
});

describe('chip bar (problem 2)', () => {
  it('has no sideways-scrolling row: Near me wraps instead of clipping', async () => {
    fetchMock.mockResolvedValue(feed());
    const { container } = render(<MyStylePage />);
    await screen.findByText('Wine Silk Suit');
    const bar = screen.getByLabelText('Sort and filter');
    expect(bar.querySelector('.overflow-x-auto')).toBeNull();
    expect(container.querySelector('.flex-wrap')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Near me/ })).toBeTruthy();
  });
});

describe("kids' wear (problem 4)", () => {
  it('the adult feed sends no kids flag; For my child sends kids: true and Clear drops it', async () => {
    fetchMock.mockResolvedValue(feed());
    render(<MyStylePage />);
    await screen.findByText('Wine Silk Suit');
    expect(feedBody(0).kids).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: /For my child/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Show outfits' }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((_, i) => feedBody(i).kids === true)).toBe(true),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(feedBody(fetchMock.mock.calls.length - 1).kids).toBeUndefined());
  });
});

describe('quiz result (problem 6)', () => {
  const taste = {
    colors: ['red', 'navy'],
    occasions: ['party wear'],
    fabrics: ['cotton'],
    budget_max: 150000,
  };

  function takeQuiz() {
    fireEvent.click(screen.getByRole('button', { name: /Take the quick quiz/ }));
    const pick = () =>
      screen.getAllByRole('button').find((b) => b.className.includes('rounded-full'))!;
    for (let i = 0; i < 4; i++) {
      fireEvent.click(pick());
      fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
    }
    fireEvent.click(pick());
    fireEvent.click(screen.getByRole('button', { name: /Save My Style/ }));
  }

  it('shows "Your style" from the profile read, with a Change action', async () => {
    savedProfile = { ...EMPTY_PROFILE, taste };
    fetchMock.mockResolvedValue(feed());
    render(<MyStylePage />);
    const region = await screen.findByLabelText('Your style');
    expect(region.textContent).toContain('Red');
    expect(region.textContent).toContain('Navy');
    expect(region.textContent).toContain('Party Wear');
    expect(region.textContent).toContain('Cotton');
    expect(region.textContent).toMatch(/Up to ₹1,500/);
    expect(screen.getByRole('button', { name: 'Change' })).toBeTruthy();
  });

  it('shows nothing before the quiz', async () => {
    fetchMock.mockResolvedValue(feed({ taste: null }));
    render(<MyStylePage />);
    await screen.findByText('Wine Silk Suit');
    expect(screen.queryByLabelText('Your style')).toBeNull();
  });

  it('refetches the feed only after the quiz save finished', async () => {
    let finishSave!: (r: Response) => void;
    fetchMock.mockImplementation((url: string) =>
      url === '/api/passport/style-quiz'
        ? new Promise<Response>((r) => {
            finishSave = r;
          })
        : Promise.resolve(feed()),
    );
    render(<MyStylePage />);
    await screen.findByText('Wine Silk Suit');
    const feedCalls = () =>
      fetchMock.mock.calls.filter((c) => c[0] === '/api/my-style/feed').length;
    expect(feedCalls()).toBe(1);

    takeQuiz();

    await waitFor(() => expect(finishSave).toBeTypeOf('function'));
    expect(feedCalls()).toBe(1); // still saving: no early refetch racing the write
    finishSave(new Response('{"ok":true}', { status: 200 }));
    await waitFor(() => expect(feedCalls()).toBe(2));
  });

  it('says so when the save did not reach the account', async () => {
    fetchMock.mockImplementation((url: string) =>
      url === '/api/passport/style-quiz'
        ? Promise.resolve(new Response('{}', { status: 500 }))
        : Promise.resolve(feed()),
    );
    render(<MyStylePage />);
    await screen.findByText('Wine Silk Suit');
    takeQuiz();
    expect((await screen.findByRole('status')).textContent).toMatch(/could not save/i);
  });

  it('TasteCard hides empty rows', () => {
    render(
      <TasteCard
        taste={{ colors: ['red'], occasions: [], fabrics: [], budget_max: null }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Colours')).toBeTruthy();
    expect(screen.queryByText('Fabrics')).toBeNull();
    expect(screen.queryByText('Budget')).toBeNull();
  });
});

describe('photo-read limit message (problem 5)', () => {
  it('names the reset day and what the shopper can still do', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 402 }));
    const r = await startAnalysis(new Blob(['x']));
    expect(r.kind).toBe('error');
    const msg = (r as { message: string }).message;
    expect(msg).toContain(`starts over on ${resetDay()}`);
    expect(msg).toMatch(/browse/);
  });

  it('resetDay is the 1st of next month, across a year end', () => {
    expect(resetDay(new Date(2026, 10, 15))).toBe('1 December');
    expect(resetDay(new Date(2026, 11, 31))).toBe('1 January');
  });
});

// Spec step 4: a size label from the shopper's own measurements. A label only: approximate, and
// absent when the API sent none.
describe('suggested size on the card', () => {
  const props = { saved: false, full: false, busy: false, onToggle: vi.fn(), onEnquire: vi.fn() };

  it('shows "Your size: M"', () => {
    render(<StyleCard card={card({ suggested_size: { size: 'M' } }) as never} {...props} />);
    expect(screen.getByText(/Your size: M/)).toBeTruthy();
  });

  it('says so when two sizes are in play, and that it is approximate', () => {
    render(
      <StyleCard
        card={card({ suggested_size: { size: 'L', between: ['M', 'L'] } }) as never}
        {...props}
      />,
    );
    const t = screen.getByTestId('suggested-size').textContent!;
    expect(t).toMatch(/Your size: L/);
    expect(t).toMatch(/between M and L/);
    expect(t).toMatch(/approx/i);
  });

  it('names the standard chart, with a hint that store sizes may differ', () => {
    render(
      <StyleCard
        card={card({ suggested_size: { size: 'M', chart: 'standard' } }) as never}
        {...props}
      />,
    );
    const el = screen.getByTestId('suggested-size');
    expect(el.textContent).toMatch(/^Your size: M · standard chart/);
    expect(el.textContent).not.toMatch(/approx/);
    expect(el.getAttribute('title')).toBe(
      'Based on a standard size chart. Store sizes may differ.',
    );
    expect(
      screen.getByText('Based on a standard size chart. Store sizes may differ.'),
    ).toBeTruthy();
  });

  it('a store chart keeps "approx." and no standard hint', () => {
    render(
      <StyleCard
        card={card({ suggested_size: { size: 'M', chart: 'store' } }) as never}
        {...props}
      />,
    );
    const el = screen.getByTestId('suggested-size');
    expect(el.textContent).toBe('Your size: M · approx.');
    expect(el.getAttribute('title')).toBeNull();
  });

  it('shows nothing when there is no suggestion', () => {
    render(<StyleCard card={card({ suggested_size: null }) as never} {...props} />);
    expect(screen.queryByTestId('suggested-size')).toBeNull();
    render(<StyleCard card={card() as never} {...props} />);
    expect(screen.queryByTestId('suggested-size')).toBeNull();
  });
});
