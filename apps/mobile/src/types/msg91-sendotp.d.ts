// Ambient types for @msg91comm/sendotp-react-native.
//
// The package ships RAW TypeScript source (package.json "main": "index.ts")
// that fails this project's strict typecheck (implicit-any params in its
// api.service.ts and JSX errors in DefaultWidget.tsx under @types/react 19).
// tsconfig "paths" maps the bare specifier to this declaration so TypeScript
// type-checks against it, while Metro still bundles the real native package.
// Only the surface this app uses is declared — everything is a Promise since
// the SDK's responses are untyped `any` (defensive parsing in msg91-otp.ts).
declare module '@msg91comm/sendotp-react-native' {
  export const OTPWidget: {
    initializeWidget(widgetId: string, tokenAuth: string): Promise<void>
    sendOTP(body: { identifier: string; [key: string]: unknown }): Promise<unknown>
    verifyOTP(body: { reqId: string; otp?: string; [key: string]: unknown }): Promise<unknown>
    retryOTP(body: { reqId: string; retryChannel?: number; [key: string]: unknown }): Promise<unknown>
    getWidgetProcess(): Promise<unknown>
  }

  export const BiometricAuth: {
    isSensorAvailable(): Promise<{ available: boolean; biometryType?: string; error?: string }>
    authenticate(): Promise<string>
    getBiometricType(): Promise<string>
    simplePrompt(options: {
      promptMessage: string
      fallbackPromptMessage?: string
      cancelButtonText?: string
      allowDeviceCredentials?: boolean
    }): Promise<{ success: boolean; error?: string }>
    cancelAuthentication(): Promise<string>
  }

  export const BiometryTypes: Record<string, string>
  export const DefaultWidget: unknown
}
