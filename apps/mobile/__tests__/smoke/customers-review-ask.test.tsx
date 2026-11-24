import { Linking } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '../../src/test/__mocks__/testing-library';

vi.hoisted(() => {
  (globalThis as Record<string, unknown>).__DEV__ = true;
});
import { router } from 'expo-router';
import CustomersScreen from '../../app/(tabs)/customers';

const queryStore = vi.hoisted(() => new Map<string, unknown>());
const authState = vi.hoisted(() => ({ staffRole: null as string | null }));

vi.mock('../../src/lib/api', () => ({
  customerApi: { list: vi.fn() },
  retailerApi: { getMe: vi.fn() },
}));
vi.mock('../../src/lib/auth-context', () => ({
  useAuth: () => ({ staffRole: authState.staffRole }),
}));
vi.mock('../../src/lib/theme', async () => {
  const { COLORS } = await import('@kanchuki/shared');
  return { useTheme: () => ({ primaryColor: '#231F48', colors: COLORS }) };
});
vi.mock('expo-file-system/legacy', () => ({}));
vi.mock('expo-file-system', () => ({ File: class {}, Paths: {}, Directory: class {} }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: queryStore.get(JSON.stringify(queryKey)),
    isLoading: false,
    refetch: vi.fn(),
    isRefetching: false,
  }),
}));

type TreeNode = {
  type: unknown;
  props: Record<string, never>;
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
    for (const child of node) collectNodes(child, pred, out);
    return out;
  }
  if (typeof node !== 'object') return out;
  if (pred(node)) out.push(node);
  collectNodes(node.children as TreeNode[] | undefined, pred, out);
  if (node.rendered) collectNodes(node.rendered, pred, out);
  return out;
}

const LABEL = 'Ask Anita Sharma for a Google review';

function stars(tree: ReturnType<typeof render>): TreeNode[] {
  return collectNodes(
    tree.toTree() as TreeNode,
    (n) => typeof n.props?.onPress === 'function' && n.props.accessibilityLabel === LABEL,
  );
}

const customer = {
  id: 'c1',
  name: 'Anita Sharma',
  phone: '9876543210',
  email: null,
  address_line1: null,
  pref_colors: [] as string[],
  pref_styles: [] as string[],
  pref_fabrics: [] as string[],
  city: 'Jaipur',
  state: 'Rajasthan',
  budget_min: null,
  budget_max: null,
  last_visit_at: null,
  consent_given: true,
};

function setup(over: {
  customer?: Partial<typeof customer>;
  placeId?: string | null;
  staffRole?: string | null;
}) {
  queryStore.clear();
  queryStore.set(JSON.stringify(['customers', '']), { data: [{ ...customer, ...over.customer }] });
  queryStore.set(JSON.stringify(['retailer', 'me']), {
    data: {
      google_place_id: over.placeId === undefined ? 'ChIJabc' : over.placeId,
      shop_name: 'Royal Boutique',
    },
  });
  authState.staffRole = over.staffRole === undefined ? null : over.staffRole;
  return render(<CustomersScreen />);
}

describe('customers screen: ask for a Google review (render)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
  });

  it('owner + consent + place id: star is shown, tap opens WhatsApp with name, shop and review link', () => {
    const tree = setup({});
    const [star] = stars(tree);
    expect(star).toBeDefined();
    expect(star?.props.style).toMatchObject({ minWidth: 44, minHeight: 44 });
    (star?.props.onPress as unknown as () => void)();
    expect(Linking.openURL).toHaveBeenCalledTimes(1);
    const url = String(vi.mocked(Linking.openURL).mock.calls[0]?.[0]);
    expect(url).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
    const text = decodeURIComponent(url.split('?text=')[1] ?? '');
    expect(text).toContain('Anita Sharma');
    expect(text).toContain('Royal Boutique');
    expect(text).toContain('writereview?placeid=ChIJabc');
    // the star press is its own handler: it never navigates to the customer
    expect(router.push).not.toHaveBeenCalled();
  });

  it('hidden for staff', () => {
    expect(stars(setup({ staffRole: 'SALESPERSON' }))).toHaveLength(0);
  });

  it('hidden without consent', () => {
    expect(stars(setup({ customer: { consent_given: false } }))).toHaveLength(0);
  });

  it('hidden when the shop has no Google place id', () => {
    expect(stars(setup({ placeId: null }))).toHaveLength(0);
  });

  it('hidden when the phone is masked', () => {
    expect(stars(setup({ customer: { phone: '98•••••210' } }))).toHaveLength(0);
  });
});
