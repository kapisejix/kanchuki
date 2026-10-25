'use client';

// F-036 Phase B — "Notify me about new arrivals" on /my-stores.
//
// Opt-in only (spec §6): nothing is asked until the shopper taps the button, and
// the button only renders when the server has push configured AND this browser
// can receive it. On iOS that means a home-screen app (§4); a Safari tab reads
// as unsupported and sees nothing here — the install CTA above covers that path.

import { useEffect, useState } from 'react';
import { BellOff, BellRing, Loader2 } from 'lucide-react';
import { BTN_PRIMARY, BTN_SECONDARY, CARD } from '@/app/(shopper)/ui';
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

  const on = state === 'on';
  const Icon = state === 'denied' ? BellOff : BellRing;

  // Royal Orchid card (passport pages). Off = primary ask; on = quiet secondary to turn off.
  return (
    <section className={`${CARD} p-5`}>
      <div className="flex items-start gap-3">
        <span
          className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center ${
            on ? 'bg-fuchsia-500/15 text-fuchsia-600' : 'bg-lavender-100 text-heliotrope-600'
          }`}
        >
          <Icon aria-hidden className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 pt-1.5">
          <p className="text-base font-bold text-spaceCadet-900">New arrivals</p>
          <p className="text-sm text-heliotrope-500 mt-0.5">
            {state === 'denied'
              ? 'Notifications are blocked for this site. Allow them in your browser settings to get new-arrival alerts.'
              : 'Get a notification when stores you have visited add new items. At most 2 a week per store.'}
          </p>
        </div>
      </div>
      {state !== 'denied' && (
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={busy}
          className={`${on ? BTN_SECONDARY : BTN_PRIMARY} mt-4 w-full sm:w-auto`}
        >
          {busy && <Loader2 aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
          {busy ? 'Please wait…' : on ? 'Turn off notifications' : 'Notify me about new arrivals'}
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
