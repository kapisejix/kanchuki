import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ForRetailersPage from '../page';

// Marketing chrome (Lenis smooth-scroll + framer-motion + window.matchMedia)
// isn't the thing under test — inert wrappers, same convention as
// app/join/__tests__/page.test.tsx.
vi.mock('@/components/site/Chrome', () => ({
  Navbar: () => <header>Navbar</header>,
  Footer: () => <footer>Footer</footer>,
  Section: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SectionHeader: () => null,
  ColorCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AnimatedSection: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FinalCta: () => null,
  PageHero: () => null,
}));

vi.mock('@/lib/plan-pricing', () => ({
  getPlanPricing: () => Promise.resolve(null),
  rupees: (paise: number) => `₹${paise / 100}`,
}));

afterEach(() => {
  vi.restoreAllMocks();
});

const renderPage = async (ref?: string) => {
  const el = await ForRetailersPage({ searchParams: Promise.resolve(ref ? { ref } : {}) });
  render(el);
};

describe('/for-retailers referral capture (§5B.1)', () => {
  it('shows the referral banner for a valid affiliate code', async () => {
    await renderPage('kan-7f3qmp');
    expect(screen.getByText('KAN-7F3QMP')).toBeInTheDocument();
    expect(screen.getByText(/You were referred by a Kanchuki partner/)).toBeInTheDocument();
    const deepLink = screen.getByRole('link', { name: /Open in Kanchuki app/ });
    expect(deepLink).toHaveAttribute('href', 'kanchuki://onboarding?ref=KAN-7F3QMP');
  });

  it('renders no banner when ?ref= is absent', async () => {
    await renderPage();
    expect(screen.queryByText(/You were referred by a Kanchuki partner/)).not.toBeInTheDocument();
  });

  it('renders no banner for a garbage ref — cosmetic gate only, page is unaffected', async () => {
    await renderPage('drop table retailers');
    expect(screen.queryByText(/You were referred by a Kanchuki partner/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open in Kanchuki app/ })).not.toBeInTheDocument();
  });

  it('rejects the staff (F-018) code shape — no hyphen, not KAN-prefixed', async () => {
    await renderPage('MEERA1');
    expect(screen.queryByText(/You were referred by a Kanchuki partner/)).not.toBeInTheDocument();
  });

  it('rejects an affiliate code missing its hyphen (RC-031 shape)', async () => {
    await renderPage('KAN7F3QMP');
    expect(screen.queryByText(/You were referred by a Kanchuki partner/)).not.toBeInTheDocument();
  });
});
