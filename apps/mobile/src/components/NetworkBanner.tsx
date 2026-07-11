import { useState, useEffect, useRef } from 'react'
import { View, Text, Animated, Platform } from 'react-native'
import { onlineManager } from '@tanstack/react-query'
import { WifiOff } from 'lucide-react-native'

/**
 * Shows a subtle "offline" banner at the top of the screen when the device
 * has no network connectivity. Auto-hides when reconnected.
 *
 * Uses @tanstack/react-query's built-in onlineManager which detects
 * connectivity via fetch() failures (no extra native dependency needed).
 */
export function NetworkBanner() {
  const [isOnline, setIsOnline] = useState(true)
  const slideAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    // onlineManager fires on every online/offline transition detected
    // by react-query (wraps fetch's online detection)
    const unsubscribe = onlineManager.subscribe((online) => {
      setIsOnline(online)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isOnline ? 0 : 1,
      duration: 300,
      useNativeDriver: true,
    }).start()
  }, [isOnline, slideAnim])

  if (isOnline) return null

  return (
    <Animated.View
      className="absolute top-0 left-0 right-0 z-50"
      style={{
        transform: [
          {
            translateY: slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [-40, 0],
            }),
          },
        ],
      }}
      pointerEvents="none"
    >
      <View className="flex-row items-center justify-center gap-2 px-4 py-2 bg-amber-500">
        <WifiOff size={14} color="white" />
        <Text className="text-white text-xs font-medium">
          {Platform.OS === 'web'
            ? 'No internet connection'
            : "You're offline — showing cached data"}
        </Text>
      </View>
    </Animated.View>
  )
}
