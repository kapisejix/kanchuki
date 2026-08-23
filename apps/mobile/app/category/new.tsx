import { useState } from 'react'
import { PRODUCT_CATEGORIES, COLORS } from '@kanchuki/shared'
import { View, Text, TextInput, ActivityIndicator, Image, Modal, FlatList, Pressable } from 'react-native'
import { Stack, router } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as ImagePicker from 'expo-image-picker'
import { ImagePlus, Check, X, Package } from 'lucide-react-native'
import { categoryApi, productApi, readLocalImage, uploadImageToR2 } from '../../src/lib/api'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'

export default function NewCategoryScreen() {
  const { primaryColor, colors } = useTheme()
  const [name, setName] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageR2Key, setImageR2Key] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const queryClient = useQueryClient()

  // Product photo picker state
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [showPhotoPicker, setShowPhotoPicker] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [selectedProductName, setSelectedProductName] = useState<string>('')

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products', 'list-for-category'],
    queryFn: () => productApi.list({ limit: 50 }),
    enabled: showProductPicker,
  })

  const { data: productDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['product', 'detail-for-category', selectedProductId],
    queryFn: () => productApi.get(selectedProductId!),
    enabled: !!selectedProductId && showPhotoPicker,
  })

  const products = (productsData as { data: Array<{ id: string; name: string | null; category: string | null; primary_photo_url: string | null }> } | undefined)?.data ?? []
  const productPhotos = (productDetail as { data?: { photos?: Array<{ id: string; url: string; r2_key: string }> } } | undefined)?.data?.photos ?? []

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
      aspect: [1, 1],
    })
    if (result.canceled || !result.assets[0]) return

    setUploading(true)
    try {
      const uri = result.assets[0].uri
      const blob = await readLocalImage(uri)
      const uploadResult = await categoryApi.getUploadUrl('image/jpeg', blob.size)
      const info = uploadResult.data
      await uploadImageToR2(uri, info.upload_url, 'image/jpeg')
      setImageUrl(info.public_url)
      setImageR2Key(info.r2_key)
    } catch (err) {
      showError(err, 'Failed to upload image')
    } finally {
      setUploading(false)
    }
  }

  const create = useMutation({
    mutationFn: () =>
      categoryApi.create({
        name: name.trim(),
        image_url: imageUrl ?? undefined,
        image_r2_key: imageR2Key ?? undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['categories'] })
      router.back()
    },
    onError: (err: Error) => showError(err, 'Please try again.', 'Could not create category'),
  })

  const canCreate = name.trim().length > 0 && !uploading && !create.isPending

  return (
    <>
      <Stack.Screen options={{ title: 'New Category', headerShown: true }} />
      <View className="flex-1 bg-ink-50 px-4 py-5 gap-4">
        <View className="items-center">
          <AnimatedPressable
            onPress={() => void handlePickImage()}
            disabled={uploading}
            className="w-28 h-28 rounded-2xl bg-white border border-sand-200 items-center justify-center overflow-hidden"
          >
            {uploading ? (
              <ActivityIndicator color={primaryColor} />
            ) : imageUrl ? (
              <Image source={{ uri: imageUrl }} style={{ width: 112, height: 112 }} resizeMode="cover" />
            ) : (
              <ImagePlus size={26} color={colors.sand[400]} />
            )}
          </AnimatedPressable>
          <Text className="text-xs text-sand-400 mt-1.5">
            {imageUrl ? 'Tap to change photo' : 'Add a cover photo (optional)'}
          </Text>
        </View>

        {/* Choose from product photos */}
        {!imageUrl && (
          <AnimatedPressable
            onPress={() => setShowProductPicker(true)}
            className="flex-row items-center gap-3 bg-white px-4 py-3 rounded-xl border border-sand-100"
          >
            <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: `${primaryColor}1A` }}>
              <Package size={18} color={primaryColor} />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-sand-900">Choose from product photos</Text>
              <Text className="text-xs text-sand-400">Reuse an existing product&apos;s image as the category cover</Text>
            </View>
          </AnimatedPressable>
        )}

        {/* ── Product Picker Modal ── */}
        <Modal visible={showProductPicker} animationType="slide" presentationStyle="pageSheet">
          <View className="flex-1 bg-ink-50">
            <View className="flex-row items-center justify-between px-4 py-3 border-b border-sand-100 bg-white">
              <Text className="text-base font-bold text-sand-900">Select a Product</Text>
              <Pressable onPress={() => { setShowProductPicker(false); setSelectedProductId(null) }} className="p-2">
                <X size={20} color={colors.sand[500]} />
              </Pressable>
            </View>
            {productsLoading ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator color={primaryColor} />
              </View>
            ) : (
              <FlatList
                data={products}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ padding: 12 }}
                renderItem={({ item }) => (
                  <AnimatedPressable
                    onPress={() => {
                      setSelectedProductId(item.id)
                      setSelectedProductName(item.name ?? item.category ?? 'Product')
                      setShowProductPicker(false)
                      setShowPhotoPicker(true)
                    }}
                    className="flex-row items-center gap-3 bg-white rounded-xl p-3 mb-2 border border-sand-100"
                  >
                    {item.primary_photo_url ? (
                      <Image source={{ uri: item.primary_photo_url }} style={{ width: 48, height: 48, borderRadius: 10 }} resizeMode="cover" />
                    ) : (
                      <View className="w-12 h-12 rounded-xl bg-sand-100 items-center justify-center">
                        <Package size={18} color={colors.sand[400]} />
                      </View>
                    )}
                    <View className="flex-1 min-w-0">
                      <Text className="text-sm font-semibold text-sand-900 truncate" numberOfLines={1}>{item.name ?? 'Unnamed'}</Text>
                      <Text className="text-xs text-sand-400 truncate" numberOfLines={1}>{item.category ?? 'No category'}</Text>
                    </View>
                  </AnimatedPressable>
                )}
              />
            )}
          </View>
        </Modal>

        {/* ── Photo Picker Modal ── */}
        <Modal visible={showPhotoPicker} animationType="slide" presentationStyle="pageSheet">
          <View className="flex-1 bg-ink-50">
            <View className="flex-row items-center justify-between px-4 py-3 border-b border-sand-100 bg-white">
              <Text className="text-base font-bold text-sand-900 truncate flex-1" numberOfLines={1}>{selectedProductName}</Text>
              <Pressable onPress={() => { setShowPhotoPicker(false); setSelectedProductId(null) }} className="p-2">
                <X size={20} color={colors.sand[500]} />
              </Pressable>
            </View>
            {detailLoading ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator color={primaryColor} />
              </View>
            ) : productPhotos.length === 0 ? (
              <View className="flex-1 items-center justify-center px-6">
                <Package size={32} color={colors.sand[300]} />
                <Text className="text-sm text-sand-400 mt-2">No photos on this product</Text>
              </View>
            ) : (
              <FlatList
                data={productPhotos}
                keyExtractor={(item) => item.id}
                numColumns={3}
                contentContainerStyle={{ padding: 12 }}
                columnWrapperStyle={{ gap: 8 }}
                renderItem={({ item }) => (
                  <AnimatedPressable
                    onPress={() => {
                      setImageUrl(item.url)
                      setImageR2Key(item.r2_key)
                      setShowPhotoPicker(false)
                      setSelectedProductId(null)
                    }}
                    className="flex-1 aspect-square rounded-xl overflow-hidden border-2 border-transparent"
                  >
                    <Image source={{ uri: item.url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  </AnimatedPressable>
                )}
              />
            )}
          </View>
        </Modal>

        <View>
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-1.5">
            Category Name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Wedding Sarees"
            placeholderTextColor={colors.sand[400]}
            className="bg-white px-4 py-3 rounded-xl text-sm text-sand-900 border border-sand-100"
            maxLength={100}
          />
        </View>

        <View>
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-1.5">
            Suggestions
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {PRODUCT_CATEGORIES.map((cat) => {
              const selected = name.trim() === cat
              return (
                <AnimatedPressable
                  key={cat}
                  onPress={() => setName(cat)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1 ${
                    selected ? 'bg-ink-600 border-ink-600' : 'bg-white border-sand-200'
                  }`}
                >
                  {selected && <Check size={12} color="white" />}
                  <Text className={`text-xs font-medium ${selected ? 'text-white' : 'text-sand-600'}`}>
                    {cat}
                  </Text>
                </AnimatedPressable>
              )
            })}
          </View>
        </View>

        <GradientButton
          label="Create Category"
          disabled={!canCreate}
          loading={create.isPending}
          onPress={() => create.mutate()}
        />
      </View>
    </>
  )
}
