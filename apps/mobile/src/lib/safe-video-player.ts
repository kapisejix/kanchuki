import { requireNativeModule, useReleasingSharedObject } from 'expo-modules-core'
import type { VideoPlayer, VideoSource } from 'expo-video'

let NativeVideoModule: any = null
try {
  NativeVideoModule = requireNativeModule('ExpoVideo')
} catch (e) {
  console.warn('[video] ExpoVideo native module not available:', e)
}

function parseSource(source: VideoSource) {
  if (typeof source === 'string') {
    return { uri: source }
  }
  return source
}

export function useSafeVideoPlayer(
  source: VideoSource,
  setup?: (player: VideoPlayer) => void,
): VideoPlayer | null {
  const parsedSource = parseSource(source)
  try {
    const player = (useReleasingSharedObject as any)(() => {
      if (!NativeVideoModule?.VideoPlayer) return null
      let p: any = null
      try {
        // 1-arg constructor (matches installed native Expo Video Android build)
        p = new (NativeVideoModule.VideoPlayer as any)(parsedSource)
      } catch {
        try {
          // 3-arg constructor (matches newer expo-video versions)
          p = new (NativeVideoModule.VideoPlayer as any)(parsedSource, false)
        } catch (err) {
          console.warn('[video] Failed to construct VideoPlayer:', err)
          return null
        }
      }
      if (p) {
        try {
          setup?.(p)
        } catch (e) {
          console.warn('[video] Error in player setup callback:', e)
        }
      }
      return p
    }, [JSON.stringify(parsedSource)])

    return player as VideoPlayer | null
  } catch (err) {
    console.warn('[video] useSafeVideoPlayer failed:', err)
    return null
  }
}
