import { FontAwesome6 } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { View } from 'react-native'

/** Real brand logos for integration cards (FontAwesome brand glyphs via @expo/vector-icons —
 * ships with Expo, works in Expo Go). White glyph on the brand-colour tile.
 */
export type Brand = 'instagram' | 'facebook' | 'whatsapp' | 'facebook-ads' | 'google-ads'

const BRANDS: Record<Brand, { glyph: string; bg: string }> = {
  instagram: { glyph: 'instagram', bg: '#DD2A7B' }, // tile is a gradient, bg = fallback
  facebook: { glyph: 'facebook-f', bg: '#1877F2' },
  whatsapp: { glyph: 'whatsapp', bg: '#25D366' },
  'facebook-ads': { glyph: 'meta', bg: '#0866FF' },
  'google-ads': { glyph: 'google', bg: '#4285F4' },
}

// Instagram's official gradient (bottom-left yellow → top-right purple).
const INSTAGRAM_GRADIENT = ['#FEDA75', '#FA7E1E', '#D62976', '#962FBF', '#4F5BD5'] as const

export function BrandIcon({ brand, size = 48 }: { brand: Brand; size?: number }) {
  const { glyph, bg } = BRANDS[brand]
  const tile = { width: size, height: size, borderRadius: Math.round(size * 0.33), alignItems: 'center', justifyContent: 'center' } as const
  const icon = (
    <FontAwesome6 name={glyph as never} brand size={Math.round(size * 0.5)} color="#FFFFFF" />
  )

  if (brand === 'instagram') {
    return (
      <LinearGradient
        colors={[...INSTAGRAM_GRADIENT]}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={tile}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {icon}
      </LinearGradient>
    )
  }
  return (
    <View
      style={{ ...tile, backgroundColor: bg }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {icon}
    </View>
  )
}
