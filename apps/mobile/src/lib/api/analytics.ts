import { request } from './client'

export const analyticsApi = {
  getAnalytics: () =>
    request<{
      data: {
        daily_trends: { date: string; views: number; enquiries: number }[]
        category_breakdown: { category: string; count: number }[]
        status_breakdown: { status: string; count: number }[]
        recent_collections: {
          id: string
          title: string
          slug: string
          status: string
          view_count: number
          enquiry_count: number
          favorite_count: number
          product_count: number
          created_at: string
        }[]
        plan: {
          plan: string
          plan_status: string
          max_products: number
          max_customers: number
          try_on_credits: number
        } | null
      }
    }>('/v1/retailers/me/analytics', { getCacheTtlMs: 60_000 }),
}
