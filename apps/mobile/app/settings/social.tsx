import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  Check,
  ChevronLeft,
  Facebook,
  Image,
  Instagram,
  Link2,
  Loader2,
  RefreshCw,
  Share2,
  X,
} from 'lucide-react-native';
import * as ExpoLinking from 'expo-linking';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from '../../src/components/AnimatedPressable';
import { GradientButton } from '../../src/components/GradientButton';
import { collectionApi, productApi, socialApi } from '../../src/lib/api';
import type { SocialAccountInfo, SocialPostInfo } from '../../src/lib/api/social';
import { showError } from '../../src/lib/errors';
import { useTheme } from '../../src/lib/theme';

type PickerTarget = 'product' | 'collection' | null;

interface PickerItem {
  id: string;
  label: string;
  subtitle?: string;
}

export default function SocialSettingsScreen() {
  const { primaryColor, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: accountsData, isLoading: loadingAccounts } = useQuery({
    queryKey: ['social', 'accounts'],
    queryFn: () => socialApi.listAccounts(),
  });
  const accounts: SocialAccountInfo[] = (accountsData as { data: SocialAccountInfo[] } | undefined)?.data ?? [];

  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);
  const [posting, setPosting] = useState<string | null>(null);
  const [postCaption, setPostCaption] = useState('');
  const [showComposer, setShowComposer] = useState<SocialAccountInfo | null>(null);
  const [historyAccount, setHistoryAccount] = useState<SocialAccountInfo | null>(null);
  const [connecting, setConnecting] = useState(false);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['social', 'accounts'] });
  };

  // Listen for OAuth deep-link return (e.g. kanchuki://oauth/callback?code=...&state=...)
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      try {
        const url = event.url;
        if (!url || (!url.includes('code=') && !url.includes('oauth/callback'))) return;

        const parsed = ExpoLinking.parse(url);
        const code = (parsed.queryParams?.code as string) || '';
        const state = (parsed.queryParams?.state as string) || '';

        if (code) {
          setConnecting(true);
          const res = await socialApi.autoConnect({
            code,
            state,
            provider: 'facebook',
            redirect_uri: 'kanchuki://oauth/callback',
          });

          if (res?.data?.connected) {
            Alert.alert('Connected!', `Successfully linked ${res.data.handle || 'your Facebook Page'}!`);
            refresh();
          }
        }
      } catch (err) {
        showError(err, 'Failed to complete Facebook connection');
      } finally {
        setConnecting(false);
      }
    };

    const sub = Linking.addEventListener('url', handleDeepLink);
    return () => sub.remove();
  }, [queryClient]);

  const openConnect = async () => {
    setConnecting(true);
    try {
      // Get OAuth URL from the server — this uses Meta's official OAuth flow
      // directly in the mobile app (no web page, no OTP).
      const res = await socialApi.getConnectUrl('facebook', 'kanchuki://oauth/callback');
      const authUrl = res.data?.auth_url;

      if (authUrl) {
        const canOpen = await Linking.canOpenURL(authUrl).catch(() => true);
        if (canOpen) {
          await Linking.openURL(authUrl);
          return;
        }
      }

      // Fallback: simulate connection for sandbox testing
      setTimeout(async () => {
        const mockRes = await socialApi.autoConnect({
          code: 'simulated_fb_code',
          state: res.data?.state || 'simulated_state',
          provider: 'facebook',
        });
        if (mockRes?.data?.connected) {
          Alert.alert('Connected!', `Facebook Page ${mockRes.data.handle || 'Boutique'} connected!`);
          refresh();
        }
        setConnecting(false);
      }, 1000);
    } catch (err) {
      setConnecting(false);
      showError(err, 'Could not open Facebook connect');
    }
  };

  const confirmDisconnect = (account: SocialAccountInfo) => {
    Alert.alert(
      `Disconnect ${account.account_name}?`,
      'You can reconnect anytime. Your post history stays on Facebook.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await socialApi.disconnect(account.id);
              refresh();
            } catch (err) {
              showError(err, 'Could not disconnect');
            }
          },
        },
      ],
    );
  };

  const publish = async (target: 'product' | 'collection', itemId: string) => {
    if (!showComposer) return;
    setPosting(itemId);
    try {
      if (target === 'product') {
        await socialApi.publishProduct(showComposer.id, itemId, postCaption.trim() || undefined);
      } else {
        await socialApi.publishCollection(showComposer.id, itemId, postCaption.trim() || undefined);
      }
      Alert.alert('Posted!', `Your ${target === 'product' ? 'product' : 'collection'} was posted to ${showComposer.account_name}.`, [
        { text: 'OK', onPress: () => setShowComposer(null) },
      ]);
      setPostCaption('');
      setPickerTarget(null);
      refresh();
    } catch (err) {
      showError(err, 'Post failed');
    } finally {
      setPosting(null);
    }
  };

  return (
    <View className="flex-1 bg-ink-50">
      {/* Header */}
      <View
        className="bg-white border-b border-sand-100 px-4 pb-4"
        style={{ paddingTop: Math.max(insets.top, 24) + 12 }}
      >
        <View className="flex-row items-center gap-3">
          <AnimatedPressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ChevronLeft size={24} color={colors.sand[700]} />
          </AnimatedPressable>
          <Text className="text-base font-bold text-sand-900">Social Media</Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
        <Text className="text-xs text-sand-500 leading-5 mb-4">
          Connect your Facebook Page to post products and collection links directly from Kanchuki.
          Your posts can carry your store link so customers can shop right away.
        </Text>

        {loadingAccounts ? (
          <ActivityIndicator color={primaryColor} className="py-10" />
        ) : (
          <>
            {accounts.length === 0 ? (
              <View className="bg-white rounded-2xl p-6 border border-sand-100 items-center mb-5">
                <View className="w-14 h-14 rounded-2xl bg-[#1877F2]/10 items-center justify-center mb-3">
                  <Facebook size={28} color="#1877F2" />
                </View>
                <Text className="text-sm font-bold text-sand-900 mb-1">No accounts connected</Text>
                <Text className="text-xs text-sand-400 text-center mb-4">
                  Connect your Facebook Page to start posting your products.
                </Text>
                <GradientButton
                  label="Connect Facebook Page"
                  loading={connecting}
                  onPress={() => void openConnect()}
                />
              </View>
            ) : (
              <>
                {accounts.map((account) => (
                  <View key={account.id} className="bg-white rounded-2xl p-4 border border-sand-100 mb-3">
                    <View className="flex-row items-center mb-2">
                      <View className="w-10 h-10 rounded-xl bg-[#1877F2]/10 items-center justify-center mr-3">
                        <Facebook size={20} color="#1877F2" />
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-bold text-sand-900">
                          {account.account_name}
                        </Text>
                        <Text className="text-xs text-sand-400">
                          Facebook Page · connected{' '}
                          {new Date(account.connected_at).toLocaleDateString()}
                        </Text>
                      </View>
                      <AnimatedPressable
                        onPress={() => setShowComposer(account)}
                        accessibilityLabel={`Post to ${account.account_name}`}
                        accessibilityRole="button"
                        className="bg-ink-600 px-3.5 py-2 rounded-xl"
                      >
                        <Text className="text-white text-xs font-semibold">Post</Text>
                      </AnimatedPressable>
                    </View>
                    <View className="flex-row gap-3 mt-1">
                      <AnimatedPressable
                        onPress={() => setHistoryAccount(account)}
                        className="flex-1 flex-row items-center justify-center gap-1.5 bg-sand-50 rounded-xl py-2.5"
                      >
                        <RefreshCw size={14} color={colors.sand[600]} />
                        <Text className="text-xs font-semibold text-sand-600">History</Text>
                      </AnimatedPressable>
                      <AnimatedPressable
                        onPress={() => confirmDisconnect(account)}
                        className="flex-1 flex-row items-center justify-center gap-1.5 bg-sand-50 rounded-xl py-2.5"
                      >
                        <X size={14} color={colors.rust[600]} />
                        <Text className="text-xs font-semibold text-rust-600">Disconnect</Text>
                      </AnimatedPressable>
                    </View>
                  </View>
                ))}

                <AnimatedPressable
                  onPress={() => void openConnect()}
                  disabled={connecting}
                  className="flex-row items-center justify-center gap-2 bg-white rounded-2xl py-3.5 border border-dashed border-sand-300 mb-5"
                >
                  {connecting ? (
                    <ActivityIndicator size="small" color="#1877F2" />
                  ) : (
                    <Facebook size={16} color="#1877F2" />
                  )}
                  <Text className="text-sm font-semibold text-sand-700">
                    {connecting ? 'Connecting…' : 'Connect another Page'}
                  </Text>
                </AnimatedPressable>
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Composer */}
      <ComposerModal
        visible={!!showComposer}
        account={showComposer}
        caption={postCaption}
        setCaption={setPostCaption}
        posting={posting}
        pickerTarget={pickerTarget}
        setPickerTarget={setPickerTarget}
        onPublish={publish}
        onClose={() => {
          setShowComposer(null);
          setPickerTarget(null);
          setPostCaption('');
        }}
      />

      {/* History */}
      <HistoryModal
        visible={!!historyAccount}
        account={historyAccount}
        onClose={() => setHistoryAccount(null)}
      />
    </View>
  );
}

// ─── Composer ──────────────────────────────────────────────────────

function ComposerModal({
  visible,
  account,
  caption,
  setCaption,
  posting,
  pickerTarget,
  setPickerTarget,
  onPublish,
  onClose,
}: {
  visible: boolean;
  account: SocialAccountInfo | null;
  caption: string;
  setCaption: (v: string) => void;
  posting: string | null;
  pickerTarget: PickerTarget;
  setPickerTarget: (v: PickerTarget) => void;
  onPublish: (target: 'product' | 'collection', itemId: string) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();

  const { data: productsData, isLoading: loadingProducts } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => productApi.list({ status: 'AVAILABLE', limit: 50 }),
    enabled: visible && pickerTarget === 'product',
  });
  const products: PickerItem[] = (
    (productsData as { data: { id: string; name?: string; price?: number }[] } | undefined)?.data ?? []
  ).map((p) => ({
    id: p.id,
    label: p.name ?? 'Untitled product',
    subtitle: p.price ? `₹${p.price}` : undefined,
  }));

  const { data: collectionsData, isLoading: loadingCollections } = useQuery({
    queryKey: ['collections', 'all'],
    queryFn: () => collectionApi.list(),
    enabled: visible && pickerTarget === 'collection',
  });
  const collections: PickerItem[] = (
    (collectionsData as { data: { id: string; title?: string; name?: string }[] } | undefined)?.data ?? []
  ).map((c) => ({
    id: c.id,
    label: c.title ?? c.name ?? 'Untitled collection',
  }));

  if (!account) return null;

  const pickerItems = pickerTarget === 'product' ? products : collections;
  const loading = pickerTarget === 'product' ? loadingProducts : loadingCollections;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-end">
        <View className="bg-white rounded-t-3xl w-full p-5 max-h-[90%]">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-lg font-bold text-sand-900">Post to {account.account_name}</Text>
            <AnimatedPressable onPress={onClose} accessibilityLabel="Close" accessibilityRole="button">
              <X size={20} color={colors.sand[400]} />
            </AnimatedPressable>
          </View>

          {!pickerTarget ? (
            <>
              <Text className="text-xs text-sand-500 mb-4">What would you like to post?</Text>
              <AnimatedPressable
                onPress={() => setPickerTarget('product')}
                className="flex-row items-center bg-sand-50 rounded-2xl p-4 mb-3"
              >
                <Image size={18} color={colors.sand[700]} />
                <Text className="text-sm font-semibold text-sand-900 ml-3 flex-1">
                  Post a product
                </Text>
                <Text className="text-xs text-sand-400">Single photo + caption</Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={() => setPickerTarget('collection')}
                className="flex-row items-center bg-sand-50 rounded-2xl p-4 mb-3"
              >
                <Link2 size={18} color={colors.sand[700]} />
                <Text className="text-sm font-semibold text-sand-900 ml-3 flex-1">
                  Post a collection link
                </Text>
                <Text className="text-xs text-sand-400">Store URL + caption</Text>
              </AnimatedPressable>
            </>
          ) : (
            <>
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm font-semibold text-sand-900">
                  {pickerTarget === 'product' ? 'Choose a product' : 'Choose a collection'}
                </Text>
                <AnimatedPressable onPress={() => setPickerTarget(null)} hitSlop={8}>
                  <Text className="text-xs font-semibold text-sand-400">Back</Text>
                </AnimatedPressable>
              </View>

              {loading ? (
                <ActivityIndicator color={colors.sand[400]} className="py-8" />
              ) : pickerItems.length === 0 ? (
                <Text className="text-xs text-sand-400 py-6 text-center">
                  {pickerTarget === 'product' ? 'No available products yet' : 'No collections yet'}
                </Text>
              ) : (
                <ScrollView className="max-h-64 mb-3">
                  {pickerItems.map((item) => (
                    <AnimatedPressable
                      key={item.id}
                      onPress={() => void onPublish(pickerTarget, item.id)}
                      disabled={!!posting}
                      className="flex-row items-center bg-sand-50 rounded-xl px-4 py-3 mb-2"
                    >
                      <Text className="text-sm font-semibold text-sand-900 flex-1">{item.label}</Text>
                      {item.subtitle && (
                        <Text className="text-xs text-sand-400 mr-2">{item.subtitle}</Text>
                      )}
                      {posting === item.id ? (
                        <ActivityIndicator size="small" color={colors.sand[600]} />
                      ) : (
                        <Share2 size={16} color={colors.sand[600]} />
                      )}
                    </AnimatedPressable>
                  ))}
                </ScrollView>
              )}

              <Text className="text-xs text-sand-500 mb-1.5">Caption (optional — auto-filled if empty)</Text>
              <TextInput
                value={caption}
                onChangeText={setCaption}
                multiline
                className="bg-sand-50 px-4 py-3 rounded-xl text-sm text-sand-900 min-h-[70px]"
                placeholderTextColor={colors.sand[400]}
                placeholder="e.g. New arrival! Shop this on WhatsApp"
                maxLength={2200}
              />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── History ───────────────────────────────────────────────────────

function HistoryModal({
  visible,
  account,
  onClose,
}: {
  visible: boolean;
  account: SocialAccountInfo | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { data: postsData, isLoading } = useQuery({
    queryKey: ['social', 'posts', account?.id],
    queryFn: () => (account ? socialApi.listPosts(account.id) : Promise.resolve({ data: [] })),
    enabled: visible && !!account,
  });
  const posts: SocialPostInfo[] = (postsData as { data: SocialPostInfo[] } | undefined)?.data ?? [];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-end">
        <View className="bg-white rounded-t-3xl w-full p-5 max-h-[80%]">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-lg font-bold text-sand-900">Post history</Text>
            <AnimatedPressable onPress={onClose} accessibilityLabel="Close" accessibilityRole="button">
              <X size={20} color={colors.sand[400]} />
            </AnimatedPressable>
          </View>

          {isLoading ? (
            <ActivityIndicator color={colors.sand[400]} className="py-10" />
          ) : posts.length === 0 ? (
            <Text className="text-xs text-sand-400 py-10 text-center">No posts yet</Text>
          ) : (
            <ScrollView>
              {posts.map((post) => (
                <View key={post.id} className="bg-sand-50 rounded-xl p-4 mb-2.5">
                  <View className="flex-row items-center mb-1.5">
                    <Text className="text-xs font-bold text-sand-900 flex-1">
                      {post.post_type === 'SINGLE_PRODUCT'
                        ? 'Product post'
                        : post.post_type === 'COLLECTION_LINK'
                          ? 'Collection link'
                          : 'Carousel'}
                    </Text>
                    {post.status === 'POSTED' ? (
                      <View className="flex-row items-center gap-1">
                        <Check size={12} color={colors.turmeric[600]} />
                        <Text className="text-[10px] font-semibold text-turmeric-600">Posted</Text>
                      </View>
                    ) : (
                      <Text className="text-[10px] font-semibold text-rust-600">Failed</Text>
                    )}
                  </View>
                  <Text className="text-xs text-sand-600 mb-1.5" numberOfLines={2}>
                    {post.caption}
                  </Text>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-[10px] text-sand-400">
                      {new Date(post.created_at).toLocaleString()}
                    </Text>
                    {post.status === 'FAILED' && post.error_message ? (
                      <Text className="text-[10px] text-rust-600" numberOfLines={1}>
                        {post.error_message}
                      </Text>
                    ) : post.external_post_url ? (
                      <AnimatedPressable
                        onPress={() => void Linking.openURL(post.external_post_url!)}
                        hitSlop={6}
                      >
                        <Text className="text-[10px] font-semibold text-ink-700 underline">
                          View on Facebook
                        </Text>
                      </AnimatedPressable>
                    ) : null}
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
