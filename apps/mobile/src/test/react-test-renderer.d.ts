/**
 * Minimal ambient types for react-test-renderer 19.
 *
 * The package ships no bundled types and @types/react-test-renderer is not in
 * this tree; TS7016 otherwise fires on `import { act } from 'react-test-renderer'`
 * in tests. Only the APIs the test suite uses are declared.
 */

declare module 'react-test-renderer' {
  export function act(callback: () => void | Promise<void>): void | Promise<void>

  interface TestRendererInstance {
    toJSON(): unknown
    toTree(): unknown
    root: {
      children: unknown[]
      findAllByType: (type: unknown) => unknown[]
    }
    update(element: unknown): void
    unmount(): void
  }

  interface TestRenderer {
    create(element: unknown): TestRendererInstance
    act(callback: () => void | Promise<void>): void | Promise<void>
  }

  const renderer: TestRenderer
  export default renderer
}
