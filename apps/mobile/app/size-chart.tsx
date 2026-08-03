import { useEffect, useState } from 'react'
import { COLORS } from '@kanchuki/shared'
import { View, Text, ScrollView, TextInput, ActivityIndicator, Alert } from 'react-native'
import { router } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft, Plus, Trash2, Check } from 'lucide-react-native'
import { sizeChartApi, type SizeChartCategory, type SizeChartRow } from '../src/lib/api'
import { showError } from '../src/lib/errors'
import { useTheme } from '../src/lib/theme'
import { AnimatedPressable } from '../src/components/AnimatedPressable'
import { GradientButton } from '../src/components/GradientButton'

const CATEGORIES: { value: SizeChartCategory; label: string }[] = [
  { value: 'UPPER', label: 'Kurtas / Tops / Dresses' },
  { value: 'LOWER', label: 'Pants / Palazzos / Skirts' },
]

const AXES_BY_CATEGORY: Record<SizeChartCategory, { key: 'bust' | 'waist' | 'hip' | 'length'; label: string }[]> = {
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
  const { primaryColor } = useTheme()
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
      showError(err, 'Something went wrong', 'Save failed')
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
    <View className="flex-1 bg-ink-50" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-4 py-3 border-b border-sand-100 bg-white">
        <AnimatedPressable onPress={() => router.back()} className="mr-3" accessibilityLabel="Go back" accessibilityRole="button">
          <ChevronLeft size={22} color={COLORS.sand[700]} />
        </AnimatedPressable>
        <Text className="text-lg font-bold text-sand-900">Size Charts</Text>
      </View>

      <View className="flex-row px-4 pt-4 gap-2">
        {CATEGORIES.map((c) => (
          <AnimatedPressable
            key={c.value}
            onPress={() => setCategory(c.value)}
            className={`flex-1 py-2.5 rounded-xl items-center border ${
              category === c.value ? 'bg-ink-600 border-ink-600' : 'bg-white border-sand-200'
            }`}
          >
            <Text className={`text-xs font-semibold ${category === c.value ? 'text-white' : 'text-sand-600'}`}>
              {c.label}
            </Text>
          </AnimatedPressable>
        ))}
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={primaryColor} />
        </View>
      ) : (
        <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 24 }}>
          <Text className="text-xs text-sand-500 mb-3">
            One row per size (S, M, L...). {"Leave a field blank if that measurement isn't tracked."}
          </Text>

          {rows.map((row, index) => (
            <View key={index} className="bg-white rounded-2xl p-4 border border-sand-100 mb-3">
              <View className="flex-row items-center justify-between mb-3">
                <TextInput
                  value={row.size_label}
                  onChangeText={(v) => updateRow(index, 'size_label', v)}
                  placeholder="Size label (e.g. M)"
                  placeholderTextColor={COLORS.sand[400]}
                  className="text-base font-bold text-sand-900 flex-1"
                />
                <AnimatedPressable
                  onPress={() => removeRow(index)}
                  accessibilityLabel="Remove size row"
                  accessibilityRole="button"
                >
                  <Trash2 size={18} color={COLORS.rust[600]} />
                </AnimatedPressable>
              </View>

              {axes.map((axis) => (
                <View key={axis.key} className="flex-row items-center gap-2 mb-2">
                  <Text className="text-xs text-sand-500 w-12">{axis.label}</Text>
                  <TextInput
                    value={row[`${axis.key}_min_cm` as keyof SizeChartRow]?.toString() ?? ''}
                    onChangeText={(v) => updateRow(index, `${axis.key}_min_cm` as keyof SizeChartRow, v)}
                    placeholder="min cm"
                    placeholderTextColor={COLORS.sand[400]}
                    keyboardType="numeric"
                    className="flex-1 bg-sand-50 rounded-lg px-3 py-2 text-sm text-sand-900"
                  />
                  <Text className="text-sand-300 text-xs">–</Text>
                  <TextInput
                    value={row[`${axis.key}_max_cm` as keyof SizeChartRow]?.toString() ?? ''}
                    onChangeText={(v) => updateRow(index, `${axis.key}_max_cm` as keyof SizeChartRow, v)}
                    placeholder="max cm"
                    placeholderTextColor={COLORS.sand[400]}
                    keyboardType="numeric"
                    className="flex-1 bg-sand-50 rounded-lg px-3 py-2 text-sm text-sand-900"
                  />
                </View>
              ))}
            </View>
          ))}

          <AnimatedPressable
            onPress={addRow}
            className="flex-row items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-ink-300 mb-4"
          >
            <Plus size={16} color={primaryColor} />
            <Text className="text-ink-600 text-sm font-semibold">Add Size Row</Text>
          </AnimatedPressable>

          <GradientButton
            label="Save Chart"
            onPress={() => save.mutate()}
            loading={save.isPending}
            icon={<Check size={18} color="white" />}
          />
        </ScrollView>
      )}
    </View>
  )
}
