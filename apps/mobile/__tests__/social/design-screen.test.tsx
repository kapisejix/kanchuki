import { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '../../src/test/__mocks__/testing-library';

vi.hoisted(() => {
  (globalThis as Record<string, unknown>).__DEV__ = true;
});

import { router } from 'expo-router';
import DesignPostScreen from '../../app/social/design';

const apiMock = vi.hoisted(() => ({ designTemplatesApi: { list: vi.fn(), render: vi.fn() } }));
vi.mock('../../src/lib/api', () => apiMock);
vi.mock('../../src/lib/theme', () => ({ useTheme: () => ({ primaryColor: '#231F48' }) }));
vi.mock('../../src/components/social', async () => {
  const React = await import('react');
  return { ProductGridPicker: () => React.createElement('Stub') };
});
vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQuery: () => ({
    isLoading: false,
    isError: false,
    data: {
      data: [
        {
          id: 'a1',
          name: 'Plain One',
          ai: false,
          product_slots: 1,
          format: 'SQUARE',
          thumbnail_url: null,
          occasion: null,
        },
        {
          id: 'a2',
          name: 'Neon Poster',
          ai: true,
          product_slots: 1,
          format: 'SQUARE',
          thumbnail_url: null,
          occasion: null,
        },
      ],
    },
  }),
}));

type TreeNode = {
  props: Record<string, never>;
  children?: (TreeNode | string)[];
  rendered?: TreeNode;
};
type Tree = ReturnType<typeof render>;
function find(
  node: TreeNode | TreeNode[] | string | null | undefined,
  pred: (n: TreeNode) => boolean,
  out: TreeNode[] = [],
): TreeNode[] {
  if (!node || typeof node === 'string') return out;
  if (Array.isArray(node)) {
    for (const c of node) find(c, pred, out);
    return out;
  }
  if (pred(node)) out.push(node);
  find(node.children as TreeNode[] | undefined, pred, out);
  if (node.rendered) find(node.rendered, pred, out);
  return out;
}
const byLabel = (t: Tree, label: string) =>
  find(
    t.toTree() as TreeNode,
    (n) => typeof n.props?.onPress === 'function' && n.props.accessibilityLabel === label,
  )[0]?.props as unknown as { onPress: () => unknown } | undefined;

let mounted: Tree[] = [];
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  for (const t of mounted) t.unmount();
  mounted = [];
});
const mount = async () => {
  const t = render(<DesignPostScreen />);
  mounted.push(t);
  await act(async () => {});
  return t;
};

describe('design picker — AI styles', () => {
  it('routes an AI style to ai-design with template_id', async () => {
    const t = await mount();
    const h = byLabel(t, 'AI design Neon Poster');
    expect(h).toBeDefined();
    await act(async () => {
      await h!.onPress();
    });
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/social/ai-design',
      params: { template_id: 'a2' },
    });
  });

  it('plain designs still select (no navigation)', async () => {
    const t = await mount();
    await act(async () => {
      await byLabel(t, 'Design Plain One')!.onPress();
    });
    expect(router.push).not.toHaveBeenCalled();
  });
});
