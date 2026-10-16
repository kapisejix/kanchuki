import { request } from './client';

// Retailer support tickets — docs/tasks/pending/support-and-feedback-loop.md §1.
// Catalog-upload tickets have their own client (catalog-upload.ts).

export type SupportTicketType = 'GENERAL' | 'DEMO' | 'GROWTH_SETUP' | 'MAINTENANCE';
export type SupportTicketStatus = 'OPEN' | 'ASSIGNED' | 'RESOLVED' | 'CLOSED';

export type SupportTicket = {
  id: string;
  ticket_type: SupportTicketType;
  requires_visit: boolean;
  status: SupportTicketStatus;
  note: string | null;
  created_at: string;
  resolved_at: string | null;
  assigned_to: { name: string } | null;
};

export const ticketApi = {
  list: () =>
    request<{ data: SupportTicket[] }>('/v1/retailers/me/tickets', { getCacheTtlMs: 10_000 }),
  create: (data: { ticket_type: SupportTicketType; note: string; requires_visit: boolean }) =>
    request<{ data: SupportTicket }>('/v1/retailers/me/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
