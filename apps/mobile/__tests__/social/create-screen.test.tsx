import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react-test-renderer'
import { Alert } from 'react-native'
import { render } from '../../src/test/__mocks__/testing-library'

// T3.2-a #6 — app/social/create.tsx (Composer). RC-022 / RC-023 / RC-061 and the
// R-13 retry-dedupe id live here. Child pickers are stubbed: this file pins what
// the SCREEN decides (payload shape, targets, validation, id reuse, result sheet).
vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).__DEV__ = true
})

import CreateSocialPostScreen from '../../app/social/create'
import { ApiError } from '../../src/lib/api/api-error'
import { router, useLocalSearchParams } from 'expo-router'

const apiMock = vi.hoisted(() => ({
  socialApi: { listAccounts: vi.fn(), listPostTemplates: vi.fn(), suggestCaption: vi.fn(), createPost: vi.fn() },
  collectionApi: { list: vi.fn(), get: vi.fn() },
  productApi: { get: vi.fn() },
  retailerApi: { getMe: vi.fn() },
  showcaseDesignsApi: { listMine: vi.fn() },
}))
const queryStore = vi.hoisted(() => new Map<string, unknown>())
const ui = vi.hoisted(() => ({
  preview: null as null | { media: unknown[]; postType: string; caption: string },
  checklist: null as null | { selected: string[] },
  products: [] as Record<string, unknown>[],
}))

vi.mock('../../src/lib/api', async () => ({
  ...apiMock,
  ApiError: (await import('../../src/lib/api/api-error')).ApiError,
}))
vi.mock('../../src/lib/theme', () => {
  const palette = new Proxy({}, { get: () => '#000000' })
  return { useTheme: () => ({ primaryColor: '#231F48', colors: new Proxy({}, { get: () => palette }) }) }
})
// BrandIcon pulls @expo/vector-icons (not loadable in the Node test env).
vi.mock('../../src/components/BrandIcon', () => ({ BrandIcon: () => null }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: queryStore.get(JSON.stringify(queryKey)),
    isLoading: false,
  }),
  useQueries: ({ queries }: { queries: { queryKey: unknown[] }[] }) =>
    queries.map((q) => ({ data: queryStore.get(JSON.stringify(q.queryKey)) })),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('../../src/components/social', async () => {
  const React = await import('react')
  const stub = (label: string, onPress: () => void) =>
    React.createElement('Stub', { key: label, accessibilityLabel: label, onPress })
  return {
    CAROUSEL_CAP: 10,
    toComposeProduct: (p: Record<string, unknown>) => ({
      id: p.id,
      name: p.name,
      sku: null,
      primary_photo_url: p.primary_photo_url,
      price_min: p.price_min,
      price_max: p.price_max,
    }),
    ProductGridPicker: ({ onToggle }: { onToggle: (p: unknown) => void }) =>
      React.createElement(
        'Stub',
        null,
        ui.products.map((p) => stub(`pick ${p.id}`, () => onToggle(p))),
      ),
    PostTypePicker: ({ onChange }: { onChange: (t: string) => void }) =>
      React.createElement(
        'Stub',
        null,
        ['SINGLE_PRODUCT', 'CAROUSEL', 'COLLECTION_LINK'].map((t) => stub(`type ${t}`, () => onChange(t))),
      ),
    TargetChecklist: (p: { accounts: { id: string }[]; selected: string[]; onToggle: (id: string) => void }) => {
      ui.checklist = p
      return React.createElement(
        'Stub',
        null,
        p.accounts.map((a) => stub(`target ${a.id}`, () => p.onToggle(a.id))),
      )
    },
    PostPreview: (p: { media: unknown[]; postType: string; caption: string }) => {
      ui.preview = p
      return null
    },
    TemplatePicker: () => null,
    ItemMediaStrip: () => null,
  }
})

// ── Tree helpers (same shape as smoke/rc-screens.test.tsx) ──────────
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
const byLabel = (t: Tree, label: string) =>
  collectNodes(t.toTree() as TreeNode, (n) => typeof n.props?.onPress === 'function' && n.props.accessibilityLabel === label)[0]
    ?.props as unknown as Handler | undefined
const byText = (t: Tree, s: string) =>
  collectNodes(
    t.toTree() as TreeNode,
    (n) => typeof n.props?.onPress === 'function' && n.props.accessibilityLabel === undefined && collectText(n).includes(s),
  )[0]?.props as unknown as Handler | undefined
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const tap = async (h: Handler | undefined, what: string) => {
  expect(h, what).toBeDefined()
  await act(async () => {
    await h!.onPress()
    await new Promise((r) => setTimeout(r, 0))
  })
}
const pressLabel = (t: Tree, l: string) => tap(byLabel(t, l), l)
const pressText = (t: Tree, s: string) => tap(byText(t, s), s)
const publish = (t: Tree) => pressLabel(t, 'Publish now')
const setCaption = async (t: Tree, value: string) => {
  const n = collectNodes(t.toTree() as TreeNode, (x) => x.props?.accessibilityLabel === 'Post caption' && typeof x.props?.onChangeText === 'function')[0]
  await act(async () => {
    ;(n.props as unknown as { onChangeText: (v: string) => void }).onChangeText(value)
  })
}

// ── Fixtures ──────────────────────────────────────────────────────
const accounts = [
  { id: 'fb1', platform: 'FACEBOOK', account_name: 'Radha FB' },
  { id: 'ig1', platform: 'INSTAGRAM', account_name: 'Radha IG' },
]
const product = (id: string) => ({ id, name: `Suit ${id}`, primary_photo_url: `https://x/${id}.jpg`, price_min: 150000, price_max: 150000 })
const detail = (id: string, videos: unknown[] = []) => ({
  data: { ...product(id), photos: [{ id: `ph-${id}`, url: `https://x/ph-${id}.jpg`, is_primary: true }], videos, category: 'Suit' },
})
const collection = { id: 'col1', title: 'Diwali', slug: 'diwali', url: 'https://k.test/diwali', status: 'ACTIVE', product_count: 3 }
const collectionDetail = {
  data: { products: ['a', 'b', 'c'].map((k) => ({ product: { id: `cp-${k}`, photos: [{ id: `cph-${k}`, url: `https://x/cph-${k}.jpg` }] } })) },
}
const setQuery = (key: unknown[], data: unknown) => queryStore.set(JSON.stringify(key), data)
const posted = [{ social_account_id: 'fb1', platform: 'FACEBOOK', status: 'POSTED' }]
const failed = [{ social_account_id: 'fb1', platform: 'FACEBOOK', status: 'FAILED', error_message: 'Token expired' }]
const lastPayload = () => vi.mocked(apiMock.socialApi.createPost).mock.calls.at(-1)![0] as Record<string, unknown>
const payloadAt = (i: number) => vi.mocked(apiMock.socialApi.createPost).mock.calls[i][0] as Record<string, unknown>

let mounted: Tree[] = []
async function mount(params: Record<string, string> = {}) {
  vi.mocked(useLocalSearchParams).mockReturnValue(params)
  const t = render(<CreateSocialPostScreen />)
  mounted.push(t)
  await flush()
  return t
}

beforeEach(() => {
  vi.clearAllMocks()
  queryStore.clear()
  ui.preview = null
  ui.checklist = null
  ui.products = [product('p1'), product('p2')]
  setQuery(['social', 'accounts'], { data: accounts })
  setQuery(['social', 'post-templates'], { data: [] })
  setQuery(['retailer', 'me'], { data: { shop_name: 'Radha Sarees', public_slug: 'radha' } })
  setQuery(['collections', 'all'], { data: [collection] })
  setQuery(['collection', 'col1', 'social-carousel'], collectionDetail)
  setQuery(['product', 'p1'], detail('p1'))
  setQuery(['product', 'p2'], detail('p2'))
  vi.mocked(apiMock.socialApi.createPost).mockResolvedValue({ data: { results: posted } } as never)
  // AI caption suggest is additive and fails open; keep it from ever filling the caption here.
  vi.mocked(apiMock.socialApi.suggestCaption).mockRejectedValue(new Error('off'))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  for (const t of mounted) t.unmount()
  mounted = []
})

describe('social composer (T3.2-a #6)', () => {
  it('no connected accounts shows the connect prompt, no publish button', async () => {
    setQuery(['social', 'accounts'], { data: [] })
    const t = await mount()
    expect(text(t)).toContain('No social accounts connected')
    expect(byLabel(t, 'Publish now')).toBeUndefined()
  })

  it('RC-023: single-product post defaults to the storefront link; payload shape is exact', async () => {
    const t = await mount()
    await pressLabel(t, 'pick p1')
    await publish(t)
    expect(lastPayload()).toMatchObject({
      post_type: 'SINGLE_PRODUCT',
      targets: ['fb1', 'ig1'],
      items: [{ product_id: 'p1', photo_id: 'ph-p1' }],
      link_type: 'storefront',
      caption: undefined,
    })
    expect(String(lastPayload().client_post_id)).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('switching a product-link single post to Carousel falls back to storefront', async () => {
    const t = await mount()
    await pressLabel(t, 'pick p1')
    await pressText(t, 'Product page')
    await pressLabel(t, 'type CAROUSEL')
    await pressLabel(t, 'pick p2')
    await publish(t)
    expect(lastPayload()).toMatchObject({ post_type: 'CAROUSEL', link_type: 'storefront' })
    expect(lastPayload().items).toEqual([
      { product_id: 'p1', photo_id: 'ph-p1' },
      { product_id: 'p2', photo_id: 'ph-p2' },
    ])
  })

  it('RC-061: a single-product post with a main video sends video_id and previews it with a poster', async () => {
    setQuery(['product', 'p1'], detail('p1', [{ id: 'v1', public_url: 'https://x/v1.mp4', is_main: true }]))
    const t = await mount()
    await pressLabel(t, 'pick p1')
    expect(ui.preview!.media).toEqual([
      { kind: 'video', video_id: 'v1', url: 'https://x/v1.mp4', poster_url: 'https://x/p1.jpg' },
    ])
    await publish(t)
    expect(lastPayload().items).toEqual([{ product_id: 'p1', video_id: 'v1' }])
  })

  it('RC-061: a carousel never carries the video — photos only', async () => {
    setQuery(['product', 'p1'], detail('p1', [{ id: 'v1', public_url: 'https://x/v1.mp4', is_main: true }]))
    const t = await mount()
    await pressLabel(t, 'type CAROUSEL')
    await pressLabel(t, 'pick p1')
    await pressLabel(t, 'pick p2')
    await publish(t)
    expect(lastPayload().items).toEqual([
      { product_id: 'p1', photo_id: 'ph-p1' },
      { product_id: 'p2', photo_id: 'ph-p2' },
    ])
  })

  it('RC-022: collection link card is Facebook-only, media-less, previewed with a cover photo', async () => {
    const t = await mount()
    await pressLabel(t, 'type COLLECTION_LINK')
    expect(ui.checklist!.selected).toEqual(['fb1'])
    await pressText(t, 'Diwali')
    expect(ui.preview!.media).toEqual([{ kind: 'photo', url: 'https://x/cph-a.jpg' }])
    await publish(t)
    expect(lastPayload()).toMatchObject({
      post_type: 'COLLECTION_LINK',
      items: [],
      collection_id: 'col1',
      link_type: 'collection',
      targets: ['fb1'],
    })
  })

  it('collection Photo carousel format re-adds Instagram and posts the collection photos as a CAROUSEL', async () => {
    const t = await mount()
    await pressLabel(t, 'type COLLECTION_LINK')
    await pressText(t, 'Diwali')
    await pressText(t, 'Photo carousel')
    await pressLabel(t, 'target ig1')
    await publish(t)
    expect(lastPayload()).toMatchObject({
      post_type: 'CAROUSEL',
      collection_id: 'col1',
      link_type: 'collection',
      targets: ['fb1', 'ig1'],
    })
    expect(lastPayload().items).toEqual([
      { product_id: 'cp-a', photo_id: 'cph-a' },
      { product_id: 'cp-b', photo_id: 'cph-b' },
      { product_id: 'cp-c', photo_id: 'cph-c' },
    ])
  })

  it('collection carousel needs 2+ products with photos', async () => {
    setQuery(['collection', 'col1', 'social-carousel'], { data: { products: [collectionDetail.data.products[0]] } })
    const t = await mount()
    await pressLabel(t, 'type COLLECTION_LINK')
    await pressText(t, 'Diwali')
    await pressText(t, 'Photo carousel')
    expect(text(t)).toContain('This collection needs at least 2 products with photos for a carousel.')
    expect(byLabel(t, 'Publish now')!.disabled).toBe(true)
  })

  it('validation blocks Publish with the first problem shown', async () => {
    const t = await mount()
    expect(text(t)).toContain('Choose exactly one product.')
    expect(byLabel(t, 'Publish now')!.disabled).toBe(true)

    await pressLabel(t, 'type CAROUSEL')
    await pressLabel(t, 'pick p1')
    expect(text(t)).toContain('Choose at least 2 products for a carousel.')

    await pressLabel(t, 'pick p2')
    expect(byLabel(t, 'Publish now')!.disabled).toBeFalsy()

    await pressLabel(t, 'target fb1')
    await pressLabel(t, 'target ig1')
    expect(text(t)).toContain('Select at least one account to post to.')
    expect(byLabel(t, 'Publish now')!.disabled).toBe(true)
    await publish(t)
    expect(apiMock.socialApi.createPost).not.toHaveBeenCalled()
  })

  describe('retry dedupe id (R-13)', () => {
    const ready = async () => {
      const t = await mount()
      await pressLabel(t, 'pick p1')
      return t
    }

    it('a transient failure (no rows) keeps the id; the retry reuses it and the alert shows', async () => {
      const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {})
      vi.mocked(apiMock.socialApi.createPost).mockRejectedValueOnce(new ApiError('NETWORK_ERROR', 'down', 0))
      const t = await ready()
      await publish(t)
      expect(alertSpy).toHaveBeenCalledWith('Error', 'Could not publish the post. Try again.', undefined)
      await publish(t)
      expect(apiMock.socialApi.createPost).toHaveBeenCalledTimes(2)
      expect(payloadAt(1).client_post_id).toBe(payloadAt(0).client_post_id)
    })

    it('a definitive result spends the id: the next publish mints a new one', async () => {
      const t = await ready()
      await publish(t)
      await publish(t)
      expect(payloadAt(1).client_post_id).not.toBe(payloadAt(0).client_post_id)
    })

    it('an empty-results replay (twin still writing) keeps the id', async () => {
      vi.mocked(apiMock.socialApi.createPost).mockResolvedValueOnce({ data: { results: [] } } as never)
      const t = await ready()
      await publish(t)
      await publish(t)
      expect(payloadAt(1).client_post_id).toBe(payloadAt(0).client_post_id)
    })

    it('editing the caption between tries is a different post: new id', async () => {
      vi.mocked(apiMock.socialApi.createPost).mockRejectedValueOnce(new ApiError('NETWORK_ERROR', 'down', 0))
      vi.spyOn(Alert, 'alert').mockImplementation(() => {})
      const t = await ready()
      await publish(t)
      await setCaption(t, 'New caption')
      await publish(t)
      expect(payloadAt(1).client_post_id).not.toBe(payloadAt(0).client_post_id)
      expect(payloadAt(1).caption).toBe('New caption')
    })

    it('two taps in one tick carry the same id (the server dedupes the pair)', async () => {
      const t = await ready()
      const h = byLabel(t, 'Publish now')!
      await act(async () => {
        h.onPress()
        h.onPress()
        await new Promise((r) => setTimeout(r, 0))
      })
      const ids = vi.mocked(apiMock.socialApi.createPost).mock.calls.map((c) => (c[0] as { client_post_id: string }).client_post_id)
      expect(new Set(ids).size).toBe(1)
    })
  })

  describe('result handling', () => {
    it('an all-failed 400 with rows opens the result sheet, with no error alert', async () => {
      const alertSpy = vi.spyOn(Alert, 'alert').mockImplementation(() => {})
      vi.mocked(apiMock.socialApi.createPost).mockRejectedValueOnce(
        Object.assign(new ApiError('PUBLISH_FAILED', 'All failed', 400), { results: failed }),
      )
      const t = await mount()
      await pressLabel(t, 'pick p1')
      await publish(t)
      expect(text(t)).toContain('Could not post')
      expect(text(t)).toContain('Token expired')
      expect(alertSpy).not.toHaveBeenCalled()
    })

    it('Done goes back when every account posted, and only closes the sheet when one failed', async () => {
      const t = await mount()
      await pressLabel(t, 'pick p1')
      await publish(t)
      expect(text(t)).toContain('Posted!')
      await pressLabel(t, 'Done')
      expect(router.back).toHaveBeenCalledTimes(1)

      vi.mocked(apiMock.socialApi.createPost).mockResolvedValueOnce({ data: { results: [...posted, ...failed.map((r) => ({ ...r, social_account_id: 'ig1', platform: 'INSTAGRAM' }))] } } as never)
      await publish(t)
      expect(text(t)).toContain('Post finished')
      await pressLabel(t, 'Done')
      expect(router.back).toHaveBeenCalledTimes(1)
      expect(text(t)).not.toContain('Post finished')
    })
  })

  describe('deep links', () => {
    it('product_ids opens a Carousel with those products selected', async () => {
      vi.mocked(apiMock.productApi.get).mockImplementation(async (id: string) => detail(id) as never)
      const t = await mount({ product_ids: 'p1,p2' })
      await publish(t)
      expect(lastPayload()).toMatchObject({ post_type: 'CAROUSEL' })
      expect((lastPayload().items as unknown[]).length).toBe(2)
    })

    it('collection_id: when the collections list arrives AFTER mount, the collection is chosen', async () => {
      setQuery(['collections', 'all'], { data: [] })
      const t = await mount({ collection_id: 'col1' })
      setQuery(['collections', 'all'], { data: [collection] })
      await act(async () => {
        t.rerender(<CreateSocialPostScreen />)
      })
      await publish(t)
      expect(lastPayload()).toMatchObject({ post_type: 'COLLECTION_LINK', collection_id: 'col1' })
    })

    // RC-131: the resolve-pending-collection effect ran before the prefill set the id and never re-ran.
    it('collection_id: with the list already cached, the collection is chosen', async () => {
      const t = await mount({ collection_id: 'col1' })
      await publish(t)
      expect(lastPayload()).toMatchObject({ post_type: 'COLLECTION_LINK', collection_id: 'col1' })
    })

    it('design_id locks IMAGE mode: image_url only, no products, no post-type picker', async () => {
      vi.mocked(apiMock.showcaseDesignsApi.listMine).mockResolvedValue({
        data: [{ id: 'd1', name: 'Bandhani', image_url: 'https://x/d1.jpg' }],
      } as never)
      const t = await mount({ design_id: 'd1' })
      expect(byLabel(t, 'type CAROUSEL')).toBeUndefined()
      await publish(t)
      expect(lastPayload()).toMatchObject({ post_type: 'IMAGE', items: [{ image_url: 'https://x/d1.jpg' }] })
      expect(lastPayload().link_type).toBeUndefined()
    })
  })
})
