import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckoutForm } from '../CheckoutForm';

// next/image renders through Next's optimizer config which jsdom doesn't
// provide — mock to a plain <img> carrying the alt text (same as the other
// customer-page component tests).
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, className }: { src: string; alt?: string | null; className?: string }) => (
    <img src={src} alt={alt ?? ''} className={className} />
  ),
}));

const SLUG = 'festive-edit';
const CART_ITEMS = [
  {
    id: 'prod-1',
    name: 'Festive Kurti',
    price_min: 120000,
    category: 'Kurti',
    primary_photo_url: 'https://cdn-test.r2.dev/kurti.jpg',
    quantity: 1,
  },
];

function seedCart() {
  localStorage.setItem(`kanchuki_cart_${SLUG}`, JSON.stringify(CART_ITEMS));
}

const baseProps = {
  slug: SLUG,
  shopName: 'Meera Sarees',
  retailerPhone: '919999999999',
};

describe('CheckoutForm payment-gateway gate', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('hides the payment form and shows a WhatsApp fallback when checkout is disabled', async () => {
    seedCart();
    render(<CheckoutForm {...baseProps} checkoutEnabled={false} />);

    // Order summary still shows the customer's cart items.
    expect(await screen.findByText('Festive Kurti')).toBeInTheDocument();
    expect(screen.getByText('₹1,200/-')).toBeInTheDocument();

    // The payment form must not render.
    expect(screen.queryByText('Delivery Address')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pay/ })).not.toBeInTheDocument();

    // The unavailable card explains the state and offers a WhatsApp path with
    // the cart contents pre-filled.
    expect(screen.getByText('Online checkout is unavailable')).toBeInTheDocument();
    const waLink = screen.getByRole('link', { name: 'Enquire on WhatsApp' });
    expect(waLink).toHaveAttribute('href', expect.stringContaining('wa.me/919999999999'));
    // The pre-filled message is URL-encoded — the item name must survive it.
    expect(waLink).toHaveAttribute('href', expect.stringContaining('Festive%20Kurti'));

    // Catalog remains reachable.
    expect(screen.getByRole('link', { name: 'Browse catalog' })).toHaveAttribute(
      'href',
      `/c/${SLUG}`,
    );

    // No point loading the Razorpay SDK for a store that can't check out.
    expect(document.getElementById('razorpay-script')).toBeNull();
  });

  it('renders the full payment form when checkout is enabled', async () => {
    seedCart();
    render(<CheckoutForm {...baseProps} checkoutEnabled={true} />);

    expect(await screen.findByText('Delivery Address')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pay ₹1,200\/-/ })).toBeInTheDocument();
    expect(screen.queryByText('Online checkout is unavailable')).not.toBeInTheDocument();
  });
});
