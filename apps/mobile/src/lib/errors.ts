import { Alert } from 'react-native'

// Generic message to the user, real error to the dev console only (__DEV__ strips in
// production builds) — never surface raw err.message on screen.
export function showError(err: unknown, fallback: string, title = 'Error'): void {
  if (__DEV__) console.error(title, err)
  Alert.alert(title, fallback)
}

// For inline UI error text (no Alert) — same rule: log the real error dev-side only,
// caller supplies the generic string to render.
export function logError(err: unknown, context = 'Error'): void {
  if (__DEV__) console.error(context, err)
}
