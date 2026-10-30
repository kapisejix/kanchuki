/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react-test-renderer'
import { Alert } from 'react-native'
import { router } from 'expo-router'
import { render } from '../../src/test/__mocks__/testing-library'

// T3.2-a #10 — app/staff/support-session.tsx: manager requests a scoped session, the screen
// polls the grant every 3 s, then enters the retailer's account / reports why it did not.
vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).__DEV__ = true
})

import SupportSessionScreen from '../../app/staff/support-session'

const m = vi.hoisted(() => ({
  getRetailers: vi.fn(),
  startSupportSession: vi.fn(),
  getSupportSession: vi.fn(),
  getSupportSessionToken: vi.fn(),
  endSupportSession: vi.fn(),
  enterSupportSession: vi.fn(),
  showError: vi.fn(),
}))
const q = vi.hoisted(() => ({ retailers: [] as unknown[], loading: false }))

vi.mock('../../src/lib/team-api', () => ({
  teamApi: {
    getRetailers: m.getRetailers,
    startSupportSession: m.startSupportSession,
    getSupportSession: m.getSupportSession,
    getSupportSessionToken: m.getSupportSessionToken,
    endSupportSession: m.endSupportSession,
  },
}))
vi.mock('../../src/lib/catalog-delegate', () => ({ enterSupportSession: m.enterSupportSession }))
vi.mock('../../src/lib/errors', () => ({ showError: m.showError }))
vi.mock('../../src/lib/theme', () => ({ useTheme: () => ({ primaryColor: '#000', colors: {} }) }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { data: q.retailers }, isLoading: q.loading }),
}))

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
const byText = (t: Tree, s: string) =>
  collectNodes(t.toTree() as TreeNode, (n) => typeof n.props?.onPress === 'function' && collectText(n).join('').includes(s))[0]?.props
const tick = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const tap = async (p: Record<string, any> | undefined, what: string) => {
  expect(p, what).toBeDefined()
  await act(async () => {
    await p!.onPress()
    await vi.advanceTimersByTimeAsync(0)
  })
}

const SHOP = { id: 'r1', shop_name: 'Meena Boutique', city: 'Surat' }
const grant = (over: Record<string, unknown> = {}) => ({ data: { grant_id: 'g1', answer_within_seconds: 30, ...over } })
const status = (s: string) => ({ data: { status: s } })

let mounted: Tree[] = []
async function mount() {
  const t = render(<SupportSessionScreen />)
  mounted.push(t)
  await tick()
  return t
}
// request the session for SHOP and land on the waiting screen
async function request(t: Tree) {
  await tap(byText(t, 'Meena Boutique'), 'retailer card')
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  q.retailers = [SHOP]
  q.loading = false
  m.startSupportSession.mockResolvedValue(grant())
  m.getSupportSession.mockResolvedValue(status('PENDING'))
  m.getSupportSessionToken.mockResolvedValue({ data: { token: 'tok', expires_at: '2026-10-30T10:00:00Z' } })
  m.endSupportSession.mockResolvedValue(undefined)
  m.enterSupportSession.mockResolvedValue(undefined)
  vi.spyOn(Alert, 'alert').mockImplementation(() => {})
})
afterEach(() => {
  for (const t of mounted) t.unmount()
  mounted = []
  vi.useRealTimers()
})

describe('list', () => {
  it('shows the retailers with their city, and a spinner (no empty copy) while loading', async () => {
    const t = await mount()
    expect(text(t)).toContain('Meena Boutique')
    expect(text(t)).toContain('Surat')
    t.unmount()
    mounted = []
    q.loading = true
    q.retailers = []
    const t2 = await mount()
    expect(text(t2)).not.toContain('No retailers in your territory.')
  })

  it('no retailers shows the empty copy', async () => {
    q.retailers = []
    const t = await mount()
    expect(text(t)).toContain('No retailers in your territory.')
  })

  it('scope defaults to Growth; picking Demo selects it and the request carries it', async () => {
    const t = await mount()
    expect(byText(t, 'Growth').accessibilityState.selected).toBe(true)
    expect(byText(t, 'Demo').accessibilityState.selected).toBe(false)
    await tap(byText(t, 'Demo'), 'Demo')
    expect(byText(t, 'Demo').accessibilityState.selected).toBe(true)
    expect(byText(t, 'Growth').accessibilityState.selected).toBe(false)
    await request(t)
    expect(m.startSupportSession).toHaveBeenCalledWith({ retailer_id: 'r1', scope: 'DEMO' })
  })
})

describe('request', () => {
  it('asks the server, then waits for that shop', async () => {
    const t = await mount()
    await request(t)
    expect(m.startSupportSession).toHaveBeenCalledWith({ retailer_id: 'r1', scope: 'GROWTH' })
    expect(text(t)).toContain('Waiting for Meena Boutique')
    expect(byText(t, 'Cancel request')).toBeDefined()
    expect(byText(t, 'Meena Boutique')).toBeUndefined()
  })

  it('a failed request shows the error, stays on the list and can be retried', async () => {
    const err = new Error('nope')
    m.startSupportSession.mockRejectedValueOnce(err)
    const t = await mount()
    await request(t)
    expect(m.showError).toHaveBeenCalledWith(err, 'Could not request the session')
    expect(text(t)).not.toContain('Waiting for')
    expect(byText(t, 'Meena Boutique').disabled).toBeFalsy()
    await request(t)
    expect(text(t)).toContain('Waiting for Meena Boutique')
  })

  // RC-134 (RC-015 shape): `starting` is state, so it disabled the card only a render later;
  // two taps in one tick created two grants for the same retailer. startingRef guards it.
  it('a second tap in the same tick requests no second grant', async () => {
    const t = await mount()
    const card = byText(t, 'Meena Boutique')
    await act(async () => {
      card.onPress()
      card.onPress()
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(m.startSupportSession).toHaveBeenCalledTimes(1)
  })
})

describe('polling', () => {
  it('does not poll before 3 s, then polls the grant every 3 s while PENDING', async () => {
    const t = await mount()
    await request(t)
    await tick(2900)
    expect(m.getSupportSession).not.toHaveBeenCalled()
    await tick(100)
    expect(m.getSupportSession).toHaveBeenCalledWith('g1')
    await tick(3000)
    expect(m.getSupportSession).toHaveBeenCalledTimes(2)
    expect(text(t)).toContain('Waiting for Meena Boutique')
  })

  it('APPROVED: fetches the token, enters the session with the grant, then opens the tabs', async () => {
    m.getSupportSession.mockResolvedValue(status('APPROVED'))
    const t = await mount()
    await request(t)
    await tick(3000)
    expect(m.getSupportSessionToken).toHaveBeenCalledWith('g1')
    expect(m.enterSupportSession).toHaveBeenCalledWith({
      token: 'tok',
      shop_name: 'Meena Boutique',
      ticket_id: '',
      support: { grant_id: 'g1', scope: 'GROWTH', expires_at: '2026-10-30T10:00:00Z' },
    })
    expect(router.replace).not.toHaveBeenCalled()
    await tick(50)
    expect(router.replace).toHaveBeenCalledWith('/(tabs)')
    expect(text(t)).not.toContain('Waiting for')
    // polling stopped: nothing more after approval
    await tick(9000)
    expect(m.getSupportSession).toHaveBeenCalledTimes(1)
  })

  it.each(['DENIED', 'EXPIRED', 'ENDED'])('%s: tells the manager it was not approved and returns to the list', async (s) => {
    m.getSupportSession.mockResolvedValue(status(s))
    const t = await mount()
    await request(t)
    await tick(3000)
    expect(Alert.alert).toHaveBeenCalledWith('Not approved', 'Meena Boutique did not approve this session.')
    expect(m.getSupportSessionToken).not.toHaveBeenCalled()
    expect(m.enterSupportSession).not.toHaveBeenCalled()
    expect(text(t)).not.toContain('Waiting for')
    await tick(9000)
    expect(m.getSupportSession).toHaveBeenCalledTimes(1)
  })

  it('PENDING past the answer window gives up with "No answer"; before it, keeps waiting', async () => {
    m.startSupportSession.mockResolvedValue(grant({ answer_within_seconds: 10 }))
    const t = await mount()
    await request(t)
    await tick(9000) // polls at 3, 6, 9 s — all inside the window
    expect(Alert.alert).not.toHaveBeenCalled()
    expect(text(t)).toContain('Waiting for Meena Boutique')
    await tick(3000) // 12 s > 10 s
    expect(Alert.alert).toHaveBeenCalledWith('No answer', 'Meena Boutique has not answered. Ask them to open Kanchuki.')
    expect(text(t)).not.toContain('Waiting for')
    await tick(9000)
    expect(m.getSupportSession).toHaveBeenCalledTimes(4)
  })

  it('a poll error shows the reason, stops polling and returns to the list', async () => {
    const err = new Error('offline')
    m.getSupportSession.mockRejectedValueOnce(err)
    const t = await mount()
    await request(t)
    await tick(3000)
    expect(m.showError).toHaveBeenCalledWith(err, 'Could not check the session')
    expect(text(t)).not.toContain('Waiting for')
    await tick(9000)
    expect(m.getSupportSession).toHaveBeenCalledTimes(1)
  })

  it('a token fetch error after APPROVED is reported, and no session is entered', async () => {
    m.getSupportSession.mockResolvedValue(status('APPROVED'))
    const err = new Error('token gone')
    m.getSupportSessionToken.mockRejectedValueOnce(err)
    const t = await mount()
    await request(t)
    await tick(3000)
    expect(m.showError).toHaveBeenCalledWith(err, 'Could not check the session')
    expect(m.enterSupportSession).not.toHaveBeenCalled()
    expect(router.replace).not.toHaveBeenCalled()
    expect(text(t)).not.toContain('Waiting for')
  })

  it('a slow poll is not overlapped by the next tick', async () => {
    let settle: (v: unknown) => void = () => {}
    m.getSupportSession.mockImplementation(() => new Promise((r) => (settle = r)))
    const t = await mount()
    await request(t)
    await tick(9000)
    expect(m.getSupportSession).toHaveBeenCalledTimes(1)
    await act(async () => {
      settle(status('PENDING'))
      await vi.advanceTimersByTimeAsync(0)
    })
    await tick(3000)
    expect(m.getSupportSession).toHaveBeenCalledTimes(2)
    expect(t).toBeDefined()
  })

  it('leaving the screen stops polling', async () => {
    const t = await mount()
    await request(t)
    await tick(3000)
    expect(m.getSupportSession).toHaveBeenCalledTimes(1)
    t.unmount()
    mounted = []
    await tick(9000)
    expect(m.getSupportSession).toHaveBeenCalledTimes(1)
  })
})

describe('cancel', () => {
  it('ends that grant, returns to the list and stops polling', async () => {
    const t = await mount()
    await request(t)
    await tap(byText(t, 'Cancel request'), 'cancel')
    expect(m.endSupportSession).toHaveBeenCalledWith('g1')
    expect(text(t)).not.toContain('Waiting for')
    expect(byText(t, 'Meena Boutique')).toBeDefined()
    await tick(9000)
    expect(m.getSupportSession).not.toHaveBeenCalled()
  })

  it('a failed end still leaves the waiting screen, and says the request expires on its own', async () => {
    const err = new Error('net')
    m.endSupportSession.mockRejectedValueOnce(err)
    const t = await mount()
    await request(t)
    await tap(byText(t, 'Cancel request'), 'cancel')
    expect(m.showError).toHaveBeenCalledWith(err, 'Could not cancel the request. It expires on its own.')
    expect(text(t)).not.toContain('Waiting for')
  })

  // RC-134: a poll that already saw APPROVED is mid-await on the token when the manager cancels.
  // handleCancel ends the grant; the in-flight poll used to enter the session with that dead grant.
  it('cancelling while the token is being fetched does not enter the session', async () => {
    m.getSupportSession.mockResolvedValue(status('APPROVED'))
    let giveToken: (v: unknown) => void = () => {}
    m.getSupportSessionToken.mockImplementation(() => new Promise((r) => (giveToken = r)))
    const t = await mount()
    await request(t)
    const cancel = byText(t, 'Cancel request')
    await tick(3000) // APPROVED seen, token pending
    await tap(cancel, 'cancel')
    expect(m.endSupportSession).toHaveBeenCalledWith('g1')
    await act(async () => {
      giveToken({ data: { token: 'tok', expires_at: 'x' } })
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(m.enterSupportSession).not.toHaveBeenCalled()
    expect(router.replace).not.toHaveBeenCalled()
  })

  // RC-134, first await: the status answer arrives after the manager cancelled — no stale alert.
  it('cancelling while the status request is pending shows no "Not approved" for the cancelled request', async () => {
    let giveStatus: (v: unknown) => void = () => {}
    m.getSupportSession.mockImplementation(() => new Promise((r) => (giveStatus = r)))
    const t = await mount()
    await request(t)
    const cancel = byText(t, 'Cancel request')
    await tick(3000)
    await tap(cancel, 'cancel')
    await act(async () => {
      giveStatus(status('DENIED'))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(Alert.alert).not.toHaveBeenCalled()
    expect(m.getSupportSessionToken).not.toHaveBeenCalled()
  })
})
