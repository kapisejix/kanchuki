// F-036 Phase A (Task 3) — "Add Kanchuki to your Home Screen" CTA logic.
//
// Android/Chrome fires a `beforeinstallprompt` event when the site is
// installable. To drive installation from our own button we must capture that
// event (and preventDefault() it, or Chrome runs its own UI and the event can
// never be prompted). Everything decision-shaped lives here as pure functions
// so the UI stays a rendering shell.
//
// iOS Safari never fires the event at all — it requires the manual
// Share → "Add to Home Screen" flow. That is Phase C of the F-036 roadmap,
// deliberately not built here: with no captured event this module reports
// "don't offer", so the CTA simply doesn't render rather than showing a button
// that cannot work.

/** The subset of the browser's BeforeInstallPromptEvent we rely on. */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const INSTALL_DISMISSED_KEY = 'kanchuki:pwa-install-dismissed';

type WindowLike = {
  matchMedia?: (query: string) => { matches: boolean };
  navigator?: { standalone?: boolean };
};

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

// ─── Capture ──────────────────────────────────────────────────────

let deferredPrompt: InstallPromptEvent | null = null;
const listeners = new Set<(event: InstallPromptEvent) => void>();

/**
 * Stash the browser's install event for later use. Must be called with the
 * event unchecked — `preventDefault()` is what suppresses Chrome's default
 * mini-infobar and keeps the event usable from our own button.
 */
export function captureInstallPrompt(event: Event): void {
  event.preventDefault();
  const promptEvent = event as InstallPromptEvent;
  deferredPrompt = promptEvent;
  // forEach, not for...of: the web app's tsc target predates iterating a Set.
  listeners.forEach((listener) => listener(promptEvent));
}

/** The captured event, or null when the browser never offered one. */
export function getDeferredInstallPrompt(): InstallPromptEvent | null {
  return deferredPrompt;
}

/** Subscribe to capture events. Returns an unsubscribe function. */
export function subscribeInstallPrompt(
  listener: (event: InstallPromptEvent) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The piece of the browser we attach to. Narrowed to `addEventListener` so a
 * test can pass a stand-in instead of the real window.
 */
export interface CaptureTarget {
  addEventListener: (type: string, listener: (event: Event) => void) => void;
}

/** The target the capture listener is currently attached to, if any. */
let captureAttachedTo: CaptureTarget | null = null;

/**
 * Attach the `beforeinstallprompt` listener. Idempotent per target, so a
 * caller can never end up with two listeners — and therefore two
 * `preventDefault()` calls and two subscriber notifications — for one event.
 *
 * @returns true when this call was the one that attached the listener.
 */
export function ensureInstallPromptCapture(target?: CaptureTarget): boolean {
  const resolved =
    target ?? (typeof window === 'undefined' ? null : (window as unknown as CaptureTarget));
  if (!resolved) return false;
  if (captureAttachedTo === resolved) return false;

  resolved.addEventListener('beforeinstallprompt', captureInstallPrompt);
  captureAttachedTo = resolved;
  return true;
}

// Register at module scope rather than in a component effect.
//
// Chrome fires `beforeinstallprompt` as soon as it decides the page is
// installable — which can be before React hydrates, and is generally before a
// fetch-gated component has mounted. Both places that show this CTA (the
// passport sheet, the /my-stores list) render only after an async step, so a
// listener added in an effect misses the event on exactly the visits the CTA
// exists for, and the button silently never appears. Evaluating here attaches
// the listener the moment this module enters the client bundle, which is the
// earliest point available to us; `InstallPromptCapture` in the root layout
// guarantees the module is in that first bundle.
//
// The handler calls `preventDefault()`, which suppresses Chrome's own install
// affordance sitewide. That is intended: the omnibox install icon and the
// browser menu entry are unaffected by preventDefault, so holding the event
// costs nothing on pages that render no CTA — whereas missing it cannot be
// recovered, as the browser only fires it once per page load.
if (typeof window !== 'undefined') {
  ensureInstallPromptCapture();
}

// ─── Eligibility ──────────────────────────────────────────────────

/**
 * Whether the CTA may be shown. All three conditions are refusals: no captured
 * event (unsupported browser), already installed, or the shopper dismissed it
 * before — re-asking after a dismissal is how a channel gets suppressed.
 */
export function shouldOfferInstall(input: {
  event: Event | null;
  standalone: boolean;
  dismissed: boolean;
}): boolean {
  if (!input.event) return false;
  if (input.standalone) return false;
  if (input.dismissed) return false;
  return true;
}

/** True when the page is already running as an installed app. */
export function isStandalone(win?: WindowLike): boolean {
  const target =
    win ?? (typeof window === 'undefined' ? undefined : (window as unknown as WindowLike));
  if (!target) return false;

  try {
    if (target.matchMedia?.('(display-mode: standalone)').matches) return true;
  } catch {
    // A browser that throws on matchMedia is simply not standalone.
  }
  // iOS Safari's non-standard flag.
  return target.navigator?.standalone === true;
}

// ─── Dismissal ────────────────────────────────────────────────────

/**
 * Dismissal is remembered locally, not server-side: it is a device preference
 * (this browser, this phone), not part of the shopper's passport.
 */
export function wasInstallDismissed(storage?: StorageLike): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(INSTALL_DISMISSED_KEY) !== null;
  } catch {
    // Safari private mode throws on storage access. Treat as "not dismissed"
    // so a storage failure can never hide a working install option.
    return false;
  }
}

export function dismissInstall(storage?: StorageLike): void {
  if (!storage) return;
  try {
    storage.setItem(INSTALL_DISMISSED_KEY, '1');
  } catch {
    // Nothing to do — the CTA hides for this page view either way.
  }
}
