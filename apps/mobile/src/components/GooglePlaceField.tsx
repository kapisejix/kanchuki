import { Search } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { retailerApi } from '../lib/api';
import { ApiError } from '../lib/api/client';
import { AnimatedPressable } from './AnimatedPressable';

type Hit = { place_id: string; name: string; address: string };

type Props = {
  /** Prefill for the search box (shop name + city). */
  defaultQuery?: string;
  /** Current saved id, if any. */
  placeId?: string | null;
  /** Called with the new id (or null once removed) after the server accepted it. */
  onChange?: (placeId: string | null) => void;
};

// Optional "Find your shop on Google" block (onboarding step 2 + Settings). The server
// validates and verifies every id, so a success here means the id is real. A missing
// Google key shows "not available yet" — never a fake result.
export function GooglePlaceField({ defaultQuery = '', placeId = null, onChange }: Props) {
  const [saved, setSaved] = useState<string | null>(placeId);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [query, setQuery] = useState(defaultQuery);
  const [pasted, setPasted] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchUnavailable, setSearchUnavailable] = useState(false);

  const save = async (value: string | null, name?: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await retailerApi.setGooglePlace(value);
      setSaved(res.google_place_id);
      setSavedName(value ? (name ?? null) : null);
      setHits(null);
      setPasted('');
      onChange?.(res.google_place_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const search = async () => {
    if (query.trim().length < 2 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await retailerApi.searchGooglePlace(query.trim());
      setHits(res.data);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NOT_CONFIGURED') setSearchUnavailable(true);
      else setError(e instanceof Error ? e.message : 'Search failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (saved) {
    return (
      <View className="bg-white border border-lavender-200 rounded-2xl p-4">
        <Text className="text-sm font-bold text-spaceCadet-900">Google listing linked ✓</Text>
        <Text className="text-[11px] text-heliotrope-500 mt-0.5 font-medium">
          {savedName ?? 'Customers can now be sent to review your shop on Google.'}
        </Text>
        {error && <Text className="text-xs text-red-600 mt-2">{error}</Text>}
        <AnimatedPressable
          onPress={() => void save(null)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Remove Google listing"
          className="mt-3 self-start py-2"
        >
          <Text className="text-xs font-bold text-heliotrope-600">Remove</Text>
        </AnimatedPressable>
      </View>
    );
  }

  return (
    <View className="bg-white border border-lavender-200 rounded-2xl p-4">
      <Text className="text-sm font-bold text-spaceCadet-900">Find your shop on Google</Text>
      <Text className="text-[11px] text-heliotrope-500 mt-0.5 font-medium">
        Optional. Lets you send happy customers to review you on Google.
      </Text>

      {searchUnavailable ? (
        <Text className="text-xs text-heliotrope-600 mt-3">
          Search is not available yet. You can paste your Place ID or Google Maps link below.
        </Text>
      ) : (
        <>
          <View className="flex-row items-center gap-2 mt-3">
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Shop name and city"
              placeholderTextColor="#928EB2"
              returnKeyType="search"
              onSubmitEditing={() => void search()}
              accessibilityLabel="Search your shop on Google"
              className="flex-1 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900"
              maxLength={120}
            />
            <AnimatedPressable
              onPress={() => void search()}
              disabled={busy || query.trim().length < 2}
              accessibilityRole="button"
              accessibilityLabel="Search"
              className="w-11 h-11 rounded-2xl bg-lavender-50 border border-lavender-200 items-center justify-center"
            >
              {busy ? (
                <ActivityIndicator size="small" color="#BB3F95" />
              ) : (
                <Search size={18} color="#560A39" />
              )}
            </AnimatedPressable>
          </View>

          {hits && hits.length === 0 && (
            <Text className="text-xs text-heliotrope-600 mt-3">
              Nothing found. Try the shop name with your city, or paste a link below.
            </Text>
          )}
          {hits?.map((h) => (
            <AnimatedPressable
              key={h.place_id}
              onPress={() => void save(h.place_id, h.name)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Use ${h.name}`}
              className="mt-2 border border-lavender-200 rounded-2xl p-3"
            >
              <Text className="text-sm font-bold text-spaceCadet-900">{h.name}</Text>
              <Text className="text-[11px] text-heliotrope-500 mt-0.5">{h.address}</Text>
            </AnimatedPressable>
          ))}
        </>
      )}

      <Text className="text-[11px] uppercase tracking-wider text-heliotrope-600 font-bold mt-4 mb-1.5">
        Or paste a Place ID / Google Maps link
      </Text>
      <View className="flex-row items-center gap-2">
        <TextInput
          value={pasted}
          onChangeText={setPasted}
          placeholder="ChIJ… or https://www.google.com/maps/…"
          placeholderTextColor="#928EB2"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Place ID or Google Maps link"
          className="flex-1 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm text-spaceCadet-900"
          maxLength={2000}
        />
        <AnimatedPressable
          onPress={() => void save(pasted.trim())}
          disabled={busy || pasted.trim().length < 20}
          accessibilityRole="button"
          accessibilityLabel="Use pasted Place ID"
          className="px-4 h-11 rounded-2xl bg-spaceCadet-900 items-center justify-center"
        >
          <Text className="text-white text-xs font-bold">Use</Text>
        </AnimatedPressable>
      </View>

      {error && <Text className="text-xs text-red-600 mt-3">{error}</Text>}
    </View>
  );
}
