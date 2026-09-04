const numberFormatter = new Intl.NumberFormat('en-US')
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

/** Compact locale-aware integer formatting for dashboard counts. */
export function formatNumber(num: number): string {
  return numberFormatter.format(num || 0)
}

/** Whole-dollar formatting for revenue figures stored as integer cents. */
export function formatCurrency(cents: number): string {
  return currencyFormatter.format((cents || 0) / 100)
}
