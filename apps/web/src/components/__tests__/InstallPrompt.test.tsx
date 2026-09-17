// F-036 Phase A (Task 3): the install CTA as the shopper actually experiences it.
//
// These drive the real `beforeinstallprompt` DOM event rather than poking at
// module internals, so they cover the whole path: listen → capture → show →
// prompt() on click → respect a dismissal.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstallPrompt, InstallPromptCapture } from '../InstallPrompt';

/** Fire the browser's install event and hand back spies on what it receives. */
function firePromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  };
  const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome }) });
  // Dispatch inside act(): the component captures the event and re-renders in
  // response, exactly as it does in the browser.
  act(() => {
    window.dispatchEvent(event);
  });

  return { prompt, preventDefaultSpy };
}

const CTA_NAME = /add kanchuki to your home screen/i;

beforeEach(() => {
  window.localStorage.clear();
  // jsdom has no matchMedia by default; default it to "not installed".
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InstallPrompt', () => {
  it('offers nothing until the browser says the app is installable', () => {
    render(<InstallPrompt />);

    // No beforeinstallprompt has fired — a button here could not work.
    expect(screen.queryByRole('button', { name: CTA_NAME })).not.toBeInTheDocument();
  });

  it('offers the CTA once the browser fires beforeinstallprompt', async () => {
    render(<InstallPrompt />);

    firePromptEvent();

    expect(await screen.findByRole('button', { name: CTA_NAME })).toBeInTheDocument();
  });

  it('captures the event (preventDefault) so the click can drive the real prompt', async () => {
    render(<InstallPrompt />);

    const { prompt, preventDefaultSpy } = firePromptEvent();
    const button = await screen.findByRole('button', { name: CTA_NAME });

    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
    // preventDefault is what stops Chrome showing its own mini-infobar and
    // leaves the event usable by our button.
    expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
  });

  it('hides itself after the shopper dismisses it', async () => {
    render(<InstallPrompt />);
    firePromptEvent();
    await screen.findByRole('button', { name: CTA_NAME });

    fireEvent.click(screen.getByRole('button', { name: /not now/i }));

    expect(screen.queryByRole('button', { name: CTA_NAME })).not.toBeInTheDocument();
  });

  it('stays hidden on a later visit once dismissed — no re-asking', async () => {
    const first = render(<InstallPrompt />);
    firePromptEvent();
    await screen.findByRole('button', { name: CTA_NAME });
    fireEvent.click(screen.getByRole('button', { name: /not now/i }));
    first.unmount();

    // A fresh mount, same browser storage, and the browser offers again.
    render(<InstallPrompt />);
    firePromptEvent();

    expect(screen.queryByRole('button', { name: CTA_NAME })).not.toBeInTheDocument();
  });

  it('never offers install when already running as an installed app', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    render(<InstallPrompt />);

    firePromptEvent();

    expect(screen.queryByRole('button', { name: CTA_NAME })).not.toBeInTheDocument();
  });

  it('rests the dismissal on the shopper, not on the OS', async () => {
    render(<InstallPrompt />);
    const { prompt } = firePromptEvent('dismissed');
    const button = await screen.findByRole('button', { name: CTA_NAME });

    await act(async () => {
      fireEvent.click(button);
    });
    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));

    // The OS-level choice was "dismissed" — don't keep nagging on next visit.
    expect(window.localStorage.getItem('kanchuki:pwa-install-dismissed')).toBe('1');
  });

  it('captures install events from startup, with no CTA mounted at all', async () => {
    // The failure this guards, in the shape it actually happens: Chrome decides
    // the site is installable and fires early in the page load, while the route
    // that owns the CTA is still waiting on a fetch (the passport lookup, the
    // stores list). A listener added in an effect is not there yet, so the event
    // is lost for good — the browser fires it only once per page load.
    //
    // This needs a virgin module: earlier tests in this file have all fired an
    // event, which leaves a captured prompt in module state. Without the reset
    // this would pass by re-reading someone else's event rather than proving
    // anything about startup capture.
    vi.resetModules();
    const { InstallPrompt: FreshInstallPrompt } = await import('../InstallPrompt');

    // Nothing is mounted yet — exactly the page state when the browser fires.
    const { preventDefaultSpy } = firePromptEvent();
    expect(preventDefaultSpy).toHaveBeenCalled();

    render(<FreshInstallPrompt />);
    expect(await screen.findByRole('button', { name: CTA_NAME })).toBeInTheDocument();
  });

  it('renders nothing for InstallPromptCapture — the root-layout mount is inert', () => {
    const { container } = render(<InstallPromptCapture />);
    expect(container).toBeEmptyDOMElement();
  });
});
