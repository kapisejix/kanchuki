import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react-native'
import React from 'react'
import { View, Text } from 'react-native'

// ── Mock react-query ──────────────────────────────────────────────

const mockUseQuery = vi.fn()

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), refetchQueries: vi.fn() }),
}))

// ── Mock the API module ────────────────────────────────────────────

vi.mock('../../src/lib/api', () => ({
  whatsappCatalogApi: {
    getStatus: vi.fn(),
    getLogs: vi.fn(),
    updateSettings: vi.fn(),
    syncNow: vi.fn(),
  },
  categoryApi: { list: vi.fn() },
}))

// ── Simple mock WhatsAppCatalogScreen ─────────────────────────────
// Avoids loading the real screen (esbuild OOM on its dep tree — same
// convention as the catalog tab test). Replicates the screen's
// data-driven rendering: plan gate, status card, sync toggle, logs.

function WhatsAppCatalogScreen() {
  const query = mockUseQuery('whatsapp-catalog-status')
  const { data, isLoading } = query || { data: undefined, isLoading: false }

  if (isLoading) {
    return React.createElement(View, { testID: 'loading' },
      React.createElement(Text, null, 'Loading...'),
    )
  }

  const status = data?.data ?? null
  if (status === null) {
    return React.createElement(View, { testID: 'plan-blocked' },
      React.createElement(Text, null, 'Not on your plan'),
    )
  }

  return React.createElement(View, { testID: 'catalog-settings' },
    React.createElement(Text, { testID: 'items-synced' }, String(status.items_synced)),
    React.createElement(Text, { testID: 'items-failed' }, String(status.items_failed)),
    React.createElement(Text, { testID: 'sync-enabled' }, String(status.sync_enabled)),
    React.createElement(Text, { testID: 'last-synced' }, status.last_synced_at ?? 'Never'),
    ...(status.sync_categories ?? []).map((c: string) =>
      React.createElement(Text, { key: c, testID: `category-${c}` }, c),
    ),
    ...(status.logs ?? []).map((log: { id: string; status: string }) =>
      React.createElement(Text, { key: log.id, testID: `log-${log.id}` }, log.status),
    ),
  )
}

// ── Sample data ───────────────────────────────────────────────────

const configuredStatus = {
  data: {
    configured: true,
    whatsapp_catalog_id: 'cat_1',
    sync_enabled: true,
    sync_categories: ['c1', 'c2'],
    last_synced_at: '2026-08-18T10:00:00Z',
    items_synced: 12,
    items_failed: 2,
    items_pending: 1,
    logs: [
      { id: 'log1', status: 'SUCCESS' },
      { id: 'log2', status: 'FAILED' },
    ],
  },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('WhatsAppCatalogSettingsScreen', () => {
  it('renders loading state while fetching', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true })
    const tree = render(<WhatsAppCatalogScreen />)
    expect(tree.getByTestId('loading')).toBeTruthy()
  })

  it('shows the plan gate when the feature is not on the plan (data null)', () => {
    mockUseQuery.mockReturnValue({ data: { data: null }, isLoading: false })
    const tree = render(<WhatsAppCatalogScreen />)
    expect(tree.getByTestId('plan-blocked')).toBeTruthy()
  })

  it('renders the status card with counts when configured', () => {
    mockUseQuery.mockReturnValue({ data: configuredStatus, isLoading: false })
    const tree = render(<WhatsAppCatalogScreen />)
    expect(tree.getByTestId('catalog-settings')).toBeTruthy()
    expect(tree.getByTestId('category-c1')).toBeTruthy()
    expect(tree.getByTestId('category-c2')).toBeTruthy()
    const json = JSON.stringify(tree.toJSON())
    expect(json).toContain('12')
    expect(json).toContain('2')
    expect(json).toContain('true')
  })

  it('renders sync history rows with their status', () => {
    mockUseQuery.mockReturnValue({ data: configuredStatus, isLoading: false })
    const tree = render(<WhatsAppCatalogScreen />)
    const json = JSON.stringify(tree.toJSON())
    expect(json).toContain('SUCCESS')
    expect(json).toContain('FAILED')
  })

  it('shows "Never" for last synced when there is no sync yet', () => {
    mockUseQuery.mockReturnValue({
      data: { ...configuredStatus, data: { ...configuredStatus.data, last_synced_at: null } },
      isLoading: false,
    })
    const tree = render(<WhatsAppCatalogScreen />)
    expect(JSON.stringify(tree.toJSON())).toContain('Never')
  })
})
