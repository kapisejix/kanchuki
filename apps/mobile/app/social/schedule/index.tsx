import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CalendarClock, ChevronLeft, Facebook, Instagram } from 'lucide-react-native';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { AnimatedPressable } from '../../../src/components/AnimatedPressable';
import { GradientButton } from '../../../src/components/GradientButton';
import { formatIst, scheduleApi, tokenLabel } from '../../../src/lib/api/schedule';
import type { ScheduleStatus } from '../../../src/lib/api/schedule';
import { useAuth } from '../../../src/lib/auth-context';
import { showError } from '../../../src/lib/errors';
import { useScreenInsets } from '../../../src/lib/safe-area';
import { staffCan } from '../../../src/lib/staff-can';

const STATUS_KEY = ['social', 'schedule', 'status'];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between py-1.5">
      <Text className="text-xs text-heliotrope-500 font-medium">{label}</Text>
      <Text className="text-xs font-bold text-spaceCadet-900">{value}</Text>
    </View>
  );
}

function PlatformCard({
  p,
  canPlan,
  isOwner,
  onChanged,
}: {
  p: ScheduleStatus['platforms'][number];
  canPlan: boolean;
  isOwner: boolean;
  onChanged: () => void;
}) {
  const Icon = p.platform === 'FACEBOOK' ? Facebook : Instagram;
  const toggle = useMutation({
    mutationFn: (to: 'PAUSED' | 'ACTIVE') => scheduleApi.setPlanState(p.plan?.id as string, to),
    onSuccess: onChanged,
    onError: (err) => showError(err, 'Could not change the plan. Please try again.'),
  });
  const tokenBad = p.token.state !== 'OK';

  return (
    <View className="bg-white rounded-3xl p-5 border border-lavender-200">
      <View className="flex-row items-center gap-3 mb-3">
        <View className="w-10 h-10 rounded-2xl bg-lavender-100 items-center justify-center">
          <Icon size={18} color="#BB3F95" />
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-spaceCadet-900" numberOfLines={1}>
            {p.account_name}
          </Text>
          <Text
            className={`text-xs font-semibold ${tokenBad ? 'text-red-600' : 'text-heliotrope-500'}`}
          >
            {tokenLabel(p.token)}
          </Text>
        </View>
      </View>

      {tokenBad &&
        (isOwner ? (
          <GradientButton label="Reconnect" onPress={() => router.push('/settings/social')} />
        ) : (
          <Text className="text-xs text-red-600 font-semibold">
            Ask the shop owner to reconnect {p.platform === 'FACEBOOK' ? 'Facebook' : 'Instagram'}.
          </Text>
        ))}

      {p.plan ? (
        <View className="mt-2">
          <Row
            label="Plan"
            value={
              p.plan.status === 'ACTIVE' ? `Running · daily ${p.plan.post_time} IST` : 'Paused'
            }
          />
          {p.plan.status === 'PAUSED' && p.plan.pause_reason ? (
            <Text className="text-xs text-red-600 font-semibold mb-1">{p.plan.pause_reason}</Text>
          ) : null}
          <Row
            label="Next post"
            value={
              p.next_post
                ? `${formatIst(p.next_post.scheduled_at)} · ${p.next_post.slides} photos`
                : '—'
            }
          />
          <View className="flex-row gap-3 mt-3">
            <View className="flex-1">
              <GradientButton
                label="View calendar"
                onPress={() => router.push(`/social/schedule/${p.plan?.id}`)}
              />
            </View>
            <AnimatedPressable
              accessibilityRole="button"
              disabled={toggle.isPending || (p.plan.status === 'PAUSED' && tokenBad)}
              onPress={() => toggle.mutate(p.plan?.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE')}
              className="px-4 rounded-2xl border border-lavender-200 items-center justify-center"
            >
              <Text className="text-xs font-bold text-spaceCadet-900">
                {p.plan.status === 'ACTIVE' ? 'Pause' : 'Resume'}
              </Text>
            </AnimatedPressable>
          </View>
        </View>
      ) : canPlan ? (
        <View className="mt-3">
          <GradientButton
            label="Create posting plan"
            onPress={() => router.push(`/social/schedule/new?account=${p.account_id}`)}
          />
        </View>
      ) : (
        <Text className="text-xs text-heliotrope-500 mt-2">No posting plan yet.</Text>
      )}
    </View>
  );
}

export default function SchedulerHomeScreen() {
  const { headerPaddingTop, screenPaddingBottom } = useScreenInsets();
  const { staffRole } = useAuth();
  const queryClient = useQueryClient();
  const canView = staffCan(staffRole, 'social.schedule');
  const canPlan = staffCan(staffRole, 'social.schedule.plan');
  const isOwner = !staffRole || staffRole === 'owner';

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => scheduleApi.status(),
    enabled: canView,
  });
  const s = data?.data;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: STATUS_KEY });

  const fix = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'retry' | 'skip' }) =>
      scheduleApi.patchPost(id, { action }),
    onSuccess: refresh,
    onError: (err) => showError(err, 'Could not update that post. Please refresh and try again.'),
  });

  return (
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
            Post Scheduler
          </Text>
        </View>
      </View>

      {!canView ? (
        <View className="flex-1 items-center justify-center p-8">
          <Text className="text-sm text-heliotrope-500 text-center">
            Your role can't open the post scheduler. Ask the shop owner.
          </Text>
        </View>
      ) : isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#BB3F95" />
        </View>
      ) : isError || !s ? (
        <View className="flex-1 items-center justify-center p-8 gap-3">
          <Text className="text-sm text-heliotrope-500 text-center">
            Couldn't load the scheduler. Check your connection.
          </Text>
          <GradientButton label="Retry" onPress={() => void refetch()} />
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-4 pt-4"
          contentContainerStyle={{ paddingBottom: screenPaddingBottom, gap: 14 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
          }
        >
          {s.platforms.length === 0 ? (
            <View className="bg-white rounded-3xl p-6 border border-lavender-200 items-center">
              <CalendarClock size={28} color="#BB3F95" />
              <Text className="text-base font-bold text-spaceCadet-900 mt-3">
                Connect Facebook or Instagram first
              </Text>
              <Text className="text-xs text-heliotrope-500 text-center mt-1.5">
                Scheduled posts go out through your connected account.
              </Text>
              {isOwner ? (
                <View className="mt-4 w-52">
                  <GradientButton
                    label="Connect account"
                    onPress={() => router.push('/settings/social')}
                  />
                </View>
              ) : null}
            </View>
          ) : (
            s.platforms.map((p) => (
              <PlatformCard
                key={p.account_id}
                p={p}
                canPlan={canPlan}
                isOwner={isOwner}
                onChanged={refresh}
              />
            ))
          )}

          <View className="bg-white rounded-3xl p-5 border border-lavender-200">
            <Text className="text-sm font-bold text-spaceCadet-900 mb-1">Your allowance</Text>
            <Row
              label="Scheduled posts this month"
              value={
                s.allowance.limit == null
                  ? `${s.allowance.used} used · unlimited`
                  : `${s.allowance.used} of ${s.allowance.limit} used`
              }
            />
            <Row
              label="Active plans"
              value={
                s.active_plans.max == null
                  ? `${s.active_plans.count}`
                  : `${s.active_plans.count} of ${s.active_plans.max}`
              }
            />
            <Row
              label="AI Studio shoots left"
              value={
                !s.studio_shoots.included
                  ? 'Not included in your plan'
                  : s.studio_shoots.unlimited
                    ? 'Unlimited'
                    : `${s.studio_shoots.remaining} of ${s.studio_shoots.limit}`
              }
            />
            <Text className="text-[11px] text-heliotrope-500 mt-1">
              The scheduler only uses photos already on your products — it never spends AI Studio
              shoots.
            </Text>
            {s.studio_shoots.included ? (
              <AnimatedPressable
                onPress={() => router.push('/(tabs)/catalog')}
                accessibilityRole="button"
                className="mt-3 self-start px-4 py-2 rounded-xl border border-lavender-200"
              >
                <Text className="text-xs font-bold text-spaceCadet-900">
                  Create photos in AI Studio
                </Text>
              </AnimatedPressable>
            ) : null}
          </View>

          <View className="bg-white rounded-3xl p-5 border border-lavender-200">
            <Text className="text-sm font-bold text-spaceCadet-900 mb-2">Recent problems</Text>
            {s.failures.length === 0 ? (
              <Text className="text-xs text-heliotrope-500">Nothing needs attention.</Text>
            ) : (
              s.failures.map((f) => (
                <View key={f.id} className="py-2.5 border-t border-lavender-100">
                  <Text className="text-xs font-bold text-spaceCadet-900">
                    {f.platform === 'FACEBOOK' ? 'Facebook' : 'Instagram'} ·{' '}
                    {f.status === 'MISSED' ? 'Missed' : 'Failed'} · {formatIst(f.scheduled_at)}
                  </Text>
                  <Text className="text-xs text-red-600 mt-0.5">
                    {f.reason ?? "Post failed. We'll retry. If it keeps failing, contact support."}
                  </Text>
                  <View className="flex-row gap-2 mt-2">
                    <AnimatedPressable
                      accessibilityRole="button"
                      disabled={fix.isPending}
                      onPress={() => fix.mutate({ id: f.id, action: 'retry' })}
                      className="px-3 py-1.5 rounded-xl bg-fuchsia-600"
                    >
                      <Text className="text-xs font-bold text-white">Retry</Text>
                    </AnimatedPressable>
                    <AnimatedPressable
                      accessibilityRole="button"
                      disabled={fix.isPending}
                      onPress={() => fix.mutate({ id: f.id, action: 'skip' })}
                      className="px-3 py-1.5 rounded-xl border border-lavender-200"
                    >
                      <Text className="text-xs font-bold text-spaceCadet-900">Skip</Text>
                    </AnimatedPressable>
                    <AnimatedPressable
                      accessibilityRole="button"
                      onPress={() => router.push(`/social/schedule/${f.plan_id}`)}
                      className="px-3 py-1.5 rounded-xl border border-lavender-200"
                    >
                      <Text className="text-xs font-bold text-spaceCadet-900">Edit</Text>
                    </AnimatedPressable>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
