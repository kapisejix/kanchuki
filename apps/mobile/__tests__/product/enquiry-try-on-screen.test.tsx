/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react-test-renderer'
import { Alert, AppState, BackHandler, Linking } from 'react-native'
import { render } from '../../src/test/__mocks__/testing-library'

// T3.2-a #8 — app/enquiry-try-on.tsx (F-044 R2 in-store try-on).
// The orchestrator (lib/try-on-session) is covered by its own unit test; here
// runTryOnSession / cleanupSession / keep-awake are stubs so each screen path
// (quota pre-flight RC-073, consent, run, gallery, and the privacy cleanup on
// every way out) can be pinned. Role gating (RC-068) is server-side: the screen
// only maps 403/404 on the quota read to "not available".
vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).__DEV__ = true
})

import EnquiryTryOnScreen from '../../app/enquiry-try-on'
import { ApiError } from '../../src/lib/api/api-error'
import { router, useLocalSearchParams } from 'expo-router'
import { TRY_ON_CONSENT } from '@kanchuki/shared'

const m = vi.hoisted(() => ({
  getTryOnQuota: vi.fn(),
  runTryOnSession: vi.fn(),
  cleanupSession: vi.fn(),
  setSessionKeepAwake: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
  requestPermission: vi.fn(),
  clearDiskCache: vi.fn(),
  clearMemoryCache: vi.fn(),
}))

vi.mock('../../src/lib/api', () => ({
  productApi: { getTryOnQuota: m.getTryOnQuota },
}))
// try-on-session's own imports (native / network modules) — only the pure fns are used for real.
vi.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: vi.fn(), deactivateKeepAwake: vi.fn() }))
vi.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/', deleteAsync: vi.fn() }))
vi.mock('../../src/lib/api/products', () => ({ productApi: {} }))
vi.mock('../../src/lib/api/billing', () => ({ billingApi: {} }))
vi.mock('../../src/lib/compress-image', () => ({ compressImageForUpload: vi.fn() }))
vi.mock('../../src/lib/try-on-session', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/try-on-session')>('../../src/lib/try-on-session')
  return {
    ...actual, // planSession + shouldKeepAwake stay real
    runTryOnSession: m.runTryOnSession,
    cleanupSession: m.cleanupSession,
    setSessionKeepAwake: m.setSessionKeepAwake,
  }
})
const camera = vi.hoisted(() => ({ granted: false }))
vi.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: camera.granted }, m.requestPermission],
}))
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: m.launchImageLibraryAsync }))
vi.mock('expo-image', async () => {
  const React = await import('react')
  const Image: any = (props: Record<string, unknown>) => React.createElement('Image', props)
  Image.clearDiskCache = m.clearDiskCache
  Image.clearMemoryCache = m.clearMemoryCache
  return { Image }
})

// ── Tree helpers ───────────────────────────────────────────────────
type TreeNode = { type: unknown; props: Record<string, any>; children?: (TreeNode | string)[]; rendered?: TreeNode }
type Tree = ReturnType<typeof render>
function collectNodes(node: TreeNode | TreeNode[] | string | null | undefined, pred: (n: TreeNode) => boolean, out: TreeNode[] = []): TreeNode[] {
  if (!node) return out
  if (Array.isArray(node)) {
    for (const c of node) collectNodes(c, pred, out)
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
    for (const c of node) collectText(c, out)
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
const text = (t: Tree) => collectText(t.toTree() as TreeNode).join('')
const nodes = (t: Tree, pred: (n: TreeNode) => boolean) => collectNodes(t.toTree() as TreeNode, pred)
const hasPress = (n: TreeNode) => typeof n.props?.onPress === 'function'
const byLabel = (t: Tree, label: string) => nodes(t, (n) => hasPress(n) && n.props.accessibilityLabel === label)[0]?.props
const byText = (t: Tree, s: string) => nodes(t, (n) => hasPress(n) && collectText(n).join('').includes(s))[0]?.props
const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
const tap = async (p: Record<string, any> | undefined, what: string) => {
  expect(p, what).toBeDefined()
  await act(async () => {
    await p!.onPress()
    await new Promise((r) => setTimeout(r, 0))
  })
}
const press = (t: Tree, label: string) => tap(byLabel(t, label), label)
const selected = (t: Tree, name: string) => byLabel(t, name)?.accessibilityState?.selected as boolean

// ── Platform listeners (the RN mock's are no-ops) ─────────────────
let appHandlers: ((s: string) => void)[] = []
let backHandler: (() => boolean) | undefined
const fireApp = (s: string) =>
  act(async () => {
    appHandlers.slice().forEach((h) => h(s))
    await new Promise((r) => setTimeout(r, 0))
  })

// ── Fixtures / mount ──────────────────────────────────────────────
const PHOTO = 'file:///cache/wearer.jpg'
const GALLERY = 'Choose a photo from the gallery'
const quota = (remaining: number, unlimited = false) => ({ data: { remaining, unlimited } })
let mounted: Tree[] = []
async function mount(over: Record<string, string> = {}) {
  vi.mocked(useLocalSearchParams).mockReturnValue({
    productIds: 'p1,p2,p3',
    productNames: JSON.stringify(['Red Suit', 'Blue Kurti', 'Green Saree']),
    ...over,
  })
  const t = render(<EnquiryTryOnScreen />)
  mounted.push(t)
  await flush()
  return t
}
async function toConsent(t: Tree) {
  await press(t, 'Continue to photo')
  await press(t, GALLERY)
}
const accept = (t: Tree) => tap(byLabel(t, TRY_ON_CONSENT.acceptLabel), 'accept')
const decline = (t: Tree) => tap(byText(t, TRY_ON_CONSENT.declineLabel), 'decline')

// A run the test settles by hand; onItem lets it push item updates meanwhile.
function holdRun() {
  const h: { onItem?: (i: any) => void; signal?: AbortSignal; release: () => void } = { release: () => {} }
  m.runTryOnSession.mockImplementation((a: any) => {
    h.onItem = a.onItem
    h.signal = a.signal
    return new Promise<void>((r) => {
      h.release = () => r()
    })
  })
  return h
}

beforeEach(() => {
  vi.clearAllMocks()
  camera.granted = false
  appHandlers = []
  backHandler = undefined
  vi.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (s: string) => void) => {
    appHandlers.push(cb)
    return { remove: () => void (appHandlers = appHandlers.filter((h) => h !== cb)) }
  }) as never)
  vi.spyOn(BackHandler, 'addEventListener').mockImplementation(((_: string, cb: () => boolean) => {
    backHandler = cb
    return { remove: () => {} }
  }) as never)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  m.getTryOnQuota.mockResolvedValue(quota(5))
  m.cleanupSession.mockResolvedValue(undefined)
  m.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: PHOTO }] })
  m.runTryOnSession.mockImplementation(async ({ products, onItem }: any) => {
    for (const p of products) {
      onItem({ productId: p.id, name: p.name, state: 'ready', url: `https://r/${p.id}.jpg`, jobId: `job-${p.id}` })
    }
    return []
  })
})
afterEach(() => {
  for (const t of mounted) t.unmount()
  mounted = []
})

describe('preflight: quota (RC-073)', () => {
  it('unparseable product names fall back to "Product"', async () => {
    const t = await mount({ productNames: 'not json' })
    expect(text(t)).toContain('3 try-ons')
    expect(byLabel(t, 'Product')).toBeDefined()
    expect(byLabel(t, 'Red Suit')).toBeUndefined()
  })

  it('enough quota preselects every product and shows no pick-limit hint', async () => {
    const t = await mount()
    expect(text(t)).toContain('3 try-ons · 5 left this month')
    expect(text(t)).not.toContain('Pick up to')
    expect(['Red Suit', 'Blue Kurti', 'Green Saree'].map((n) => selected(t, n))).toEqual([true, true, true])
  })

  it('short quota preselects the first N and the toggle never exceeds it', async () => {
    m.getTryOnQuota.mockResolvedValue(quota(2))
    const t = await mount()
    expect(text(t)).toContain('Pick up to 2 to try on.')
    expect(['Red Suit', 'Blue Kurti', 'Green Saree'].map((n) => selected(t, n))).toEqual([true, true, false])
    await press(t, 'Green Saree') // already at the cap
    expect(selected(t, 'Green Saree')).toBe(false)
    await press(t, 'Red Suit') // free a slot
    await press(t, 'Green Saree')
    expect(['Red Suit', 'Blue Kurti', 'Green Saree'].map((n) => selected(t, n))).toEqual([false, true, true])
  })

  it('"Continue to photo" is disabled with nothing selected', async () => {
    m.getTryOnQuota.mockResolvedValue(quota(1))
    const t = await mount()
    expect(byLabel(t, 'Continue to photo')?.disabled).toBeFalsy()
    await press(t, 'Red Suit')
    expect(byLabel(t, 'Continue to photo')?.disabled).toBe(true)
  })

  it('unlimited quota counts as one slot per product', async () => {
    m.getTryOnQuota.mockResolvedValue(quota(-1, true))
    const t = await mount()
    expect(text(t)).toContain('3 try-ons · 3 left this month')
    expect(selected(t, 'Green Saree')).toBe(true)
  })

  it('zero left: says so, offers no products or Continue, and buy buttons only when packs exist', async () => {
    m.getTryOnQuota.mockResolvedValue(quota(0))
    const t = await mount()
    expect(text(t)).toContain('You have used all your try-ons for this month.')
    expect(byLabel(t, 'Continue to photo')).toBeUndefined()
    expect(byLabel(t, 'Red Suit')).toBeUndefined()
    expect(text(t)).not.toContain('Buy more try-ons')
  })

  it.each([403, 404])('%s on the quota read says try-on is unavailable, with no Retry', async (status) => {
    m.getTryOnQuota.mockRejectedValue(new ApiError('NOPE', 'forbidden', status))
    const t = await mount()
    expect(text(t)).toContain('Try-on is not available for your account. Ask the store owner.')
    expect(byLabel(t, 'Retry')).toBeUndefined()
  })

  it.each([500, 0])('status %s shows the balance error and Retry reloads', async (status) => {
    m.getTryOnQuota.mockRejectedValueOnce(new ApiError('X', 'boom', status))
    const t = await mount()
    expect(text(t)).toContain('Could not check your try-on balance.')
    expect(text(t)).not.toContain('not available for your account')
    await press(t, 'Retry')
    expect(m.getTryOnQuota).toHaveBeenCalledTimes(2)
    expect(text(t)).toContain('3 try-ons · 5 left this month')
  })

})

describe('capture → consent → run → gallery', () => {
  it('without camera permission the shutter is disabled and "Allow camera" asks for it', async () => {
    const t = await mount()
    await press(t, 'Continue to photo')
    expect(byLabel(t, "Take the customer's photo")?.disabled).toBe(true)
    await tap(byLabel(t, 'Allow camera'), 'allow')
    expect(m.requestPermission).toHaveBeenCalledTimes(1)
  })

  it('cancelling the gallery picker stays on capture', async () => {
    m.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: [] })
    const t = await mount()
    await toConsent(t)
    expect(byLabel(t, GALLERY)).toBeDefined()
    expect(byLabel(t, TRY_ON_CONSENT.acceptLabel)).toBeUndefined()
  })

  it('declining deletes that photo, returns to capture and makes no API call', async () => {
    const t = await mount()
    await toConsent(t)
    expect(byLabel(t, TRY_ON_CONSENT.acceptLabel)).toBeDefined()
    await decline(t)
    expect(m.cleanupSession).toHaveBeenCalledWith({ photoUris: [PHOTO], jobIds: [] })
    expect(byLabel(t, GALLERY)).toBeDefined()
    expect(m.runTryOnSession).not.toHaveBeenCalled()
  })

  it('accepting runs only the selected products with the consent version, then shows the gallery and re-reads the quota', async () => {
    const t = await mount()
    await press(t, 'Blue Kurti') // deselect
    await toConsent(t)
    await accept(t)
    const args = m.runTryOnSession.mock.calls[0]![0]
    expect(args.products).toEqual([{ id: 'p1', name: 'Red Suit' }, { id: 'p3', name: 'Green Saree' }])
    expect(args.photoUri).toBe(PHOTO)
    expect(args.consentVersion).toBe(TRY_ON_CONSENT.version)
    expect(args.signal).toBeInstanceOf(AbortSignal)
    expect(text(t)).toContain('Swipe for more · Pictures are deleted when you leave')
    expect(m.getTryOnQuota).toHaveBeenCalledTimes(2)
  })

  it('a double accept in one tick starts one run', async () => {
    const h = holdRun()
    const t = await mount()
    await toConsent(t)
    const ok = byLabel(t, TRY_ON_CONSENT.acceptLabel)!
    await act(async () => {
      ok.onPress()
      ok.onPress()
    })
    expect(m.runTryOnSession).toHaveBeenCalledTimes(1)
    await act(async () => h.release())
  })

  it('while running, each item shows its state or failure reason', async () => {
    const h = holdRun()
    const t = await mount()
    await toConsent(t)
    await accept(t)
    expect(text(t)).toContain('Making the pictures…')
    await act(async () => {
      h.onItem!({ productId: 'p1', name: 'Red Suit', state: 'running' })
      h.onItem!({ productId: 'p2', name: 'Blue Kurti', state: 'failed', error: 'Try-on limit reached' })
      h.onItem!({ productId: 'p3', name: 'Green Saree', state: 'failed' })
    })
    const s = text(t)
    expect(s).toContain('Red Suit')
    expect(s).toContain('running')
    expect(s).toContain('Try-on limit reached')
    expect(s).toContain('Failed')
    await act(async () => h.release())
  })

  it('gallery: a ready picture never touches the disk cache; discarded and failed items explain themselves', async () => {
    m.runTryOnSession.mockImplementation(async ({ onItem }: any) => {
      onItem({ productId: 'p1', name: 'Red Suit', state: 'ready', url: 'https://r/p1.jpg', jobId: 'job-p1' })
      onItem({ productId: 'p2', name: 'Blue Kurti', state: 'discarded', jobId: 'job-p2' })
      onItem({ productId: 'p3', name: 'Green Saree', state: 'failed', error: 'GPU busy', jobId: 'job-p3' })
      return []
    })
    const t = await mount()
    await toConsent(t)
    await accept(t)
    const img = nodes(t, (n) => n.type === 'Image' && n.props.cachePolicy !== undefined)
    expect(img).toHaveLength(1)
    expect(img[0]!.props.cachePolicy).toBe('none')
    expect(img[0]!.props.source).toEqual({ uri: 'https://r/p1.jpg' })
    const s = text(t)
    expect(s).toContain('This picture was deleted.')
    expect(s).toContain('GPU busy')
    expect(s).toContain('Trying again uses one more try-on from your monthly balance.')
    expect(nodes(t, (n) => hasPress(n) && n.props.accessibilityLabel === 'Try again')).not.toHaveLength(0)
  })

  it('"Try again" re-runs only that product', async () => {
    m.runTryOnSession.mockImplementationOnce(async ({ onItem }: any) => {
      onItem({ productId: 'p3', name: 'Green Saree', state: 'failed', error: 'GPU busy', jobId: 'job-p3' })
      return []
    })
    const t = await mount()
    await toConsent(t)
    await accept(t)
    await press(t, 'Try again')
    expect(m.runTryOnSession).toHaveBeenCalledTimes(2)
    expect(m.runTryOnSession.mock.calls[1]![0].products).toEqual([{ id: 'p3', name: 'Green Saree' }])
  })

  it('keeps the screen awake while running / showing results and releases it on exit', async () => {
    const t = await mount()
    expect(m.setSessionKeepAwake).not.toHaveBeenCalled()
    await toConsent(t)
    expect(m.setSessionKeepAwake).not.toHaveBeenCalled()
    await accept(t)
    expect(m.setSessionKeepAwake).toHaveBeenLastCalledWith(true)
    t.unmount()
    mounted = []
    expect(m.setSessionKeepAwake).toHaveBeenLastCalledWith(false)
  })
})

describe('leaving: every way out deletes the photo and the results', () => {
  it('Close with nothing to lose leaves at once, without a prompt', async () => {
    const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {})
    const t = await mount()
    await press(t, 'Close try-on')
    expect(alertSpy).not.toHaveBeenCalled()
    expect(router.back).toHaveBeenCalledTimes(1)
    expect(m.cleanupSession).toHaveBeenCalledWith({ photoUris: [], jobIds: [] })
  })

  it('Close during a run asks first: Stay does nothing, Leave exits and aborts the run', async () => {
    const h = holdRun()
    const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {})
    const t = await mount()
    await toConsent(t)
    await accept(t)
    await press(t, 'Close try-on')
    expect(alertSpy).toHaveBeenCalledWith('Leave try-on?', 'Pictures are deleted when you leave.', expect.any(Array))
    const buttons = alertSpy.mock.calls[0]![2] as { text: string; onPress?: () => void }[]
    expect(router.back).not.toHaveBeenCalled()
    expect(buttons.find((b) => b.text === 'Stay')!.onPress).toBeUndefined()
    await act(async () => buttons.find((b) => b.text === 'Leave')!.onPress!())
    expect(router.back).toHaveBeenCalledTimes(1)
    expect(h.signal!.aborted).toBe(true)
    expect(m.cleanupSession).toHaveBeenCalledWith({ photoUris: [PHOTO], jobIds: [] })
    await act(async () => h.release())
  })

  it('Close on the gallery also asks, because ready pictures would be lost', async () => {
    const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {})
    const t = await mount()
    await toConsent(t)
    await accept(t)
    await press(t, 'Close try-on')
    expect(alertSpy).toHaveBeenCalledWith('Leave try-on?', expect.any(String), expect.any(Array))
    expect(router.back).not.toHaveBeenCalled()
  })

  it('hardware back is swallowed and routed through Close', async () => {
    const t = await mount()
    expect(backHandler).toBeDefined()
    let handled: boolean | undefined
    await act(async () => {
      handled = backHandler!()
    })
    expect(handled).toBe(true)
    expect(router.back).toHaveBeenCalledTimes(1)
    t.unmount()
    mounted = []
  })

  it('backgrounding the app with a photo or results leaves; with nothing held it does not', async () => {
    const t = await mount()
    await fireApp('background')
    expect(router.back).not.toHaveBeenCalled()
    await toConsent(t)
    await fireApp('background')
    expect(router.back).toHaveBeenCalledTimes(1)
    expect(m.cleanupSession).toHaveBeenCalledWith({ photoUris: [PHOTO], jobIds: [] })
  })

  it('unmount cleans photos + job ids once and clears the image cache; a later Close does not clean again', async () => {
    const t = await mount()
    await toConsent(t)
    await accept(t)
    t.unmount()
    mounted = []
    await flush()
    expect(m.cleanupSession).toHaveBeenCalledTimes(1)
    expect(m.cleanupSession.mock.calls[0]![0].photoUris).toEqual([PHOTO])
    expect([...m.cleanupSession.mock.calls[0]![0].jobIds].sort()).toEqual(['job-p1', 'job-p2', 'job-p3'])
    expect(m.clearDiskCache).toHaveBeenCalledTimes(1)
    expect(m.clearMemoryCache).toHaveBeenCalledTimes(1)
  })

  it('Close then unmount cleans only once (exit is idempotent)', async () => {
    const t = await mount()
    await press(t, 'Close try-on')
    t.unmount()
    mounted = []
    await flush()
    expect(m.cleanupSession).toHaveBeenCalledTimes(1)
  })

  it('a job created after exit is discarded straight away and not shown', async () => {
    const h = holdRun()
    const t = await mount()
    await toConsent(t)
    await accept(t)
    t.unmount()
    mounted = []
    await flush()
    m.cleanupSession.mockClear()
    await act(async () => {
      h.onItem!({ productId: 'p1', name: 'Red Suit', state: 'running', jobId: 'late-job' })
    })
    expect(m.cleanupSession).toHaveBeenCalledWith({ photoUris: [], jobIds: ['late-job'] })
    await act(async () => h.release())
  })
})
