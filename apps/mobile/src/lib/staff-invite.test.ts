import { describe, expect, it } from 'vitest'
import { buildStaffInviteMessage, buildWhatsAppInviteUrl } from './staff-invite'

// Tokenized invite (docs/tasks/staff-invite-tokens.md §6.4): after a
// successful add, the retailer shares the invite LINK — the phone is no
// longer the payload. This pins the exact message copy.
describe('buildStaffInviteMessage (staff-invite-tokens)', () => {
  it('includes the member name, shop, role and the invite link', () => {
    expect(
      buildStaffInviteMessage(
        'Ramesh',
        'manager',
        'Ramesh Textiles',
        'kanchuki://join?token=abc123',
      ),
    ).toBe(
      "Ramesh, you've been added to Ramesh Textiles as manager. Tap to join: kanchuki://join?token=abc123",
    )
  })

  it('labels salesperson as "team member"', () => {
    expect(
      buildStaffInviteMessage('Meera', 'salesperson', 'Meera Boutique', 'kanchuki://join?token=x'),
    ).toContain('as team member. Tap to join: kanchuki://join?token=x')
  })

  it('falls back to "store" when the shop name is missing or blank', () => {
    expect(
      buildStaffInviteMessage('Meera', 'salesperson', null, 'kanchuki://join?token=x'),
    ).toContain('added to store as team member')
    expect(
      buildStaffInviteMessage('Meera', 'salesperson', '   ', 'kanchuki://join?token=x'),
    ).toContain('added to store as team member')
  })

  it('trims whitespace around the shop name', () => {
    expect(
      buildStaffInviteMessage(
        'Ramesh',
        'manager',
        '  Ramesh Textiles  ',
        'kanchuki://join?token=x',
      ),
    ).toContain('added to Ramesh Textiles as manager')
  })
})

// Free, client-side WhatsApp delivery (no MSG91 / Meta API / DLT): the
// retailer's OWN WhatsApp app opens with the invite pre-filled to the
// member's number. wa.me falls back to WhatsApp Web when the app is missing.
describe('buildWhatsAppInviteUrl (staff-invite-tokens §3.1)', () => {
  it('targets the member phone with the invite message pre-filled', () => {
    const message =
      "Ramesh, you've been added to Ramesh Textiles as manager. Tap to join: kanchuki://join?token=abc123"
    expect(buildWhatsAppInviteUrl('9876543210', message)).toBe(
      `https://wa.me/919876543210?text=${encodeURIComponent(message)}`,
    )
  })

  it('normalizes a phone with separators / country prefix to the 91+10 form', () => {
    expect(buildWhatsAppInviteUrl('+91 98765 43210', 'hi')).toBe(
      'https://wa.me/919876543210?text=hi',
    )
  })
})