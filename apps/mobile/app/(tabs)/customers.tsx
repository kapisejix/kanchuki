import { useState, useCallback, memo } from 'react'
import { View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, ChevronRight, MapPin } from 'lucide-react-native'
import { customerApi } from '../../src/lib/api'
import { formatPrice } from '@kanchuki/shared'

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
  pref_occasions: string[]
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
  // Build a location string from available address fields
  const locationParts = [item.city, item.state].filter(Boolean)
  const locationStr = locationParts.length > 0 ? locationParts.join(', ') : null

  // Build a preference summary line (style + occasion)
  const prefSummary = [
    ...item.pref_styles.slice(0, 2),
    ...item.pref_occasions.slice(0, 2),
  ].filter(Boolean)

  return (
    <TouchableOpacity
      onPress={onPress}
      className="bg-white rounded-2xl p-4 border border-gray-100 flex-row items-center gap-3"
    >
      {/* Avatar */}
      <View className="w-12 h-12 rounded-full bg-cyan-100 items-center justify-center flex-shrink-0">
        <Text className="text-cyan-700 font-bold text-lg">
          {item.name.charAt(0).toUpperCase()}
        </Text>
      </View>

      <View className="flex-1 min-w-0">
        <Text className="text-sm font-semibold text-gray-900">{item.name}</Text>
        
        {/* City / State */}
        {locationStr && (
          <View className="flex-row items-center gap-1 mt-0.5">
            <MapPin size={10} color="#9CA3AF" />
            <Text className="text-xs text-gray-400" numberOfLines={1}>{locationStr}</Text>
          </View>
        )}

        <Text className="text-xs text-gray-400 mt-0.5">
          {item.phone.slice(-4).padStart(item.phone.length, '•')}
        </Text>

        {/* Preference summary chips */}
        {prefSummary.length > 0 && (
          <View className="flex-row flex-wrap gap-1 mt-1.5">
            {prefSummary.slice(0, 3).map((tag) => (
              <View key={tag} className="bg-cyan-50 px-2 py-0.5 rounded-full">
                <Text className="text-cyan-700 text-xs">{tag}</Text>
              </View>
            ))}
            {item.budget_max && (
              <View className="bg-green-50 px-2 py-0.5 rounded-full">
                <Text className="text-green-700 text-xs">≤{formatPrice(item.budget_max)}</Text>
              </View>
            )}
          </View>
        )}
      </View>

      <ChevronRight size={16} color="#D1D5DB" />
    </TouchableOpacity>
  )
})

// ── Customers Screen ───────────────────────────────────────────────

export default function CustomersScreen() {
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
      <View className="items-center py-16">
        <Text className="text-gray-400 text-sm">
          {search ? 'No customers found' : 'No customers yet'}
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/customer/add')}
          className="mt-3 bg-cyan-600 px-5 py-2.5 rounded-xl"
        >
          <Text className="text-white text-sm font-semibold">Add First Customer</Text>
        </TouchableOpacity>
      </View>
    ),
    [search],
  )

  return (
    <View className="flex-1 bg-cyan-50">
      {/* Search */}
      <View className="bg-white px-4 py-3 border-b border-gray-100">
        <View className="flex-row items-center bg-gray-100 rounded-xl px-3 py-2.5 gap-2">
          <Search size={16} color="#9CA3AF" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or phone..."
            placeholderTextColor="#9CA3AF"
            className="flex-1 text-sm text-gray-900"
          />
        </View>
      </View>

      {isLoading && customers.length === 0 ? (
        <ActivityIndicator className="mt-16" color="#0891B2" />
      ) : (
        <FlatList
          data={customers}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, gap: 8, flexGrow: 1 }}
          ListEmptyComponent={listEmpty}
          // ── Performance props ──
          windowSize={5}
          maxToRenderPerBatch={10}
          removeClippedSubviews={true}
          initialNumToRender={10}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        onPress={() => router.push('/customer/add')}
        className="absolute bottom-6 right-4 w-14 h-14 bg-cyan-600 rounded-full items-center justify-center shadow-lg"
        style={{ elevation: 6 }}
      >
        <Plus size={24} color="white" />
      </TouchableOpacity>
    </View>
  )
}
