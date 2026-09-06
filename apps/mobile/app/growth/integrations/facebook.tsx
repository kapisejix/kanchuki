import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { CheckCircle2, ChevronLeft, Facebook, Lock, RefreshCw, Zap } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from '../../../src/components/AnimatedPressable';
import { type SocialAccountInfo, socialApi } from '../../../src/lib/api/social';
import { showError } from '../../../src/lib/errors';
import {
  FacebookAuthCancelled,
  FacebookAuthUnavailable,
  loginWithFacebook,
} from '../../../src/lib/facebook-auth';

const ACCOUNTS_KEY = ['social', 'accounts'];

export default function FacebookConfigScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: () => socialApi.listAccounts(),
  });
  const fbAccount: SocialAccountInfo | undefined = (
    data as { data?: SocialAccountInfo[] } | undefined
  )?.data?.find((a) => a.platform === 'FACEBOOK');
  const isConnected = !!fbAccount;

  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });

  // Web-OAuth fallback return (Expo Go / no native SDK): the browser redirects
  // back with ?code — exchange it, then refresh the real account list.
  useEffect(() => {
    const onUrl = async (event: { url: string }) => {
      const url = event.url;
      if (!url || (!url.includes('code=') && !url.includes('oauth/callback'))) return;
      const parsed = Linking.parse(url);
      const code = parsed.queryParams?.code as string | undefined;
      const state = parsed.queryParams?.state as string | undefined;
      if (!code) return;
      try {
        setConnecting(true);
        const res = await socialApi.autoConnect({ code, state: state ?? '', provider: 'facebook' });
        if (res?.data?.connected) {
          void queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });
          Alert.alert(
            'Connected!',
            `Linked ${res.data.account_name || res.data.handle || 'your Page'}.`,
          );
        }
      } catch (err) {
        showError(err, 'Failed to complete Facebook connection');
      } finally {
        setConnecting(false);
      }
    };
    const sub = Linking.addEventListener('url', onUrl);
    return () => sub.remove();
  }, [queryClient]);

  const connectViaWeb = async () => {
    const res = await socialApi.getConnectUrl('facebook');
    const authUrl = res.data?.auth_url;
    if (!authUrl) {
      throw new Error(
        'Server did not return a Facebook login URL (social publishing not configured).',
      );
    }
    await Linking.openURL(authUrl);
  };

  const handleConnect = async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      const token = await loginWithFacebook('facebook');
      const res = await socialApi.connectWithToken(token, 'facebook');
      if (res.data?.connected) {
        void invalidate();
        Alert.alert(
          'Connected!',
          `Facebook Page ${res.data.account_name || res.data.handle || ''} connected.`,
        );
      }
    } catch (err) {
      if (err instanceof FacebookAuthCancelled) return;
      if (err instanceof FacebookAuthUnavailable) {
        try {
          await connectViaWeb();
          setConnectError(
            `Facebook app login isn't available in this build (${err.message}). Opened browser login instead.`,
          );
        } catch (webErr) {
          setConnectError(
            webErr instanceof Error ? webErr.message : 'Could not start Facebook connection',
          );
        }
        return;
      }
      setConnectError(err instanceof Error ? err.message : 'Could not connect your Facebook Page');
    } finally {
      setConnecting(false);
    }
  };

  const disconnectMutation = useMutation({
    mutationFn: (accountId: string) => socialApi.disconnect(accountId),
    onSuccess: () => {
      void invalidate();
      void refetch();
    },
    onError: (err) => showError(err, 'Failed to disconnect'),
  });

  const handleDisconnect = () => {
    if (!fbAccount) return;
    const accountId = fbAccount.id;
    Alert.alert('Disconnect Facebook?', 'Your Facebook Page will be unlinked from publishing.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: () => void disconnectMutation.mutate(accountId),
      },
    ]);
  };

  return (
    <View className="flex-1 bg-[#F8F7FC]">
      <View
        className="bg-white border-b border-lavender-200 px-5 pb-4"
        style={{ paddingTop: Math.max(insets.top, 24) + 12 }}
      >
        <View className="flex-row items-center gap-3">
          <AnimatedPressable
            onPress={() => router.back()}
            hitSlop={8}
            className="w-10 h-10 rounded-full bg-lavender-100 items-center justify-center border border-lavender-200"
          >
            <ChevronLeft size={20} color="#231F48" />
          </AnimatedPressable>
          <View>
            <Text
              style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
              className="text-xl font-bold text-spaceCadet-900"
            >
              Facebook Page Integration
            </Text>
            <Text className="text-[11px] text-heliotrope-500 font-medium">
              1-Click Page Lookbook & Offer Broadcasts
            </Text>
          </View>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm mb-4">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center gap-2.5">
              <View className="w-12 h-12 rounded-2xl items-center justify-center bg-[#1877F2]">
                <Facebook size={24} color="white" />
              </View>
              <View>
                <Text className="text-base font-bold text-spaceCadet-900">
                  Facebook Page Connect
                </Text>
                <Text className="text-xs text-heliotrope-500 font-medium">
                  Direct Page Single Sign-On
                </Text>
              </View>
            </View>
            {isConnected && (
              <View className="flex-row items-center gap-1 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                <CheckCircle2 size={12} color="#059669" />
                <Text className="text-[11px] font-bold text-emerald-700">Connected</Text>
              </View>
            )}
          </View>

          <Text className="text-xs text-heliotrope-600 leading-relaxed font-medium mb-4">
            Connect your Facebook Boutique Page in 1 click without manually copying Page IDs or
            developer tokens.
          </Text>

          {isLoading ? (
            <ActivityIndicator color="#1877F2" className="py-4" />
          ) : isConnected ? (
            <View className="bg-lavender-50 rounded-2xl p-4 border border-lavender-200 gap-2 mb-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-bold text-heliotrope-500 uppercase">Linked Page</Text>
                <Text className="text-sm font-bold text-[#1877F2]">{fbAccount?.account_name}</Text>
              </View>
              {fbAccount?.account_id ? (
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-bold text-heliotrope-500 uppercase">Page ID</Text>
                  <Text className="text-xs font-semibold text-spaceCadet-700">
                    {fbAccount.account_id}
                  </Text>
                </View>
              ) : null}
              <View className="flex-row gap-2 mt-2 pt-2 border-t border-lavender-200">
                <View className="flex-1">
                  <AnimatedPressable
                    onPress={() => void refetch()}
                    disabled={isRefetching}
                    className="bg-white py-2.5 rounded-xl border border-lavender-200 items-center justify-center flex-row gap-1.5"
                  >
                    {isRefetching ? (
                      <ActivityIndicator size="small" color="#1877F2" />
                    ) : (
                      <>
                        <RefreshCw size={13} color="#231F48" />
                        <Text className="text-xs font-bold text-spaceCadet-900">Verify Status</Text>
                      </>
                    )}
                  </AnimatedPressable>
                </View>
                <View className="flex-1">
                  <AnimatedPressable
                    onPress={handleDisconnect}
                    disabled={disconnectMutation.isPending}
                    className="bg-rose-50 py-2.5 rounded-xl border border-rose-200 items-center justify-center"
                  >
                    <Text className="text-xs font-bold text-rose-700">
                      {disconnectMutation.isPending ? 'Disconnecting…' : 'Disconnect'}
                    </Text>
                  </AnimatedPressable>
                </View>
              </View>
            </View>
          ) : (
            <AnimatedPressable
              onPress={handleConnect}
              disabled={connecting}
              className="bg-[#1877F2] py-3.5 px-4 rounded-2xl items-center justify-center flex-row gap-2 shadow-md"
              style={{
                shadowColor: '#1877F2',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 4,
              }}
            >
              {connecting ? (
                <>
                  <ActivityIndicator size="small" color="white" />
                  <Text className="text-white text-sm font-bold">Connecting Facebook…</Text>
                </>
              ) : (
                <>
                  <Zap size={18} color="white" strokeWidth={2.5} />
                  <Text className="text-white text-sm font-bold">
                    1-Click Connect Facebook Page
                  </Text>
                </>
              )}
            </AnimatedPressable>
          )}

          {connectError && !isConnected && (
            <View className="mt-3 rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3">
              <Text className="text-xs font-bold text-rose-700 mb-0.5">Could not connect</Text>
              <Text className="text-[11px] text-rose-600 leading-relaxed">{connectError}</Text>
            </View>
          )}

          <View className="flex-row items-center gap-1.5 mt-3 justify-center">
            <Lock size={11} color="#928EB2" />
            <Text className="text-[11px] text-heliotrope-400 font-medium">
              Official Meta Graph API OAuth • Tokens encrypted via 256-bit AES
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
