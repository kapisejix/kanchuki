import { useState } from 'react'
import { View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, Phone, ChevronRight } from 'lucide-react-native'
import { customerApi } from '../../src/lib/api'
import { formatPrice } from '@kanchuki/shared'

type Customer = {
  id: string
  name: string
  phone: string
  pref_colors: string[]
  pref_styles: string[]
  budget_min: number | null
  budget_max: number | null
  last_visit_at: string | null
  total_purchases: number
}

export default function CustomersScreen() {
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search],
    queryFn: () => customerApi.list(search || undefined),
  })

  const customers = ((data as { data: Customer[] } | undefined)?.data ?? [])

  return (
    <View className="flex-1 bg-gray-50">
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

      {isLoading ? (
        <ActivityIndicator className="mt-16" color="#7C3AED" />
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => router.push(`/customer/${item.id}`)}
              className="bg-white rounded-2xl p-4 border border-gray-100 flex-row items-center gap-3"
            >
              {/* Avatar */}
              <View className="w-12 h-12 rounded-full bg-violet-100 items-center justify-center flex-shrink-0">
                <Text className="text-violet-700 font-bold text-lg">
                  {item.name.charAt(0).toUpperCase()}
                </Text>
              </View>

              <View className="flex-1 min-w-0">
                <Text className="text-sm font-semibold text-gray-900">{item.name}</Text>
                <Text className="text-xs text-gray-400 mt-0.5">
                  {item.phone.slice(-4).padStart(item.phone.length, '•')}
                </Text>

                {/* Preference chips */}
                {item.pref_colors.length > 0 && (
                  <View className="flex-row flex-wrap gap-1 mt-1.5">
                    {item.pref_colors.slice(0, 3).map((color) => (
                      <View key={color} className="bg-violet-50 px-2 py-0.5 rounded-full">
                        <Text className="text-violet-700 text-xs">{color}</Text>
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
          )}
          ListEmptyComponent={
            <View className="items-center py-16">
              <Text className="text-gray-400 text-sm">
                {search ? 'No customers found' : 'No customers yet'}
              </Text>
              <TouchableOpacity
                onPress={() => router.push('/customer/add')}
                className="mt-3 bg-violet-600 px-5 py-2.5 rounded-xl"
              >
                <Text className="text-white text-sm font-semibold">Add First Customer</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        onPress={() => router.push('/customer/add')}
        className="absolute bottom-6 right-4 w-14 h-14 bg-violet-600 rounded-full items-center justify-center shadow-lg"
        style={{ elevation: 6 }}
      >
        <Plus size={24} color="white" />
      </TouchableOpacity>
    </View>
  )
}
