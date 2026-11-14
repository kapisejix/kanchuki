import { describe, it, expect } from 'vitest'
import {
  billReducer,
  emptyBill,
  canConfirm,
  toSellLines,
  billTotalPaise,
  lineState,
  MAX_BILL_LINES,
  newBillId,
  type SellProduct,
  type BillState,
} from './sell-bill'

const prod = (over: Partial<SellProduct> = {}): SellProduct => ({
  id: 'p1',
  name: 'Pink suit',
  sku: 'LS0001',
  price_min: 200000,
  status: 'AVAILABLE',
  primary_photo_url: null,
  stock: [{ size: 'FREE', quantity: 3 }],
  ...over,
})

const multi = (): SellProduct =>
  prod({
    id: 'p2',
    sku: 'LS0002',
    stock: [
      { size: 'S', quantity: 0 },
      { size: 'M', quantity: 2 },
      { size: 'L', quantity: 1 },
    ],
  })

const add = (s: BillState, sku: string, product: SellProduct | null) =>
  billReducer(s, { type: 'add', sku, product })

describe('billReducer', () => {
  it('adds a single-size product directly with qty 1', () => {
    const s = add(emptyBill, 'LS0001', prod())
    expect(s.lines).toHaveLength(1)
    expect(s.lines[0]).toMatchObject({ size: 'FREE', qty: 1 })
    expect(lineState(s.lines[0]!)).toBe('ok')
  })

  it('same SKU+size increments and is capped at stock', () => {
    let s = emptyBill
    for (let i = 0; i < 5; i++) s = add(s, 'LS0001', prod())
    expect(s.lines).toHaveLength(1)
    expect(s.lines[0]!.qty).toBe(3)
  })

  it('untracked product (no stock rows) sells as FREE and never exceeds 1', () => {
    let s = add(emptyBill, 'LS0001', prod({ stock: [] }))
    s = add(s, 'LS0001', prod({ stock: [] }))
    expect(s.lines[0]).toMatchObject({ size: 'FREE', qty: 1 })
  })

  it('multi-size product adds an unresolved line that blocks confirm', () => {
    const s = add(emptyBill, 'LS0002', multi())
    expect(s.lines[0]!.size).toBeNull()
    expect(lineState(s.lines[0]!)).toBe('needs_size')
    expect(canConfirm(s)).toBe(false)
  })

  it('a second scan of an unresolved product does not add another line', () => {
    let s = add(emptyBill, 'LS0002', multi())
    s = add(s, 'LS0002', multi())
    expect(s.lines).toHaveLength(1)
  })

  it('setSize resolves the line and unblocks confirm', () => {
    let s = add(emptyBill, 'LS0002', multi())
    s = billReducer(s, { type: 'setSize', key: s.lines[0]!.key, size: 'M' })
    expect(s.lines[0]).toMatchObject({ size: 'M', qty: 1 })
    expect(canConfirm(s)).toBe(true)
  })

  it('setSize merges into an existing line of the same size, capped at stock', () => {
    let s = add(emptyBill, 'LS0002', multi())
    s = billReducer(s, { type: 'setSize', key: s.lines[0]!.key, size: 'L' })
    s = add(s, 'LS0002', multi())
    s = billReducer(s, { type: 'setSize', key: s.lines[1]!.key, size: 'L' })
    expect(s.lines).toHaveLength(1)
    expect(s.lines[0]!.qty).toBe(1) // L has only 1
  })

  it('setSize refuses a size with no stock', () => {
    const s = add(emptyBill, 'LS0002', multi())
    const next = billReducer(s, { type: 'setSize', key: s.lines[0]!.key, size: 'S' })
    expect(next).toEqual(s)
  })

  it('inc is capped at stock, dec stops at 1', () => {
    let s = add(emptyBill, 'LS0001', prod())
    const key = s.lines[0]!.key
    for (let i = 0; i < 6; i++) s = billReducer(s, { type: 'inc', key })
    expect(s.lines[0]!.qty).toBe(3)
    for (let i = 0; i < 6; i++) s = billReducer(s, { type: 'dec', key })
    expect(s.lines[0]!.qty).toBe(1)
  })

  it('remove deletes the line; reset empties the bill', () => {
    let s = add(emptyBill, 'LS0001', prod())
    s = billReducer(s, { type: 'remove', key: s.lines[0]!.key })
    expect(s.lines).toHaveLength(0)
    s = add(s, 'LS0001', prod())
    expect(billReducer(s, { type: 'reset' }).lines).toHaveLength(0)
  })

  it('already-sold product is a sold_out row, excluded from the sale', () => {
    const sold = prod({ status: 'SOLD' })
    const zero = prod({ id: 'p3', sku: 'LS0003', stock: [{ size: 'M', quantity: 0 }] })
    let s = add(emptyBill, 'LS0001', sold)
    s = add(s, 'LS0003', zero)
    expect(s.lines.map(lineState)).toEqual(['sold_out', 'sold_out'])
    expect(toSellLines(s)).toEqual([])
    expect(canConfirm(s)).toBe(false)
  })

  it('unknown SKU is a not_found row, deduped, excluded from the sale', () => {
    let s = add(emptyBill, 'LS0099', null)
    s = add(s, 'LS0099', null)
    expect(s.lines).toHaveLength(1)
    expect(lineState(s.lines[0]!)).toBe('not_found')
    expect(toSellLines(s)).toEqual([])
  })

  it('bad rows do not block confirm when a good row exists', () => {
    let s = add(emptyBill, 'LS0099', null)
    s = add(s, 'LS0001', prod())
    expect(canConfirm(s)).toBe(true)
    expect(toSellLines(s)).toEqual([{ product_id: 'p1', size: 'FREE', quantity: 1 }])
  })

  it('total is price_min x qty of sellable rows only (null price = 0)', () => {
    let s = add(emptyBill, 'LS0001', prod())
    s = billReducer(s, { type: 'inc', key: s.lines[0]!.key })
    s = add(s, 'LS0005', prod({ id: 'p5', sku: 'LS0005', price_min: null }))
    s = add(s, 'LS0006', prod({ id: 'p6', sku: 'LS0006', status: 'SOLD' }))
    expect(billTotalPaise(s)).toBe(400000)
  })

  it('empty bill cannot be confirmed', () => {
    expect(canConfirm(emptyBill)).toBe(false)
  })

  it('stops adding new rows at the server cap of 100 lines', () => {
    let s = emptyBill
    for (let i = 0; i < MAX_BILL_LINES + 5; i++) {
      s = add(s, `LS${i}`, prod({ id: `p${i}`, sku: `LS${i}` }))
    }
    expect(s.lines).toHaveLength(MAX_BILL_LINES)
  })
})

describe('newBillId', () => {
  it('is unique per call and passes the server pattern (A-Za-z0-9_- , max 64)', () => {
    const a = newBillId()
    const b = newBillId()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
  })
})
