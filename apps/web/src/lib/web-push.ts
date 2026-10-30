// F-036 Phase B — browser side of Web Push for the customer PWA.
//
// "Supported" is a feature check, not a UA sniff: iOS Safari only exposes
// PushManager to a home-screen app (Apple's rule, spec §4), so a plain Safari
// tab, an in-app browser and an old browser all simply read as unsupported.

export type PushState = 'unsupported' | 'denied' | 'on' | 'off';

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** VAPID keys are base64url; PushManager.subscribe wants raw bytes. */
export function urlBase64ToUint8Array(base64url: string): Uint8Array {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** The server's public key, or null when push is off (404) or unreachable. */
export async function fetchPushKey(): Promise<string | null> {
  try {
    const res = await fetch('/api/passport/push/key');
    if (!res.ok) return null;
    const body = (await res.json()) as { public_key?: unknown };
    return typeof body.public_key === 'string' ? body.public_key : null;
  } catch {
    return null;
  }
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return 'unsupported';
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
}

/** Ask permission, subscribe, and register with the API. Returns the new state. */
export async function enablePush(publicKey: string): Promise<PushState> {
  if ((await Notification.requestPermission()) !== 'granted') {
    return Notification.permission === 'denied' ? 'denied' : 'off';
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  });
  const res = await fetch('/api/passport/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) {
    // Server never saw it: drop the browser side too, or the button lies.
    await sub.unsubscribe().catch(() => {});
    throw new Error(`subscribe failed: ${res.status}`);
  }
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return 'off';
  // Tell the server first; the browser unsubscribe below happens either way, and
  // a stale server row is pruned on its next 404/410 from the push service.
  await fetch('/api/passport/push/unsubscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe();
  return 'off';
}
