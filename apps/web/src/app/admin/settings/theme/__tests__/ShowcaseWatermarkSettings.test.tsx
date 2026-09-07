import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ShowcaseWatermarkSettings from '../ShowcaseWatermarkSettings'

type StoreConfig = {
  logo_r2_key: string | null
  opacity: number
  scale: number
  gravity: string
  strip_count: number
}

const DEFAULTS: StoreConfig = {
  logo_r2_key: null,
  opacity: 0.35,
  scale: 0.18,
  gravity: 'southeast',
  strip_count: 6,
}

// A mutable "server" store behind the fetch stub so tests exercise the
// load → edit → save → reload contract, not canned responses.
function makeStore() {
  return {
    cfg: { ...DEFAULTS },
    putBodies: [] as Record<string, unknown>[],
    uploadedKey: null as string | null,
  }
}

describe('Admin Suits Designs watermark settings', () => {
  let store: ReturnType<typeof makeStore>
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sessionStorage.clear()
    sessionStorage.setItem('admin_key', 'k-test')
    store = makeStore()
    fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'

      // Presigned R2 PUT — resolves before the API PUT in the upload flow.
      if (url === 'https://r2.example/put') {
        return { ok: true, status: 200, json: async () => ({}) }
      }
      // Every mutating admin call first exchanges a CSRF token (admin-fetch).
      if (method === 'GET' && url.endsWith('/csrf-token')) {
        return { ok: true, status: 200, json: async () => ({ data: { csrf_token: 'csrf-test' } }) }
      }
      if (method === 'GET' && url.endsWith('/settings/showcase-watermark')) {
        const logoUrl = store.cfg.logo_r2_key ? `https://cdn.example.com/${store.cfg.logo_r2_key}` : null
        return { ok: true, status: 200, json: async () => ({ data: { ...store.cfg, logo_url: logoUrl } }) }
      }
      if (method === 'POST' && url.endsWith('/settings/showcase-watermark/logo-upload-url')) {
        const key = 'showcase-watermark/logo/abc123.png'
        store.uploadedKey = key
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              upload_url: 'https://r2.example/put',
              r2_key: key,
              public_url: `https://cdn.example.com/${key}`,
              expires_in: 300,
            },
          }),
        }
      }
      if (method === 'PUT' && url.endsWith('/settings/showcase-watermark')) {
        const body = JSON.parse(String(init!.body)) as Record<string, unknown>
        store.putBodies.push(body)
        store.cfg = {
          logo_r2_key: (body.logo_r2_key as string | null) ?? null,
          opacity: body.opacity as number,
          scale: body.scale as number,
          gravity: body.gravity as string,
          strip_count: body.strip_count as number,
        }
        const logoUrl = store.cfg.logo_r2_key ? `https://cdn.example.com/${store.cfg.logo_r2_key}` : null
        return { ok: true, status: 200, json: async () => ({ data: { ...store.cfg, logo_url: logoUrl } }) }
      }
      return { ok: true, status: 404, json: async () => ({ error: { message: `unhandled ${method} ${url}` } }) }
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const saveButton = () => screen.getByRole('button', { name: /Save watermark/ })

  it('renders the code defaults from the GET (built-in logo, 35%, 18%, bottom-right, 6)', async () => {
    render(<ShowcaseWatermarkSettings />)
    expect(await screen.findByText(/Built-in Kanchuki logo/)).toBeInTheDocument()
    expect(await screen.findByText('35%')).toBeInTheDocument()
    expect(await screen.findByText('18%')).toBeInTheDocument()
    expect(await screen.findByLabelText('Watermark corner')).toHaveValue('southeast')
    expect(await screen.findByLabelText('Designs shown before View more')).toHaveValue(6)
    expect(saveButton()).toBeDisabled()
  })

  it('editing sliders/select/strip enables Save and PUTs the full config', async () => {
    render(<ShowcaseWatermarkSettings />)
    await screen.findByLabelText('Watermark corner')

    fireEvent.change(screen.getByLabelText('Watermark opacity'), { target: { value: '60' } })
    fireEvent.change(screen.getByLabelText('Watermark logo width'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Watermark corner'), { target: { value: 'southwest' } })
    fireEvent.change(screen.getByLabelText('Designs shown before View more'), { target: { value: '9' } })
    expect(await screen.findByText('60%')).toBeInTheDocument()
    expect(await screen.findByText('30%')).toBeInTheDocument()
    expect(saveButton()).not.toBeDisabled()

    fireEvent.click(saveButton())
    await waitFor(() => expect(store.putBodies).toHaveLength(1))
    expect(store.putBodies[0]).toEqual({
      logo_r2_key: null,
      opacity: 0.6,
      scale: 0.3,
      gravity: 'southwest',
      strip_count: 9,
    })
    expect(await screen.findByText(/saved — new design uploads use it/)).toBeInTheDocument()
    // After the response syncs saved + draft, the button goes back to disabled.
    await waitFor(() => expect(saveButton()).toBeDisabled())
  })

  it('uploading a logo presigns, PUTs to R2, previews the custom logo, and Save persists the key', async () => {
    render(<ShowcaseWatermarkSettings />)
    await screen.findByText(/Built-in Kanchuki logo/)

    const file = new File(['logo'], 'brand-logo.png', { type: 'image/png' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(store.uploadedKey).toBe('showcase-watermark/logo/abc123.png'))
    expect(await screen.findByText(/Logo uploaded — press Save/)).toBeInTheDocument()
    expect(await screen.findByText(/Custom logo/)).toBeInTheDocument()

    fireEvent.click(saveButton())
    await waitFor(() => expect(store.putBodies).toHaveLength(1))
    expect(store.putBodies[0]).toMatchObject({ logo_r2_key: 'showcase-watermark/logo/abc123.png' })
    // The custom logo preview persists after the save round-trip.
    expect(await screen.findByText(/Custom logo/)).toBeInTheDocument()
  })

  it('“Use built-in logo” clears a custom key and Save PUTs null', async () => {
    store.cfg = {
      logo_r2_key: 'showcase-watermark/logo/existing.png',
      opacity: 0.4,
      scale: 0.2,
      gravity: 'southeast',
      strip_count: 6,
    }
    render(<ShowcaseWatermarkSettings />)
    expect(await screen.findByText(/Custom logo/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Use built-in logo/ }))
    expect(await screen.findByText(/Built-in Kanchuki logo selected/)).toBeInTheDocument()

    fireEvent.click(saveButton())
    await waitFor(() => expect(store.putBodies).toHaveLength(1))
    expect(store.putBodies[0]).toMatchObject({ logo_r2_key: null })
  })

  it('surfaces a load failure instead of crashing', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
    render(<ShowcaseWatermarkSettings />)
    expect(await screen.findByText(/HTTP 500/)).toBeInTheDocument()
  })
})
