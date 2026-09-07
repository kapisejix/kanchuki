import { useCallback, useState } from 'react'
import { View, Text, TextInput, ActivityIndicator, Image, ScrollView, Alert, Switch } from 'react-native'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as ImagePicker from 'expo-image-picker'
import { Camera, Trash2, Share2 } from 'lucide-react-native'
import {
  showcaseDesignsApi,
  uploadImageToR2,
  type ShowcaseDesignCategory,
} from '../../src/lib/api'
import { showError } from '../../src/lib/errors'
import { useScreenInsets } from '../../src/lib/safe-area'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'

export default function ShowcaseDesignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { insets } = useScreenInsets()
  const queryClient = useQueryClient()

  const { data: listData, isLoading } = useQuery({
    queryKey: ['showcase-designs', 'mine'],
    queryFn: () => showcaseDesignsApi.listMine(),
    staleTime: 30_000,
  })
  const design = (listData?.data ?? []).find((d) => d.id === id)

  const { data: categoriesData } = useQuery({
    queryKey: ['showcase-designs', 'categories'],
    queryFn: () => showcaseDesignsApi.categories(),
    staleTime: 60_000,
  })
  const categories: ShowcaseDesignCategory[] = categoriesData?.data ?? []

  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [name, setName] = useState<string | null>(null)
  const [isActive, setIsActive] = useState<boolean | null>(null)
  const [replacingPhoto, setReplacingPhoto] = useState(false)

  // Seed editable state once the row loads (global rows are read-only).
  const seeded = categoryId !== null
  if (design && !seeded && design.owner === 'self') {
    setCategoryId(design.category_id)
    setName(design.name)
    setIsActive(design.is_active)
  }
  const editable = design?.owner === 'self'

  const handleReplacePhoto = async () => {
    if (!design) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
      aspect: [3, 4],
    })
    if (result.canceled || !result.assets[0]) return

    const uri = result.assets[0].uri
    setReplacingPhoto(true)
    try {
      const uploadResult = await showcaseDesignsApi.getUploadUrl('image/jpeg')
      const info = uploadResult.data
      await uploadImageToR2(uri, info.upload_url, 'image/jpeg')
      await showcaseDesignsApi.update(design.id, { raw_r2_key: info.r2_key })
      void queryClient.invalidateQueries({ queryKey: ['showcase-designs'] })
    } catch (err) {
      showError(err, 'Failed to replace photo')
    } finally {
      setReplacingPhoto(false)
    }
  }

  const save = useMutation({
    mutationFn: () =>
      showcaseDesignsApi.update(design!.id, {
        ...(categoryId !== null ? { category_id: categoryId } : {}),
        name: name ?? null,
        is_active: isActive ?? true,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['showcase-designs'] })
      router.back()
    },
    onError: (err: Error) => showError(err, 'Please try again.', 'Could not save changes'),
  })

  const handleDelete = useCallback(() => {
    if (!design) return
    Alert.alert(
      'Delete this design?',
      'The photo will be removed from your designs and any shared links.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await showcaseDesignsApi.remove(design.id)
              await queryClient.invalidateQueries({ queryKey: ['showcase-designs'] })
              router.back()
            } catch (err) {
              showError(err, 'Try again.', 'Delete failed')
            }
          },
        },
      ],
    )
  }, [design, queryClient])

  if (isLoading || !design) {
    return (
      <View className="flex-1 bg-[#F8F7FC] items-center justify-center">
        <ActivityIndicator color="#BB3F95" />
      </View>
    )
  }

  const globalReadOnly = design.owner === 'global'

  return (
    <>
      <Stack.Screen options={{ title: globalReadOnly ? 'Design' : 'Edit Design', headerShown: true }} />
      <ScrollView
        className="flex-1 bg-[#F8F7FC]"
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24, gap: 18 }}
      >
        {/* Image + replace */}
        <View className="items-center gap-3">
          <View className="w-48 h-60 rounded-3xl overflow-hidden bg-lavender-100 border border-lavender-200 shadow-sm">
            <Image source={{ uri: design.image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </View>
          {globalReadOnly ? (
            <View className="bg-lavender-100 px-3 py-1.5 rounded-full border border-lavender-200">
              <Text className="text-[11px] text-heliotrope-600 font-bold">Kanchuki design · read-only</Text>
            </View>
          ) : (
            <AnimatedPressable
              onPress={() => void handleReplacePhoto()}
              disabled={replacingPhoto}
              className="flex-row items-center gap-2 bg-white px-4 py-2.5 rounded-2xl border border-lavender-200 shadow-sm"
            >
              {replacingPhoto ? (
                <ActivityIndicator size="small" color="#BB3F95" />
              ) : (
                <Camera size={16} color="#6B4773" />
              )}
              <Text className="text-xs font-bold text-spaceCadet-900">Replace photo (re-watermarks)</Text>
            </AnimatedPressable>
          )}
        </View>

        {!globalReadOnly && (
          <>
            {/* Category */}
            <View>
              <Text className="text-xs font-bold text-heliotrope-600 uppercase tracking-wide mb-2">Category</Text>
              <View className="flex-row flex-wrap gap-2">
                {categories.map((cat) => {
                  const selected = categoryId === cat.id
                  return (
                    <AnimatedPressable
                      key={cat.id}
                      onPress={() => setCategoryId(selected ? null : cat.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      className={`px-3.5 py-2 rounded-full border ${
                        selected ? 'bg-spaceCadet-900 border-spaceCadet-900' : 'bg-white border-lavender-200'
                      }`}
                    >
                      <Text className={`text-xs font-bold ${selected ? 'text-white' : 'text-spaceCadet-900'}`}>
                        {cat.name}
                      </Text>
                    </AnimatedPressable>
                  )
                })}
              </View>
            </View>

            {/* Name */}
            <View>
              <Text className="text-xs font-bold text-heliotrope-600 uppercase tracking-wide mb-1.5">Name</Text>
              <TextInput
                value={name ?? ''}
                onChangeText={setName}
                placeholder="e.g. Anarkali floor-length"
                placeholderTextColor="#928EB2"
                className="bg-white px-4 py-3 rounded-2xl text-sm font-bold text-spaceCadet-900 border border-lavender-200"
                maxLength={150}
              />
            </View>

            {/* Active toggle */}
            <View className="flex-row items-center justify-between bg-white px-4 py-3.5 rounded-2xl border border-lavender-200 shadow-sm">
              <View className="flex-1 pr-3">
                <Text className="text-sm font-bold text-spaceCadet-900">Active</Text>
                <Text className="text-[11px] text-heliotrope-500 font-medium">
                  Inactive designs are hidden from the customer storefront
                </Text>
              </View>
              <Switch
                value={isActive ?? true}
                onValueChange={setIsActive}
                trackColor={{ false: '#D8D4EC', true: '#BB3F95' }}
                thumbColor="white"
              />
            </View>
          </>
        )}

        {/* Post to social — reuses the Social Create-Post composer (Phase 6) */}
        <AnimatedPressable
          onPress={() => router.push(`/social/create?design_id=${design.id}`)}
          className="flex-row items-center gap-3 bg-white px-4 py-3 rounded-2xl border border-lavender-200 shadow-sm"
        >
          <View className="w-10 h-10 rounded-xl items-center justify-center bg-fuchsia-500/15">
            <Share2 size={18} color="#BB3F95" />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-bold text-spaceCadet-900">Post to Facebook / Instagram</Text>
            <Text className="text-xs text-heliotrope-500 font-medium">Share this design with your followers</Text>
          </View>
        </AnimatedPressable>

        {editable && (
          <>
            <GradientButton label="Save Changes" disabled={save.isPending} loading={save.isPending} onPress={() => save.mutate()} />
            <AnimatedPressable
              onPress={handleDelete}
              className="flex-row items-center justify-center gap-2 py-3 rounded-2xl border border-red-200 bg-red-50"
            >
              <Trash2 size={16} color="#DC2626" />
              <Text className="text-sm font-bold text-red-600">Delete design</Text>
            </AnimatedPressable>
          </>
        )}
      </ScrollView>
    </>
  )
}