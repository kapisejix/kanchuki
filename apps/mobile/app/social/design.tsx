import { DESIGN_FORMATS } from '@kanchuki/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, TextInput, View } from 'react-native';
import { AnimatedPressable } from '../../src/components/AnimatedPressable';
import { GradientButton } from '../../src/components/GradientButton';
import { KeyboardScreen } from '../../src/components/KeyboardScreen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { ProductGridPicker } from '../../src/components/social';
import type { ComposeProduct } from '../../src/components/social/types';
import { type DesignTemplateRow, designTemplatesApi } from '../../src/lib/api';
import { showError } from '../../src/lib/errors';
import { useTheme } from '../../src/lib/theme';

// T4: pick an admin-made design → pick products → server renders it with the shop's own
// price / name / logo → hand the image to the composer as an IMAGE post (?design_image=).
export default function DesignPostScreen() {
  const { primaryColor } = useTheme();
  const [design, setDesign] = useState<DesignTemplateRow | null>(null);
  const [selected, setSelected] = useState<ComposeProduct[]>([]);
  const [customText, setCustomText] = useState('');
  const [offerText, setOfferText] = useState('');
  const [preview, setPreview] = useState<string | null>(null);

  const designs = useQuery({
    queryKey: ['designs', 'list'],
    queryFn: () => designTemplatesApi.list(),
    staleTime: 30_000,
  });

  const render = useMutation({
    mutationFn: () =>
      designTemplatesApi.render((design as DesignTemplateRow).id, {
        product_ids: selected.map((p) => p.id),
        ...(customText.trim() ? { custom_text: customText.trim() } : {}),
        ...(offerText.trim() ? { offer_text: offerText.trim() } : {}),
      }),
    onSuccess: (res) => setPreview(res.data.image_url),
    onError: (err) => showError(err, 'Could not make this design. Try again.'),
  });

  const pick = (d: DesignTemplateRow) => {
    if (d.ai) {
      router.push({ pathname: '/social/ai-design' as never, params: { template_id: d.id } });
      return;
    }
    setDesign(d);
    setSelected([]);
    setPreview(null);
  };
  const toggle = (p: ComposeProduct) => {
    setPreview(null);
    setSelected((cur) => {
      if (cur.some((s) => s.id === p.id)) return cur.filter((s) => s.id !== p.id);
      const cap = design?.product_slots ?? 1;
      return cap === 1 ? [p] : cur.length >= cap ? cur : [...cur, p];
    });
  };

  const list = designs.data?.data ?? [];
  // Preview at the design's real shape (landscape 1.91:1, story 9:16, ...); unknown format → 4:5.
  const fmt = (DESIGN_FORMATS as Record<string, { w: number; h: number }>)[design?.format ?? ''];
  const previewAspect = fmt ? fmt.w / fmt.h : 4 / 5;

  return (
    <KeyboardScreen className="flex-1 bg-ink-50">
      <ScreenHeader title="Design a post" subtitle="Pick a design, add your products" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {designs.isLoading ? (
          <ActivityIndicator color={primaryColor} className="py-16" />
        ) : designs.isError ? (
          <Text className="text-sm text-sand-400 text-center py-10">
            Could not load designs. Check your connection and reopen this screen.
          </Text>
        ) : list.length === 0 ? (
          <Text className="text-sm text-sand-400 text-center py-10">
            No designs available yet. Check back soon.
          </Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {list.map((d) => (
              <AnimatedPressable
                key={d.id}
                onPress={() => pick(d)}
                accessibilityRole="button"
                accessibilityLabel={d.ai ? `AI design ${d.name}` : `Design ${d.name}`}
                accessibilityState={{ selected: design?.id === d.id }}
                className="mr-3 w-28"
              >
                <View
                  className="h-36 w-28 rounded-2xl overflow-hidden bg-sand-100"
                  style={{
                    borderWidth: 2,
                    borderColor: design?.id === d.id ? primaryColor : 'transparent',
                  }}
                >
                  {d.thumbnail_url ? (
                    <Image
                      source={{ uri: d.thumbnail_url }}
                      className="h-full w-full"
                      resizeMode="contain"
                    />
                  ) : null}
                  {d.ai ? (
                    <View className="absolute top-1 left-1 rounded-full bg-white px-2 py-0.5">
                      <Text className="text-[11px] font-semibold text-sand-900">AI</Text>
                    </View>
                  ) : null}
                </View>
                <Text className="text-xs font-semibold mt-1 text-sand-900" numberOfLines={1}>
                  {d.name}
                </Text>
                {d.occasion ? (
                  <Text className="text-[11px] text-sand-400" numberOfLines={1}>
                    {d.occasion}
                  </Text>
                ) : null}
              </AnimatedPressable>
            ))}
          </ScrollView>
        )}

        {design ? (
          <View className="mt-5">
            <Text className="text-sm font-semibold mb-2 text-sand-900">
              {design.product_slots === 1
                ? 'Pick a product'
                : `Pick up to ${design.product_slots} products`}
            </Text>
            <ProductGridPicker
              maxItems={design.product_slots}
              selected={selected}
              onToggle={toggle}
              selectedOrder={(id) => {
                const i = selected.findIndex((s) => s.id === id);
                return i >= 0 ? i : null;
              }}
            />

            <Text className="text-sm font-semibold mt-5 mb-2 text-sand-900">Optional text</Text>
            <TextInput
              value={customText}
              onChangeText={(t) => {
                setCustomText(t);
                setPreview(null);
              }}
              maxLength={80}
              placeholder="Headline (e.g. Diwali Special)"
              accessibilityLabel="Headline text"
              className="rounded-xl bg-white px-3 py-3 text-sm mb-2"
            />
            <TextInput
              value={offerText}
              onChangeText={(t) => {
                setOfferText(t);
                setPreview(null);
              }}
              maxLength={80}
              placeholder="Offer (e.g. Flat 20% off)"
              accessibilityLabel="Offer text"
              className="rounded-xl bg-white px-3 py-3 text-sm"
            />

            <View className="mt-5">
              <GradientButton
                label={preview ? 'Remake design' : 'Make design'}
                onPress={() => render.mutate()}
                loading={render.isPending}
                disabled={selected.length === 0}
              />
            </View>
          </View>
        ) : null}

        {preview ? (
          <View className="mt-5">
            <Image
              source={{ uri: preview }}
              className="w-full rounded-2xl bg-sand-100"
              style={{ aspectRatio: previewAspect }}
              resizeMode="contain"
              accessibilityLabel="Design preview"
            />
            <View className="mt-4">
              <GradientButton
                label="Post this design"
                onPress={() =>
                  router.push({ pathname: '/social/create', params: { design_image: preview } })
                }
              />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardScreen>
  );
}
