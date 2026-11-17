import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react-test-renderer'
import { render } from '../../src/test/__mocks__/testing-library'

vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).__DEV__ = true
})
import { GoogleReviewsTab } from '../../src/components/GoogleReviewsTab'

const REPLY = 'Thank you for visiting!'
const review = {
  id: 'rev1',
  reviewer_name: 'Asha',
  star_rating: 5,
  comment: 'Lovely suits',
  reply: { comment: REPLY, updated_at: '2026-11-01T00:00:00Z' },
}

vi.mock('../../src/lib/api', () => ({
  googleBusinessApi: { reviews: vi.fn(), reply: vi.fn(), draftReply: vi.fn() },
}))
vi.mock('../../src/lib/errors', () => ({ showError: vi.fn() }))
vi.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: () => ({
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: vi.fn(),
    data: { pages: [{ data: { summary: { review_count: 1 }, reviews: [review] } }] },
  }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

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

type Tree = ReturnType<typeof render>
const root = (t: Tree) => t.toTree() as TreeNode

const byLabel = (t: Tree, label: string) =>
  collectNodes(root(t), (n) => typeof n.props?.onPress === 'function' && n.props.accessibilityLabel === label)[0]
const byText = (t: Tree, text: string) =>
  collectNodes(
    root(t),
    (n) =>
      typeof n.props?.onPress === 'function' &&
      n.props.accessibilityLabel === undefined &&
      collectText(n).includes(text),
  )[0]
const box = (t: Tree) =>
  collectNodes(root(t), (n) => n.props?.accessibilityLabel === 'Your reply to this review')[0]

const press = (n: TreeNode | undefined) =>
  act(() => {
    ;(n?.props.onPress as unknown as () => void)()
  })

describe('Google reviews tab: reply editor (audit minor D)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('Cancel drops the abandoned text: reopening shows the current reply, not the old draft', () => {
    const t = render(<GoogleReviewsTab />)
    press(byLabel(t, 'Edit your reply'))
    expect(box(t)?.props.value).toBe(REPLY)

    act(() => {
      ;(box(t)?.props.onChangeText as unknown as (s: string) => void)('half-typed, abandoned')
    })
    expect(box(t)?.props.value).toBe('half-typed, abandoned')

    press(byText(t, 'Cancel'))
    press(byLabel(t, 'Edit your reply'))
    expect(box(t)?.props.value).toBe(REPLY)
  })
})
