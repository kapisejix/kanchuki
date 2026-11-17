import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react-test-renderer'
import { render } from '../../src/test/__mocks__/testing-library'

// T5 gaps — app/social/ai-design.tsx: output format, overlay and prompt reuse reach the API call.
vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).__DEV__ = true
})

import AiDesignScreen from '../../app/social/ai-design'

const apiMock = vi.hoisted(() => ({
  aiDesignsApi: { create: vi.fn(), get: vi.fn(), list: vi.fn() },
}))
const ui = vi.hoisted(() => ({ pick: null as null | (() => void) }))

vi.mock('../../src/lib/api', () => apiMock)
vi.mock('../../src/lib/theme', () => ({ useTheme: () => ({ primaryColor: '#231F48' }) }))
vi.mock('../../src/components/ReportAiContent', () => ({ ReportAiContent: () => null }))
vi.mock('../../src/components/social', async () => {
  const React = await import('react')
  return {
    ProductGridPicker: ({ onToggle }: { onToggle: (p: unknown) => void }) => {
      ui.pick = () => onToggle({ id: 'p1', name: 'Suit' })
      return React.createElement('Stub')
    },
  }
})
vi.mock('@tanstack/react-query', () => ({
  useMutation: (o: { mutationFn: () => unknown; onSuccess?: (r: unknown) => void }) => ({
    mutate: () => void Promise.resolve(o.mutationFn()).then((r) => o.onSuccess?.(r)),
    isPending: false,
  }),
  useQuery: ({ queryKey }: { queryKey: unknown[] }) =>
    queryKey[1] === 'mine'
      ? { data: { data: [{ id: 'd1', prompt: 'warm diwali diyas', image_url: 'https://x/d1.jpg' }] } }
      : { data: undefined, isError: false },
  useQueryClient: () => ({ removeQueries: vi.fn() }),
}))

type TreeNode = { props: Record<string, never>; children?: (TreeNode | string)[]; rendered?: TreeNode }
type Tree = ReturnType<typeof render>
function find(node: TreeNode | TreeNode[] | string | null | undefined, pred: (n: TreeNode) => boolean, out: TreeNode[] = []): TreeNode[] {
  if (!node || typeof node === 'string') return out
  if (Array.isArray(node)) {
    for (const c of node) find(c, pred, out)
    return out
  }
  if (pred(node)) out.push(node)
  find(node.children as TreeNode[] | undefined, pred, out)
  if (node.rendered) find(node.rendered, pred, out)
  return out
}
const byLabel = (t: Tree, label: string) =>
  find(t.toTree() as TreeNode, (n) => typeof n.props?.onPress === 'function' && n.props.accessibilityLabel === label)[0]
    ?.props as unknown as { onPress: () => unknown; disabled?: boolean; accessibilityState?: { disabled?: boolean } } | undefined
const press = async (t: Tree, label: string) => {
  const h = byLabel(t, label)
  expect(h, label).toBeDefined()
  await act(async () => {
    await h!.onPress()
  })
}
const typePrompt = async (t: Tree, value: string) => {
  const n = find(t.toTree() as TreeNode, (x) => x.props?.accessibilityLabel === 'Describe the design' && typeof x.props?.onChangeText === 'function')[0]
  await act(async () => {
    ;(n!.props as unknown as { onChangeText: (v: string) => void }).onChangeText(value)
  })
}

let mounted: Tree[] = []
const mount = async () => {
  const t = render(<AiDesignScreen />)
  mounted.push(t)
  await act(async () => {})
  await act(async () => {
    ui.pick?.()
  })
  await typePrompt(t, 'soft diya glow, festive bokeh')
  return t
}
const lastCreate = () => vi.mocked(apiMock.aiDesignsApi.create).mock.calls.at(-1)![0]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiMock.aiDesignsApi.create).mockResolvedValue({ data: { id: 'j1', status: 'PENDING' } } as never)
})
afterEach(() => {
  for (const t of mounted) t.unmount()
  mounted = []
})

describe('AI design screen — finishing options', () => {
  it('sends ORIGINAL and no overlay by default', async () => {
    const t = await mount()
    await press(t, 'Make AI design')
    expect(lastCreate()).toMatchObject({ product_id: 'p1', format: 'ORIGINAL', overlay: null })
  })

  it('sends the chosen format', async () => {
    const t = await mount()
    await press(t, 'Story')
    await press(t, 'Make AI design')
    expect(lastCreate()).toMatchObject({ format: 'STORY', overlay: null })
  })

  it('an overlay is sent and the format chips are disabled', async () => {
    const t = await mount()
    await press(t, 'New arrival')
    expect(byLabel(t, 'Story')?.accessibilityState?.disabled).toBe(true)
    await press(t, 'Make AI design')
    expect(lastCreate()).toMatchObject({ overlay: 'new_arrival' })
  })

  it('"reuse a prompt" fills the prompt from a past design', async () => {
    const t = await mount()
    await press(t, 'warm diwali diyas')
    await press(t, 'Make AI design')
    expect(lastCreate()).toMatchObject({ prompt: 'warm diwali diyas' })
  })
})

// Only host elements, so a wrapper component and the element it renders count once.
const isSpinner = (n: TreeNode) => {
  const x = n as unknown as { nodeType?: string; type?: unknown }
  return x.nodeType === 'host' && x.type === 'ActivityIndicator'
}

describe('AI design screen — waiting state', () => {
  it('shows exactly one spinner while the design is being made', async () => {
    const t = await mount()
    expect(find(t.toTree() as TreeNode, isSpinner)).toHaveLength(0)
    await press(t, 'Make AI design')
    await act(async () => {})
    expect(find(t.toTree() as TreeNode, isSpinner)).toHaveLength(1)
  })
})

describe('AI design screen — finish chips look like app buttons', () => {
  const styleOf = (n: TreeNode) => {
    const s = (n.props as unknown as { style?: unknown }).style
    return Object.assign({}, ...(Array.isArray(s) ? s.flat(3) : [s]).filter(Boolean)) as Record<string, unknown>
  }

  it('every finish chip has a 44pt touch target and a rounded 16 shape', async () => {
    const t = await mount()
    for (const label of ['Original', 'Square', 'None', 'Price strip']) {
      const pressable = find(
        t.toTree() as TreeNode,
        (n) => n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function',
      )[0]
      const inner = find(pressable, (n) => styleOf(n).minHeight === 44)[0]
      expect(inner, label).toBeDefined()
      expect(styleOf(inner!).borderRadius, label).toBe(16)
    }
  })

  it('an inactive chip is a white button with the app border, the active one has no white fill', async () => {
    const t = await mount()
    const inactive = find(
      t.toTree() as TreeNode,
      (n) => n.props?.accessibilityLabel === 'Square' && typeof n.props?.onPress === 'function',
    )[0]
    const white = find(inactive, (n) => styleOf(n).backgroundColor === '#FFFFFF')[0]
    expect(styleOf(white!).borderColor).toBe('#E0E1F6')
    const active = find(
      t.toTree() as TreeNode,
      (n) => n.props?.accessibilityLabel === 'Original' && typeof n.props?.onPress === 'function',
    )[0]
    expect(find(active, (n) => styleOf(n).backgroundColor === '#FFFFFF')).toHaveLength(0)
  })
})
