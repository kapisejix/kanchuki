import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import SuitsDesignsPage from '../page'

// next/image renders through Next's optimizer config which jsdom doesn't
// provide — mock to a plain <img> carrying the alt text.
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({
    src,
    alt,
    className,
  }: {
    src: string
    alt?: string | null
    className?: string
    // eslint-disable-next-line @next/next/no-img-element -- test mock of next/image
  }) => <img src={src} alt={alt ?? ''} className={className} />,
}))

const CATEGORIES = {
  data: [
    { id: 'cat-suits', name: 'Suits', slug: 'suits', is_active: true, sort_order: 1, design_count: 2 },
    { id: 'cat-blouse', name: 'Blouse', slug: 'blouse', is_active: true, sort_order: 2, design_count: 0 },
    { id: 'cat-ghost', name: 'Ghost', slug: 'ghost', is_active: false, sort_order: 9, design_count: 0 },
  ],
}

function makeDesign(i: number) {
  const global = i === 1
  return {
    id: `design-${i}`,
    name: i === 1 ? 'Anarkali Suit — Maroon' : null,
    image_url: `https://cdn.test/showcase-designs/${global ? 'global' : 'ret_1'}/${i}.jpg`,
    category_id: 'cat-suits',
    category_slug: 'suits',
    category_name: 'Suits',
    is_active: true,
    sort_order: 0,
    created_at: '2026-09-07T00:00:00Z',
    owner: global
      ? { type: 'global' as const }
      : { type: 'retailer' as const, id: 'ret_1', shop_name: 'Radha Store' },
  }
}

// Route-based fetch stub: the designs/categories GETs read `rows`/`cats`
// dynamically so scope-switch assertions can mutate them between calls.
const OWNERS = {
  data: [
    { id: 'ret_1', shop_name: 'Radha Store', design_count: 1 },
    { id: 'ret_2', shop_name: 'Meera Sarees', design_count: 2 },
  ],
}

function makeFetchStub() {
  return vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'

      if (method === 'GET' && url.includes('/showcase-design-categories')) {
        return {
          ok: true,
          status: 200,
          json: async () => CATEGORIES,
        }
      }
      if (method === 'GET' && url.endsWith('/showcase-designs/owners')) {
        return { ok: true, status: 200, json: async () => OWNERS }
      }
      if (method === 'GET' && url.includes('/showcase-designs')) {
        const scoped = url.includes('scope=global')
          ? [makeDesign(1)]
          : url.includes('scope=retailer')
            ? url.includes('retailer_id=')
              ? [makeDesign(2)]
              : [makeDesign(2)]
            : [makeDesign(1), makeDesign(2)]
        return { ok: true, status: 200, json: async () => ({ data: scoped }) }
      }
      if (method === 'POST' && url.endsWith('/upload-url')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              upload_url: 'https://r2.test/put',
              r2_key: 'showcase-designs/global/raw/new.jpg',
              public_url: 'https://cdn.test/raw-new.jpg',
              expires_in: 300,
            },
          }),
        }
      }
      if (method === 'PUT') {
        return { ok: true, status: 200, json: async () => ({}) }
      }
      if (method === 'POST' && url.endsWith('/showcase-designs')) {
        return {
          ok: true,
          status: 201,
          json: async () => ({ data: { id: 'design-new', name: 'New Saree' } }),
        }
      }
      if (method === 'DELETE') {
        return { ok: true, status: 200, json: async () => ({ data: { id: 'x', deleted: true } }) }
      }
      if (method === 'PATCH') {
        return { ok: true, status: 200, json: async () => ({ data: { id: 'x' } }) }
      }
      return { ok: true, status: 200, json: async () => ({ data: [] }) }
    },
  )
}

describe('Admin Suits Designs page', () => {
  let fetchMock: ReturnType<typeof makeFetchStub>

  beforeEach(() => {
    sessionStorage.clear()
    sessionStorage.setItem('admin_key', 'k-test')
    fetchMock = makeFetchStub()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders the design library with owner badges and category labels', async () => {
    render(<SuitsDesignsPage />)

    // The global fetch happens twice in parallel on mount: categories + designs.
    expect(await screen.findByText('Anarkali Suit — Maroon')).toBeInTheDocument()
    // Global owner badge + Global scope chip + the hint line's bold "Global"
    expect(screen.getAllByText('Global')).toHaveLength(3)
    expect(screen.getByText('Radha Store')).toBeInTheDocument()
    expect(screen.getAllByText('Suits')).toHaveLength(2) // category chip on both cards
    expect(screen.getByRole('option', { name: 'Suits (active)' })).toBeInTheDocument()
    expect(screen.getByText('2 designs')).toBeInTheDocument()

    // Row fetches carried the admin session key — the list GET (scope=all
    // sends no query string) is the first request on mount
    const firstGet = fetchMock.mock.calls.find((c) => (c[1]?.method ?? 'GET') === 'GET')
    expect(firstGet?.[1]).toEqual(
      expect.objectContaining({ headers: { 'x-admin-key': 'k-test' } }),
    )
  })

  it('scope chips refetch scoped to global / retailer; retailer adds an Owner dropdown', async () => {
    render(<SuitsDesignsPage />)
    await screen.findByText('Anarkali Suit — Maroon')

    fireEvent.click(screen.getByRole('button', { name: 'Retailer' }))
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('scope=retailer'))
      expect(call).toBeTruthy()
    })
    // Owner dropdown options resolve server-side (Radha Store badge + option)
    expect(await screen.findByLabelText('Owner')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'All retailers' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Radha Store (1)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Meera Sarees (2)' })).toBeInTheDocument()
    // Global design is filtered out of the retailer view
    await waitFor(() => {
      expect(screen.queryByText('Anarkali Suit — Maroon')).not.toBeInTheDocument()
    })
  })

  it('picking an owner refetches with scope=retailer&retailer_id; All retailers clears it', async () => {
    render(<SuitsDesignsPage />)
    await screen.findByText('Anarkali Suit — Maroon')

    fireEvent.click(screen.getByRole('button', { name: 'Retailer' }))
    const ownerSelect = await screen.findByLabelText('Owner')

    fireEvent.change(ownerSelect, { target: { value: 'ret_1' } })
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('scope=retailer&retailer_id=ret_1'),
      )
      expect(call).toBeTruthy()
    })

    // Switching to Global hides the Owner dropdown again (filter is retailer-only)
    fireEvent.click(screen.getByRole('button', { name: 'Global' }))
    await waitFor(() => {
      expect(screen.queryByLabelText('Owner')).not.toBeInTheDocument()
    })
    const backToRetailer = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes('scope=global'),
    )
    expect(backToRetailer).toBeTruthy()
  })

  it('uploading runs presign → R2 PUT → create with the chosen category', async () => {
    render(<SuitsDesignsPage />)
    await screen.findByText('Anarkali Suit — Maroon')

    const file = new File(['fake-bytes'], 'design.jpg', { type: 'image/jpeg' })
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    fireEvent.change(input, { target: { files: [file] } })

    // create carries category_id + raw_r2_key (+ name when provided)
    await waitFor(() => {
      const create = fetchMock.mock.calls.find(
        (c) => c[1]?.method === 'POST' && String(c[0]).endsWith('/showcase-designs'),
      )
      expect(create).toBeTruthy()
    })
    const createCall = fetchMock.mock.calls.find(
      (c) => c[1]?.method === 'POST' && String(c[0]).endsWith('/showcase-designs'),
    )!
    const body = JSON.parse(String(createCall[1]!.body))
    expect(body.category_id).toBe('cat-suits')
    expect(body.raw_r2_key).toBe('showcase-designs/global/raw/new.jpg')
    expect(await screen.findByText(/added \(Global\)/)).toBeInTheDocument()
  })

  it('uploading without a category is refused before any network call', async () => {
    render(<SuitsDesignsPage />)
    await screen.findByText('Anarkali Suit — Maroon')

    // Clear the pre-selected category → the upload button path must refuse.
    const select = screen.getByLabelText(/Category/) as HTMLSelectElement
    fireEvent.change(select, { target: { value: '' } })

    const file = new File(['fake-bytes'], 'design.jpg', { type: 'image/jpeg' })
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByText(/Pick a category first/)).toBeInTheDocument()
    const uploadUrlCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/upload-url'),
    )
    expect(uploadUrlCalls).toHaveLength(0)
  })

  it('toggling active PATCHes the row and optimistic-flips the badge', async () => {
    render(<SuitsDesignsPage />)
    await screen.findByText('Anarkali Suit — Maroon')

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate Anarkali Suit — Maroon' }))
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find((c) => c[1]?.method === 'PATCH')
      expect(patch).toBeTruthy()
    })
    const patchBody = JSON.parse(
      String(fetchMock.mock.calls.find((c) => c[1]?.method === 'PATCH')![1]!.body),
    )
    expect(patchBody).toEqual({ is_active: false })
    expect(screen.getByText('HIDDEN')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Activate Anarkali Suit — Maroon' })).toBeInTheDocument()
  })

  it('deleting confirms, DELETEs the row and removes it from the grid', async () => {
    render(<SuitsDesignsPage />)
    await screen.findByText('Anarkali Suit — Maroon')

    fireEvent.click(screen.getByRole('button', { name: 'Delete Anarkali Suit — Maroon' }))
    await waitFor(() => {
      const del = fetchMock.mock.calls.find((c) => c[1]?.method === 'DELETE')
      expect(del).toBeTruthy()
    })
    expect(window.confirm).toHaveBeenCalled()
    // Bodyless DELETE must still send a JSON body '{}' (Fastify 400 guard)
    const delCall = fetchMock.mock.calls.find((c) => c[1]?.method === 'DELETE')!
    expect(delCall[1]!.body).toBe('{}')
    await waitFor(() => {
      expect(screen.queryByText('Anarkali Suit — Maroon')).not.toBeInTheDocument()
    })
    expect(screen.getByText('1 design')).toBeInTheDocument()
  })
})
