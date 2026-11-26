import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ NativeModules: {} }));
vi.mock('../../src/lib/api/auth', () => ({ authApi: { widgetConfig: vi.fn() } }));

import { extractMsg91ReqId } from '../../src/lib/msg91-otp';

describe('extractMsg91ReqId', () => {
  it('reads the request id from a successful SDK sendOTP message', () => {
    expect(extractMsg91ReqId({ type: 'success', message: '3463abcdef0123456789' })).toBe(
      '3463abcdef0123456789',
    );
  });

  it('does not treat status or error text as a request id', () => {
    expect(extractMsg91ReqId({ type: 'success', message: 'OTP verified' })).toBeUndefined();
    expect(extractMsg91ReqId({ type: 'error', message: '3463abcdef0123456789' })).toBeUndefined();
  });

  it('still prefers an explicit reqId field', () => {
    expect(
      extractMsg91ReqId({ type: 'success', reqId: 'explicit', message: '3463abcdef0123456789' }),
    ).toBe('explicit');
  });
});
