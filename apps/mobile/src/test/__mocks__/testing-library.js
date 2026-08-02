/**
 * Minimal mock for @testing-library/react-native for Vitest.
 *
 * Uses react-test-renderer to render React Native components into a
 * snapshot-compatible tree without loading the real @testing-library
 * package (which has ESM deps Node.js v22 can't parse).
 *
 * NOTE: Must use ESM exports (export/export default), not CJS
 * (module.exports), because vitest processes mock files through its
 * ESM transform pipeline where `module` is not defined.
 */

import React from 'react'
import renderer from 'react-test-renderer'

/**
 * Render a React element and return a testing utility object.
 */
function render(ui, options = {}) {
  const Wrapper = options.wrapper
    ? function Wrapped({ children }) {
        return React.createElement(options.wrapper, null, children)
      }
    : React.Fragment

  const element = React.createElement(Wrapper, null, ui)

  // React 19's react-test-renderer leaves the renderer UNMOUNTED when create()
  // is called outside act() — toJSON() then returns null and toTree() throws
  // "Can't access .root on unmounted test renderer". Every snapshot in the
  // suite was `null` until this was wrapped (2026-08-02).
  let instance = null
  renderer.act(() => {
    instance = renderer.create(element)
  })

  function toJSON() {
    return instance ? instance.toJSON() : null
  }

  function toTree() {
    return instance ? instance.toTree() : null
  }

  function rerender(newUi) {
    renderer.act(() => {
      instance.update(React.createElement(Wrapper, null, newUi))
    })
  }

  function unmount() {
    renderer.act(() => {
      instance.unmount()
    })
  }

  const result = {
    toJSON,
    toTree,
    rerender,
    unmount,
    get container() {
      return toJSON()
    },
    debug: () => {
      const json = toJSON()
      if (json) {
        console.log(JSON.stringify(json, null, 2))
      }
    },
    // Traverse the JSON tree to find an element by testID
    queryByTestId: (testId) => {
      const json = toJSON()
      function findNode(node) {
        if (!node || typeof node !== 'object') return null
        if (node.props?.testID === testId) return node
        if (node.children) {
          for (const child of node.children) {
            const found = findNode(child)
            if (found) return found
          }
        }
        return null
      }
      return findNode(json)
    },
    getByTestId: (testId) => {
      const node = result.queryByTestId(testId)
      if (!node) throw new Error(`Unable to find an element with testID: ${testId}`)
      return node
    },
  }

  return result
}

export { render }
