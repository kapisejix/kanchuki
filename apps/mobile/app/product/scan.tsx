import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { SkuScanner } from '../../src/components/SkuScanner';
import { productApi } from '../../src/lib/api';
import { showError } from '../../src/lib/errors';

/**
 * F-025 scan-to-sell: offline sale reconciliation.
 *
 * Scans the product's auto-generated SKU (printed as a QR/SKU tag from the
 * product detail screen — "Print SKU Tag") and jumps straight into the
 * existing product/[id].tsx, where the retailer taps the existing SOLD
 * toggle (already offline-safe via the mutation queue). Scanning only
 * replaces the "find the product" step; nothing downstream is new.
 *
 * Works for shop staff (Staff model) too — the SKU lookup reuses the
 * existing no-owner-gate list endpoint, same as the manual status toggle.
 *
 * Camera + manual input live in SkuScanner (shared with the F-047 sell screen).
 */
export default function ScanScreen() {
  const [resolving, setResolving] = useState(false);
  const [scanPaused, setScanPaused] = useState(false);

  const resolveAndOpen = async (sku: string) => {
    setResolving(true);
    setScanPaused(true);
    try {
      const res = await productApi.list({ sku, limit: 1 });
      const items = (res.data ?? []) as { id: string }[];
      const first = items[0];
      if (!first) {
        Alert.alert('Not Found', `No product with SKU "${sku.toUpperCase()}" in this catalog.`, [
          { text: 'Scan again', onPress: () => setScanPaused(false) },
        ]);
        return;
      }
      router.replace(`/product/${first.id}`);
    } catch (err) {
      showError(err, 'Could not look up that SKU');
      setScanPaused(false);
    } finally {
      setResolving(false);
    }
  };

  return (
    <SkuScanner
      onSku={resolveAndOpen}
      onClose={() => router.back()}
      paused={scanPaused}
      busy={resolving}
    />
  );
}
