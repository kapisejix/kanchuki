import { formatPaiseShort } from '@kanchuki/shared'
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


import { LinearGradient } from 'expo-linear-gradient'

function Chip({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={`px-4 py-2 rounded-2xl border ${active ? 'bg-spaceCadet-900 border-spaceCadet-900 shadow-sm' : 'border-lavender-200 bg-lavender-50'}`}
    >
      <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-spaceCadet-900'}`}>{label}</Text>
    </AnimatedPressable>
  )
}

export default function SupplierDetailScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { id } = useLocalSearchParams<{ id: string }>()

  const [txKind, setTxKind] = useState<'ORDER' | 'PAYMENT'>('ORDER')
  const [txAmount, setTxAmount] = useState('')
  const [txNote, setTxNote] = useState('')

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
      <View className="flex-1 bg-[#F8F7FC] items-center justify-center">
        <ActivityIndicator color="#BB3F95" />
      </View>
    )
  }

  return (
    <View className="flex-1 bg-[#F8F7FC]">
      {/* Header */}
      <View
        className="bg-white border-b border-lavender-200 px-5 pb-4"
        style={{ paddingTop: Math.max(insets.top, 24) + 12 }}
      >
        <View className="flex-row items-center gap-3">
          <AnimatedPressable
            onPress={() => router.back()}
            hitSlop={8}
            className="w-10 h-10 rounded-full bg-lavender-100 items-center justify-center border border-lavender-200"
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ChevronLeft size={20} color="#231F48" />
          </AnimatedPressable>
          <Text
            style={{ fontFamily: 'Marcellus_400Regular' }}
            className="text-xl font-bold text-spaceCadet-900 flex-1"
            numberOfLines={1}
          >
            {supplier.name}
          </Text>
          <AnimatedPressable
            onPress={() => router.push(`/growth/supplier-form?id=${supplier.id}`)}
            hitSlop={8}
            className="w-9 h-9 rounded-xl items-center justify-center bg-lavender-100 border border-lavender-200"
            accessibilityLabel="Edit supplier"
            accessibilityRole="button"
          >
            <Pencil size={15} color="#231F48" />
          </AnimatedPressable>
          <AnimatedPressable
            onPress={confirmDelete}
            hitSlop={8}
            className="w-9 h-9 rounded-xl items-center justify-center bg-red-50 border border-red-200"
            accessibilityLabel="Delete supplier"
            accessibilityRole="button"
          >
            <Trash2 size={15} color="#dc2626" />
          </AnimatedPressable>
        </View>
        <View className="mt-2.5">
          <Text className="text-xs text-heliotrope-500 font-medium">
            {[supplier.city, supplier.phone].filter(Boolean).join(' · ') || 'No contact details'}
          </Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Pending Signature Gradient Hero */}
        <LinearGradient
          colors={['#231F48', '#560A39']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="rounded-3xl p-5 mb-5 shadow-sm"
        >
          <Text className="text-xs text-[#E0E1F6] font-bold uppercase tracking-wider">
            Pending Balance
          </Text>
          <Text
            style={{ fontFamily: 'Marcellus_400Regular' }}
            className="text-3xl font-bold text-white mt-1.5"
          >
            {formatPaiseShort(supplier.pending_amount_paise)}
          </Text>
          <Text className="text-xs text-white/70 mt-1 font-medium">Orders − payments balance for this vendor</Text>
        </LinearGradient>

        {/* Add transaction */}
        <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm mb-5">
          <Text
            style={{ fontFamily: 'Marcellus_400Regular' }}
            className="text-base font-bold text-spaceCadet-900 mb-3.5"
          >
            Log Transaction Entry
          </Text>
          <View className="flex-row gap-2 mb-3.5">
            <Chip label="Stock order" active={txKind === 'ORDER'} onPress={() => setTxKind('ORDER')} />
            <Chip label="Payment made" active={txKind === 'PAYMENT'} onPress={() => setTxKind('PAYMENT')} />
          </View>
          <TextInput
            value={txAmount}
            onChangeText={(v) => setTxAmount(v.replace(/[^\d.]/g, ''))}
            placeholder="Amount in ₹"
            placeholderTextColor="#928EB2"
            keyboardType="decimal-pad"
            className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3"
          />
          <TextInput
            value={txNote}
            onChangeText={setTxNote}
            placeholder="Note (optional)"
            placeholderTextColor="#928EB2"
            className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 mt-2.5"
            maxLength={500}
          />
          <View className="mt-4">
            <GradientButton
              label={addTx.isPending ? 'Adding…' : txKind === 'ORDER' ? 'Add Stock Order' : 'Log Payment'}
              onPress={handleAddTx}
              loading={addTx.isPending}
            />
          </View>
        </View>

        {/* Ledger */}
        <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider px-1 mb-3">
          Transaction Ledger · {transactions.length} entries
        </Text>
        {transactions.length === 0 ? (
          <View className="bg-white rounded-3xl p-6 border border-lavender-200 items-center">
            <Text className="text-xs text-heliotrope-500 font-medium">No entries yet — log your first stock order above.</Text>
          </View>
        ) : (
          <View className="gap-2">
            {transactions.map((t: SupplierTransaction) => (
              <View
                key={t.id}
                className="bg-white rounded-2xl px-4 py-3.5 border border-lavender-200 flex-row items-center shadow-sm"
              >
                <View
                  className={`w-10 h-10 rounded-xl items-center justify-center mr-3 ${
                    t.kind === 'ORDER' ? 'bg-lavender-100 border border-lavender-200' : 'bg-fuchsia-500/15 border border-fuchsia-500/30'
                  }`}
                >
                  <Text className={`text-[10px] font-bold ${t.kind === 'ORDER' ? 'text-spaceCadet-900' : 'text-fuchsia-700'}`}>
                    {t.kind === 'ORDER' ? 'ORDER' : 'PAY'}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-bold text-spaceCadet-900" numberOfLines={1}>
                    {t.note ?? (t.kind === 'ORDER' ? 'Stock order' : 'Payment')}
                  </Text>
                  <Text className="text-[10px] text-heliotrope-500 font-medium mt-0.5">
                    {new Date(t.transaction_date).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </Text>
                </View>
                <Text
                  style={{ fontFamily: 'Marcellus_400Regular' }}
                  className={`text-base font-bold ${t.kind === 'ORDER' ? 'text-spaceCadet-900' : 'text-fuchsia-700'}`}
                >
                  {t.kind === 'ORDER' ? '' : '− '}
                  {formatPaiseShort(t.amount_paise)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}
