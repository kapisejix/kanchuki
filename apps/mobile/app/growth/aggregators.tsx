import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import {
  ChevronLeft,
  Link2,
  RefreshCw,
  ExternalLink,
  Plus,
  Trash2,
  AlertTriangle,
} from 'lucide-react-native'
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'
import { growthApi, type ChannelSync, type ChannelType } from '../../src/lib/api/growth'
import { showError } from '../../src/lib/errors'

// ─── Helpers ──────────────────────────────────────────────────────

const CHANNEL_LABELS: Record<ChannelType, string> = {
  MEESHO: 'Meesho',
  INSTAMOJO: 'Instamojo',
  GLOAD: 'Glroad',
  CRAFTSVILLA: 'Craftsvilla',
  FLIPKART: 'Flipkart',
  AMAZON: 'Amazon',
  OTHER: 'Other',
}

const CHANNEL_EMOJI: Record<ChannelType, string> = {
  MEESHO: '🛍️',
  INSTAMOJO: '💰',
  GLOAD: '📦',
  CRAFTSVILLA: '🎨',
  FLIPKART: '🛒',
  AMAZON: '📦',
  OTHER: '🔗',
}

const STATUS_LABELS: Record<string, { label: string; bg: string; text: string; border: string }> = {
  CONNECTED: { label: 'Connected', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  SYNCING: { label: 'Syncing…', bg: 'bg-fuchsia-500/10', text: 'text-fuchsia-700', border: 'border-fuchsia-500/20' },
  ERROR: { label: 'Error', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  DISCONNECTED: { label: 'Disconnected', bg: 'bg-lavender-100', text: 'text-spaceCadet-900', border: 'border-lavender-200' },
  CONNECTING: { label: 'Connecting…', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  SUSPENDED: { label: 'Suspended', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
}

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

// ─── Main Screen ──────────────────────────────────────────────────

export default function AggregatorsScreen() {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const [connecting, setConnecting] = useState(false)

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['growth', 'aggregators'],
    queryFn: () => growthApi.aggregators(),
  })
  const syncs = data?.data ?? []

  const triggerSync = useMutation({
    mutationFn: (id: string) => growthApi.triggerSync(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['growth', 'aggregators'] })
    },
    onError: (err) => showError(err, 'Sync failed'),
  })

  const disconnect = useMutation({
    mutationFn: (id: string) => growthApi.disconnectChannel(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['growth', 'aggregators'] })
    },
    onError: (err) => showError(err, 'Failed to disconnect'),
  })

  const confirmDisconnect = (s: ChannelSync) => {
    Alert.alert(
      'Disconnect channel?',
      `Remove "${CHANNEL_LABELS[s.channel]}" from your synced channels?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => disconnect.mutate(s.id),
        },
      ],
    )
  }

  return (
    <View className="flex-1 bg-[#F8F7FC]">
      {/* Header */}
      <View
        className="bg-white border-b border-lavender-200 px-5 pb-4"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="flex-row items-center justify-between">
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
              className="text-xl font-bold text-spaceCadet-900"
            >
              Marketplace Sync
            </Text>
          </View>
          <AnimatedPressable
            onPress={() => setConnecting(true)}
            accessibilityLabel="Connect channel"
            accessibilityRole="button"
            className="w-10 h-10 rounded-2xl items-center justify-center bg-fuchsia-600 shadow-sm"
          >
            <Plus size={20} color="white" />
          </AnimatedPressable>
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#BB3F95" />
        </View>
      ) : syncs.length === 0 && !connecting ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <View className="items-center">
            <View
              className="w-16 h-16 rounded-3xl items-center justify-center mb-4 bg-lavender-100 border border-lavender-200"
            >
              <Link2 size={28} color="#BB3F95" />
            </View>
            <Text
              style={{ fontFamily: 'Marcellus_400Regular' }}
              className="text-xl font-bold text-spaceCadet-900"
            >
              No channels connected
            </Text>
            <Text className="text-xs text-heliotrope-500 text-center mt-1.5 leading-relaxed max-w-[280px] font-medium">
              Connect your Meesho, Instamojo, or other marketplace accounts to sync
              your product catalog and orders in one place.
            </Text>
            <View className="w-48 mt-5">
              <GradientButton label="Connect Channel" onPress={() => setConnecting(true)} />
            </View>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          className="flex-1 px-4 pt-4"
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
        >
          <View className="gap-3">
            {syncs.map((s) => {
              const st = STATUS_LABELS[s.status] ?? STATUS_LABELS.DISCONNECTED
              return (
                <View key={s.id} className="bg-white rounded-3xl p-4 border border-lavender-200 shadow-sm">
                  <View className="flex-row items-center justify-between mb-2.5">
                    <View className="flex-row items-center gap-3 flex-1 mr-2">
                      <View
                        className="w-10 h-10 rounded-2xl items-center justify-center bg-lavender-100 border border-lavender-200"
                      >
                        <Text className="text-lg">{CHANNEL_EMOJI[s.channel]}</Text>
                      </View>
                      <View className="flex-1">
                        <Text
                          style={{ fontFamily: 'Marcellus_400Regular' }}
                          className="text-base font-bold text-spaceCadet-900"
                          numberOfLines={1}
                        >
                          {CHANNEL_LABELS[s.channel]}
                        </Text>
                        <Text className="text-xs text-heliotrope-500 font-medium mt-0.5">
                          {s.products_synced} products · {s.orders_synced} orders
                        </Text>
                      </View>
                    </View>
                    <View className="flex-row items-center gap-1">
                      <View className={`rounded-full px-2.5 py-0.5 border ${st.bg} ${st.border}`}>
                        <Text className={`text-[10px] font-bold ${st.text}`}>
                          {st.label}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {s.last_sync_error ? (
                    <View className="flex-row items-center gap-2 bg-rose-50 border border-rose-200 rounded-2xl px-3.5 py-2.5 mb-2.5">
                      <AlertTriangle size={14} color="#dc2626" />
                      <Text className="text-xs text-rose-700 flex-1 font-semibold" numberOfLines={1}>
                        {s.last_sync_error}
                      </Text>
                    </View>
                  ) : null}

                  <View className="flex-row items-center gap-2 pt-2 border-t border-lavender-100">
                    <Text className="text-xs text-heliotrope-400 font-medium">
                      Last sync: {fmtDate(s.last_synced_at)}
                    </Text>
                    <View className="ml-auto flex-row items-center gap-3">
                      {s.channel_shop_url ? (
                        <AnimatedPressable
                          accessibilityLabel="Open shop"
                          accessibilityRole="button"
                          hitSlop={8}
                        >
                          <ExternalLink size={16} color="#928EB2" />
                        </AnimatedPressable>
                      ) : null}
                      <AnimatedPressable
                        onPress={() => triggerSync.mutate(s.id)}
                        accessibilityLabel="Sync now"
                        accessibilityRole="button"
                        hitSlop={8}
                      >
                        <RefreshCw size={16} color="#BB3F95" />
                      </AnimatedPressable>
                      <AnimatedPressable
                        onPress={() => confirmDisconnect(s)}
                        accessibilityLabel={`Disconnect ${CHANNEL_LABELS[s.channel]}`}
                        accessibilityRole="button"
                        hitSlop={8}
                      >
                        <Trash2 size={16} color="#dc2626" />
                      </AnimatedPressable>
                    </View>
                  </View>
                </View>
              )
            })}
          </View>

          <View className="mt-5">
            <GradientButton label="+ Connect Channel" onPress={() => setConnecting(true)} />
          </View>
        </ScrollView>
      )}

      {/* Connect form modal */}
      {connecting && (
        <ConnectChannelModal
          onClose={() => setConnecting(false)}
          onSaved={() => {
            setConnecting(false)
            void queryClient.invalidateQueries({ queryKey: ['growth', 'aggregators'] })
          }}
        />
      )}
    </View>
  )
}

// ─── Connect Channel Modal ─────────────────────────────────────────

const CHANNELS: { value: ChannelType; label: string; emoji: string }[] = [
  { value: 'MEESHO', label: 'Meesho', emoji: '🛍️' },
  { value: 'INSTAMOJO', label: 'Instamojo', emoji: '💰' },
  { value: 'GLOAD', label: 'Glroad', emoji: '📦' },
  { value: 'CRAFTSVILLA', label: 'Craftsvilla', emoji: '🎨' },
  { value: 'FLIPKART', label: 'Flipkart', emoji: '🛒' },
  { value: 'AMAZON', label: 'Amazon', emoji: '📦' },
  { value: 'OTHER', label: 'Other', emoji: '🔗' },
]

function ConnectChannelModal({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const insets = useSafeAreaInsets()

  const [channel, setChannel] = useState<ChannelType>('MEESHO')
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [shopId, setShopId] = useState('')
  const [shopUrl, setShopUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = apiKey.trim() && !saving

  const submit = async () => {
    if (!canSubmit) return
    setSaving(true)
    setError('')
    try {
      await growthApi.connectChannel({
        channel,
        api_key: apiKey.trim(),
        api_secret: apiSecret.trim() || undefined,
        channel_shop_id: shopId.trim() || undefined,
        channel_shop_url: shopUrl.trim() || undefined,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect')
      setSaving(false)
    }
  }

  return (
    <View
      className="absolute inset-0 bg-black/60 items-center justify-end"
      style={{ paddingBottom: insets.bottom }}
    >
      <View className="bg-white rounded-t-3xl w-full px-5 pt-6 pb-8 border-t border-lavender-200">
        <Text
          style={{ fontFamily: 'Marcellus_400Regular' }}
          className="text-xl font-bold text-spaceCadet-900 mb-5"
        >
          Connect Marketplace
        </Text>

        {/* Channel picker */}
        <Text className="text-xs font-bold text-heliotrope-500 uppercase tracking-wider mb-1.5">Marketplace Channel</Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          {CHANNELS.map((c) => {
            const active = channel === c.value
            return (
              <AnimatedPressable
                key={c.value}
                onPress={() => setChannel(c.value)}
                className={`flex-row items-center gap-1.5 py-2 px-3.5 rounded-full border ${
                  active ? 'bg-spaceCadet-900 border-spaceCadet-900 shadow-sm' : 'bg-lavender-50 border-lavender-200'
                }`}
              >
                <Text className="text-sm">{c.emoji}</Text>
                <Text
                  className={`text-xs font-bold ${active ? 'text-white' : 'text-spaceCadet-900'}`}
                >
                  {c.label}
                </Text>
              </AnimatedPressable>
            )
          })}
        </View>

        {/* API Key */}
        <Text className="text-xs font-bold text-heliotrope-500 uppercase tracking-wider mb-1.5">API Key *</Text>
        <TextInput
          value={apiKey}
          onChangeText={setApiKey}
          placeholder="Your marketplace API key"
          placeholderTextColor="#928EB2"
          className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-4"
          secureTextEntry
        />

        {/* API Secret */}
        <Text className="text-xs font-bold text-heliotrope-500 uppercase tracking-wider mb-1.5">API Secret (optional)</Text>
        <TextInput
          value={apiSecret}
          onChangeText={setApiSecret}
          placeholder="Your marketplace API secret"
          placeholderTextColor="#928EB2"
          className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-4"
          secureTextEntry
        />

        {/* Shop ID */}
        <Text className="text-xs font-bold text-heliotrope-500 uppercase tracking-wider mb-1.5">Seller / Shop ID</Text>
        <TextInput
          value={shopId}
          onChangeText={setShopId}
          placeholder="e.g. seller_abc123"
          placeholderTextColor="#928EB2"
          className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-4"
        />

        {/* Shop URL */}
        <Text className="text-xs font-bold text-heliotrope-500 uppercase tracking-wider mb-1.5">Shop Storefront URL (optional)</Text>
        <TextInput
          value={shopUrl}
          onChangeText={setShopUrl}
          placeholder="https://meesho.com/myshop"
          placeholderTextColor="#928EB2"
          className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-4"
          autoCapitalize="none"
          keyboardType="url"
        />

        {error ? (
          <View className="bg-rose-50 border border-rose-200 rounded-2xl px-3.5 py-2.5 mb-4">
            <Text className="text-xs text-rose-600 font-semibold">{error}</Text>
          </View>
        ) : null}

        <View className="flex-row gap-3">
          <View className="flex-1">
            <GradientButton
              label={saving ? 'Connecting…' : 'Connect Channel'}
              onPress={() => void submit()}
              disabled={!canSubmit}
            />
          </View>
          <AnimatedPressable
            onPress={onClose}
            className="flex-1 items-center justify-center bg-lavender-100 rounded-2xl py-3 border border-lavender-200"
          >
            <Text className="text-sm font-bold text-spaceCadet-900">Cancel</Text>
          </AnimatedPressable>
        </View>
      </View>
    </View>
  )
}

