// Auto-split from app/product/[id].tsx (1944 lines).
// F-025: printable SKU/QR tag modal — white, print/screenshot friendly.
import { View, Text, Modal } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { AnimatedPressable } from '../AnimatedPressable'

export function SkuTagModal({
  open,
  onClose,
  sku,
  name,
}: {
  open: boolean
  onClose: () => void
  sku: string | null
  name: string | null
}) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/60 items-center justify-center px-8">
        <View className="bg-white rounded-2xl p-8 items-center w-full max-w-sm">
          <Text className="text-[10px] font-semibold text-sand-500 uppercase tracking-widest mb-4">
            Rack Tag · Scan to Sell
          </Text>
          {sku && <QRCode value={sku} size={180} />}
          <Text className="text-2xl font-bold text-sand-900 mt-5 tracking-widest">{sku ?? ''}</Text>
          {name ? (
            <Text className="text-xs text-sand-500 mt-1 text-center" numberOfLines={2}>
              {name}
            </Text>
          ) : null}
          <AnimatedPressable onPress={onClose} className="mt-6 bg-ink-600 px-6 py-2.5 rounded-xl">
            <Text className="text-white text-sm font-semibold">Done</Text>
          </AnimatedPressable>
        </View>
      </View>
    </Modal>
  )
}
