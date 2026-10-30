/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react-test-renderer'
import { render } from '../../src/test/__mocks__/testing-library'

// T3.5 g — app/product/bulk-onboard.tsx startup loads (racks + catalogued count).
// A failed load used to be swallowed: the card then showed a wrong count as if
// it were true, or the rack picker was silently empty.
vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).__DEV__ = true
})

import BulkOnboardScreen from '../../app/product/bulk-onboard'
import { ApiError } from '../../src/lib/api/api-error'
import { useLocalSearchParams } from 'expo-router'

const m = vi.hoisted(() => ({ getSections: vi.fn(), getStats: vi.fn(), createSection: vi.fn() }))

vi.mock('../../src/lib/api', () => ({
  retailerApi: { getSections: m.getSections, getStats: m.getStats, createSection: m.createSection },
  catalogImportApi: {},
  uploadImageToR2: vi.fn(),
  prepareImageForUpload: vi.fn(),
}))
vi.mock('../../src/lib/theme', () => ({
  useTheme: () => ({ primaryColor: '#000', colors: { rust: { 500: '#f00' }, sand: { 600: '#666', 700: '#555' } } }),
}))
vi.mock('../../src/lib/safe-area', () => ({
  useScreenInsets: () => ({ insets: { top: 0, bottom: 0, left: 0, right: 0 }, headerPaddingTop: 0 }),
}))
vi.mock('expo-image-picker', () => ({}))
vi.mock('expo-image-manipulator', () => ({}))
vi.mock('expo-image', () => ({ Image: () => null }))

type TreeNode = { type: unknown; props: Record<string, any>; children?: (TreeNode | string)[]; rendered?: TreeNode }
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
type Tree = ReturnType<typeof render>
const text = (t: Tree) => collectText(t.toTree() as TreeNode).join('')

const racks = [
  { id: 's1', name: 'Rack A', type: 'rack' },
  { id: 's2', name: 'Rack B', type: 'rack' },
]

const mount = async () => {
  let tree!: Tree
  await act(async () => {
    tree = render(<BulkOnboardScreen />)
    await new Promise((r) => setTimeout(r, 0))
  })
  return tree
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useLocalSearchParams).mockReturnValue({})
  m.getSections.mockResolvedValue({ data: racks })
  m.getStats.mockResolvedValue({ data: { total_products_available: 120 } })
})

describe('bulk-onboard startup loads (T3.5 g)', () => {
  it('shows the catalogued count and the racks, and no banner, when both loads succeed', async () => {
    const t = await mount()
    const s = text(t)
    expect(s).toContain('120')
    expect(s).toContain('Rack A')
    expect(s).toContain('Rack B')
    expect(s).not.toContain('Could not load')
  })

  it('a failed count load says so instead of showing 0 as the count', async () => {
    m.getStats.mockRejectedValue(new ApiError('SERVER', 'boom', 500))
    const t = await mount()
    expect(text(t)).toContain('Could not load your catalogue count')
  })

  it('a failed rack load says so instead of an empty picker', async () => {
    m.getSections.mockRejectedValue(new ApiError('NETWORK_ERROR', 'offline', 0))
    const t = await mount()
    expect(text(t)).toContain('Could not load your racks')
  })

  it('a 4xx on the rack load shows the server reason', async () => {
    m.getSections.mockRejectedValue(new ApiError('FORBIDDEN', 'Racks are not on your plan', 403))
    const t = await mount()
    expect(text(t)).toContain('Racks are not on your plan')
  })

  it('a 4xx on the count load shows the server reason, a 5xx the generic text', async () => {
    m.getStats.mockRejectedValue(new ApiError('FORBIDDEN', 'Plan expired', 403))
    let t = await mount()
    expect(text(t)).toContain('Plan expired')
    expect(text(t)).not.toContain('boom')

    m.getStats.mockRejectedValue(new ApiError('SERVER', 'boom', 500))
    t = await mount()
    expect(text(t)).toContain('Could not load your catalogue count')
    expect(text(t)).not.toContain('boom')
  })
})
