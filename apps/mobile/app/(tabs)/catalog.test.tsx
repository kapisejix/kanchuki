import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react-native'
import React from 'react'
import { View, Text } from 'react-native'

// ── Mock react-query ──────────────────────────────────────────────

const mockUseQuery = vi.fn()

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

// ── Mock the API module ────────────────────────────────────────────

vi.mock('../../src/lib/api', () => ({
  productApi: {
    list: vi.fn(),
    search: vi.fn(),
    updateStatus: vi.fn(),
  },
}))

import CatalogScreen from './catalog'

// ── Sample products for testing ───────────────────────────────────

const sampleProducts = [
  {
    id: 'prod_1',
    category: 'Kurti',
    primary_color: 'Pink',
    price_min: 199900,
    price_max: 299900,
    status: 'AVAILABLE',
    primary_photo_url: 'https://cdn.example.com/kurti-pink.jpg',
    section: { name: 'Rack A' },
    location_notes: null,
    ai_tagged: true,
  },
  {
    id: 'prod_2',
    category: 'Saree',
    primary_color: 'Red',
    price_min: 850000,
    price_max: 850000,
    status: 'SOLD',
    primary_photo_url: 'https://cdn.example.com/saree-red.jpg',
    section: null,
    location_notes: null,
    ai_tagged: true,
  },
  {
    id: 'prod_3',
    category: 'Lehenga',
    primary_color: 'Gold',
    price_min: 1500000,
    price_max: 2500000,
    status: 'AVAILABLE',
    primary_photo_url: null,
    section: { name: 'Rack B · Row 1' },
    location_notes: null,
    ai_tagged: false,
  },
]

// ── Helpers ────────────────────────────────────────────────────────

function mockProducts(products = sampleProducts) {
  mockUseQuery.mockReturnValue({
    data: { data: products, pagination: { cursor: null, has_more: false } },
    isLoading: false,
  })
}

function mockLoading() {
  mockUseQuery.mockReturnValue({
    data: undefined,
    isLoading: true,
  })
}

function mockEmpty() {
  mockUseQuery.mockReturnValue({
    data: { data: [], pagination: { cursor: null, has_more: false } },
    isLoading: false,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Tests ──────────────────────────────────────────────────────────

describe('CatalogScreen', () => {
  it('renders loading spinner while fetching', () => {
    mockLoading()
    const tree = render(React.createElement(CatalogScreen))
    expect(tree.toJSON()).toMatchSnapshot('loading-state')
  })

  it('renders empty state when no products', () => {
    mockEmpty()
    const tree = render(React.createElement(CatalogScreen))
    expect(tree.toJSON()).toMatchSnapshot('empty-state')
  })

  it('renders product grid with items', () => {
    mockProducts()
    const tree = render(React.createElement(CatalogScreen))
    expect(tree.toJSON()).toMatchSnapshot('product-grid')
  })

  it('renders mixed products: available, sold, untagged', () => {
    mockProducts([
      {
        id: 'prod_1',
        category: 'Kurti',
        primary_color: 'Pink',
        price_min: 199900,
        price_max: 299900,
        status: 'AVAILABLE',
        primary_photo_url: 'https://cdn.example.com/kurti.jpg',
        section: { name: 'Rack A' },
        location_notes: null,
        ai_tagged: true,
      },
      {
        id: 'prod_2',
        category: 'Saree',
        primary_color: 'Red',
        price_min: 850000,
        price_max: 850000,
        status: 'SOLD',
        primary_photo_url: 'https://cdn.example.com/saree.jpg',
        section: null,
        location_notes: null,
        ai_tagged: true,
      },
      {
        id: 'prod_3',
        category: 'Lehenga',
        primary_color: 'Gold',
        price_min: 1500000,
        price_max: 2500000,
        status: 'RESERVED',
        primary_photo_url: null,
        section: { name: 'Rack B' },
        location_notes: null,
        ai_tagged: false,
      },
      {
        id: 'prod_4',
        category: 'Ladies Suit',
        primary_color: 'Navy',
        price_min: 245000,
        price_max: 245000,
        status: 'AVAILABLE',
        primary_photo_url: 'https://cdn.example.com/suit.jpg',
        section: { name: 'Rack C' },
        location_notes: null,
        ai_tagged: true,
      },
    ])
    const tree = render(React.createElement(CatalogScreen))
    expect(tree.toJSON()).toMatchSnapshot('mixed-products')
  })
})
