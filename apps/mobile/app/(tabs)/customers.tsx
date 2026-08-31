import { useState, useCallback, memo } from 'react'
import { formatPrice, COLORS } from '@kanchuki/shared'
import { View, Text, FlatList, TextInput } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, ChevronRight, MapPin, Users } from 'lucide-react-native'
import { customerApi } from '../../src/lib/api'
import { CustomerListSkeleton } from '../../src/components/Skeleton'
import { useTheme } from '../../src/lib/theme'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'

type Customer = {
  id: string
  name: string
  phone: string
  email: string | null
  city: string | null
  state: string | null
  address_line1: string | null
  pref_colors: string[]
  pref_styles: string[]
  pref_fabrics: string[]
  budget_min: number | null
  budget_max: number | null
  last_visit_at: string | null
  total_purchases: number
  total_spent: number
}

// ── Memoized Customer Card ─────────────────────────────────────────

const CustomerCard = memo(function CustomerCard({
  item,
  onPress,
}: {
  item: Customer
  onPress: () => void
}) {
  const { colors } = useTheme()
  // Build a location string from available address fields
  const locationParts = [item.city, item.state].filter(Boolean)
  const locationStr = locationParts.length > 0 ? locationParts.join(', ') : null

  // Build a preference summary line (style + fabric)
  const prefSummary = [...item.pref_styles.slice(0, 2)].filter(Boolean)

  return (
    <AnimatedPressable
      onPress={onPress}
      className="bg-white rounded-3xl p-4 border border-lavender-200 shadow-sm flex-row items-center gap-3.5"
    >
      {/* Avatar */}
      <View className="w-12 h-12 rounded-2xl bg-[#560A39] items-center justify-center flex-shrink-0 border border-[#BB3F95]/30">
        <Text
          style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
          className="text-[#E0E1F6] font-bold text-lg"
        >
          {item.name.charAt(0).toUpperCase()}
        </Text>
      </View>

      <View className="flex-1 min-w-0">
        <Text
          style={{
            fontFamily: 'Marcellus_400Regular',
            fontSize: 16,
            lineHeight: 24,
            letterSpacing: 0.32,
            fontWeight: '800',
          }}
          className="text-base leading-6 tracking-[0.02em] font-extrabold text-spaceCadet-900 font-marcellus"
        >
          {item.name}
        </Text>
        
        {/* City / State */}
        {locationStr && (
          <View className="flex-row items-center gap-1 mt-0.5">
            <MapPin size={11} color="#6B4773" />
            <Text className="text-xs text-heliotrope-500 font-medium" numberOfLines={1}>
              {locationStr}
            </Text>
          </View>
        )}

        <Text className="text-xs text-heliotrope-500 mt-0.5 font-medium">
          {item.phone.slice(-4).padStart(item.phone.length, '•')}
        </Text>

        {/* Preference summary chips */}
        {prefSummary.length > 0 && (
          <View className="flex-row flex-wrap gap-1 mt-2">
            {prefSummary.slice(0, 3).map((tag) => (
              <View key={tag} className="bg-lavender-100 px-2.5 py-0.5 rounded-full border border-lavender-200">
                <Text className="text-spaceCadet-900 font-bold text-[11px]">{tag}</Text>
              </View>
            ))}
            {!!item.budget_max && (
              <View className="bg-fuchsia-500/15 px-2.5 py-0.5 rounded-full border border-fuchsia-500/30">
                <Text className="text-fuchsia-700 font-bold text-[11px]">≤{formatPrice(item.budget_max)}</Text>
              </View>
            )}
          </View>
        )}
      </View>

      <ChevronRight size={18} color="#928EB2" />
    </AnimatedPressable>
  )
})

// ── Customers Screen ───────────────────────────────────────────────

export default function CustomersScreen() {
  const { colors } = useTheme()
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search],
    queryFn: () => customerApi.list(search || undefined),
    staleTime: 30_000,
    gcTime: 300_000,
  })

  const customers = ((data as { data: Customer[] } | undefined)?.data ?? [])

  const renderItem = useCallback(
    ({ item }: { item: Customer }) => (
      <CustomerCard item={item} onPress={() => router.push(`/customer/${item.id}`)} />
    ),
    [],
  )

  const keyExtractor = useCallback((item: Customer) => item.id, [])

  const listEmpty = useCallback(
    () => (
      <View className="items-center py-16 px-8">
        {search ? (
          <Text className="text-heliotrope-500 text-sm font-medium">No customers found</Text>
        ) : (
          <>
            <View className="w-16 h-16 bg-lavender-100 rounded-3xl items-center justify-center mb-4 border border-lavender-200">
              <Users size={28} color="#BB3F95" />
            </View>
            <Text
              style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
              className="text-spaceCadet-900 text-lg font-bold text-center"
            >
              No customers yet
            </Text>
            <Text className="text-heliotrope-500 text-xs text-center mt-1 leading-5 font-medium">
              Scan a QR code or add customers manually{'\n'}to start building your CRM.
            </Text>
            <AnimatedPressable
              onPress={() => router.push('/customer/add')}
              className="mt-5 bg-spaceCadet-900 px-6 py-3 rounded-2xl"
            >
              <Text className="text-white text-xs font-bold uppercase tracking-wider">Add First Customer</Text>
            </AnimatedPressable>
          </>
        )}
      </View>
    ),
    [search, colors],
  )

  return (
    <View className="flex-1 bg-[#F8F7FC]">
      {/* Search */}
      <View className="bg-white px-5 py-3.5 border-b border-lavender-200">
        <View className="flex-row items-center bg-lavender-50 rounded-2xl px-4 py-3 gap-2.5 border border-lavender-200">
          <Search size={16} color="#928EB2" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or phone..."
            placeholderTextColor="#928EB2"
            className="flex-1 text-sm font-bold text-spaceCadet-900"
          />
        </View>
      </View>

      {isLoading && customers.length === 0 ? (
        <CustomerListSkeleton />
      ) : (
        <FlatList
          data={customers}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 14, gap: 10, flexGrow: 1 }}
          ListEmptyComponent={listEmpty}
          // ── Performance props ──
          windowSize={5}
          maxToRenderPerBatch={10}
          removeClippedSubviews={true}
          initialNumToRender={10}
        />
      )}

      {/* FAB */}
      <AnimatedPressable
        onPress={() => router.push('/customer/add')}
        className="absolute bottom-6 right-5 w-14 h-14 bg-fuchsia-600 rounded-full items-center justify-center shadow-lg"
        style={{ elevation: 6 }}
        accessibilityLabel="Add customer"
        accessibilityRole="button"
      >
        <Plus size={26} color="white" />
      </AnimatedPressable>
    </View>
  )
}
