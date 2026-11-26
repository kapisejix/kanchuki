import Module from 'node:module';
import { router } from 'expo-router';
import React from 'react';
import { TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// app/auth/phone.tsx (T3.2-a #1). Pins RC-015 (one OTP send per tap burst) and
// RC-021 (widget and classic API never both dispatch). The API client, MSG91
// widget and router are the only seams swapped; validation and the send flow
// stay REAL.
const mockSendOtp = vi.hoisted(() => vi.fn());
const mockWidgetConfigured = vi.hoisted(() => vi.fn());
const mockWidgetSend = vi.hoisted(() => vi.fn());

vi.mock('expo-router', () => ({
  router: { replace: vi.fn(), push: vi.fn(), back: vi.fn() },
}));

vi.mock('../../src/lib/api', () => ({
  authApi: { sendOtp: mockSendOtp },
  // Mirrors src/lib/api/client.ts (code, message, status).
  ApiError: class extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

vi.mock('../../src/lib/api/client', () => ({ API_URL: 'https://api.test' }));
vi.mock('../../src/lib/web-url', () => ({ WEB_URL: 'https://web.test' }));
vi.mock('../../src/lib/errors', () => ({ logError: vi.fn(), showError: vi.fn() }));

vi.mock('../../src/lib/msg91-otp', () => ({
  loadMsg91OtpConfig: mockWidgetConfigured,
  sendMsg91Otp: mockWidgetSend,
  extractMsg91ReqId: (r: { reqId?: string }) => r?.reqId,
  extractMsg91AccessToken: (r: { token?: string }) => r?.token,
}));

vi.mock('../../src/components/KeyboardScreen', () => ({
  KeyboardScreen: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));
vi.mock('../../src/components/GradientButton', () => ({
  GradientButton: (props: Record<string, unknown>) => React.createElement('GradientButton', props),
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));
vi.mock('lucide-react-native', () => ({ AlertCircle: () => null }));

// phone.tsx does require('…logo.png') inline; Metro turns that into an asset id,
// plain Node tries to parse the png as JS. Stub the extension for this file only.
(
  Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> }
)._extensions['.png'] = (m) => {
  m.exports = 1;
};

const DIGITS = '9876543210';

async function renderPhone() {
  const PhoneScreen = (await import('../../app/auth/phone')).default;
  let tree!: ReturnType<typeof renderer.create>;
  await act(async () => {
    tree = renderer.create(React.createElement(PhoneScreen));
  });
  await act(async () => {
    (tree.root.findAllByType(TextInput)[0] as Node).props.onChangeText(DIGITS);
  });
  return tree;
}

type Node = { props: Record<string, any> };
const first = (tree: ReturnType<typeof renderer.create>, type: unknown) =>
  tree.root.findAllByType(type)[0] as Node;
const button = (tree: ReturnType<typeof renderer.create>) => first(tree, 'GradientButton');
const submit = (tree: ReturnType<typeof renderer.create>) =>
  first(tree, TextInput).props.onSubmitEditing as () => void;
const allText = (tree: ReturnType<typeof renderer.create>) => JSON.stringify(tree.toJSON());

beforeEach(() => {
  vi.clearAllMocks();
  mockWidgetConfigured.mockReturnValue(false);
});

describe('app/auth/phone.tsx', () => {
  it('RC-015: keyboard Done + button tap in one frame send the OTP once', async () => {
    let resolveSend!: (v: unknown) => void;
    mockSendOtp.mockReturnValue(
      new Promise((r) => {
        resolveSend = r;
      }),
    );
    const tree = await renderPhone();

    await act(async () => {
      submit(tree)();
      button(tree).props.onPress();
    });
    expect(mockSendOtp).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();

    await act(async () => resolveSend({ data: {} }));
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/auth/otp', params: { phone: DIGITS } });
  });

  it('RC-021: widget configured → API told widget:true, widget sends once, no second API send', async () => {
    mockWidgetConfigured.mockReturnValue(true);
    mockSendOtp.mockResolvedValue({ data: {} });
    mockWidgetSend.mockResolvedValue({ reqId: 'req1' });
    const tree = await renderPhone();

    await act(async () => button(tree).props.onPress());

    expect(mockSendOtp).toHaveBeenCalledTimes(1);
    expect(mockSendOtp).toHaveBeenCalledWith(DIGITS, { widget: true });
    expect(mockWidgetSend).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/auth/otp',
      params: { phone: DIGITS, reqId: 'req1', token: '' },
    });
  });

  it('RC-021: widget throws → exactly one classic API send, pushed without reqId', async () => {
    mockWidgetConfigured.mockReturnValue(true);
    mockSendOtp.mockResolvedValue({ data: {} });
    mockWidgetSend.mockRejectedValue(new Error('widget down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tree = await renderPhone();

    await act(async () => button(tree).props.onPress());
    warn.mockRestore();

    expect(mockSendOtp).toHaveBeenCalledTimes(2);
    expect(mockSendOtp).toHaveBeenNthCalledWith(1, DIGITS, { widget: true });
    expect(mockSendOtp).toHaveBeenNthCalledWith(2, DIGITS);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/auth/otp', params: { phone: DIGITS } });
  });

  it('bypass phone skips the widget; a TIMEOUT shows its message and a retry sends again', async () => {
    mockWidgetConfigured.mockReturnValue(true);
    mockSendOtp.mockResolvedValueOnce({ data: { bypass: true } });
    const tree = await renderPhone();
    await act(async () => button(tree).props.onPress());
    expect(mockWidgetSend).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/auth/otp',
      params: { phone: DIGITS, bypass: 'true' },
    });

    const { ApiError } = await import('../../src/lib/api');
    mockSendOtp.mockRejectedValueOnce(new ApiError('TIMEOUT', 'x', 408));
    await act(async () => button(tree).props.onPress());
    expect(allText(tree)).toContain('took too long');

    mockSendOtp.mockResolvedValueOnce({ data: { bypass: true } });
    await act(async () => button(tree).props.onPress());
    expect(mockSendOtp).toHaveBeenCalledTimes(3);
  });
});
