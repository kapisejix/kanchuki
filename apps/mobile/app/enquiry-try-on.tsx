import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  FlatList,
  Linking,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import { Image } from 'expo-image'
import { Camera, Check, ImagePlus, RotateCcw, Square, X } from 'lucide-react-native'
import { TRY_ON_CONSENT } from '@kanchuki/shared'

import { billingApi, productApi } from '../src/lib/api'
import { useScreenInsets } from '../src/lib/safe-area'
import {
  cleanupSession,
  loadBuyablePacks,
  planSession,
  runTryOnSession,
  setSessionKeepAwake,
  shouldKeepAwake,
  type SessionItem,
} from '../src/lib/try-on-session'
import { GradientButton } from '../src/components/GradientButton'
import { AnimatedPressable } from '../src/components/AnimatedPressable'
import { TryOnConsent } from '../src/components/TryOnConsent'

// F-044 R2 — "Try on with customer": one wearer photo, N products from an
// enquiry, results shown to the customer on this phone only. The wearer photo
// and every generated picture are deleted on EVERY way out of this screen
// (see `exit`). No Share button by design. Route params carry product ids and
// names only — never the customer's phone or name.
//
// Keep-awake is held while running / showing results (see the effect below).
type Step = 'preflight' | 'capture' | 'consent' | 'running' | 'gallery'
type Product = { id: string; name: string }

export default function EnquiryTryOnScreen() {
  const { insets } = useScreenInsets()
  const { width } = useWindowDimensions()
  const params = useLocalSearchParams<{ productIds?: string; productNames?: string }>()

  const products = useMemo<Product[]>(() => {
    const ids = (params.productIds ?? '').split(',').filter(Boolean)
    let names: unknown = []
    try {
      names = JSON.parse(params.productNames ?? '[]')
    } catch {
      names = []
    }
    return ids.map((id, i) => ({
      id,
      name: Array.isArray(names) && typeof names[i] === 'string' ? (names[i] as string) : 'Product',
    }))
  }, [params.productIds, params.productNames])

  const [step, setStep] = useState<Step>('preflight')
  const [remaining, setRemaining] = useState<number | null>(null)
  const [quotaError, setQuotaError] = useState(false)
  // 403/404 on the quota read = this role (catalog / support delegate) or this
  // store cannot use try-on at all; Retry can never succeed, so say so instead.
  const [unavailable, setUnavailable] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [items, setItems] = useState<SessionItem[]>([])
  const [permission, requestPermission] = useCameraPermissions()
  const cameraRef = useRef<CameraView>(null)

  // Everything exit() must delete, kept in refs so the unmount/AppState/back
  // handlers (registered once) always see the latest values.
  const photoUris = useRef<string[]>([])
  const jobIds = useRef(new Set<string>())
  const abort = useRef(new AbortController())
  const exited = useRef(false)
  const picking = useRef(false) // gallery picker / permission dialog can background the app
  const runningRef = useRef(false) // sync double-tap guard (RC-015)
  const itemsRef = useRef<SessionItem[]>([])
  const stepRef = useRef<Step>('preflight')
  stepRef.current = step

  // Screen stays on while a session runs or results show; always released on
  // step change / unmount. Failures are swallowed inside setSessionKeepAwake.
  const awake = shouldKeepAwake(step)
  useEffect(() => {
    if (!awake) return
    void setSessionKeepAwake(true)
    return () => {
      void setSessionKeepAwake(false)
    }
  }, [awake])

  const loadQuota = useCallback(async () => {
    try {
      const { data } = await productApi.getTryOnQuota()
      const left = data.unlimited ? products.length : Math.max(0, data.remaining)
      setRemaining(left)
      setQuotaError(false)
      setSelected(planSession(products, left).run.map((p) => p.id))
      return left
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status === 403 || status === 404) setUnavailable(true)
      else setQuotaError(true)
      return null
    }
  }, [products])

  useEffect(() => {
    void loadQuota()
  }, [loadQuota])

  // T6: top-up packs the admin has switched on; [] hides the button.
  const [packs, setPacks] = useState<{ id: string; label: string; price_paise: number }[]>([])
  const [buying, setBuying] = useState(false)
  const buyingRef = useRef(false) // sync double-tap guard (RC-015)
  useEffect(() => {
    void loadBuyablePacks().then(setPacks)
  }, [])
  // Back from the payment page: re-read the balance (credit lands via callback).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && stepRef.current === 'preflight') void loadQuota()
    })
    return () => sub.remove()
  }, [loadQuota])

  const buyMore = async (packId: string) => {
    if (buyingRef.current) return
    buyingRef.current = true
    setBuying(true)
    try {
      const { data } = await billingApi.addonCheckout('TRY_ON_GENERATION', undefined, packId)
      await Linking.openURL(data.checkout_url)
    } catch {
      Alert.alert('Could not open payment', 'Please try again in a moment.')
    } finally {
      buyingRef.current = false
      setBuying(false)
    }
  }

  // Idempotent: abort first, delete files + discard results, clear image cache.
  const exit = useCallback(async () => {
    if (exited.current) return
    exited.current = true
    abort.current.abort()
    await cleanupSession({ photoUris: photoUris.current, jobIds: [...jobIds.current] })
    try {
      await Image.clearDiskCache()
      await Image.clearMemoryCache()
    } catch {
      // best effort
    }
  }, [])

  const leave = useCallback(() => {
    router.back()
    void exit()
  }, [exit])

  const close = useCallback(() => {
    const hasResults = stepRef.current === 'running' || itemsRef.current.some((i) => i.state === 'ready')
    if (!hasResults) return leave()
    Alert.alert('Leave try-on?', 'Pictures are deleted when you leave.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: leave },
    ])
  }, [leave])

  // Unmount, hardware back, and app-to-background all funnel into exit().
  useEffect(() => {
    // StrictMode re-runs effects: start each setup from a live state.
    exited.current = false
    abort.current = new AbortController()
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      close()
      return true
    })
    const appState = AppState.addEventListener('change', (s) => {
      // Nothing to clean unless a photo or results exist.
      const hasData =
        photoUris.current.length > 0 || jobIds.current.size > 0 || itemsRef.current.length > 0
      if (s === 'background' && !picking.current && !exited.current && hasData) leave()
    })
    return () => {
      back.remove()
      appState.remove()
      void exit()
    }
  }, [close, leave, exit])

  const trackPhoto = (uri: string) => {
    if (exited.current) {
      // Arrived after exit (e.g. compress finished late): delete right away.
      void cleanupSession({ photoUris: [uri], jobIds: [] })
      return
    }
    if (!photoUris.current.includes(uri)) photoUris.current.push(uri)
  }

  const takePhoto = (uri: string) => {
    trackPhoto(uri)
    setPhotoUri(uri)
    setStep('consent')
  }

  const handleCapture = async () => {
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.85 })
    if (photo?.uri) takePhoto(photo.uri)
  }

  const askCamera = async () => {
    picking.current = true
    try {
      await requestPermission()
    } finally {
      picking.current = false
    }
  }

  const handlePickFromGallery = async () => {
    picking.current = true
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 })
      if (!r.canceled && r.assets[0]) takePhoto(r.assets[0].uri)
    } finally {
      picking.current = false
    }
  }

  // Decline: delete the photo (cleanup only touches app-cache URIs), back to
  // capture, zero API calls.
  const decline = () => {
    if (photoUri) {
      photoUris.current = photoUris.current.filter((u) => u !== photoUri)
      void cleanupSession({ photoUris: [photoUri], jobIds: [] })
    }
    setPhotoUri(null)
    setStep('capture')
  }

  const onItem = useCallback((i: SessionItem) => {
    if (i.jobId) {
      jobIds.current.add(i.jobId)
      if (exited.current) {
        // Created after exit cleanup ran: discard this id right away.
        void cleanupSession({ photoUris: [], jobIds: [i.jobId] })
      }
    }
    if (exited.current) return
    const next = [...itemsRef.current]
    const idx = next.findIndex((x) => x.productId === i.productId)
    if (idx >= 0) next[idx] = i
    else next.push(i)
    itemsRef.current = next
    setItems(next)
  }, [])

  const run = useCallback(
    async (list: Product[]) => {
      if (!photoUri || list.length === 0 || runningRef.current) return
      runningRef.current = true
      try {
        setStep('running')
        await runTryOnSession({
          products: list,
          photoUri,
          consentVersion: TRY_ON_CONSENT.version,
          onItem,
          signal: abort.current.signal,
          onCompressed: trackPhoto,
        })
        if (exited.current) return
        setStep('gallery')
        void loadQuota()
      } finally {
        runningRef.current = false
      }
    },
    [photoUri, onItem, loadQuota],
  )

  const toggle = (id: string) =>
    setSelected((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        : cur.length < (remaining ?? 0)
          ? [...cur, id]
          : cur,
    )

  const retry = (productId: string) => {
    const p = products.find((x) => x.id === productId)
    if (p) void run([p])
  }

  // Packs expire at month end (credit lands on this month's counter).
  const buyButtons =
    packs.length > 0 ? (
      <View className="mt-4 gap-2">
        {packs.map((p) => (
          <GradientButton
            key={p.id}
            variant="web"
            label={`Buy more try-ons: ${p.label} - Rs ${p.price_paise % 100 === 0 ? p.price_paise / 100 : (p.price_paise / 100).toFixed(2)}`}
            disabled={buying}
            onPress={() => void buyMore(p.id)}
          />
        ))}
        <Text className="text-white/60 text-xs text-center">Valid for this month only.</Text>
      </View>
    ) : null

  return (
    <View className="flex-1 bg-black" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <View className="flex-1">
          <Text className="text-white text-sm font-bold">Try on with customer</Text>
          {remaining != null && step !== 'preflight' && (
            <Text className="text-white/60 text-xs mt-0.5">{remaining} try-ons left this month</Text>
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

      {step === 'preflight' && (
        <View className="flex-1 px-5">
          {remaining == null ? (
            unavailable ? (
              <Text className="text-white text-sm text-center mt-10">
                Try-on is not available for your account. Ask the store owner.
              </Text>
            ) : quotaError ? (
              <View className="items-center mt-10">
                <Text className="text-white text-sm text-center">Could not check your try-on balance.</Text>
                <View className="mt-4 w-full">
                  <GradientButton variant="web" label="Retry" onPress={() => void loadQuota()} />
                </View>
              </View>
            ) : (
              <ActivityIndicator color="#fff" className="mt-10" />
            )
          ) : remaining === 0 ? (
            <>
              <Text className="text-white text-base font-semibold text-center mt-10">
                You have used all your try-ons for this month.
              </Text>
              {buyButtons}
            </>
          ) : (
            <>
              <Text className="text-white text-base font-semibold">
                {products.length} {products.length === 1 ? 'try-on' : 'try-ons'} · {remaining} left this month
              </Text>
              {remaining < products.length && (
                <Text className="text-white/60 text-xs mt-1">
                  Pick up to {remaining} to try on.
                </Text>
              )}
              {remaining < products.length && buyButtons}
              <View className="mt-4 gap-2">
                {products.map((p) => {
                  const on = selected.includes(p.id)
                  return (
                    <AnimatedPressable
                      key={p.id}
                      onPress={() => toggle(p.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={p.name}
                      className="flex-row items-center gap-3 p-3 rounded-2xl bg-white/10"
                    >
                      {on ? <Check size={18} color="#fff" /> : <Square size={18} color="#fff" />}
                      <Text className="text-white text-sm flex-1" numberOfLines={1}>
                        {p.name}
                      </Text>
                    </AnimatedPressable>
                  )
                })}
              </View>
              <View className="mt-5">
                <GradientButton
                  variant="web"
                  label="Continue to photo"
                  disabled={selected.length === 0}
                  onPress={() => setStep('capture')}
                />
              </View>
            </>
          )}
        </View>
      )}

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
                <GradientButton variant="web" label="Allow camera" onPress={() => void askCamera()} />
              </View>
            </View>
          )}
          <Text className="text-white/60 text-xs text-center pt-3">
            Full-length photo, head to toe, customer standing straight.
          </Text>
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
            onAccept={() => void run(products.filter((p) => selected.includes(p.id)))}
            onDecline={decline}
          />
        </View>
      )}

      {step === 'running' && (
        <View className="flex-1 px-5 pt-4">
          <Text className="text-white text-base font-semibold">Making the pictures…</Text>
          <Text className="text-white/60 text-xs mt-1">
            About a minute. Keep this screen open.
          </Text>
          <View className="mt-4 gap-2">
            {items.map((i) => (
              <View key={i.productId} className="flex-row items-center gap-3 p-3 rounded-2xl bg-white/10">
                {i.state === 'running' || i.state === 'queued' ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : i.state === 'ready' ? (
                  <Check size={18} color="#34d399" />
                ) : (
                  <X size={18} color="#f87171" />
                )}
                <View className="flex-1">
                  <Text className="text-white text-sm" numberOfLines={1}>
                    {i.name}
                  </Text>
                  <Text className="text-white/60 text-xs" numberOfLines={2}>
                    {i.state === 'failed' ? (i.error ?? 'Failed') : i.state}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {step === 'gallery' && (
        <View className="flex-1">
          <FlatList
            data={items}
            keyExtractor={(i) => i.productId}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            renderItem={({ item: i }) => (
              <View style={{ width }} className="flex-1 px-5 items-center justify-center">
                <Text className="text-white text-sm font-bold mb-3" numberOfLines={1}>
                  {i.name}
                </Text>
                {i.state === 'ready' && i.url ? (
                  <Image
                    source={{ uri: i.url }}
                    // Never write the presigned result to the phone's disk cache.
                    cachePolicy="none"
                    style={{ width: '100%', flex: 1, borderRadius: 20 }}
                    contentFit="contain"
                  />
                ) : (
                  <View className="flex-1 items-center justify-center">
                    <Text className="text-white text-base font-semibold text-center">
                      {i.state === 'discarded'
                        ? 'This picture was deleted.'
                        : (i.error ?? 'The try-on could not be generated.')}
                    </Text>
                    {i.state === 'failed' && (
                      <>
                        <Text className="text-white/60 text-xs text-center mt-2">
                          Trying again uses one more try-on from your monthly balance.
                        </Text>
                        <View className="mt-4 w-full">
                          <GradientButton
                            variant="web"
                            label="Try again"
                            icon={<RotateCcw size={16} color="#fff" />}
                            onPress={() => retry(i.productId)}
                          />
                        </View>
                      </>
                    )}
                  </View>
                )}
              </View>
            )}
          />
          <Text className="text-white/60 text-xs text-center py-3">
            Swipe for more · Pictures are deleted when you leave
          </Text>
        </View>
      )}
    </View>
  )
}
