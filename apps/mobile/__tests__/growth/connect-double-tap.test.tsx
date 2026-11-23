import { Alert } from 'react-native';
import { act } from 'react-test-renderer';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '../../src/test/__mocks__/testing-library';

// RC-132 — growth/integrations/facebook.tsx and instagram.tsx: two connect taps in one
// tick must start one login (the `connecting` state reaches the button a render late).
vi.hoisted(() => {
  (globalThis as Record<string, unknown>).__DEV__ = true;
});

import FacebookConfigScreen from '../../app/growth/integrations/facebook';
import InstagramConfigScreen from '../../app/growth/integrations/instagram';

const m = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  connectWithToken: vi.fn(),
  getConnectUrl: vi.fn(),
  autoConnect: vi.fn(),
  disconnect: vi.fn(),
  integrations: vi.fn(),
  loginWithFacebook: vi.fn(),
}));

vi.mock('../../src/lib/api/social', () => ({
  socialApi: {
    listAccounts: m.listAccounts,
    connectWithToken: m.connectWithToken,
    getConnectUrl: m.getConnectUrl,
    autoConnect: m.autoConnect,
    disconnect: m.disconnect,
  },
}));
vi.mock('../../src/lib/api/growth', () => ({ growthApi: { integrations: m.integrations } }));
vi.mock('../../src/lib/facebook-auth', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/facebook-auth')>(
    '../../src/lib/facebook-auth',
  );
  return { ...actual, loginWithFacebook: m.loginWithFacebook };
});
vi.mock('expo-linking', () => ({
  parse: () => ({ queryParams: {} }),
  openURL: vi.fn(),
  addEventListener: () => ({ remove: vi.fn() }),
}));
vi.mock('../../src/components/BrandIcon', () => ({ BrandIcon: () => null }));
vi.mock('../../src/lib/theme', () => {
  const c = { 400: '#999', 600: '#555' };
  return { useTheme: () => ({ primaryColor: '#000', colors: { sand: c, turmeric: c, rust: c } }) };
});
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isLoading: false, isRefetching: false, refetch: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

type TreeNode = {
  type: unknown;
  props: Record<string, any>;
  children?: (TreeNode | string)[];
  rendered?: TreeNode;
};
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
const byLabel = (t: ReturnType<typeof render>, label: string) =>
  collectNodes(
    t.toTree() as TreeNode,
    (n) => typeof n.props?.onPress === 'function' && n.props.accessibilityLabel === label,
  )[0]?.props;

let mounted: ReturnType<typeof render>[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Alert, 'alert').mockImplementation(() => {});
  m.connectWithToken.mockResolvedValue({
    data: { connected: true, account_name: 'Meena', handle: '@meena' },
  });
  m.integrations.mockResolvedValue({ data: {} });
});
afterEach(() => {
  for (const t of mounted) t.unmount();
  mounted = [];
});

describe.each([
  ['facebook', FacebookConfigScreen, 'Connect Facebook Page'],
  ['instagram', InstagramConfigScreen, 'Connect Instagram'],
])('%s connect', (_name, Screen, label) => {
  it('a second tap in the same tick starts no second login, and the guard is released after', async () => {
    // connected:false keeps the Connect button on screen (a real connect swaps it for Disconnect)
    m.connectWithToken.mockResolvedValue({ data: { connected: false } });
    let settle: (v: string) => void = () => {};
    m.loginWithFacebook.mockImplementation(
      () =>
        new Promise((r) => {
          settle = r;
        }),
    );
    const t = render(<Screen />);
    mounted.push(t);
    const btn = byLabel(t, label);
    expect(btn, label).toBeDefined();
    await act(async () => {
      btn.onPress();
      btn.onPress();
    });
    expect(m.loginWithFacebook).toHaveBeenCalledTimes(1);
    await act(async () => {
      settle('tok');
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(m.connectWithToken).toHaveBeenCalledTimes(1);

    // released in finally: a later tap works again
    m.loginWithFacebook.mockResolvedValue('tok2');
    await act(async () => {
      byLabel(t, label)?.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(m.loginWithFacebook).toHaveBeenCalledTimes(2);
  });

  it('a failed login also releases the guard', async () => {
    m.loginWithFacebook.mockRejectedValueOnce(new Error('boom'));
    const t = render(<Screen />);
    mounted.push(t);
    await act(async () => {
      byLabel(t, label)!.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });
    m.loginWithFacebook.mockResolvedValue('tok');
    await act(async () => {
      byLabel(t, label)?.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(m.loginWithFacebook).toHaveBeenCalledTimes(2);
  });
});
