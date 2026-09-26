import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRY_ON_CONSENT } from '@kanchuki/shared';
import { TryOnSheet } from '../TryOnSheet';

// jest-dom matchers (toHaveAttribute / toBeInTheDocument) come from the global
// setup file, same as the other component tests.

// F-040 / T7 — the consent screen must BLOCK capture.
//
// The generated try-on image is a photo of a real person and it is stored, so
// the accepting tap is not decoration: it is the assertion the API records a
// notice version against. "Blocks capture" has to mean the camera affordance
// does not exist yet, not that it is merely dimmed or behind a warning — a
// rendered-but-disabled input is still a rendered input, and a photo taken
// under a notice nobody accepted has no consent behind it.
//
// This test is only meaningful because it can go red: move the capture step
// ahead of the consent step (or render both at once) and the first assertion
// fails on the selfie input appearing while consent is on screen.

// The real Sheet is a framer-motion overlay; the consent gating under test is
// independent of the chrome, so render children inline.
vi.mock('@/components/Sheet', () => ({
  Sheet: ({ children }: { children: ReactNode }) => <div data-testid="sheet">{children}</div>,
}));

function renderSheet(onClose: () => void = () => undefined) {
  return render(
    <TryOnSheet productId="prod-1" productName="Maroon Silk Saree" onClose={onClose} />,
  );
}

// Drives the sheet to the point where it actually posts: accept the notice, then
// hand the file input a selfie. Needs `URL.createObjectURL`, which jsdom does
// not implement (the sheet only uses it to show a preview string).
async function submitSelfie() {
  fireEvent.click(screen.getByText(TRY_ON_CONSENT.acceptLabel));

  const input = screen.getByTestId('try-on-selfie-input') as HTMLInputElement;
  const file = new File(['selfie'], 'selfie.jpg', { type: 'image/jpeg' });
  fireEvent.change(input, { target: { files: [file] } });
}

// F-040 — a signed-out shopper gets a sign-in prompt, not the API's
// 401 sentence.
//
// The API's only 401 here means "no passport session", so the raw message
// leaves the shopper with a dead end. Each assertion below pins one half of the
// replacement: the sentence is gone, and there is a control that resolves it.
describe('TryOnSheet signed-out prompt', () => {
  const apiMessage = 'Sign in to try on this outfit.';

  beforeEach(() => {
    URL.createObjectURL = () => 'blob:selfie';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: { code: 'UNAUTHORIZED', message: apiMessage } }, { status: 401 }),
      ),
    );
  });

  it('shows a purpose-built prompt and never renders the API message', async () => {
    renderSheet();
    await submitSelfie();

    await screen.findByText('Sign in to try this on');

    // The whole point: the API's own wording is not what the shopper reads.
    expect(screen.queryByText(apiMessage)).not.toBeInTheDocument();
    // …and it is not hiding in the generic error step either — the result step
    // (whose only text is `error`) was never reached.
    expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument();
  });

  it('hands off to the login surface carrying this page as the return target', async () => {
    renderSheet();
    await submitSelfie();

    const link = await screen.findByTestId('try-on-signin');

    // A wrong/absent return_to drops the shopper somewhere arbitrary after the
    // OTP, so the destination is asserted, not just the link's presence.
    expect(link).toHaveAttribute(
      'href',
      `/login?return_to=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`,
    );
  });

  it('leaves the shopper a way out without signing in', async () => {
    const onClose = vi.fn();
    renderSheet(onClose);
    await submitSelfie();

    fireEvent.click(await screen.findByText('Not now'));

    expect(onClose).toHaveBeenCalled();
  });
});

describe('TryOnSheet consent gate', () => {
  it('shows the shared consent copy and no selfie input before accepting', () => {
    renderSheet();

    // Rendered from @kanchuki/shared, so the words match the version the API
    // records — a hardcoded second copy would be free to drift.
    expect(screen.getByText(TRY_ON_CONSENT.title)).toBeInTheDocument();
    expect(screen.getByText(TRY_ON_CONSENT.acceptLabel)).toBeInTheDocument();
    expect(screen.getByText(TRY_ON_CONSENT.points[0].label)).toBeInTheDocument();

    // The gate: no way to take a photo yet.
    expect(screen.queryByTestId('try-on-selfie-input')).not.toBeInTheDocument();
  });

  it('reveals the capture input only after the consent is accepted', () => {
    renderSheet();

    expect(screen.queryByTestId('try-on-selfie-input')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(TRY_ON_CONSENT.acceptLabel));

    expect(screen.getByTestId('try-on-selfie-input')).toBeInTheDocument();
  });
});

// F-040 — a session that lapses MID-RUN must end the wait, not extend it.
//
// The status route 401s for the same reason the POST does (no passport session),
// and that response carries no `data.status` — so the poller matches no branch
// and re-arms itself. The bug is not the wrong screen; it is an unbounded loop
// behind a spinner that can never resolve, which is why the assertions below are
// about the CALL COUNT as much as about the copy.
describe('TryOnSheet status-poll 401', () => {
  beforeEach(() => {
    // ONLY the timers this test drives. Vitest's default set also fakes
    // `queueMicrotask`/`setImmediate`, which is what React's `act` and React 18's
    // task queue schedule through — faking those left the submitted POST never
    // running at all (`expected spy to be called 2 times, but got 0`). The poll
    // is a plain `setTimeout`, so that is all that needs to be under test control.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    URL.createObjectURL = () => 'blob:selfie';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops the spinner and asks for sign-in instead of polling forever', async () => {
    const fetchMock = vi
      .fn()
      // 1. the POST is accepted — a job exists and is generating.
      .mockResolvedValueOnce(Response.json({ data: { job_id: 'job-1' } }, { status: 200 }))
      // 2. every read after that is a 401 (the shopper's session is gone).
      .mockResolvedValue(
        Response.json(
          { error: { code: 'UNAUTHORIZED', message: 'Sign in to try on this outfit.' } },
          { status: 401 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderSheet();
    // Accepts the notice, then hands the input a file — the same two taps the
    // other tests use, so this one cannot drift from the real entry path.
    // NOT wrapped in an outer `act`: `fireEvent` already flushes its own, and
    // nesting them left the change event unprocessed (fetch: 0 calls).
    submitSelfie();
    await act(async () => {});

    // The first poll is scheduled 3s out.
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    await act(async () => {});

    // POST + exactly one status read.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The wait ended rather than being re-entered…
    expect(screen.queryByText('Making your picture…')).not.toBeInTheDocument();
    // …and what replaced it is the prompt, not the API's sentence.
    expect(screen.getByText('Sign in to try this on')).toBeInTheDocument();
    expect(screen.queryByText('Sign in to try on this outfit.')).not.toBeInTheDocument();

    // The load-bearing half, and it is a claim about the tick chain rather than
    // about the screen — those come apart. Drop the 401 arm and the read below
    // parses no `data.status`, no branch matches, and the `setTimeout` at the
    // bottom of the tick re-arms: the same prompt and the same stopped spinner,
    // with a request every 3s for as long as the sheet stayed open. Twelve more
    // poll intervals must add exactly nothing.
    await act(async () => {
      vi.advanceTimersByTime(36_000);
    });
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
