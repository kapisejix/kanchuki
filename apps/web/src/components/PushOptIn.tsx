'use client';

// F-036 Phase B — "Notify me about new arrivals" on /my-stores.
//
// Opt-in only (spec §6): nothing is asked until the shopper taps the button, and
// the button only renders when the server has push configured AND this browser
// can receive it. On iOS that means a home-screen app (§4); a Safari tab reads
// as unsupported and sees nothing here — the install CTA above covers that path.

import { useEffect, useState } from 'react';
import {
  disablePush,
  enablePush,
  fetchPushKey,
  getPushState,
  type PushState,
} from '@/lib/web-push';

export function PushOptIn() {
  const [key, setKey] = useState<string | null>(null);
  const [state, setState] = useState<PushState>('unsupported');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [k, s] = await Promise.all([fetchPushKey(), getPushState()]);
      if (cancelled) return;
      setKey(k);
      setState(s);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!key || state === 'unsupported') return null;

  async function toggle() {
    if (!key) return;
    setBusy(true);
    setFailed(false);
    try {
      setState(state === 'on' ? await disablePush() : await enablePush(key));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-white rounded-lg border border-stone-200 p-4">
      <p className="font-medium text-stone-900">New arrivals</p>
      <p className="text-sm text-stone-500 mt-1">
        {state === 'denied'
          ? 'Notifications are blocked for this site. Allow them in your browser settings to get new-arrival alerts.'
          : 'Get a notification when stores you have visited add new items. At most 2 a week per store.'}
      </p>
      {state !== 'denied' && (
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={busy}
          className="mt-3 min-h-[44px] px-4 rounded-lg text-sm font-medium border border-amber-300 text-amber-800 disabled:opacity-60"
        >
          {busy ? 'Please wait…' : state === 'on' ? 'Turn off notifications' : 'Notify me about new arrivals'}
        </button>
      )}
      {failed && (
        <p role="alert" className="text-xs text-red-600 mt-2">
          Could not update notifications. Please try again.
        </p>
      )}
    </section>
  );
}
