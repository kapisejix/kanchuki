import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Share, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import { Image } from 'expo-image'
import { Camera, ImagePlus, RotateCcw, Share2, X } from 'lucide-react-native'
import { TRY_ON_CONSENT } from '@kanchuki/shared'

import { productApi, ApiError } from '../../src/lib/api'
import { pollWithBackoff } from '../../src/lib/polling'
import { useScreenInsets } from '../../src/lib/safe-area'
import { GradientButton } from '../../src/components/GradientButton'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { TryOnConsent } from '../../src/components/TryOnConsent'

// F-039 Phase 2 — in-store virtual try-on (retailer app).
//
// The walk-in flow: photograph the customer, show the consent screen, generate,
// show the result. The consent text is imported from `@kanchuki/shared` (see
// TryOnConsent) and its version is sent on the request — the API refuses a
// try-on with no version, so this screen is what satisfies that gate. The whole
// entry point is hidden unless the retailer's plan has VIRTUAL_TRY_ON_V2, but
// that is a convenience: the route 404s without the flag regardless.
type Step = 'capture' | 'consent' | 'processing' | 'result'

export default function TryOnScreen() {
  const { insets } = useScreenInsets()
  const params = useLocalSearchParams<{
    productId: string
    productName?: string
    photo?: string
  }>()
  const productId = params.productId

  const [step, setStep] = useState<Step>('capture')
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [permission, requestPermission] = useCameraPermissions()
  const cameraRef = useRef<CameraView>(null)
  // Kept in a ref so the poll effect can clear it on unmount without needing
  // the job id to be state (the effect below owns the whole lifecycle).
  const stopPollRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      stopPollRef.current?.()
    }
  }, [])

  const handleCapture = async () => {
    if (!cameraRef.current) return
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 })
    if (!photo?.uri) return
    setPhotoUri(photo.uri)
    setStep('consent')
  }

  const handlePickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    })
    if (result.canceled || !result.assets[0]) return
    setPhotoUri(result.assets[0].uri)
    setStep('consent')
  }

  // Runs only after the consent screen's accept — the version sent here is the
  // one the customer just read, and it is what the API records.
  const handleAccept = useCallback(async () => {
    if (!photoUri) return
    setError(null)
    setStep('processing')

    try {
      const { data } = await productApi.startTryOn(productId, TRY_ON_CONSENT.version, photoUri)
      stopPollRef.current = pollWithBackoff({
        onPoll: async () => {
          try {
            const status = await productApi.getTryOnStatus(productId, data.job_id)
            if (status.data.status === 'ready' && status.data.url) {
              setResultUrl(status.data.url)
              setStep('result')
              return true
            }
            if (status.data.status === 'failed') {
              setError(status.data.error ?? 'The try-on could not be generated. Please try again.')
              setStep('result')
              return true
            }
            if (status.data.status === 'withdrawn') {
              // The shopper took their consent back mid-run and the stored
              // image was deleted. Terminal — do not keep polling.
              setError('This try-on was withdrawn and its picture deleted.')
              setStep('result')
              return true
            }
            return false
          } catch (err) {
            // A lapsed session is terminal, not transient: every retry re-sends
            // the same dead token and comes back 401. Swallowed by the generic
            // catch below it would spin for up to ~14 minutes (60 attempts,
            // backoff to 16s) while `client.ts`'s global handler is already
            // routing to /auth/phone — the same shape the web sheet had, fixed
            // the same way: keyed on the status, never quoting the message.
            if (err instanceof ApiError && err.status === 401) {
              setError('Your sign-in has expired. Sign in again to continue.')
              setStep('result')
              return true
            }
            // Anything else IS transient — keep polling rather than failing a
            // job that may still be running.
            return false
          }
        },
      })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PLAN_LIMIT_EXCEEDED') {
        setError('You have used all your try-ons for this period. Upgrade your plan to continue.')
      } else if (err instanceof ApiError && err.code === 'CUSTOMER_LIMIT_EXCEEDED') {
        setError('This customer has reached their try-on limit for now.')
      } else if (err instanceof ApiError && err.status === 401) {
        // Keyed on the STATUS, not the message, because the API words a 401
        // three different ways: 'Missing Bearer token' and 'Invalid or expired
        // token' from the auth plugin, plus the route's own 'Sign in to try on
        // this outfit.' — that last one is written for a shopper on the
        // customer PWA and is nonsense on a retailer's phone. All three mean
        // one thing here: the store's session is gone.
        //
        // Nothing to offer a fix button for either — `client.ts` has already
        // spent its one refresh and, failing that, is routing to /auth/phone.
        // So this screen only has to say what happened without quoting the
        // server.
        setError('Your sign-in has expired. Sign in again to continue.')
      } else {
        setError(err instanceof Error ? err.message : 'Could not start the try-on. Please try again.')
      }
      setStep('result')
    }
  }, [photoUri, productId])

  const handleShare = async () => {
    if (!resultUrl) return
    await Share.share({ message: resultUrl }).catch(() => undefined)
  }

  const reset = () => {
    stopPollRef.current?.()
    stopPollRef.current = null
    setPhotoUri(null)
    setResultUrl(null)
    setError(null)
    setStep('capture')
  }

  const close = () => {
    stopPollRef.current?.()
    router.back()
  }

  return (
    <View className="flex-1 bg-black" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {/* Header — a plain close + the product name, over the camera view. */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <View className="flex-1">
          <Text className="text-white text-sm font-bold" numberOfLines={1}>
            {params.productName ?? 'Virtual Try-On'}
          </Text>
          {step === 'capture' && (
            <Text className="text-white/60 text-xs mt-0.5">
              Photograph the customer, then accept the consent.
            </Text>
          )}
        </View>
        <AnimatedPressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close try-on"
          className="w-9 h-9 rounded-full bg-white/10 items-center justify-center"
        >
          <X size={18} color="#fff" />
        </AnimatedPressable>
      </View>

      {step === 'capture' && (
        <View className="flex-1">
          {permission?.granted ? (
            <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
          ) : (
            <View className="flex-1 items-center justify-center px-8">
              <Camera size={36} color="#fff" />
              <Text className="text-white/80 text-sm text-center mt-3">
                Camera access is needed to photograph the customer.
              </Text>
              <View className="mt-4 w-full">
                <GradientButton label="Allow camera" onPress={() => void requestPermission()} />
              </View>
            </View>
          )}

          <View className="flex-row items-center justify-center gap-8 py-5">
            <AnimatedPressable
              onPress={() => void handlePickFromGallery()}
              accessibilityRole="button"
              accessibilityLabel="Choose a photo from the gallery"
              className="w-12 h-12 rounded-full bg-white/10 items-center justify-center"
            >
              <ImagePlus size={20} color="#fff" />
            </AnimatedPressable>
            <AnimatedPressable
              onPress={() => void handleCapture()}
              disabled={!permission?.granted}
              accessibilityRole="button"
              accessibilityLabel="Take the customer's photo"
              className={`w-20 h-20 rounded-full items-center justify-center border-4 border-white ${
                permission?.granted ? 'bg-white/20' : 'bg-white/5 opacity-40'
              }`}
            >
              <Camera size={26} color="#fff" />
            </AnimatedPressable>
            <View className="w-12 h-12" />
          </View>
        </View>
      )}

      {step === 'consent' && (
        <View className="flex-1 bg-white rounded-t-3xl overflow-hidden">
          <TryOnConsent
            onAccept={() => void handleAccept()}
            onDecline={reset}
          />
        </View>
      )}

      {step === 'processing' && (
        <View className="flex-1 items-center justify-center px-8">
          <ActivityIndicator size="large" color="#fff" />
          <Text className="text-white text-base font-semibold mt-4">
            Making the picture…
          </Text>
          <Text className="text-white/60 text-xs text-center mt-2">
            This usually takes 20–60 seconds. Keep this screen open.
          </Text>
        </View>
      )}

      {step === 'result' && (
        <View className="flex-1 items-center justify-center px-5">
          {resultUrl ? (
            <>
              <Image
                source={{ uri: resultUrl }}
                style={{ width: '100%', flex: 1, borderRadius: 20 }}
                contentFit="contain"
              />
              <View className="flex-row gap-3 mt-4 w-full">
                <View className="flex-1">
                  <GradientButton
                    label="Share"
                    icon={<Share2 size={16} color="#fff" />}
                    onPress={() => void handleShare()}
                  />
                </View>
                <View className="flex-1">
                  <GradientButton
                    label="Try another"
                    icon={<RotateCcw size={16} color="#fff" />}
                    onPress={reset}
                  />
                </View>
              </View>
            </>
          ) : (
            <>
              <Text className="text-white text-base font-semibold text-center">
                {error ?? 'Something went wrong.'}
              </Text>
              <View className="mt-4 w-full">
                <GradientButton label="Try again" onPress={reset} />
              </View>
            </>
          )}
        </View>
      )}
    </View>
  )
}
