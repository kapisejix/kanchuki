import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  Facebook,
  Images,
  Instagram,
  Link2,
  Send,
  XCircle,
} from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Linking, Modal, ScrollView, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'
import {
  CAROUSEL_CAP,
  ItemMediaStrip,
  PostPreview,
  PostTypePicker,
  ProductMultiPicker,
  TargetChecklist,
  TemplatePicker,
  toComposeProduct,
} from '../../src/components/social'
import type { ComposeMedia, ComposeProduct } from '../../src/components/social/types'
import { collectionApi, productApi, retailerApi, socialApi } from '../../src/lib/api'
import type {
  CreateSocialPostInput,
  PostTemplateInfo,
  SocialAccountInfo,
  SocialLinkType,
  SocialPostComposeType,
  SocialPostTargetResult,
} from '../../src/lib/api/social'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'
import { WEB_URL } from '../../src/lib/web-url'

interface CollectionSummary {
  id: string
  title: string
  slug: string
  url: string
  status: string
  product_count: number
}

interface DeepIntent {
  productIds: string[]
  collectionId: string | null
  photoId: string | null
  videoId: string | null
}

/** Client-generated uuid for retry dedupe (R-13). crypto.randomUUID isn't
 * guaranteed on Hermes; a random v4-shaped id is enough — the server marker
 * only needs to distinguish retries of the same tap. */
function newClientPostId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// ── Template caption prefill (T-9.6) ─────────────────────────────
// The composer resolves {placeholders} for display only — the API re-resolves
// authoritatively at publish (§11.2). Tokens with no value YET stay as raw
// {tokens} (the server fills them), so tapping a template before picking
// products never bakes an empty name into the post.
const TEMPLATE_TOKEN = /\{(product_name|product_names|price|category|link|store_name|festival)\}/g

function formatBarePrice(paise: number): string {
  const rupees = paise / 100
  const isWhole = Number.isInteger(rupees)
  return rupees.toLocaleString('en-IN', {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: isWhole ? 0 : 2,
  })
}

function resolveCaptionText(template: string, values: Record<string, string>): string {
  const substituted = template.replace(TEMPLATE_TOKEN, (match, key: string) => {
    const v = values[key] ?? ''
    return v.length > 0 ? v : match
  })
  return substituted.replace(/ {2,}/g, ' ').trim()
}

const LINK_OPTIONS: { value: SocialLinkType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'collection', label: 'Collection' },
  { value: 'storefront', label: 'Store page' },
  { value: 'product', label: 'Product page' },
]

export default function CreateSocialPostScreen() {
  const { colors, primaryColor } = useTheme()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const params = useLocalSearchParams<{
    product_id?: string
    product_ids?: string
    collection_id?: string
    photo_id?: string
    video_id?: string
  }>()

  // ── Connected accounts ────────────────────────────────────────────
  const { data: accountsData, isLoading: loadingAccounts } = useQuery({
    queryKey: ['social', 'accounts'],
    queryFn: () => socialApi.listAccounts(),
  })
  const accounts = useMemo<SocialAccountInfo[]>(() => {
    return (accountsData as { data: SocialAccountInfo[] } | undefined)?.data ?? []
  }, [accountsData])

  // ── Admin post templates (T-9.6) ─────────────────────────────────
  const { data: templatesData } = useQuery({
    queryKey: ['social', 'post-templates'],
    queryFn: () => socialApi.listPostTemplates('POST'),
  })
  const templates = templatesData?.data ?? []

  // Retailer profile powers {store_name} + the storefront {link} in the
  // template prefill (display only — the API re-resolves at publish).
  const { data: profileData } = useQuery({
    queryKey: ['retailer', 'me'],
    queryFn: () => retailerApi.getMe(),
    staleTime: 60_000,
  })
  const profile = (profileData as
    | { data?: { shop_name?: string | null; public_slug?: string | null } }
    | undefined)?.data

  // ── Composer state ────────────────────────────────────────────────
  const [postType, setPostType] = useState<SocialPostComposeType>('SINGLE_PRODUCT')
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [selected, setSelected] = useState<ComposeProduct[]>([])
  const [mediaOverride, setMediaOverride] = useState<Record<string, ComposeMedia>>({})
  const [collectionLink, setCollectionLink] = useState<CollectionSummary | null>(null)
  const [linkType, setLinkType] = useState<SocialLinkType>('none')
  const [linkCollection, setLinkCollection] = useState<CollectionSummary | null>(null)
  const [caption, setCaption] = useState('')
  const [targetIds, setTargetIds] = useState<string[]>([])
  const [publishing, setPublishing] = useState(false)
  const [result, setResult] = useState<SocialPostTargetResult[] | null>(null)
  const [suggestingCaption, setSuggestingCaption] = useState(false)
  // AI auto-suggest respects the retailer: never clobbers text they typed or
  // a template they applied (T-6.2, R-9). `captionTouched` flips on the first
  // manual keystroke; `lastAiFill` tracks the previous AI fill so a content
  // change can re-suggest over it (nothing else); `suggestedFor` records the
  // content signature already suggested so the landing fill never re-triggers.
  const captionTouched = useRef(false)
  const lastAiFill = useRef('')
  const suggestedFor = useRef('')
  const captionRef = useRef('')
  useEffect(() => {
    captionRef.current = caption
  }, [caption])

  // Content signature that should carry an AI caption (T-6.2 / R-9).
  const suggestSignature = useMemo(
    () =>
      postType === 'COLLECTION_LINK'
        ? `collection:${collectionLink?.id ?? ''}`
        : `${postType}:${selected.map((p) => p.id).join(',')}`,
    [postType, selected, collectionLink],
  )

  const runCaptionSuggest = useCallback(async () => {
    if (suggestingCaption || publishing) return
    // COLLECTION_LINK still suggests from nothing but the collection id.
    if (postType !== 'COLLECTION_LINK' && selected.length === 0) return
    setSuggestingCaption(true)
    try {
      const res = await socialApi.suggestCaption({
        product_ids: postType === 'COLLECTION_LINK' ? [] : selected.map((p) => p.id),
        post_type: postType,
      })
      const d = (res as { data?: { caption?: string; hashtags?: string[] } }).data
      if (!d?.caption) return
      const tags = (d.hashtags ?? []).map((h) => (h.startsWith('#') ? h : `#${h}`))
      const text = d.caption + (tags.length > 0 ? `\n\n${tags.join(' ')}` : '')
      lastAiFill.current = text
      captionTouched.current = false // an AI fill is not a manual edit
      setCaption(text)
    } catch {
      // AI suggest is additive — never surface an error in the composer.
    } finally {
      setSuggestingCaption(false)
    }
  }, [postType, selected, suggestingCaption, publishing])

  // Debounced auto-suggest on content change — only while the retailer has
  // not written their own copy (typed text or an applied template survive).
  useEffect(() => {
    if (!suggestSignature || publishing) return
    if (captionTouched.current) return
    if (suggestedFor.current === suggestSignature) return
    if (captionRef.current.length > 0 && captionRef.current !== lastAiFill.current) return
    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled) return
      suggestedFor.current = suggestSignature // never retry the same content
      void runCaptionSuggest()
    }, 900)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [suggestSignature, publishing, runCaptionSuggest])

  // Deep-link intent, applied once (see prefill effect below).
  const appliedDeepLink = useRef(false)
  const pendingCollectionId = useRef<string | null>(null)
  const intent = useMemo<DeepIntent>(() => {
    const raw = params.product_ids ?? params.product_id
    return {
      productIds: raw ? String(raw).split(',').map((s) => s.trim()).filter(Boolean) : [],
      collectionId: params.collection_id ?? null,
      photoId: params.photo_id ?? null,
      videoId: params.video_id ?? null,
    }
  }, [params])

  const collectionsData = useQuery({
    queryKey: ['collections', 'all'],
    queryFn: () => collectionApi.list(),
  })
  const collections: CollectionSummary[] = useMemo(() => {
    const list = (collectionsData.data as { data: unknown[] } | undefined)?.data ?? []
    return (list as CollectionSummary[]).filter((c) => c.id && c.title)
  }, [collectionsData.data])

  // Resolve a pending deep-link collection once the list arrives.
  useEffect(() => {
    if (pendingCollectionId.current && collections.length > 0) {
      const match = collections.find((c) => c.id === pendingCollectionId.current) ?? null
      pendingCollectionId.current = null
      if (match) setCollectionLink(match)
    }
  }, [collections])

  // Deep-link prefill — products + forced media for single-product entries.
  useEffect(() => {
    if (appliedDeepLink.current) return
    if (intent.productIds.length === 0) {
      // Collection-only entry (R-8): route to link mode, pick the collection.
      if (intent.collectionId) {
        appliedDeepLink.current = true
        setPostType('COLLECTION_LINK')
        pendingCollectionId.current = intent.collectionId
      }
      return
    }
    appliedDeepLink.current = true
    let cancelled = false
    void (async () => {
      try {
        const details = (
          await Promise.all(intent.productIds.map((id) => productApi.get(id).catch(() => null)))
        )
          .map((r) => (r as { data?: unknown } | null)?.data)
          .filter(Boolean) as {
          id: string
          name: string | null
          primary_photo_url: string | null
          price_min: number | null
          price_max: number | null
          photos: { id: string; url: string }[]
          videos?: { id: string; public_url: string }[]
        }[]
        if (cancelled || details.length === 0) return
        const products = details.map((d) => toComposeProduct(d))
        setPostType(products.length > 1 ? 'CAROUSEL' : 'SINGLE_PRODUCT')
        setSelected(products)
        // photo_id / video_id only make sense for a single-product entry.
        if (products.length === 1) {
          const d = details[0]
          if (intent.photoId) {
            const p = d.photos.find((x) => x.id === intent.photoId)
            if (p) setMediaOverride({ [d.id]: { kind: 'photo', photo_id: p.id, url: p.url } })
          } else if (intent.videoId) {
            const v = (d.videos ?? []).find((x) => x.id === intent.videoId)
            if (v) {
              setMediaOverride({
                [d.id]: { kind: 'video', video_id: v.id, url: v.public_url },
              })
            }
          }
        }
      } catch {
        // Prefill is best-effort — the retailer can pick manually.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [intent])

  // ── Per-product detail (drives media defaults + the media strips) ──
  const detailQueries = useQueries({
    queries: selected.map((p) => ({
      queryKey: ['product', p.id],
      queryFn: () => productApi.get(p.id),
    })),
  })
  const detailById = useMemo(() => {
    type Detail = {
      photos: { id: string; url: string; is_primary: boolean; is_video?: boolean }[]
      videos?: { id: string; public_url: string; is_main: boolean }[]
      category?: string | null
    }
    const map = new Map<string, Detail>()
    detailQueries.forEach((q, i) => {
      const d = (q.data as { data?: Detail } | undefined)?.data
      if (d) map.set(selected[i].id, d)
    })
    return map
  }, [detailQueries, selected])

  // Default target set: all connected accounts, chosen once.
  const initializedTargets = useRef(false)
  useEffect(() => {
    if (initializedTargets.current || accounts.length === 0) return
    initializedTargets.current = true
    setTargetIds(accounts.map((a) => a.id))
  }, [accounts])

  const postTypeCtx = useCallback(
    (next: SocialPostComposeType) => {
      setPostType(next)
      if (next === 'COLLECTION_LINK') {
        // Link-only: no media, no IG targets (IG captions can't carry links).
        setSelected([])
        setMediaOverride({})
        setTargetIds((cur) => {
          const ig = new Set(accounts.filter((a) => a.platform === 'INSTAGRAM').map((a) => a.id))
          const kept = cur.filter((id) => !ig.has(id))
          return kept.length === 0 ? accounts.filter((a) => a.platform === 'FACEBOOK').map((a) => a.id) : kept
        })
      } else {
        if (next === 'CAROUSEL') {
          // Mixed media banned — drop videos, force photo defaults.
          setMediaOverride({})
          setSelected((cur) => cur.slice(0, CAROUSEL_CAP))
        } else {
          setSelected((cur) => cur.slice(0, 1))
        }
        if (linkType === 'product') setLinkType('none')
      }
    },
    [accounts, linkType],
  )

  const targetDisabledReason = useCallback(
    (account: SocialAccountInfo) =>
      postType === 'COLLECTION_LINK' && account.platform === 'INSTAGRAM'
        ? "Instagram can't post a link without photos — use a photo or carousel post for Instagram."
        : null,
    [postType],
  )

  const toggleProduct = useCallback(
    (p: ComposeProduct) => {
      setSelected((cur) => {
        const idx = cur.findIndex((x) => x.id === p.id)
        if (idx >= 0) return cur.filter((x) => x.id !== p.id)
        const cap = postType === 'SINGLE_PRODUCT' ? 1 : CAROUSEL_CAP
        if (postType === 'SINGLE_PRODUCT' && cur.length >= 1) return [p] // replace
        const next = [...cur, p]
        return next.length > cap ? next.slice(0, cap) : next
      })
    },
    [postType],
  )

  // Resolve the media a product will use: explicit tap wins, else the
  // default (main Ken Burns video for single posts, else primary photo).
  const resolveMedia = useCallback(
    (productId: string): ComposeMedia | null => {
      const override = mediaOverride[productId]
      if (override) return override
      const detail = detailById.get(productId)
      if (!detail) return null
      if (postType !== 'CAROUSEL') {
        const mainVideo = detail.videos?.find((v) => v.is_main) ?? detail.videos?.[0]
        if (mainVideo?.public_url) {
          return { kind: 'video', video_id: mainVideo.id, url: mainVideo.public_url }
        }
      }
      const photo =
        detail.photos.find((p) => p.is_primary && !p.is_video) ?? detail.photos.find((p) => !p.is_video)
      return photo ? { kind: 'photo', photo_id: photo.id, url: photo.url } : null
    },
    [detailById, mediaOverride, postType],
  )

  const items = useMemo(() => {
    if (postType === 'COLLECTION_LINK') return []
    return selected
      .map((p) => ({ product: p, media: resolveMedia(p.id) }))
      .filter((x): x is { product: ComposeProduct; media: ComposeMedia } => !!x.media)
  }, [postType, selected, resolveMedia])

  // ── Validation (T-4.7) ────────────────────────────────────────────
  const problems = useMemo(() => {
    const list: string[] = []
    if (postType === 'COLLECTION_LINK') {
      if (!collectionLink) list.push('Choose a collection to share.')
    } else {
      if (postType === 'SINGLE_PRODUCT') {
        if (selected.length !== 1) list.push('Choose exactly one product.')
      } else if (selected.length < 2) {
        list.push('Choose at least 2 products for a carousel.')
      }
      if (selected.length > 0) {
        const missing = selected.filter((p) => !resolveMedia(p.id))
        if (missing.length > 0) {
          list.push(
            `Every product needs media — add photos to: ${missing
              .map((p) => p.name ?? 'one product')
              .slice(0, 2)
              .join(', ')}${missing.length > 2 ? '…' : ''}`,
          )
        }
      }
    }
    if (targetIds.length === 0) list.push('Select at least one account to post to.')
    return list
  }, [postType, collectionLink, selected, targetIds, resolveMedia])

  // ── Link label for preview (client-side only — the API resolves the
  //    authoritative URL per R-11) ───────────────────────────────────
  const linkLabel = useMemo(() => {
    if (postType === 'COLLECTION_LINK') return collectionLink?.title ?? ''
    if (linkType === 'collection') return linkCollection?.title ?? ''
    if (linkType === 'storefront') return 'Your store page'
    if (linkType === 'product') return selected[0]?.name ? `Product: ${selected[0].name}` : ''
    return ''
  }, [postType, collectionLink, linkType, linkCollection, selected])

  // ── Template caption prefill (T-9.6) ──────────────────────────────
  // Values resolved client-side for display; unresolved tokens stay raw and
  // the API fills them in authoritatively before fan-out (§11.2).
  const templateValues = useMemo(() => {
    const first = selected[0]
    const names = selected
      .map((p) => p.name?.trim())
      .filter((n): n is string => Boolean(n))
    const link =
      postType === 'COLLECTION_LINK' && collectionLink
        ? collectionLink.url
        : linkType === 'collection' && linkCollection
          ? linkCollection.url
          : linkType === 'storefront' && profile?.public_slug
            ? `${WEB_URL}/${profile.public_slug}`
            : ''
    return {
      product_name: first?.name?.trim() ?? '',
      product_names: names.join(', '),
      price: first?.price_min != null ? formatBarePrice(first.price_min) : '',
      category: (first ? detailById.get(first.id)?.category : undefined)?.trim() ?? '',
      link,
      store_name: profile?.shop_name ?? '',
      festival: '',
    }
  }, [selected, detailById, postType, collectionLink, linkType, linkCollection, profile])

  const applyTemplate = useCallback(
    (t: PostTemplateInfo | null) => {
      setTemplateId(t?.id ?? null)
      if (!t) return
      // A template can hint a post type — apply its side effects (IG removal
      // for link-only, caps, video drops) before the caption lands.
      if (t.post_type && t.post_type !== postType) postTypeCtx(t.post_type)
      const body = resolveCaptionText(t.caption_template, templateValues)
      setCaption(body + (t.hashtags.length > 0 ? `\n\n${t.hashtags.join(' ')}` : ''))
    },
    [postType, postTypeCtx, templateValues],
  )

  // ── Publish (T-4.8) ───────────────────────────────────────────────
  const buildPayload = useCallback((): CreateSocialPostInput => {
    if (postType === 'COLLECTION_LINK') {
      return {
        client_post_id: newClientPostId(),
        post_type: 'COLLECTION_LINK',
        targets: targetIds,
        items: [],
        collection_id: collectionLink?.id,
        link_type: 'collection',
        caption: caption.trim() || undefined,
        template_id: templateId ?? undefined,
      }
    }
    return {
      client_post_id: newClientPostId(),
      post_type: postType,
      targets: targetIds,
      items: items.map(({ product, media }) =>
        media.kind === 'photo'
          ? { product_id: product.id, photo_id: media.photo_id }
          : { product_id: product.id, video_id: media.video_id },
      ),
      ...(linkType === 'collection' && linkCollection
        ? { collection_id: linkCollection.id }
        : {}),
      link_type: linkType,
      ...(linkType === 'product' && selected.length === 1 ? { link_product_id: selected[0].id } : {}),
      caption: caption.trim() || undefined,
      template_id: templateId ?? undefined,
    }
  }, [postType, targetIds, items, linkType, linkCollection, collectionLink, caption, selected, templateId])

  const handlePublish = async () => {
    if (problems.length > 0 || publishing) return
    setPublishing(true)
    const payload = buildPayload()
    try {
      const res = await socialApi.createPost(payload)
      const results = (res as { data?: { results?: SocialPostTargetResult[] } }).data?.results ?? []
      setResult(results)
      // Refresh each target's post history so the new rows show immediately.
      payload.targets.forEach((id) => {
        void queryClient.invalidateQueries({ queryKey: ['social', 'posts', id] })
      })
    } catch (err) {
      // All-targets-failed publishes return 400 PUBLISH_FAILED with the
      // per-target rows attached (T-7.2) — show them in the result sheet so
      // the retailer sees WHY each account failed, not a generic alert.
      const results = (err as { results?: unknown[] | null } | null)?.results
      if (Array.isArray(results) && results.length > 0) {
        setResult(results as SocialPostTargetResult[])
      } else {
        showError(err, 'Could not publish the post. Try again.')
      }
    } finally {
      setPublishing(false)
    }
  }

  const previewPlatforms = useMemo(() => {
    const set = new Set<'FACEBOOK' | 'INSTAGRAM'>()
    accounts.forEach((a) => {
      if (targetIds.includes(a.id)) set.add(a.platform)
    })
    return Array.from(set)
  }, [accounts, targetIds])

  const sectionTitle = (step: string, title: string, hint?: string) => (
    <View className="flex-row items-center mb-2 mt-5 px-1">
      <Text className="text-[10px] font-bold text-ink-600 bg-ink-600/10 rounded-full w-5 h-5 text-center leading-5 mr-2 overflow-hidden">
        {step}
      </Text>
      <Text className="text-sm font-bold text-sand-900">{title}</Text>
      {hint ? <Text className="text-[10px] text-sand-400 ml-2 flex-1">{hint}</Text> : null}
    </View>
  )

  const accountById = (id: string) => accounts.find((a) => a.id === id)

  return (
    <View className="flex-1 bg-ink-50">
      {/* Header */}
      <View className="bg-white border-b border-sand-100 px-4 pb-4" style={{ paddingTop: Math.max(insets.top, 24) + 12 }}>
        <View className="flex-row items-center gap-3">
          <AnimatedPressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Go back" accessibilityRole="button">
            <ChevronLeft size={24} color={colors.sand[700]} />
          </AnimatedPressable>
          <View className="flex-1">
            <Text className="text-base font-bold text-sand-900">Create post</Text>
            <Text className="text-[10px] text-sand-400">One post → every connected account</Text>
          </View>
        </View>
      </View>

      {loadingAccounts ? (
        <ActivityIndicator color={primaryColor} className="py-16" />
      ) : accounts.length === 0 ? (
        <View className="flex-1 px-6 items-center justify-center">
          <View className="w-16 h-16 rounded-3xl bg-sand-100 items-center justify-center mb-4">
            <ShareIcon />
          </View>
          <Text className="text-base font-bold text-sand-900 mb-1.5 text-center">
            No social accounts connected
          </Text>
          <Text className="text-xs text-sand-400 text-center mb-6 leading-5">
            Connect a Facebook Page or Instagram account first, then come back here to create posts.
          </Text>
          <GradientButton label="Connect in Settings" onPress={() => router.push('/settings/social')} />
        </View>
      ) : (
        <>
          <ScrollView
            className="flex-1 px-4"
            contentContainerStyle={{ paddingBottom: insets.bottom + 130 }}
            keyboardShouldPersistTaps="handled"
          >
            {templates.length > 0 ? (
              <>
                {sectionTitle('0', 'Templates', 'Start from a ready-made caption')}
                <TemplatePicker
                  templates={templates}
                  selectedId={templateId}
                  onSelect={applyTemplate}
                  colors={colors}
                />
              </>
            ) : null}

            {sectionTitle('1', 'Post type', 'Change anytime — your picks adapt')}
            <PostTypePicker value={postType} onChange={postTypeCtx} />

            {postType === 'COLLECTION_LINK' ? (
              <>
                {sectionTitle('2', 'Collection to share')}
                <View className="bg-white rounded-2xl border border-sand-100 overflow-hidden">
                  {collections.length === 0 ? (
                    <Text className="text-xs text-sand-400 p-5 text-center">
                      No collections yet — create one from the Collections tab first.
                    </Text>
                  ) : (
                    collections.map((c, i) => {
                      const active = collectionLink?.id === c.id
                      return (
                        <AnimatedPressable
                          key={c.id}
                          onPress={() => setCollectionLink(c)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          className={`flex-row items-center px-4 py-3.5 ${i > 0 ? 'border-t border-sand-100' : ''} ${
                            active ? 'bg-ink-600/5' : ''
                          }`}
                        >
                          <View className="w-8 h-8 rounded-xl bg-sand-100 items-center justify-center mr-3">
                            <Link2 size={15} color={colors.sand[600]} />
                          </View>
                          <View className="flex-1">
                            <Text className="text-sm font-semibold text-sand-900" numberOfLines={1}>
                              {c.title}
                            </Text>
                            <Text className="text-[10px] text-sand-400">
                              {c.product_count} {c.product_count === 1 ? 'product' : 'products'}
                            </Text>
                          </View>
                          <View
                            className={`w-5 h-5 rounded-full border-2 items-center justify-center ${
                              active ? 'border-ink-600' : 'border-sand-300'
                            }`}
                          >
                            {active ? <View className="w-2.5 h-2.5 rounded-full bg-ink-600" /> : null}
                          </View>
                        </AnimatedPressable>
                      )
                    })
                  )}
                </View>
              </>
            ) : (
              <>
                {sectionTitle(
                  '2',
                  postType === 'CAROUSEL' ? 'Products (2–10)' : 'Product',
                  selected.length > 0 ? `${selected.length}/${postType === 'CAROUSEL' ? CAROUSEL_CAP : 1} picked` : undefined,
                )}
                <ProductMultiPicker
                  maxItems={postType === 'CAROUSEL' ? CAROUSEL_CAP : 1}
                  selected={selected}
                  onToggle={toggleProduct}
                  selectedOrder={(id) => {
                    const idx = selected.findIndex((s) => s.id === id)
                    return idx >= 0 ? idx : null
                  }}
                />

                {items.length > 0 ? (
                  <>
                    {sectionTitle('3', 'Media per product', postType === 'CAROUSEL' ? 'Photos only for carousels' : 'Photo or video')}
                    <View className="gap-4">
                      {items.map(({ product, media }) => (
                        <View key={product.id} className="bg-white rounded-2xl border border-sand-100 p-4">
                          <ItemMediaStrip
                            product={product}
                            selection={media}
                            allowVideos={postType !== 'CAROUSEL'}
                            onSelect={(m) => setMediaOverride((cur) => ({ ...cur, [product.id]: m }))}
                          />
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}

                {sectionTitle('4', 'Link', 'Optional — shows a card under the post')}
                <View className="flex-row flex-wrap gap-2 mb-2">
                  {LINK_OPTIONS.map((opt) => {
                    const disabled = opt.value === 'product' && selected.length !== 1
                    const active = linkType === opt.value
                    return (
                      <AnimatedPressable
                        key={opt.value}
                        onPress={() => {
                          if (disabled) return
                          setLinkType(opt.value)
                          if (opt.value !== 'collection') setLinkCollection(null)
                        }}
                        disabled={disabled}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active, disabled }}
                        className={`rounded-full border px-3.5 py-2 ${
                          active ? 'bg-ink-600 border-ink-600' : disabled ? 'bg-sand-50 border-sand-100 opacity-50' : 'bg-white border-sand-200'
                        }`}
                      >
                        <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-sand-600'}`}>
                          {opt.label}
                        </Text>
                      </AnimatedPressable>
                    )
                  })}
                </View>
                {linkType === 'collection' ? (
                  <View className="bg-white rounded-2xl border border-sand-100 overflow-hidden">
                    {collections.length === 0 ? (
                      <Text className="text-xs text-sand-400 p-4 text-center">No collections yet</Text>
                    ) : (
                      collections.slice(0, 5).map((c, i) => {
                        const active = linkCollection?.id === c.id
                        return (
                          <AnimatedPressable
                            key={c.id}
                            onPress={() => setLinkCollection(c)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            className={`flex-row items-center px-4 py-3 ${i > 0 ? 'border-t border-sand-100' : ''}`}
                          >
                            <Text className="text-xs font-semibold text-sand-800 flex-1" numberOfLines={1}>
                              {c.title}
                            </Text>
                            {active ? <CheckCircle2 size={16} color={colors.ink[600]} /> : null}
                          </AnimatedPressable>
                        )
                      })
                    )}
                  </View>
                ) : null}
              </>
            )}

            {sectionTitle(postType === 'COLLECTION_LINK' ? '3' : '5', 'Caption')}
            <View className="bg-white rounded-2xl border border-sand-100 p-3.5">
              <TextInput
                value={caption}
                onChangeText={(t) => {
                  captionTouched.current = true
                  setCaption(t)
                }}
                multiline
                className="text-sm text-sand-900 min-h-[80px] leading-5"
                placeholderTextColor={colors.sand[400]}
                placeholder="What's new? Tell your customers… (leave blank for an auto-filled caption)"
                maxLength={2200}
                accessibilityLabel="Post caption"
              />
              <View className="flex-row items-center justify-between mt-1">
                {suggestingCaption ? (
                  <Text className="text-[10px] text-lavender-600">Writing with AI…</Text>
                ) : (
                  <Text className="text-[10px] text-sand-400">
                    {lastAiFill.current === caption && caption.length > 0
                      ? 'AI suggestion — edit freely'
                      : caption.length === 0
                        ? 'Empty caption = auto-filled at publish'
                        : 'Your caption — no auto-fill at publish'}
                  </Text>
                )}
                <Text className="text-[10px] text-sand-400">{caption.length}/2200</Text>
              </View>
            </View>

            {sectionTitle(postType === 'COLLECTION_LINK' ? '4' : '6', 'Post to', `${targetIds.length} selected`)}
            <TargetChecklist
              accounts={accounts}
              selected={targetIds}
              onToggle={(id) =>
                setTargetIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
              }
              disabledReason={targetDisabledReason}
            />

            {sectionTitle(postType === 'COLLECTION_LINK' ? '5' : '7', 'Preview')}
            <PostPreview
              platforms={previewPlatforms}
              postType={postType}
              media={items.map((x) => x.media)}
              caption={caption}
              linkLabel={linkLabel}
            />
            <Text className="text-[10px] text-sand-400 text-center mt-3 px-6 leading-4">
              Preview is approximate — Kanchuki builds the final post and link server-side before publishing.
            </Text>
          </ScrollView>

          {/* Footer CTA */}
          <View
            className="absolute bottom-0 left-0 right-0 bg-white border-t border-sand-100 px-4 pt-3"
            style={{ paddingBottom: Math.max(insets.bottom, 12) }}
          >
            {problems.length > 0 ? (
              <View className="flex-row items-start gap-1.5 mb-2">
                <AlertCircle size={13} color={colors.rust[600]} className="mt-0.5" />
                <Text className="text-[11px] text-rust-700 flex-1 leading-4">{problems[0]}</Text>
              </View>
            ) : null}
            <GradientButton
              label={publishing ? 'Publishing…' : 'Publish now'}
              onPress={() => void handlePublish()}
              disabled={problems.length > 0}
              loading={publishing}
              icon={<Send size={16} color="#fff" />}
            />
          </View>
        </>
      )}

      {/* Post-publish summary (R-4) */}
      {result ? (
        <ResultSheet
          results={result}
          accountName={(id) => accountById(id)?.account_name ?? 'Account'}
          // All-failed (error) keeps the composer open so the retailer can
          // fix and retry; a real publish closes back to where they came from.
          onDone={() => (result.every((r) => r.status === 'POSTED') ? router.back() : setResult(null))}
        />
      ) : null}
    </View>
  )
}

function ShareIcon() {
  return <Images size={28} color="#0a0a0a" opacity={0.5} />
}

function ResultSheet({
  results,
  accountName,
  onDone,
}: {
  results: SocialPostTargetResult[]
  accountName: (id: string) => string
  onDone: () => void
}) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const posted = results.filter((r) => r.status === 'POSTED').length
  const nothingPosted = posted === 0

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onDone}>
      <View className="flex-1 bg-black/50 justify-end">
        <View
          className="bg-white rounded-t-3xl w-full p-5"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          <Text className="text-lg font-bold text-sand-900 mb-1">
            {nothingPosted
              ? 'Could not post'
              : posted === results.length
                ? 'Posted!'
                : 'Post finished'}
          </Text>
          <Text className="text-xs text-sand-500 mb-4">
            {nothingPosted
              ? 'None of the accounts got the post. Check each reason below, then fix and publish again.'
              : `${posted}/${results.length} accounts got the post — partial success is normal and nothing is rolled back.`}
          </Text>
          <ScrollView className="max-h-[45%]">
            {results.map((r) => {
              const isIg = r.platform === 'INSTAGRAM'
              return (
                <View key={r.social_account_id} className="flex-row items-center bg-sand-50 rounded-2xl px-4 py-3 mb-2">
                  <View
                    className={`w-9 h-9 rounded-xl items-center justify-center mr-3 ${
                      isIg ? 'bg-[#E1306C]/10' : 'bg-[#1877F2]/10'
                    }`}
                  >
                    {isIg ? <Instagram size={17} color="#E1306C" /> : <Facebook size={17} color="#1877F2" />}
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-sand-900" numberOfLines={1}>
                      {accountName(r.social_account_id)}
                    </Text>
                    {r.status === 'POSTED' ? (
                      r.external_post_url ? (
                        <AnimatedPressable onPress={() => void Linking.openURL(r.external_post_url!)} hitSlop={6} accessibilityRole="button">
                          <Text className="text-[11px] font-semibold text-ink-700 underline">View post ↗</Text>
                        </AnimatedPressable>
                      ) : (
                        <Text className="text-[11px] text-turmeric-700 font-semibold">Posted</Text>
                      )
                    ) : (
                      <Text className="text-[10px] text-rust-600" numberOfLines={2}>
                        {r.error_message ?? 'Failed to publish'}
                      </Text>
                    )}
                  </View>
                  {r.status === 'POSTED' ? (
                    <CheckCircle2 size={18} color="#22c55e" />
                  ) : (
                    <XCircle size={18} color={colors.rust[500]} />
                  )}
                </View>
              )
            })}
          </ScrollView>
          <GradientButton label="Done" onPress={onDone} style={{ marginTop: 12 }} />
        </View>
      </View>
    </Modal>
  )
}
