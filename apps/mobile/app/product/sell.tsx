import { memo, useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { Alert, BackHandler, FlatList, Image, Modal, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { Minus, Plus, Trash2, X } from 'lucide-react-native'
import { productApi, type SellLineResult } from '../../src/lib/api'
import { ApiError } from '../../src/lib/api/api-error'
import { showError } from '../../src/lib/errors'
import { inrFromPaise } from '../../src/lib/format-inr'
import { useScreenInsets } from '../../src/lib/safe-area'
import {
  billReducer,
  billTotalPaise,
  canConfirm,
  emptyBill,
  inStockSizes,
  lineState,
  newBillId,
  stockFor,
  toSellLines,
  type BillAction,
  type BillLine,
  type SellProduct,
} from '../../src/lib/sell-bill'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { KeyboardScreen } from '../../src/components/KeyboardScreen'
import { SkuScanner } from '../../src/components/SkuScanner'

/**
 * F-047 Scan & Sell: scan every article of a counter sale, then one
 * "Mark N items sold". The bill lives in memory; the server applies it in one
 * request keyed by `client_bill_id` (retrying the same id is safe), and Undo is
 * open for 10 minutes. Not a GST invoice and not a payment tool.
 *
 * T6 is online only: lookups hit the network (T7 adds the offline queue).
 */

const UNDO_WINDOW_MS = 10 * 60 * 1000

const LINE_ERRORS: Record<string, string> = {
  INSUFFICIENT_STOCK: 'Not enough stock',
  NOT_FOUND: 'Product not found',
  INVALID_SIZE: 'That size is no longer valid',
  BILL_UNDONE: 'This bill was undone',
  // The server sent no row for this line (a replay after a timeout only knows committed sales).
  NOT_APPLIED: 'Not sold: scan it again',
}

/** iOS drops an Alert raised while a Modal is still dismissing; wait out the fade. */
const MODAL_DISMISS_MS = 400

interface SaleResult {
  /** A replay: the server answered from stored sales, so soldAt (our clock) is not its window start. */
  replayed: boolean
  lines: SellLineResult[]
  /** The bill as confirmed, to name the failures and count units. */
  snapshot: BillLine[]
  soldAt: number
}

const sizeLabel = (size: string | null) => (size === null ? 'Choose size' : size === 'FREE' ? 'One size' : `Size ${size}`)
const items = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`

const BillRow = memo(function BillRow({
  line,
  dispatch,
}: {
  line: BillLine
  dispatch: (a: BillAction) => void
}) {
  const state = lineState(line)
  const p = line.product
  const tracked = (p?.stock?.length ?? 0) > 0
  const cap = p && line.size ? stockFor(p, line.size) : 0
  const remove = (
    <AnimatedPressable
      testID={`sell-remove-${line.key}`}
      onPress={() => dispatch({ type: 'remove', key: line.key })}
      className="w-11 h-11 items-center justify-center"
      accessibilityLabel={`Remove ${p?.name ?? line.sku} from the bill`}
    >
      <Trash2 size={18} color="#8A8AA3" />
    </AnimatedPressable>
  )

  if (state === 'not_found') {
    return (
      <View className="flex-row items-center px-4 py-2 bg-red-50 border-b border-red-100">
        <Text className="flex-1 text-sm font-semibold text-red-700">{line.sku} not found</Text>
        {remove}
      </View>
    )
  }

  return (
    <View className="flex-row items-center px-4 py-2 border-b border-lavender-100 bg-white">
      {p?.primary_photo_url ? (
        <Image source={{ uri: p.primary_photo_url }} className="w-12 h-12 rounded-xl bg-sand-100" />
      ) : (
        <View className="w-12 h-12 rounded-xl bg-sand-100" />
      )}
      <View className="flex-1 mx-3">
        <Text className="text-sm font-semibold text-sand-900" numberOfLines={1}>
          {p?.name ?? line.sku}
        </Text>
        <Text className="text-xs text-sand-600">
          {line.sku}
          {state === 'sold_out' ? '' : ` · ${sizeLabel(line.size)}`}
        </Text>
        {state === 'sold_out' && <Text className="text-xs font-semibold text-red-600">Already sold</Text>}
        {state === 'ok' && tracked && line.qty >= cap && (
          <Text className="text-xs text-amber-700">Only {cap} in stock</Text>
        )}
      </View>
      {state === 'sold_out' ? (
        remove
      ) : (
        <>
          <View className="flex-row items-center">
            <AnimatedPressable
              testID={`sell-dec-${line.key}`}
              onPress={() => dispatch({ type: 'dec', key: line.key })}
              disabled={line.qty <= 1}
              className="w-11 h-11 items-center justify-center"
              accessibilityLabel={`One less ${p?.name ?? line.sku}`}
            >
              <Minus size={16} color="#231F48" />
            </AnimatedPressable>
            <Text className="w-6 text-center text-sm font-bold text-sand-900">{line.qty}</Text>
            <AnimatedPressable
              testID={`sell-inc-${line.key}`}
              onPress={() => dispatch({ type: 'inc', key: line.key })}
              disabled={line.size === null || line.qty >= cap}
              className="w-11 h-11 items-center justify-center"
              accessibilityLabel={`One more ${p?.name ?? line.sku}`}
            >
              <Plus size={16} color="#231F48" />
            </AnimatedPressable>
          </View>
          <Text className="w-20 text-right text-sm text-sand-900">
            {inrFromPaise((p?.price_min ?? 0) * line.qty)}
          </Text>
          {remove}
        </>
      )}
    </View>
  )
})

export default function SellScreen() {
  const queryClient = useQueryClient()
  const { insets, headerPaddingTop } = useScreenInsets()
  const [bill, dispatch] = useReducer(billReducer, emptyBill)
  const billRef = useRef(bill)
  billRef.current = bill
  const billIdRef = useRef(newBillId())
  // SKU -> product for this bill only: a repeat scan costs no request. Cleared on a new bill.
  const cacheRef = useRef(new Map<string, SellProduct>())
  // Refs, not state: two taps in one tick both read stale state (RC-015/135).
  const busyRef = useRef(false)

  const [looking, setLooking] = useState(false)
  const [notice, setNotice] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<SaleResult | null>(null)
  const [undone, setUndone] = useState<null | 'done' | 'already'>(null)
  const [undoExpired, setUndoExpired] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const pending = bill.lines.find((l) => lineState(l) === 'needs_size')
  const sellCount = bill.lines
    .filter((l) => ['ok', 'needs_size'].includes(lineState(l)))
    .reduce((n, l) => n + l.qty, 0)

  // Undo countdown: only ticks while an undoable result is on screen.
  // A replay has no trustworthy local clock, so it never ticks; the server answers 409 when it is over.
  const undoable =
    result !== null &&
    !result.replayed &&
    undone === null &&
    !undoExpired &&
    now - result.soldAt < UNDO_WINDOW_MS
  useEffect(() => {
    if (!undoable) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [undoable])

  const handleClose = useCallback(() => {
    // A request in flight may already be committed server-side: leaving now would hide the result and Undo.
    if (busyRef.current) return
    if (result || billRef.current.lines.length === 0) {
      router.back()
      return
    }
    Alert.alert('Discard this bill?', 'The items you scanned will be cleared.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => !busyRef.current && router.back() },
    ])
  }, [result])

  // Android hardware back asks first, like the Close button.
  useEffect(() => {
    if (result || bill.lines.length === 0) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose()
      return true
    })
    return () => sub.remove()
  }, [result, bill.lines.length, handleClose])

  const onSku = async (raw: string) => {
    const sku = raw.trim().toUpperCase()
    let product = cacheRef.current.get(sku) ?? null
    if (!product) {
      setLooking(true)
      try {
        const res = await productApi.list({ sku, limit: 1 })
        product = ((res.data ?? [])[0] as SellProduct | undefined) ?? null
        if (product) cacheRef.current.set(sku, product)
      } catch (err) {
        showError(err, 'Could not look up that SKU')
        return
      } finally {
        setLooking(false)
      }
    }
    const action: BillAction = { type: 'add', sku, product }
    const grew = billReducer(billRef.current, action) !== billRef.current
    dispatch(action)
    setNotice(grew ? `Added ${sku}` : `${sku}: already at its stock limit, or the bill is full`)
  }

  const handleConfirm = async () => {
    if (busyRef.current || !canConfirm(billRef.current)) return
    busyRef.current = true
    setSubmitting(true)
    const snapshot = billRef.current.lines
    try {
      const sent = toSellLines(billRef.current)
      const res = await productApi.sell(billIdRef.current, sent)
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      // A replay answers only from committed sales: a line that failed the first time has no row.
      // Never let it vanish from the result.
      const missing: SellLineResult[] = sent
        .filter((s) => !res.data.lines.some((l) => l.product_id === s.product_id && l.size === s.size))
        .map((s) => ({ product_id: s.product_id, size: s.size, ok: false, error: 'NOT_APPLIED' }))
      setConfirmOpen(false)
      setNow(Date.now())
      setResult({
        replayed: res.data.replayed,
        lines: [...res.data.lines, ...missing],
        snapshot,
        soldAt: Date.now(),
      })
    } catch (err) {
      setConfirmOpen(false)
      // The bill and its id are kept: retrying is safe (same client_bill_id).
      setTimeout(
        () =>
          showError(err, 'Could not complete the sale. Your bill is kept — check your connection and try again.'),
        MODAL_DISMISS_MS,
      )
    } finally {
      busyRef.current = false
      setSubmitting(false)
    }
  }

  const handleUndo = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setSubmitting(true)
    try {
      const res = await productApi.undoSale(billIdRef.current)
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      setUndone(res.data.undone ? 'done' : 'already')
    } catch (err) {
      if (err instanceof ApiError && err.code === 'UNDO_WINDOW_EXPIRED') setUndoExpired(true)
      else showError(err, 'Could not undo this bill. Try again.')
    } finally {
      busyRef.current = false
      setSubmitting(false)
    }
  }

  const newBill = () => {
    // A spent bill id is never reused: after Undo the server answers BILL_UNDONE for it.
    billIdRef.current = newBillId()
    cacheRef.current.clear()
    dispatch({ type: 'reset' })
    setResult(null)
    setUndone(null)
    setUndoExpired(false)
    setNotice('')
  }

  const header = (
    <View className="flex-row items-center px-4 pb-2 bg-white" style={{ paddingTop: headerPaddingTop }}>
      <AnimatedPressable
        testID="sell-close"
        onPress={handleClose}
        className="w-11 h-11 rounded-full bg-white border border-lavender-200 items-center justify-center"
        accessibilityLabel="Close"
      >
        <X size={18} color="#231F48" />
      </AnimatedPressable>
      <Text className="flex-1 text-center text-lg font-bold text-sand-900">Sell items</Text>
      <View className="w-11" />
    </View>
  )

  if (result) {
    const okLines = result.lines.filter((l) => l.ok)
    const failed = result.lines.filter((l) => !l.ok)
    const soldUnits = okLines.reduce(
      (n, l) => n + (result.snapshot.find((s) => s.product?.id === l.product_id && s.size === l.size)?.qty ?? 1),
      0,
    )
    const remaining = UNDO_WINDOW_MS - (now - result.soldAt)
    const windowOpen = (result.replayed || remaining > 0) && !undoExpired
    const mm = Math.floor(Math.max(remaining, 0) / 60000)
    const ss = String(Math.floor((Math.max(remaining, 0) % 60000) / 1000)).padStart(2, '0')
    const nameOf = (l: SellLineResult) => {
      const row = result.snapshot.find((s) => s.product?.id === l.product_id)
      return row?.product?.name ?? row?.sku ?? l.product_id
    }
    return (
      <View className="flex-1 bg-white">
        {header}
        <View className="flex-1 px-6 pt-6">
          <Text className="text-2xl font-bold text-sand-900">
            {soldUnits > 0 ? `${soldUnits} marked sold` : 'Nothing was marked sold'}
          </Text>
          {soldUnits > 0 && undone === null && (
            <Text className="text-sm text-sand-600 mt-1">Your catalog is updated.</Text>
          )}
          {undone === 'done' && <Text className="text-base font-semibold text-sand-900 mt-2">Bill undone. Stock restored.</Text>}
          {undone === 'already' && <Text className="text-base font-semibold text-sand-900 mt-2">Already undone.</Text>}
          {failed.length > 0 && (
            <View className="mt-4 rounded-2xl bg-red-50 p-4">
              <Text className="text-sm font-bold text-red-700 mb-1">
                {failed.length === 1 ? '1 item could not be updated' : `${failed.length} items could not be updated`}
              </Text>
              {failed.map((l) => (
                <Text key={`${l.product_id}:${l.size}`} className="text-sm text-red-700">
                  {nameOf(l)}: {LINE_ERRORS[l.error ?? ''] ?? 'Could not update'}
                </Text>
              ))}
            </View>
          )}
          {soldUnits > 0 && undone === null && windowOpen && (
            <AnimatedPressable
              testID="sell-undo"
              onPress={() => void handleUndo()}
              disabled={submitting}
              className="mt-6 border border-lavender-300 rounded-2xl py-3 items-center bg-white"
              accessibilityLabel="Undo this bill"
            >
              <Text className="text-sm font-bold text-sand-900">
                {result.replayed ? 'Undo this bill' : `Undo this bill (${mm}:${ss} left)`}
              </Text>
            </AnimatedPressable>
          )}
          {soldUnits > 0 && undone === null && !windowOpen && (
            <Text className="mt-6 text-sm text-sand-600">Undo window has passed.</Text>
          )}
        </View>
        <View className="flex-row gap-3 px-4" style={{ paddingBottom: insets.bottom + 12 }}>
          <AnimatedPressable
            testID="sell-new-bill"
            onPress={newBill}
            className="flex-1 border border-lavender-300 rounded-2xl py-3.5 items-center bg-white"
            accessibilityLabel="Start a new bill"
          >
            <Text className="text-sm font-bold text-sand-900">New bill</Text>
          </AnimatedPressable>
          <AnimatedPressable
            testID="sell-done"
            onPress={() => router.back()}
            className="flex-1 bg-ink-600 rounded-2xl py-3.5 items-center"
            accessibilityLabel="Done"
          >
            <Text className="text-sm font-bold text-white">Done</Text>
          </AnimatedPressable>
        </View>
      </View>
    )
  }

  const sizes = pending?.product ? inStockSizes(pending.product) : []

  return (
    <KeyboardScreen className="flex-1 bg-white">
      {header}
      <View style={{ height: 270 }}>
        <SkuScanner
          compact
          onSku={onSku}
          onClose={handleClose}
          paused={pending !== undefined || confirmOpen || submitting}
          busy={looking}
        />
      </View>
      {notice !== '' && (
        <Text className="px-4 py-1.5 text-xs text-sand-600" accessibilityLiveRegion="polite">
          {notice}
        </Text>
      )}
      <FlatList
        data={bill.lines}
        keyExtractor={(l) => l.key}
        renderItem={({ item }) => <BillRow line={item} dispatch={dispatch} />}
        ListEmptyComponent={
          <Text className="text-center text-sm text-sand-600 px-6 py-8">
            Scan each article’s SKU tag, or type the SKU, to add it to this bill.
          </Text>
        }
        keyboardShouldPersistTaps="handled"
        className="flex-1"
      />

      {sellCount > 0 && (
        <View className="px-4 pt-3 border-t border-lavender-100 bg-white" style={{ paddingBottom: insets.bottom + 12 }}>
          <View className="flex-row justify-between mb-2">
            <Text className="text-sm text-sand-600">{items(sellCount)}</Text>
            <Text className="text-sm font-semibold text-sand-900">Total {inrFromPaise(billTotalPaise(bill))}</Text>
          </View>
          <AnimatedPressable
            testID="sell-open-confirm"
            onPress={() => canConfirm(bill) && setConfirmOpen(true)}
            disabled={!canConfirm(bill)}
            className={`rounded-2xl py-3.5 items-center ${canConfirm(bill) ? 'bg-ink-600' : 'bg-sand-300'}`}
            accessibilityLabel={`Mark ${items(sellCount)} sold`}
          >
            <Text className="text-sm font-bold text-white">Mark {items(sellCount)} sold</Text>
          </AnimatedPressable>
        </View>
      )}

      {pending && (
        <Modal transparent animationType="fade" visible onRequestClose={() => dispatch({ type: 'remove', key: pending.key })}>
          <View className="flex-1 bg-black/50 justify-end">
            <View className="bg-white rounded-t-3xl p-5" style={{ paddingBottom: insets.bottom + 16 }}>
              <Text className="text-base font-bold text-sand-900">Which size was sold?</Text>
              <Text className="text-xs text-sand-600 mb-3">{pending.product?.name ?? pending.sku}</Text>
              <View className="flex-row flex-wrap gap-2">
                {sizes.map((size) => (
                  <AnimatedPressable
                    key={size}
                    testID={`size-option-${size}`}
                    onPress={() => dispatch({ type: 'setSize', key: pending.key, size })}
                    className="min-w-[56px] h-12 px-4 rounded-2xl border border-lavender-300 items-center justify-center"
                    accessibilityLabel={`Size ${size}, ${pending.product ? stockFor(pending.product, size) : 0} in stock`}
                  >
                    <Text className="text-sm font-bold text-sand-900">{size}</Text>
                  </AnimatedPressable>
                ))}
              </View>
              <AnimatedPressable
                testID="size-cancel"
                onPress={() => dispatch({ type: 'remove', key: pending.key })}
                className="mt-4 py-3 items-center"
                accessibilityLabel="Cancel, do not add this item"
              >
                <Text className="text-sm font-semibold text-sand-600">Cancel</Text>
              </AnimatedPressable>
            </View>
          </View>
        </Modal>
      )}

      {confirmOpen && (
        <Modal transparent animationType="fade" visible onRequestClose={() => !submitting && setConfirmOpen(false)}>
          <View className="flex-1 bg-black/50 justify-end">
            <View className="bg-white rounded-t-3xl p-5" style={{ paddingBottom: insets.bottom + 16 }}>
              <Text className="text-base font-bold text-sand-900">
                Mark {sellCount} {sellCount === 1 ? 'article' : 'articles'} as sold?
              </Text>
              <Text className="text-sm text-sand-600 mt-1 mb-4">This updates your catalog.</Text>
              <View className="flex-row gap-3">
                <AnimatedPressable
                  testID="sell-cancel"
                  onPress={() => setConfirmOpen(false)}
                  disabled={submitting}
                  className="flex-1 border border-lavender-300 rounded-2xl py-3.5 items-center"
                  accessibilityLabel="Cancel"
                >
                  <Text className="text-sm font-bold text-sand-900">Cancel</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  testID="sell-confirm"
                  onPress={() => void handleConfirm()}
                  disabled={submitting}
                  className="flex-1 bg-ink-600 rounded-2xl py-3.5 items-center"
                  accessibilityLabel="Confirm: mark as sold"
                >
                  <Text className="text-sm font-bold text-white">{submitting ? 'Saving…' : 'Confirm'}</Text>
                </AnimatedPressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </KeyboardScreen>
  )
}
