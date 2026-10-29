import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Alert } from 'react-native'
import { apiMessage, showError } from './errors'
import { ApiError } from './api/api-error'

;(globalThis as Record<string, unknown>).__DEV__ = false

// RC-117: showError(err, fallback) took err but only ever showed fallback, so ~60 call sites
// dropped the server's 4xx reason (RC-114 shape). The rule now lives in showError itself.
describe('showError', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows the server reason for an actionable 4xx', () => {
    const spy = vi.spyOn(Alert, 'alert')
    showError(new ApiError('CONFLICT', 'You already have 5 open tickets', 409), 'Could not raise your ticket.')
    expect(spy).toHaveBeenCalledWith('Error', 'You already have 5 open tickets', undefined)
  })

  it('keeps the fallback for 5xx, network, 401 and plain errors', () => {
    const spy = vi.spyOn(Alert, 'alert')
    for (const err of [
      new ApiError('INTERNAL', 'stack trace here', 500),
      new ApiError('NETWORK_ERROR', 'Network request failed to http://10.0.0.1', 0),
      new ApiError('UNAUTHORIZED', 'jwt expired', 401),
      new Error('boom'),
    ]) {
      showError(err, 'Try again.')
    }
    expect(spy.mock.calls.map((c) => c[1])).toEqual(['Try again.', 'Try again.', 'Try again.', 'Try again.'])
  })
})

// Screens that turn an API error into text must go through apiMessage/showError: a raw
// `err.message` shows 5xx bodies and the 408 request URL to the user.
describe('raw err.message on screens', () => {
  const root = resolve(__dirname, '../../app')
  const files = [
    'growth/aggregators.tsx',
    'growth/templates.tsx',
    'plan-select.tsx',
    'settings/index.tsx',
    'product/try-on.tsx',
    'settings/staff.tsx',
    'settings/help-support.tsx',
    'auth/otp.tsx',
    'enquiry-try-on.tsx',
  ]
  it.each(files)('%s has no `err instanceof Error ? err.message` or inline 4xx ladder', (f) => {
    const src = readFileSync(resolve(root, f), 'utf8')
    expect(src).not.toMatch(/\berr instanceof Error \? err\.message/)
    expect(src).not.toMatch(/err\.status >= 400 && err\.status < 500/)
    expect(src).not.toMatch(/err instanceof ApiError \? err\.message/)
  })
  it('bare catch{} in otp resend and try-on payment now reports through showError', () => {
    expect(readFileSync(resolve(root, 'auth/otp.tsx'), 'utf8')).toMatch(/showError\(err, 'Failed to resend OTP'\)/)
    expect(readFileSync(resolve(root, 'enquiry-try-on.tsx'), 'utf8')).toMatch(/showError\(err, 'Please try again/)
  })
})

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
