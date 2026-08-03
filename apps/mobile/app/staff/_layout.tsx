import { Stack } from 'expo-router'
import { COLORS } from '@kanchuki/shared'

export default function StaffLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: '#ffffff' },
        headerTintColor: COLORS.charcoal,
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="retailer-onboard" options={{ presentation: 'modal', headerShown: false }} />
    </Stack>
  )
}
