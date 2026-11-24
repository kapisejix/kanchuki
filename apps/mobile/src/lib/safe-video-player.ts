import { requireNativeModule, useReleasingSharedObject } from 'expo-modules-core';
import type { VideoPlayer, VideoSource } from 'expo-video';

// Native constructor arity differs between installed expo-video builds (1 or 2 args).
type VideoPlayerCtor = new (source: VideoSource, useSynchronousUpdates?: boolean) => VideoPlayer;
// useReleasingSharedObject is typed to require a non-null SharedObject; this factory may return null.
type ReleasingFactory = (factory: () => VideoPlayer | null, deps: unknown[]) => VideoPlayer | null;

let NativeVideoModule: { VideoPlayer?: VideoPlayerCtor } | null = null;
try {
  NativeVideoModule = requireNativeModule('ExpoVideo');
} catch (e) {
  console.warn('[video] ExpoVideo native module not available:', e);
}

function parseSource(source: VideoSource) {
  if (typeof source === 'string') {
    return { uri: source };
  }
  return source;
}

export function useSafeVideoPlayer(
  source: VideoSource,
  setup?: (player: VideoPlayer) => void,
): VideoPlayer | null {
  const parsedSource = parseSource(source);
  try {
    const player = (useReleasingSharedObject as unknown as ReleasingFactory)(() => {
      const Ctor = NativeVideoModule?.VideoPlayer;
      if (!Ctor) return null;
      let p: VideoPlayer | null = null;
      try {
        // 1-arg constructor (matches installed native Expo Video Android build)
        p = new Ctor(parsedSource);
      } catch {
        try {
          // 3-arg constructor (matches newer expo-video versions)
          p = new Ctor(parsedSource, false);
        } catch (err) {
          console.warn('[video] Failed to construct VideoPlayer:', err);
          return null;
        }
      }
      if (p) {
        try {
          setup?.(p);
        } catch (e) {
          console.warn('[video] Error in player setup callback:', e);
        }
      }
      return p;
    }, [JSON.stringify(parsedSource)]);

    return player;
  } catch (err) {
    console.warn('[video] useSafeVideoPlayer failed:', err);
    return null;
  }
}
