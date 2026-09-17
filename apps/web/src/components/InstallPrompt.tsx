'use client';

// F-036 Phase A (Task 3) — "Add Kanchuki to your Home Screen" CTA.
//
// Deliberately not relying on the browser's own install UI: Chrome's
// mini-infobar is easy to miss and can be suppressed entirely on sites with a
// low install rate. Capturing `beforeinstallprompt` and offering our own
// button is the only way to control *when* the ask happens — and the right
// moment is after a shopper has just verified and visited a store, not on
// page load.
//
// Callers own the "is this shopper eligible" question (e.g. they have at least
// one store visit); this component answers "can this browser be asked at all".

import { useCallback, useEffect, useState } from 'react';
import {
  dismissInstall,
  ensureInstallPromptCapture,
  getDeferredInstallPrompt,
  isStandalone,
  shouldOfferInstall,
  subscribeInstallPrompt,
  wasInstallDismissed,
} from '@/lib/install-prompt';

function localStore(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    // Safari private mode throws on storage access.
    return undefined;
  }
}

/**
 * Mounted once in the root layout, and renders nothing.
 *
 * Its whole job is to pull this module into the initial client bundle so the
 * module-scope capture listener is attached on the *first* page of a session,
 * rather than only once a route that shows the CTA has loaded its own chunk.
 * Without it, a shopper whose install event fires on the marketing home page
 * has it dropped, because `beforeinstallprompt` is dispatched only once per
 * page load and nothing was listening.
 */
export function InstallPromptCapture() {
  useEffect(() => {
    ensureInstallPromptCapture();
  }, []);
  return null;
}

export function InstallPrompt({ className = '' }: { className?: string }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    setVisible(
      shouldOfferInstall({
        event: getDeferredInstallPrompt(),
        standalone: isStandalone(),
        dismissed: wasInstallDismissed(localStore()),
      }),
    );
  }, []);

  useEffect(() => {
    // The DOM listener is owned by the module and attached at startup, so this
    // is normally a no-op; it still matters when the module was first evaluated
    // without a window (SSR) and no other importer has run yet.
    ensureInstallPromptCapture();
    // The browser only fires the install event once per page load, and it may
    // have fired before this component mounted — so evaluate on mount, not just
    // when a later capture arrives.
    refresh();

    const unsubscribe = subscribeInstallPrompt(() => refresh());
    const onInstalled = () => setVisible(false);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      unsubscribe();
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [refresh]);

  const handleInstall = useCallback(async () => {
    const event = getDeferredInstallPrompt();
    if (!event) return;

    setBusy(true);
    try {
      await event.prompt();
      const choice = await event.userChoice;
      // Declining at the OS prompt is the shopper saying no — remember it.
      if (choice?.outcome === 'dismissed') dismissInstall(localStore());
    } catch {
      // The browser refused the prompt (usually not a user gesture). Stay quiet.
    } finally {
      setBusy(false);
      setVisible(false);
    }
  }, []);

  const handleDismiss = useCallback(() => {
    dismissInstall(localStore());
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div className={`rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 ${className}`}>
      <p className="text-xs font-semibold text-stone-900">One icon, all your stores</p>
      <p className="text-[11px] text-stone-600 mt-1 leading-relaxed">
        Add Kanchuki to your home screen and new arrivals show up there — no app to
        download.
      </p>
      <div className="flex items-center gap-2 mt-3">
        <button
          type="button"
          onClick={() => void handleInstall()}
          disabled={busy}
          className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-semibold py-2.5 px-3 rounded-lg transition-colors"
        >
          {busy ? 'Adding…' : 'Add Kanchuki to your Home Screen'}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="text-xs font-medium text-stone-500 hover:text-stone-700 px-2 py-2.5 transition-colors"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
