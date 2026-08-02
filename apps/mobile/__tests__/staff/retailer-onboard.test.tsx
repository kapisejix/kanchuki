import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react-test-renderer'
import { Alert } from 'react-native'
import { render } from '../../src/test/__mocks__/testing-library'
import RetailerOnboardScreen from '../../app/staff/retailer-onboard'
import { teamApi } from '../../src/lib/team-api'

// ── Mocks ──────────────────────────────────────────────────────────
// team-api pulls in api.ts → expo-file-system (unmockable native module);
// theme pulls in themeApi → same chain. Mock both so the screen renders
// in vitest's Node environment.

vi.mock('../../src/lib/team-api', () => ({
  teamApi: { onboardRetailer: vi.fn() },
}))

vi.mock('../../src/lib/theme', () => ({
  useTheme: () => ({ primaryColor: '#1E2A3D' }),
}))

// ── Tree helpers ───────────────────────────────────────────────────
// The custom @testing-library mock (src/test/__mocks__/testing-library.js)
// exposes only render/toTree — no fireEvent. Drive TextInput/Pressable
// props directly through the react-test-renderer tree.

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

/** Valid form values — submit stays disabled until all three are filled. */
function fillValidForm(tree: ReturnType<typeof render>): void {
  const textInputs = collectNodes(tree.toTree() as TreeNode, (n) => typeof n.props?.onChangeText === 'function')
  const byPlaceholder = (placeholder: string) =>
    textInputs.find((n) => n.props.placeholder === placeholder) as TreeNode | undefined

  const shopName = byPlaceholder('e.g. Sharma Saree Center')
  const phone = byPlaceholder('9876543210')
  const city = byPlaceholder('e.g. Jaipur')
  if (!shopName || !phone || !city) {
    throw new Error('Expected shop/phone/city TextInputs in the rendered tree')
  }

  act(() => {
    ;(shopName.props.onChangeText as (v: string) => void)('Sharma Saree Center')
    ;(phone.props.onChangeText as (v: string) => void)('9876543210')
    ;(city.props.onChangeText as (v: string) => void)('Jaipur')
  })
}

/** Find the submit AnimatedPressable — the only Pressable with disabled=false. */
function findSubmit(tree: ReturnType<typeof render>): TreeNode {
  const submits = collectNodes(
    tree.toTree() as TreeNode,
    (n) => typeof n.props?.onPress === 'function' && n.props.disabled === false,
  )
  const submit = submits[0]
  if (!submit) throw new Error('Expected an enabled submit button after filling the form')
  return submit
}

describe('RetailerOnboardScreen error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: a network-level failure with no HTTP status (status 0).
    vi.mocked(teamApi.onboardRetailer).mockRejectedValue(
      Object.assign(new Error('Network request failed'), { status: 0, code: 'NETWORK_ERROR' }),
    )
  })

  // clearAllMocks() clears call history but does not uninstall spies —
  // restore so the Alert.alert spy never leaks across tests.
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the friendly fallback (not the raw error) when the API call fails with a network error', async () => {
    const alertSpy = vi.spyOn(Alert, 'alert')
    const tree = render(<RetailerOnboardScreen />)

    fillValidForm(tree)
    const submit = findSubmit(tree)

  await act(async () => {
    ;(submit.props.onPress as () => void)()
  })
  // Flush the rejected-promise continuation (handleSubmit is async).
  await act(async () => {})

    expect(teamApi.onboardRetailer).toHaveBeenCalledTimes(1)
    // errors.ts policy: never surface raw err.message on screen.
    expect(alertSpy).toHaveBeenCalledWith(
      'Failed to Onboard',
      'Something went wrong. Check the phone number and try again.',
    )
    expect(alertSpy).not.toHaveBeenCalledWith('Failed to Onboard', 'Network request failed')
  })

  it('shows the API’s curated message when the server responds with an error status', async () => {
    vi.mocked(teamApi.onboardRetailer).mockRejectedValue(
      Object.assign(new Error('This phone number is already registered'), { status: 400, code: 'TEAM_ERROR' }),
    )
    const alertSpy = vi.spyOn(Alert, 'alert')
    const tree = render(<RetailerOnboardScreen />)

    fillValidForm(tree)
    const submit = findSubmit(tree)

  await act(async () => {
    ;(submit.props.onPress as () => void)()
  })
  await act(async () => {})

  expect(alertSpy).toHaveBeenCalledWith(
    'Failed to Onboard',
    'This phone number is already registered',
  )
  })

  it('does not call the API when the form is invalid (submit stays disabled)', async () => {
    const alertSpy = vi.spyOn(Alert, 'alert')
    const tree = render(<RetailerOnboardScreen />)

    // Only fill the phone — shop name and city stay empty, so the submit
    // button remains disabled and handleSubmit must early-return.
    const textInputs = collectNodes(tree.toTree() as TreeNode, (n) => typeof n.props?.onChangeText === 'function')
    act(() => {
      ;(textInputs.find((n) => n.props.placeholder === '9876543210')?.props.onChangeText as ((v: string) => void) | undefined)?.('9876543210')
    })

    const enabled = collectNodes(
      tree.toTree() as TreeNode,
      (n) => typeof n.props?.onPress === 'function' && n.props.disabled === false,
    )
    expect(enabled).toHaveLength(0)
    expect(teamApi.onboardRetailer).not.toHaveBeenCalled()
    expect(alertSpy).not.toHaveBeenCalled()
  })
})
