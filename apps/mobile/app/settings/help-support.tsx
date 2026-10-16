import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChevronLeft, LifeBuoy } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { AnimatedPressable } from '../../src/components/AnimatedPressable';
import { GradientButton } from '../../src/components/GradientButton';
import { KeyboardScreen } from '../../src/components/KeyboardScreen';
import { WhiteButton } from '../../src/components/WhiteButton';
import { type SupportTicket, type SupportTicketType, ticketApi } from '../../src/lib/api';
import { showError } from '../../src/lib/errors';
import { useScreenInsets } from '../../src/lib/safe-area';

const TICKETS_KEY = ['retailer', 'tickets'];

const TYPES: { value: SupportTicketType; label: string }[] = [
  { value: 'GENERAL', label: 'General help' },
  { value: 'DEMO', label: 'Show me how' },
  { value: 'GROWTH_SETUP', label: 'Growth setup' },
  { value: 'MAINTENANCE', label: 'Something is broken' },
];

const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.value, t.label]));

const STATUS_STYLE: Record<SupportTicket['status'], { label: string; bg: string; text: string }> = {
  OPEN: { label: 'Waiting for a team member', bg: 'bg-amber-100', text: 'text-amber-800' },
  ASSIGNED: { label: 'Assigned', bg: 'bg-fuchsia-100', text: 'text-fuchsia-800' },
  RESOLVED: { label: 'Resolved', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  CLOSED: { label: 'Closed', bg: 'bg-lavender-100', text: 'text-heliotrope-600' },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function TicketRow({ t }: { t: SupportTicket }) {
  const s = STATUS_STYLE[t.status];
  return (
    <View className="bg-white rounded-3xl p-4 border border-lavender-200">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-sm font-bold text-spaceCadet-900 flex-1">
          {TYPE_LABEL[t.ticket_type] ?? 'Support'}
        </Text>
        <View className={`rounded-full px-2.5 py-0.5 ${s.bg}`}>
          <Text className={`text-[10px] font-bold ${s.text}`}>{s.label}</Text>
        </View>
      </View>
      {t.note ? (
        <Text className="text-xs text-spaceCadet-900 mt-2 leading-5">{t.note}</Text>
      ) : null}
      <Text className="text-[11px] text-heliotrope-500 mt-2">
        {formatDate(t.created_at)}
        {t.requires_visit ? ' · visit requested' : ''}
        {t.status === 'ASSIGNED' && t.assigned_to ? ` · ${t.assigned_to.name} is on it` : ''}
      </Text>
      {t.status === 'ASSIGNED' ? (
        <View className="mt-3">
          <WhiteButton
            label="Allow Kanchuki team to help"
            onPress={() => router.push('/settings/support-sessions')}
          />
        </View>
      ) : null}
    </View>
  );
}

export default function HelpSupportScreen() {
  const { headerPaddingTop, screenPaddingBottom } = useScreenInsets();
  const queryClient = useQueryClient();
  const [type, setType] = useState<SupportTicketType>('GENERAL');
  const [note, setNote] = useState('');
  const [needsVisit, setNeedsVisit] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: TICKETS_KEY,
    queryFn: () => ticketApi.list(),
  });
  const tickets = data?.data ?? [];

  const create = useMutation({
    mutationFn: () => ticketApi.create({ ticket_type: type, note: note.trim(), requires_visit: needsVisit }),
    onSuccess: () => {
      setNote('');
      setNeedsVisit(false);
      void queryClient.invalidateQueries({ queryKey: TICKETS_KEY });
    },
    onError: (err) => showError(err, 'Could not raise your ticket. Please try again.'),
  });

  return (
    <KeyboardScreen>
      <View className="flex-1 bg-[#F8F7FC]">
        <View
          className="bg-white border-b border-lavender-200 px-5 pb-4"
          style={{ paddingTop: headerPaddingTop }}
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
              style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
              className="text-xl font-bold text-spaceCadet-900"
            >
              Help & Support
            </Text>
          </View>
        </View>

        <ScrollView
          className="flex-1 px-4 pt-4"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: screenPaddingBottom, gap: 16 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
        >
          <View className="bg-white rounded-3xl p-5 border border-lavender-200">
            <View className="flex-row items-center gap-2 mb-1">
              <LifeBuoy size={18} color="#BB3F95" />
              <Text className="text-base font-bold text-spaceCadet-900">Raise a ticket</Text>
            </View>
            <Text className="text-xs text-heliotrope-500 mb-3 leading-5">
              Tell us what you need. A Kanchuki team member will pick it up. Raising a ticket does not
              give anyone access to your account — you approve that separately.
            </Text>

            <View className="flex-row flex-wrap gap-2 mb-3">
              {TYPES.map((t) => {
                const active = type === t.value;
                return (
                  <AnimatedPressable
                    key={t.value}
                    onPress={() => setType(t.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className={`px-3.5 py-2 rounded-full border ${
                      active ? 'bg-spaceCadet-900 border-spaceCadet-900' : 'bg-lavender-50 border-lavender-200'
                    }`}
                  >
                    <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-spaceCadet-900'}`}>
                      {t.label}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </View>

            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Describe what you need help with…"
              placeholderTextColor="#928EB2"
              multiline
              maxLength={2000}
              textAlignVertical="top"
              accessibilityLabel="Ticket details"
              className="text-sm text-spaceCadet-900 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 min-h-[110px]"
            />

            <View className="flex-row items-center justify-between mt-3 mb-4">
              <Text className="text-xs font-semibold text-spaceCadet-900 flex-1 mr-3">
                I need someone to visit my shop
              </Text>
              <Switch
                value={needsVisit}
                onValueChange={setNeedsVisit}
                trackColor={{ true: '#BB3F95', false: '#E0E1F6' }}
                thumbColor="#ffffff"
                accessibilityLabel="Visit needed"
              />
            </View>

            <GradientButton
              variant="web"
              label="Raise ticket"
              disabled={note.trim().length < 10}
              loading={create.isPending}
              onPress={() => create.mutate()}
            />
            {note.trim().length > 0 && note.trim().length < 10 ? (
              <Text className="text-[11px] text-heliotrope-500 mt-2 text-center">
                Add a little more detail (at least 10 characters).
              </Text>
            ) : null}
          </View>

          <View>
            <Text className="text-xs font-bold text-heliotrope-500 uppercase tracking-wider px-1 mb-2">
              My tickets
            </Text>
            {isLoading ? (
              <ActivityIndicator color="#BB3F95" className="py-6" />
            ) : tickets.length === 0 ? (
              <Text className="text-xs text-heliotrope-500 px-1">No tickets yet.</Text>
            ) : (
              <View style={{ gap: 12 }}>
                {tickets.map((t) => (
                  <TicketRow key={t.id} t={t} />
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </KeyboardScreen>
  );
}
