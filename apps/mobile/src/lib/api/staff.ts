import { request } from './client'

// ─── Staff / Team (F-009) ────────────────────────────────────────

export type StaffMember = {
  id: string
  name: string
  phone: string
  role: 'owner' | 'manager' | 'salesperson'
  is_active: boolean
  created_at: string
}

export const staffApi = {
  list: () =>
    request<{ data: StaffMember[] }>('/v1/staff', { getCacheTtlMs: 15_000 }),

  create: (data: { name: string; phone: string; role?: string }) =>
    request<{ data: StaffMember }>('/v1/staff', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: { name?: string; phone?: string; role?: string }) =>
    request<{ data: StaffMember }>(`/v1/staff/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) => request<void>(`/v1/staff/${id}`, { method: 'DELETE' }),
}
