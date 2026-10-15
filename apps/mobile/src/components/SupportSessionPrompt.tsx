import { useEffect, useRef } from 'react'
import { Alert, AppState } from 'react-native'
import { SUPPORT_SCOPE_LABEL, supportSessionApi } from '../lib/api/support-sessions'
import { showError } from '../lib/errors'

/**
 * Retailer-side consent prompt for a Kanchuki support session. Checks on mount
 * and every time the app returns to the foreground; a pending request becomes a
 * blocking Approve / Deny alert. Mount only for a real retailer login.
 */
export function SupportSessionPrompt() {
  const asked = useRef<string | null>(null)

  useEffect(() => {
    const check = async () => {
      try {
        const res = await supportSessionApi.list()
        const pending = res.data.find((r) => r.status === 'PENDING')
        if (!pending || asked.current === pending.id) return
        asked.current = pending.id

        const answer = (fn: (id: string) => Promise<unknown>) => () =>
          void fn(pending.id).catch((err) => showError(err, 'Could not send your answer'))

        Alert.alert(
          'Kanchuki support request',
          `${pending.staff_name} from Kanchuki wants to ${SUPPORT_SCOPE_LABEL[pending.scope]} in your account for up to 24 hours. You can end it any time in Settings.`,
          [
            { text: 'Deny', style: 'cancel', onPress: answer(supportSessionApi.deny) },
            { text: 'Approve', onPress: answer(supportSessionApi.approve) },
          ],
          { cancelable: false },
        )
      } catch {
        // Expected, not a swallowed bug: shop staff get 403 here and an offline
        // phone cannot be asked. No prompt is the correct outcome for both.
      }
    }

    void check()
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void check()
    })
    return () => sub.remove()
  }, [])

  return null
}
