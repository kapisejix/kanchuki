import { useState, useRef, useEffect, useCallback } from 'react'
import { Alert } from 'react-native'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import type { ProductDetail, ProductStatus } from '@kanchuki/shared'
import { productApi } from '../lib/api'
import { showError } from '../lib/errors'

interface UseProductDetailFormProps {
  product: ProductDetail | undefined
  selectedPhotoIndex: number
  displayPhotos: Array<{ url: string; is_video?: boolean }>
}

export function useProductDetailForm({
  product,
  selectedPhotoIndex,
  displayPhotos,
}: UseProductDetailFormProps) {
  const queryClient = useQueryClient()

  const [price, setPrice] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedStyles, setSelectedStyles] = useState<string[]>([])
  const [selectedFabrics, setSelectedFabrics] = useState<string[]>([])
  const [selectedSizes, setSelectedSizes] = useState<string[]>([])
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [editedCategory, setEditedCategory] = useState<string | null>(null)
  const [editedColor, setEditedColor] = useState<string>('')
  const [editedPattern, setEditedPattern] = useState<string | null>(null)
  const [editedCategoryId, setEditedCategoryId] = useState<string | null>(null)
  const [editedName, setEditedName] = useState<string>('')
  const [editedSku, setEditedSku] = useState<string>('')
  const [editedDescription, setEditedDescription] = useState<string>('')
  const [editedSubtype, setEditedSubtype] = useState<string>('')

  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [retagging, setRetagging] = useState(false)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Color detection from current photo
  const [detectingColor, setDetectingColor] = useState(false)
  const [detectedColor, setDetectedColor] = useState<string | null>(null)
  const [colorDetectError, setColorDetectError] = useState<string | null>(null)

  const dirty = useCallback(
    <T,>(setter: (v: T) => void) =>
      (val: T) => {
        setIsDirty(true)
        setter(val)
      },
    [],
  )

  // Clear detected color when switching photos
  useEffect(() => {
    setDetectedColor(null)
    setColorDetectError(null)
  }, [selectedPhotoIndex])

  // Hydrate fields from server
  const hydratedProductId = useRef<string | null>(null)
  useEffect(() => {
    if (!product) return
    const firstHydrate = hydratedProductId.current !== product.id
    if (firstHydrate) {
      hydratedProductId.current = product.id
      setIsDirty(false)
    }
    if (!firstHydrate && isDirty) return

    setPrice(product.price_min != null ? String(product.price_min / 100) : '')
    setLocation(product.location_notes ?? '')
    setNotes(product.notes ?? '')
    setSelectedStyles(product.styles ?? [])
    setSelectedFabrics(product.fabrics ?? [])
    setSelectedSizes(product.sizes ?? [])
    setSelectedCategoryIds(product.category_id ? [product.category_id] : [])
    setEditedCategory(product.category ?? null)
    setEditedColor(product.primary_color ?? '')
    setEditedPattern(product.pattern ?? null)
    setEditedCategoryId(product.category_id ?? null)
    setEditedName(product.name ?? '')
    setEditedSku(product.sku ?? '')
    setEditedDescription(product.description ?? '')
    setEditedSubtype(product.subtype ?? '')
  }, [product, isDirty])

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['products'] })
    void queryClient.invalidateQueries({ queryKey: ['retailer', 'stats'] })
  }, [queryClient])

  const handleSave = async (categoryList?: Array<{ id: string; name: string }>) => {
    if (!product) return
    setSaving(true)
    try {
      const priceInPaise = price ? Math.round(parseFloat(price) * 100) : undefined
      const primaryCatId = selectedCategoryIds[0] ?? editedCategoryId ?? undefined
      const matchedCatName = categoryList && primaryCatId
        ? categoryList.find((c) => c.id === primaryCatId)?.name
        : editedCategory

      const selectedCatNames = categoryList
        ? selectedCategoryIds
            .map((id) => categoryList.find((c) => c.id === id)?.name)
            .filter((n): n is string => Boolean(n))
        : []

      const tagsToSave = Array.from(
        new Set([
          ...(product.search_tags ?? []),
          ...selectedCatNames,
          ...selectedStyles,
          ...selectedFabrics,
        ]),
      )

      await productApi.update(product.id, {
        price_min: priceInPaise,
        price_max: priceInPaise,
        name: editedName || undefined,
        sku: editedSku || undefined,
        description: editedDescription || undefined,
        subtype: editedSubtype || undefined,
        category: matchedCatName ?? editedCategory ?? undefined,
        primary_color: editedColor || undefined,
        pattern: editedPattern ?? undefined,
        category_id: primaryCatId ?? null,
        location_notes: location || undefined,
        notes: notes || undefined,
        styles: selectedStyles,
        fabrics: selectedFabrics,
        sizes: selectedSizes,
        search_tags: tagsToSave,
      })
      invalidate()
      setIsDirty(false)
      Alert.alert('Saved', 'Product updated.')
    } catch (err) {
      showError(err, 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleRetag = async () => {
    if (!product || retagging) return
    setRetagging(true)
    try {
      await productApi.retag(product.id)
      void queryClient.invalidateQueries({ queryKey: ['products', product.id] })
    } catch (err) {
      showError(err, 'Failed to start re-tagging')
    } finally {
      setRetagging(false)
    }
  }

  const handleStatusChange = async (status: ProductStatus) => {
    if (!product) return
    setStatusUpdating(true)
    try {
      await productApi.updateStatus(product.id, status)
      invalidate()
      void queryClient.invalidateQueries({ queryKey: ['products', product.id] })
    } catch (err) {
      showError(err, 'Failed to update status')
    } finally {
      setStatusUpdating(false)
    }
  }

  const handleDelete = () => {
    if (!product || deleting) return
    Alert.alert('Delete Product', 'This removes it from your catalog. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true)
          try {
            await productApi.delete(product.id)
            invalidate()
            router.back()
          } catch (err) {
            showError(err, 'Failed to delete product')
            setDeleting(false)
          }
        },
      },
    ])
  }

  const handleDetectColor = async () => {
    const photo = displayPhotos[selectedPhotoIndex]
    if (!photo || photo.is_video || detectingColor) return
    setDetectingColor(true)
    setColorDetectError(null)
    setDetectedColor(null)
    try {
      const res = await productApi.detectColor(photo.url)
      if (res.data?.color) {
        setDetectedColor(res.data.color)
      } else {
        setColorDetectError('Could not detect dominant color')
      }
    } catch {
      setColorDetectError('Color detection failed')
    } finally {
      setDetectingColor(false)
    }
  }

  return {
    price,
    setPrice,
    location,
    setLocation,
    notes,
    setNotes,
    selectedStyles,
    setSelectedStyles,
    selectedFabrics,
    setSelectedFabrics,
    selectedSizes,
    setSelectedSizes,
    selectedCategoryIds,
    setSelectedCategoryIds,
    editedCategory,
    setEditedCategory,
    editedColor,
    setEditedColor,
    editedPattern,
    setEditedPattern,
    editedCategoryId,
    setEditedCategoryId,
    editedName,
    setEditedName,
    editedSku,
    setEditedSku,
    editedDescription,
    setEditedDescription,
    editedSubtype,
    setEditedSubtype,
    isDirty,
    dirty,
    saving,
    retagging,
    statusUpdating,
    deleting,
    detectingColor,
    detectedColor,
    setDetectedColor,
    colorDetectError,
    handleSave,
    handleRetag,
    handleStatusChange,
    handleDelete,
    handleDetectColor,
  }
}

