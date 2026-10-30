import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Star } from 'lucide-react-native'
import { useState } from 'react'
import { ActivityIndicator, Text, TextInput, View } from 'react-native'
import { type GbpReview, googleBusinessApi } from '../lib/api'
import { showError } from '../lib/errors'
import { AnimatedPressable } from './AnimatedPressable'

const QUERY_KEY = ['google-business', 'reviews']

function Stars({ n }: { n: number }) {
  return (
    <View className="flex-row gap-0.5" accessibilityLabel={`${n} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={13}
          color={i <= n ? '#BB3F95' : '#E0E1F6'}
          fill={i <= n ? '#BB3F95' : 'transparent'}
        />
      ))}
    </View>
  )
}

function ReviewRow({ review }: { review: GbpReview }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(review.reply?.comment ?? '')

  // The reply shows ONLY after the server (and Google) confirmed it — we refetch, not guess.
  const send = useMutation({
    mutationFn: () => googleBusinessApi.reply(review.id, text.trim()),
    onSuccess: () => {
      setEditing(false)
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
    onError: (e) => showError(e, 'Could not post your reply'),
  })

  return (
    <View className="bg-white rounded-2xl p-4 border border-lavender-200">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-bold text-spaceCadet-900">
          {review.reviewer_name ?? 'Google user'}
        </Text>
        <Stars n={review.star_rating} />
      </View>
      {review.comment ? (
        <Text className="text-xs text-heliotrope-700 mt-2 leading-5">{review.comment}</Text>
      ) : null}

      {review.reply && !editing && (
        <View className="mt-3 bg-lavender-50 rounded-xl p-3 border border-lavender-200">
          <Text className="text-[11px] font-bold text-heliotrope-600 mb-1">Your reply</Text>
          <Text className="text-xs text-spaceCadet-900 leading-5">{review.reply.comment}</Text>
        </View>
      )}

      {editing ? (
        <View className="mt-3 gap-2">
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            maxLength={4096}
            placeholder="Write a polite public reply"
            placeholderTextColor="#928EB2"
            accessibilityLabel="Your reply to this review"
            className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm text-spaceCadet-900 min-h-[80px]"
          />
          <View className="flex-row items-center gap-3">
            <AnimatedPressable
              onPress={() => send.mutate()}
              disabled={send.isPending || text.trim().length === 0}
              accessibilityRole="button"
              className="bg-spaceCadet-900 px-4 py-2.5 rounded-xl min-h-[44px] justify-center"
            >
              {send.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text className="text-white text-xs font-bold">Post reply</Text>
              )}
            </AnimatedPressable>
            <AnimatedPressable
              onPress={() => setEditing(false)}
              accessibilityRole="button"
              className="py-2.5 min-h-[44px] justify-center"
            >
              <Text className="text-xs font-bold text-heliotrope-600">Cancel</Text>
            </AnimatedPressable>
          </View>
          <Text className="text-[11px] text-heliotrope-500">
            Replies are public on Google. Each reply uses one of your monthly replies.
          </Text>
        </View>
      ) : (
        <AnimatedPressable
          onPress={() => setEditing(true)}
          accessibilityRole="button"
          accessibilityLabel={review.reply ? 'Edit your reply' : 'Reply to this review'}
          className="mt-3 self-start py-2 min-h-[44px] justify-center"
        >
          <Text className="text-xs font-bold text-fuchsia-600">
            {review.reply ? 'Edit reply' : 'Reply'}
          </Text>
        </AnimatedPressable>
      )}
    </View>
  )
}

// "Google reviews" tab on the ratings screen. Rendered only when the server says LINKED.
export function GoogleReviewsTab() {
  const q = useInfiniteQuery({
    queryKey: QUERY_KEY,
    queryFn: ({ pageParam }) => googleBusinessApi.reviews(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data.next_cursor ?? undefined,
  })

  if (q.isLoading) return <ActivityIndicator color="#BB3F95" className="mt-6" />
  if (q.isError) {
    return (
      <View className="bg-white rounded-2xl p-4 border border-lavender-200">
        <Text className="text-sm font-bold text-spaceCadet-900">Could not load Google reviews</Text>
        <AnimatedPressable
          onPress={() => void q.refetch()}
          accessibilityRole="button"
          className="mt-2 self-start py-2"
        >
          <Text className="text-xs font-bold text-fuchsia-600">Try again</Text>
        </AnimatedPressable>
      </View>
    )
  }

  const first = q.data?.pages[0]?.data
  const reviews = q.data?.pages.flatMap((p) => p.data.reviews) ?? []

  return (
    <View className="gap-3">
      <View className="bg-white rounded-2xl p-4 border border-lavender-200">
        <Text className="text-[11px] font-bold text-heliotrope-600">From Google</Text>
        <Text className="text-sm font-bold text-spaceCadet-900 mt-1">
          {first?.summary.review_count ?? 0} reviews
          {first?.summary.avg_rating != null
            ? ` · ${first.summary.avg_rating.toFixed(1)} average`
            : ''}
        </Text>
      </View>

      {reviews.length === 0 ? (
        <Text className="text-xs text-heliotrope-500 text-center mt-4">
          No Google reviews yet. They appear here as soon as they are synced.
        </Text>
      ) : (
        reviews.map((r) => <ReviewRow key={r.id} review={r} />)
      )}

      {q.hasNextPage && (
        <AnimatedPressable
          onPress={() => void q.fetchNextPage()}
          disabled={q.isFetchingNextPage}
          accessibilityRole="button"
          className="self-center py-3 min-h-[44px] justify-center"
        >
          <Text className="text-xs font-bold text-fuchsia-600">
            {q.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Text>
        </AnimatedPressable>
      )}
    </View>
  )
}
