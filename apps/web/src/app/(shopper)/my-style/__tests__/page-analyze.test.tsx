// F-045 PR-7: the selfie entry on /my-style - start card, palette card, retake, clear.
// The sheet itself is covered in AnalyzeSheet.test.tsx; here it is a stub so this file
// only proves the page wiring (what opens it, what happens when it reports done).
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearProfile } from '../analyze';
import MyStylePage from '../page';

const GARMENT = {
  category: 'Kurti',
  color_family: 'yellow',
  pattern: 'Printed',
  embellishments: ['Zari Work'],
};
vi.mock('../AnalyzeSheet', () => ({
  AnalyzeSheet: ({
    onClose,
    onDone,
    onShop,
    onCleared,
    mode,
  }: {
    onClose: () => void;
    onDone: (g?: unknown) => void;
    onShop?: () => void;
    onCleared?: () => void;
    mode?: string;
  }) => (
    // biome-ignore lint/a11y/useSemanticElements: test stub mirrors the real sheet's role="dialog" so getByRole queries match
    <div role="dialog" aria-label={mode === 'garment' ? 'Find similar' : 'Read my photo'}>
      <button type="button" onClick={() => onDone()}>
        stub-done
      </button>
      <button type="button" onClick={() => onDone(GARMENT)}>
        stub-done-garment
      </button>
      <button type="button" onClick={() => onShop?.()}>
        stub-shop
      </button>
      <button type="button" onClick={() => onCleared?.()}>
        stub-cleared
      </button>
      <button type="button" onClick={onClose}>
        stub-close
      </button>
    </div>
  ),
}));
// fetchProfile stays real (it goes through the fetch double); only the clear call is doubled.
vi.mock('../analyze', async (orig) => ({
  ...(await orig<typeof import('../analyze')>()),
  clearProfile: vi.fn(),
}));
const clear = vi.mocked(clearProfile);

const fetchMock = vi.fn();
const profile = {
  undertone: 'warm',
  depth: 'medium',
  frame: 'tall',
  palette: { good: ['maroon'], avoid: ['yellow'] },
};

function feed(style_profile: unknown = null, similar: unknown = null) {
  return new Response(
    JSON.stringify({
      data: [],
      meta: {
        total: 0,
        page: 1,
        limit: 12,
        sort: 'best',
        location_scope: 'city',
        rationale_source: 'none',
        truncated: false,
        style_profile,
        similar,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  window.scrollTo = vi.fn();
});

afterEach(() => {
  fetchMock.mockReset();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

// The page reads two things: POST /feed and GET /profile (Phase 1, R3). The double answers by URL.
const feedCalls = () =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes('/my-style/feed'));
const profileCalls = () =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes('/my-style/profile'));
function serve(opts: { profile?: () => unknown; feed?: () => Response } = {}) {
  fetchMock.mockImplementation(async (url: string) =>
    String(url).includes('/my-style/profile')
      ? new Response(
          JSON.stringify({
            data: { style_profile: opts.profile?.() ?? null, measurements: null, taste: null },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      : (opts.feed?.() ?? feed()),
  );
}
const lastFeedBody = () => JSON.parse(feedCalls().at(-1)![1].body as string);

describe('selfie entry', () => {
  it('has a "My colours" face-photo start card (no full-body wording) that opens the sheet', async () => {
    serve();
    render(<MyStylePage />);
    expect(screen.queryByRole('dialog')).toBeNull();
    const tile = await screen.findByRole('button', { name: /^my colours/i });
    expect(tile.textContent).toMatch(/face photo/i);
    expect(document.body.textContent).not.toMatch(/full.body/i);
    fireEvent.click(tile);
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByText('stub-close'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('no palette card until a photo has been read', async () => {
    serve();
    render(<MyStylePage />);
    await waitFor(() => expect(profileCalls()).toHaveLength(1));
    expect(screen.queryByText('Your palette')).toBeNull();
  });

  it('shows the palette card from the profile read, with colours only', async () => {
    serve({ profile: () => profile });
    render(<MyStylePage />);
    expect(await screen.findByText('Your palette')).toBeTruthy();
    expect(screen.getByText('maroon')).toBeTruthy();
    expect(screen.getByText('yellow')).toBeTruthy();
  });

  it('R3: the palette card still shows when the feed fails', async () => {
    serve({ profile: () => profile, feed: () => new Response('{}', { status: 500 }) });
    render(<MyStylePage />);
    expect(await screen.findByText('We could not load your feed.')).toBeTruthy();
    expect(await screen.findByText('Your palette')).toBeTruthy();
  });

  it('a finished read re-reads the profile so the palette appears', async () => {
    let saved: unknown = null;
    serve({ profile: () => saved });
    render(<MyStylePage />);
    fireEvent.click(await screen.findByRole('button', { name: /^my colours/i }));
    saved = profile;
    fireEvent.click(screen.getByText('stub-done'));
    expect(await screen.findByText('Your palette')).toBeTruthy();
    expect(feedCalls()).toHaveLength(2);
  });

  it('Retake reopens the sheet', async () => {
    serve({ profile: () => profile });
    render(<MyStylePage />);
    fireEvent.click(await screen.findByRole('button', { name: /retake/i }));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('Clear my data re-reads and the card goes away', async () => {
    clear.mockResolvedValue('ok');
    let saved: unknown = profile;
    serve({ profile: () => saved });
    render(<MyStylePage />);
    const btn = await screen.findByRole('button', { name: /clear my data/i });
    saved = null;
    fireEvent.click(btn);
    await waitFor(() => expect(screen.queryByText('Your palette')).toBeNull());
    expect(feedCalls()).toHaveLength(2);
  });
});

// "Shop my colours" (result screen or palette card): the feed keeps only the palette's shades.
describe('shop my colours', () => {
  it('from the result screen: refetches with palette_only and says so; Show all turns it off', async () => {
    serve({
      profile: () => profile,
      feed: () =>
        new Response(
          JSON.stringify({
            data: [],
            meta: { total: 0, page: 1, limit: 12, location_scope: 'city', palette_only: true },
          }),
          { status: 200 },
        ),
    });
    render(<MyStylePage />);
    fireEvent.click(await screen.findByRole('button', { name: /^my colours/i }));
    fireEvent.click(screen.getByText('stub-shop'));
    await waitFor(() => expect(lastFeedBody().palette_only).toBe(true));
    expect(await screen.findByText(/showing your colours/i)).toBeTruthy();
    fireEvent.click(screen.getByText('stub-close'));
    fireEvent.click(screen.getByRole('button', { name: /show all colours/i }));
    await waitFor(() => expect(lastFeedBody().palette_only).toBeUndefined());
  });

  it('from the palette card', async () => {
    serve({ profile: () => profile });
    render(<MyStylePage />);
    fireEvent.click(await screen.findByRole('button', { name: /shop my colours/i }));
    await waitFor(() => expect(lastFeedBody().palette_only).toBe(true));
  });

  it('the result screen Delete drops the filter and the card', async () => {
    let saved: unknown = profile;
    serve({ profile: () => saved });
    render(<MyStylePage />);
    await screen.findByText('Your palette');
    fireEvent.click(screen.getByRole('button', { name: /^my colours/i }));
    fireEvent.click(screen.getByText('stub-shop'));
    saved = null;
    fireEvent.click(screen.getByText('stub-cleared'));
    await waitFor(() => expect(screen.queryByText('Your palette')).toBeNull());
    expect(lastFeedBody().palette_only).toBeUndefined();
  });
});

const bodyOf = (call: number) => JSON.parse(feedCalls()[call]![1].body as string);
const lastBody = () => bodyOf(feedCalls().length - 1);
const LABEL = 'yellow Kurti, Printed, Zari Work';

describe('find similar entry', () => {
  it('has a "Find similar" start card that opens the sheet in garment mode', async () => {
    fetchMock.mockImplementation(async () => feed());
    render(<MyStylePage />);
    fireEvent.click(await screen.findByRole('button', { name: /find similar/i }));
    expect(screen.getByRole('dialog', { name: 'Find similar' })).toBeTruthy();
  });

  it('a finished garment read refetches the feed with the descriptor and shows what is matched', async () => {
    fetchMock.mockImplementation(async () => feed());
    render(<MyStylePage />);
    expect(bodyOf(0).similar).toBeUndefined();
    fireEvent.click(await screen.findByRole('button', { name: /find similar/i }));
    fireEvent.click(screen.getByText('stub-done-garment'));
    expect(await screen.findByText(LABEL)).toBeTruthy();
    await waitFor(() => expect(feedCalls()).toHaveLength(2));
    expect(bodyOf(1).similar).toEqual(GARMENT);
  });

  it('the descriptor rides along on later sort changes', async () => {
    fetchMock.mockImplementation(async () => feed());
    render(<MyStylePage />);
    fireEvent.click(await screen.findByRole('button', { name: /find similar/i }));
    fireEvent.click(screen.getByText('stub-done-garment'));
    await screen.findByText(LABEL);
    fireEvent.click(screen.getByRole('button', { name: 'Price' }));
    await waitFor(() => expect(lastBody().sort).toBe('price'));
    expect(lastBody().similar).toEqual(GARMENT);
  });

  it('Clear drops the descriptor and refetches without it', async () => {
    fetchMock.mockImplementation(async () => feed());
    render(<MyStylePage />);
    fireEvent.click(await screen.findByRole('button', { name: /find similar/i }));
    fireEvent.click(screen.getByText('stub-done-garment'));
    await screen.findByText(LABEL);
    fireEvent.click(screen.getByText('stub-close'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(screen.queryByText(/Looking for/)).toBeNull());
    expect(lastBody().similar).toBeUndefined();
  });

  it('says so when only attributes could be matched (no embeddings)', async () => {
    fetchMock.mockImplementation(async () =>
      feed(null, { source: 'attributes', embedded: 0, total: 3 }),
    );
    render(<MyStylePage />);
    fireEvent.click(await screen.findByRole('button', { name: /find similar/i }));
    fireEvent.click(screen.getByText('stub-done-garment'));
    expect(await screen.findByText(/Closer matching is not available/)).toBeTruthy();
  });

  it('a selfie read does not set a descriptor', async () => {
    fetchMock.mockImplementation(async () => feed());
    render(<MyStylePage />);
    fireEvent.click(await screen.findByRole('button', { name: /^my colours/i }));
    fireEvent.click(screen.getByText('stub-done'));
    await waitFor(() => expect(feedCalls()).toHaveLength(2));
    expect(bodyOf(1).similar).toBeUndefined();
    expect(screen.queryByText(/Looking for/)).toBeNull();
  });
});

describe('kids flow keeps no photo path', () => {
  it('opening the kids form adds no file input, and the page has none while the sheet is closed', async () => {
    fetchMock.mockImplementation(async () => feed());
    const { container } = render(<MyStylePage />);
    fireEvent.click(await screen.findByRole('button', { name: /for my child/i }));
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
});
