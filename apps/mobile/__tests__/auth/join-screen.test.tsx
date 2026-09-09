import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import renderer, { act } from 'react-test-renderer'

type ReactTestRenderer = typeof renderer
import { Text } from 'react-native'
import { router } from 'expo-router'

// ── Module mocks ──────────────────────────────────────────────────
// join.tsx (staff-invite-tokens.md §6.1): renders the masked invite summary
// from GET /v1/public/staff-invite/:token, and Continue → OTP-send →
// /auth/otp?invite_token=… (the phone never crosses the wire). The API
// client and router are the only seams swapped; the screen logic (status
// derivation, dead-ends, no-phone handoff) stays REAL.
const mockGet = vi.hoisted(() => vi.fn())
const mockSendOtp = vi.hoisted(() => vi.fn())

vi.mock('expo-router', () => ({
  router: { replace: vi.fn(), push: vi.fn(), back: vi.fn() },
  useLocalSearchParams: vi.fn(() => ({ token: 'invite_token_abcdefghijklmnopqrstuvwxyz' })),
}))

vi.mock('../../src/lib/api', () => ({
  staffInviteApi: {
    get: mockGet,
    sendOtp: mockSendOtp,
  },
  // Mirrors the real src/lib/api/client.ts signature (code, message, status)
  // so `instanceof ApiError` + `.status` behave exactly as in production.
  ApiError: class extends Error {
    status: number
    constructor(_code: string, message: string, status: number) {
      super(message)
      this.status = status
    }
  },
}))

vi.mock('../../src/components/GradientButton', () => ({
  GradientButton: ({ label }: { label: string }) => React.createElement(Text, null, label),
}))

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}))

vi.mock('../../src/lib/errors', () => ({
  showError: vi.fn(),
  logError: vi.fn(),
}))

async function renderJoin() {
  const JoinScreen = (await import('../../app/join')).default
  let tree: ReturnType<typeof renderer.create>
  await act(async () => {
    tree = renderer.create(React.createElement(JoinScreen))
  })
  return tree!
}

type Renderer = ReturnType<typeof renderer.create>
type TextNode = {
  props: { children?: unknown }
  parent?: { props?: { onPress?: () => void } }
}

/** All <Text> instances in the tree, typed for props access. */
function allTexts(tree: Renderer): TextNode[] {
  return tree.root.findAllByType(Text) as unknown as TextNode[]
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('app/join.tsx (staff-invite-tokens §6.1)', () => {
  it('renders the masked join summary for a pending invite', async () => {
    mockGet.mockResolvedValue({
      data: {
        shop_name: 'Ramesh Textiles',
        member_name: 'Ramesh',
        role: 'salesperson',
        phone_masked: '•••••• 3210',
        status: 'pending',
      },
    })

    const tree = await renderJoin()
    const texts = allTexts(tree).map((t) => t.props.children)

    expect(texts.join(' ')).toContain('Ramesh Textiles')
    expect(texts.join(' ')).toContain('•••••• 3210')
    expect(texts.join(' ')).toContain('Continue')
    // The unmasked phone must never appear.
    expect(texts.join(' ')).not.toContain('9876543210')
  })

  it('Continue sends the OTP server-side and routes to /auth/otp with only the token', async () => {
    mockGet.mockResolvedValue({
      data: {
        shop_name: 'Ramesh Textiles',
        member_name: 'Ramesh',
        role: 'salesperson',
        phone_masked: '•••••• 3210',
        status: 'pending',
      },
    })
    mockSendOtp.mockResolvedValue({ data: { sent_to: '•••••• 3210' } })

    const tree = await renderJoin()
    const continueLabel = allTexts(tree).find((t) => t.props.children === 'Continue')
    expect(continueLabel).toBeTruthy()

    await act(async () => {
      // GradientButton is mocked to a bare Text — traverse to the nearest
      // host with an onPress handler (the real GradientButton wires label →
      // onPress).
      const btn = continueLabel!.parent
      expect(btn?.props?.onPress).toBeTypeOf('function')
      btn?.props?.onPress?.()
    })

    expect(mockSendOtp).toHaveBeenCalledWith('invite_token_abcdefghijklmnopqrstuvwxyz')
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/auth/otp',
      params: { invite_token: 'invite_token_abcdefghijklmnopqrstuvwxyz', masked: '•••••• 3210' },
    })
  })

  it('renders the already-joined CTA for a used invite (log in, not re-join)', async () => {
    mockGet.mockResolvedValue({
      data: {
        shop_name: 'Ramesh Textiles',
        member_name: 'Ramesh',
        role: 'salesperson',
        phone_masked: '•••••• 3210',
        status: 'used',
      },
    })

    const tree = await renderJoin()
    const texts = allTexts(tree).map((t) => t.props.children)
    expect(texts.join(' ')).toContain("You've already joined")
    expect(texts.join(' ')).toContain('Log in with phone')
  })

  it('renders the dead-end for expired/revoked/404 invites', async () => {
    const { ApiError } = await import('../../src/lib/api')
    mockGet.mockRejectedValue(new ApiError('NOT_FOUND', 'Not Found', 404))

    const tree = await renderJoin()
    const texts = allTexts(tree).map((t) => t.props.children)
    expect(texts.join(' ')).toContain('no longer valid')
    expect(texts.join(' ')).toContain('Log in with phone')
  })

  it('shows a retry card (not the dead end) on a transient fetch failure, then recovers', async () => {
    // Network / server hiccup — NOT a 404. The invite may still be valid, so
    // the screen must offer Retry instead of claiming the link is dead.
    mockGet.mockRejectedValueOnce(new Error('Network request failed'))
    const tree = await renderJoin()
    let texts = allTexts(tree).map((t) => t.props.children)
    expect(texts.join(' ')).toContain("Couldn't check this invite")
    expect(texts.join(' ')).toContain('Retry')
    expect(texts.join(' ')).not.toContain('no longer valid')

    // Retry re-runs the fetch; on success the pending summary replaces the
    // error card.
    mockGet.mockResolvedValueOnce({
      data: {
        shop_name: 'Ramesh Textiles',
        member_name: 'Ramesh',
        role: 'salesperson',
        phone_masked: '•••••• 3210',
        status: 'pending',
      },
    })
    const retryLabel = allTexts(tree).find((t) => t.props.children === 'Retry')
    expect(retryLabel).toBeTruthy()
    await act(async () => {
      retryLabel!.parent?.props?.onPress?.()
    })
    texts = allTexts(tree).map((t) => t.props.children)
    expect(texts.join(' ')).toContain('Ramesh Textiles')
    expect(texts.join(' ')).toContain('Continue')
  })
})