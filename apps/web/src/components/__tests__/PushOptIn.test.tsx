import { urlBase64ToUint8Array } from '@/lib/web-push';
// F-036 Phase B: the opt-in only shows when push can actually work, and a failed
// server registration never leaves the button claiming "on".
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PushOptIn } from '../PushOptIn';

const sub = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  toJSON: () => ({
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    keys: { p256dh: 'p', auth: 'a' },
  }),
  unsubscribe: vi.fn().mockResolvedValue(true),
};
const pushManager = { getSubscription: vi.fn(), subscribe: vi.fn() };

function stubBrowser(permission: NotificationPermission = 'default') {
  const reg = { pushManager };
  vi.stubGlobal('PushManager', function PushManager() {});
  vi.stubGlobal('Notification', {
    permission,
    requestPermission: vi.fn().mockResolvedValue('granted'),
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: vi.fn().mockResolvedValue(reg), ready: Promise.resolve(reg) },
  });
}

function stubFetch(subscribeStatus = 200, keyStatus = 200) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
    url.endsWith('/push/key')
      ? new Response(JSON.stringify({ public_key: 'BAAA' }), { status: keyStatus })
      : new Response('{}', { status: subscribeStatus }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  pushManager.getSubscription.mockResolvedValue(null);
  pushManager.subscribe.mockResolvedValue(sub);
  sub.unsubscribe.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('PushOptIn', () => {
  it('renders nothing where the browser has no PushManager (e.g. an iOS Safari tab)', async () => {
    const fetchMock = stubFetch();
    const { container } = render(<PushOptIn />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the server has push switched off', async () => {
    stubBrowser();
    const fetchMock = stubFetch(200, 404);
    const { container } = render(<PushOptIn />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('subscribes on tap and registers the subscription with the API', async () => {
    stubBrowser();
    const fetchMock = stubFetch();
    render(<PushOptIn />);
    fireEvent.click(await screen.findByRole('button', { name: 'Notify me about new arrivals' }));
    await screen.findByRole('button', { name: 'Turn off notifications' });
    const call = fetchMock.mock.calls.find(([u]) => u === '/api/passport/push/subscribe');
    expect(JSON.parse(call?.[1]?.body as string).endpoint).toBe(sub.endpoint);
  });

  it('rolls the browser subscription back when the API refuses it', async () => {
    stubBrowser();
    stubFetch(401);
    render(<PushOptIn />);
    fireEvent.click(await screen.findByRole('button', { name: 'Notify me about new arrivals' }));
    await screen.findByRole('alert');
    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Notify me about new arrivals' }),
    ).toBeInTheDocument();
  });

  it('explains a browser-level block instead of offering a dead button', async () => {
    stubBrowser('denied');
    stubFetch();
    render(<PushOptIn />);
    await screen.findByText(/blocked for this site/);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('urlBase64ToUint8Array', () => {
  it('decodes base64url without padding', () => {
    // "-_8" is base64url for 0xFB 0xFF ("+/8=" in base64).
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([0xfb, 0xff]);
  });
});
