import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JoinPage from '../page';

// next/navigation notFound throws — exercised for the missing-token / 404 /
// dead-end fetch cases (same pattern as designs/[id]/page.test.tsx).
const notFoundMock = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
}));

// Pin the API base so the outbound fetch URLs are deterministic.
vi.mock('@/lib/apiUrl', () => ({
  API_URL: 'https://api.test.invalid',
}));

// The page renders Navbar/Footer (marketing chrome with Lenis smooth-scroll
// + window.matchMedia/ResizeObserver, which jsdom lacks). The join card is
// what's under test — mock the chrome to inert wrappers.
vi.mock('@/components/site/Chrome', () => ({
  Navbar: () => <header>Navbar</header>,
  Footer: () => <footer>Footer</footer>,
  Section: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const fetchRoutes: Record<string, { status: number; body: unknown }> = {};
const fetchMock = vi.fn((input: string) => {
  const url = typeof input === 'string' ? input : String(input);
  const route = fetchRoutes[url];
  if (!route) return Promise.reject(new Error(`unexpected fetch: ${url}`));
  return Promise.resolve(
    new Response(JSON.stringify(route.body), {
      status: route.status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
});

const inviteUrl = 'https://api.test.invalid/v1/public/staff-invite/abc_invite_token_1234567890';

const pendingInvite = {
  data: {
    shop_name: 'Ramesh Textiles',
    member_name: 'Ramesh',
    role: 'salesperson',
    phone_masked: '•••••• 3210',
    status: 'pending',
  },
};

beforeEach(() => {
  notFoundMock.mockClear();
  fetchMock.mockReset();
  fetchMock.mockImplementation((input: string) => {
    const url = typeof input === 'string' ? input : String(input);
    const route = fetchRoutes[url];
    if (!route) return Promise.reject(new Error(`unexpected fetch: ${url}`));
    return Promise.resolve(
      new Response(JSON.stringify(route.body), {
        status: route.status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const renderJoin = async (token = 'abc_invite_token_1234567890') => {
  const el = await JoinPage({ searchParams: Promise.resolve({ token }) });
  render(el);
};

// notFound throws inside JoinPage — the async page resolves only when a
// renderable state is reached (same convention as designs/[id]/page.test.tsx).
const joinRejects = (token?: string) =>
  JoinPage({ searchParams: Promise.resolve(token ? { token } : {}) }).then(() => undefined);

describe('web /join (staff-invite-tokens.md §7)', () => {
  it('renders the pending invite summary + Open in app bridge', async () => {
    fetchRoutes[inviteUrl] = { status: 200, body: pendingInvite };
    await renderJoin();

    expect(screen.getByText(/Ramesh, you've been added to Ramesh Textiles/)).toBeInTheDocument();
    expect(screen.getByText(/salesperson/)).toBeInTheDocument();
    // Masked bound phone — the full number must never render.
    expect(screen.getByText(/•••••• 3210/)).toBeInTheDocument();
    expect(screen.queryByText('9876543210')).not.toBeInTheDocument();
    // Bridge to the app: custom scheme link carrying the raw token.
    const deepLink = screen.getByRole('link', { name: /Open in Kanchuki app/ });
    expect(deepLink).toHaveAttribute('href', 'kanchuki://join?token=abc_invite_token_1234567890');
    // The outbound fetch hit the public invite API with the token.
    expect(fetchMock).toHaveBeenCalledWith(inviteUrl, expect.anything());
  });

  it('renders the already-joined state for a used invite', async () => {
    fetchRoutes[inviteUrl] = {
      status: 200,
      body: { ...pendingInvite, data: { ...pendingInvite.data, status: 'used' } },
    };
    await renderJoin();

    expect(screen.getByText(/You've already joined/)).toBeInTheDocument();
    expect(screen.queryByText(/Open in Kanchuki app/)).not.toBeInTheDocument();
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('renders the dead-end for an expired invite', async () => {
    fetchRoutes[inviteUrl] = {
      status: 200,
      body: { ...pendingInvite, data: { ...pendingInvite.data, status: 'expired' } },
    };
    await renderJoin();

    expect(screen.getByText(/This invite link is no longer valid/)).toBeInTheDocument();
    expect(screen.getByText(/after 7 days/)).toBeInTheDocument();
  });

  it('renders the dead-end for a revoked invite', async () => {
    fetchRoutes[inviteUrl] = {
      status: 200,
      body: { ...pendingInvite, data: { ...pendingInvite.data, status: 'revoked' } },
    };
    await renderJoin();

    expect(screen.getByText(/This invite link is no longer valid/)).toBeInTheDocument();
  });

  it('404s for an unknown hash (API 404 mirrors the dead-end)', async () => {
    fetchRoutes[inviteUrl] = { status: 404, body: { error: 'not found' } };

    await expect(joinRejects()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalled();
  });

  it('404s when the token param is missing', async () => {
    await expect(joinRejects(undefined)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalled();
  });
});
