import { Alert } from 'react-native'
import { ApiError } from './api/api-error'

// 4xx carries a user-actionable server message (e.g. 422 invalid GSTIN). 401, 408 (its message
// holds the request URL), 5xx and network failures (status 0) stay generic.
export function apiMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError &&
    err.status >= 400 &&
    err.status < 500 &&
    err.status !== 401 &&
    err.status !== 408
    ? err.message
    : fallback
}

// Generic message to the user, real error to the dev console only (__DEV__ strips in
// production builds) — never surface raw err.message on screen.
export function showError(
  err: unknown,
  fallback: string,
  title = 'Error',
  onDismiss?: () => void,
): void {
  if (__DEV__) console.error(title, err)
  Alert.alert(title, fallback, onDismiss ? [{ text: 'OK', onPress: onDismiss }] : undefined)
}

// For inline UI error text (no Alert) — same rule: log the real error dev-side only,
// caller supplies the generic string to render.
export function logError(err: unknown, context = 'Error'): void {
  if (__DEV__) console.error(context, err)
}
