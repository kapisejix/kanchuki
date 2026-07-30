import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import { router, usePathname } from 'expo-router'
import { Store, LogOut } from 'lucide-react-native'
import { exitCatalogSession, getCatalogDelegateInfo } from '../lib/catalog-delegate'

/**
 * F-020: persistent banner shown across the whole app whenever a team
 * member's auth_token has been temporarily swapped for a delegated
 * catalog-upload session token — so it's never ambiguous whose catalog
 * they're editing, even several screens deep in the reused product flow.
 */
export function CatalogDelegateBanner() {
  const pathname = usePathname()
  const [shopName, setShopName] = useState<string | null>(null)

  useEffect(() => {
    getCatalogDelegateInfo().then((info) => setShopName(info?.shop_name ?? null))
  }, [pathname])

  if (!shopName) return null

  const handleExit = async () => {
    await exitCatalogSession()
    setShopName(null)
    router.replace('/staff')
  }

  return (
    <View className="flex-row items-center justify-between gap-2 px-4 py-2 bg-ink-700">
      <View className="flex-row items-center gap-2 flex-1">
        <Store size={14} color="white" />
        <Text className="text-white text-xs font-medium flex-1" numberOfLines={1}>
          Uploading catalog for {shopName}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => void handleExit()}
        className="flex-row items-center gap-1 bg-white/15 px-2.5 py-1 rounded-full"
        hitSlop={8}
      >
        <LogOut size={12} color="white" />
        <Text className="text-white text-[11px] font-semibold">End Session</Text>
      </TouchableOpacity>
    </View>
  )
}
