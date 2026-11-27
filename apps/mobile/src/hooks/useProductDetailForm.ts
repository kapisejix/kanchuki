import {
  type InchRows,
  type KidsAgeGroupValue,
  type ProductAudienceValue,
  type ProductDetail,
  type ProductStatus,
  inchesFromChart,
  parseSizeChart,
} from '@kanchuki/shared';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { gateSizeChart } from '../components/product-detail/SizeChartEditor';
import { toStockPayload } from '../components/product-detail/StockEditor';
import { productApi } from '../lib/api';
import { showError } from '../lib/errors';

interface UseProductDetailFormProps {
  product: ProductDetail | undefined;
}

export function useProductDetailForm({ product }: UseProductDetailFormProps) {
  const queryClient = useQueryClient();

  const [price, setPrice] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [selectedFabrics, setSelectedFabrics] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  // Per-size stock. Only sent on save once the retailer edits it: re-sending untouched
  // (or legacy untracked) counts would flip a SOLD product back to AVAILABLE.
  const [stockQty, setStockQty] = useState<Record<string, number>>({});
  const [stockTouched, setStockTouched] = useState(false);
  // My Style Phase 4 size chart (inches). Only sent once edited, like stock.
  const [chartRows, setChartRows] = useState<InchRows>({});
  const [chartTouched, setChartTouched] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [editedCategory, setEditedCategory] = useState<string | null>(null);
  const [editedColor, setEditedColor] = useState<string>('');
  const [editedPattern, setEditedPattern] = useState<string | null>(null);
  const [editedCategoryId, setEditedCategoryId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState<string>('');
  const [editedSku, setEditedSku] = useState<string>('');
  const [editedDescription, setEditedDescription] = useState<string>('');
  const [editedSubtype, setEditedSubtype] = useState<string>('');
  // "Who is it for?" — shown from the stored (maybe AI-filled) value, sent only once the
  // retailer touches it, so saving an unrelated edit never rewrites the AI's pick.
  const [audience, setAudience] = useState<ProductAudienceValue | null>(null);
  const [kidsAge, setKidsAge] = useState<KidsAgeGroupValue | null>(null);
  const [audienceTouched, setAudienceTouched] = useState(false);

  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [retagging, setRetagging] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Color detection from current photo

  const dirty = useCallback(
    <T>(setter: (v: T) => void) =>
      (val: T) => {
        setIsDirty(true);
        setter(val);
      },
    [],
  );

  // Hydrate fields from server
  const hydratedProductId = useRef<string | null>(null);
  useEffect(() => {
    if (!product) return;
    const firstHydrate = hydratedProductId.current !== product.id;
    if (firstHydrate) {
      hydratedProductId.current = product.id;
      setIsDirty(false);
    }
    if (!firstHydrate && isDirty) return;

    setPrice(product.price_min != null ? String(product.price_min / 100) : '');
    setLocation(product.location_notes ?? '');
    setNotes(product.notes ?? '');
    setSelectedStyles(product.styles ?? []);
    setSelectedFabrics(product.fabrics ?? []);
    setSelectedSizes(product.sizes ?? []);
    setStockQty(Object.fromEntries((product.stock ?? []).map((r) => [r.size, r.quantity])));
    setStockTouched(false);
    const chart = parseSizeChart(product.size_chart);
    setChartRows(chart ? inchesFromChart(chart) : {});
    setChartTouched(false);
    setChartError(null);
    setSelectedCategoryIds(product.category_id ? [product.category_id] : []);
    setEditedCategory(product.category ?? null);
    setEditedColor(product.primary_color ?? '');
    setEditedPattern(product.pattern ?? null);
    setEditedCategoryId(product.category_id ?? null);
    setEditedName(product.name ?? '');
    setEditedSku(product.sku ?? '');
    setEditedDescription(product.description ?? '');
    setEditedSubtype(product.subtype ?? '');
    setAudience(product.audience ?? null);
    setKidsAge(product.kids_age_group ?? null);
    setAudienceTouched(false);
  }, [product, isDirty]);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['products'] });
    void queryClient.invalidateQueries({ queryKey: ['retailer', 'stats'] });
  }, [queryClient]);

  const handleSave = async (categoryList?: { id: string; name: string }[]) => {
    if (!product) return;
    const chart = chartTouched ? gateSizeChart(chartRows, selectedSizes, setChartError) : null;
    if (chartTouched && !chart) return;
    setSaving(true);
    try {
      const priceInPaise = price ? Math.round(Number.parseFloat(price) * 100) : undefined;
      const primaryCatId = selectedCategoryIds[0] ?? editedCategoryId ?? undefined;
      const matchedCatName =
        categoryList && primaryCatId
          ? categoryList.find((c) => c.id === primaryCatId)?.name
          : editedCategory;

      const selectedCatNames = categoryList
        ? selectedCategoryIds
            .map((id) => categoryList.find((c) => c.id === id)?.name)
            .filter((n): n is string => Boolean(n))
        : [];

      const tagsToSave = Array.from(
        new Set([
          ...(product.search_tags ?? []),
          ...selectedCatNames,
          ...selectedStyles,
          ...selectedFabrics,
        ]),
      );

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
        ...(stockTouched ? { stock: toStockPayload(selectedSizes, stockQty) } : {}),
        ...(audienceTouched ? { audience, kids_age_group: kidsAge } : {}),
        ...(chart ? { size_chart: chart.size_chart } : {}),
        search_tags: tagsToSave,
      });
      invalidate();
      setIsDirty(false);
      setStockTouched(false);
      setChartTouched(false);
      setAudienceTouched(false);
      Alert.alert('Saved', 'Product updated.');
    } catch (err) {
      showError(err, 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleRetag = async () => {
    if (!product || retagging) return;
    setRetagging(true);
    try {
      await productApi.retag(product.id);
      void queryClient.invalidateQueries({ queryKey: ['products', product.id] });
    } catch (err) {
      showError(err, 'Failed to start re-tagging');
    } finally {
      setRetagging(false);
    }
  };

  const handleStatusChange = async (status: ProductStatus) => {
    if (!product) return;
    setStatusUpdating(true);
    try {
      await productApi.updateStatus(product.id, status);
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['products', product.id] });
    } catch (err) {
      showError(err, 'Failed to update status');
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleDelete = () => {
    if (!product || deleting) return;
    Alert.alert('Delete Product', 'This removes it from your catalog. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await productApi.delete(product.id);
            invalidate();
            router.back();
          } catch (err) {
            showError(err, 'Failed to delete product');
            setDeleting(false);
          }
        },
      },
    ]);
  };

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
    stockQty,
    chartRows,
    chartError,
    setChartRows: (rows: InchRows) => {
      setIsDirty(true);
      setChartTouched(true);
      setChartError(null);
      setChartRows(rows);
    },
    setStock: (size: string, quantity: number) => {
      setIsDirty(true);
      setStockTouched(true);
      setStockQty((prev) => ({ ...prev, [size]: quantity }));
    },
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
    audience,
    kidsAge,
    setAudiencePick: (p: {
      audience: ProductAudienceValue | null;
      kids_age_group: KidsAgeGroupValue | null;
    }) => {
      setIsDirty(true);
      setAudienceTouched(true);
      setAudience(p.audience);
      setKidsAge(p.kids_age_group);
    },
    isDirty,
    dirty,
    saving,
    retagging,
    statusUpdating,
    deleting,
    handleSave,
    handleRetag,
    handleStatusChange,
    handleDelete,
  };
}
