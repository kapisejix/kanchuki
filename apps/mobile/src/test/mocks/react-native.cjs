/**
 * CJS mock for react-native — loaded via Module._resolveFilename hook.
 *
 * This file is COMMONJS because Node's CJS require() system can only
 * load CJS or .json files from disk. Using ESM exports here would
 * cause a different parse error.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const React = require('react')

function mockComponent(name) {
  const Comp = React.forwardRef((props, ref) => {
    const { children, ...rest } = props
    return React.createElement(name, { ...rest, ref }, children)
  })
  Comp.displayName = name
  return Comp
}

const View = mockComponent('View')
const Text = mockComponent('Text')
const TouchableOpacity = mockComponent('TouchableOpacity')
const ScrollView = mockComponent('ScrollView')
const FlatList = mockComponent('FlatList')
const TextInput = mockComponent('TextInput')
const Image = mockComponent('Image')
const Modal = mockComponent('Modal')
const Pressable = mockComponent('Pressable')
const ActivityIndicator = mockComponent('ActivityIndicator')
const StatusBar = mockComponent('StatusBar')
const KeyboardAvoidingView = mockComponent('KeyboardAvoidingView')
const RefreshControl = mockComponent('RefreshControl')
const Switch = mockComponent('Switch')

module.exports = {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  TextInput,
  Image,
  Modal,
  Pressable,
  ActivityIndicator,
  StatusBar,
  KeyboardAvoidingView,
  RefreshControl,
  Switch,
  StyleSheet: {
    create: (s) => s,
    hairlineWidth: () => 0.5,
    absoluteFill: {},
    absoluteFillObject: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  },
  Platform: {
    OS: 'ios',
    Version: 16,
    select: (obj) => obj.ios ?? obj.default,
  },
  Dimensions: {
    get: () => ({ width: 390, height: 844 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  PixelRatio: {
    get: () => 2,
    getFontScale: () => 1,
  },
  Animated: {
    View: mockComponent('Animated.View'),
    Text: mockComponent('Animated.Text'),
    Value: class Value {
      constructor(v) {
        this._v = v
      }
    },
    timing: () => ({
      start: (cb) => cb?.(),
      stop: () => {},
    }),
    spring: () => ({
      start: (cb) => cb?.(),
      stop: () => {},
    }),
    sequence: () => ({
      start: (cb) => cb?.(),
    }),
    parallel: () => ({
      start: (cb) => cb?.(),
    }),
    delay: (ms) => ({
      start: (cb) => cb?.(),
    }),
    loop: () => ({
      start: (cb) => cb?.(),
    }),
  },
  Linking: {
    canOpenURL: async () => true,
    openURL: async () => {},
    addEventListener: () => ({ remove: () => {} }),
  },
  Alert: {
    alert: () => {},
    prompt: () => {},
  },
  Vibration: {
    vibrate: () => {},
    cancel: () => {},
  },
  findNodeHandle: () => null,
  processColor: (c) => c,
  NativeModules: {},
  UIManager: {},
  TurboModuleRegistry: {
    get: () => null,
    getEnforcing: () => null,
  },
  Appearance: {
    getColorScheme: () => 'light',
    addChangeListener: () => ({ remove: () => {} }),
  },
  AppState: {
    currentState: 'active',
    addEventListener: () => ({ remove: () => {} }),
  },
  I18nManager: {
    isRTL: false,
    allowRTL: () => {},
    forceRTL: () => {},
    swapLeftAndRightInRTL: () => {},
    getConstants: () => ({ isRTL: false }),
  },
  YellowBox: {
    ignoreWarnings: () => {},
  },
  LogBox: {
    ignoreLogs: () => {},
    ignoreAllLogs: () => {},
  },
}
