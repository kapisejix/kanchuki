/**
 * React Native mock for Vitest.
 *
 * Replaces the virtual module plugin. This real file on disk avoids the
 * `\0react-native` resolution issues that broke subpath imports like
 * `react-native/Libraries/...` used by @testing-library/react-native.
 */

import React from 'react'

// ── Helpers ────────────────────────────────────────────────────────

function createComponent(displayName: string) {
  const C = React.forwardRef<unknown, Record<string, unknown>>(
    (props, ref) => {
      const { children, ...rest } = props
      return React.createElement(displayName as never, { ...rest, ref }, children as React.ReactNode)
    },
  )
  C.displayName = displayName
  return C
}

// ── Core Components ────────────────────────────────────────────────

export const View = createComponent('View')
export const Text = createComponent('Text')
export const TouchableOpacity = createComponent('TouchableOpacity')
export const ScrollView = createComponent('ScrollView')
export const FlatList = createComponent('FlatList')
export const TextInput = createComponent('TextInput')
export const Image = createComponent('Image')
export const Modal = createComponent('Modal')
export const Pressable = createComponent('Pressable')
export const ActivityIndicator = createComponent('ActivityIndicator')
export const StatusBar = createComponent('StatusBar')
export const KeyboardAvoidingView = createComponent('KeyboardAvoidingView')
export const RefreshControl = createComponent('RefreshControl')
export const Switch = createComponent('Switch')
export const SafeAreaView = createComponent('SafeAreaView')
export const SectionList = createComponent('SectionList')
export const TouchableHighlight = createComponent('TouchableHighlight')
export const TouchableWithoutFeedback = createComponent('TouchableWithoutFeedback')
export const Keyboard = createComponent('Keyboard')
export const AnimatedSectionList = createComponent('AnimatedSectionList')

// ── APIs ───────────────────────────────────────────────────────────

export const StyleSheet = {
  create: <T extends Record<string, unknown>>(s: T): T => s,
  hairlineWidth: () => 0.5,
  absoluteFill: {},
  absoluteFillObject: {},
  flatten: (s: unknown) => s,
}

export const Platform = {
  OS: 'ios' as const,
  Version: 15,
  select: <T>(obj: Record<string, T>): T => obj.ios ?? obj.default,
  isPad: false,
  isTV: false,
  isTesting: true,
}

export const Dimensions = {
  get: () => ({ width: 390, height: 844 }),
  set: () => {},
  addEventListener: () => ({ remove: () => {} }),
}

export const PixelRatio = {
  get: () => 2,
  getFontScale: () => 1,
  getPixelSizeForLayoutSize: (n: number) => n * 2,
  roundToNearestPixel: (n: number) => Math.round(n * 2) / 2,
}

export const Animated = {
  View: createComponent('Animated.View'),
  Text: createComponent('Animated.Text'),
  Image: createComponent('Animated.Image'),
  ScrollView: createComponent('Animated.ScrollView'),
  Value: class {
    constructor(public value: number) {}
    setValue(v: number) { this.value = v }
    interpolate() { return { value: this.value } }
  },
  timing: () => ({ start: (cb?: () => void) => cb?.() }),
  spring: () => ({ start: (cb?: () => void) => cb?.() }),
  sequence: () => ({ start: (cb?: () => void) => cb?.() }),
  parallel: () => ({ start: (cb?: () => void) => cb?.() }),
  loop: () => ({ start: (cb?: () => void) => cb?.() }),
  delay: () => ({ start: (cb?: () => void) => cb?.() }),
  event: () => () => {},
  createAnimatedComponent: (comp: unknown) => comp,
}

export const Linking = {
  canOpenURL: async () => true,
  openURL: async () => true,
  addEventListener: () => ({ remove: () => {} }),
  removeEventListener: () => {},
  openSettings: async () => {},
  sendIntent: async () => {},
}

export const Alert = {
  alert: () => {},
  prompt: () => {},
}

export const Vibration = {
  vibrate: () => {},
  cancel: () => {},
}

export const AppState = {
  currentState: 'active',
  addEventListener: () => ({ remove: () => {} }),
  removeEventListener: () => {},
}

export const Appearance = {
  getColorScheme: () => 'light' as const,
  addChangeListener: () => ({ remove: () => {} }),
  removeChangeListener: () => {},
}

export const I18nManager = {
  isRTL: false,
  allowRTL: () => {},
  forceRTL: () => {},
  swapLeftAndRightInRTL: () => {},
  getConstants: () => ({ isRTL: false, doLeftAndRightSwapInRTL: true, localeIdentifier: 'en_US' }),
}

export const YellowBox = {
  ignoreWarnings: () => {},
}

export const NativeModules = {}
export const UIManager = {}
export const findNodeHandle = () => null
export const processColor = (c: unknown) => c

// ── TurboModuleRegistry (needed by some internal react-native paths) ──

export const TurboModuleRegistry = {
  get: () => null,
  getEnforcing: () => {
    throw new Error('TurboModuleRegistry.getEnforcing: module not found')
  },
}

// ── NativeEventEmitter ─────────────────────────────────────────────

export class NativeEventEmitter {
  constructor(_nativeModule?: Record<string, unknown>) {}
  addListener = () => ({ remove: () => {} })
  removeAllListeners = () => {}
  removeSubscription = () => {}
  emit = () => {}
  listeners = () => 0
}

// ── LayoutAnimation ────────────────────────────────────────────────

export const LayoutAnimation = {
  configureNext: () => {},
  create: () => {},
  easeInEaseOut: () => {},
  linear: () => {},
  spring: () => {},
  Presets: {
    easeInEaseOut: {},
    linear: {},
    spring: {},
  },
  Types: {
    easeIn: {},
    easeInEaseOut: {},
    easeOut: {},
    keyboard: {},
    linear: {},
    spring: {},
  },
  Properties: {
    opacity: {},
    scaleX: {},
    scaleY: {},
    xy: {},
  },
}

// ── LogBox ─────────────────────────────────────────────────────────

export const LogBox = {
  ignoreLogs: () => {},
  ignoreAllLogs: () => {},
  uninstall: () => {},
}

// ── PanResponder ───────────────────────────────────────────────────

export const PanResponder = {
  create: () => ({
    panHandlers: {},
  }),
}

// ── Default export ─────────────────────────────────────────────────

export default {
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
  SafeAreaView,
  SectionList,
  TouchableHighlight,
  TouchableWithoutFeedback,
  StyleSheet,
  Platform,
  Dimensions,
  PixelRatio,
  Animated,
  Linking,
  Alert,
  Vibration,
  AppState,
  Appearance,
  I18nManager,
  YellowBox,
  NativeModules,
  UIManager,
  findNodeHandle,
  processColor,
  TurboModuleRegistry,
  NativeEventEmitter,
  LayoutAnimation,
  LogBox,
  PanResponder,
  Keyboard,
}
