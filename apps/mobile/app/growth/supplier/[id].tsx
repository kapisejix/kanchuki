import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, Pencil, Trash2 } from 'lucide-react-native'
import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../../src/components/AnimatedPressable'
import { GradientButton } from '../../../src/components/GradientButton'
import { growthApi, type SupplierTransaction } from '../../../src/lib/api/growth'
import { showError } from '../../../src/lib/errors'
import { useTheme } from '../../../src/lib/theme'

const inr = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`

function Chip({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  const { primaryColor, colors } = useTheme()
  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={`px-3.5 py-2 rounded-xl border ${active ? 'border-ink-600' : 'border-sand-200 bg-white'}`}
      style={active ? { backgroundColor: primaryColor } : undefined}
    >
      <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-sand-600'}`}>{label}</Text>
    </AnimatedPressable>
  )
}

export default function SupplierDetailScreen() {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { id } = useLocalSearchParams<{ id: string }>()

  const [txKind, setTxKind] = useState<'ORDER' | 'PAYMENT'>('ORDER')
  const [txAmount, setTxAmount] = useState('')
  const [txNote, setTxNote] = useState('')
  const [adding, setAdding] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['growth', 'suppliers', id],
    queryFn: () => growthApi.supplier(id!),
  })
  const supplier = data?.data
  const transactions = supplier?.transactions ?? []

  const addTx = useMutation({
    mutationFn: () =>
      growthApi.addSupplierTransaction(id!, {
        kind: txKind,
        amount_paise: Math.round((parseFloat(txAmount) || 0) * 100),
        note: txNote.trim() || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['growth', 'suppliers'] })
      setTxAmount('')
      setTxNote('')
    },
    onError: (err) => showError(err, 'Failed to log transaction'),
  })

  const remove = useMutation({
    mutationFn: () => growthApi.deleteSupplier(id!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['growth', 'suppliers'] })
      router.back()
    },
    onError: (err) => showError(err, 'Failed to delete supplier'),
  })

  const confirmDelete = () => {
    Alert.alert('Delete supplier?', `This deletes ${supplier?.name ?? 'this supplier'} and their full transaction history.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate() },
    ])
  }

  const handleAddTx = () => {
    const amount = Math.round((parseFloat(txAmount) || 0) * 100)
    if (!amount || amount <= 0) {
      Alert.alert('Amount required', 'Enter the order or payment amount in ₹.')
      return
    }
    addTx.mutate()
  }

  if (isLoading || !supplier) {
    return (
      <View className="flex-1 bg-ink-50 items-center justify-center">
        <ActivityIndicator color={primaryColor} />
      </View>
    )
  }

  return (
    <View className="flex-1 bg-ink-50">
      {/* Header */}
      <View
        className="bg-white border-b border-sand-100 px-4 pb-4"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="flex-row items-center gap-3">
          <AnimatedPressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ChevronLeft size={24} color={colors.sand[700]} />
          </AnimatedPressable>
          <Text className="text-base font-bold text-sand-900 flex-1" numberOfLines={1}>
            {supplier.name}
          </Text>
          <AnimatedPressable
            onPress={() => router.push(`/growth/supplier-form?id=${supplier.id}`)}
            hitSlop={8}
            accessibilityLabel="Edit supplier"
            accessibilityRole="button"
          >
            <Pencil size={17} color={colors.sand[600]} />
          </AnimatedPressable>
          <AnimatedPressable onPress={confirmDelete} hitSlop={8} accessibilityLabel="Delete supplier" accessibilityRole="button">
            <Trash2 size={17} color={colors.rust[500]} />
          </AnimatedPressable>
        </View>
        <View className="mt-2.5">
          <Text className="text-xs text-sand-500">
            {[supplier.city, supplier.phone].filter(Boolean).join(' · ') || 'No contact details'}
          </Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Pending */}
        <View className="bg-ink-600 rounded-2xl p-4 mb-4">
          <Text className="text-xs text-turmeric-300 font-semibold uppercase tracking-wide">
            Pending balance
          </Text>
          <Text className="text-2xl font-bold text-white mt-1">
            {inr(supplier.pending_amount_paise)}
          </Text>
          <Text className="text-[11px] text-white/50 mt-1">Orders − payments for this supplier</Text>
        </View>

        {/* Add transaction */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100 mb-4">
          <Text className="text-sm font-bold text-sand-900 mb-3">Log an entry</Text>
          <View className="flex-row gap-2 mb-3">
            <Chip label="Stock order" active={txKind === 'ORDER'} onPress={() => setTxKind('ORDER')} />
            <Chip label="Payment made" active={txKind === 'PAYMENT'} onPress={() => setTxKind('PAYMENT')} />
          </View>
          <TextInput
            value={txAmount}
            onChangeText={(v) => setTxAmount(v.replace(/[^\d.]/g, ''))}
            placeholder="Amount in ₹"
            placeholderTextColor={colors.sand[400]}
            keyboardType="decimal-pad"
            className="text-sm text-sand-900 bg-sand-50 rounded-xl px-3.5 py-3"
          />
          <TextInput
            value={txNote}
            onChangeText={setTxNote}
            placeholder="Note (optional)"
            placeholderTextColor={colors.sand[400]}
            className="text-sm text-sand-900 bg-sand-50 rounded-xl px-3.5 py-3 mt-2"
            maxLength={500}
          />
          <View className="mt-3">
            <GradientButton
              label={addTx.isPending ? 'Adding…' : txKind === 'ORDER' ? 'Add Stock Order' : 'Log Payment'}
              onPress={handleAddTx}
              loading={addTx.isPending}
            />
          </View>
        </View>

        {/* Ledger */}
        <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide px-1 mb-2.5">
          Ledger · {transactions.length} entries
        </Text>
        {transactions.length === 0 ? (
          <View className="bg-white rounded-2xl p-5 border border-sand-100 items-center">
            <Text className="text-xs text-sand-400">No entries yet — log your first stock order above.</Text>
          </View>
        ) : (
          <View className="gap-1.5">
            {transactions.map((t: SupplierTransaction) => (
              <View
                key={t.id}
                className="bg-white rounded-xl px-3.5 py-3 border border-sand-100 flex-row items-center"
              >
                <View
                  className={`w-9 h-9 rounded-lg items-center justify-center mr-3 ${
                    t.kind === 'ORDER' ? 'bg-sand-100' : 'bg-emerald-50'
                  }`}
                >
                  <Text className={`text-[10px] font-bold ${t.kind === 'ORDER' ? 'text-sand-600' : 'text-emerald-600'}`}>
                    {t.kind === 'ORDER' ? 'ORDER' : 'PAY'}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-semibold text-sand-800" numberOfLines={1}>
                    {t.note ?? (t.kind === 'ORDER' ? 'Stock order' : 'Payment')}
                  </Text>
                  <Text className="text-[10px] text-sand-400">
                    {new Date(t.transaction_date).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </Text>
                </View>
                <Text
                  className={`text-sm font-bold ${t.kind === 'ORDER' ? 'text-sand-900' : 'text-emerald-600'}`}
                >
                  {t.kind === 'ORDER' ? '' : '− '}
                  {inr(t.amount_paise)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}
