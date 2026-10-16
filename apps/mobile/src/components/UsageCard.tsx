import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, BarChart2 } from 'lucide-react-native'
import { Text, View } from 'react-native'
import { retailerApi } from '../lib/api'

/** F-010 plan usage vs limits (uploads, AI tagging, studio shoots). The API only
 * returns those three. Renders nothing while loading, on error (e.g. staff roles
 * without access), or when every resource is unlimited. */
const LABELS: Record<string, string> = {
  PRODUCT_UPLOAD: 'Product Uploads',
  AI_TAGGING_CALL: 'AI Tagging',
  STUDIO_SHOOT: 'Studio Shoots',
}

function useActiveUsage() {
  const { data } = useQuery({
    queryKey: ['retailer', 'usage'],
    queryFn: () => retailerApi.getUsage(),
  })
  return (data?.data ?? []).filter((r) => r.limit > 0 && r.resource_type in LABELS)
}

/** Compact "N left" rows for the Home catalog overview (light text on the dark hero). */
export function UsageRows() {
  const active = useActiveUsage()
  if (active.length === 0) return null

  return (
    <View
      style={{
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.15)',
        gap: 6,
      }}
    >
      {active.map((r) => {
        const left = Math.max(r.limit - r.used, 0)
        const pctLeft = Math.round((left / r.limit) * 100)
        return (
          <View key={r.resource_type} className="flex-row justify-between items-center">
            <Text className="text-[9px] text-lavender-200/70 font-extrabold uppercase tracking-wider">
              {LABELS[r.resource_type]}
            </Text>
            <Text className={`text-xs font-extrabold ${left === 0 ? 'text-red-300' : 'text-white'}`}>
              {left} left · {pctLeft}%
            </Text>
          </View>
        )
      })}
    </View>
  )
}

export function UsageCard() {
  const active = useActiveUsage()
  if (active.length === 0) return null

  return (
    <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
      <View className="flex-row items-center gap-2 mb-3">
        <BarChart2 size={16} color="#BB3F95" />
        <Text className="text-sm font-bold text-spaceCadet-900 font-marcellus">Usage & Quotas</Text>
      </View>
      {active.map((r) => {
        const pct = Math.min(Math.round((r.used / r.limit) * 100), 100)
        const isOver = r.used >= r.limit
        const barColor = isOver ? '#dc2626' : pct > 80 ? '#BB3F95' : '#231F48'
        return (
          <View key={r.resource_type} className="mb-2.5">
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-xs text-heliotrope-600 font-medium">{LABELS[r.resource_type]}</Text>
              <Text className={`text-xs font-bold ${isOver ? 'text-red-600' : 'text-spaceCadet-900'}`}>
                {r.used}/{r.limit} {r.period === 'MONTH' ? 'mo' : r.period === 'DAY' ? 'day' : ''}
              </Text>
            </View>
            <View className="h-2 bg-lavender-100 rounded-full overflow-hidden">
              <View
                style={{ width: `${Math.max(pct, 3)}%`, backgroundColor: barColor }}
                className="h-full rounded-full"
              />
            </View>
            {isOver && (
              <View className="flex-row items-center gap-1 mt-1">
                <AlertTriangle size={10} color="#dc2626" />
                <Text className="text-[10px] text-red-600">Limit reached. Upgrade or contact support.</Text>
              </View>
            )}
          </View>
        )
      })}
    </View>
  )
}
