import { Alert } from 'react-native'
import type { PinReview } from './pin-check'

/**
 * Shows where the pin landed and lets the retailer keep or clear it. Nothing to show (no
 * reverse-geocode result) → no dialog; the pin simply stays. Never blocks saving.
 */
export function showPinReview(review: PinReview | null, onClear: () => void): void {
  if (!review || (!review.address && !review.warning)) return
  const lines = [
    review.address ? `Your pin is near:\n${review.address}` : '',
    review.warning ?? '',
    'Is this your shop?',
  ].filter(Boolean)
  Alert.alert('Confirm your shop location', lines.join('\n\n'), [
    { text: 'Use this pin', style: 'default' },
    { text: 'Clear pin', style: 'destructive', onPress: onClear },
  ])
}
