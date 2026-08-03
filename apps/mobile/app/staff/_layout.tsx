import { Stack } from 'expo-router'
import { useTheme } from '../../src/lib/theme'

export default function StaffLayout() {
  const { colors } = useTheme()
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: colors.cotton },
        headerTintColor: colors.charcoal,
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="retailer-onboard" options={{ presentation: 'modal', headerShown: false }} />
    </Stack>
  )
}
