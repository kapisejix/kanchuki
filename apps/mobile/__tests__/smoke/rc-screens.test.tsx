import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react-test-renderer'
import { Alert, Linking } from 'react-native'
import { render } from '../../src/test/__mocks__/testing-library'

// RN injects `__DEV__` at runtime; vitest's Node env doesn't. showError()
// (src/lib/errors.ts) references it before calling Alert.alert, so without
// this the RC-009 interaction crashes instead of asserting the alert.
// vi.hoisted runs before the (hoisted) imports; a bare assignment here ran too late.
vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).__DEV__ = true
})
import { ApiError } from '../../src/lib/api/api-error'
import CustomerDetailScreen from '../../app/customer/[id]'
import GstScreen from '../../app/growth/gst'
import StaffScreen from '../../app/settings/staff'
import SettingsScreen from '../../app/settings/index'
import PlanSelectScreen from '../../app/plan-select'
import BillingScreen from '../../app/billing'
import OnboardingScreen from '../../app/onboarding'
import EnquiriesScreen from '../../app/enquiries'
import { router, useLocalSearchParams } from 'expo-router'

// ── Shared mock state ─────────────────────────────────────────────
// The api barrel (src/lib/api) pulls in client.ts → expo-file-system
// (unmockable native module), so the whole barrel is mocked wholesale.
// growthApi is imported by gst.tsx from the submodule path directly, so
// that module gets its own mock.

const apiMock = vi.hoisted(() => {
  return {
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
      updateOnboarding: vi.fn(),
      getQrSlug: vi.fn(),
      getLogoUploadUrl: vi.fn(),
      getBannerUploadUrl: vi.fn(),
      getKycUploadUrl: vi.fn(),
      submitKycDoc: vi.fn(),
      saveWhatsAppApiConfig: vi.fn(),
      disconnectWhatsAppApi: vi.fn(),
      sendWhatsappNumberOtp: vi.fn(),
      delete: vi.fn(),
    },
    collectionApi: { enquiries: vi.fn(), takeEnquiry: vi.fn(), assignEnquiry: vi.fn(), setEnquiryStatus: vi.fn() },
    bugReportApi: { submit: vi.fn() },
    readLocalImage: vi.fn(),
    uploadImageToR2: vi.fn(),
  }
})

const queryStore = vi.hoisted(() => new Map<string, unknown>())
const authState = vi.hoisted(() => ({ staffRole: null as string | null }))
const invalidateMock = vi.hoisted(() => vi.fn())
const setQueryDataMock = vi.hoisted(() => vi.fn())

// Real ApiError: errors.ts apiMessage() uses instanceof against api/api-error.
vi.mock('../../src/lib/api', async () => ({
  ...apiMock,
  ApiError: (await import('../../src/lib/api/api-error')).ApiError,
}))
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
  useAuth: () => ({ signOut: vi.fn(), status: 'authenticated', isAuthenticated: true, isStaff: false, staffRole: authState.staffRole }),
}))

vi.mock('../../src/lib/storage', () => ({
  getItem: vi.fn(async () => null),
  setItem: vi.fn(),
  deleteItem: vi.fn(),
}))

// onboarding.tsx prefills/clears a captured ?ref= code via secure storage.
vi.mock('../../src/lib/referral-capture', () => ({
  getCapturedReferralCode: vi.fn(async () => null),
  clearCapturedReferralCode: vi.fn(async () => {}),
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

// staff.tsx imports expo-clipboard (FR-6.1 invite copy); mock it so the real
// module (→ expo-modules-core, which reads __DEV__ at import time) never
// evaluates in the Node test env.
vi.mock('expo-clipboard', () => ({
  setStringAsync: vi.fn(async () => true),
}))

// settings/index.tsx imports expo-location (store-pin capture); same
// __DEV__ / expo-modules-core reason as expo-clipboard above.
vi.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: vi.fn(async () => ({ status: 'denied' })),
  getCurrentPositionAsync: vi.fn(),
  Accuracy: { High: 4 },
}))

// Some screen imports (e.g. lib/api/products.ts, which the api-barrel mock does not
// cover) reach expo-file-system/legacy → real expo-modules-core, whose EventEmitter
// needs the native runtime. Same reason as the mocks above.
vi.mock('expo-file-system/legacy', () => ({}))
vi.mock('expo-file-system', () => ({ File: class {}, Paths: {}, Directory: class {} }))
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
  useQueryClient: () => ({
    invalidateQueries: invalidateMock,
    setQueryData: setQueryDataMock,
    clear: vi.fn(),
  }),
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

// Amounts are paise (RC-109): gst.tsx renders them via inrFromPaise.
const gstSummary = {
  total_sales: 10000000,
  total_gst: 1800000,
  total_taxable: 10000000,
  total_orders: 5,
  cgst: 900000,
  sgst: 900000,
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
  authState.staffRole = null
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
      new ApiError('TEAM_ERROR', 'This phone number already belongs to a retailer account', 400),
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

// T3.2-a #2: switch flow. A retailer with a live (TRIAL/ACTIVE) subscription
// must cancel before subscribing, or Razorpay ends up with two live ones.
describe('plan-select switch flow (T3.2-a #2)', () => {
  const plans = [
    { plan: 'STARTER', pricing: { monthly: 499900 }, limits: { max_products: 100, max_customers: 1000 } },
    { plan: 'GROWTH', pricing: { monthly: 999900 }, limits: { max_products: 500, max_customers: 5000 } },
    { plan: 'PRO', pricing: { monthly: 1499900 }, limits: { max_products: null, max_customers: null } },
  ]
  const seed = (plan: string, planStatus: string, rowStatus: string) => {
    setQuery(['billing', 'subscription'], {
      data: { plan, plan_status: planStatus, trial_ends_at: null, subscription: { status: rowStatus } },
    })
    setQuery(['billing', 'plans'], { data: plans })
  }
  type AlertButton = { text: string; onPress?: () => unknown }

  /** Tap the Growth card; resolves the alert spy (switch flow) so the caller can press Continue. */
  async function tapGrowth() {
    const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {})
    const openSpy = vi.spyOn(Linking, 'openURL').mockResolvedValue(true)
    const tree = render(<PlanSelectScreen />)
    const card = findPressableByText(tree, 'Growth')
    expect(card).toBeTruthy()
    await act(async () => {
      ;(card!.props.onPress as () => void)()
    })
    return { alertSpy, openSpy }
  }
  async function pressContinue(alertSpy: ReturnType<typeof vi.spyOn>) {
    const call = alertSpy.mock.calls.find((c) => c[0] === 'Switch Plan')
    expect(call).toBeDefined()
    const cont = (call![2] as AlertButton[]).find((b) => b.text === 'Continue')
    await act(async () => {
      await cont!.onPress!()
    })
  }

  it.each([
    ['TRIAL', 'TRIAL', 'TRIAL', 'STARTER'],
    ['ACTIVE', 'ACTIVE', 'ACTIVE', 'PRO'],
  ])('%s row: asks first, then cancel runs before subscribe', async (_n, planStatus, rowStatus, current) => {
    seed(current, planStatus, rowStatus)
    vi.mocked(apiMock.billingApi.cancel).mockResolvedValue({ data: {} } as never)
    vi.mocked(apiMock.billingApi.subscribe).mockResolvedValue({ data: { checkout_url: 'https://rzp.test/x' } } as never)

    const { alertSpy, openSpy } = await tapGrowth()
    expect(apiMock.billingApi.cancel).not.toHaveBeenCalled()
    expect(apiMock.billingApi.subscribe).not.toHaveBeenCalled()

    await pressContinue(alertSpy)
    expect(apiMock.billingApi.cancel).toHaveBeenCalledTimes(1)
    expect(apiMock.billingApi.subscribe).toHaveBeenCalledWith('GROWTH')
    expect(vi.mocked(apiMock.billingApi.cancel).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(apiMock.billingApi.subscribe).mock.invocationCallOrder[0],
    )
    expect(openSpy).toHaveBeenCalledWith('https://rzp.test/x')
  })

  it('CANCELLED row: subscribes directly, no cancel and no Switch Plan prompt', async () => {
    seed('STARTER', 'CANCELLED', 'CANCELLED')
    vi.mocked(apiMock.billingApi.subscribe).mockResolvedValue({ data: { checkout_url: 'https://rzp.test/y' } } as never)

    const { alertSpy, openSpy } = await tapGrowth()

    expect(apiMock.billingApi.subscribe).toHaveBeenCalledWith('GROWTH')
    expect(apiMock.billingApi.cancel).not.toHaveBeenCalled()
    expect(alertSpy.mock.calls.some((c) => c[0] === 'Switch Plan')).toBe(false)
    expect(openSpy).toHaveBeenCalledWith('https://rzp.test/y')
  })

  it('cancel ok but subscribe fails: server reason shown, no retry, no rollback (known behaviour)', async () => {
    seed('STARTER', 'TRIAL', 'TRIAL')
    vi.mocked(apiMock.billingApi.cancel).mockResolvedValue({ data: {} } as never)
    vi.mocked(apiMock.billingApi.subscribe).mockRejectedValue(new ApiError('BAD_PLAN', 'Plan unavailable right now', 400))

    const { alertSpy } = await tapGrowth()
    await pressContinue(alertSpy)

    expect(apiMock.billingApi.cancel).toHaveBeenCalledTimes(1)
    expect(apiMock.billingApi.subscribe).toHaveBeenCalledTimes(1)
    const err = alertSpy.mock.calls.find((c) => c[0] === 'Error')
    expect(err).toBeDefined()
    expect(err![1]).toBe('Plan unavailable right now')
  })
})

// T3.2-a #3: billing.tsx is a read-only status screen (Play Store compliance).
// RC-033: an ended plan must not read as a free trial.
describe('billing screen (T3.2-a #3)', () => {
  const seedMe = (plan: string, planStatus: string) =>
    setQuery(['retailer', 'me'], { data: { plan, plan_status: planStatus } })

  it.each([
    ['TRIAL', 'Free trial', false],
    ['ACTIVE', 'Active', false],
    ['PAST_DUE', 'Payment due', false],
    ['CANCELLED', 'Ended', true],
    ['COMPLETED', 'Ended', true],
  ])('%s shows "%s" (ended=%s)', (status, label, ended) => {
    seedMe('GROWTH', status)
    // join(''): JSX splits `{plan} Plan · {label}` into separate children.
    const text = treeText(render(<BillingScreen />)).join('')

    expect(text).toContain(`GROWTH Plan · ${label}`)
    if (ended) {
      expect(text).toContain('has ended — renew on the website')
      expect(text).not.toContain('keep using all your features')
    } else {
      expect(text).toContain('keep using all your features')
      expect(text).not.toContain('has ended')
    }
  })

  it('renders with no retailer data as a Starter free trial', () => {
    const text = treeText(render(<BillingScreen />)).join('')
    expect(text).toContain('Starter Plan · Free trial')
  })

  it('"Manage my plan" opens plan-select', async () => {
    seedMe('PRO', 'ACTIVE')
    const tree = render(<BillingScreen />)
    await act(async () => {
      ;(findPressableByText(tree, 'Manage my plan')!.props.onPress as () => void)()
    })
    expect(router.push).toHaveBeenCalledWith('/plan-select')
  })

  it('support row opens the exact mailto', async () => {
    seedMe('PRO', 'ACTIVE')
    const openSpy = vi.spyOn(Linking, 'openURL').mockResolvedValue(true)
    const tree = render(<BillingScreen />)
    await act(async () => {
      ;(findPressableByText(tree, 'support@kanchuki.app')!.props.onPress as () => void)()
    })
    expect(openSpy).toHaveBeenCalledWith(
      'mailto:support@kanchuki.app?subject=Plans%20%26%20Billing%20enquiry',
    )
  })
})

// T3.2-a #4: onboarding steps 1-4 (step 5's confetti + timed redirect is not
// covered here). Drives the real screen through its own controls.
describe('onboarding steps 1-4 (T3.2-a #4)', () => {
  const CONSENT = 'I agree to the Terms, Privacy Policy, and consent to be contacted'
  const NEXT = {
    1: 'Save & Proceed to Location',
    2: 'Save & Proceed to GST',
    3: 'Save & Proceed to Plan',
    4: 'Complete Setup →',
  } as const
  type T = ReturnType<typeof render>
  const input = (tree: T, placeholder: string) =>
    collectNodes(
      tree.toTree() as TreeNode,
      (n) => n.props?.placeholder === placeholder && typeof n.props.onChangeText === 'function',
    )[0]
  const typeInto = async (tree: T, placeholder: string, value: string) => {
    await act(async () => {
      ;(input(tree, placeholder).props.onChangeText as (v: string) => void)(value)
    })
  }
  const press = async (tree: T, label: string) => {
    await act(async () => {
      await (findPressableByLabel(tree, label)!.props.onPress as () => unknown)()
    })
  }
  const pressPrefix = async (tree: T, prefix: string) => {
    const node = collectNodes(
      tree.toTree() as TreeNode,
      (n) => typeof n.props?.onPress === 'function' && String(n.props.accessibilityLabel ?? '').startsWith(prefix),
    )[0]
    expect(node).toBeTruthy()
    await act(async () => {
      await (node.props.onPress as () => unknown)()
    })
  }
  const disabled = (tree: T, label: string) => Boolean(findPressableByLabel(tree, label)!.props.disabled)
  const text = (tree: T) => treeText(tree).join('')

  const SHOP = 'e.g. Radha Sarees & Bridal'
  const ADDRESS = 'Shop no., building, street, area, landmark'
  const GSTIN = '15-digit GSTIN (e.g. 24AAAAA0000A1Z5)'

  const mount = () => {
    setQuery(['billing', 'plans'], {
      data: [
        { plan: 'STARTER', pricing: { monthly: 499900 }, limits: { max_products: 100, max_customers: 1000 } },
        { plan: 'GROWTH', pricing: { monthly: 999900 }, limits: { max_products: 500, max_customers: 5000 } },
        { plan: 'PRO', pricing: { monthly: 1499900 }, limits: { max_products: null, max_customers: null } },
      ],
    })
    return render(<OnboardingScreen />)
  }
  const toStep3 = async (tree: T) => {
    await typeInto(tree, SHOP, 'Radha Sarees')
    await press(tree, CONSENT)
    await press(tree, NEXT[1])
    await typeInto(tree, ADDRESS, '1 MG Road')
    await press(tree, NEXT[2])
  }

  beforeEach(() => {
    vi.mocked(apiMock.retailerApi.update).mockResolvedValue({ data: {} } as never)
    vi.mocked(apiMock.retailerApi.updateOnboarding).mockResolvedValue({
      data: { onboarding_step: 1, onboarding_completed: false },
    } as never)
  })

  it('step 1 Next needs a 2+ char shop name AND consent', async () => {
    const tree = mount()
    expect(disabled(tree, NEXT[1])).toBe(true)

    await typeInto(tree, SHOP, 'R')
    await press(tree, CONSENT)
    expect(disabled(tree, NEXT[1])).toBe(true) // consent but name too short

    await typeInto(tree, SHOP, 'Radha Sarees')
    expect(disabled(tree, NEXT[1])).toBe(false)

    await press(tree, CONSENT) // untick
    expect(disabled(tree, NEXT[1])).toBe(true) // name but no consent
  })

  it('steps 1-4 save then advance in order, ending with the picked plan', async () => {
    const tree = mount()
    await toStep3(tree)
    expect(text(tree)).toContain('GST Details')
    await press(tree, NEXT[3])
    expect(text(tree)).toContain('Choose Your Plan')
    expect(disabled(tree, NEXT[4])).toBe(true) // no plan picked yet

    await pressPrefix(tree, 'Growth plan')
    expect(disabled(tree, NEXT[4])).toBe(false)
    await press(tree, NEXT[4])

    const on = vi.mocked(apiMock.retailerApi.updateOnboarding).mock.calls
    expect(on.map((c) => c[0])).toEqual([1, 2, 3, 4])
    expect(on[3]).toEqual([4, undefined, { plan: 'GROWTH' }])
    // each step saved its fields before recording progress
    const upd = vi.mocked(apiMock.retailerApi.update).mock.invocationCallOrder
    const onOrder = vi.mocked(apiMock.retailerApi.updateOnboarding).mock.invocationCallOrder
    expect(upd[0]).toBeLessThan(onOrder[0])
    expect(upd[1]).toBeLessThan(onOrder[1])
    expect(text(tree)).toContain("You're All Set!")
  })

  it('Free Demo sends demo_plan, not a paid plan', async () => {
    const tree = mount()
    await toStep3(tree)
    await press(tree, NEXT[3])
    await press(tree, 'Start Free Demo — full Pro access')
    await press(tree, NEXT[4])

    expect(vi.mocked(apiMock.retailerApi.updateOnboarding).mock.calls[3]).toEqual([4, undefined, { demo_plan: true }])
  })

  it('a rejected GSTIN shows the server reason and stays on the GST step', async () => {
    const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {})
    const tree = mount()
    await toStep3(tree)
    vi.mocked(apiMock.retailerApi.update).mockRejectedValueOnce(new ApiError('VALIDATION', 'Invalid GSTIN', 422))

    await typeInto(tree, GSTIN, 'BAD')
    await press(tree, NEXT[3])

    const err = alertSpy.mock.calls.find((c) => c[0] === 'Error')
    expect(err).toBeDefined()
    expect(err![1]).toBe('Invalid GSTIN')
    expect(vi.mocked(apiMock.retailerApi.updateOnboarding).mock.calls.map((c) => c[0])).toEqual([1, 2])
    expect(text(tree)).toContain('GST Details')
  })

  it('an empty GSTIN is optional: no gstin save, progress still recorded', async () => {
    const tree = mount()
    await toStep3(tree)
    const updatesBefore = vi.mocked(apiMock.retailerApi.update).mock.calls.length
    await press(tree, NEXT[3])

    expect(vi.mocked(apiMock.retailerApi.update).mock.calls.length).toBe(updatesBefore)
    expect(vi.mocked(apiMock.retailerApi.updateOnboarding).mock.calls.map((c) => c[0])).toEqual([1, 2, 3])
  })

  // T3.2-a #4b: step 5 (saveFinalStep + QR slug + timed redirect).
  describe('step 5', () => {
    const DASH = 'Go to Dashboard →'
    const api = apiMock.retailerApi
    const toStep5 = async (tree: T) => {
      await toStep3(tree)
      await press(tree, NEXT[3])
      await pressPrefix(tree, 'Growth plan')
      await press(tree, NEXT[4])
      // count only what step 5 does
      for (const fn of [api.update, api.updateOnboarding, api.getQrSlug, setQueryDataMock, invalidateMock, router.replace]) {
        vi.mocked(fn).mockClear()
      }
    }
    const pressText = async (tree: T, label: string) => {
      const node = findPressableByText(tree, label)
      expect(node, label).toBeTruthy()
      await act(async () => {
        await (node!.props.onPress as () => unknown)()
      })
    }
    const advance = async (ms: number) => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms)
      })
    }
    const done = { data: { onboarding_step: 5, onboarding_completed: true } }

    beforeEach(() => {
      vi.useFakeTimers()
      vi.mocked(api.getQrSlug).mockResolvedValue({ data: {} } as never)
      vi.mocked(api.updateOnboarding).mockResolvedValue(done as never)
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('Go to Dashboard saves profile, makes the QR slug, completes onboarding, then redirects after 1.5 s', async () => {
      const tree = mount()
      await toStep5(tree)
      await press(tree, DASH)

      expect(vi.mocked(api.update).mock.calls[0][0]).toMatchObject({ shop_name: 'Radha Sarees', address_line1: '1 MG Road' })
      expect(vi.mocked(api.updateOnboarding).mock.calls).toEqual([[5, true]])
      const order = [api.update, api.getQrSlug, api.updateOnboarding].map(
        (f) => vi.mocked(f).mock.invocationCallOrder[0],
      )
      expect(order).toEqual([...order].sort((a, b) => a - b))
      expect(router.replace).not.toHaveBeenCalled()
      await advance(1499)
      expect(router.replace).not.toHaveBeenCalled()
      await advance(1)
      expect(router.replace).toHaveBeenCalledWith('/(tabs)')
    })

    it('once saved, a second tap does not save again (confetti guard)', async () => {
      const tree = mount()
      await toStep5(tree)
      await press(tree, DASH)
      await press(tree, DASH)
      await advance(1500)

      expect(api.update).toHaveBeenCalledTimes(1)
      expect(router.replace).toHaveBeenCalledTimes(1)
    })

    it.each([
      ['Create your store QR code', '/store-profile'],
      ['Catalog Upload Help', '/settings/catalog-upload'],
    ])('%s saves first, then redirects to %s', async (label, target) => {
      const tree = mount()
      await toStep5(tree)
      await pressText(tree, label)

      expect(vi.mocked(api.updateOnboarding).mock.calls).toEqual([[5, true]])
      await advance(1500)
      expect(router.replace).toHaveBeenCalledWith(target)
    })

    it('a failed QR slug never blocks completing onboarding', async () => {
      const tree = mount()
      await toStep5(tree)
      vi.mocked(api.getQrSlug).mockRejectedValueOnce(new Error('slug down'))
      await press(tree, DASH)
      await advance(1500)

      expect(vi.mocked(api.updateOnboarding).mock.calls).toEqual([[5, true]])
      expect(router.replace).toHaveBeenCalledWith('/(tabs)')
    })

    it('a rejected profile save shows the server reason, stops, and leaves the button usable', async () => {
      const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {})
      const tree = mount()
      await toStep5(tree)
      vi.mocked(api.update).mockRejectedValueOnce(new ApiError('VALIDATION', 'Pincode invalid', 422))
      await press(tree, DASH)
      await advance(2000)

      expect(alertSpy.mock.calls.find((c) => c[0] === 'Error')![1]).toBe('Pincode invalid')
      expect(api.getQrSlug).not.toHaveBeenCalled()
      expect(api.updateOnboarding).not.toHaveBeenCalled()
      expect(router.replace).not.toHaveBeenCalled()
      expect(disabled(tree, DASH)).toBe(false)
    })

    it('a failed completion call alerts, skips the cache write and does not redirect', async () => {
      const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {})
      const tree = mount()
      await toStep5(tree)
      vi.mocked(api.updateOnboarding).mockRejectedValueOnce(new ApiError('SERVER', 'boom', 500))
      await press(tree, DASH)
      await advance(2000)

      expect(alertSpy.mock.calls.find((c) => c[0] === 'Error')).toBeDefined()
      expect(setQueryDataMock).not.toHaveBeenCalled()
      expect(router.replace).not.toHaveBeenCalled()
      expect(disabled(tree, DASH)).toBe(false)
    })

    it('writes the completed state into the retailer cache and refetches it', async () => {
      const tree = mount()
      await toStep5(tree)
      await press(tree, DASH)

      const [key, updater] = setQueryDataMock.mock.calls[0] as [unknown[], (old: unknown) => unknown]
      expect(key).toEqual(['retailer', 'me'])
      expect(updater({ data: { shop_name: 'Radha Sarees' } })).toEqual({
        data: { shop_name: 'Radha Sarees', onboarding_step: 5, onboarding_completed: true },
      })
      expect(updater(undefined)).toEqual({ data: { onboarding_step: 5, onboarding_completed: true } })
      expect(invalidateMock).toHaveBeenCalledWith({ queryKey: ['retailer', 'me'] })
    })

    // RC-135: the guard was `saving || showConfetti` STATE, which a second tap in
    // the same tick still saw as false (RC-015/132/134 shape); now a sync ref.
    it('two taps in one tick save once', async () => {
      const tree = mount()
      await toStep5(tree)
      const tap = findPressableByLabel(tree, DASH)!.props.onPress as () => unknown
      await act(async () => {
        tap()
        tap()
      })
      await advance(1500)

      expect(api.update).toHaveBeenCalledTimes(1)
      expect(router.replace).toHaveBeenCalledTimes(1)
    })

    it.each(['Create your store QR code', 'Catalog Upload Help'])('two taps on %s in one tick save once', async (label) => {
      const tree = mount()
      await toStep5(tree)
      const tap = findPressableByText(tree, label)!.props.onPress as () => unknown
      await act(async () => {
        tap()
        tap()
      })
      await advance(1500)

      expect(api.update).toHaveBeenCalledTimes(1)
      expect(router.replace).toHaveBeenCalledTimes(1)
    })

    it('two taps in one tick on step 1 save once, and the next step is usable afterwards', async () => {
      const tree = mount()
      await typeInto(tree, SHOP, 'Radha Sarees')
      await press(tree, CONSENT)
      const tap = findPressableByLabel(tree, NEXT[1])!.props.onPress as () => unknown
      await act(async () => {
        tap()
        tap()
      })

      expect(api.update).toHaveBeenCalledTimes(1)
      expect(vi.mocked(api.updateOnboarding).mock.calls.map((c) => c[0])).toEqual([1])
      expect(input(tree, ADDRESS)).toBeDefined() // advanced exactly one step
      await typeInto(tree, ADDRESS, '1 MG Road')
      await press(tree, NEXT[2]) // guard released after success
      expect(vi.mocked(api.updateOnboarding).mock.calls.map((c) => c[0])).toEqual([1, 2])
    })

    it('a failed save releases the guard so the retailer can retry', async () => {
      vi.spyOn(Alert, 'alert').mockImplementation(() => {})
      const tree = mount()
      await toStep5(tree)
      vi.mocked(api.update).mockRejectedValueOnce(new ApiError('SERVER', 'boom', 500))
      await press(tree, DASH)
      await press(tree, DASH)
      await advance(1500)

      expect(api.update).toHaveBeenCalledTimes(2)
      expect(router.replace).toHaveBeenCalledTimes(1)
    })

    it('Dashboard + QR taps in one tick redirect once', async () => {
      const tree = mount()
      await toStep5(tree)
      const dash = findPressableByLabel(tree, DASH)!.props.onPress as () => unknown
      const qr = findPressableByText(tree, 'Create your store QR code')!.props.onPress as () => unknown
      await act(async () => {
        dash()
        qr()
      })
      await advance(1500)

      expect(router.replace).toHaveBeenCalledTimes(1)
    })
  })
})
// ── T3.2-a #5: enquiries inbox (F-044 E3) ─────────────────────────
describe('EnquiriesScreen', () => {
  type Handler = { onPress: () => Promise<void> | void; disabled?: boolean }
  const handler = (tree: ReturnType<typeof render>, label: string): Handler | undefined =>
    findPressableByLabel(tree, label)?.props as unknown as Handler | undefined
  const press = async (tree: ReturnType<typeof render>, label: string) => {
    const h = handler(tree, label)
    expect(h, label).toBeDefined()
    await act(async () => {
      await h!.onPress()
    })
  }
  const enq = (over: Record<string, unknown> = {}) => ({
    id: 'e1',
    customer_name: 'Meena',
    customer_phone: '98XXXX3210',
    message: null,
    status: 'NEW',
    created_at: '2026-10-01T10:00:00Z',
    collection: { id: 'col1', title: 'Diwali picks' },
    products: [
      { id: 'p1', name: 'Red Suit', photo_url: null },
      { id: 'p2', name: null, photo_url: null },
    ],
    assigned_to: null,
    ...over,
  })
  const seed = (list: unknown[], assignees: unknown[] = [{ id: 'u1', name: 'Ravi' }]) =>
    setQuery(['enquiries'], { data: list, assignees })
  const seedFeatures = (features: string[]) => setQuery(['retailer', 'me'], { data: { features } })

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('renders each enquiry and the empty state', () => {
    seed([enq()])
    const text = treeText(render(<EnquiriesScreen />)).join('')
    expect(text).toContain('Meena')
    expect(text).toContain('Diwali picks')
    expect(text).toContain('Red Suit')

    seed([])
    expect(treeText(render(<EnquiriesScreen />)).join('')).toContain('No enquiries yet')
  })

  it('Take shows only on unassigned rows', () => {
    seed([enq(), enq({ id: 'e2', assigned_to: { id: 'u1', name: 'Ravi' } })])
    const tree = render(<EnquiriesScreen />)
    expect(treeText(tree).filter((t) => t === 'Take')).toHaveLength(1)
    expect(treeText(tree).join('')).toContain('Being handled by Ravi')
  })

  it('Take calls the API once with the id, then refreshes the list', async () => {
    seed([enq()])
    vi.mocked(apiMock.collectionApi.takeEnquiry).mockResolvedValue({} as never)
    await press(render(<EnquiriesScreen />), 'Take this enquiry')
    expect(apiMock.collectionApi.takeEnquiry).toHaveBeenCalledWith('e1')
    expect(invalidateMock).toHaveBeenCalledWith({ queryKey: ['enquiries'] })
  })

  it('double tap on Take sends one request (RC-015)', async () => {
    seed([enq()])
    vi.mocked(apiMock.collectionApi.takeEnquiry).mockResolvedValue({} as never)
    const h = handler(render(<EnquiriesScreen />), 'Take this enquiry')!
    await act(async () => {
      await Promise.all([h.onPress(), h.onPress()])
    })
    expect(apiMock.collectionApi.takeEnquiry).toHaveBeenCalledTimes(1)
  })

  it('ENQUIRY_TAKEN shows "Already taken", not the generic error', async () => {
    seed([enq()])
    vi.mocked(apiMock.collectionApi.takeEnquiry).mockRejectedValue(
      new ApiError('ENQUIRY_TAKEN', 'Ravi already took this', 409),
    )
    const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {})
    await press(render(<EnquiriesScreen />), 'Take this enquiry')
    expect(alertSpy).toHaveBeenCalledWith('Already taken', 'Ravi already took this')
    expect(alertSpy.mock.calls.some((c) => c[0] === 'Error')).toBe(false)
  })

  it.each([
    ['4xx shows the server reason', 422, 'Cannot take closed enquiry', 'Cannot take closed enquiry'],
    ['5xx shows the fallback', 500, 'pg exploded', 'Could not take this enquiry'],
  ])('other error: %s', async (_n, status, serverMsg, shown) => {
    seed([enq()])
    vi.mocked(apiMock.collectionApi.takeEnquiry).mockRejectedValue(new ApiError('X', serverMsg, status))
    const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {})
    await press(render(<EnquiriesScreen />), 'Take this enquiry')
    expect(alertSpy).toHaveBeenCalledWith('Error', shown, undefined)
  })

  it('status buttons send collection id + enquiry id + status; active one is disabled', async () => {
    seed([enq({ status: 'SEEN' })])
    vi.mocked(apiMock.collectionApi.setEnquiryStatus).mockResolvedValue({} as never)
    const tree = render(<EnquiriesScreen />)
    expect(handler(tree, 'Mark Seen')!.disabled).toBe(true)
    expect(handler(tree, 'Mark Replied')!.disabled).toBeFalsy()
    await press(tree, 'Mark Replied')
    expect(apiMock.collectionApi.setEnquiryStatus).toHaveBeenCalledWith('col1', 'e1', 'REPLIED')
  })

  it.each([
    ['salesperson', false],
    ['manager', true],
    [null, true],
  ])('Reassign for role %s visible=%s', (role, visible) => {
    authState.staffRole = role
    seed([enq()])
    expect(handler(render(<EnquiriesScreen />), 'Reassign') !== undefined).toBe(visible)
  })

  it('Reassign opens assignees; picking one calls assignEnquiry', async () => {
    seed([enq()])
    vi.mocked(apiMock.collectionApi.assignEnquiry).mockResolvedValue({} as never)
    const tree = render(<EnquiriesScreen />)
    expect(handler(tree, 'Assign to Ravi')).toBeUndefined()
    await press(tree, 'Reassign')
    await press(tree, 'Assign to Ravi')
    expect(apiMock.collectionApi.assignEnquiry).toHaveBeenCalledWith('e1', 'u1')
  })

  it.each([
    ['owner + flag', null, ['VIRTUAL_TRY_ON_V2'], true],
    ['manager + flag', 'manager', ['VIRTUAL_TRY_ON_V2'], true],
    ['owner, flag off', null, [], false],
    ['salesperson + flag', 'salesperson', ['VIRTUAL_TRY_ON_V2'], false],
  ])('Try on button: %s -> %s', (_n, role, features, visible) => {
    authState.staffRole = role
    seed([enq()])
    seedFeatures(features)
    expect(handler(render(<EnquiriesScreen />), 'Try on with customer') !== undefined).toBe(visible)
  })

  it('Try on hides when the enquiry has no products and passes ids + names only', async () => {
    seedFeatures(['VIRTUAL_TRY_ON_V2'])
    seed([enq({ products: [] })])
    expect(handler(render(<EnquiriesScreen />), 'Try on with customer')).toBeUndefined()

    seed([enq()])
    await press(render(<EnquiriesScreen />), 'Try on with customer')
    const arg = vi.mocked(router.push).mock.calls.at(-1)![0] as { pathname: string; params: Record<string, string> }
    expect(arg.pathname).toBe('/enquiry-try-on')
    expect(arg.params.productIds).toBe('p1,p2')
    expect(JSON.parse(arg.params.productNames)).toEqual(['Red Suit', 'Product'])
    expect(JSON.stringify(arg)).not.toMatch(/Meena|98XXXX3210/)
  })
})
