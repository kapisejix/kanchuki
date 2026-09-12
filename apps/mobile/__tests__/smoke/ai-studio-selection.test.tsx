import type { ComponentProps } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react-test-renderer'
import { render } from '../../src/test/__mocks__/testing-library'
import { ProductStudioModal } from '../../src/components/product-detail/ProductStudioModal'

// ── Mocks ──────────────────────────────────────────────────────────
// @kanchuki/shared's global mock (src/test/setup.ts) predates AI Studio and
// carries neither of the two symbols the modal imports, so override it here
// with exactly what the component (and nothing else in this graph) needs.
vi.mock('@kanchuki/shared', () => ({
  STUDIO_CREDITS_PER_IMAGE: 4,
  demographicForCategory: () => 'womens',
}))

// The api barrel pulls in expo-file-system (unmockable native module), so the
// whole barrel is replaced — same approach as __tests__/smoke/rc-screens.test.tsx.
vi.mock('../../src/lib/api', () => ({
  productApi: { getStudioStyles: vi.fn() },
}))

// Controllable style feed. Each render re-reads `studio.styles`, which is
// exactly the real-world condition RC-017 was about: React Query hands the
// component a brand-new array on every render/refetch.
const studio = vi.hoisted(() => ({ styles: [] as unknown[] }))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: { data: studio.styles },
    isLoading: false,
    refetch: vi.fn(),
    isRefetching: false,
  }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), clear: vi.fn() }),
}))

// ── Tree helpers (same pattern as rc-screens.test.tsx) ─────────────

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

function findPressableByText(tree: ReturnType<typeof render>, text: string): TreeNode | undefined {
  return collectNodes(
    tree.toTree() as TreeNode,
    (n) =>
      typeof n.props?.onPress === 'function' &&
      n.props.accessibilityLabel === undefined &&
      collectText(n as TreeNode).includes(text),
  )[0]
}

function findByLabel(tree: ReturnType<typeof render>, label: string): TreeNode | undefined {
  return collectNodes(
    tree.toTree() as TreeNode,
    (n) => typeof n.props?.onPress === 'function' && n.props.accessibilityLabel === label,
  )[0]
}

/** The className of the style row / tab whose subtree contains `text`. */
function classNameOf(tree: ReturnType<typeof render>, text: string): string {
  const node = findPressableByText(tree, text)
  expect(node, `no pressable found for "${text}"`).toBeTruthy()
  return String(node!.props.className ?? '')
}

const SELECTED_ROW = 'border-fuchsia-600'
const UNSELECTED_ROW = 'border-sand-100'

// ── Fixtures ───────────────────────────────────────────────────────

const productStyles = [
  {
    slug: 'studio-white',
    label: 'Studio White',
    description: 'Clean seamless studio background',
    tab: 'PRODUCT',
    audience: [],
    thumbnail_url: null,
  },
  {
    slug: 'cafe-street',
    label: 'Cafe Street',
    description: 'Warm cafe-lit editorial look',
    tab: 'PRODUCT',
    audience: [],
    thumbnail_url: null,
  },
]

const modelStyles = [
  {
    slug: 'royal-rajput',
    label: 'Royal Rajput',
    description: 'Palace courtyard with model',
    tab: 'MODEL',
    audience: [],
    thumbnail_url: null,
  },
]

type StudioProps = ComponentProps<typeof ProductStudioModal>

const baseProps = {
  visible: true,
  onClose: vi.fn(),
  onStartShoot: vi.fn(),
  starting: false,
  quota: { unlimited: true, remaining: 999 },
  primaryColor: '#231F48',
  colors: { sand: { 400: '#B8B8B8', 500: '#969696', 600: '#737373' }, ink: { 800: '#0B1322' } },
  status: null,
  progress: 0,
  etaMs: 0,
  error: null,
  upgradeRequired: false,
  result: null,
  onRetry: vi.fn(),
  onUseResult: vi.fn(),
  onPostToSocial: vi.fn(),
  productCategory: 'Saree',
  productName: 'Banarasi Silk Saree',
} satisfies StudioProps

function makeModal(overrides: Partial<StudioProps> = {}) {
  return <ProductStudioModal {...baseProps} {...overrides} />
}

beforeEach(() => {
  vi.clearAllMocks()
  studio.styles = [...productStyles, ...modelStyles]
})

// ── Bug 1: the tapped tab must look selected ───────────────────────

describe('AI Studio tab highlight', () => {
  it('marks the active tab and moves the mark when the other tab is tapped', () => {
    const tree = render(makeModal())

    // Product Only is active on open.
    expect(classNameOf(tree, 'Product Only')).toContain('bg-white')
    expect(classNameOf(tree, 'Models')).not.toContain('bg-white')

    act(() => {
      ;(findPressableByText(tree, 'Models')!.props.onPress as () => void)()
    })

    // Regression: the tap must repaint the highlight onto Models.
    expect(classNameOf(tree, 'Models')).toContain('bg-white')
    expect(classNameOf(tree, 'Product Only')).not.toContain('bg-white')
    // shadow-sm, not the Tailwind-v4-only `shadow-xs` that never rendered.
    expect(classNameOf(tree, 'Models')).toContain('shadow-sm')
  })
})

// ── RC-017: the pick must survive a re-render ──────────────────────

describe('AI Studio style selection (RC-017)', () => {
  it('keeps the tapped style selected when the style list refetches', () => {
    const tree = render(makeModal())

    // Fallback: first row of the active tab is selected before any tap.
    expect(classNameOf(tree, 'Studio White')).toContain(SELECTED_ROW)

    act(() => {
      ;(findPressableByText(tree, 'Cafe Street')!.props.onPress as () => void)()
    })
    expect(classNameOf(tree, 'Cafe Street')).toContain(SELECTED_ROW)
    expect(classNameOf(tree, 'Studio White')).toContain(UNSELECTED_ROW)

    // A refetch hands over a brand-new array, here with a style the plan just
    // unlocked. The old effect keyed off `styles.length`, so the new length
    // re-fired it and silently snapped the pick back to row 0 — the retailer
    // then generated with a style they never chose.
    studio.styles = [
      ...productStyles,
      {
        slug: 'marble-hall',
        label: 'Marble Hall',
        description: 'Grand marble hall backdrop',
        tab: 'PRODUCT',
        audience: [],
        thumbnail_url: null,
      },
      ...modelStyles,
    ]
    tree.rerender(makeModal())

    expect(classNameOf(tree, 'Cafe Street')).toContain(SELECTED_ROW)
    expect(classNameOf(tree, 'Studio White')).toContain(UNSELECTED_ROW)
  })

  it('generates with the tapped style, not the first row', () => {
    const tree = render(makeModal())

    act(() => {
      ;(findPressableByText(tree, 'Cafe Street')!.props.onPress as () => void)()
    })
    act(() => {
      ;(findByLabel(tree, 'Generate Studio Shot (10-30s)')!.props.onPress as () => void)()
    })

    expect(baseProps.onStartShoot).toHaveBeenCalledWith('cafe-street')
  })

  it('starts a fresh pick on the first style of the newly selected tab', () => {
    const tree = render(makeModal())

    act(() => {
      ;(findPressableByText(tree, 'Cafe Street')!.props.onPress as () => void)()
    })
    act(() => {
      ;(findPressableByText(tree, 'Models')!.props.onPress as () => void)()
    })

    expect(classNameOf(tree, 'Royal Rajput')).toContain(SELECTED_ROW)

    act(() => {
      ;(findByLabel(tree, 'Generate Studio Shot (10-30s)')!.props.onPress as () => void)()
    })
    expect(baseProps.onStartShoot).toHaveBeenCalledWith('royal-rajput')
  })

  it('falls back cleanly when the picked style disappears from the list', () => {
    const tree = render(makeModal())

    act(() => {
      ;(findPressableByText(tree, 'Cafe Street')!.props.onPress as () => void)()
    })

    // Plan/demographic change drops the picked style from the feed.
    studio.styles = [productStyles[0]]
    tree.rerender(makeModal())

    expect(classNameOf(tree, 'Studio White')).toContain(SELECTED_ROW)

    act(() => {
      ;(findByLabel(tree, 'Generate Studio Shot (10-30s)')!.props.onPress as () => void)()
    })
    // No stale slug left behind.
    expect(baseProps.onStartShoot).toHaveBeenCalledWith('studio-white')
  })
})
