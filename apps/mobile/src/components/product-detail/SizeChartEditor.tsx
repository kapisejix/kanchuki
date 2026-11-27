import {
  type InchRows,
  SIZE_CHART_DIMENSIONS,
  type SizeChart,
  type SizeChartDimension,
  chartFromInches,
  standardInchRows,
} from '@kanchuki/shared';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import React, { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';

// My Style Phase 4: an optional size chart on the product form. The retailer types the body
// measurement each size "fits up to", in inches (how Indian stores measure); the shared
// chartFromInches turns it into the cm chart the API validates.

const DIM_LABEL: Record<SizeChartDimension, string> = { bust: 'Bust', waist: 'Waist', hip: 'Hip' };
export const SIZE_CHART_ERROR = 'Each size must be bigger than the one before';
// 22-63" keeps every cm bound inside the API's 50-160 cm (a first size's lower bound is upper − 5).
const MIN_IN = 22;
const MAX_IN = 63;
export const SIZE_CHART_RANGE_ERROR = `Use inches between ${MIN_IN} and ${MAX_IN}`;

/** Save gate for both forms: a cm chart (null clears it) or the error to show. */
export function sizeChartPayload(
  rows: InchRows,
): { size_chart: SizeChart | null } | { error: string } {
  const values = Object.values(rows).flatMap((r) => Object.values(r));
  if (values.some((v) => v !== undefined && (v < MIN_IN || v > MAX_IN)))
    return { error: SIZE_CHART_RANGE_ERROR };
  const c = chartFromInches(rows);
  return c === 'invalid' ? { error: SIZE_CHART_ERROR } : { size_chart: c };
}

/**
 * Both forms' save: rows for ticked sizes -> payload, or null after reporting the problem both
 * inline (onError) and in an Alert, because Save sits in the header, far from the editor.
 */
export function gateSizeChart(
  rows: InchRows,
  sizes: readonly string[],
  onError: (msg: string) => void,
): { size_chart: SizeChart | null } | null {
  const r = sizeChartPayload(rowsForSizes(rows, sizes));
  if ('error' in r) {
    onError(r.error);
    Alert.alert('Size chart', r.error);
    return null;
  }
  return r;
}

/** Keep only the rows for sizes still ticked (an unticked size must not reach the chart). */
export function rowsForSizes(rows: InchRows, sizes: readonly string[]): InchRows {
  return Object.fromEntries(Object.entries(rows).filter(([s]) => sizes.includes(s)));
}

interface Props {
  sizes: string[];
  rows: InchRows;
  onChange: (rows: InchRows) => void;
  error: string | null;
}

export function SizeChartEditor({ sizes, rows, onChange, error }: Props) {
  const [open, setOpen] = useState(false);
  // Raw text per input, so "36." survives while the retailer is still typing "36.5".
  const [draft, setDraft] = useState<Record<string, string>>({});
  if (sizes.length === 0) return null;

  const set = (size: string, dim: SizeChartDimension, raw: string) => {
    setDraft((d) => ({ ...d, [`${size}-${dim}`]: raw }));
    const n = Number.parseFloat(raw);
    const row = { ...rows[size] };
    if (raw.trim() === '' || !Number.isFinite(n)) delete row[dim];
    else row[dim] = n;
    onChange({ ...rows, [size]: row });
  };

  return (
    <View className="bg-white rounded-2xl p-4 border border-lavender-200">
      <AnimatedPressable
        testID="size-chart-toggle"
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        className="flex-row items-center justify-between"
      >
        <Text className="text-xs font-semibold text-heliotrope-500">Size chart (optional)</Text>
        {open ? <ChevronUp size={16} color="#64748b" /> : <ChevronDown size={16} color="#64748b" />}
      </AnimatedPressable>
      <Text className="text-xs text-heliotrope-500 mt-2">
        Shoppers who saved their measurements see 'Your size' on this item.
      </Text>

      {open && (
        <View className="mt-3 gap-3">
          <AnimatedPressable
            testID="size-chart-standard"
            onPress={() => {
              setDraft({});
              onChange(standardInchRows(sizes));
            }}
            accessibilityRole="button"
            className="self-start px-3 py-1.5 rounded-full border border-ink-600"
          >
            <Text className="text-xs font-medium text-ink-600">Use standard chart</Text>
          </AnimatedPressable>
          <Text className="text-xs text-heliotrope-500">Fits up to, in inches</Text>
          {sizes.map((size) => (
            <View key={size} className="flex-row items-center gap-2">
              <Text className="w-12 text-xs font-semibold text-spaceCadet-900">{size}</Text>
              {SIZE_CHART_DIMENSIONS.map((dim) => (
                <TextInput
                  key={dim}
                  testID={`size-chart-${size}-${dim}`}
                  accessibilityLabel={`${size} ${DIM_LABEL[dim]} inches`}
                  placeholder={DIM_LABEL[dim]}
                  keyboardType="decimal-pad"
                  value={draft[`${size}-${dim}`] ?? rows[size]?.[dim]?.toString() ?? ''}
                  onChangeText={(t) => set(size, dim, t)}
                  className="flex-1 rounded-xl border border-lavender-200 px-2 py-1.5 text-sm text-spaceCadet-900"
                />
              ))}
            </View>
          ))}
        </View>
      )}

      {error && <Text className="text-xs text-red-700 mt-2">{error}</Text>}
    </View>
  );
}
