import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { AlertTriangle, ChevronRight } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { scheduleApi } from '../../lib/api/schedule';
import { useAuth } from '../../lib/auth-context';
import { staffCan } from '../../lib/staff-can';
import { AnimatedPressable } from '../AnimatedPressable';

/**
 * F-043 §4a banner: shown on the home tab and Growth hub while a scheduling
 * plan is paused, a post failed/missed, or a Meta token expires within 7 days.
 * Derived from GET /schedule/status on every load — nothing is stored, so it
 * clears itself the moment the cause is fixed. Renders nothing when there is
 * no scheduler, the role can't see it, or the request fails.
 */
export function SchedulerBanner() {
  const { staffRole } = useAuth();
  const allowed = staffCan(staffRole, 'social.schedule');
  const { data } = useQuery({
    queryKey: ['social', 'schedule', 'status'],
    queryFn: () => scheduleApi.status(),
    enabled: allowed,
    staleTime: 60_000,
    retry: false,
  });
  const s = data?.data;
  if (!allowed || !s?.needs_attention) return null;

  const paused = s.platforms.find((p) => p.plan?.status === 'PAUSED');
  const expiring = s.platforms.find((p) => p.plan && p.token.state !== 'OK');
  const message = paused?.plan?.pause_reason
    ? paused.plan.pause_reason
    : expiring
      ? expiring.token.state === 'EXPIRED'
        ? `${expiring.account_name}: connection expired`
        : `${expiring.account_name}: connection expires in ${expiring.token.days_left} days`
      : `${s.failures.length} scheduled post${s.failures.length === 1 ? '' : 's'} need attention`;

  return (
    <AnimatedPressable
      onPress={() => router.push('/social/schedule')}
      accessibilityRole="button"
      accessibilityLabel="Open the post scheduler"
      className="flex-row items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3"
    >
      <AlertTriangle size={18} color="#B45309" />
      <View className="flex-1">
        <Text className="text-xs font-bold text-amber-900">Post scheduler needs attention</Text>
        <Text className="text-[11px] text-amber-800 mt-0.5" numberOfLines={2}>
          {message}
        </Text>
      </View>
      <ChevronRight size={16} color="#B45309" />
    </AnimatedPressable>
  );
}
