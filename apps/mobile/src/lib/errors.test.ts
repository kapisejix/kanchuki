import { describe, it, expect } from 'vitest'
import { apiMessage } from './errors'
import { ApiError } from './api/api-error'

// RC-114: onboarding (and RC-003/RC-009 before it) replaced the server's reason with a
// constant string, so a 422 "invalid GSTIN" read as "check your connection".
describe('apiMessage', () => {
  const fallback = 'Could not save details.'

  it('shows the server message for a 422 validation error', () => {
    const err = new ApiError('VALIDATION_ERROR', 'GSTIN must be 15 characters', 422)
    expect(apiMessage(err, fallback)).toBe('GSTIN must be 15 characters')
  })

  it('shows the server message for other actionable 4xx (400, 403, 409)', () => {
    for (const status of [400, 403, 409]) {
      expect(apiMessage(new ApiError('X', 'reason', status), fallback)).toBe('reason')
    }
  })

  it('keeps 401 generic (session expiry is handled by the refresh/redirect path)', () => {
    expect(apiMessage(new ApiError('UNAUTHORIZED', 'jwt expired', 401), fallback)).toBe(fallback)
  })

  it('keeps 408 generic (its message embeds the request URL)', () => {
    const err = new ApiError('TIMEOUT', 'Request timed out (/v1/x) at http://10.0.0.1', 408)
    expect(apiMessage(err, fallback)).toBe(fallback)
  })

  it('keeps network failures (status 0) generic', () => {
    const err = new ApiError('NETWORK_ERROR', 'Network request failed to http://10.0.0.1/v1/x', 0)
    expect(apiMessage(err, fallback)).toBe(fallback)
  })

  it('keeps 5xx generic', () => {
    expect(apiMessage(new ApiError('INTERNAL', 'stack trace here', 500), fallback)).toBe(fallback)
  })

  it('keeps non-ApiError throws generic', () => {
    expect(apiMessage(new Error('boom'), fallback)).toBe(fallback)
    expect(apiMessage('boom', fallback)).toBe(fallback)
  })
})
