import { useRef, useState } from 'react'
import { View, Text, TextInput, ActivityIndicator } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { X, ScanLine } from 'lucide-react-native'
import { COLORS } from '@kanchuki/shared'
import { useScreenInsets } from '../lib/safe-area'
import { AnimatedPressable } from './AnimatedPressable'
import { WhiteButton } from './WhiteButton'
import { KeyboardScreen } from './KeyboardScreen'

/** Same code seen again inside this window is ignored: a tag in frame fires repeatedly. */
export const SCAN_DEBOUNCE_MS = 1500

interface Props {
  /** Called with each accepted code (camera or typed). Awaited: no second call starts until it settles. */
  onSku: (sku: string) => void | Promise<void>
  onClose: () => void
  /** Stops the camera (e.g. while an alert is up). */
  paused?: boolean
  /** Shows the "Looking up" overlay. */
  busy?: boolean
  hint?: string
}

/**
 * Camera + manual-SKU fallback shared by the F-025 single scan and the F-047
 * sell screen. Owns only scanning; what a code means is the caller's job.
 */
export function SkuScanner({
  onSku,
  onClose,
  paused = false,
  busy = false,
  hint = 'Point at the product’s SKU tag (QR or barcode)',
}: Props) {
  const { insets } = useScreenInsets()
  const [permission, requestPermission] = useCameraPermissions()
  const [manualSku, setManualSku] = useState('')
  // Refs, not state: two events in one tick both read stale state (RC-015/135).
  const inFlightRef = useRef(false)
  const lastScanRef = useRef<{ code: string; at: number } | null>(null)

  const submit = async (raw: string, fromCamera: boolean) => {
    const sku = raw.trim()
    if (!sku || inFlightRef.current) return
    if (fromCamera) {
      const last = lastScanRef.current
      const now = Date.now()
      if (last && last.code === sku && now - last.at < SCAN_DEBOUNCE_MS) return
      lastScanRef.current = { code: sku, at: now }
    }
    inFlightRef.current = true
    try {
      await onSku(sku)
    } catch (err) {
      // Callers own their error UI (showError); this only keeps `void submit()` from leaking a rejection.
      if (__DEV__) console.warn('[SkuScanner] onSku threw', err)
    } finally {
      inFlightRef.current = false
    }
  }

  if (!permission) return <View className="flex-1 bg-black" />

  if (!permission.granted) {
    return (
      <View testID="sku-permission-denied" className="flex-1 bg-black items-center justify-center px-8">
        <Text className="text-white text-center text-base mb-6">
          Camera access needed to scan product SKU tags
        </Text>
        <WhiteButton compact label="Allow Camera" onPress={() => void requestPermission()} />
      </View>
    )
  }

  return (
    <KeyboardScreen className="flex-1 bg-black">
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        active={!paused}
        barcodeScannerSettings={{
          barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e', 'pdf417'],
        }}
        onBarcodeScanned={({ data }) => {
          if (!paused) void submit(data, true)
        }}
      />

      {/* Close */}
      <AnimatedPressable
        onPress={onClose}
        className="absolute left-4 w-10 h-10 bg-black/50 rounded-full items-center justify-center"
        style={{ top: insets.top + 8 }}
        accessibilityLabel="Close scanner"
        accessibilityRole="button"
      >
        <X size={20} color="white" />
      </AnimatedPressable>

      {/* Frame guide */}
      <View className="absolute inset-0 items-center justify-center">
        <View className="w-64 h-40 border-2 border-white/60 rounded-3xl bg-white/5" />
        <Text className="text-white/80 text-sm mt-4">{hint}</Text>
      </View>

      {/* Resolving state */}
      {busy && (
        <View className="absolute inset-0 bg-black/60 items-center justify-center">
          <ActivityIndicator size="large" color="white" />
          <Text className="text-white mt-3 font-semibold">Looking up product...</Text>
        </View>
      )}

      {/* Manual entry fallback */}
      <View
        className="absolute left-4 right-4 flex-row items-center gap-2 bg-white/95 rounded-2xl px-3 py-2.5"
        style={{ bottom: insets.bottom + 24 }}
      >
        <ScanLine size={18} color={COLORS.sand[600]} />
        <TextInput
          testID="sku-manual-input"
          value={manualSku}
          onChangeText={setManualSku}
          placeholder="Or type SKU (e.g. LS0001)"
          placeholderTextColor={COLORS.sand[400]}
          autoCapitalize="characters"
          className="flex-1 text-sm text-sand-900"
          onSubmitEditing={() => void submit(manualSku, false)}
          returnKeyType="search"
        />
        <AnimatedPressable
          onPress={() => void submit(manualSku, false)}
          disabled={busy}
          className="bg-ink-600 px-3.5 py-2 rounded-xl"
          accessibilityLabel="Look up SKU"
          accessibilityRole="button"
        >
          <Text className="text-white text-xs font-bold">Find</Text>
        </AnimatedPressable>
      </View>
    </KeyboardScreen>
  )
}
