import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PickedForYou } from '../PickedForYou';

const fetchMock = vi.fn();

vi.mock('../../lib/currentVisit', () => ({
  loadCurrentVisitProductIds: vi.fn(() => ['seen-store-a']),
  subscribeCurrentVisit: vi.fn((_slug: string, callback: () => void) => {
    window.addEventListener('test-current-visit-updated', callback);
    return () => window.removeEventListener('test-current-visit-updated', callback);
  }),
}));

vi.mock('../../lib/pickedForYou', () => ({
  fetchPickedForYou: (...args: unknown[]) => fetchMock(...args),
}));

vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt }: { alt?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element -- test mock of next/image
    <img alt={alt ?? ''} />
  ),
}));

const pick = {
  id: 'store-a-pick',
  name: 'Maroon Silk Saree',
  category: 'Saree',
  subtype: null,
  price_min: 120000,
  price_max: 130000,
  status: 'AVAILABLE' as const,
  is_new_arrival: false,
  on_sale: false,
  primary_color: 'Maroon',
  location: null,
  primary_photo_url: 'https://cdn.test/pick.jpg',
  has_360: false,
  avg_rating: 0,
  rating_count: 0,
};

beforeEach(() => {
  fetchMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PickedForYou', () => {
  it('renders products from the selected store and opens the selected product', async () => {
    fetchMock.mockResolvedValue({ personalized: true, products: [pick] });
    const onProductTap = vi.fn();

    render(<PickedForYou storeSlug="store-a" onProductTap={onProductTap} />);

    expect(await screen.findByRole('heading', { name: 'Picked for you' })).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'View Maroon Silk Saree' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Based on your activity in this store')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('store-a', ['seen-store-a']);
    fireEvent.click(screen.getByRole('button', { name: 'View Maroon Silk Saree' }));
    expect(onProductTap).toHaveBeenCalledWith(pick);
  });

  it('reloads only after the matching tab-scoped store visit changes', async () => {
    fetchMock.mockResolvedValue({ personalized: false, products: [pick] });

    render(<PickedForYou storeSlug="store-a" onProductTap={() => undefined} />);
    await screen.findByRole('button', { name: 'View Maroon Silk Saree' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event('test-current-visit-updated'));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith('store-a', ['seen-store-a']);
  });

  it('labels the catalog-order fallback honestly when the API has no usable signals', async () => {
    fetchMock.mockResolvedValue({ personalized: false, products: [pick] });
    render(<PickedForYou storeSlug="store-a" onProductTap={() => undefined} />);

    expect(await screen.findByRole('heading', { name: 'From this store' })).toBeInTheDocument();
    expect(screen.getByText('More available styles')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'View Maroon Silk Saree' }),
    ).toBeInTheDocument();
  });

  it('keeps an empty feed hidden and offers retry for an API error', async () => {
    fetchMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ personalized: false, products: [] });
    render(<PickedForYou storeSlug="store-a" onProductTap={() => undefined} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load picks right now.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /View / })).not.toBeInTheDocument();
  });

  it('renders nothing without a store slug', () => {
    render(<PickedForYou storeSlug={null} onProductTap={() => undefined} />);
    expect(screen.queryByRole('heading', { name: 'Picked for you' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'From this store' })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
