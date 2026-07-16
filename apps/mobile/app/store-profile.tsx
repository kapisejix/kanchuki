import { useRef, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Share, Alert } from 'react-native'
import { router } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X, Share2, Check, Download } from 'lucide-react-native'
import QRCode from 'react-native-qrcode-svg'
import { Paths, writeAsStringAsync } from 'expo-file-system'
import { retailerApi, collectionApi } from '../src/lib/api'

type QrSlug = { public_slug: string; profile_url: string }
type RetailerMe = { storefront_collection_id: string | null }
type CollectionRow = { id: string; title: string; status: string; product_count: number }

export default function StoreProfileScreen() {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const qrRef = useRef<any>(null)
  const [exporting, setExporting] = useState(false)

  const { data: qrData, isLoading: qrLoading } = useQuery({
    queryKey: ['retailer', 'qr-slug'],
    queryFn: () => retailerApi.getQrSlug(),
  })
  const { data: meData } = useQuery({
    queryKey: ['retailer', 'me'],
    queryFn: () => retailerApi.getMe(),
  })
  const { data: collectionsData } = useQuery({
    queryKey: ['collections'],
    queryFn: () => collectionApi.list(),
  })

  const setStorefront = useMutation({
    mutationFn: (collectionId: string) => retailerApi.setStorefront(collectionId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['retailer', 'me'] }),
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
      Alert.alert('Export failed', err instanceof Error ? err.message : 'Could not export QR code')
    } finally {
      setExporting(false)
    }
  }

  const qr = (qrData as { data: QrSlug } | undefined)?.data
  const me = (meData as { data: RetailerMe } | undefined)?.data
  const collections = ((collectionsData as { data: CollectionRow[] } | undefined)?.data ?? []).filter(
    (c) => c.status === 'ACTIVE',
  )

  return (
    <ScrollView className="flex-1 bg-cyan-50" contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 32 }}>
      <View className="flex-row items-center justify-between px-4 mb-4">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center">
          <X size={22} color="#374151" />
        </TouchableOpacity>
        <Text className="text-base font-bold text-gray-900">Store QR Code</Text>
        <View className="w-10" />
      </View>

      <View className="items-center px-6 mb-6">
        <View className="bg-white rounded-3xl p-6 border border-gray-100 items-center">
          {qrLoading || !qr ? (
            <View className="w-56 h-56 items-center justify-center">
              <ActivityIndicator color="#0891B2" />
            </View>
          ) : (
            <QRCode value={qr.profile_url} size={220} getRef={(ref: any) => { qrRef.current = ref }} />
          )}
        </View>
        <Text className="text-xs text-gray-500 text-center mt-3 px-8">
          Customers scan this to view your store profile and catalog
        </Text>
        {qr && (
          <>
            <TouchableOpacity
              onPress={() => void Share.share({ message: qr.profile_url })}
              className="flex-row items-center gap-2 bg-cyan-600 px-5 py-3 rounded-2xl mt-4"
            >
              <Share2 size={16} color="white" />
              <Text className="text-white font-semibold text-sm">Share Link</Text>
            </TouchableOpacity>

            <View className="flex-row gap-3 mt-2">
              <TouchableOpacity
                onPress={() => void handleExportImage()}
                disabled={exporting}
                className="flex-1 flex-row items-center justify-center gap-2 bg-gray-800 border border-gray-700 py-3 rounded-2xl"
              >
                {exporting ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <Download size={16} color="white" />
                    <Text className="text-white font-semibold text-sm">Save QR Image</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      <View className="px-4">
        <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Catalog shown after scan
        </Text>
        <Text className="text-xs text-gray-400 mb-3">
          Pick which collection opens once a visitor fills the contact form
        </Text>

        {collections.length === 0 ? (
          <View className="bg-white rounded-2xl p-4 border border-gray-100">
            <Text className="text-sm text-gray-500">
              No active collections yet — create one from the Collections tab first.
            </Text>
          </View>
        ) : (
          <View className="gap-2">
            {collections.map((c) => {
              const isSelected = me?.storefront_collection_id === c.id
              return (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setStorefront.mutate(c.id)}
                  disabled={setStorefront.isPending}
                  className={`flex-row items-center justify-between bg-white rounded-2xl p-4 border ${isSelected ? 'border-cyan-400' : 'border-gray-100'}`}
                >
                  <View>
                    <Text className="text-sm font-semibold text-gray-900">{c.title}</Text>
                    <Text className="text-xs text-gray-400 mt-0.5">{c.product_count} products</Text>
                  </View>
                  {isSelected && (
                    <View className="w-6 h-6 rounded-full bg-cyan-500 items-center justify-center">
                      <Check size={14} color="white" />
                    </View>
                  )}
                </TouchableOpacity>
              )
            })}
          </View>
        )}
      </View>
    </ScrollView>
  )
}
