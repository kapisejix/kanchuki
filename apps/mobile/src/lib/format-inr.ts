// The API stores and returns money as integer paise (SubscriptionPayment.gst_amount,
// amount_inr, ...). Defensive: the API may omit fields on empty ledgers, so a
// missing/NaN value renders ₹0 instead of crashing the screen (RC-109).
export const inrFromPaise = (paise?: number | null): string => {
  if (paise == null || Number.isNaN(paise)) return '₹0'
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}
