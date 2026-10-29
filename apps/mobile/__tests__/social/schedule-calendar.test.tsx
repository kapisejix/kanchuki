import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react-test-renderer'
import { Alert } from 'react-native'
import { render } from '../../src/test/__mocks__/testing-library'

// T3.2-a #7 — app/social/schedule/[id].tsx (F-043 calendar review / confirm).
// Only lib/api/client.request is mocked, so the real scheduleApi runs and each
// URL / method / body the screen sends is pinned.
vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).__DEV__ = true
})

import ScheduleCalendarScreen from '../../app/social/schedule/[id]'
import { ApiError } from '../../src/lib/api/api-error'
import { formatIst } from '../../src/lib/api/schedule'
import { router, useLocalSearchParams } from 'expo-router'

const requestMock = vi.hoisted(() => vi.fn())
const apiMock = vi.hoisted(() => ({ socialApi: { suggestCaption: vi.fn() } }))
const queryStore = vi.hoisted(() => new Map<string, unknown>())
const authState = vi.hoisted(() => ({ staffRole: null as string | null }))
const rq = vi.hoisted(() => ({ invalidate: vi.fn(), refetch: vi.fn(), isError: false }))

vi.mock('../../src/lib/api/client', () => ({ request: requestMock }))
vi.mock('../../src/lib/api', () => apiMock)
vi.mock('../../src/lib/auth-context', () => ({
  useAuth: () => ({ staffRole: authState.staffRole }),
}))
vi.mock('../../src/components/social', async () => {
  const React = await import('react')
  return {
    ProductGridPicker: ({ onToggle }: { onToggle: (p: unknown) => void }) =>
      React.createElement('Stub', {
        accessibilityLabel: 'pick pX',
        onPress: () => onToggle({ id: 'pX', name: 'Other', sku: null, primary_photo_url: null, price_min: null, price_max: null }),
      }),
  }
})
vi.mock('@tanstack/react-query', async () => {
  const React = await import('react')
  return {
    useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
      data: queryStore.get(JSON.stringify(queryKey)),
      isLoading: false,
      isError: rq.isError,
      refetch: rq.refetch,
    }),
    // isPending is real state: true from mutate() until the mutation settles and its callbacks ran.
    useMutation: ({
      mutationFn,
      onSuccess,
      onError,
    }: {
      mutationFn: (v: never) => unknown
      onSuccess?: (r: unknown, v: unknown) => void
      onError?: (e: unknown) => void
    }) => {
      const [isPending, setPending] = React.useState(false)
      return {
        mutate: (v: never) => {
          setPending(true)
          void (async () => mutationFn(v))()
            .then(
              (r) => onSuccess?.(r, v),
              (e) => onError?.(e),
            )
            .finally(() => setPending(false))
        },
        isPending,
      }
    },
    useQueryClient: () => ({ invalidateQueries: rq.invalidate }),
  }
})

// ── Tree helpers ───────────────────────────────────────────────────
type TreeNode = { type: unknown; props: Record<string, never>; children?: (TreeNode | string)[]; rendered?: TreeNode }
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
type Handler = { onPress: () => unknown; disabled?: boolean }
const nodes = (t: Tree, pred: (n: TreeNode) => boolean) => collectNodes(t.toTree() as TreeNode, pred)
const hasPress = (n: TreeNode) => typeof n.props?.onPress === 'function'
const byLabel = (t: Tree, label: string) =>
  nodes(t, (n) => hasPress(n) && n.props.accessibilityLabel === label)[0]?.props as unknown as Handler | undefined
// Unlabelled + unstated pressables (the style-modal options), vs chips which carry accessibilityState.
const option = (t: Tree, s: string) =>
  nodes(t, (n) => hasPress(n) && n.props.accessibilityLabel === undefined && n.props.accessibilityState === undefined && collectText(n).includes(s))[0]
    ?.props as unknown as Handler | undefined
const chip = (t: Tree, s: string) =>
  nodes(t, (n) => hasPress(n) && n.props.accessibilityLabel === undefined && n.props.accessibilityState !== undefined && collectText(n).includes(s))[0]
    ?.props as unknown as Handler | undefined
// Host <Modal>s in render order: [style modal, swap modal]. The RN mock renders children even when closed.
const modalVisible = (t: Tree, i: number) =>
  nodes(t, (n) => n.type === 'Modal' && 'visible' in (n.props as object))[i]?.props.visible as unknown as boolean
const caption = (t: Tree) => nodes(t, (n) => n.props?.accessibilityLabel === 'Post caption' && typeof n.props?.onChangeText === 'function')[0]
const captionValue = (t: Tree) => caption(t).props.value as unknown as string
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const tap = async (h: Handler | undefined, what: string) => {
  expect(h, what).toBeDefined()
  await act(async () => {
    await h!.onPress()
    await new Promise((r) => setTimeout(r, 0))
  })
}
const press = (t: Tree, label: string) => tap(byLabel(t, label), label)
const type = async (t: Tree, v: string) => {
  await act(async () => {
    ;(caption(t).props as unknown as { onChangeText: (s: string) => void }).onChangeText(v)
  })
}

// ── Fixtures ──────────────────────────────────────────────────────
const NOV2 = '2026-11-02T14:00:00Z'
const NOV2_LATE = '2026-11-02T15:00:00Z'
const NOV3 = '2026-11-03T14:00:00Z'
const item = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  product_id: `prod-${id}`,
  photo_id: 'ph1',
  image_level: 'ORIGINAL',
  template_id: null,
  resolved_image_url: null,
  product: { name: 'Red Suit', photos: [{ id: 'ph1', url: 'https://x/1.jpg', is_primary: true }] },
  ...over,
})
const post = (id: string, at: string, over: Record<string, unknown> = {}) => ({
  id,
  plan_id: 'plan1',
  scheduled_at: at,
  caption: `Caption ${id}`,
  status: 'READY',
  attempts: 0,
  error: null,
  items: [item(`it-${id}`)],
  ...over,
})
const plan = (over: Record<string, unknown> = {}) => ({
  id: 'plan1',
  platform: 'FACEBOOK',
  post_type: 'CAROUSEL',
  status: 'DRAFT',
  pause_reason: null,
  post_time: '19:30',
  weekdays: [],
  horizon_days: 7,
  cover_style: null,
  rotation_pool: [] as string[],
  posts: [post('p1', NOV2)],
  ...over,
})
const calls = () => requestMock.mock.calls.map(([path, opts]) => ({ path: path as string, method: (opts?.method ?? 'GET') as string, body: opts?.body ? JSON.parse(opts.body as string) : undefined }))
const findCall = (re: RegExp, method: string) => calls().find((c) => re.test(c.path) && c.method === method)

let mounted: Tree[] = []
async function mount(p: Record<string, unknown> = {}) {
  queryStore.set(JSON.stringify(['social', 'schedule', 'plan', 'plan1']), { data: plan(p) })
  const t = render(<ScheduleCalendarScreen />)
  mounted.push(t)
  await flush()
  return t
}

beforeEach(() => {
  vi.clearAllMocks()
  queryStore.clear()
  authState.staffRole = null
  rq.isError = false
  vi.mocked(useLocalSearchParams).mockReturnValue({ id: 'plan1' })
  requestMock.mockResolvedValue({ data: {} })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  for (const t of mounted) t.unmount()
  mounted = []
})

describe('schedule calendar (T3.2-a #7)', () => {
  it('a load error shows the message and Retry refetches', async () => {
    rq.isError = true
    const t = await mount()
    expect(text(t)).toContain("Couldn't load this plan.")
    await press(t, 'Retry')
    expect(rq.refetch).toHaveBeenCalledTimes(1)
  })

  it('DRAFT header, IST day grouping in date order, SKIPPED hidden and not counted', async () => {
    const t = await mount({
      posts: [post('p3', NOV3), post('p1', NOV2), post('p2', NOV2_LATE, { status: 'SKIPPED' })],
    })
    const s = text(t)
    expect(s).toContain('Review calendar')
    expect(s).toContain('not posting yet')
    expect(s).toContain('2 posts')
    expect(s).not.toContain('Skipped')
    const d2 = formatIst(NOV2).split(' · ')[0]
    const d3 = formatIst(NOV3).split(' · ')[0]
    expect(s.indexOf(d2)).toBeGreaterThan(-1)
    expect(s.indexOf(d2)).toBeLessThan(s.indexOf(d3))
    expect(byLabel(t, 'Confirm 2 posts')).toBeDefined()
  })

  it('a plan with every post skipped says so and cannot be confirmed', async () => {
    const t = await mount({ posts: [post('p1', NOV2, { status: 'SKIPPED' })] })
    expect(text(t)).toContain('No posts left in this plan.')
    expect(byLabel(t, 'Confirm 0 posts')!.disabled).toBe(true)
  })

  describe('confirm', () => {
    it('POSTs the confirm route with no body, reports the counts, and OK returns to the schedule list', async () => {
      requestMock.mockResolvedValue({ data: { plan_id: 'plan1', posts: 2, slides_original: 5, slides_templated: 3 } })
      const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {})
      const t = await mount()
      await press(t, 'Confirm 1 posts')
      const c = findCall(/\/plans\/plan1\/confirm$/, 'POST')
      expect(c).toBeDefined()
      expect(c!.body).toBeUndefined()
      expect(rq.invalidate).toHaveBeenCalledWith({ queryKey: ['social', 'schedule'] })
      expect(alertSpy).toHaveBeenCalledWith('Plan confirmed', '2 posts scheduled — 5 original photos, 3 styled.', expect.any(Array))
      const buttons = alertSpy.mock.calls[0][2] as { onPress: () => void }[]
      buttons[0].onPress()
      expect(router.replace).toHaveBeenCalledWith('/social/schedule')
    })

    it('omits the styled clause when none were templated', async () => {
      requestMock.mockResolvedValue({ data: { plan_id: 'plan1', posts: 1, slides_original: 2, slides_templated: 0 } })
      const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {})
      const t = await mount()
      await press(t, 'Confirm 1 posts')
      expect(alertSpy.mock.calls[0][1]).toBe('1 posts scheduled — 2 original photos.')
    })

    it.each([
      ['4xx shows the server reason', new ApiError('LIMIT', 'Plan limit reached', 403), 'Plan limit reached'],
      ['5xx shows the fallback', new ApiError('X', 'pg exploded', 500), 'Could not confirm the plan. Your plan limit may be reached or the account needs reconnecting.'],
    ])('failure: %s', async (_n, err, shown) => {
      requestMock.mockRejectedValue(err)
      const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {})
      const t = await mount()
      await press(t, 'Confirm 1 posts')
      expect(alertSpy).toHaveBeenCalledWith('Error', shown, undefined)
      expect(router.replace).not.toHaveBeenCalled()
    })

    // FINDING (not changed): Confirm sends only the plan id. A caption typed but not saved with
    // "Save caption" is local state and is lost when the plan goes live.
    it('an unsaved caption edit is NOT sent by Confirm (pins current behaviour)', async () => {
      vi.spyOn(Alert, 'alert').mockImplementation(() => {})
      const t = await mount()
      await type(t, 'edited but not saved')
      await press(t, 'Confirm 1 posts')
      expect(calls().filter((c) => c.method === 'PATCH')).toEqual([])
      expect(calls().map((c) => c.path.replace(/^.*\/schedule/, ''))).toEqual(['/plans/plan1/confirm'])
    })
  })

  describe('caption', () => {
    it('Save caption shows only when dirty, trims, and is disabled when blank', async () => {
      const t = await mount()
      expect(byLabel(t, 'Save caption')).toBeUndefined()
      await type(t, '   ')
      expect(byLabel(t, 'Save caption')!.disabled).toBe(true)
      await type(t, '  fresh words  ')
      expect(byLabel(t, 'Save caption')!.disabled).toBeFalsy()
      await press(t, 'Save caption')
      expect(findCall(/\/posts\/p1$/, 'PATCH')!.body).toEqual({ caption: 'fresh words' })
    })

    it('AI caption sends the product ids + post type and fills caption + hashtags', async () => {
      vi.mocked(apiMock.socialApi.suggestCaption).mockResolvedValue({ data: { caption: 'Fresh', hashtags: ['#a', '#b'] } } as never)
      const t = await mount()
      await press(t, 'AI caption')
      expect(apiMock.socialApi.suggestCaption).toHaveBeenCalledWith({ product_ids: ['prod-it-p1'], post_type: 'SINGLE_PRODUCT' })
      expect(captionValue(t)).toBe('Fresh\n\n#a #b')
      expect(byLabel(t, 'Save caption')).toBeDefined()
    })

    it('AI caption uses CAROUSEL for 2+ items and caps the text at 2200', async () => {
      vi.mocked(apiMock.socialApi.suggestCaption).mockResolvedValue({ data: { caption: 'x'.repeat(2300), hashtags: [] } } as never)
      const t = await mount({ posts: [post('p1', NOV2, { items: [item('a'), item('b')] })] })
      await press(t, 'AI caption')
      expect(vi.mocked(apiMock.socialApi.suggestCaption).mock.calls[0][0]).toMatchObject({ post_type: 'CAROUSEL' })
      expect(captionValue(t)).toHaveLength(2200)
    })
  })

  describe('post status gating', () => {
    it.each(['POSTED', 'PUBLISHING'])('%s posts are read-only: no actions, caption not editable', async (status) => {
      const t = await mount({ posts: [post('p1', NOV2, { status })] })
      for (const l of ['AI caption', 'Skip this post', 'Retry', 'Style post']) expect(byLabel(t, l), l).toBeUndefined()
      expect(caption(t).props.editable).toBe(false)
    })

    it('FAILED shows the error, Retry sends action retry, Skip sends action skip', async () => {
      const t = await mount({ posts: [post('p1', NOV2, { status: 'FAILED', error: 'Token expired' })] })
      expect(text(t)).toContain('Token expired')
      await press(t, 'Retry')
      expect(findCall(/\/posts\/p1$/, 'PATCH')!.body).toEqual({ action: 'retry' })
      await press(t, 'Skip this post')
      expect(calls().filter((c) => c.method === 'PATCH').at(-1)!.body).toEqual({ action: 'skip' })
    })

    it('READY posts get Skip but no Retry', async () => {
      const t = await mount()
      expect(byLabel(t, 'Skip this post')).toBeDefined()
      expect(byLabel(t, 'Retry')).toBeUndefined()
    })
  })

  describe('owner-only slide editing', () => {
    const slideOnly = ['Remove Red Suit from this post', 'Style this photo', 'Swap this product', 'Style post', 'Style all photos']

    it('the owner sees slide controls, the Photo styles card and the Confirm bar', async () => {
      const t = await mount()
      for (const l of slideOnly) expect(byLabel(t, l), l).toBeDefined()
      expect(text(t)).toContain('Photo styles')
      expect(byLabel(t, 'Confirm 1 posts')).toBeDefined()
    })

    it('a manager keeps caption + skip but loses slide controls, styles, Confirm and End plan', async () => {
      authState.staffRole = 'manager'
      const t = await mount()
      for (const l of slideOnly) expect(byLabel(t, l), l).toBeUndefined()
      expect(text(t)).not.toContain('Photo styles')
      expect(byLabel(t, 'Confirm 1 posts')).toBeUndefined()
      expect(byLabel(t, 'AI caption')).toBeDefined()
      expect(byLabel(t, 'Skip this post')).toBeDefined()
      const a = await mount({ status: 'ACTIVE' })
      expect(byLabel(a, 'End plan')).toBeUndefined()
    })
  })

  describe('item actions', () => {
    it('Remove sends DELETE for that item', async () => {
      const t = await mount()
      await press(t, 'Remove Red Suit from this post')
      expect(findCall(/\/items\/it-p1$/, 'DELETE')).toBeDefined()
    })

    it('"Use another photo" needs 2+ photos, then cycles to the next and wraps', async () => {
      const photos = [
        { id: 'ph1', url: 'https://x/1.jpg', is_primary: true },
        { id: 'ph2', url: 'https://x/2.jpg', is_primary: false },
      ]
      const one = await mount()
      expect(byLabel(one, 'Use another photo of this product')).toBeUndefined()

      const a = await mount({ posts: [post('p1', NOV2, { items: [item('it1', { photo_id: 'ph1', product: { name: 'Red Suit', photos } })] })] })
      await press(a, 'Use another photo of this product')
      expect(findCall(/\/items\/it1$/, 'PATCH')!.body).toEqual({ action: 'photo', photo_id: 'ph2' })

      requestMock.mockClear()
      const b = await mount({ posts: [post('p1', NOV2, { items: [item('it1', { photo_id: 'ph2', product: { name: 'Red Suit', photos } })] })] })
      await press(b, 'Use another photo of this product')
      expect(findCall(/\/items\/it1$/, 'PATCH')!.body).toEqual({ action: 'photo', photo_id: 'ph1' })
    })

    it('Swap opens the product picker; picking sends the swap and closes it', async () => {
      const t = await mount()
      expect(modalVisible(t, 1)).toBe(false)
      await press(t, 'Swap this product')
      expect(modalVisible(t, 1)).toBe(true)
      await press(t, 'pick pX')
      expect(findCall(/\/items\/it-p1$/, 'PATCH')!.body).toEqual({ action: 'swap', product_id: 'pX' })
      expect(modalVisible(t, 1)).toBe(false)
      expect(rq.invalidate).toHaveBeenCalledWith({ queryKey: ['social', 'schedule'] })
    })

    it('a rejected swap shows the fallback and keeps the picker open', async () => {
      const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {})
      const t = await mount()
      await press(t, 'Swap this product')
      requestMock.mockRejectedValueOnce(new ApiError('X', 'boom', 500))
      await press(t, 'pick pX')
      expect(alertSpy).toHaveBeenCalledWith('Error', 'That product could not be used here. Pick another.', undefined)
      expect(modalVisible(t, 1)).toBe(true)
    })
  })

  describe('style modal', () => {
    it('item scope: template and Original photo post to the item route; no Rotate option', async () => {
      const t = await mount()
      expect(modalVisible(t, 0)).toBe(false)
      await press(t, 'Style this photo')
      expect(modalVisible(t, 0)).toBe(true)
      expect(option(t, 'Rotate through my pool')).toBeUndefined()
      await tap(option(t, 'White + price'), 'White + price')
      expect(findCall(/\/items\/it-p1\/style$/, 'POST')!.body).toEqual({ template: 'white_price' })
      expect(modalVisible(t, 0)).toBe(false)

      await press(t, 'Style this photo')
      await tap(option(t, 'Original photo'), 'Original photo')
      expect(calls().filter((c) => /\/items\/it-p1\/style$/.test(c.path)).at(-1)!.body).toEqual({ template: null })
    })

    it('post scope: Rotate is disabled with an empty pool and sends "rotate" once the pool has styles', async () => {
      const empty = await mount()
      await press(empty, 'Style post')
      expect(text(empty)).toContain('Rotate through my pool (pick styles first)')
      expect(option(empty, 'Rotate through my pool')!.disabled).toBe(true)

      const t = await mount({ rotation_pool: ['white_price'] })
      await press(t, 'Style post')
      expect(text(t)).toContain('Rotate through my pool (1)')
      await tap(option(t, 'Rotate through my pool'), 'Rotate')
      expect(findCall(/\/posts\/p1\/style$/, 'POST')!.body).toEqual({ template: 'rotate' })
    })

    it('plan scope posts to the plan route', async () => {
      const t = await mount()
      await press(t, 'Style all photos')
      await tap(option(t, 'New Arrival badge'), 'New Arrival badge')
      expect(findCall(/\/plans\/plan1\/style$/, 'POST')!.body).toEqual({ template: 'new_arrival' })
    })

    it('Close dismisses without a request', async () => {
      const t = await mount()
      await press(t, 'Style this photo')
      await press(t, 'Close')
      expect(modalVisible(t, 0)).toBe(false)
      expect(calls().filter((c) => /style$/.test(c.path))).toEqual([])
    })

    it('a failed style keeps the modal and shows the fallback', async () => {
      const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {})
      const t = await mount()
      await press(t, 'Style this photo')
      requestMock.mockRejectedValueOnce(new ApiError('X', 'boom', 500))
      await tap(option(t, 'White + price'), 'White + price')
      expect(alertSpy).toHaveBeenCalledWith('Error', 'Could not apply that style. Try another, or keep the original photo.', undefined)
      expect(modalVisible(t, 0)).toBe(true)
    })
  })

  describe('pending states (#7b)', () => {
    // A request the test settles by hand, so the in-flight UI can be inspected.
    const hold = () => {
      let release!: (v?: unknown) => void
      const p = new Promise((r) => { release = r })
      requestMock.mockImplementationOnce(() => p)
      return () => act(async () => { release({ data: {} }); await new Promise((r) => setTimeout(r, 0)) })
    }

    it('item style: shows "Rendering your photo…" and hides the options until the render finishes', async () => {
      const t = await mount()
      await press(t, 'Style this photo')
      const finish = hold()
      await tap(option(t, 'White + price'), 'White + price')
      expect(text(t)).toContain('Rendering your photo…')
      expect(option(t, 'White + price')).toBeUndefined()
      expect(option(t, 'Original photo')).toBeUndefined()
      expect(modalVisible(t, 0)).toBe(true)
      await finish()
      expect(text(t)).not.toContain('Rendering your photo…')
      expect(modalVisible(t, 0)).toBe(false)
    })

    it('post and plan style: shows "Applying…" instead', async () => {
      const t = await mount()
      await press(t, 'Style all photos')
      const finish = hold()
      await tap(option(t, 'White + price'), 'White + price')
      expect(text(t)).toContain('Applying…')
      expect(text(t)).not.toContain('Rendering your photo…')
      await finish()
      expect(modalVisible(t, 0)).toBe(false)
    })

    it('a failed render clears the pending state and puts the options back', async () => {
      vi.spyOn(Alert, 'alert').mockImplementation(() => {})
      const t = await mount()
      await press(t, 'Style this photo')
      let fail!: (e: unknown) => void
      requestMock.mockImplementationOnce(() => new Promise((_r, rej) => { fail = rej }))
      await tap(option(t, 'White + price'), 'White + price')
      expect(text(t)).toContain('Rendering your photo…')
      await act(async () => { fail(new ApiError('X', 'boom', 500)); await new Promise((r) => setTimeout(r, 0)) })
      expect(text(t)).not.toContain('Rendering your photo…')
      expect(option(t, 'White + price')).toBeDefined()
    })

    it('Confirm shows "Confirming…" and is disabled while the request runs', async () => {
      vi.spyOn(Alert, 'alert').mockImplementation(() => {})
      const t = await mount()
      const finish = hold()
      await press(t, 'Confirm 1 posts')
      expect(byLabel(t, 'Confirming…')!.disabled).toBe(true)
      expect(byLabel(t, 'Confirm 1 posts')).toBeUndefined()
      await finish()
      expect(byLabel(t, 'Confirm 1 posts')).toBeDefined()
    })

    it('AI caption shows "Writing…" and is disabled while the suggestion loads', async () => {
      let done!: (v: unknown) => void
      vi.mocked(apiMock.socialApi.suggestCaption).mockImplementationOnce(() => new Promise((r) => { done = r }) as never)
      const t = await mount()
      await press(t, 'AI caption')
      expect(byLabel(t, 'Writing…')!.disabled).toBe(true)
      await act(async () => { done({ data: { caption: 'Hi', hashtags: [] } }); await new Promise((r) => setTimeout(r, 0)) })
      expect(byLabel(t, 'AI caption')!.disabled).toBeFalsy()
      expect(captionValue(t)).toBe('Hi')
    })
  })

  describe('design card', () => {
    it('Collage cover toggles on and off', async () => {
      const on = await mount()
      await tap(chip(on, 'Collage cover'), 'Collage cover')
      expect(findCall(/\/plans\/plan1\/design$/, 'PATCH')!.body).toEqual({ cover_style: 'collage_cover' })

      requestMock.mockClear()
      const off = await mount({ cover_style: 'collage_cover' })
      await tap(chip(off, 'Collage cover'), 'Collage cover')
      expect(findCall(/\/plans\/plan1\/design$/, 'PATCH')!.body).toEqual({ cover_style: null })
    })

    it('pool chips add and remove template ids', async () => {
      const t = await mount({ rotation_pool: ['white_price'] })
      await tap(chip(t, 'Store logo'), 'Store logo')
      expect(findCall(/\/design$/, 'PATCH')!.body).toEqual({ rotation_pool: ['white_price', 'logo_corner'] })
      requestMock.mockClear()
      await tap(chip(t, 'White + price'), 'White + price')
      expect(findCall(/\/design$/, 'PATCH')!.body).toEqual({ rotation_pool: [] })
    })

    it('an ENDED plan has no design card', async () => {
      const t = await mount({ status: 'ENDED' })
      expect(text(t)).not.toContain('Photo styles')
    })
  })

  describe('end plan', () => {
    it.each(['DRAFT', 'ENDED'])('a %s plan has no End plan button', async (status) => {
      const t = await mount({ status })
      expect(byLabel(t, 'End plan')).toBeUndefined()
    })

    it('ACTIVE: Cancel makes no call; End plan POSTs end and returns to the list', async () => {
      const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {})
      const t = await mount({ status: 'ACTIVE' })
      expect(text(t)).toContain('running')
      await press(t, 'End plan')
      expect(alertSpy.mock.calls[0][0]).toBe('End this plan?')
      const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[]
      expect(buttons[0].text).toBe('Cancel')
      expect(buttons[0].onPress).toBeUndefined()
      expect(findCall(/\/end$/, 'POST')).toBeUndefined()
      await act(async () => {
        buttons[1].onPress!()
        await new Promise((r) => setTimeout(r, 0))
      })
      expect(findCall(/\/plans\/plan1\/end$/, 'POST')).toBeDefined()
      expect(router.replace).toHaveBeenCalledWith('/social/schedule')
    })

    it('a PAUSED plan shows its pause reason and can still be ended', async () => {
      const t = await mount({ status: 'PAUSED', pause_reason: 'Facebook token expired' })
      expect(text(t)).toContain('Facebook token expired')
      expect(byLabel(t, 'End plan')).toBeDefined()
    })
  })
})
