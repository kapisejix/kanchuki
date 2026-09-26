import { act } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TRY_ON_CONSENT } from '@kanchuki/shared'
import { render } from '../../src/test/__mocks__/testing-library'
import { useLocalSearchParams } from 'expo-router'
import TryOnScreen from '../../app/product/try-on'

// F-039 Phase 2 / T7 — the consent screen must BLOCK capture (retailer app).
//
// Mobile mirror of `apps/web/.../__tests__/TryOnSheet.test.tsx`. The flow is
// inverted here — the walk-in photo is taken FIRST and the consent follows —
// so the guard reads backwards from the web one: the capture controls must be
// *gone* the moment consent is on screen, not merely disabled. A rendered-but-
// disabled shutter is still a rendered shutter, and the picture it would take
// has no accepted notice behind it to record a version against.
//
// This test is only meaningful because it can go red: drop the
// `step === 'capture'` guard around the capture block (or start on 'consent')
// and one of the two assertions below fails.
//
// The file also carries the session-expiry guard below. It lives here rather
// than in a second file because the harness (the api barrel mock, the picker,
// the tree helpers) is the expensive part and is identical — the two guards
// are two screens of one flow.

;(globalThis as Record<string, unknown>).__DEV__ = true

const pickerMock = vi.hoisted(() => ({
  // Controllable so the gallery press actually advances the screen to consent.
  launchImageLibraryAsync: vi.fn(),
}))

const pollMock = vi.hoisted(() => ({ pollWithBackoff: vi.fn() }))

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
    productApi: { startTryOn: vi.fn(), getTryOnStatus: vi.fn() },
  }
})

// The api barrel pulls in client.ts → expo-file-system (an unmockable native
// module), so the whole barrel is replaced.
vi.mock('../../src/lib/api', () => apiMock)

// The poller is stubbed, never real — a real one leaves timers behind. It is
// stubbable per test rather than fixed, because the status-read 401 arms below
// have to drive `onPoll` themselves to observe what the screen does with its
// answer.
vi.mock('../../src/lib/polling', () => ({ pollWithBackoff: pollMock.pollWithBackoff }))

vi.mock('expo-camera', () => ({
  // Never rendered in this test: the mocked permission is denied, so the
  // screen shows its "Allow camera" branch instead of the viewfinder.
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: false }, vi.fn(async () => ({}))],
}))

vi.mock('expo-image-picker', () => pickerMock)

// ── Tree helpers (same shape as __tests__/smoke/rc-screens.test.tsx) ──
// NOTE: pass the WHOLE node to collectText, not n.children — mocked composite
// components expose their content under `rendered`, so children alone is empty.

type TreeNode = {
  type: unknown
  props: Record<string, unknown>
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

function collectText(
  node: TreeNode | TreeNode[] | string | null | undefined,
  out: string[] = [],
): string[] {
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

function treeText(tree: ReturnType<typeof render>): string {
  return collectText(tree.toTree() as TreeNode).join(' ')
}

function findPressableByLabel(
  tree: ReturnType<typeof render>,
  label: string,
): TreeNode | undefined {
  return collectNodes(
    tree.toTree() as TreeNode,
    (n) => typeof n.props?.onPress === 'function' && n.props.accessibilityLabel === label,
  )[0]
}

const SHUTTER = "Take the customer's photo"
const GALLERY = 'Choose a photo from the gallery'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useLocalSearchParams).mockReturnValue({
    productId: 'prod-1',
    productName: 'Maroon Silk Saree',
  })
  pickerMock.launchImageLibraryAsync.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///selfie.jpg' }],
  })
  // Default: a poller that never ticks, so the two consent tests stay about
  // consent.
  pollMock.pollWithBackoff.mockImplementation(() => () => {})
})

describe('try-on consent gate (retailer app)', () => {
  it('offers capture with no consent copy, then hides capture while consent is on screen', async () => {
    const tree = render(<TryOnScreen />)

    // Step 1 is capture: both ways to supply a photo exist.
    expect(findPressableByLabel(tree, SHUTTER)).toBeTruthy()
    expect(findPressableByLabel(tree, GALLERY)).toBeTruthy()

    // …and nothing has been agreed to yet — the copy is not on screen at all.
    expect(treeText(tree)).not.toContain(TRY_ON_CONSENT.title)

    // Choosing a photo moves the screen to the consent step.
    await act(async () => {
      ;(findPressableByLabel(tree, GALLERY)!.props.onPress as () => void)()
    })
    await act(async () => {})

    // Rendered from @kanchuki/shared, so the words match the version the API
    // records — a hardcoded second copy would be free to drift.
    const text = treeText(tree)
    expect(text).toContain(TRY_ON_CONSENT.title)
    expect(text).toContain(TRY_ON_CONSENT.points[0].label)
    expect(text).toContain(TRY_ON_CONSENT.acceptLabel)

    // The gate: no way to take (or re-pick) a photo while the notice is up.
    expect(findPressableByLabel(tree, SHUTTER)).toBeUndefined()
    expect(findPressableByLabel(tree, GALLERY)).toBeUndefined()
  })

  it('sends the version of the notice the customer just read', async () => {
    const tree = render(<TryOnScreen />)

    await act(async () => {
      ;(findPressableByLabel(tree, GALLERY)!.props.onPress as () => void)()
    })
    await act(async () => {})

    // Seeing the notice is not agreeing to it: no request has been made yet,
    // so a consent that was only *displayed* cannot leave a grant behind.
    expect(apiMock.productApi.startTryOn).not.toHaveBeenCalled()

    apiMock.productApi.startTryOn.mockResolvedValue({ data: { job_id: 'job-1' } })

    await act(async () => {
      ;(findPressableByLabel(tree, TRY_ON_CONSENT.acceptLabel)!.props.onPress as () => void)()
    })
    await act(async () => {})

    // The API refuses a try-on with no/stale `consent_version`, so the version
    // this screen sends IS the consent. Off by one release and every in-store
    // try-on 422s.
    expect(apiMock.productApi.startTryOn).toHaveBeenCalledWith(
      'prod-1',
      TRY_ON_CONSENT.version,
      'file:///selfie.jpg',
    )
  })
})

describe('try-on session expiry (retailer app)', () => {
  it('never renders the API sentence the API wrote for a shopper', async () => {
    const tree = render(<TryOnScreen />)

    await act(async () => {
      ;(findPressableByLabel(tree, GALLERY)!.props.onPress as () => void)()
    })
    await act(async () => {})

    // The route's 401 copy, verbatim. A retailer holding this phone cannot act
    // on it, and the two the auth plugin sends ('Missing Bearer token',
    // 'Invalid or expired token') are no more useful — which is why the arm is
    // keyed on the status rather than on any of the three strings.
    const apiSentence = 'Sign in to try on this outfit.'
    apiMock.productApi.startTryOn.mockRejectedValue(
      new apiMock.ApiError('UNAUTHORIZED', apiSentence, 401),
    )

    await act(async () => {
      ;(findPressableByLabel(tree, TRY_ON_CONSENT.acceptLabel)!.props.onPress as () => void)()
    })
    await act(async () => {})

    const text = treeText(tree)
    expect(text).toContain('Your sign-in has expired.')
    // The load-bearing half: the fallback arm would render the API's sentence
    // verbatim, so asserting only that our copy appeared would pass either way.
    expect(text).not.toContain(apiSentence)
  })

  // Both arms below accept the notice and start a job, then drive the poller's
  // own callback — the only way to observe what the screen does with a status
  // read that failed.
  async function startJobThenPoll(
    failure: unknown,
  ): Promise<{ keepPolling: boolean; text: string }> {
    apiMock.productApi.startTryOn.mockResolvedValue({ data: { job_id: 'job-1' } })
    apiMock.productApi.getTryOnStatus.mockRejectedValue(failure)

    let onPoll: (() => Promise<boolean>) | undefined
    pollMock.pollWithBackoff.mockImplementation((opts: { onPoll: () => Promise<boolean> }) => {
      onPoll = opts.onPoll
      return () => {}
    })

    const tree = render(<TryOnScreen />)
    await act(async () => {
      ;(findPressableByLabel(tree, GALLERY)!.props.onPress as () => void)()
    })
    await act(async () => {})
    await act(async () => {
      ;(findPressableByLabel(tree, TRY_ON_CONSENT.acceptLabel)!.props.onPress as () => void)()
    })
    await act(async () => {})

    expect(onPoll).toBeDefined()

    let keepPolling: boolean | undefined
    await act(async () => {
      keepPolling = await onPoll!()
    })

    return { keepPolling: keepPolling === true, text: treeText(tree) }
  }

  it('stops the poller when the status read 401s, rather than retrying a dead session', async () => {
    const { keepPolling, text } = await startJobThenPoll(
      // The auth plugin's wording, not the route's — the arm is keyed on the
      // status precisely because a 401 arrives in more than one sentence.
      new apiMock.ApiError('UNAUTHORIZED', 'Invalid or expired token', 401),
    )

    // `true` means "stop". Left to the generic catch this returns false forever,
    // and the retailer watches the spinner for 60 attempts while the app is
    // already navigating to the sign-in screen.
    expect(keepPolling).toBe(true)
    expect(text).toContain('Your sign-in has expired.')
    expect(text).not.toContain('Invalid or expired token')
  })

  it('keeps polling a transient status failure', async () => {
    // The counterpart, and the reason the arm is not simply "any error is
    // terminal": a dropped connection must not fail a job that is still
    // running on the GPU.
    const { keepPolling, text } = await startJobThenPoll(
      new apiMock.ApiError('NETWORK_ERROR', 'Network request failed', 0),
    )

    expect(keepPolling).toBe(false)
    expect(text).toContain('Making the picture')
    expect(text).not.toContain('Your sign-in has expired.')
  })
})
