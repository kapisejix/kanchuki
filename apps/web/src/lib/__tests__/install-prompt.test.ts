// F-036 Phase A (Task 3): the "add to Home Screen" CTA's decision + capture logic.
//
// Three things here are load-bearing and easy to get subtly wrong:
//   1. `beforeinstallprompt` must be captured with preventDefault(), or Chrome
//      shows its own mini-infobar and our button can never call prompt() at all.
//   2. The CTA must not be offered when there is no captured event (iOS/Firefox
//      never fire it), when the app is already installed, or after the shopper
//      dismissed it — re-prompting a dismissal is how channels get suppressed.
//   3. Safari in private mode throws on localStorage writes; a dismissal must
//      never be able to break the sheet it sits in.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type WindowLike = {
  matchMedia?: (query: string) => { matches: boolean };
  navigator?: { standalone?: boolean };
};

type StorageLike = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void };

function fakeStorage(seed: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

describe('shouldOfferInstall', () => {
  const event = {} as Event;

  it('offers install when a prompt was captured and nothing else blocks it', async () => {
    const { shouldOfferInstall } = await import('../install-prompt');
    expect(
      shouldOfferInstall({ event, standalone: false, dismissed: false }),
    ).toBe(true);
  });

  it('never offers when no beforeinstallprompt was captured', async () => {
    const { shouldOfferInstall } = await import('../install-prompt');
    // iOS Safari and Firefox never fire the event — offering a button that
    // cannot work would be worse than offering nothing.
    expect(shouldOfferInstall({ event: null, standalone: false, dismissed: false })).toBe(false);
  });

  it('never offers when already running as an installed app', async () => {
    const { shouldOfferInstall } = await import('../install-prompt');
    expect(shouldOfferInstall({ event, standalone: true, dismissed: false })).toBe(false);
  });

  it('never offers again after the shopper dismissed it', async () => {
    const { shouldOfferInstall } = await import('../install-prompt');
    expect(shouldOfferInstall({ event, standalone: false, dismissed: true })).toBe(false);
  });
});

describe('isStandalone', () => {
  it('detects the display-mode media query (installed Android/desktop)', async () => {
    const { isStandalone } = await import('../install-prompt');
    const win: WindowLike = { matchMedia: () => ({ matches: true }) };
    expect(isStandalone(win)).toBe(true);
  });

  it("detects iOS Safari's non-standard navigator.standalone flag", async () => {
    const { isStandalone } = await import('../install-prompt');
    const win: WindowLike = {
      matchMedia: () => ({ matches: false }),
      navigator: { standalone: true },
    };
    expect(isStandalone(win)).toBe(true);
  });

  it('reports false in a normal browser tab, and without a window', async () => {
    const { isStandalone } = await import('../install-prompt');
    const win: WindowLike = {
      matchMedia: () => ({ matches: false }),
      navigator: { standalone: false },
    };
    expect(isStandalone(win)).toBe(false);
    expectsFalse(isStandalone(undefined));
  });

  it('survives a browser with no matchMedia', async () => {
    const { isStandalone } = await import('../install-prompt');
    expectsFalse(isStandalone({}));
  });
});

function expectsFalse(value: unknown) {
  expect(value).toBe(false);
}

describe('install dismissal persistence', () => {
  it('round-trips a dismissal through storage', async () => {
    const { wasInstallDismissed, dismissInstall, INSTALL_DISMISSED_KEY } = await import(
      '../install-prompt'
    );
    const storage = fakeStorage();

    expect(wasInstallDismissed(storage)).toBe(false);
    dismissInstall(storage);
    expect(wasInstallDismissed(storage)).toBe(true);
    expect(storage.getItem(INSTALL_DISMISSED_KEY)).toBe('1');
  });

  it('treats missing storage as "not dismissed" instead of throwing', async () => {
    const { wasInstallDismissed, dismissInstall } = await import('../install-prompt');
    expectsFalse(wasInstallDismissed(undefined));
    expect(() => dismissInstall(undefined)).not.toThrow();
  });

  it('swallows a storage write failure (Safari private mode)', async () => {
    const { dismissInstall } = await import('../install-prompt');
    const throwing: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };

    expect(() => dismissInstall(throwing)).not.toThrow();
  });

  it('treats a throwing storage read as "not dismissed" so the CTA still works', async () => {
    const { wasInstallDismissed } = await import('../install-prompt');
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {},
    };

    expectsFalse(wasInstallDismissed(throwing));
  });
});

describe('beforeinstallprompt capture', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  function fakePromptEvent() {
    const preventDefault = vi.fn();
    return {
      event: { preventDefault } as unknown as Event,
      preventDefault,
    };
  }

  it('prevents the default mini-infobar and holds the event for later', async () => {
    const { captureInstallPrompt, getDeferredInstallPrompt } = await import(
      '../install-prompt'
    );
    const { event, preventDefault } = fakePromptEvent();

    expect(getDeferredInstallPrompt()).toBeNull();
    captureInstallPrompt(event);

    // Without preventDefault the browser runs its own UI and the stored event
    // can never be prompted from our button.
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(getDeferredInstallPrompt()).toBe(event);
  });

  it('notifies subscribers and stops after unsubscribe', async () => {
    const { captureInstallPrompt, subscribeInstallPrompt } = await import(
      '../install-prompt'
    );
    const listener = vi.fn();
    const unsubscribe = subscribeInstallPrompt(listener);

    const first = fakePromptEvent();
    captureInstallPrompt(first.event);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    const second = fakePromptEvent();
    captureInstallPrompt(second.event);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps the most recent event when the browser fires it more than once', async () => {
    const { captureInstallPrompt, getDeferredInstallPrompt } = await import(
      '../install-prompt'
    );
    const first = fakePromptEvent();
    const second = fakePromptEvent();

    captureInstallPrompt(first.event);
    captureInstallPrompt(second.event);

    expect(getDeferredInstallPrompt()).toBe(second.event);
  });
});

// The listener used to be attached inside a component effect, which meant it
// only existed once a CTA route had mounted — and both CTA mount points render
// after an async step (the passport lookup, the stores fetch). A
// `beforeinstallprompt` fired before that was dropped for good, because the
// browser dispatches it only once per page load, so the CTA silently never
// appeared. These pin the startup attachment that fixes it.
describe('startup capture (ensureInstallPromptCapture)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function fakeTarget() {
    const handlers: Array<(event: Event) => void> = [];
    const addEventListener = vi.fn((_type: string, listener: (event: Event) => void) => {
      handlers.push(listener);
    });
    return {
      target: { addEventListener },
      addEventListener,
      dispatch(event: Event) {
        for (const listener of handlers) listener(event);
      },
    };
  }

  it('captures an event dispatched on the window with no component mounted', async () => {
    const mod = await import('../install-prompt');

    // Nothing has mounted and nothing has asked to capture — the module did it
    // on import.
    expect(mod.getDeferredInstallPrompt()).toBeNull();

    const event = new Event('beforeinstallprompt', { cancelable: true });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);

    expect(preventDefault).toHaveBeenCalled();
    expect(mod.getDeferredInstallPrompt()).toBe(event);
  });

  it('notifies a subscriber that mounted after the event was captured', async () => {
    const mod = await import('../install-prompt');

    const event = new Event('beforeinstallprompt', { cancelable: true });
    window.dispatchEvent(event);

    const listener = vi.fn();
    mod.subscribeInstallPrompt(listener);

    // The event is still held, so a late-mounting CTA can render from it even
    // though it never saw the dispatch itself.
    expect(mod.getDeferredInstallPrompt()).toBe(event);
  });

  it('attaches at most one listener per target', async () => {
    const mod = await import('../install-prompt');
    const { target, addEventListener } = fakeTarget();

    expect(mod.ensureInstallPromptCapture(target)).toBe(true);
    // Repeat calls are a no-op — two listeners would mean two preventDefault()
    // calls and two subscriber notifications for a single event.
    expect(mod.ensureInstallPromptCapture(target)).toBe(false);
    expect(mod.ensureInstallPromptCapture(target)).toBe(false);

    expect(addEventListener).toHaveBeenCalledTimes(1);
    expect(addEventListener).toHaveBeenCalledWith('beforeinstallprompt', expect.any(Function));
  });

  it('routes a capture through the attached target to the stored event', async () => {
    const mod = await import('../install-prompt');
    const { target, dispatch } = fakeTarget();
    mod.ensureInstallPromptCapture(target);

    const event = new Event('beforeinstallprompt', { cancelable: true });
    dispatch(event);

    expect(mod.getDeferredInstallPrompt()).toBe(event);
  });

  it('does nothing without a window instead of throwing during SSR', async () => {
    vi.stubGlobal('window', undefined);

    const mod = await import('../install-prompt');

    expect(() => mod.ensureInstallPromptCapture()).not.toThrow();
    expect(mod.ensureInstallPromptCapture()).toBe(false);
  });
});
