import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import { router, usePathname } from 'expo-router'
import { Store, LogOut, ShieldCheck } from 'lucide-react-native'
import {
  exitCatalogSession,
  getCatalogDelegateInfo,
  onDelegateChange,
  type CatalogDelegateInfo,
} from '../lib/catalog-delegate'
import { teamApi } from '../lib/team-api'
import { showError } from '../lib/errors'

const SCOPE_LABEL = { DEMO: 'Demo', GROWTH: 'Growth', MAINTENANCE: 'Maintenance' } as const

/**
 * F-020: persistent banner shown across the whole app whenever a team
 * member's auth_token has been temporarily swapped for a delegated
 * catalog-upload session token — so it's never ambiguous whose catalog
 * they're editing, even several screens deep in the reused product flow.
 * Also covers retailer-approved support sessions ("Support session — shop —
 * scope", spec §6).
 */
export function CatalogDelegateBanner() {
  const pathname = usePathname()
  const [info, setInfo] = useState<CatalogDelegateInfo | null>(null)

  useEffect(() => {
    const load = () => void getCatalogDelegateInfo().then(setInfo)
    load()
    return onDelegateChange(load)
  }, [pathname])

  if (!info) return null

  const support = info.support

  const handleExit = async () => {
    // Restore the team login FIRST — ending the session server-side is a team
    // request and must not run under the support token being ended.
    await exitCatalogSession()
    setInfo(null)
    if (support) {
      try {
        await teamApi.endSupportSession(support.grant_id)
      } catch (err) {
        showError(
          err,
          'Session closed on this phone, but we could not end it on the server. It expires on its own.',
        )
      }
    }
    router.replace('/staff')
  }

  return (
    <View className="flex-row items-center justify-between gap-2 px-4 py-2 bg-ink-700">
      <View className="flex-row items-center gap-2 flex-1">
        {support ? <ShieldCheck size={14} color="white" /> : <Store size={14} color="white" />}
        <Text className="text-white text-xs font-medium flex-1" numberOfLines={1}>
          {support
            ? `Support session — ${info.shop_name} — ${SCOPE_LABEL[support.scope]}`
            : `Uploading catalog for ${info.shop_name}`}
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
