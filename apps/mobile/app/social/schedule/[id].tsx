import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Images, RefreshCw, Sparkles, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AnimatedPressable } from '../../../src/components/AnimatedPressable';
import { GradientButton } from '../../../src/components/GradientButton';
import { ProductGridPicker } from '../../../src/components/social';
import type { ComposeProduct } from '../../../src/components/social/types';
import { socialApi } from '../../../src/lib/api';
import {
  EDITABLE_POST_STATUSES,
  formatIst,
  istDayKey,
  scheduleApi,
} from '../../../src/lib/api/schedule';
import type { SchedulePost } from '../../../src/lib/api/schedule';
import { useAuth } from '../../../src/lib/auth-context';
import { showError } from '../../../src/lib/errors';
import { useScreenInsets } from '../../../src/lib/safe-area';
import { staffCan } from '../../../src/lib/staff-can';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  READY: 'Scheduled',
  PUBLISHING: 'Posting…',
  POSTED: 'Posted',
  FAILED: 'Failed',
  MISSED: 'Missed',
  SKIPPED: 'Skipped',
};

function PostCard({
  post,
  canEditSlides,
  onChanged,
  onSwap,
}: {
  post: SchedulePost;
  canEditSlides: boolean;
  onChanged: () => void;
  onSwap: (itemId: string) => void;
}) {
  const editable = EDITABLE_POST_STATUSES.includes(post.status);
  const [caption, setCaption] = useState(post.caption);
  const dirty = caption.trim() !== post.caption;

  const act = useMutation({
    mutationFn: (body: { caption?: string; action?: 'skip' | 'retry' }) =>
      scheduleApi.patchPost(post.id, body),
    onSuccess: onChanged,
    onError: (err) => showError(err, 'Could not update this post. Refresh and try again.'),
  });
  const ai = useMutation({
    mutationFn: () =>
      socialApi.suggestCaption({
        product_ids: post.items.map((i) => i.product_id),
        post_type: post.items.length === 1 ? 'SINGLE_PRODUCT' : 'CAROUSEL',
      }),
    onSuccess: (res) => {
      const { caption: c, hashtags } = res.data;
      setCaption([c, hashtags.join(' ')].filter(Boolean).join('\n\n').slice(0, 2200));
    },
    onError: (err) =>
      showError(err, 'AI caption is unavailable right now. Edit the caption by hand.'),
  });
  const remove = useMutation({
    mutationFn: (itemId: string) => scheduleApi.removeItem(itemId),
    onSuccess: onChanged,
    onError: (err) => showError(err, 'Could not remove that photo. Refresh and try again.'),
  });
  const otherPhoto = useMutation({
    mutationFn: ({ itemId, photoId }: { itemId: string; photoId: string }) =>
      scheduleApi.photoItem(itemId, photoId),
    onSuccess: onChanged,
    onError: (err) => showError(err, 'Could not change that photo. Refresh and try again.'),
  });

  return (
    <View className="bg-white rounded-3xl p-4 border border-lavender-200">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-sm font-bold text-spaceCadet-900">
          {formatIst(post.scheduled_at, false)}
        </Text>
        <Text
          className={`text-[11px] font-bold ${
            post.status === 'FAILED' || post.status === 'MISSED'
              ? 'text-red-600'
              : post.status === 'POSTED'
                ? 'text-emerald-600'
                : 'text-heliotrope-500'
          }`}
        >
          {STATUS_LABEL[post.status] ?? post.status}
        </Text>
      </View>

      {post.error &&
      (post.status === 'FAILED' || post.status === 'MISSED' || post.status === 'READY') ? (
        <Text className="text-xs text-red-600 mb-2">{post.error}</Text>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
        <View className="flex-row gap-2">
          {post.items.map((item) => {
            const photos = item.product?.photos ?? [];
            const shown =
              photos.find((p) => p.id === item.photo_id) ??
              photos.find((p) => p.is_primary) ??
              photos[0];
            return (
              <View key={item.id} className="w-24">
                <View className="w-24 h-28 rounded-2xl overflow-hidden bg-lavender-100">
                  {shown ? (
                    <Image source={{ uri: shown.url }} className="w-24 h-28" resizeMode="cover" />
                  ) : null}
                  {editable && canEditSlides ? (
                    <AnimatedPressable
                      accessibilityLabel={`Remove ${item.product?.name ?? 'photo'} from this post`}
                      accessibilityRole="button"
                      onPress={() => remove.mutate(item.id)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 items-center justify-center"
                    >
                      <X size={12} color="white" />
                    </AnimatedPressable>
                  ) : null}
                </View>
                <Text className="text-[10px] text-spaceCadet-900 mt-1" numberOfLines={1}>
                  {item.product?.name ?? 'Product'}
                </Text>
                {editable && canEditSlides ? (
                  <View className="flex-row gap-1 mt-1">
                    {photos.length > 1 ? (
                      <AnimatedPressable
                        accessibilityLabel="Use another photo of this product"
                        accessibilityRole="button"
                        onPress={() => {
                          const i = photos.findIndex((p) => p.id === shown?.id);
                          const next = photos[(i + 1) % photos.length];
                          if (next) otherPhoto.mutate({ itemId: item.id, photoId: next.id });
                        }}
                        className="px-1.5 py-1 rounded-lg bg-lavender-100"
                      >
                        <Images size={12} color="#231F48" />
                      </AnimatedPressable>
                    ) : null}
                    <AnimatedPressable
                      accessibilityLabel="Swap this product"
                      accessibilityRole="button"
                      onPress={() => onSwap(item.id)}
                      className="px-1.5 py-1 rounded-lg bg-lavender-100"
                    >
                      <RefreshCw size={12} color="#231F48" />
                    </AnimatedPressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>

      <TextInput
        value={caption}
        onChangeText={setCaption}
        editable={editable}
        multiline
        maxLength={2200}
        accessibilityLabel="Post caption"
        className="bg-[#F8F7FC] border border-lavender-200 rounded-xl px-3 py-2.5 text-xs text-spaceCadet-900 min-h-[64px]"
        style={{ textAlignVertical: 'top' }}
      />

      {editable ? (
        <View className="flex-row flex-wrap gap-2 mt-3">
          {dirty ? (
            <AnimatedPressable
              accessibilityRole="button"
              disabled={act.isPending || caption.trim().length === 0}
              onPress={() => act.mutate({ caption: caption.trim() })}
              className="px-3 py-1.5 rounded-xl bg-fuchsia-600"
            >
              <Text className="text-xs font-bold text-white">Save caption</Text>
            </AnimatedPressable>
          ) : null}
          <AnimatedPressable
            accessibilityRole="button"
            disabled={ai.isPending}
            onPress={() => ai.mutate()}
            className="px-3 py-1.5 rounded-xl border border-lavender-200 flex-row items-center gap-1"
          >
            <Sparkles size={12} color="#BB3F95" />
            <Text className="text-xs font-bold text-spaceCadet-900">
              {ai.isPending ? 'Writing…' : 'AI caption'}
            </Text>
          </AnimatedPressable>
          {post.status === 'FAILED' || post.status === 'MISSED' ? (
            <AnimatedPressable
              accessibilityRole="button"
              disabled={act.isPending}
              onPress={() => act.mutate({ action: 'retry' })}
              className="px-3 py-1.5 rounded-xl border border-lavender-200"
            >
              <Text className="text-xs font-bold text-spaceCadet-900">Retry</Text>
            </AnimatedPressable>
          ) : null}
          <AnimatedPressable
            accessibilityRole="button"
            disabled={act.isPending}
            onPress={() => act.mutate({ action: 'skip' })}
            className="px-3 py-1.5 rounded-xl border border-lavender-200"
          >
            <Text className="text-xs font-bold text-spaceCadet-900">Skip this post</Text>
          </AnimatedPressable>
        </View>
      ) : null}
    </View>
  );
}

export default function ScheduleCalendarScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { headerPaddingTop, screenPaddingBottom } = useScreenInsets();
  const { staffRole } = useAuth();
  const queryClient = useQueryClient();
  const canPlan = staffCan(staffRole, 'social.schedule.plan');
  const [swapItemId, setSwapItemId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['social', 'schedule', 'plan', id],
    queryFn: () => scheduleApi.plan(id),
    enabled: !!id,
  });
  const plan = data?.data;
  const changed = () => {
    void queryClient.invalidateQueries({ queryKey: ['social', 'schedule'] });
  };

  const days = useMemo(() => {
    const map = new Map<string, SchedulePost[]>();
    for (const p of plan?.posts ?? []) {
      if (p.status === 'SKIPPED') continue;
      const k = istDayKey(p.scheduled_at);
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [plan]);

  const confirm = useMutation({
    mutationFn: () => scheduleApi.confirm(id),
    onSuccess: (res) => {
      changed();
      Alert.alert(
        'Plan confirmed',
        `${res.data.posts} posts scheduled — ${res.data.slides_original} original photos${
          res.data.slides_templated ? `, ${res.data.slides_templated} styled` : ''
        }.`,
        [{ text: 'OK', onPress: () => router.replace('/social/schedule') }],
      );
    },
    onError: (err) =>
      showError(
        err,
        'Could not confirm the plan. Your plan limit may be reached or the account needs reconnecting.',
      ),
  });
  const end = useMutation({
    mutationFn: () => scheduleApi.end(id),
    onSuccess: () => {
      changed();
      router.replace('/social/schedule');
    },
    onError: (err) => showError(err, 'Could not end the plan. Please try again.'),
  });
  const swap = useMutation({
    mutationFn: ({ itemId, productId }: { itemId: string; productId: string }) =>
      scheduleApi.swapItem(itemId, productId),
    onSuccess: () => {
      setSwapItemId(null);
      changed();
    },
    onError: (err) => showError(err, 'That product could not be used here. Pick another.'),
  });

  const total = plan?.posts.filter((p) => p.status !== 'SKIPPED').length ?? 0;

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
          <View className="flex-1">
            <Text
              style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
              className="text-xl font-bold text-spaceCadet-900"
            >
              {plan?.status === 'DRAFT' ? 'Review calendar' : 'Calendar'}
            </Text>
            {plan ? (
              <Text className="text-[11px] text-heliotrope-500">
                {plan.platform === 'FACEBOOK' ? 'Facebook' : 'Instagram'} · {total} posts ·{' '}
                {plan.status === 'DRAFT'
                  ? 'not posting yet'
                  : plan.status === 'ACTIVE'
                    ? 'running'
                    : plan.status.toLowerCase()}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#BB3F95" />
        </View>
      ) : isError || !plan ? (
        <View className="flex-1 items-center justify-center p-8 gap-3">
          <Text className="text-sm text-heliotrope-500 text-center">
            Couldn&apos;t load this plan.
          </Text>
          <GradientButton label="Retry" onPress={() => void refetch()} />
        </View>
      ) : (
        <>
          <ScrollView
            className="flex-1 px-4 pt-4"
            contentContainerStyle={{ paddingBottom: screenPaddingBottom + 80, gap: 16 }}
          >
            {plan.status === 'PAUSED' && plan.pause_reason ? (
              <Text className="text-xs font-semibold text-red-600">{plan.pause_reason}</Text>
            ) : null}
            {days.map(([day, posts]) => (
              <View key={day} className="gap-3">
                <Text className="text-xs font-bold text-heliotrope-500 uppercase">
                  {formatIst(posts[0]?.scheduled_at as string).split(' · ')[0]}
                </Text>
                {posts.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    canEditSlides={canPlan}
                    onChanged={changed}
                    onSwap={setSwapItemId}
                  />
                ))}
              </View>
            ))}
            {days.length === 0 ? (
              <Text className="text-sm text-heliotrope-500 text-center mt-10">
                No posts left in this plan.
              </Text>
            ) : null}
            {canPlan && plan.status !== 'DRAFT' && plan.status !== 'ENDED' ? (
              <AnimatedPressable
                accessibilityRole="button"
                disabled={end.isPending}
                onPress={() =>
                  Alert.alert('End this plan?', 'Remaining scheduled posts will be skipped.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'End plan', style: 'destructive', onPress: () => end.mutate() },
                  ])
                }
                className="self-center px-4 py-2 rounded-xl border border-red-200"
              >
                <Text className="text-xs font-bold text-red-600">End plan</Text>
              </AnimatedPressable>
            ) : null}
          </ScrollView>

          {plan.status === 'DRAFT' && canPlan ? (
            <View
              className="absolute left-0 right-0 bottom-0 bg-white border-t border-lavender-200 px-4 pt-3"
              style={{ paddingBottom: screenPaddingBottom }}
            >
              <Text className="text-[11px] text-heliotrope-500 text-center mb-2">
                {total} posts will go out automatically at the times shown.
              </Text>
              <GradientButton
                label={confirm.isPending ? 'Confirming…' : `Confirm ${total} posts`}
                disabled={confirm.isPending || total === 0}
                onPress={() => confirm.mutate()}
              />
            </View>
          ) : null}
        </>
      )}

      <Modal
        visible={swapItemId !== null}
        animationType="slide"
        onRequestClose={() => setSwapItemId(null)}
      >
        <View className="flex-1 bg-[#F8F7FC]" style={{ paddingTop: headerPaddingTop }}>
          <View className="flex-row items-center justify-between px-5 pb-3">
            <Text className="text-lg font-bold text-spaceCadet-900">Swap product</Text>
            <AnimatedPressable
              accessibilityLabel="Close"
              accessibilityRole="button"
              onPress={() => setSwapItemId(null)}
              className="w-9 h-9 rounded-full bg-lavender-100 items-center justify-center"
            >
              <X size={18} color="#231F48" />
            </AnimatedPressable>
          </View>
          <ProductGridPicker
            maxItems={1}
            selected={[]}
            selectedOrder={() => null}
            onToggle={(product: ComposeProduct) => {
              if (swapItemId) swap.mutate({ itemId: swapItemId, productId: product.id });
            }}
          />
        </View>
      </Modal>
    </View>
  );
}
