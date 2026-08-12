/**
 * MSG91 web OTP widget wrapper — pure-helper tests (2026-08-12).
 *
 * The flow wrappers (send/verify/retry) depend on the third-party widget's
 * window.* globals and can't run headless — they're thin promise/callback
 * bridges over the extraction helpers tested here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  delete process.env['NEXT_PUBLIC_MSG91_WIDGET_ID'];
  delete process.env['NEXT_PUBLIC_MSG91_TOKEN_AUTH'];
});

describe('extractReqId', () => {
  it('extracts a string reqId from the top level', async () => {
    const { extractReqId } = await import('../msg91-widget');
    expect(extractReqId({ reqId: '336870744532313134323444' })).toBe(
      '336870744532313134323444',
    );
  });

  it('coerces a numeric reqId (MSG91 has returned numbers in some versions)', async () => {
    const { extractReqId } = await import('../msg91-widget');
    expect(extractReqId({ reqId: 3368707445323131 })).toBe('3368707445323131');
  });

  it('reads reqId nested under data/result', async () => {
    const { extractReqId } = await import('../msg91-widget');
    expect(extractReqId({ data: { req_id: 'nested-id' } })).toBe('nested-id');
    expect(extractReqId({ result: { reqId: 'result-id' } })).toBe('result-id');
  });

  it('returns undefined when absent', async () => {
    const { extractReqId } = await import('../msg91-widget');
    expect(extractReqId({ message: 'OTP sent successfully' })).toBeUndefined();
    expect(extractReqId(null)).toBeUndefined();
    expect(extractReqId('just a string')).toBeUndefined();
  });
});

describe('extractAccessToken', () => {
  it('extracts the JWT from the message field (docs shape)', async () => {
    const { extractAccessToken } = await import('../msg91-widget');
    expect(extractAccessToken({ message: 'header.payload.signature' })).toBe(
      'header.payload.signature',
    );
  });

  it('extracts from token / access_token / nested data', async () => {
    const { extractAccessToken } = await import('../msg91-widget');
    expect(extractAccessToken({ token: 'a.b.c' })).toBe('a.b.c');
    expect(extractAccessToken({ access_token: 'a.b.c' })).toBe('a.b.c');
    expect(extractAccessToken({ data: { accessToken: 'a.b.c' } })).toBe('a.b.c');
  });

  it('ignores non-JWT strings (e.g. "OTP verified" messages)', async () => {
    const { extractAccessToken } = await import('../msg91-widget');
    expect(extractAccessToken({ message: 'OTP verified successfully' })).toBeUndefined();
  });

  it('never mistakes a single-dot payload for a token', async () => {
    const { extractAccessToken } = await import('../msg91-widget');
    expect(extractAccessToken({ message: 'a.b' })).toBeUndefined();
  });
});

describe('widgetErrorMessage', () => {
  it('surfaces a string error directly', async () => {
    const { widgetErrorMessage } = await import('../msg91-widget');
    expect(widgetErrorMessage('Invalid OTP', 'fallback')).toBe('Invalid OTP');
  });

  it('reads message/error/reason from an object payload', async () => {
    const { widgetErrorMessage } = await import('../msg91-widget');
    expect(widgetErrorMessage({ message: 'rate limited' }, 'fallback')).toBe('rate limited');
    expect(widgetErrorMessage({ error: 'wrong code' }, 'fallback')).toBe('wrong code');
    expect(widgetErrorMessage({ reason: 'expired' }, 'fallback')).toBe('expired');
  });

  it('falls back for opaque payloads', async () => {
    const { widgetErrorMessage } = await import('../msg91-widget');
    expect(widgetErrorMessage(42, 'fallback')).toBe('fallback');
    expect(widgetErrorMessage(null, 'fallback')).toBe('fallback');
  });
});

describe('isMsg91WidgetConfigured', () => {
  it('is true when both build vars are set', async () => {
    process.env['NEXT_PUBLIC_MSG91_WIDGET_ID'] = 'widget-id';
    process.env['NEXT_PUBLIC_MSG91_TOKEN_AUTH'] = 'token-auth';
    const { isMsg91WidgetConfigured } = await import('../msg91-widget');
    expect(isMsg91WidgetConfigured()).toBe(true);
  });

  it('is false when either var is missing', async () => {
    process.env['NEXT_PUBLIC_MSG91_WIDGET_ID'] = 'widget-id';
    const { isMsg91WidgetConfigured } = await import('../msg91-widget');
    expect(isMsg91WidgetConfigured()).toBe(false);
  });
});
