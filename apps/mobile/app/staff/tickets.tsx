import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { MapPin, Store, Ticket } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, RefreshControl, ScrollView, Text, View } from 'react-native';
import { AnimatedPressable } from '../../src/components/AnimatedPressable';
import { GradientButton } from '../../src/components/GradientButton';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { WhiteButton } from '../../src/components/WhiteButton';
import { showError } from '../../src/lib/errors';
import { useScreenInsets } from '../../src/lib/safe-area';
import { type SupportTicket, type TeamMemberInfo, teamApi } from '../../src/lib/team-api';
import { useTheme } from '../../src/lib/theme';

// General support tickets raised by retailers (Help & Support) or by staff. Catalog-upload
// tickets have their own screen (staff/catalog-tickets) and are excluded here.

const SUPPORT_ROLES = ['SUPPORT_AGENT', 'SUPPORT_MANAGER', 'SUPER_ADMIN'];
const MANAGER_ROLES = ['SUPPORT_MANAGER', 'SUPER_ADMIN'];

type Filter = 'ACTIVE' | 'RESOLVED' | 'ALL';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'ACTIVE', label: 'Active' },
  { key: 'RESOLVED', label: 'Resolved' },
  { key: 'ALL', label: 'All' },
];

const TYPE_LABEL: Record<string, string> = {
  GENERAL: 'General help',
  DEMO: 'Show me how',
  GROWTH_SETUP: 'Growth setup',
  MAINTENANCE: 'Something is broken',
};

const STATUS_STYLE: Record<SupportTicket['status'], { label: string; bg: string; text: string }> = {
  OPEN: { label: 'Open', bg: 'bg-turmeric-100', text: 'text-turmeric-700' },
  ASSIGNED: { label: 'Assigned', bg: 'bg-ink-100', text: 'text-ink-700' },
  RESOLVED: { label: 'Resolved', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  CLOSED: { label: 'Closed', bg: 'bg-sand-100', text: 'text-sand-600' },
};

function matches(filter: Filter, t: SupportTicket) {
  if (filter === 'ACTIVE') return t.status === 'OPEN' || t.status === 'ASSIGNED';
  if (filter === 'RESOLVED') return t.status === 'RESOLVED' || t.status === 'CLOSED';
  return true;
}

export default function StaffTicketsScreen() {
  const { primaryColor, colors } = useTheme();
  const { screenPaddingBottom } = useScreenInsets();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('ACTIVE');

  const { data: meData } = useQuery({ queryKey: ['staff', 'me'], queryFn: () => teamApi.getMe() });
  const me = (meData as { data: TeamMemberInfo } | undefined)?.data;
  const canAct = me ? SUPPORT_ROLES.includes(me.role) : false;
  const isManager = me ? MANAGER_ROLES.includes(me.role) : false;

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['staff', 'tickets'],
    queryFn: () => teamApi.getTickets(),
  });

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; status: string; assigned_to_id?: string }) =>
      teamApi.updateTicket(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staff', 'tickets'] });
      void queryClient.invalidateQueries({ queryKey: ['staff', 'ticket-stats'] });
    },
    onError: (err) => showError(err as Error, 'Could not update the ticket'),
  });

  const all = ((data as { data: SupportTicket[] } | undefined)?.data ?? []).filter(
    (t) => t.ticket_type !== 'CATALOG_UPLOAD',
  );
  const tickets = all.filter((t) => matches(filter, t));

  return (
    <View className="flex-1 bg-white">
      <ScreenHeader title="Support Tickets">
        <View className="flex-row gap-2 mt-3">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <AnimatedPressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                className={`px-4 py-1.5 rounded-full border ${
                  active ? 'bg-ink-600 border-ink-600' : 'bg-white border-sand-200'
                }`}
              >
                <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-sand-700'}`}>
                  {f.label} ({all.filter((t) => matches(f.key, t)).length})
                </Text>
              </AnimatedPressable>
            );
          })}
        </View>
      </ScreenHeader>

      {isLoading ? (
        <ActivityIndicator color={primaryColor} className="mt-12" />
      ) : (
        <ScrollView
          className="flex-1 px-4"
          contentContainerStyle={{ paddingTop: 12, paddingBottom: screenPaddingBottom }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
        >
          {tickets.length === 0 ? (
            <View className="items-center py-16">
              <Ticket size={40} color={colors.sand[300]} />
              <Text className="text-sand-400 text-sm mt-4 text-center px-8">
                {filter === 'ACTIVE' ? 'No active tickets right now.' : 'No tickets here.'}
              </Text>
            </View>
          ) : (
            <View className="gap-3">
              {tickets.map((t) => {
                const s = STATUS_STYLE[t.status];
                const mine = me != null && t.assigned_to_id === me.id;
                const canPickUp = canAct && t.status === 'OPEN' && !t.assigned_to_id;
                const canResolve = canAct && t.status === 'ASSIGNED' && (mine || isManager);
                const busy = update.isPending && update.variables?.id === t.id;
                return (
                  <View key={t.id} className="bg-white rounded-2xl p-4 border border-sand-100">
                    <View className="flex-row items-center gap-2 mb-1">
                      <Store size={16} color={primaryColor} />
                      <Text className="text-sm font-bold text-sand-900 flex-1">{t.retailer.shop_name}</Text>
                      <View className={`rounded-full px-2.5 py-0.5 ${s.bg}`}>
                        <Text className={`text-[10px] font-bold ${s.text}`}>{s.label}</Text>
                      </View>
                    </View>
                    <View className="flex-row items-center gap-1 mb-2">
                      <MapPin size={12} color={colors.sand[400]} />
                      <Text className="text-xs text-sand-400">{t.retailer.city}</Text>
                    </View>
                    <Text className="text-xs font-semibold text-sand-700">
                      {TYPE_LABEL[t.ticket_type] ?? 'Support'}
                      {t.requires_visit ? ' · visit needed' : ''}
                    </Text>
                    {t.note ? <Text className="text-xs text-sand-600 mt-1 leading-5">{t.note}</Text> : null}
                    <Text className="text-[11px] text-sand-400 mt-2">
                      {new Date(t.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                      {t.assigned_to ? ` · ${mine ? 'You' : t.assigned_to.name}` : ' · unassigned'}
                    </Text>

                    <View className="flex-row gap-2 mt-3">
                      <View className="flex-1">
                        <WhiteButton
                          label="Call"
                          onPress={() => void Linking.openURL(`tel:${t.retailer.phone}`)}
                        />
                      </View>
                      {canPickUp && me ? (
                        <View className="flex-1">
                          <GradientButton
                            variant="web"
                            label="Pick up"
                            loading={busy}
                            onPress={() => update.mutate({ id: t.id, status: 'ASSIGNED', assigned_to_id: me.id })}
                          />
                        </View>
                      ) : null}
                      {canResolve ? (
                        <View className="flex-1">
                          <GradientButton
                            variant="web"
                            label="Mark resolved"
                            loading={busy}
                            onPress={() => update.mutate({ id: t.id, status: 'RESOLVED' })}
                          />
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
