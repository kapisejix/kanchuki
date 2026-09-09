import { describe, expect, it } from 'vitest'
import { buildStaffInviteMessage } from './staff-invite'

// FR-6.1 (docs/tasks/team-member-access-control.md): after a successful add,
// the retailer gets a share/copy prompt — client-side only, NO SMS (cost +
// DLT). This pins the exact message copy.
describe('buildStaffInviteMessage (FR-6.1)', () => {
  it('includes the member name, shop name and phone number', () => {
    expect(buildStaffInviteMessage('Ramesh', '9876543210', 'Ramesh Textiles')).toBe(
      'Ramesh can now log in to the Ramesh Textiles app with their phone number 9876543210.',
    )
  })

  it('falls back to "store" when the shop name is missing or blank', () => {
    expect(buildStaffInviteMessage('Meera', '9812345670', null)).toContain(
      'log in to the store app',
    )
    expect(buildStaffInviteMessage('Meera', '9812345670', '   ')).toContain(
      'log in to the store app',
    )
  })

  it('trims whitespace around the shop name', () => {
    expect(buildStaffInviteMessage('Ramesh', '9876543210', '  Ramesh Textiles  ')).toBe(
      'Ramesh can now log in to the Ramesh Textiles app with their phone number 9876543210.',
    )
  })
})