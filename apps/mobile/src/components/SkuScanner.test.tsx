import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react-test-renderer'
import { render } from '../test/__mocks__/testing-library'

// F-047 T5 — shared camera + manual-SKU block. The debounce (same code within
// 1.5 s ignored) and the one-at-a-time guard are pinned here; both must be
// refs, not state (RC-015/135 shape: a second event in the same tick reads
// stale state).
vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).__DEV__ = true
})

const m = vi.hoisted(() => ({
  permission: { granted: true } as { granted: boolean } | null,
  requestPermission: vi.fn(),
  cameraProps: {} as Record<string, any>,
}))

vi.mock('expo-camera', () => ({
  CameraView: (props: Record<string, any>) => {
    m.cameraProps = props
    return null
  },
  useCameraPermissions: () => [m.permission, m.requestPermission],
}))

import { SkuScanner } from './SkuScanner'

const scan = (data: string) => m.cameraProps.onBarcodeScanned({ data })

function setup(onSku = vi.fn(), extra: Record<string, unknown> = {}) {
  const tree = render(<SkuScanner onSku={onSku} onClose={vi.fn()} {...extra} />)
  return { tree, onSku }
}

describe('SkuScanner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    m.permission = { granted: true }
    m.cameraProps = {}
  })
  afterEach(() => vi.useRealTimers())

  it('passes a scanned code to onSku', async () => {
    const { onSku } = setup()
    await act(async () => scan('LS0042'))
    expect(onSku).toHaveBeenCalledWith('LS0042')
  })

  it('ignores the same code scanned again within 1.5 s', async () => {
    const { onSku } = setup()
    await act(async () => scan('LS0042'))
    vi.advanceTimersByTime(1000)
    await act(async () => scan('LS0042'))
    expect(onSku).toHaveBeenCalledTimes(1)
  })

  it('accepts the same code again after 1.5 s', async () => {
    const { onSku } = setup()
    await act(async () => scan('LS0042'))
    vi.advanceTimersByTime(1600)
    await act(async () => scan('LS0042'))
    expect(onSku).toHaveBeenCalledTimes(2)
  })

  it('does not debounce a different code', async () => {
    const { onSku } = setup()
    await act(async () => scan('LS0042'))
    await act(async () => scan('LS0043'))
    expect(onSku).toHaveBeenCalledTimes(2)
  })

  it('lets only one of two scan events in the same tick through while onSku is pending', async () => {
    let release: () => void = () => {}
    const onSku = vi.fn(
      () =>
        new Promise<void>((r) => {
          release = r
        }),
    )
    setup(onSku)
    await act(async () => {
      scan('LS0001')
      scan('LS0002')
    })
    expect(onSku).toHaveBeenCalledTimes(1)
    await act(async () => release())
    await act(async () => scan('LS0002'))
    expect(onSku).toHaveBeenCalledTimes(2)
  })

  it('releases the busy guard when onSku rejects', async () => {
    const onSku = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(undefined)
    setup(onSku)
    await act(async () => scan('LS0001'))
    await act(async () => scan('LS0002'))
    expect(onSku).toHaveBeenCalledTimes(2)
  })

  it('does not debounce a manual submit of the same code', async () => {
    const { tree, onSku } = setup()
    const input = () => tree.getByTestId('sku-manual-input') as any
    await act(async () => input().props.onChangeText('LS0042'))
    await act(async () => input().props.onSubmitEditing())
    await act(async () => input().props.onSubmitEditing())
    expect(onSku).toHaveBeenCalledTimes(2)
    expect(onSku).toHaveBeenCalledWith('LS0042')
  })

  it('ignores an empty manual submit', async () => {
    const { tree, onSku } = setup()
    await act(async () => (tree.getByTestId('sku-manual-input') as any).props.onSubmitEditing())
    expect(onSku).not.toHaveBeenCalled()
  })

  it('stops the camera while paused', () => {
    setup(vi.fn(), { paused: true })
    expect(m.cameraProps.active).toBe(false)
  })

  it('shows the Allow Camera button when permission is denied', () => {
    m.permission = { granted: false }
    const { tree } = setup()
    expect(tree.getByTestId('sku-permission-denied')).toBeTruthy()
    expect(m.cameraProps.active).toBeUndefined() // camera not rendered
  })
})
