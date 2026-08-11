import { useRef, useState } from 'react'
import { COLORS } from '@kanchuki/shared'
import { View, Text, TextInput, ScrollView, ActivityIndicator, Share, Alert, Linking } from 'react-native'
import { router } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X, Share2, Check, Download, Trash2 } from 'lucide-react-native'
import QRCode from 'react-native-qrcode-svg'
import { Paths, writeAsStringAsync } from 'expo-file-system'
import { retailerApi, collectionApi } from '../src/lib/api'
import { showError } from '../src/lib/errors'
import { useTheme } from '../src/lib/theme'
import { AnimatedPressable } from '../src/components/AnimatedPressable'

type QrSlug = { public_slug: string; profile_url: string }
type RetailerMe = {
  storefront_collection_id: string | null
  public_slug: string | null
  shop_name: string | null
}
type CollectionRow = { id: string; title: string; status: string; product_count: number }

export default function StoreProfileScreen() {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const qrRef = useRef<{ toDataURL: (cb: (base64: string) => void) => void } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const { data: meData } = useQuery({
    queryKey: ['retailer', 'me'],
    queryFn: () => retailerApi.getMe(),
  })
  const me = (meData as { data: RetailerMe } | undefined)?.data
  const hasQr = !!me?.public_slug

  // Only fetch the QR URL once a slug exists — POST /me/qr-slug is
  // get-or-create, so calling it with no QR would silently auto-create one
  // and defeat the explicit "Generate QR Code" action below.
  const { data: qrData, isLoading: qrLoading, isError: qrError, refetch: refetchQr } = useQuery({
    queryKey: ['retailer', 'qr-slug'],
    queryFn: () => retailerApi.getQrSlug(),
    enabled: hasQr,
  })
  const { data: collectionsData } = useQuery({
    queryKey: ['collections'],
    queryFn: () => collectionApi.list(),
  })

  const setStorefront = useMutation({
    mutationFn: (collectionId: string) => retailerApi.setStorefront(collectionId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['retailer', 'me'] }),
  })

  // Explicit generate — POST get-or-creates the slug from the current shop
  // name, then both queries refetch so the QR + link appear.
  const generateQr = useMutation({
    mutationFn: () => retailerApi.getQrSlug(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['retailer', 'me'] })
      void queryClient.invalidateQueries({ queryKey: ['retailer', 'qr-slug'] })
    },
  })

  // Verified delete — the UI only calls this after the retailer typed their
  // shop name in the confirm view (see confirmingDelete below).
  const deleteQr = useMutation({
    mutationFn: () => retailerApi.deleteQrSlug(),
    onSuccess: () => {
      setConfirmingDelete(false)
      setDeleteConfirmText('')
      void queryClient.invalidateQueries({ queryKey: ['retailer', 'me'] })
      void queryClient.invalidateQueries({ queryKey: ['retailer', 'qr-slug'] })
    },
  })

  const handleExportImage = async () => {
    if (!qr || exporting) return
    setExporting(true)
    try {
      // Get QR code as base64 PNG data URL via the SVG ref
      const dataUrl = await new Promise<string>((resolve, reject) => {
        if (qrRef.current) {
          qrRef.current.toDataURL((base64: string) => resolve(base64))
        } else {
          reject(new Error('QR ref not available'))
        }
      })

      // Save to temp file and share
      const fileUri = `${Paths.cache.uri}store-qr-${Date.now()}.png`
      await writeAsStringAsync(fileUri, dataUrl, {
        encoding: 'base64',
      })

      await Share.share({
        url: fileUri,
        message: `Here's my store QR code — scan to view my catalog!`,
      })
    } catch (err) {
      showError(err, 'Could not export QR code', 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const qr = (qrData as { data: QrSlug } | undefined)?.data
  const collections = ((collectionsData as { data: CollectionRow[] } | undefined)?.data ?? []).filter(
    (c) => c.status === 'ACTIVE',
  )

  // Onboarding routes here via router.replace (the final-step QR nudge), so
  // there may be NO prior route in the stack — back() would eject to the
  // auth screen. Fall back to the dashboard instead.
  const closeScreen = () => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace('/')
    }
  }
  // Verification gate for QR deletion: the typed text must match the shop
  // name AND be non-empty — so a null shop_name can never enable Delete on
  // an empty input ('' === '' would otherwise match).
  const deleteMatched =
    deleteConfirmText.trim().length > 0 &&
    deleteConfirmText.trim().toLowerCase() === (me?.shop_name ?? '').trim().toLowerCase()

  return (
    <ScrollView className="flex-1 bg-ink-50" contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 32 }}>
      <View className="flex-row items-center justify-between px-4 mb-4">
        <AnimatedPressable onPress={closeScreen} className="w-10 h-10 items-center justify-center" accessibilityLabel="Close" accessibilityRole="button">
          <X size={22} color={colors.sand[700]} />
        </AnimatedPressable>
        <Text className="text-base font-bold text-sand-900">Store QR Code</Text>
        <View className="w-10" />
      </View>

      <View className="items-center px-6 mb-6">
        <View className="bg-white rounded-3xl p-6 border border-sand-100 items-center">
          {hasQr ? (
            qrError ? (
              <View className="w-56 h-56 items-center justify-center px-4">
                <Text className="text-sm text-sand-500 text-center mb-3">{"Couldn't load QR code"}</Text>
                <AnimatedPressable
                  onPress={() => void refetchQr()}
                  className="bg-ink-600 rounded-full px-4 py-2"
                >
                  <Text className="text-white font-semibold text-sm">Retry</Text>
                </AnimatedPressable>
              </View>
            ) : qrLoading || !qr ? (
              <View className="w-56 h-56 items-center justify-center">
                <ActivityIndicator color={primaryColor} />
              </View>
            ) : (
              <QRCode value={qr.profile_url} size={220} getRef={(ref) => { qrRef.current = ref }} />
            )
          ) : (
            <View className="w-56 items-center justify-center px-2 py-4">
              <Text className="text-sm font-semibold text-sand-900 text-center mb-1">
                No QR code yet
              </Text>
              <Text className="text-xs text-sand-400 text-center mb-4 px-2">
                Generate one to let customers scan straight into your catalog. The link uses your shop name.
              </Text>
              <AnimatedPressable
                onPress={() => generateQr.mutate()}
                disabled={generateQr.isPending}
                className={`rounded-full px-6 py-3 flex-row items-center gap-2 ${generateQr.isPending ? 'bg-ink-300' : 'bg-ink-600'}`}
              >
                {generateQr.isPending ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text className="text-white font-semibold text-sm">Generate QR Code</Text>
                )}
              </AnimatedPressable>
            </View>
          )}
        </View>
        <Text className="text-xs text-sand-500 text-center mt-3 px-8">
          {hasQr
            ? 'Customers scan this to view your store profile and catalog'
            : 'Your QR opens your store profile where customers browse your catalog'}
        </Text>
        {hasQr && qr && !confirmingDelete && (
          <>
            <AnimatedPressable onPress={() => void Linking.openURL(qr.profile_url)}>
              <Text className="text-sm text-ink-700 underline text-center mt-2 px-8">
                {qr.profile_url}
              </Text>
            </AnimatedPressable>
            <AnimatedPressable
              onPress={() => void Share.share({ message: qr.profile_url })}
              className="flex-row items-center gap-2 bg-ink-600 px-5 py-3 rounded-2xl mt-4"
            >
              <Share2 size={16} color="white" />
              <Text className="text-white font-semibold text-sm">Share Link</Text>
            </AnimatedPressable>

            <View className="flex-row gap-3 mt-2">
              <AnimatedPressable
                onPress={() => void handleExportImage()}
                disabled={exporting}
                className="flex-1 flex-row items-center justify-center gap-2 bg-sand-800 border border-sand-700 py-3 rounded-2xl"
              >
                {exporting ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <Download size={16} color="white" />
                    <Text className="text-white font-semibold text-sm">Save QR Image</Text>
                  </>
                )}
              </AnimatedPressable>
              <AnimatedPressable
                onPress={() => setConfirmingDelete(true)}
                className="flex-1 flex-row items-center justify-center gap-2 bg-white border border-rust-300 py-3 rounded-2xl"
              >
                <Trash2 size={16} color={colors.rust[500]} />
                <Text className="text-rust-500 font-semibold text-sm">Delete QR</Text>
              </AnimatedPressable>
            </View>
          </>
        )}

        {/* Delete verification — the retailer must type their shop name; the
            Delete button stays disabled until it matches (case-insensitive).
            The DELETE endpoint is never reachable without this confirmation. */}
        {hasQr && confirmingDelete && (
          <View className="w-full bg-white rounded-2xl border border-rust-300 p-4 mt-4">
            <Text className="text-sm font-bold text-sand-900 mb-1">Delete QR code?</Text>
            <Text className="text-xs text-sand-500 mb-3 leading-4">
              Your store link and any printed QR will stop working. This can&apos;t be undone — type{' '}
              <Text className="font-semibold text-sand-900">{me?.shop_name}</Text> to confirm.
            </Text>
            <TextInput
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder={me?.shop_name ?? 'Your shop name'}
              placeholderTextColor={colors.sand[400]}
              className="bg-sand-50 border border-sand-200 rounded-xl px-3 py-2.5 text-sm text-sand-900 mb-3"
            />
            <View className="flex-row gap-3">
              <AnimatedPressable
                onPress={() => {
                  setConfirmingDelete(false)
                  setDeleteConfirmText('')
                }}
                className="flex-1 py-3 rounded-2xl border border-sand-200 items-center"
              >
                <Text className="text-sand-700 font-semibold text-sm">Cancel</Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={() => deleteQr.mutate()}
                disabled={deleteQr.isPending || !deleteMatched}
                className={`flex-1 py-3 rounded-2xl items-center ${
                  deleteQr.isPending || !deleteMatched ? 'bg-sand-300' : 'bg-rust-500'
                }`}
              >
                {deleteQr.isPending ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text className="text-white font-semibold text-sm">Delete QR</Text>
                )}
              </AnimatedPressable>
            </View>
          </View>
        )}
      </View>

      <View className="px-4">
        <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-2">
          Catalog shown after scan
        </Text>
        <Text className="text-xs text-sand-400 mb-3">
          Pick which collection opens once a visitor fills the contact form
        </Text>

        {collections.length === 0 ? (
          <View className="bg-white rounded-2xl p-4 border border-sand-100">
            <Text className="text-sm text-sand-500">
              No active collections yet — create one from the Collections tab first.
            </Text>
          </View>
        ) : (
          <View className="gap-2">
            {collections.map((c) => {
              const isSelected = me?.storefront_collection_id === c.id
              return (
                <AnimatedPressable
                  key={c.id}
                  onPress={() => setStorefront.mutate(c.id)}
                  disabled={setStorefront.isPending}
                  className={`flex-row items-center justify-between bg-white rounded-2xl p-4 border ${isSelected ? 'border-ink-400' : 'border-sand-100'}`}
                >
                  <View>
                    <Text className="text-sm font-semibold text-sand-900">{c.title}</Text>
                    <Text className="text-xs text-sand-400 mt-0.5">{c.product_count} products</Text>
                  </View>
                  {isSelected && (
                    <View className="w-6 h-6 rounded-full bg-ink-500 items-center justify-center">
                      <Check size={14} color="white" />
                    </View>
                  )}
                </AnimatedPressable>
              )
            })}
          </View>
        )}
      </View>
    </ScrollView>
  )
}
