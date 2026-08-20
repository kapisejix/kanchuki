import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import {
  ChevronLeft,
  ChevronRight,
  Link2,
  RefreshCw,
  Store,
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
import { useTheme } from '../../src/lib/theme'

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

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  CONNECTED: { label: 'Connected', color: '#22C55E' },
  SYNCING: { label: 'Syncing…', color: '#3B82F6' },
  ERROR: { label: 'Error', color: '#EF4444' },
  DISCONNECTED: { label: 'Disconnected', color: '#9CA3AF' },
  CONNECTING: { label: 'Connecting…', color: '#F59E0B' },
  SUSPENDED: { label: 'Suspended', color: '#F97316' },
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
  const { primaryColor, colors } = useTheme()
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
    <View className="flex-1 bg-ink-50">
      {/* Header */}
      <View
        className="bg-white border-b border-sand-100 px-4 pb-4"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <AnimatedPressable
              onPress={() => router.back()}
              hitSlop={8}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <ChevronLeft size={24} color={colors.sand[700]} />
            </AnimatedPressable>
            <Text className="text-base font-bold text-sand-900">Marketplace Sync</Text>
          </View>
          <AnimatedPressable
            onPress={() => setConnecting(true)}
            accessibilityLabel="Connect channel"
            accessibilityRole="button"
            className="w-9 h-9 rounded-xl items-center justify-center"
            style={{ backgroundColor: `${primaryColor}1A` }}
          >
            <Plus size={20} color={primaryColor} />
          </AnimatedPressable>
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={primaryColor} />
        </View>
      ) : syncs.length === 0 && !connecting ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <View className="items-center">
            <View
              className="w-16 h-16 rounded-3xl items-center justify-center mb-4"
              style={{ backgroundColor: `${primaryColor}1A` }}
            >
              <Link2 size={28} color={primaryColor} />
            </View>
            <Text className="text-base font-bold text-sand-900">No channels connected</Text>
            <Text className="text-xs text-sand-500 text-center mt-1.5 leading-4 max-w-[280px]">
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
          <View className="gap-2.5">
            {syncs.map((s) => {
              const st = STATUS_LABELS[s.status] ?? STATUS_LABELS.DISCONNECTED
              return (
                <View key={s.id} className="bg-white rounded-2xl p-4 border border-sand-100">
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="flex-row items-center gap-2 flex-1 mr-2">
                      <View
                        className="w-9 h-9 rounded-xl items-center justify-center"
                        style={{ backgroundColor: `${primaryColor}1A` }}
                      >
                        <Text className="text-base">{CHANNEL_EMOJI[s.channel]}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-bold text-sand-900" numberOfLines={1}>
                          {CHANNEL_LABELS[s.channel]}
                        </Text>
                        <Text className="text-xs text-sand-400">
                          {s.products_synced} products · {s.orders_synced} orders
                        </Text>
                      </View>
                    </View>
                    <View className="flex-row items-center gap-1">
                      <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: `${st.color}15` }}>
                        <Text className="text-[10px] font-semibold" style={{ color: st.color }}>
                          {st.label}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {s.last_sync_error ? (
                    <View className="flex-row items-center gap-1.5 bg-red-50 rounded-xl px-3 py-2 mb-2">
                      <AlertTriangle size={12} color="#EF4444" />
                      <Text className="text-[11px] text-red-600 flex-1" numberOfLines={1}>
                        {s.last_sync_error}
                      </Text>
                    </View>
                  ) : null}

                  <View className="flex-row items-center gap-2 mt-1">
                    <Text className="text-[10px] text-sand-400">
                      Last sync: {fmtDate(s.last_synced_at)}
                    </Text>
                    <View className="ml-auto flex-row items-center gap-2">
                      {s.channel_shop_url ? (
                        <AnimatedPressable
                          accessibilityLabel="Open shop"
                          accessibilityRole="button"
                          hitSlop={8}
                        >
                          <ExternalLink size={14} color={colors.sand[400]} />
                        </AnimatedPressable>
                      ) : null}
                      <AnimatedPressable
                        onPress={() => triggerSync.mutate(s.id)}
                        accessibilityLabel="Sync now"
                        accessibilityRole="button"
                        hitSlop={8}
                      >
                        <RefreshCw size={14} color={primaryColor} />
                      </AnimatedPressable>
                      <AnimatedPressable
                        onPress={() => confirmDisconnect(s)}
                        accessibilityLabel={`Disconnect ${CHANNEL_LABELS[s.channel]}`}
                        accessibilityRole="button"
                        hitSlop={8}
                      >
                        <Trash2 size={14} color={colors.rust?.[500] ?? '#C2724D'} />
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
  const { primaryColor, colors } = useTheme()
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
      <View className="bg-white rounded-t-3xl w-full px-5 pt-6 pb-8">
        <Text className="text-base font-bold text-sand-900 mb-5">Connect Marketplace</Text>

        {/* Channel picker */}
        <Text className="text-xs font-semibold text-sand-500 uppercase mb-1.5">Marketplace</Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          {CHANNELS.map((c) => (
            <AnimatedPressable
              key={c.value}
              onPress={() => setChannel(c.value)}
              className="flex-row items-center gap-1 py-2 px-3 rounded-xl border"
              style={{
                backgroundColor: channel === c.value ? `${primaryColor}1A` : colors.sand[50],
                borderColor: channel === c.value ? primaryColor : colors.sand[200],
              }}
            >
              <Text className="text-sm">{c.emoji}</Text>
              <Text
                className="text-[11px] font-semibold"
                style={{ color: channel === c.value ? primaryColor : colors.sand[500] }}
              >
                {c.label}
              </Text>
            </AnimatedPressable>
          ))}
        </View>

        {/* API Key */}
        <Text className="text-xs font-semibold text-sand-500 uppercase mb-1.5">API Key *</Text>
        <TextInput
          value={apiKey}
          onChangeText={setApiKey}
          placeholder="Your marketplace API key"
          placeholderTextColor={colors.sand[300]}
          className="border border-sand-200 rounded-xl px-3 py-2.5 text-sm text-sand-900 mb-4"
          secureTextEntry
        />

        {/* API Secret */}
        <Text className="text-xs font-semibold text-sand-500 uppercase mb-1.5">API Secret (optional)</Text>
        <TextInput
          value={apiSecret}
          onChangeText={setApiSecret}
          placeholder="Your marketplace API secret"
          placeholderTextColor={colors.sand[300]}
          className="border border-sand-200 rounded-xl px-3 py-2.5 text-sm text-sand-900 mb-4"
          secureTextEntry
        />

        {/* Shop ID */}
        <Text className="text-xs font-semibold text-sand-500 uppercase mb-1.5">Seller/Shop ID</Text>
        <TextInput
          value={shopId}
          onChangeText={setShopId}
          placeholder="e.g. seller_abc123"
          placeholderTextColor={colors.sand[300]}
          className="border border-sand-200 rounded-xl px-3 py-2.5 text-sm text-sand-900 mb-4"
        />

        {/* Shop URL */}
        <Text className="text-xs font-semibold text-sand-500 uppercase mb-1.5">Shop URL (optional)</Text>
        <TextInput
          value={shopUrl}
          onChangeText={setShopUrl}
          placeholder="https://meesho.com/myshop"
          placeholderTextColor={colors.sand[300]}
          className="border border-sand-200 rounded-xl px-3 py-2.5 text-sm text-sand-900 mb-4"
          autoCapitalize="none"
          keyboardType="url"
        />

        {error ? (
          <View className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
            <Text className="text-xs text-red-600">{error}</Text>
          </View>
        ) : null}

        <View className="flex-row gap-3">
          <View className="flex-1">
            <GradientButton
              label={saving ? 'Connecting…' : 'Connect'}
              onPress={() => void submit()}
              disabled={!canSubmit}
            />
          </View>
          <AnimatedPressable
            onPress={onClose}
            className="flex-1 items-center justify-center bg-sand-100 rounded-xl py-3"
          >
            <Text className="text-sm font-semibold text-sand-600">Cancel</Text>
          </AnimatedPressable>
        </View>
      </View>
    </View>
  )
}
