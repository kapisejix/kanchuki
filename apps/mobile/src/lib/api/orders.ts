import { request } from './client'

// ─── Orders (F-302) ──────────────────────────────────────────────

export type OrderItem = {
  id: string
  product_name_snapshot: string | null
  price_snapshot: number
  quantity: number
  product_id: string
}

export type ShippingAddress = {
  line1: string
  line2?: string
  city: string
  state: string
  pincode: string
}

export type Order = {
  id: string
  customer_name: string | null
  customer_phone: string | null
  status: 'PENDING_PAYMENT' | 'PAID' | 'FULFILLED' | 'CANCELLED'
  total_amount: number
  subtotal_amount: number
  gst_amount: number
  gst_invoice_number: string | null
  razorpay_payment_id: string | null
  paid_at: string | null
  created_at: string
  updated_at: string
  cancelled_at: string | null
  items: OrderItem[]
}

export type OrderDetail = Order & {
  shipping_address: ShippingAddress
  payment_mode: string
  razorpay_order_id: string | null
  collection_id: string | null
}

export const ordersApi = {
  /** List all orders for the current retailer */
  list: () =>
    request<{ data: Order[] }>('/v1/retailers/orders', { getCacheTtlMs: 10_000 }),

  /** Get full order detail with shipping address and payment info */
  get: (id: string) =>
    request<{ data: OrderDetail }>(`/v1/retailers/orders/${id}`, { getCacheTtlMs: 10_000 }),

  /** Update order fulfillment status (FULFILLED or CANCELLED) */
  updateStatus: (id: string, status: 'FULFILLED' | 'CANCELLED') =>
    request<{ data: { id: string; status: string } }>(
      `/v1/retailers/orders/${id}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      },
    ),
}
