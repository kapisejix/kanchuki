import { useState, useEffect, useCallback } from 'react'
import { COLORS } from '@kanchuki/shared'
import {
  View, Text, ScrollView, RefreshControl,
  ActivityIndicator, Alert,
} from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import {
  Store, Users, Ticket, MapPin, UserPlus, LogOut,
  Package, Phone, ChevronRight, Calendar,
  CheckCircle2, AlertCircle, Navigation,
} from 'lucide-react-native'
import { teamApi, type TeamMemberInfo, type TerritoryRetailer, type SupportTicketStats } from '../../src/lib/team-api'
import { getItem, deleteItem } from '../../src/lib/storage'
import { clearToken, clearRequestCache } from '../../src/lib/api'
import { useTheme } from '../../src/lib/theme'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'

// ─── Staff Dashboard ─────────────────────────────────────────────

export default function StaffDashboard() {
  const { primaryColor } = useTheme()
  const insets = useSafeAreaInsets()
  const [staffInfo, setStaffInfo] = useState<{ name: string; role: string } | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(true)

  const { data: meData, isLoading: meLoading } = useQuery({
    queryKey: ['staff', 'me'],
    queryFn: () => teamApi.getMe(),
  })

  const { data: retailersData, isLoading: retailersLoading, refetch: refetchRetailers } = useQuery({
    queryKey: ['staff', 'retailers'],
    queryFn: () => teamApi.getRetailers(),
  })

  const { data: ticketStatsData, isLoading: ticketStatsLoading } = useQuery({
    queryKey: ['staff', 'ticket-stats'],
    queryFn: () => teamApi.getTicketStats(),
  })

  useEffect(() => {
    getItem('staff_name').then((name) => {
      getItem('staff_role').then((role) => {
        setStaffInfo({ name: name ?? 'Staff', role: role ?? 'Team Member' })
        setLoadingInfo(false)
      })
    })
  }, [])

  const me = (meData as { data: TeamMemberInfo } | undefined)?.data
  const retailers = (retailersData as { data: TerritoryRetailer[] } | undefined)?.data ?? []
  const ticketStats = (ticketStatsData as { data: SupportTicketStats } | undefined)?.data

  const displayName = me?.name ?? staffInfo?.name ?? 'Staff'
  const displayRole = me?.role ?? staffInfo?.role ?? 'Team Member'
  const territoriesLabel = me?.territories?.map((t) => t.name).join(', ') ?? '—'

  const handleLogout = useCallback(async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await Promise.all([
            clearToken(),
            deleteItem('auth_token'),
            deleteItem('refresh_token'),
            deleteItem('staff_role'),
            deleteItem('staff_name'),
            deleteItem('staff_retailer_id'),
            deleteItem('retailer_id'),
            deleteItem('admin_key'),
          ])
          clearRequestCache()
          router.replace('/auth/phone')
        },
      },
    ])
  }, [])

  const isLoading = meLoading || retailersLoading || ticketStatsLoading || loadingInfo
  const totalTickets = ticketStats
    ? ticketStats.open + ticketStats.assigned
    : 0

  return (
    <View className="flex-1 bg-ink-50">
      {/* Header */}
      <View
        className="bg-ink-700 px-4 pb-6 rounded-b-3xl"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center gap-3">
            <View className="w-11 h-11 rounded-2xl bg-white/15 items-center justify-center">
              <Text className="text-white font-bold text-base">
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-ink-100 text-xs">Staff Dashboard</Text>
              <Text className="text-white text-lg font-bold mt-0.5">{displayName}</Text>
              <View className="flex-row items-center gap-1.5 mt-0.5">
                <MapPin size={11} color="#FFDFDD" />
                <Text className="text-ink-200 text-xs flex-1" numberOfLines={1}>
                  {territoriesLabel}
                </Text>
              </View>
            </View>
          </View>
          <AnimatedPressable
            onPress={handleLogout}
            className="w-9 h-9 rounded-full bg-white/15 items-center justify-center"
            accessibilityLabel="Logout"
            accessibilityRole="button"
          >
            <LogOut size={16} color="white" />
          </AnimatedPressable>
        </View>

        {/* Role badge */}
        <View className="flex-row items-center gap-2">
          <View className="bg-white/20 px-3 py-1 rounded-full">
            <Text className="text-white text-xs font-medium uppercase tracking-wide">
              {displayRole.replace('_', ' ')}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => {
              void refetchRetailers()
            }}
          />
        }
      >
        {isLoading ? (
          <View className="items-center py-16">
            <ActivityIndicator size="large" color={primaryColor} />
            <Text className="text-sand-400 text-sm mt-3">Loading...</Text>
          </View>
        ) : (
          <>
            {/* Quick stats */}
            <View className="flex-row gap-3 px-4 pt-4">
              <StatCard
                icon={<Store size={18} color={primaryColor} />}
                label="Retailers"
                value={retailers.length}
                accent="#FFF1F1"
              />
              <StatCard
                icon={<Ticket size={18} color={COLORS.turmeric[500]} />}
                label="Active Tickets"
                value={totalTickets}
                accent={COLORS.turmeric[50]}
              />
              <StatCard
                icon={<Package size={18} color="#E3262D" />}
                label="Open Issues"
                value={ticketStats?.open ?? 0}
                accent="#FFF1F1"
                pulse={ticketStats && ticketStats.open > 0}
              />
            </View>

            {/* Quick actions */}
            <View className="px-4 pt-5">
              <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
                Quick Actions
              </Text>
              <View className="flex-row gap-3">
                <AnimatedPressable
                  onPress={() => router.push('/staff/retailer-onboard')}
                  className="flex-1 bg-ink-600 rounded-2xl p-4"
                >
                  <UserPlus size={24} color="white" />
                  <Text className="text-white font-semibold text-sm mt-2">New Retailer</Text>
                  <Text className="text-ink-100 text-xs mt-0.5">Quick onboard in field</Text>
                </AnimatedPressable>

                <AnimatedPressable
                  onPress={() => {
                    // Scroll to retailers section — for now just a visual cue
                  }}
                  className="flex-1 bg-white rounded-2xl p-4 border border-sand-100"
                >
                  <Users size={24} color={primaryColor} />
                  <Text className="text-sand-900 font-semibold text-sm mt-2">View Retailers</Text>
                  <Text className="text-sand-400 text-xs mt-0.5">{retailers.length} in territory</Text>
                </AnimatedPressable>
              </View>

              <AnimatedPressable
                onPress={() => router.push('/staff/catalog-tickets')}
                className="mt-3 flex-row items-center gap-3 bg-white rounded-2xl p-4 border border-sand-100"
              >
                <View className="w-10 h-10 rounded-xl bg-ink-50 items-center justify-center">
                  <Package size={20} color={primaryColor} />
                </View>
                <View className="flex-1">
                  <Text className="text-sand-900 font-semibold text-sm">Catalog Upload Jobs</Text>
                  <Text className="text-sand-400 text-xs mt-0.5">
                    Confirmed on-site visits assigned to you
                  </Text>
                </View>
                <ChevronRight size={16} color={COLORS.sand[300]} />
              </AnimatedPressable>
            </View>

            {/* Ticket alerts */}
            {ticketStats && ticketStats.requires_visit > 0 && (
              <View className="mx-4 mt-5 bg-turmeric-50 border border-turmeric-200 rounded-2xl px-4 py-3.5 flex-row items-start gap-3">
                <AlertCircle size={18} color={COLORS.turmeric[600]} className="mt-0.5" />
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-turmeric-800">
                    {ticketStats.requires_visit} visit-required ticket{ticketStats.requires_visit !== 1 ? 's' : ''}
                  </Text>
                  <Text className="text-xs text-turmeric-700 mt-0.5">
                    These retailers need an in-person visit. Check the tickets list for details.
                  </Text>
                </View>
              </View>
            )}

            {/* Retailers in territory */}
            <View className="px-4 pt-5">
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
                  Retailers in Territory
                </Text>
                {retailers.length > 5 && (
                  <AnimatedPressable>
                    <Text className="text-xs text-ink-600 font-semibold">See All</Text>
                  </AnimatedPressable>
                )}
              </View>

              {retailers.length === 0 ? (
                <View className="bg-white rounded-2xl p-8 border border-sand-100 items-center">
                  <Store size={40} color={COLORS.sand[300]} />
                  <Text className="text-sand-400 text-sm mt-4 text-center">
                    No retailers in your territory yet.{'\n'}Tap &quot;New Retailer&quot; to get started.
                  </Text>
                </View>
              ) : (
                <View className="gap-2">
                  {retailers.slice(0, 10).map((r) => (
                    <AnimatedPressable
                      key={r.id}
                      className="bg-white rounded-2xl p-4 border border-sand-100 flex-row items-center"
                    >
                      <View className="w-10 h-10 rounded-xl bg-ink-100 items-center justify-center mr-3">
                        <Text className="text-ink-700 font-bold text-sm">
                          {r.shop_name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-sand-900">{r.shop_name}</Text>
                        <View className="flex-row items-center gap-3 mt-1">
                          <View className="flex-row items-center gap-1">
                            <MapPin size={11} color={COLORS.sand[400]} />
                            <Text className="text-xs text-sand-400">{r.city}</Text>
                          </View>
                          <View className="flex-row items-center gap-1">
                            <Phone size={11} color={COLORS.sand[400]} />
                            <Text className="text-xs text-sand-400">{r.phone}</Text>
                          </View>
                        </View>
                      </View>
                      <View className="items-end gap-1">
                        <StatusBadge status={r.plan_status} />
                        <Text className="text-[10px] text-sand-400">
                          {new Date(r.created_at).toLocaleDateString('en-IN', {
                            day: '2-digit', month: 'short',
                          })}
                        </Text>
                      </View>
                      <ChevronRight size={16} color={COLORS.sand[300]} style={{ marginLeft: 8 }} />
                    </AnimatedPressable>
                  ))}
                </View>
              )}
            </View>

            {/* Ticket summary */}
            {ticketStats && (
              <View className="px-4 pt-5">
                <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
                  Support Tickets
                </Text>
                <View className="bg-white rounded-2xl p-4 border border-sand-100">
                  <View className="flex-row justify-between mb-3">
                    <TicketStat label="Open" value={ticketStats.open} color="amber" />
                    <TicketStat label="Assigned" value={ticketStats.assigned} color="blue" />
                    <TicketStat label="Resolved" value={ticketStats.resolved} color="green" />
                    <TicketStat label="Closed" value={ticketStats.closed} color="gray" />
                  </View>
                  {retailers.length > 0 && ticketStats.open > 0 && (
                    <AnimatedPressable
                      className="bg-ink-50 rounded-xl py-2.5 items-center"
                    >
                      <Text className="text-ink-700 text-xs font-semibold">
                        View Ticket Details
                      </Text>
                    </AnimatedPressable>
                  )}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  )
}

// ─── Sub-components ─────────────────────────────────────────────

function StatCard({
  icon, label, value, accent, pulse,
}: {
  icon: React.ReactNode
  label: string
  value: number
  accent: string
  pulse?: boolean
}) {
  return (
    <View className="flex-1 bg-white rounded-2xl p-4 border border-sand-100">
      <View className="w-8 h-8 rounded-xl items-center justify-center mb-2" style={{ backgroundColor: accent }}>
        {icon}
      </View>
      <Text className={`text-xl font-bold ${pulse ? 'text-turmeric-600' : 'text-sand-900'}`}>
        {value.toLocaleString('en-IN')}
      </Text>
      <Text className="text-xs text-sand-500 mt-0.5">{label}</Text>
    </View>
  )
}

function TicketStat({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    amber: { bg: 'bg-turmeric-100', text: 'text-turmeric-700' },
    blue: { bg: 'bg-ink-100', text: 'text-ink-700' },
    green: { bg: 'bg-turmeric-100', text: 'text-turmeric-700' },
    gray: { bg: 'bg-sand-100', text: 'text-sand-500' },
  }
  const c = colorMap[color] ?? colorMap.gray

  return (
    <View className="items-center">
      <View className={`w-8 h-8 rounded-lg ${c.bg} items-center justify-center mb-1`}>
        <Text className={`text-sm font-bold ${c.text}`}>{value}</Text>
      </View>
      <Text className="text-[10px] text-sand-400">{label}</Text>
    </View>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    TRIAL: { bg: 'bg-turmeric-100', text: 'text-turmeric-700' },
    ACTIVE: { bg: 'bg-turmeric-100', text: 'text-turmeric-700' },
    PAST_DUE: { bg: 'bg-rust-100', text: 'text-rust-700' },
    CANCELLED: { bg: 'bg-sand-100', text: 'text-sand-500' },
  }
  const c = colorMap[status] ?? { bg: 'bg-sand-100', text: 'text-sand-500' }

  return (
    <View className={`${c.bg} px-2 py-0.5 rounded-full`}>
      <Text className={`text-[10px] font-semibold ${c.text}`}>{status}</Text>
    </View>
  )
}
