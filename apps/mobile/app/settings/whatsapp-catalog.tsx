// Phase II: WhatsApp Native Catalog Sync — retailer settings screen (F1–F6).
//
// Mirror of the retailer-facing API (D1–D5):
//   - status card: configured, catalog id, items synced/failed/pending, last sync (F5)
//   - Sync Now: manual full-sync trigger (F4)
//   - toggle: sync_enabled (F2)
//   - category chips: which ProductCategories to sync (F3)
//   - sync history list with pull-to-refresh (F6)
// Reached from Settings → "WhatsApp Native Catalog" (F1). The per-product
// badges live in the catalog tab (F7), driven by whatsappCatalogApi.getItems().

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChevronLeft, MessageCircle, RefreshCw, Zap } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from '../../src/components/AnimatedPressable';
import { GradientButton } from '../../src/components/GradientButton';
import { categoryApi, whatsappCatalogApi } from '../../src/lib/api';
import type { WhatsAppCatalogStatus } from '../../src/lib/api/whatsapp-catalog';
import { showError } from '../../src/lib/errors';
import { useTheme } from '../../src/lib/theme';

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Never';

const LOG_STATUS_COLOR: Record<string, string> = {
  SUCCESS: 'bg-emerald-50 text-emerald-600',
  FAILED: 'bg-rust-50 text-rust-600',
  PARTIAL: 'bg-turmeric-50 text-turmeric-600',
  IN_PROGRESS: 'bg-ink-50 text-ink-600',
};

export default function WhatsAppCatalogSettingsScreen() {
  const { primaryColor, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: statusData, isLoading: loadingStatus } = useQuery({
    queryKey: ['whatsapp-catalog', 'status'],
    queryFn: () => whatsappCatalogApi.getStatus(),
  });
  const status: WhatsAppCatalogStatus | null = statusData?.data ?? null;

  const { data: logsData, isLoading: loadingLogs } = useQuery({
    queryKey: ['whatsapp-catalog', 'logs'],
    queryFn: () => whatsappCatalogApi.getLogs(),
    enabled: !!status?.configured,
  });
  const logs = logsData?.data ?? [];

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoryApi.list(),
    enabled: !!status?.configured,
  });
  const categories = categoriesData?.data ?? [];

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['whatsapp-catalog', 'status'] });
    void queryClient.invalidateQueries({ queryKey: ['whatsapp-catalog', 'logs'] });
    void queryClient.invalidateQueries({ queryKey: ['whatsapp-catalog', 'items'] });
  }, [queryClient]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['whatsapp-catalog', 'status'] }),
        queryClient.refetchQueries({ queryKey: ['whatsapp-catalog', 'logs'] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  // ── F2: enable/disable sync ─────────────────────────────────────
  const [savingToggle, setSavingToggle] = useState(false);
  const toggleSync = async (enabled: boolean) => {
    setSavingToggle(true);
    try {
      await whatsappCatalogApi.updateSettings({ sync_enabled: enabled });
      invalidate();
    } catch (err) {
      showError(err, 'Could not update catalog sync');
    } finally {
      setSavingToggle(false);
    }
  };

  // ── F3: category selection (multi-select, auto-save) ────────────
  const [savingCategories, setSavingCategories] = useState(false);
  const toggleCategory = async (categoryId: string) => {
    if (!status || savingCategories) return;
    const next = status.sync_categories.includes(categoryId)
      ? status.sync_categories.filter((id) => id !== categoryId)
      : [...status.sync_categories, categoryId];
    setSavingCategories(true);
    try {
      await whatsappCatalogApi.updateSettings({ sync_categories: next });
      invalidate();
    } catch (err) {
      showError(err, 'Could not update categories');
    } finally {
      setSavingCategories(false);
    }
  };

  // ── F4: manual sync ─────────────────────────────────────────────
  const syncMutation = useMutation({
    mutationFn: () => whatsappCatalogApi.syncNow(),
    onSuccess: () => {
      invalidate();
    },
    onError: (err) => showError(err, 'Could not start sync'),
  });

  return (
    <View className="flex-1 bg-ink-50">
      {/* Header (F1) */}
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
          <Text className="text-base font-bold text-sand-900">WhatsApp Catalog</Text>
        </View>
      </View>

      <ScrollView
        className="flex-1 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: 48 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={primaryColor} />
        }
      >
        <Text className="text-xs text-sand-500 leading-5 mb-4">
          Show your products inside WhatsApp Business — customers see your catalog when they
          open your business chat, no app needed. Syncs your product list, prices and photos.
        </Text>

        {loadingStatus ? (
          <ActivityIndicator color={primaryColor} className="py-10" />
        ) : status === null ? (
          <View className="bg-white rounded-2xl p-6 border border-sand-100 items-center">
            <View className="w-14 h-14 rounded-2xl bg-sand-100 items-center justify-center mb-3">
              <MessageCircle size={26} color={colors.sand[400]} />
            </View>
            <Text className="text-sm font-bold text-sand-900 mb-1">Not on your plan</Text>
            <Text className="text-xs text-sand-400 text-center leading-5">
              WhatsApp Catalog Sync is available on Growth and Pro plans. Upgrade to sync your
              products into WhatsApp Business.
            </Text>
          </View>
        ) : (
          <>
            {/* ── F5: status card ── */}
            <View className="bg-white rounded-2xl p-5 border border-sand-100 mb-4">
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-sm font-bold text-sand-900">Sync Status</Text>
                {status.configured ? (
                  <View className="bg-emerald-50 px-2.5 py-1 rounded-full">
                    <Text className="text-emerald-600 text-[11px] font-semibold">Connected</Text>
                  </View>
                ) : (
                  <View className="bg-turmeric-50 px-2.5 py-1 rounded-full">
                    <Text className="text-turmeric-600 text-[11px] font-semibold">
                      Not configured
                    </Text>
                  </View>
                )}
              </View>

              <View className="flex-row mb-4">
                <Stat label="Synced" value={String(status.items_synced)} color="text-emerald-600" />
                <Stat label="Pending" value={String(status.items_pending)} color="text-turmeric-600" />
                <Stat
                  label="Failed"
                  value={String(status.items_failed)}
                  color={status.items_failed > 0 ? 'text-rust-600' : 'text-sand-400'}
                />
              </View>

              <View className="space-y-1.5">
                <InfoRow label="Last synced" value={fmtDate(status.last_synced_at)} />
                <InfoRow
                  label="Catalog ID"
                  value={status.whatsapp_catalog_id ?? '—'}
                  mono={!!status.whatsapp_catalog_id}
                />
                {status.sync_categories.length > 0 && (
                  <InfoRow label="Syncing categories" value={`${status.sync_categories.length} selected`} />
                )}
              </View>

              {!status.configured && (
                <Text className="text-xs text-sand-400 leading-5 mt-3">
                  Connect your WhatsApp Business API in Settings → WhatsApp Business API first —
                  the catalog is created on your Meta account.
                </Text>
              )}
            </View>

            {/* ── F4: Sync Now ── */}
            <GradientButton
              label={syncMutation.isPending ? 'Syncing…' : 'Sync Now'}
              icon={<Zap size={16} color="white" />}
              disabled={!status.configured || syncMutation.isPending}
              onPress={() => syncMutation.mutate()}
            />
            <Text className="text-[11px] text-sand-400 text-center mt-2 mb-4">
              {status.configured
                ? 'Syncs every product to your WhatsApp catalog — takes a few seconds.'
                : 'Sync is available after connecting your WhatsApp Business API.'}
            </Text>

            {/* ── F2: toggle ── */}
            <View className="bg-white rounded-2xl p-5 border border-sand-100 mb-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 mr-4">
                  <Text className="text-sm font-bold text-sand-900">Sync to WhatsApp Catalog</Text>
                  <Text className="text-xs text-sand-400 leading-5 mt-1">
                    Keep your WhatsApp catalog in sync as products change.
                  </Text>
                </View>
                <Switch
                  value={status.sync_enabled}
                  onValueChange={(v) => void toggleSync(v)}
                  disabled={savingToggle || !status.configured}
                  trackColor={{ true: primaryColor, false: colors.sand[200] }}
                  thumbColor="white"
                  accessibilityLabel="Sync to WhatsApp Catalog"
                />
              </View>
            </View>

            {/* ── F3: category selector ── */}
            <View className="bg-white rounded-2xl p-5 border border-sand-100 mb-4">
              <Text className="text-sm font-bold text-sand-900 mb-1">Categories to sync</Text>
              <Text className="text-xs text-sand-400 leading-5 mb-3">
                {status.sync_categories.length === 0
                  ? 'All categories are synced. Pick specific ones to sync only those products.'
                  : 'Only products in the selected categories are synced.'}
              </Text>
              {categories.length === 0 ? (
                <Text className="text-xs text-sand-400">No categories yet.</Text>
              ) : (
                <View className="flex-row flex-wrap gap-2">
                  {categories.map((category) => {
                    const selected = status.sync_categories.includes(category.id);
                    return (
                      <AnimatedPressable
                        key={category.id}
                        onPress={() => void toggleCategory(category.id)}
                        disabled={savingCategories}
                        accessibilityLabel={`Sync category ${category.name}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        className={`px-3.5 py-2 rounded-full border ${
                          selected
                            ? 'bg-ink-600 border-ink-600'
                            : 'bg-sand-50 border-sand-200'
                        }`}
                      >
                        <Text className={`text-xs font-semibold ${selected ? 'text-white' : 'text-sand-600'}`}>
                          {category.name}
                        </Text>
                      </AnimatedPressable>
                    );
                  })}
                </View>
              )}
              {savingCategories && (
                <ActivityIndicator size="small" color={primaryColor} className="mt-3" />
              )}
            </View>

            {/* ── F6: sync history ── */}
            <View className="bg-white rounded-2xl border border-sand-100 overflow-hidden">
              <View className="px-5 py-4 border-b border-sand-100 flex-row items-center justify-between">
                <Text className="text-sm font-bold text-sand-900">Sync History</Text>
                <AnimatedPressable
                  onPress={() => void refresh()}
                  hitSlop={8}
                  accessibilityLabel="Refresh sync history"
                  accessibilityRole="button"
                >
                  <RefreshCw size={15} color={colors.sand[500]} />
                </AnimatedPressable>
              </View>

              {loadingLogs ? (
                <ActivityIndicator color={primaryColor} className="py-8" />
              ) : logs.length === 0 ? (
                <Text className="text-xs text-sand-400 text-center py-8 px-5">
                  No sync runs yet. Tap Sync Now to sync your products.
                </Text>
              ) : (
                logs.slice(0, 20).map((log) => (
                  <View key={log.id} className="px-5 py-3.5 border-b border-sand-50">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-sm font-semibold text-sand-800 capitalize">
                        {log.operation.replace('_', ' ')}
                      </Text>
                      <Text
                        className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-1 ${
                          LOG_STATUS_COLOR[log.status] ?? 'bg-sand-50 text-sand-500'
                        }`}
                      >
                        {log.status}
                      </Text>
                    </View>
                    <Text className="text-xs text-sand-400 mt-0.5">
                      {fmtDate(log.created_at)}
                      {log.product_id ? ` · ${log.product_id}` : ''}
                    </Text>
                    {log.error_message && (
                      <Text className="text-xs text-rust-600 mt-1" numberOfLines={2}>
                        {log.error_message}
                      </Text>
                    )}
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Small building blocks ─────────────────────────────────────────

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View className="flex-1">
      <Text className={`text-xl font-bold ${color}`}>{value}</Text>
      <Text className="text-[11px] text-sand-400 mt-0.5">{label}</Text>
    </View>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-xs text-sand-400">{label}</Text>
      <Text className={`text-xs font-semibold text-sand-700 ${mono ? 'font-mono' : ''}`} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
