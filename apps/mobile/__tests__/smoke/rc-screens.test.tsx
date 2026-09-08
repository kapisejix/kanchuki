import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react-test-renderer'
import { Alert } from 'react-native'
import { render } from '../../src/test/__mocks__/testing-library'

// RN injects `__DEV__` at runtime; vitest's Node env doesn't. showError()
// (src/lib/errors.ts) references it before calling Alert.alert, so without
// this the RC-009 interaction crashes instead of asserting the alert.
;(globalThis as Record<string, unknown>).__DEV__ = true
import CustomerDetailScreen from '../../app/customer/[id]'
import GstScreen from '../../app/growth/gst'
import StaffScreen from '../../app/settings/staff'
import SettingsScreen from '../../app/settings/index'
import PlanSelectScreen from '../../app/plan-select'
import { useLocalSearchParams } from 'expo-router'

// ── Shared mock state ─────────────────────────────────────────────
// The api barrel (src/lib/api) pulls in client.ts → expo-file-system
// (unmockable native module), so the whole barrel is mocked wholesale.
// growthApi is imported by gst.tsx from the submodule path directly, so
// that module gets its own mock.

const apiMock = vi.hoisted(() => {
  class ApiError extends Error {
    code: string
    status: number
    constructor(code: string, message: string, status: number) {
      super(message)
      this.code = code
      this.status = status
      this.name = 'ApiError'
    }
  }
  return {
    ApiError,
    customerApi: { get: vi.fn(), update: vi.fn(), delete: vi.fn() },
    productAttributeApi: { list: vi.fn() },
    staffApi: { list: vi.fn(), create: vi.fn(), delete: vi.fn() },
    billingApi: {
      getPlans: vi.fn(),
      getSubscription: vi.fn(),
      subscribe: vi.fn(),
      cancel: vi.fn(),
    },
    retailerApi: {
      getMe: vi.fn(),
      getUsage: vi.fn(),
      update: vi.fn(),
      getLogoUploadUrl: vi.fn(),
      getBannerUploadUrl: vi.fn(),
      getKycUploadUrl: vi.fn(),
      submitKycDoc: vi.fn(),
      saveWhatsAppApiConfig: vi.fn(),
      disconnectWhatsAppApi: vi.fn(),
      sendWhatsappNumberOtp: vi.fn(),
      delete: vi.fn(),
    },
    bugReportApi: { submit: vi.fn() },
    readLocalImage: vi.fn(),
    uploadImageToR2: vi.fn(),
  }
})

const queryStore = vi.hoisted(() => new Map<string, unknown>())

vi.mock('../../src/lib/api', () => apiMock)
vi.mock('../../src/lib/api/growth', () => ({
  growthApi: {
    gstSummary: vi.fn(),
    gstMonthly: vi.fn(),
    gstTransactions: vi.fn(),
  },
}))

vi.mock('../../src/lib/theme', async () => {
  const { COLORS } = await import('@kanchuki/shared')
  return {
    useTheme: () => ({ primaryColor: '#231F48', colors: COLORS }),
  }
})

vi.mock('../../src/lib/auth-context', () => ({
  useAuth: () => ({ signOut: vi.fn(), status: 'authenticated', isAuthenticated: true, isStaff: false }),
}))

vi.mock('../../src/lib/storage', () => ({
  getItem: vi.fn(async () => null),
  setItem: vi.fn(),
  deleteItem: vi.fn(),
}))

vi.mock('../../src/lib/offline-persister', () => ({
  clearPersistedCache: vi.fn(async () => {}),
}))

vi.mock('expo-image-manipulator', () => ({
  manipulateAsync: vi.fn(async (uri: string) => ({ uri })),
  SaveFormat: { JPEG: 'jpeg' },
}))

vi.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: vi.fn(async () => ({ canceled: true, assets: [] })),
}))

// ── Data-driven react-query mock (overrides setup's empty-data mock) ──
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: queryStore.get(JSON.stringify(queryKey)),
    isLoading: false,
    refetch: vi.fn(),
    isRefetching: false,
  }),
  useMutation: ({
    mutationFn,
    onSuccess,
    onError,
  }: {
    mutationFn: (...args: never[]) => unknown
    onSuccess?: (r: unknown) => void
    onError?: (e: Error) => void
  }) => ({
    mutate: (...args: never[]) => {
      const p = mutationFn(...args)
      if (p && typeof (p as Promise<unknown>).then === 'function') {
        ;(p as Promise<unknown>).then(
          (r) => onSuccess?.(r),
          (e) => onError?.(e as Error),
        )
      }
    },
    isPending: false,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), clear: vi.fn() }),
}))

// ── Tree helpers (same pattern as retailer-onboard.test.tsx) ──────

type TreeNode = {
  type: unknown
  props: Record<string, never>
  children?: (TreeNode | string)[]
  rendered?: TreeNode
}

function collectNodes(
  node: TreeNode | TreeNode[] | string | null | undefined,
  pred: (n: TreeNode) => boolean,
  out: TreeNode[] = [],
): TreeNode[] {
  if (!node) return out
  if (Array.isArray(node)) {
    for (const child of node) collectNodes(child, pred, out)
    return out
  }
  if (typeof node !== 'object') return out
  if (pred(node)) out.push(node)
  collectNodes(node.children as TreeNode[] | undefined, pred, out)
  if (node.rendered) collectNodes(node.rendered, pred, out)
  return out
}

function collectText(node: TreeNode | TreeNode[] | string | null | undefined, out: string[] = []): string[] {
  if (!node) return out
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out)
    return out
  }
  if (typeof node === 'string') {
    out.push(node)
    return out
  }
  if (typeof node !== 'object') return out
  collectText(node.children as TreeNode[] | undefined, out)
  if (node.rendered) collectText(node.rendered, out)
  return out
}

function treeText(tree: ReturnType<typeof render>): string[] {
  return collectText(tree.toTree() as TreeNode)
}

function findPressableByLabel(tree: ReturnType<typeof render>, label: string): TreeNode | undefined {
  return collectNodes(
    tree.toTree() as TreeNode,
    (n) => typeof n.props?.onPress === 'function' && n.props.accessibilityLabel === label,
  )[0]
}

function findPressableByText(tree: ReturnType<typeof render>, text: string): TreeNode | undefined {
  // Profile-edit Save is an AnimatedPressable with a <Text>Save</Text> child and no
  // accessibilityLabel; the WhatsApp-API modal's Save is a GradientButton whose
  // AnimatedPressable carries accessibilityLabel="Save" — exclude labeled ones.
  // NOTE: pass the WHOLE node to collectText (not just n.children) — mocked
  // components expose their content under `rendered`, so children alone is
  // always empty for composite nodes.
  return collectNodes(
    tree.toTree() as TreeNode,
    (n) =>
      typeof n.props?.onPress === 'function' &&
      n.props.accessibilityLabel === undefined &&
      collectText(n as TreeNode).includes(text),
  )[0]
}

function setQuery(key: unknown[], data: unknown): void {
  queryStore.set(JSON.stringify(key), data)
}

const year = new Date().getFullYear()

// ── Fixtures (post-teardown shapes — the fields RC-007/008 removed) ──

const customer = {
  id: 'c1',
  name: 'Anita Sharma',
  phone: '9876543210',
  email: null,
  address_line1: '1 MG Road',
  city: 'Jaipur',
  state: 'Rajasthan',
  notes: null,
  consent_given: true,
  pref_colors: ['Red'],
  pref_styles: [],
  pref_fabrics: [],
  budget_min: 100000,
  budget_max: 200000,
  usual_size: 'M',
  total_purchases: 0,
  total_spent: 0,
  created_at: '2026-01-01',
  // NOTE: no `interactions` field — the customer_interactions table was
  // dropped in the 2026-08-31 teardown (migration 082).
}

const gstSummary = {
  total_sales: 100000,
  total_gst: 18000,
  total_taxable: 100000,
  total_orders: 5,
  cgst: 9000,
  sgst: 9000,
  igst: 0,
  invoiced_orders: 3,
  pending_orders: 2,
}

const retailer = {
  id: 'r1',
  shop_name: 'Radha Sarees',
  owner_name: 'Sunita Devi',
  city: 'Jaipur',
  state: 'Rajasthan',
  address_line1: '1 MG Road',
  gstin: '27aabcu9603r1zm', // legacy lowercase — cannot round-trip the strict uppercase regex
  phone: '9876543210',
  plan: 'PRO',
  slug: 'radha-sarees',
  logo_url: null,
  logo_r2_key: null,
  banner_url: null,
  banner_r2_key: null,
  public_slug: 'radha-sarees',
  kyc_status: 'NOT_SUBMITTED',
}

beforeEach(() => {
  vi.clearAllMocks()
  queryStore.clear()
  vi.mocked(useLocalSearchParams).mockReturnValue({ id: 'c1' })
})

describe('RC-007 customer detail screen smoke', () => {
  it('renders a teardown-shaped customer (no interactions) without crashing', () => {
    setQuery(['customers', 'c1'], { data: customer })
    setQuery(['attributes', 'STYLE'], { data: [] })
    setQuery(['attributes', 'FABRIC'], { data: [] })

    const tree = render(<CustomerDetailScreen />)
    const text = treeText(tree)

    // Customer identity + purchase summary cards render. The name lives in a
    // TextInput value prop (not rendered as text in the mock), so assert the
    // phone + header + purchase-summary labels instead.
    expect(text.join(' ')).toContain('9876543210')
    expect(text.join(' ')).toContain('Customer Profile')
    expect(text.join(' ')).toContain('Purchases')
    expect(text.join(' ')).toContain('Total Spent')
    expect(text.join(' ')).toContain('Total Spent')
    // The removed-field guard renders 0 instead of crashing on .length.
    expect(text.join(' ')).toContain('0')
  })
})

describe('RC-008 GST report smoke', () => {
  it('renders the summary tab from cgst/sgst/igst fields without crashing', () => {
    setQuery(['growth', 'gst', 'summary', undefined, year], { data: gstSummary })
    setQuery(['growth', 'gst', 'monthly', year], { data: [] })
    setQuery(['growth', 'gst', 'transactions', undefined, year, 1], {
      data: { transactions: [], pagination: { total: 0, page: 1, pages: 1 } },
    })

    const tree = render(<GstScreen />)
    const text = treeText(tree).join(' ')

    expect(text).toContain('CGST (9%)')
    expect(text).toContain('SGST (9%)')
    expect(text).toContain('IGST (18%)')
    expect(text).toContain('Total GST Liability')
    // inr() never crashes on a missing number; values render from cgst/sgst/igst.
    expect(text).toContain('₹9,000')
  })
})

describe('RC-009 add team member smoke', () => {
  it('surfaces the real API error instead of the generic fallback when create fails', async () => {
    setQuery(['staff'], { data: [{ id: 's1', name: 'Ramesh', phone: '9876543210', role: 'salesperson', is_active: true }] })

    // The server rejects with a real ApiError (duplicate phone).
    vi.mocked(apiMock.staffApi.create).mockRejectedValue(
      new apiMock.ApiError('TEAM_ERROR', 'This phone number already belongs to a retailer account', 400),
    )

    const alertSpy = vi.spyOn(Alert, 'alert')
    const tree = render(<StaffScreen />)

    // Fill the Add-modal form (the RN Modal mock renders children regardless of
    // `visible`, so the AddStaffModal fields are always in the tree).
    const inputs = collectNodes(
      tree.toTree() as TreeNode,
      (n) => typeof n.props?.onChangeText === 'function',
    )
    const nameInput = inputs.find((n) => n.props.placeholder === 'e.g. Ramesh')
    const phoneInput = inputs.find((n) => n.props.placeholder === '9876543210')
    expect(nameInput).toBeTruthy()
    expect(phoneInput).toBeTruthy()

    act(() => {
      ;(nameInput!.props.onChangeText as (v: string) => void)('Ramesh')
      ;(phoneInput!.props.onChangeText as (v: string) => void)('9876543210')
    })

    const addButton = findPressableByLabel(tree, 'Add')
    expect(addButton).toBeTruthy()

    await act(async () => {
      ;(addButton!.props.onPress as () => void)()
    })
    await act(async () => {})

    // The exact regression RC-009 pinned: err.message (not the fallback).
    // showError always passes a third arg (button array or undefined), so
    // match the first two only.
    const alertCall = alertSpy.mock.calls.find((c) => c[0] === 'Error')
    expect(alertCall).toBeDefined()
    expect(alertCall![1]).toBe('This phone number already belongs to a retailer account')
    expect(alertSpy.mock.calls.some((c) => c[0] === 'Error' && c[1] === 'Failed to add team member')).toBe(false)
    expect(apiMock.staffApi.create).toHaveBeenCalledWith({
      name: 'Ramesh',
      phone: '9876543210',
      role: 'salesperson',
    })
  })
})

describe('RC-010 profile / logo save smoke', () => {
  it('omits the unchanged GSTIN from the update payload (no 422 on logo save)', async () => {
    setQuery(['retailer', 'me'], { data: retailer })
    setQuery(['retailer', 'usage'], { data: [] })

    vi.mocked(apiMock.retailerApi.update).mockResolvedValue({
      data: { public_slug: 'radha-sarees' },
    } as never)

    const tree = render(<SettingsScreen />)
    expect(treeText(tree).join(' ')).toContain('Radha Sarees')

    // Open the Edit Profile modal, then press its Save button. The modal
    // prefills gstin from the stored (lowercase) value; unchanged → omitted.
    const editButton = findPressableByLabel(tree, 'Edit profile')
    expect(editButton).toBeTruthy()
    act(() => {
      ;(editButton!.props.onPress as () => void)()
    })

    const saveButton = findPressableByText(tree, 'Save')
    expect(saveButton).toBeTruthy()

    await act(async () => {
      ;(saveButton!.props.onPress as () => void)()
    })
    await act(async () => {})

    expect(apiMock.retailerApi.update).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(apiMock.retailerApi.update).mock.calls[0][0] as Record<string, unknown>
    // RC-010: unchanged GSTIN is NOT re-sent (it can't round-trip the strict
    // uppercase regex — that 422 was what made logo/banner saves fail).
    expect('gstin' in payload).toBe(false)
    // Logo/banner save path still runs (the point of the fix).
    expect(payload.logo_url).toBeNull()
    expect(payload.banner_url).toBeNull()
    expect(payload.shop_name).toBe('Radha Sarees')
  })
})

describe('RC-011 switch plans smoke', () => {
  it('renders the plan cards from billingApi.getPlans without crashing', () => {
    setQuery(['billing', 'subscription'], {
      data: { plan: 'PRO', plan_status: 'ACTIVE', trial_ends_at: null, subscription: { status: 'ACTIVE' } },
    })
    setQuery(['billing', 'plans'], {
      data: [
        { plan: 'STARTER', pricing: { monthly: 499900 }, limits: { max_products: 100, max_customers: 1000 } },
        { plan: 'GROWTH', pricing: { monthly: 999900 }, limits: { max_products: 500, max_customers: 5000 } },
        { plan: 'PRO', pricing: { monthly: 1499900 }, limits: { max_products: null, max_customers: null } },
      ],
    })

    const tree = render(<PlanSelectScreen />)
    const text = treeText(tree).join(' ')

    expect(text).toContain('Choose Your Plan')
    expect(text).toContain('Starter')
    expect(text).toContain('Growth')
    expect(text).toContain('Pro')
    // Prices render from the DB-driven plan_pricing rows (₹4,999/₹9,999/₹14,999).
    expect(text).toContain('₹4,999')
    expect(text).toContain('₹9,999')
    expect(text).toContain('₹14,999')
  })
})