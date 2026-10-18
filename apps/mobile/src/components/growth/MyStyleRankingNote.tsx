import { Sparkles } from 'lucide-react-native';
import { Text, View } from 'react-native';

/**
 * F-045 PR-8 T19: tells a retailer how shoppers' "My Style" feed picks stores. Plain
 * language on purpose - no weights (they are admin-tunable and will change) and no promise
 * of position. The two claims that matter to a retailer are the fairness ones: no plan can
 * buy rank, and one big store cannot crowd out the rest.
 */
export const MY_STYLE_RANKING_POINTS = [
  'Products that suit the shopper’s colours, budget, size and occasion come first.',
  'Nearby stores rank a little higher; good ratings and new arrivals help.',
  'No plan or payment buys a better position, and no store can fill more than 3 of a shopper’s first 12 picks.',
  'Only available products from active stores with a public store link are shown.',
] as const;

export function MyStyleRankingNote() {
  return (
    <View
      className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm mt-5"
      accessibilityLabel="How My Style ranks stores"
    >
      <View className="flex-row items-center gap-2 mb-2">
        <Sparkles size={18} color="#BB3F95" />
        <Text className="text-sm font-bold text-spaceCadet-900">How My Style ranks your store</Text>
      </View>
      {MY_STYLE_RANKING_POINTS.map((point) => (
        <Text key={point} className="text-xs text-heliotrope-500 mt-1 leading-relaxed font-medium">
          {`• ${point}`}
        </Text>
      ))}
    </View>
  );
}
