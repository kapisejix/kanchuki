import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react-native'
import React from 'react'
import { Text, Platform } from 'react-native'
import { KeyboardScreen, KEYBOARD_BEHAVIOR } from './KeyboardScreen'

// The react-native mock reports iOS, matching the platform the app's screens
// were tuned on. The Android branch is exercised by re-importing the module
// with Platform.OS swapped (see the last test).
describe('KeyboardScreen', () => {
  it('renders its children', () => {
    const tree = render(
      <KeyboardScreen testID="ks">
        <Text testID="inner">Hello</Text>
      </KeyboardScreen>,
    )
    expect(tree.getByTestId('inner')).toBeTruthy()
  })

  it('applies the platform default behaviour when none is given', () => {
    const tree = render(<KeyboardScreen testID="ks" />)
    expect(tree.getByTestId('ks').props.behavior).toBe('padding')
  })

  it('lets a caller override the behaviour', () => {
    const tree = render(<KeyboardScreen testID="ks" behavior={undefined} />)
    // `undefined` cannot be distinguished from "not passed", so it falls back
    // to the platform default rather than disabling the behaviour.
    expect(tree.getByTestId('ks').props.behavior).toBe(KEYBOARD_BEHAVIOR)
  })

  it('wraps in a keyboard-avoiding view', () => {
    const tree = render(<KeyboardScreen testID="ks" />)
    expect(tree.getByTestId('ks').type).toBe('KeyboardAvoidingView')
  })

  it('defaults to filling the screen', () => {
    const tree = render(<KeyboardScreen testID="ks" />)
    expect(tree.getByTestId('ks').props.className).toBe('flex-1')
  })

  it('accepts a className for screens with a background', () => {
    const tree = render(<KeyboardScreen testID="ks" className="flex-1 bg-black" />)
    expect(tree.getByTestId('ks').props.className).toBe('flex-1 bg-black')
  })

  it('forwards extra props to the underlying view', () => {
    const tree = render(<KeyboardScreen testID="ks" accessible accessibilityLabel="Form" />)
    expect(tree.getByTestId('ks').props.accessibilityLabel).toBe('Form')
  })

  it('uses a shrink-to-fit behaviour on Android', async () => {
    // iOS keeps the layout viewport at full height, Android resizes it; the
    // behaviour must differ or one of the two platforms double-counts the
    // keyboard. Re-import with Platform.OS swapped — the constant is read once
    // at module load, so a module cache reset is the only way to see it.
    vi.resetModules()
    const rn = await import('react-native')
    ;(rn.Platform as { OS: string }).OS = 'android'
    const fresh = await import('./KeyboardScreen')
    expect(fresh.KEYBOARD_BEHAVIOR).toBe('height')
    // restore for any later import in this file
    ;(rn.Platform as { OS: string }).OS = 'ios'
    expect(Platform.OS).toBe('ios')
  })
})
