// Phase 3 (D7): the Style Passport at the top of /my-profile. One place for colours, size,
// taste and "Show me"; it reuses the My Style cards and never shows a body or skin label.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StylePassport, completeness } from '../StylePassport';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const PALETTE_PROFILE = {
  undertone: 'warm',
  depth: 'medium',
  frame: 'curvy',
  saved_at: '2026-11-26T10:00:00.000Z',
  source: 'photo' as const,
  palette: { good: ['red', 'olive'], avoid: ['grey'] },
};
const EMPTY = { style_profile: null, measurements: null, taste: null };

let profileStatus = 200;
let profileData: Record<string, unknown> = EMPTY;
let prefStatus = 200;
const calls: { url: string; init?: RequestInit }[] = [];

beforeEach(() => {
  profileStatus = 200;
  profileData = EMPTY;
  prefStatus = 200;
  calls.length = 0;
  push.mockReset();
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.includes('/my-style/profile'))
      return new Response(JSON.stringify({ data: profileData }), { status: profileStatus });
    if (url === '/api/passport/preferences')
      return new Response(JSON.stringify({ ok: true }), { status: prefStatus });
    throw new Error(`unexpected ${url}`);
  });
});
afterEach(() => vi.unstubAllGlobals());

const mount = (over: Partial<Parameters<typeof StylePassport>[0]> = {}) =>
  render(<StylePassport gender={null} usualSize={null} prefStyles={[]} {...over} />);

describe('completeness', () => {
  it('counts colours, size and taste', () => {
    expect(completeness(EMPTY, null, []).done).toBe(0);
    expect(completeness({ ...EMPTY, style_profile: PALETTE_PROFILE }, null, []).done).toBe(1);
    expect(completeness(EMPTY, 'M', []).steps.find((s) => s.key === 'size')?.done).toBe(true);
    expect(completeness(EMPTY, null, ['Anarkali']).steps.find((s) => s.key === 'taste')?.done).toBe(
      true,
    );
    expect(completeness(EMPTY, null, []).total).toBe(3);
  });
});

describe('StylePassport', () => {
  it('shows progress, the colour card, and links for what is missing', async () => {
    profileData = { ...EMPTY, style_profile: PALETTE_PROFILE };
    mount({ usualSize: 'M' });
    expect(await screen.findByText('2 of 3 done')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Take the quick quiz/ }).getAttribute('href')).toBe(
      '/my-style',
    );
    expect(document.getElementById('passport')).not.toBeNull();
  });

  it('without colours offers to find them via the My Style photo sheet', async () => {
    mount();
    expect(
      (await screen.findByRole('link', { name: /Find your colours/ })).getAttribute('href'),
    ).toBe('/my-style?retake=1');
  });

  it('the size block reads usual size, ft/in and inches (B2)', async () => {
    profileData = {
      ...EMPTY,
      measurements: { height_cm: 163, bust_cm: 86, waist_cm: null, hip_cm: null, saved_at: null },
    };
    mount({ usualSize: 'M' });
    expect(await screen.findByText('Usual size M · Height 5 ft 4 in · Bust 34 in')).toBeTruthy();
  });

  it('the size step no longer says "coming soon"', async () => {
    const { container } = mount();
    await screen.findByText('0 of 3 done');
    expect(container.textContent).toMatch(/Your size shown on products/);
    expect(container.textContent).not.toMatch(/coming soon/i);
  });

  it('never shows a body or skin label', async () => {
    profileData = { ...EMPTY, style_profile: PALETTE_PROFILE };
    const { container } = mount();
    await screen.findByText('1 of 3 done');
    expect(container.textContent).not.toMatch(/curvy|petite|undertone|skin/i);
  });

  it('a failed profile read says so and can retry', async () => {
    profileStatus = 500;
    mount();
    expect(await screen.findByText("Couldn't load your style profile.")).toBeTruthy();
    profileStatus = 200;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('0 of 3 done')).toBeTruthy();
  });

  it('Show me saves the pick; Both saves null', async () => {
    mount();
    await screen.findByText('0 of 3 done');
    fireEvent.click(screen.getByRole('radio', { name: "Women's wear" }));
    await waitFor(() =>
      expect(JSON.parse(calls.at(-1)?.init?.body as string)).toEqual({ gender: 'FEMALE' }),
    );
    expect(calls.at(-1)?.init?.method).toBe('PUT');
    fireEvent.click(screen.getByRole('radio', { name: 'Both' }));
    await waitFor(() =>
      expect(JSON.parse(calls.at(-1)?.init?.body as string)).toEqual({ gender: null }),
    );
  });

  it('a failed Show me save goes back and says so', async () => {
    prefStatus = 500;
    mount({ gender: 'MALE' });
    await screen.findByText('0 of 3 done');
    fireEvent.click(screen.getByRole('radio', { name: "Women's wear" }));
    expect(await screen.findByText("Couldn't save. Try again.")).toBeTruthy();
    expect(screen.getByRole('radio', { name: "Men's wear" })).toBeChecked();
  });

  it('Retake on the colour card goes to the My Style photo sheet', async () => {
    profileData = { ...EMPTY, style_profile: PALETTE_PROFILE };
    mount();
    await screen.findByText('1 of 3 done');
    fireEvent.click(screen.getByRole('button', { name: /Retake/ }));
    expect(push).toHaveBeenCalledWith('/my-style?retake=1');
  });
});
