/** Pure display helpers for the expiring-links page. */
export function formatTimeLeft(ms: number | null): string {
  if (ms === null) return ''
  if (ms <= 0) return 'expired'
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${Math.max(m, 1)}m left`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h left`
  return `${Math.floor(h / 24)}d left`
}

export function urgency(ms: number | null, remaining: number | null): 'critical' | 'warning' | 'ok' {
  if ((ms !== null && ms < 86_400_000) || (remaining !== null && remaining <= 10)) return 'critical'
  if ((ms !== null && ms < 3 * 86_400_000) || remaining !== null) return 'warning'
  return 'ok'
}
