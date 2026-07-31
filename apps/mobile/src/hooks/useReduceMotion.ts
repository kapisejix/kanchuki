import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/** Tracks the system Reduce Motion setting so decorative animation can be skipped. */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion)
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    return () => sub.remove()
  }, [])

  return reduceMotion
}
