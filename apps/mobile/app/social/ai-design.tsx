import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, TextInput, View } from 'react-native';
import { AnimatedPressable } from '../../src/components/AnimatedPressable';
import { GradientButton } from '../../src/components/GradientButton';
import { KeyboardScreen } from '../../src/components/KeyboardScreen';
import { ReportAiContent } from '../../src/components/ReportAiContent';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { ProductGridPicker } from '../../src/components/social';
import type { ComposeProduct } from '../../src/components/social/types';
import { type AiDesignFormat, type AiDesignOverlay, aiDesignsApi } from '../../src/lib/api';
import { showError } from '../../src/lib/errors';
import { useTheme } from '../../src/lib/theme';

// T5: describe a scene in your own words → the server cleans the text, reserves one quota slot and
// generates the image in the background (the garment is kept; no text is ever drawn by the AI).
// The finished image is saved to "My AI designs" and posted through the composer's IMAGE path.
const POLL_MS = 3000;
const GIVE_UP_MS = 4 * 60 * 1000;

const FORMATS: { id: AiDesignFormat; label: string }[] = [
  { id: 'ORIGINAL', label: 'Original' },
  { id: 'SQUARE', label: 'Square' },
  { id: 'PORTRAIT', label: 'Portrait' },
  { id: 'STORY', label: 'Story' },
  { id: 'LANDSCAPE', label: 'Landscape' },
];
const OVERLAYS: { id: AiDesignOverlay | null; label: string }[] = [
  { id: null, label: 'None' },
  { id: 'white_price', label: 'Price strip' },
  { id: 'new_arrival', label: 'New arrival' },
  { id: 'logo_corner', label: 'Your logo' },
];

function Chip({
  label,
  active,
  disabled,
  onPress,
  primaryColor,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
  primaryColor: string;
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: !!disabled }}
      accessibilityLabel={label}
      className="mr-2 mb-2 rounded-full px-4 py-2"
      style={{
        backgroundColor: active ? primaryColor : '#ffffff',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text className="text-xs font-semibold" style={{ color: active ? '#ffffff' : '#231F48' }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

export default function AiDesignScreen() {
  const { primaryColor } = useTheme();
  const queryClient = useQueryClient();
  const [product, setProduct] = useState<ComposeProduct | null>(null);
  // Poster mode: an admin AI style was picked in the design picker; the server owns the prompt.
  const { template_id: templateId } = useLocalSearchParams<{ template_id?: string }>();
  const poster = !!templateId;
  const [headline, setHeadline] = useState('');
  const [offer, setOffer] = useState('');
  const [prompt, setPrompt] = useState('');
  const [format, setFormat] = useState<AiDesignFormat>('ORIGINAL');
  const [overlay, setOverlay] = useState<AiDesignOverlay | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const startedAt = useRef(0);

  const create = useMutation({
    mutationFn: () =>
      aiDesignsApi.create(
        poster
          ? {
              product_id: (product as ComposeProduct).id,
              template_id: templateId as string,
              ...(headline.trim() ? { custom_text: headline.trim() } : {}),
              ...(offer.trim() ? { offer_text: offer.trim() } : {}),
            }
          : {
              product_id: (product as ComposeProduct).id,
              prompt: prompt.trim(),
              format,
              overlay,
            },
      ),
    onSuccess: (res) => {
      startedAt.current = Date.now();
      setJobId(res.data.id);
    },
    onError: (err) => showError(err, 'Could not start the design. Try again.'),
  });

  const status = useQuery({
    queryKey: ['ai-design', jobId],
    queryFn: () => aiDesignsApi.get(jobId as string),
    enabled: jobId !== null,
    refetchInterval: (q) =>
      q.state.data?.data.status === 'PENDING' && Date.now() - startedAt.current < GIVE_UP_MS
        ? POLL_MS
        : false,
  });
  const result = status.data?.data;
  const waiting = jobId !== null && !status.isError && (!result || result.status === 'PENDING');
  const timedOut = waiting && Date.now() - startedAt.current >= GIVE_UP_MS;

  const mine = useQuery({
    queryKey: ['ai-design', 'mine', result?.status === 'READY' ? result.id : null],
    queryFn: () => aiDesignsApi.list(),
    staleTime: 30_000,
  });

  const reset = () => {
    queryClient.removeQueries({ queryKey: ['ai-design', jobId] });
    setJobId(null);
  };
  const post = (url: string) =>
    router.push({ pathname: '/social/create', params: { design_image: url } });

  return (
    <KeyboardScreen className="flex-1 bg-ink-50">
      <ScreenHeader title="AI design" subtitle="Describe the scene, we make the picture" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <Text className="text-sm font-bold mb-2 text-sand-900">1. Pick a product</Text>
        <ProductGridPicker
          maxItems={1}
          selected={product ? [product] : []}
          onToggle={(p: ComposeProduct) => setProduct((cur) => (cur?.id === p.id ? null : p))}
          selectedOrder={(id) => (product?.id === id ? 0 : null)}
        />

        {poster ? (
          <>
            <Text className="text-sm font-bold mt-5 mb-2 text-sand-900">2. Optional text</Text>
            <TextInput
              value={headline}
              onChangeText={setHeadline}
              maxLength={80}
              placeholder="Headline (e.g. Diwali Special)"
              accessibilityLabel="Headline text"
              className="rounded-xl bg-white px-3 py-3 text-sm mb-2"
            />
            <TextInput
              value={offer}
              onChangeText={setOffer}
              maxLength={80}
              placeholder="Offer (e.g. Flat 20% off)"
              accessibilityLabel="Offer text"
              className="rounded-xl bg-white px-3 py-3 text-sm"
            />
          </>
        ) : (
          <>
            <Text className="text-sm font-bold mt-5 mb-2 text-sand-900">2. Describe the scene</Text>
            <TextInput
              value={prompt}
              onChangeText={setPrompt}
              maxLength={300}
              multiline
              placeholder="e.g. Warm Diwali evening, soft diya glow, festive bokeh"
              accessibilityLabel="Describe the design"
              className="rounded-xl bg-white px-3 py-3 text-sm min-h-[84px]"
              style={{ textAlignVertical: 'top' }}
            />
            <Text className="text-[11px] text-sand-400 mt-1">
              Describe a setting or mood. No links, brand names or people. The AI never draws text;
              add a price or your logo below.
            </Text>

            <Text className="text-sm font-bold mt-5 mb-2 text-sand-900">3. Finish (optional)</Text>
            <View className="flex-row flex-wrap">
              {FORMATS.map((f) => (
                <Chip
                  key={f.id}
                  label={f.label}
                  active={overlay === null && format === f.id}
                  disabled={overlay !== null}
                  onPress={() => setFormat(f.id)}
                  primaryColor={primaryColor}
                />
              ))}
            </View>
            <View className="flex-row flex-wrap">
              {OVERLAYS.map((o) => (
                <Chip
                  key={o.label}
                  label={o.label}
                  active={overlay === o.id}
                  onPress={() => setOverlay(o.id)}
                  primaryColor={primaryColor}
                />
              ))}
            </View>
            {overlay !== null ? (
              <Text className="text-[11px] text-sand-400">
                An overlay is drawn on a 4:5 picture.
              </Text>
            ) : null}
          </>
        )}

        <View className="mt-4">
          <GradientButton
            label="Make AI design"
            onPress={() => create.mutate()}
            loading={create.isPending || (waiting && !timedOut)}
            disabled={!product || (!poster && prompt.trim().length < 5) || jobId !== null}
          />
        </View>

        {waiting && !timedOut ? (
          <View className="items-center py-6 gap-2">
            <ActivityIndicator color={primaryColor} />
            <Text className="text-xs text-sand-400">Making your design… about a minute.</Text>
          </View>
        ) : null}

        {timedOut || result?.status === 'FAILED' || status.isError ? (
          <View className="mt-4">
            <Text className="text-sm text-sand-900 text-center">
              {timedOut
                ? 'This is taking longer than usual. Check "My AI designs" below in a minute.'
                : (result?.error ?? 'The design could not be made. Please try again.')}
            </Text>
            <View className="mt-3">
              <GradientButton label="Try again" onPress={reset} />
            </View>
          </View>
        ) : null}

        {result?.status === 'READY' && result.image_url ? (
          <View className="mt-5">
            <Image
              source={{ uri: result.image_url }}
              className="w-full rounded-2xl bg-sand-100"
              style={{ aspectRatio: 4 / 5 }}
              resizeMode="contain"
              accessibilityLabel="AI design preview"
            />
            <ReportAiContent feature="AI custom design" contentRef={result.id} />
            <View className="mt-2">
              <GradientButton
                label="Post this design"
                onPress={() => post(result.image_url as string)}
              />
            </View>
            <AnimatedPressable
              onPress={reset}
              accessibilityRole="button"
              className="items-center py-3"
            >
              <Text className="text-sm font-semibold text-sand-900">Make another</Text>
            </AnimatedPressable>
          </View>
        ) : null}

        {(mine.data?.data.length ?? 0) > 0 ? (
          <View className="mt-6">
            <Text className="text-sm font-bold mb-2 text-sand-900">My AI designs</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {mine.data?.data.map((d) =>
                d.image_url ? (
                  <AnimatedPressable
                    key={d.id}
                    onPress={() => post(d.image_url as string)}
                    accessibilityRole="button"
                    accessibilityLabel={`Post AI design: ${d.prompt}`}
                    className="mr-3 w-28"
                  >
                    <Image
                      source={{ uri: d.image_url }}
                      className="h-36 w-28 rounded-2xl bg-sand-100"
                      resizeMode="cover"
                    />
                    <Text className="text-[10px] mt-1 text-sand-400" numberOfLines={2}>
                      {d.prompt}
                    </Text>
                  </AnimatedPressable>
                ) : null,
              )}
            </ScrollView>
            <Text className="text-[11px] text-sand-400 mt-3 mb-1">
              Reuse a prompt on another product
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {mine.data?.data.map((d) =>
                d.image_url ? (
                  <Chip
                    key={d.id}
                    label={d.prompt.length > 28 ? `${d.prompt.slice(0, 28)}…` : d.prompt}
                    active={prompt === d.prompt}
                    onPress={() => setPrompt(d.prompt)}
                    primaryColor={primaryColor}
                  />
                ) : null,
              )}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardScreen>
  );
}
