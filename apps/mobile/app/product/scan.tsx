import { useState } from 'react'
import { View, Text, TextInput, Alert, ActivityIndicator } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { X, ScanLine } from 'lucide-react-native'
import { COLORS } from '@kanchuki/shared'
import { productApi } from '../../src/lib/api'
import { showError } from '../../src/lib/errors'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'

/**
 * F-025 scan-to-sell: offline sale reconciliation.
 *
 * Scans the product's auto-generated SKU (printed as a QR/SKU tag from the
 * product detail screen — "Print SKU Tag") and jumps straight into the
 * existing product/[id].tsx, where the retailer taps the existing SOLD
 * toggle (already offline-safe via the mutation queue). Scanning only
 * replaces the "find the product" step; nothing downstream is new.
 *
 * Works for shop staff (Staff model) too — the SKU lookup reuses the
 * existing no-owner-gate list endpoint, same as the manual status toggle.
 */
export default function ScanScreen() {
  const insets = useSafeAreaInsets()
  const [permission, requestPermission] = useCameraPermissions()
  const [resolving, setResolving] = useState(false)
  const [manualSku, setManualSku] = useState('')
  const [scanPaused, setScanPaused] = useState(false)

  const resolveAndOpen = async (raw: string) => {
    const sku = raw.trim()
    if (!sku || resolving) return
    setResolving(true)
    setScanPaused(true)
    try {
      const res = await productApi.list({ sku, limit: 1 })
      const items = (res.data ?? []) as { id: string }[]
      if (items.length === 0) {
        Alert.alert('Not Found', `No product with SKU "${sku.toUpperCase()}" in this catalog.`, [
          { text: 'Scan again', onPress: () => setScanPaused(false) },
        ])
        return
      }
      router.replace(`/product/${items[0]!.id}`)
    } catch (err) {
      showError(err, 'Could not look up that SKU')
      setScanPaused(false)
    } finally {
      setResolving(false)
    }
  }

  if (!permission) return <View className="flex-1 bg-black" />

  if (!permission.granted) {
    return (
      <View className="flex-1 bg-black items-center justify-center px-8">
        <Text className="text-white text-center text-base mb-6">
          Camera access needed to scan product SKU tags
        </Text>
        <AnimatedPressable
          onPress={() => void requestPermission()}
          className="bg-ink-600 px-6 py-3 rounded-xl"
        >
          <Text className="text-white font-semibold">Allow Camera</Text>
        </AnimatedPressable>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        active={!scanPaused}
        barcodeScannerSettings={{
          barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e', 'pdf417'],
        }}
        onBarcodeScanned={({ data }) => {
          if (!scanPaused) void resolveAndOpen(data)
        }}
      />

      {/* Close */}
      <AnimatedPressable
        onPress={() => router.back()}
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
        <Text className="text-white/80 text-sm mt-4">
          Point at the product's SKU tag (QR or barcode)
        </Text>
      </View>

      {/* Resolving state */}
      {resolving && (
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
          value={manualSku}
          onChangeText={setManualSku}
          placeholder="Or type SKU (e.g. LS0001)"
          placeholderTextColor={COLORS.sand[400]}
          autoCapitalize="characters"
          className="flex-1 text-sm text-sand-900"
          onSubmitEditing={() => void resolveAndOpen(manualSku)}
          returnKeyType="search"
        />
        <AnimatedPressable
          onPress={() => void resolveAndOpen(manualSku)}
          disabled={resolving}
          className="bg-ink-600 px-3.5 py-2 rounded-xl"
          accessibilityLabel="Look up SKU"
          accessibilityRole="button"
        >
          <Text className="text-white text-xs font-bold">Find</Text>
        </AnimatedPressable>
      </View>
    </View>
  )
}
