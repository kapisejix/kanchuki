import { useEffect, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native'
import { router } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft, Plus, Trash2, Check } from 'lucide-react-native'
import { sizeChartApi, type SizeChartCategory, type SizeChartRow } from '../src/lib/api'

const CATEGORIES: { value: SizeChartCategory; label: string }[] = [
  { value: 'UPPER', label: 'Kurtas / Tops / Dresses' },
  { value: 'LOWER', label: 'Pants / Palazzos / Skirts' },
]

const AXES_BY_CATEGORY: Record<SizeChartCategory, Array<{ key: 'bust' | 'waist' | 'hip' | 'length'; label: string }>> = {
  UPPER: [
    { key: 'bust', label: 'Bust' },
    { key: 'waist', label: 'Waist' },
    { key: 'hip', label: 'Hip' },
  ],
  LOWER: [
    { key: 'waist', label: 'Waist' },
    { key: 'hip', label: 'Hip' },
    { key: 'length', label: 'Length' },
  ],
}

function emptyRow(sortOrder: number): SizeChartRow {
  return { size_label: '', sort_order: sortOrder }
}

export default function SizeChartScreen() {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const [category, setCategory] = useState<SizeChartCategory>('UPPER')
  const [rows, setRows] = useState<SizeChartRow[]>([emptyRow(0)])

  const { data, isLoading } = useQuery({
    queryKey: ['size-charts'],
    queryFn: () => sizeChartApi.list(),
  })

  useEffect(() => {
    const chart = data?.data.find((c) => c.category === category)
    setRows(chart?.rows.length ? chart.rows : [emptyRow(0)])
  }, [data, category])

  const save = useMutation({
    mutationFn: () => {
      const cleanRows = rows
        .filter((r) => r.size_label.trim().length > 0)
        .map((r, i) => ({ ...r, sort_order: i }))
      return sizeChartApi.save(category, cleanRows)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['size-charts'] })
      Alert.alert('Saved', `${CATEGORIES.find((c) => c.value === category)?.label} size chart updated.`)
    },
    onError: (err) => {
      Alert.alert('Save failed', err instanceof Error ? err.message : 'Something went wrong')
    },
  })

  const updateRow = (index: number, field: keyof SizeChartRow, value: string) => {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row
        if (field === 'size_label') return { ...row, size_label: value }
        const num = value.trim() === '' ? undefined : Number(value)
        return { ...row, [field]: Number.isNaN(num) ? undefined : num }
      }),
    )
  }

  const removeRow = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index))
  const addRow = () => setRows((prev) => [...prev, emptyRow(prev.length)])

  const axes = AXES_BY_CATEGORY[category]

  return (
    <View className="flex-1 bg-cyan-50" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-4 py-3 border-b border-gray-100 bg-white">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <ChevronLeft size={22} color="#374151" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900">Size Charts</Text>
      </View>

      <View className="flex-row px-4 pt-4 gap-2">
        {CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c.value}
            onPress={() => setCategory(c.value)}
            className={`flex-1 py-2.5 rounded-xl items-center border ${
              category === c.value ? 'bg-cyan-600 border-cyan-600' : 'bg-white border-gray-200'
            }`}
          >
            <Text className={`text-xs font-semibold ${category === c.value ? 'text-white' : 'text-gray-600'}`}>
              {c.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#0891B2" />
        </View>
      ) : (
        <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 24 }}>
          <Text className="text-xs text-gray-500 mb-3">
            One row per size (S, M, L...). Leave a field blank if that measurement isn't tracked.
          </Text>

          {rows.map((row, index) => (
            <View key={index} className="bg-white rounded-2xl p-4 border border-gray-100 mb-3">
              <View className="flex-row items-center justify-between mb-3">
                <TextInput
                  value={row.size_label}
                  onChangeText={(v) => updateRow(index, 'size_label', v)}
                  placeholder="Size label (e.g. M)"
                  placeholderTextColor="#9CA3AF"
                  className="text-base font-bold text-gray-900 flex-1"
                />
                <TouchableOpacity onPress={() => removeRow(index)}>
                  <Trash2 size={18} color="#DC2626" />
                </TouchableOpacity>
              </View>

              {axes.map((axis) => (
                <View key={axis.key} className="flex-row items-center gap-2 mb-2">
                  <Text className="text-xs text-gray-500 w-12">{axis.label}</Text>
                  <TextInput
                    value={row[`${axis.key}_min_cm` as keyof SizeChartRow]?.toString() ?? ''}
                    onChangeText={(v) => updateRow(index, `${axis.key}_min_cm` as keyof SizeChartRow, v)}
                    placeholder="min cm"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric"
                    className="flex-1 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-900"
                  />
                  <Text className="text-gray-300 text-xs">–</Text>
                  <TextInput
                    value={row[`${axis.key}_max_cm` as keyof SizeChartRow]?.toString() ?? ''}
                    onChangeText={(v) => updateRow(index, `${axis.key}_max_cm` as keyof SizeChartRow, v)}
                    placeholder="max cm"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric"
                    className="flex-1 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-900"
                  />
                </View>
              ))}
            </View>
          ))}

          <TouchableOpacity
            onPress={addRow}
            className="flex-row items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-cyan-300 mb-4"
          >
            <Plus size={16} color="#0891B2" />
            <Text className="text-cyan-600 text-sm font-semibold">Add Size Row</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => save.mutate()}
            disabled={save.isPending}
            className="bg-cyan-600 py-4 rounded-2xl items-center flex-row justify-center gap-2"
          >
            {save.isPending ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Check size={18} color="white" />
                <Text className="text-white font-semibold">Save Chart</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  )
}
