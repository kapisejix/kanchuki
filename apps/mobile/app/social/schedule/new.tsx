import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Minus, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import { AnimatedPressable } from '../../../src/components/AnimatedPressable';
import { GradientButton } from '../../../src/components/GradientButton';
import { KeyboardScreen } from '../../../src/components/KeyboardScreen';
import { scheduleApi } from '../../../src/lib/api/schedule';
import type { CreatePlanInput } from '../../../src/lib/api/schedule';
import { useAuth } from '../../../src/lib/auth-context';
import { showError } from '../../../src/lib/errors';
import { useScreenInsets } from '../../../src/lib/safe-area';
import { staffCan } from '../../../src/lib/staff-can';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIMES = ['11:00', '13:00', '17:00', '19:30', '21:00'];
const HORIZONS: Array<{ v: CreatePlanInput['horizon']; label: string }> = [
  { v: '1W', label: '1 week' },
  { v: '2W', label: '2 weeks' },
  { v: '1M', label: '1 month' },
];
const MAX_SLIDES = 10;

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={`px-3.5 py-2 rounded-xl border ${
        active ? 'bg-fuchsia-600 border-fuchsia-600' : 'bg-white border-lavender-200'
      }`}
    >
      <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-spaceCadet-900'}`}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  label: string;
}) {
  return (
    <View className="flex-row items-center gap-2">
      <AnimatedPressable
        accessibilityLabel={`Decrease ${label}`}
        accessibilityRole="button"
        onPress={() => onChange(Math.max(min, value - 1))}
        className="w-8 h-8 rounded-lg bg-lavender-100 items-center justify-center"
      >
        <Minus size={14} color="#231F48" />
      </AnimatedPressable>
      <Text className="w-6 text-center text-sm font-bold text-spaceCadet-900">{value}</Text>
      <AnimatedPressable
        accessibilityLabel={`Increase ${label}`}
        accessibilityRole="button"
        onPress={() => onChange(Math.min(max, value + 1))}
        className="w-8 h-8 rounded-lg bg-lavender-100 items-center justify-center"
      >
        <Plus size={14} color="#231F48" />
      </AnimatedPressable>
    </View>
  );
}

export default function NewSchedulePlanScreen() {
  const { headerPaddingTop, screenPaddingBottom } = useScreenInsets();
  const { staffRole } = useAuth();
  const queryClient = useQueryClient();
  const { account } = useLocalSearchParams<{ account?: string }>();
  const canPlan = staffCan(staffRole, 'social.schedule.plan');

  const statusQuery = useQuery({
    queryKey: ['social', 'schedule', 'status'],
    queryFn: () => scheduleApi.status(),
  });
  const accounts = statusQuery.data?.data.platforms ?? [];

  const [accountId, setAccountId] = useState<string | null>(account ?? null);
  const [postType, setPostType] = useState<CreatePlanInput['post_type']>('CAROUSEL');
  const [weekdays, setWeekdays] = useState<number[]>([1, 3, 5]);
  const [ranges, setRanges] = useState<Record<number, { min: number; max: number }>>({});
  const [time, setTime] = useState('19:30');
  const [source, setSource] = useState<CreatePlanInput['source']>('NEWEST');
  const [category, setCategory] = useState('');
  const [horizon, setHorizon] = useState<CreatePlanInput['horizon']>('2W');

  const selectedAccount = accountId ?? accounts.find((a) => !a.plan)?.account_id ?? null;
  const rangeOf = (d: number) => ranges[d] ?? { min: 4, max: 5 };
  const timeOk = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  const valid =
    !!selectedAccount &&
    weekdays.length > 0 &&
    timeOk &&
    (source === 'NEWEST' || category.trim().length > 0);

  const create = useMutation({
    mutationFn: () => {
      const input: CreatePlanInput = {
        social_account_id: selectedAccount as string,
        post_type: postType,
        weekdays,
        batch_ranges: Object.fromEntries(
          weekdays.map((d) => [
            String(d),
            postType === 'SINGLE_PRODUCT' ? { min: 1, max: 1 } : rangeOf(d),
          ]),
        ),
        post_time: time,
        source,
        ...(source === 'CATEGORY' ? { category: category.trim() } : {}),
        // Task 4 (templates) — the form has no cover/template controls yet.
        cover_style: null,
        rotation_pool: [],
        horizon,
      };
      return scheduleApi.createPlan(input);
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['social', 'schedule'] });
      router.replace(`/social/schedule/${res.data.id}`);
    },
    onError: (err) =>
      showError(
        err,
        'Could not build your calendar. Check that you have in-stock products with photos and that scheduling is on for your plan.',
      ),
  });

  const toggleDay = (d: number) =>
    setWeekdays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));

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
              New posting plan
            </Text>
          </View>
        </View>

        {!canPlan ? (
          <View className="flex-1 items-center justify-center p-8">
            <Text className="text-sm text-heliotrope-500 text-center">
              Only the shop owner can create a posting plan.
            </Text>
          </View>
        ) : statusQuery.isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#BB3F95" />
          </View>
        ) : (
          <ScrollView
            className="flex-1 px-4 pt-4"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: screenPaddingBottom, gap: 18 }}
          >
            <View>
              <Text className="text-xs font-bold text-spaceCadet-900 mb-2">Post to</Text>
              <View className="flex-row flex-wrap gap-2">
                {accounts.map((a) => (
                  <Chip
                    key={a.account_id}
                    label={`${a.platform === 'FACEBOOK' ? 'Facebook' : 'Instagram'} · ${a.account_name}`}
                    active={selectedAccount === a.account_id}
                    onPress={() => setAccountId(a.account_id)}
                  />
                ))}
              </View>
              {accounts.length === 0 ? (
                <Text className="text-xs text-red-600 mt-1">
                  Connect Facebook or Instagram first (Settings → Social).
                </Text>
              ) : null}
              {accounts.find((a) => a.account_id === selectedAccount)?.plan ? (
                <Text className="text-xs text-red-600 mt-1">
                  This account already has a plan. End it first to start a new one.
                </Text>
              ) : null}
            </View>

            <View>
              <Text className="text-xs font-bold text-spaceCadet-900 mb-2">Post style</Text>
              <View className="flex-row gap-2">
                <Chip
                  label="Carousel of products"
                  active={postType === 'CAROUSEL'}
                  onPress={() => setPostType('CAROUSEL')}
                />
                <Chip
                  label="One product per post"
                  active={postType === 'SINGLE_PRODUCT'}
                  onPress={() => setPostType('SINGLE_PRODUCT')}
                />
              </View>
            </View>

            <View>
              <Text className="text-xs font-bold text-spaceCadet-900 mb-2">Days</Text>
              <View className="flex-row flex-wrap gap-2">
                {DAYS.map((label, d) => (
                  <Chip
                    key={label}
                    label={label}
                    active={weekdays.includes(d)}
                    onPress={() => toggleDay(d)}
                  />
                ))}
              </View>
            </View>

            {postType === 'CAROUSEL' && weekdays.length > 0 ? (
              <View className="bg-white rounded-2xl border border-lavender-200 p-4">
                <Text className="text-xs font-bold text-spaceCadet-900 mb-2">
                  Photos per post (min – max, up to {MAX_SLIDES})
                </Text>
                {weekdays.map((d) => {
                  const r = rangeOf(d);
                  return (
                    <View key={d} className="flex-row items-center justify-between py-1.5">
                      <Text className="text-xs font-semibold text-spaceCadet-900 w-10">
                        {DAYS[d]}
                      </Text>
                      <Stepper
                        label={`${DAYS[d]} minimum`}
                        value={r.min}
                        min={1}
                        max={r.max}
                        onChange={(n) => setRanges((c) => ({ ...c, [d]: { ...r, min: n } }))}
                      />
                      <Text className="text-xs text-heliotrope-500">to</Text>
                      <Stepper
                        label={`${DAYS[d]} maximum`}
                        value={r.max}
                        min={r.min}
                        max={MAX_SLIDES}
                        onChange={(n) => setRanges((c) => ({ ...c, [d]: { ...r, max: n } }))}
                      />
                    </View>
                  );
                })}
              </View>
            ) : null}

            <View>
              <Text className="text-xs font-bold text-spaceCadet-900 mb-2">
                Posting time (IST, every selected day)
              </Text>
              <View className="flex-row flex-wrap gap-2 mb-2">
                {TIMES.map((t) => (
                  <Chip key={t} label={t} active={time === t} onPress={() => setTime(t)} />
                ))}
              </View>
              <TextInput
                value={time}
                onChangeText={setTime}
                placeholder="HH:MM (24 hour)"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                accessibilityLabel="Posting time, 24 hour HH:MM"
                className="bg-white border border-lavender-200 rounded-xl px-4 py-3 text-sm text-spaceCadet-900"
              />
              {!timeOk ? (
                <Text className="text-xs text-red-600 mt-1">Use 24-hour HH:MM, e.g. 19:30</Text>
              ) : null}
            </View>

            <View>
              <Text className="text-xs font-bold text-spaceCadet-900 mb-2">Which products</Text>
              <View className="flex-row gap-2">
                <Chip
                  label="Newest first"
                  active={source === 'NEWEST'}
                  onPress={() => setSource('NEWEST')}
                />
                <Chip
                  label="One category"
                  active={source === 'CATEGORY'}
                  onPress={() => setSource('CATEGORY')}
                />
              </View>
              {source === 'CATEGORY' ? (
                <TextInput
                  value={category}
                  onChangeText={setCategory}
                  placeholder="Category name, e.g. Sarees"
                  maxLength={80}
                  className="mt-2 bg-white border border-lavender-200 rounded-xl px-4 py-3 text-sm text-spaceCadet-900"
                />
              ) : null}
              <Text className="text-[11px] text-heliotrope-500 mt-1.5">
                Only in-stock products with a photo. Anything posted in the last 14 days is skipped.
              </Text>
            </View>

            <View>
              <Text className="text-xs font-bold text-spaceCadet-900 mb-2">Plan for</Text>
              <View className="flex-row gap-2">
                {HORIZONS.map((h) => (
                  <Chip
                    key={h.v}
                    label={h.label}
                    active={horizon === h.v}
                    onPress={() => setHorizon(h.v)}
                  />
                ))}
              </View>
            </View>

            <GradientButton
              label={create.isPending ? 'Building calendar…' : 'Preview calendar'}
              disabled={!valid || create.isPending}
              onPress={() => create.mutate()}
            />
            <Text className="text-[11px] text-heliotrope-500 text-center -mt-2">
              Nothing posts until you confirm the calendar on the next screen.
            </Text>
          </ScrollView>
        )}
      </View>
    </KeyboardScreen>
  );
}
