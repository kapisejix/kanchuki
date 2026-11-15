/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react-test-renderer'
import { Alert } from 'react-native'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '../../src/test/__mocks__/testing-library'

// F-047 T6 — app/product/sell.tsx: scan several articles, one "Mark N items sold".
vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).__DEV__ = true
})

const m = vi.hoisted(() => ({
  list: vi.fn(),
  sell: vi.fn(),
  undoSale: vi.fn(),
  showError: vi.fn(),
  invalidate: vi.fn(),
  cameraProps: {} as Record<string, any>,
  enqueue: vi.fn(),
  online: { value: true },
  cached: { entries: [] as [unknown, unknown][] },
}))

vi.mock('../../src/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: m.online.value }),
}))
vi.mock('expo-file-system', () => ({
  Paths: { document: { uri: 'file:///documents/' } },
  File: class {},
  Directory: class {},
}))
vi.mock('../../src/lib/mutation-queue', async (orig) => ({
  ...(await orig<typeof import('../../src/lib/mutation-queue')>()),
  enqueueSellMutation: m.enqueue,
}))

vi.mock('expo-camera', () => ({
  CameraView: (props: Record<string, any>) => {
    m.cameraProps = props
    return null
  },
  useCameraPermissions: () => [{ granted: true }, vi.fn()],
}))
vi.mock('../../src/lib/api', () => ({
  productApi: { list: m.list, sell: m.sell, undoSale: m.undoSale },
}))
vi.mock('../../src/lib/errors', () => ({
  showError: m.showError,
  apiMessage: (_e: unknown, fallback: string) => fallback,
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: m.invalidate, getQueriesData: () => m.cached.entries }),
}))
vi.mock('../../src/lib/safe-area', () => ({
  useScreenInsets: () => ({ insets: { top: 0, bottom: 0, left: 0, right: 0 }, headerPaddingTop: 0 }),
}))

import SellScreen from '../../app/product/sell'
import { ApiError } from '../../src/lib/api/api-error'
import { router } from 'expo-router'

type Tree = ReturnType<typeof render>
type TreeNode = { props?: Record<string, any>; children?: (TreeNode | string)[]; rendered?: TreeNode }
function collectText(node: any, out: string[] = []): string[] {
  if (!node) return out
  if (Array.isArray(node)) {
    for (const c of node) collectText(c, out)
    return out
  }
  if (typeof node === 'string') {
    out.push(node)
    return out
  }
  collectText((node as TreeNode).children, out)
  if ((node as TreeNode).rendered) collectText((node as TreeNode).rendered, out)
  return out
}
// JSX splits "Mark {n} sold" into adjacent strings that already carry their spaces.
const text = (t: Tree) => collectText(t.toTree()).join('')
const el = (t: Tree, id: string) => t.getByTestId(id) as any
const has = (t: Tree, id: string) => t.queryByTestId(id) !== null
const press = (t: Tree, id: string) => act(async () => el(t, id).props.onPress())
const scan = (data: string) => act(async () => m.cameraProps.onBarcodeScanned({ data }))

const p1 = {
  id: 'p1',
  name: 'Pink suit',
  sku: 'LS0001',
  price_min: 200000,
  status: 'AVAILABLE',
  primary_photo_url: null,
  stock: [{ size: 'FREE', quantity: 3 }],
}
const p2 = {
  id: 'p2',
  name: 'Blue kurti',
  sku: 'LS0002',
  price_min: 150000,
  status: 'AVAILABLE',
  primary_photo_url: null,
  stock: [
    { size: 'S', quantity: 0 },
    { size: 'M', quantity: 2 },
    { size: 'L', quantity: 1 },
  ],
}
const bySku: Record<string, unknown> = { LS0001: p1, LS0002: p2 }

const mount = async () => {
  let tree!: Tree
  await act(async () => {
    tree = render(<SellScreen />)
  })
  return tree
}

const okLine = (product_id: string, size: string) => ({
  product_id,
  size,
  ok: true,
  remaining_total: 2,
  status: 'AVAILABLE',
})

async function sellOne(t: Tree) {
  await scan('LS0001')
  await press(t, 'sell-open-confirm')
  await press(t, 'sell-confirm')
}

beforeEach(() => {
  vi.clearAllMocks()
  m.cameraProps = {}
  m.online.value = true
  m.cached.entries = []
  m.enqueue.mockResolvedValue(true)
  vi.spyOn(Alert, 'alert').mockImplementation(() => {})
  m.list.mockImplementation(async ({ sku }: { sku: string }) => ({
    data: bySku[sku] ? [bySku[sku]] : [],
  }))
  m.sell.mockResolvedValue({ data: { bill_id: 'b', replayed: false, lines: [okLine('p1', 'FREE')] } })
  m.undoSale.mockResolvedValue({ data: { bill_id: 'b', undone: true, lines: [] } })
})
afterEach(() => vi.useRealTimers())

describe('SellScreen — building the bill', () => {
  it('scanning a known SKU adds a row (looked up uppercased) and does not sell', async () => {
    const t = await mount()
    await scan('LS0001')
    expect(m.list).toHaveBeenCalledWith({ sku: 'LS0001', limit: 1 })
    expect(text(t)).toContain('Pink suit')
    expect(m.sell).not.toHaveBeenCalled()
    expect(text(t)).toContain('Mark 1 item sold')
  })

  it('an unknown SKU shows a "not found" row and keeps confirm unavailable', async () => {
    const t = await mount()
    await scan('LS0099')
    expect(text(t)).toContain('LS0099 not found')
    expect(has(t, 'sell-open-confirm')).toBe(false)
  })

  it('an already-sold product shows "Already sold" and is not counted', async () => {
    m.list.mockResolvedValue({ data: [{ ...p1, status: 'SOLD', stock: [{ size: 'FREE', quantity: 0 }] }] })
    const t = await mount()
    await scan('LS0001')
    expect(text(t)).toContain('Already sold')
    expect(has(t, 'sell-open-confirm')).toBe(false)
  })

  it('a failed lookup shows the error and adds nothing', async () => {
    m.list.mockRejectedValue(new ApiError('NETWORK_ERROR', 'offline', 0))
    const t = await mount()
    await scan('LS0001')
    expect(m.showError).toHaveBeenCalled()
    expect(text(t)).not.toContain('Pink suit')
  })

  it('a multi-size product opens a chooser with only in-stock sizes; picking one adds the row', async () => {
    const t = await mount()
    await scan('LS0002')
    expect(has(t, 'size-option-M')).toBe(true)
    expect(has(t, 'size-option-L')).toBe(true)
    expect(has(t, 'size-option-S')).toBe(false)
    await press(t, 'size-option-M')
    expect(has(t, 'size-option-M')).toBe(false)
    expect(text(t)).toContain('Blue kurti')
    expect(el(t, 'sell-open-confirm').props.disabled).toBeFalsy()
  })

  it('cancelling the size chooser drops that row', async () => {
    const t = await mount()
    await scan('LS0002')
    await press(t, 'size-cancel')
    expect(has(t, 'size-option-M')).toBe(false)
    expect(text(t)).not.toContain('Blue kurti')
  })

  it('stepper + is capped at stock; remove deletes the row', async () => {
    const t = await mount()
    await scan('LS0001')
    for (let i = 0; i < 6; i++) await press(t, 'sell-inc-p1:FREE')
    expect(text(t)).toContain('Mark 3 items sold')
    await press(t, 'sell-remove-p1:FREE')
    expect(text(t)).not.toContain('Pink suit')
  })

  it('pauses the camera while the size chooser or confirm sheet is open', async () => {
    const t = await mount()
    await scan('LS0002')
    expect(m.cameraProps.active).toBe(false)
    await press(t, 'size-option-M')
    expect(m.cameraProps.active).toBe(true)
    await press(t, 'sell-open-confirm')
    expect(m.cameraProps.active).toBe(false)
  })
})

describe('SellScreen — selling', () => {
  it('confirm sends one bill with a client id and the scanned lines, then shows the result', async () => {
    const t = await mount()
    await sellOne(t)
    expect(m.sell).toHaveBeenCalledTimes(1)
    const [billId, lines] = m.sell.mock.calls[0]!
    expect(billId).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
    expect(lines).toEqual([{ product_id: 'p1', size: 'FREE', quantity: 1 }])
    expect(text(t)).toContain('1 marked sold')
    expect(m.invalidate).toHaveBeenCalledWith({ queryKey: ['products'] })
  })

  it('two taps on Confirm in one tick send the bill once (RC-015/135)', async () => {
    let release: (v: unknown) => void = () => {}
    m.sell.mockReturnValue(
      new Promise((r) => {
        release = r
      }),
    )
    const t = await mount()
    await scan('LS0001')
    await press(t, 'sell-open-confirm')
    const btn = el(t, 'sell-confirm')
    await act(async () => {
      btn.props.onPress()
      btn.props.onPress()
    })
    expect(m.sell).toHaveBeenCalledTimes(1)
    await act(async () => release({ data: { bill_id: 'b', replayed: false, lines: [okLine('p1', 'FREE')] } }))
  })

  it('lists per-line failures next to the count of sold lines', async () => {
    m.sell.mockResolvedValue({
      data: {
        bill_id: 'b',
        replayed: false,
        lines: [okLine('p1', 'FREE'), { product_id: 'p2', size: 'M', ok: false, error: 'INSUFFICIENT_STOCK' }],
      },
    })
    const t = await mount()
    await scan('LS0001')
    await scan('LS0002')
    await press(t, 'size-option-M')
    await press(t, 'sell-open-confirm')
    await press(t, 'sell-confirm')
    const s = text(t)
    expect(s).toContain('1 marked sold')
    expect(s).toContain('Blue kurti')
    expect(s).toContain('Not enough stock')
  })

  it('when every line fails it says nothing was sold and offers no Undo', async () => {
    m.sell.mockResolvedValue({
      data: { bill_id: 'b', replayed: false, lines: [{ product_id: 'p1', size: 'FREE', ok: false, error: 'INSUFFICIENT_STOCK' }] },
    })
    const t = await mount()
    await sellOne(t)
    expect(text(t)).toContain('Nothing was marked sold')
    expect(has(t, 'sell-undo')).toBe(false)
  })

  it('a line the server answers nothing for (replay after a timeout) is shown as NOT sold, not dropped', async () => {
    m.sell.mockResolvedValue({
      data: { bill_id: 'b', replayed: true, lines: [okLine('p1', 'FREE')] }, // p2/M failed first time: no row to replay
    })
    const t = await mount()
    await scan('LS0001')
    await scan('LS0002')
    await press(t, 'size-option-M')
    await press(t, 'sell-open-confirm')
    await press(t, 'sell-confirm')
    const s = text(t)
    expect(s).toContain('1 marked sold')
    expect(s).toContain('1 item could not be updated')
    expect(s).toContain('Blue kurti')
    expect(s).toContain('Not sold')
  })

  it('cannot leave while the sale request is in flight (Close would hide a committed sale)', async () => {
    let release: (v: unknown) => void = () => {}
    m.sell.mockReturnValue(
      new Promise((r) => {
        release = r
      }),
    )
    const t = await mount()
    await scan('LS0001')
    await press(t, 'sell-open-confirm')
    await act(async () => {
      el(t, 'sell-confirm').props.onPress()
    })
    await press(t, 'sell-close')
    expect(router.back).not.toHaveBeenCalled()
    expect(Alert.alert).not.toHaveBeenCalled()
    await act(async () => release({ data: { bill_id: 'b', replayed: false, lines: [okLine('p1', 'FREE')] } }))
    expect(text(t)).toContain('1 marked sold')
  })

  it('a replayed result shows Undo without a countdown (the server owns the 10-minute clock)', async () => {
    m.sell.mockResolvedValue({ data: { bill_id: 'b', replayed: true, lines: [okLine('p1', 'FREE')] } })
    const t = await mount()
    await sellOne(t)
    expect(has(t, 'sell-undo')).toBe(true)
    expect(text(t)).not.toMatch(/left\)/)
  })

  it('a rejected request (4xx) keeps the bill, shows the error, and a retry reuses the same bill id', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    m.sell.mockRejectedValueOnce(new ApiError('VALIDATION_ERROR', 'bad', 422))
    const t = await mount()
    await sellOne(t)
    // iOS drops an Alert raised while a Modal is still dismissing: close first, alert after.
    expect(has(t, 'sell-confirm')).toBe(false)
    expect(m.showError).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(300) // still inside the modal's fade-out
    })
    expect(m.showError).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    expect(m.showError).toHaveBeenCalledTimes(1)
    expect(text(t)).toContain('Pink suit')
    expect(text(t)).not.toContain('marked sold')
    await press(t, 'sell-open-confirm')
    await press(t, 'sell-confirm')
    expect(m.sell).toHaveBeenCalledTimes(2)
    expect(m.sell.mock.calls[1]![0]).toBe(m.sell.mock.calls[0]![0])
    expect(text(t)).toContain('1 marked sold')
  })
})

// F-047 T7: offline confirm queues the bill; offline lookup reads the cached catalog.
describe('SellScreen — offline', () => {
  it('a network failure queues the bill under its bill id and shows the queued state (no Undo)', async () => {
    m.sell.mockRejectedValueOnce(new ApiError('NETWORK_ERROR', 'offline', 0))
    const t = await mount()
    await sellOne(t)
    const sentId = m.sell.mock.calls[0]![0]
    expect(m.enqueue).toHaveBeenCalledWith(
      sentId,
      [{ product_id: 'p1', size: 'FREE', quantity: 1 }],
      { p1: 'Pink suit' },
    )
    expect(text(t)).toContain('Saved on this phone')
    expect(text(t)).toContain('Undo is available only after it syncs')
    expect(has(t, 'sell-undo')).toBe(false)
    expect(m.showError).not.toHaveBeenCalled()
  })

  it('a 4xx is never queued', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    m.sell.mockRejectedValueOnce(new ApiError('FORBIDDEN', 'no', 403))
    const t = await mount()
    await sellOne(t)
    expect(m.enqueue).not.toHaveBeenCalled()
    expect(text(t)).not.toContain('Saved on this phone')
  })

  it('if the bill cannot be saved on the phone it says so and keeps the bill', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    m.sell.mockRejectedValueOnce(new ApiError('NETWORK_ERROR', 'offline', 0))
    m.enqueue.mockResolvedValueOnce(false)
    const t = await mount()
    await sellOne(t)
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(text(t)).not.toContain('Saved on this phone')
    expect(text(t)).toContain('Pink suit')
    expect(m.showError).toHaveBeenCalledTimes(1)
  })

  it('New bill after a queued bill starts clean with a fresh bill id', async () => {
    m.sell.mockRejectedValueOnce(new ApiError('NETWORK_ERROR', 'offline', 0))
    const t = await mount()
    await sellOne(t)
    const queuedId = m.sell.mock.calls[0]![0]
    await press(t, 'sell-new-bill')
    expect(text(t)).not.toContain('Pink suit')
    await sellOne(t)
    expect(m.sell.mock.calls[1]![0]).not.toBe(queuedId)
  })

  it('offline: a SKU in the cached catalog is added without a network call', async () => {
    m.online.value = false
    m.cached.entries = [[['products', 'list'], { data: [p1] }]]
    const t = await mount()
    await scan('LS0001')
    expect(m.list).not.toHaveBeenCalled()
    expect(text(t)).toContain('Pink suit')
  })

  it('offline: a SKU not in the cache is not added as "not found" — it says the phone cannot look it up', async () => {
    m.online.value = false
    const t = await mount()
    await scan('LS0001')
    expect(m.list).not.toHaveBeenCalled()
    expect(text(t)).toContain('not in this phone')
    expect(text(t)).not.toContain('not found')
    expect(has(t, 'sell-open-confirm')).toBe(false)
  })

  it('online: a failed lookup falls back to the cached catalog', async () => {
    m.list.mockRejectedValue(new ApiError('NETWORK_ERROR', 'offline', 0))
    m.cached.entries = [[['products', 'list'], { data: [p1] }]]
    const t = await mount()
    await scan('LS0001')
    expect(text(t)).toContain('Pink suit')
    expect(m.showError).not.toHaveBeenCalled()
  })

  it('online: the network answer wins over a stale cached row', async () => {
    m.cached.entries = [[['products', 'list'], { data: [{ ...p1, name: 'Stale name' }] }]]
    const t = await mount()
    await scan('LS0001')
    expect(text(t)).toContain('Pink suit')
    expect(text(t)).not.toContain('Stale name')
  })
})

describe('SellScreen — undo and new bill', () => {
  it('Undo calls undoSale with the bill id, invalidates products and says stock is restored', async () => {
    const t = await mount()
    await sellOne(t)
    m.invalidate.mockClear()
    await press(t, 'sell-undo')
    expect(m.undoSale).toHaveBeenCalledWith(m.sell.mock.calls[0]![0])
    expect(m.invalidate).toHaveBeenCalledWith({ queryKey: ['products'] })
    expect(text(t)).toContain('Bill undone')
    expect(has(t, 'sell-undo')).toBe(false)
  })

  it('two taps on Undo in one tick undo the bill once', async () => {
    let release: (v: unknown) => void = () => {}
    m.undoSale.mockReturnValue(
      new Promise((r) => {
        release = r
      }),
    )
    const t = await mount()
    await sellOne(t)
    const btn = el(t, 'sell-undo')
    await act(async () => {
      btn.props.onPress()
      btn.props.onPress()
    })
    expect(m.undoSale).toHaveBeenCalledTimes(1)
    await act(async () => release({ data: { bill_id: 'b', undone: true, lines: [] } }))
  })

  it('a 409 UNDO_WINDOW_EXPIRED hides Undo and says the window has passed', async () => {
    m.undoSale.mockRejectedValue(new ApiError('UNDO_WINDOW_EXPIRED', 'late', 409))
    const t = await mount()
    await sellOne(t)
    await press(t, 'sell-undo')
    expect(has(t, 'sell-undo')).toBe(false)
    expect(text(t)).toContain('Undo window has passed')
    expect(m.showError).not.toHaveBeenCalled()
  })

  it('undone:false reads "Already undone"', async () => {
    m.undoSale.mockResolvedValue({ data: { bill_id: 'b', undone: false, lines: [] } })
    const t = await mount()
    await sellOne(t)
    await press(t, 'sell-undo')
    expect(text(t)).toContain('Already undone')
  })

  it('any other undo failure goes through showError and keeps Undo available', async () => {
    m.undoSale.mockRejectedValue(new ApiError('SERVER', 'boom', 500))
    const t = await mount()
    await sellOne(t)
    await press(t, 'sell-undo')
    expect(m.showError).toHaveBeenCalled()
    expect(has(t, 'sell-undo')).toBe(true)
  })

  it('hides Undo once 10 minutes have passed', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    const t = await mount()
    await sellOne(t)
    expect(has(t, 'sell-undo')).toBe(true)
    await act(async () => {
      vi.setSystemTime(Date.now() + 10 * 60 * 1000 + 1000)
      vi.advanceTimersByTime(1000)
    })
    expect(has(t, 'sell-undo')).toBe(false)
  })

  it('New bill clears the list and the next sale uses a NEW bill id (a spent id is never reused)', async () => {
    const t = await mount()
    await sellOne(t)
    await press(t, 'sell-new-bill')
    expect(text(t)).not.toContain('Pink suit')
    await sellOne(t)
    expect(m.sell).toHaveBeenCalledTimes(2)
    expect(m.sell.mock.calls[1]![0]).not.toBe(m.sell.mock.calls[0]![0])
  })

  it('Done leaves the screen', async () => {
    const t = await mount()
    await sellOne(t)
    await press(t, 'sell-done')
    expect(router.back).toHaveBeenCalled()
  })
})

describe('SellScreen — leaving', () => {
  it('Close on an empty bill leaves without asking', async () => {
    const t = await mount()
    await press(t, 'sell-close')
    expect(router.back).toHaveBeenCalled()
    expect(Alert.alert).not.toHaveBeenCalled()
  })

  it('Close with rows asks "Discard this bill?" and only leaves on Discard', async () => {
    const t = await mount()
    await scan('LS0001')
    await press(t, 'sell-close')
    expect(router.back).not.toHaveBeenCalled()
    const [title, , buttons] = (Alert.alert as any).mock.calls[0]
    expect(title).toBe('Discard this bill?')
    const discard = buttons.find((b: any) => b.text === 'Discard')
    await act(async () => discard.onPress())
    expect(router.back).toHaveBeenCalled()
  })
})

describe('Sell entry points (catalog tests render a mock screen, so pin the real files)', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8')

  it('the Catalog header has a Sell button that opens /product/sell, beside the F-025 scan icon', () => {
    const src = read('../../app/(tabs)/catalog.tsx')
    expect(src).toContain("router.push('/product/sell')")
    expect(src).toContain("router.push('/product/scan')") // single scan stays
    expect(src).toMatch(/accessibilityLabel="Sell items: scan and mark several articles sold"/)
  })

  it('Home has a "Sell items" shortcut with no staffCan gate (owner, manager and salesperson may sell)', () => {
    const src = read('../../app/(tabs)/index.tsx')
    expect(src).toContain("router.push('/product/sell')")
    const at = src.indexOf("router.push('/product/sell')")
    // the 300 chars before the push hold the tile's opening; it must not sit inside a role gate
    expect(src.slice(Math.max(0, at - 300), at)).not.toMatch(/&&\s*\(\s*<QuickAction/)
    expect(src.slice(Math.max(0, at - 300), at)).toContain('label="Sell items"')
  })
})

describe('SellScreen — source pins', () => {
  const src = readFileSync(resolve(__dirname, '../../app/product/sell.tsx'), 'utf8')
  it('wraps the screen in KeyboardScreen (RC-116/042: it hosts a TextInput via SkuScanner)', () => {
    expect(src).toMatch(/<KeyboardScreen/)
  })
  it('embeds the scanner in compact mode', () => {
    expect(src).toMatch(/<SkuScanner[\s\S]*?compact/)
  })
  it('has no swallowed errors (RC-136 shape)', () => {
    expect(src).not.toMatch(/catch\s*(\(\w*\))?\s*\{\s*\}/)
    expect(src).not.toMatch(/\.catch\(\(\)\s*=>\s*\{\s*\}\)/)
  })
})
