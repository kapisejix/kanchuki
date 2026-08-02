/**
 * Type declarations for the custom @testing-library/react-native mock
 * (src/test/__mocks__/testing-library.js).
 *
 * The real package's types describe a different render() return shape, so
 * tests that rely on the mock's `toTree()` traversal need this declaration.
 * Import from the mock path directly in tests that use toTree():
 *
 *   import { render } from '../../src/test/__mocks__/testing-library'
 *
 * Tests that only use toJSON()/queryByTestId() can keep importing from
 * '@testing-library/react-native' (setup.ts vi.mocks it to this same file).
 */

import type { ReactElement, ReactNode } from 'react'

export interface RenderOptions {
  wrapper?: (props: { children: ReactNode }) => ReactNode
}

export interface RenderResult {
  /** Snapshot-style JSON of the rendered tree. */
  toJSON: () => unknown
  /** react-test-renderer tree (host + composite nodes with props/children). */
  toTree: () => unknown
  rerender: (ui: ReactElement) => void
  unmount: () => void
  readonly container: unknown
  debug: () => void
  queryByTestId: (testId: string) => unknown
  getByTestId: (testId: string) => unknown
}

export declare function render(ui: ReactElement, options?: RenderOptions): RenderResult
