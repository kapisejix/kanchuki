import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import SuitsDesignCategoriesPage from '../page'

function makeCategory(i: number, overrides: Record<string, unknown> = {}) {
  const names = ['Saree', 'Blouse', 'Kurti', 'Gala']
  const name = (overrides.name as string | undefined) ?? names[i - 1] ?? `Cat ${i}`
  return {
    id: `cat-${i}`,
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    sort_order: i,
    is_active: true,
    design_count: i === 1 ? 5 : 0,
    created_at: '2026-09-07T00:00:00Z',
    updated_at: '2026-09-07T00:00:00Z',
    // Every category is implicitly related to itself (resolver union)
    related: [{ id: `cat-${i}`, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') }],
    ...overrides,
  }
}

// A mutable "server" store the fetch stub reads/writes so tests exercise the
// reload-after-save contract rather than canned static responses.
function makeStore() {
  // Saree, Blouse, Kurti + Gala (no designs, unlinked) — Gala is the chip the
  // related-toggle test presses on Kurti.
  const cats = [makeCategory(1), makeCategory(2), makeCategory(3), makeCategory(4)]
  // Related is symmetric server-side (self-M2M union). Seed: Saree ↔ Blouse.
  cats[0]!.related = [
    { id: 'cat-2', name: 'Blouse', slug: 'blouse' },
    { id: 'cat-1', name: 'Saree', slug: 'saree' },
  ]
  cats[1]!.related = [
    { id: 'cat-1', name: 'Saree', slug: 'saree' },
    { id: 'cat-2', name: 'Blouse', slug: 'blouse' },
  ]
  cats[2]!.related = [{ id: 'cat-3', name: 'Kurti', slug: 'kurti' }]
  return {
    cats,
    lastRelatedPut: null as { id: string; related_ids: string[] } | null,
  }
}

describe('Admin Suits Design Categories page', () => {
  let store: ReturnType<typeof makeStore>
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sessionStorage.clear()
    sessionStorage.setItem('admin_key', 'k-test')
    store = makeStore()
    fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'

      if (method === 'GET') {
        return { ok: true, status: 200, json: async () => ({ data: store.cats }) }
      }
      if (method === 'POST' && url.endsWith('/showcase-design-categories')) {
        const body = JSON.parse(String(init!.body)) as { name: string; sort_order?: number }
        if (!body.name) return { ok: false, status: 422, json: async () => ({ error: { message: 'Name is required' } }) }
        const row = makeCategory(store.cats.length + 1, {
          name: body.name,
          sort_order: body.sort_order ?? store.cats.length,
        })
        row.related = [{ id: row.id, name: row.name, slug: row.slug }]
        store.cats.push(row)
        return { ok: true, status: 201, json: async () => ({ data: row }) }
      }
      if (method === 'PATCH' && /\/showcase-design-categories\/[\w-]+$/.test(url)) {
        const id = url.split('/').pop()!
        const body = JSON.parse(String(init!.body)) as Record<string, unknown>
        const cat = store.cats.find((c) => c.id === id)!
        Object.assign(cat, body)
        return { ok: true, status: 200, json: async () => ({ data: cat }) }
      }
      if (method === 'PUT' && url.endsWith('/related')) {
        const id = url.split('/').at(-2)!
        const body = JSON.parse(String(init!.body)) as { related_ids: string[] }
        store.lastRelatedPut = { id, related_ids: body.related_ids }
        return { ok: true, status: 200, json: async () => ({ data: { id, related_ids: body.related_ids } }) }
      }
      if (method === 'DELETE') {
        const id = url.split('/').pop()!
        store.cats = store.cats.filter((c) => c.id !== id)
        return { ok: true, status: 200, json: async () => ({ data: { id, deleted: true } }) }
      }
      return { ok: true, status: 200, json: async () => ({ data: [] }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // The page header/intro copy legitimately contains category words ("…whose
  // category is Saree…"), so names are located via their labelled inputs and
  // cards are scoped by climbing from the input to the .rounded-2xl card.
  const cardFor = async (name: string) => {
    const input = await screen.findByLabelText(`Name for ${name}`)
    const card = input.closest('.rounded-2xl') as HTMLElement
    expect(card).toBeTruthy()
    return card
  }

  it('renders categories with design counts and the always-self locked chip', async () => {
    render(<SuitsDesignCategoriesPage />)

    const sareeCard = await cardFor('Saree')
    expect(screen.getByLabelText('Name for Blouse')).toBeInTheDocument()
    expect(screen.getByLabelText('Name for Kurti')).toBeInTheDocument()
    expect(within(sareeCard).getByText('5 designs')).toBeInTheDocument()
    // Saree shows the locked self chip + its seeded related (Blouse) toggle on.
    expect(within(sareeCard).getByText('Saree (always)')).toBeInTheDocument()
    expect(within(sareeCard).getByRole('button', { name: /Blouse/, pressed: true })).toBeInTheDocument()
  })

  it('editing a name + sort shows Save; saving PATCHes and reloads server truth', async () => {
    render(<SuitsDesignCategoriesPage />)
    const sareeInput = await screen.findByLabelText('Name for Saree')

    fireEvent.change(sareeInput, { target: { value: 'Saree Edit' } })
    fireEvent.click(await screen.findByRole('button', { name: /Save$/ }))

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find((c) => c[1]?.method === 'PATCH')
      expect(patch).toBeTruthy()
    })
    const patchBody = JSON.parse(
      String(fetchMock.mock.calls.find((c) => c[1]?.method === 'PATCH')![1]!.body),
    )
    expect(patchBody.name).toBe('Saree Edit')
    expect(await screen.findByText(/Saree Edit" saved/)).toBeInTheDocument()
    // Reloaded server truth shows the new name in the input
    expect(await screen.findByLabelText('Name for Saree Edit')).toBeInTheDocument()
  })

  it('toggle active PATCHes immediately and reloads', async () => {
    render(<SuitsDesignCategoriesPage />)
    const sareeCard = await cardFor('Saree')

    const activePill = within(sareeCard).getByRole('button', { name: /Active/ })
    fireEvent.click(activePill)

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find((c) => c[1]?.method === 'PATCH')
      expect(patch).toBeTruthy()
    })
    const body = JSON.parse(
      String(fetchMock.mock.calls.find((c) => c[1]?.method === 'PATCH')![1]!.body),
    )
    expect(body.is_active).toBe(false)
  })

  it('toggling related chips + Save links PUTs the full related set', async () => {
    render(<SuitsDesignCategoriesPage />)
    const kurtiCard = await cardFor('Kurti')

    // Kurti's card has no Gala chip seeded as related → it starts unpressed.
    const galaChip = within(kurtiCard).getByRole('button', { name: /Gala/, pressed: false })
    fireEvent.click(galaChip)
    fireEvent.click(within(kurtiCard).getByRole('button', { name: 'Save links' }))

    await waitFor(() => {
      expect(store.lastRelatedPut).toBeTruthy()
    })
    expect(store.lastRelatedPut!.id).toBe('cat-3')
    // Kurti's self is implied + Gala was added on top of the existing set
    expect(store.lastRelatedPut!.related_ids).toEqual(
      expect.arrayContaining(['cat-3', 'cat-4']),
    )
    expect(await screen.findByText(/"Kurti" related set saved/)).toBeInTheDocument()
  })

  it('adding a category POSTs then reloads it into the list', async () => {
    render(<SuitsDesignCategoriesPage />)
    await cardFor('Saree')

    fireEvent.change(screen.getByLabelText(/New category name/), {
      target: { value: 'Lehenga' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Add category/ }))

    await waitFor(() => {
      expect(store.cats.some((c) => c.name === 'Lehenga')).toBe(true)
    })
    expect(await screen.findByLabelText('Name for Lehenga')).toBeInTheDocument()
    expect(await screen.findByText(/Lehenga" added/)).toBeInTheDocument()
  })

  it('delete is disabled for categories that still hold designs', async () => {
    render(<SuitsDesignCategoriesPage />)
    const sareeCard = await cardFor('Saree')

    const sareeDelete = within(sareeCard).getByRole('button', { name: 'Delete Saree' })
    expect(sareeDelete).toBeDisabled()
    expect(sareeDelete).toHaveAttribute(
      'title',
      expect.stringContaining('deactivate it instead'),
    )

    // Kurti (0 designs) CAN be deleted
    const kurtiCard = await cardFor('Kurti')
    fireEvent.click(within(kurtiCard).getByRole('button', { name: 'Delete Kurti' }))
    await waitFor(() => {
      expect(store.cats.some((c) => c.name === 'Kurti')).toBe(false)
    })
    expect(window.confirm).toHaveBeenCalled()
  })
})
