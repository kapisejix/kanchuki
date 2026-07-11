/**
 * Minimal mock for @testing-library/react-native for Vitest.
 *
 * Uses react-test-renderer to render React Native components into a
 * snapshot-compatible tree without loading the real @testing-library
 * package (which has ESM dependencies Node.js v22 can't parse).
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const React = require('react')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer')

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

  // Create the test renderer without act() wrapping to avoid
  // the "Can't access .root on unmounted test renderer" error.
  const instance = renderer.create(element)

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

  // eslint-disable-next-line prefer-const
  let result = {
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

module.exports = { render }
