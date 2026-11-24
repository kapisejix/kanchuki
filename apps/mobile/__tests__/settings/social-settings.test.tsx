import { Alert, Linking } from 'react-native';
import { act } from 'react-test-renderer';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '../../src/test/__mocks__/testing-library';

// T3.2-a #9 — app/settings/social.tsx (Facebook Page connect / disconnect / history).
// The native login flow (RC-016/018) lives in lib/facebook-auth and has its own test;
// here loginWithFacebook is a stub and the screen's own branches are pinned.
vi.hoisted(() => {
  (globalThis as Record<string, unknown>).__DEV__ = true;
});

import { router } from 'expo-router';
import SocialSettingsScreen from '../../app/settings/social';
import { ApiError } from '../../src/lib/api/api-error';
import { FacebookAuthCancelled, FacebookAuthUnavailable } from '../../src/lib/facebook-auth';

const m = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  listPosts: vi.fn(),
  connectWithToken: vi.fn(),
  getConnectUrl: vi.fn(),
  autoConnect: vi.fn(),
  disconnect: vi.fn(),
  loginWithFacebook: vi.fn(),
}));
const queryStore = vi.hoisted(() => new Map<string, unknown>());
const rq = vi.hoisted(() => ({
  invalidate: vi.fn(),
  loadingAccounts: false,
  loadingPosts: false,
  opts: [] as { queryKey: unknown[]; queryFn: () => unknown; enabled?: boolean }[],
}));

vi.mock('../../src/lib/api', () => ({
  socialApi: {
    listAccounts: m.listAccounts,
    listPosts: m.listPosts,
    connectWithToken: m.connectWithToken,
    getConnectUrl: m.getConnectUrl,
    autoConnect: m.autoConnect,
    disconnect: m.disconnect,
  },
}));
vi.mock('../../src/lib/facebook-auth', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/facebook-auth')>(
    '../../src/lib/facebook-auth',
  );
  return { ...actual, loginWithFacebook: m.loginWithFacebook };
});
vi.mock('expo-linking', () => ({
  parse: (u: string) => ({ queryParams: Object.fromEntries(new URL(u).searchParams) }),
}));
vi.mock('../../src/components/BrandIcon', () => ({ BrandIcon: () => null }));
// theme.tsx -> storage pulls native expo modules; the screen only reads colours from it.
vi.mock('../../src/lib/theme', () => {
  const c = { 400: '#999', 600: '#555' };
  return { useTheme: () => ({ primaryColor: '#000', colors: { sand: c, turmeric: c, rust: c } }) };
});
vi.mock('@tanstack/react-query', () => ({
  useQuery: (o: { queryKey: unknown[]; queryFn: () => unknown; enabled?: boolean }) => {
    rq.opts.push(o);
    const isAccounts = o.queryKey[1] === 'accounts';
    return {
      data: queryStore.get(JSON.stringify(o.queryKey)),
      isLoading: isAccounts ? rq.loadingAccounts : rq.loadingPosts,
    };
  },
  useQueryClient: () => ({ invalidateQueries: rq.invalidate }),
}));

// ── Tree helpers ───────────────────────────────────────────────────
type TreeNode = {
  type: unknown;
  props: Record<string, any>;
  children?: (TreeNode | string)[];
  rendered?: TreeNode;
};
type Tree = ReturnType<typeof render>;
function collectNodes(
  node: TreeNode | TreeNode[] | string | null | undefined,
  pred: (n: TreeNode) => boolean,
  out: TreeNode[] = [],
): TreeNode[] {
  if (!node) return out;
  if (Array.isArray(node)) {
    for (const c of node) collectNodes(c, pred, out);
    return out;
  }
  if (typeof node !== 'object') return out;
  if (pred(node)) out.push(node);
  collectNodes(node.children as TreeNode[] | undefined, pred, out);
  if (node.rendered) collectNodes(node.rendered, pred, out);
  return out;
}
function collectText(
  node: TreeNode | TreeNode[] | string | null | undefined,
  out: string[] = [],
): string[] {
  if (!node) return out;
  if (Array.isArray(node)) {
    for (const c of node) collectText(c, out);
    return out;
  }
  if (typeof node === 'string') {
    out.push(node);
    return out;
  }
  if (typeof node !== 'object') return out;
  collectText(node.children as TreeNode[] | undefined, out);
  if (node.rendered) collectText(node.rendered, out);
  return out;
}
const text = (t: Tree) => collectText(t.toTree() as TreeNode).join('');
const nodes = (t: Tree, pred: (n: TreeNode) => boolean) =>
  collectNodes(t.toTree() as TreeNode, pred);
const hasPress = (n: TreeNode) => typeof n.props?.onPress === 'function';
const byLabel = (t: Tree, label: string) =>
  nodes(t, (n) => hasPress(n) && n.props.accessibilityLabel === label)[0]?.props;
const byText = (t: Tree, s: string) =>
  nodes(t, (n) => hasPress(n) && collectText(n).join('').includes(s))[0]?.props;
const historyVisible = (t: Tree) =>
  nodes(t, (n) => n.type === 'Modal' && 'visible' in n.props)[0]?.props.visible as boolean;
const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
const tap = async (p: Record<string, any> | undefined, what: string) => {
  expect(p, what).toBeDefined();
  await act(async () => {
    await p!.onPress();
    await new Promise((r) => setTimeout(r, 0));
  });
};
const press = (t: Tree, label: string) => tap(byLabel(t, label), label);

// ── Fixtures ──────────────────────────────────────────────────────
const ACCOUNTS_KEY = JSON.stringify(['social', 'accounts']);
const account = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  account_name: 'Meena Boutique',
  connected_at: '2026-10-01T10:00:00Z',
  ...over,
});
const post = (over: Record<string, unknown> = {}) => ({
  id: 'po1',
  post_type: 'SINGLE_PRODUCT',
  status: 'POSTED',
  caption: 'New arrival',
  likes_count: null,
  comments_count: null,
  created_at: '2026-10-02T10:00:00Z',
  error_message: null,
  external_post_url: null,
  ...over,
});

let urlHandler: ((e: { url: string }) => Promise<void>) | undefined;
const removeSub = vi.fn();
let mounted: Tree[] = [];
async function mount(accounts: unknown[] = [account()]) {
  queryStore.set(ACCOUNTS_KEY, { data: accounts });
  const t = render(<SocialSettingsScreen />);
  mounted.push(t);
  await flush();
  return t;
}
const fireUrl = (url: string) =>
  act(async () => {
    await urlHandler!({ url });
    await new Promise((r) => setTimeout(r, 0));
  });

beforeEach(() => {
  vi.clearAllMocks();
  queryStore.clear();
  rq.loadingAccounts = false;
  rq.loadingPosts = false;
  rq.opts = [];
  urlHandler = undefined;
  vi.spyOn(Linking, 'addEventListener').mockImplementation(((
    _: string,
    cb: (e: { url: string }) => Promise<void>,
  ) => {
    urlHandler = cb;
    return { remove: removeSub };
  }) as never);
  vi.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  m.loginWithFacebook.mockResolvedValue('fb-token');
  m.connectWithToken.mockResolvedValue({
    data: { connected: true, account_name: 'Meena Boutique' },
  });
  m.disconnect.mockResolvedValue(undefined);
});
afterEach(() => {
  for (const t of mounted) t.unmount();
  mounted = [];
});

describe('accounts list', () => {
  it('shows a spinner while loading, with no empty-state copy', async () => {
    rq.loadingAccounts = true;
    const t = await mount([]);
    expect(text(t)).not.toContain('No accounts connected');
    expect(byLabel(t, 'Connect Facebook Page')).toBeUndefined();
  });

  it('no accounts: empty state with the Connect button', async () => {
    const t = await mount([]);
    expect(text(t)).toContain('No accounts connected');
    expect(byLabel(t, 'Connect Facebook Page')).toBeDefined();
    expect(byLabel(t, 'Connect another Page')).toBeUndefined();
  });

  it('a connected account shows name + date, Post opens the composer, and another Page can be added', async () => {
    const t = await mount();
    expect(text(t)).toContain('Meena Boutique');
    expect(text(t)).toContain(
      `Facebook Page · connected ${new Date('2026-10-01T10:00:00Z').toLocaleDateString()}`,
    );
    expect(text(t)).not.toContain('No accounts connected');
    await press(t, 'Post');
    expect(router.push).toHaveBeenCalledWith('/social/create');
    expect(byLabel(t, 'Connect another Page')).toBeDefined();
  });

  it('the accounts query reads listAccounts', async () => {
    await mount();
    const q = rq.opts.find((o) => o.queryKey[1] === 'accounts')!;
    q.queryFn();
    expect(m.listAccounts).toHaveBeenCalledTimes(1);
  });
});

describe('post history', () => {
  const open = async (t: Tree) => tap(byLabel(t, 'History'), 'History');

  it('is closed and fetches nothing until History is tapped, then reads that account', async () => {
    const t = await mount();
    expect(historyVisible(t)).toBe(false);
    const closed = rq.opts.filter((o) => o.queryKey[1] === 'posts').at(-1)!;
    expect(closed.enabled).toBe(false);
    await open(t);
    expect(historyVisible(t)).toBe(true);
    const openQ = rq.opts.filter((o) => o.queryKey[1] === 'posts').at(-1)!;
    expect(openQ.queryKey).toEqual(['social', 'posts', 'a1']);
    expect(openQ.enabled).toBe(true);
    openQ.queryFn();
    expect(m.listPosts).toHaveBeenCalledWith('a1');
  });

  it('Close dismisses it', async () => {
    const t = await mount();
    await open(t);
    await press(t, 'Close');
    expect(historyVisible(t)).toBe(false);
  });

  it('no posts shows the empty copy', async () => {
    queryStore.set(JSON.stringify(['social', 'posts', 'a1']), { data: [] });
    const t = await mount();
    await open(t);
    expect(text(t)).toContain('No posts yet');
  });

  it('labels each post type and marks Posted vs Failed', async () => {
    queryStore.set(JSON.stringify(['social', 'posts', 'a1']), {
      data: [
        post({ id: '1', post_type: 'SINGLE_PRODUCT' }),
        post({ id: '2', post_type: 'COLLECTION_LINK', status: 'FAILED' }),
        post({ id: '3', post_type: 'IMAGE' }),
        post({ id: '4', post_type: 'CAROUSEL' }),
      ],
    });
    const t = await mount();
    await open(t);
    const s = text(t);
    for (const label of ['Product post', 'Collection link', 'Design post', 'Carousel'])
      expect(s).toContain(label);
    expect(s.match(/Posted/g)).toHaveLength(3);
    expect(s.match(/Failed/g)).toHaveLength(1);
  });

  it('shows like/comment counts only when the post has them', async () => {
    const hearts = (t: Tree) => nodes(t, (n) => n.props?.testID === 'lucide-Heart').length;
    queryStore.set(JSON.stringify(['social', 'posts', 'a1']), {
      data: [post({ likes_count: 7, comments_count: 3 })],
    });
    const t = await mount();
    await open(t);
    expect(hearts(t)).toBe(1);
    expect(text(t)).toContain('7');
    t.unmount();
    mounted = [];
    queryStore.set(JSON.stringify(['social', 'posts', 'a1']), { data: [post()] });
    const t2 = await mount();
    await open(t2);
    expect(hearts(t2)).toBe(0);
  });

  it('a failed post shows its error instead of a link; a posted one links to Facebook', async () => {
    queryStore.set(JSON.stringify(['social', 'posts', 'a1']), {
      data: [
        post({
          id: 'bad',
          status: 'FAILED',
          error_message: 'Token expired',
          external_post_url: 'https://fb/ignored',
        }),
        post({ id: 'ok', external_post_url: 'https://fb/ok' }),
      ],
    });
    const t = await mount();
    await open(t);
    expect(text(t)).toContain('Token expired');
    expect(text(t).match(/View on Facebook/g)).toHaveLength(1);
    await tap(byText(t, 'View on Facebook'), 'link');
    expect(Linking.openURL).toHaveBeenCalledWith('https://fb/ok');
  });
});

describe('connect', () => {
  it('native login then connectWithToken, alerts with the account name and refreshes', async () => {
    const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    const t = await mount([]);
    await press(t, 'Connect Facebook Page');
    expect(m.loginWithFacebook).toHaveBeenCalledWith('facebook');
    expect(m.connectWithToken).toHaveBeenCalledWith('fb-token', 'facebook');
    expect(alertSpy).toHaveBeenCalledWith('Connected', 'Linked Meena Boutique.');
    expect(rq.invalidate).toHaveBeenCalledWith({ queryKey: ['social', 'accounts'] });
  });

  it.each([
    [
      'handle when there is no account name',
      { connected: true, handle: '@meena' },
      'Linked @meena.',
    ],
    ['a generic name when neither exists', { connected: true }, 'Linked your Facebook Page.'],
  ])('alert falls back to %s', async (_n, data, expected) => {
    m.connectWithToken.mockResolvedValue({ data });
    const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    const t = await mount([]);
    await press(t, 'Connect Facebook Page');
    expect(alertSpy).toHaveBeenCalledWith('Connected', expected);
  });

  it('"Connect another Page" runs the same flow', async () => {
    vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    const t = await mount();
    await press(t, 'Connect another Page');
    expect(m.connectWithToken).toHaveBeenCalledTimes(1);
  });

  it('cancelling the Facebook dialog is silent: no banner, no API call', async () => {
    m.loginWithFacebook.mockRejectedValue(new FacebookAuthCancelled());
    const t = await mount([]);
    await press(t, 'Connect Facebook Page');
    expect(text(t)).not.toContain('Could not connect');
    expect(m.connectWithToken).not.toHaveBeenCalled();
    expect(byLabel(t, 'Connect Facebook Page')?.disabled).toBeFalsy();
  });

  it('without the native SDK it opens the real web OAuth URL', async () => {
    m.loginWithFacebook.mockRejectedValue(new FacebookAuthUnavailable());
    m.getConnectUrl.mockResolvedValue({ data: { auth_url: 'https://fb/dialog' } });
    const t = await mount([]);
    await press(t, 'Connect Facebook Page');
    expect(m.getConnectUrl).toHaveBeenCalledWith('facebook');
    expect(Linking.openURL).toHaveBeenCalledWith('https://fb/dialog');
    expect(m.connectWithToken).not.toHaveBeenCalled();
    expect(text(t)).not.toContain('Could not connect');
  });

  it('web fallback with no auth_url shows the not-configured banner (never a fake success)', async () => {
    m.loginWithFacebook.mockRejectedValue(new FacebookAuthUnavailable());
    m.getConnectUrl.mockResolvedValue({ data: {} });
    const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    const t = await mount([]);
    await press(t, 'Connect Facebook Page');
    expect(text(t)).toContain('Could not connect');
    expect(text(t)).toContain('Server did not return a Facebook login URL');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  // Pins current behaviour: the banner renders err.message as is (the RC-117 comment in this
  // file says SDK and API messages are safe), including a 5xx server message.
  it('any other failure shows the banner with the error message; a non-Error shows the generic text', async () => {
    m.connectWithToken.mockRejectedValueOnce(
      new ApiError('SOCIAL_NOT_CONFIGURED', 'Social publishing is not configured', 503),
    );
    const t = await mount([]);
    await press(t, 'Connect Facebook Page');
    expect(text(t)).toContain('Could not connect');
    expect(text(t)).toContain('Social publishing is not configured');
    m.loginWithFacebook.mockRejectedValueOnce('weird');
    await press(t, 'Connect Facebook Page');
    expect(text(t)).toContain('Could not connect your Facebook Page');
    expect(text(t)).not.toContain('Social publishing is not configured');
  });

  it('the banner clears when the next attempt starts and succeeds', async () => {
    m.loginWithFacebook.mockRejectedValueOnce(new Error('boom'));
    vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    const t = await mount([]);
    await press(t, 'Connect Facebook Page');
    expect(text(t)).toContain('boom');
    await press(t, 'Connect Facebook Page');
    expect(text(t)).not.toContain('boom');
  });

  it('the button shows loading while a login is in flight', async () => {
    let settle: (v: string) => void = () => {};
    m.loginWithFacebook.mockImplementation(() => new Promise((r) => (settle = r)));
    vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    const t = await mount([]);
    await act(async () => {
      byLabel(t, 'Connect Facebook Page')!.onPress();
    });
    expect(byLabel(t, 'Connect Facebook Page')?.disabled).toBe(true);
    await act(async () => {
      settle('tok');
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(byLabel(t, 'Connect Facebook Page')?.disabled).toBeFalsy();
  });

  // RC-132 (RC-015 shape): `connecting` state reaches the button a render late, so openConnect
  // is guarded by connectingRef; two taps in one tick start one login.
  it('a second tap in the same tick starts no second login', async () => {
    let settle: (v: string) => void = () => {};
    m.loginWithFacebook.mockImplementation(() => new Promise((r) => (settle = r)));
    vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    const t = await mount([]);
    const btn = byLabel(t, 'Connect Facebook Page')!;
    await act(async () => {
      btn.onPress();
      btn.onPress();
    });
    expect(m.loginWithFacebook).toHaveBeenCalledTimes(1);
    await act(async () => {
      settle('tok');
      await new Promise((r) => setTimeout(r, 0));
    });
  });
});

describe('disconnect', () => {
  const confirm = async (t: Tree) => {
    const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    await press(t, 'Disconnect');
    const [title, body, buttons] = alertSpy.mock.calls[0]! as [
      string,
      string,
      { text: string; onPress?: () => Promise<void> }[],
    ];
    return { alertSpy, title, body, buttons };
  };

  it('asks first, naming the page; Cancel does nothing', async () => {
    const t = await mount();
    const { title, body, buttons } = await confirm(t);
    expect(title).toBe('Disconnect Meena Boutique?');
    expect(body).toBe('You can reconnect anytime. Your post history stays on Facebook.');
    expect(buttons.find((b) => b.text === 'Cancel')!.onPress).toBeUndefined();
    expect(m.disconnect).not.toHaveBeenCalled();
  });

  it('confirming deletes that account through the API and refreshes the list', async () => {
    const t = await mount();
    const { buttons } = await confirm(t);
    await act(async () => buttons.find((b) => b.text === 'Disconnect')!.onPress!());
    expect(m.disconnect).toHaveBeenCalledWith('a1');
    expect(rq.invalidate).toHaveBeenCalledWith({ queryKey: ['social', 'accounts'] });
  });

  it.each([
    [
      '4xx shows the server reason',
      new ApiError('X', 'Page already removed', 404),
      'Page already removed',
    ],
    ['5xx shows the fallback', new ApiError('X', 'pg exploded', 500), 'Could not disconnect'],
  ])('failure: %s, and the list is not refreshed', async (_n, err, shown) => {
    m.disconnect.mockRejectedValue(err);
    const t = await mount();
    const { alertSpy, buttons } = await confirm(t);
    alertSpy.mockClear();
    await act(async () => buttons.find((b) => b.text === 'Disconnect')!.onPress!());
    expect(alertSpy).toHaveBeenCalledWith('Error', shown, undefined);
    expect(rq.invalidate).not.toHaveBeenCalled();
  });
});

describe('OAuth deep link', () => {
  it('a settings/social return without a code only refreshes', async () => {
    await mount();
    await fireUrl('kanchuki://settings/social');
    expect(rq.invalidate).toHaveBeenCalledWith({ queryKey: ['social', 'accounts'] });
    expect(m.autoConnect).not.toHaveBeenCalled();
  });

  it('a settings/social URL that carries a code is completed, not just refreshed', async () => {
    m.autoConnect.mockResolvedValue({ data: { connected: true } });
    vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    await mount([]);
    await fireUrl('kanchuki://settings/social?code=abc&state=xyz');
    expect(m.autoConnect).toHaveBeenCalledWith({ code: 'abc', state: 'xyz', provider: 'facebook' });
  });

  it('an unrelated URL, or a callback with no code, does nothing', async () => {
    await mount();
    await fireUrl('kanchuki://somewhere/else');
    await fireUrl('https://app/oauth/callback');
    expect(m.autoConnect).not.toHaveBeenCalled();
    expect(rq.invalidate).not.toHaveBeenCalled();
  });

  it('a code URL completes the connect with code + state, alerts and refreshes', async () => {
    m.autoConnect.mockResolvedValue({ data: { connected: true, handle: '@meena' } });
    const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    await mount([]);
    await fireUrl('kanchuki://oauth/callback?code=abc&state=xyz');
    expect(m.autoConnect).toHaveBeenCalledWith({ code: 'abc', state: 'xyz', provider: 'facebook' });
    expect(alertSpy).toHaveBeenCalledWith('Connected', 'Linked @meena.');
    expect(rq.invalidate).toHaveBeenCalledWith({ queryKey: ['social', 'accounts'] });
  });

  it('a failed completion shows the fallback (or the 4xx reason) and does not refresh', async () => {
    m.autoConnect.mockRejectedValueOnce(new ApiError('X', 'boom', 500));
    const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    await mount([]);
    await fireUrl('kanchuki://oauth/callback?code=abc&state=xyz');
    expect(alertSpy).toHaveBeenCalledWith(
      'Error',
      'Failed to complete Facebook connection',
      undefined,
    );
    expect(rq.invalidate).not.toHaveBeenCalled();
    m.autoConnect.mockRejectedValueOnce(new ApiError('STATE', 'Login expired, try again', 400));
    alertSpy.mockClear();
    await fireUrl('kanchuki://oauth/callback?code=abc&state=xyz');
    expect(alertSpy).toHaveBeenCalledWith('Error', 'Login expired, try again', undefined);
  });

  it('stops listening on unmount', async () => {
    const t = await mount();
    expect(removeSub).not.toHaveBeenCalled();
    t.unmount();
    mounted = [];
    expect(removeSub).toHaveBeenCalledTimes(1);
  });
});
