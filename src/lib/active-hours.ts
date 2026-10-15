/**
 * Weekly "active hours" schedule for a link: the link redirects only inside
 * the configured windows (evaluated in an IANA timezone, DST-aware) and sends
 * visitors to a fallback otherwise. Example: a store-hours promo, Mon–Fri 09:00–17:30.
 */
export interface ActiveWindow {
  /** 0 = Sunday … 6 = Saturday */
  days: number[]
  /** "HH:MM" 24h, inclusive start */
  start: string
  /** "HH:MM" 24h, exclusive end; an end <= start wraps past midnight */
  end: string
}
export interface ActiveHours {
  timezone: string
  windows: ActiveWindow[]
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/
const MAX_WINDOWS = 14

const toMinutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3))

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Validates and normalises input (sorted unique days). Throws a user-facing Error. */
export function parseActiveHours(input: unknown): ActiveHours | null {
  if (input === null || input === undefined) return null
  if (typeof input !== 'object') throw new Error('activeHours must be an object')
  const { timezone, windows } = input as Record<string, unknown>
  if (typeof timezone !== 'string' || !isValidTimezone(timezone)) throw new Error('activeHours.timezone must be a valid IANA timezone')
  if (!Array.isArray(windows) || windows.length === 0) return null
  if (windows.length > MAX_WINDOWS) throw new Error(`activeHours allows at most ${MAX_WINDOWS} windows`)
  const out: ActiveWindow[] = windows.map((w, i) => {
    const { days, start, end } = (w ?? {}) as Record<string, unknown>
    if (!Array.isArray(days) || days.length === 0 || !days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
      throw new Error(`activeHours.windows[${i}].days must be integers 0-6`)
    }
    if (typeof start !== 'string' || !HHMM.test(start) || typeof end !== 'string' || !HHMM.test(end)) {
      throw new Error(`activeHours.windows[${i}] start/end must be HH:MM`)
    }
    if (start === end) throw new Error(`activeHours.windows[${i}] start and end must differ`)
    return { days: [...new Set(days as number[])].sort((a, b) => a - b), start, end }
  })
  return { timezone, windows: out }
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const fmtCache = new Map<string, Intl.DateTimeFormat>()

function localParts(at: Date, tz: string): { day: number; minutes: number } {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    fmtCache.set(tz, f)
  }
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]))
  return { day: WEEKDAYS[p.weekday], minutes: Number(p.hour) * 60 + Number(p.minute) }
}

/** True when `at` falls inside any window. Overnight windows belong to the day they start on. */
export function isWithinActiveHours(cfg: ActiveHours | null | undefined, at: Date = new Date()): boolean {
  if (!cfg || cfg.windows.length === 0) return true
  const { day, minutes } = localParts(at, cfg.timezone)
  const prev = (day + 6) % 7
  for (const w of cfg.windows) {
    const s = toMinutes(w.start)
    const e = toMinutes(w.end)
    if (s < e) {
      if (w.days.includes(day) && minutes >= s && minutes < e) return true
    } else {
      if (w.days.includes(day) && minutes >= s) return true
      if (w.days.includes(prev) && minutes < e) return true
    }
  }
  return false
}

/** Next instant (minute resolution, within 8 days) the link becomes active, or null if never. */
export function nextActiveAt(cfg: ActiveHours | null | undefined, from: Date = new Date()): Date | null {
  if (!cfg || cfg.windows.length === 0) return from
  const start = new Date(Math.floor(from.getTime() / 60000) * 60000)
  for (let m = 0; m <= 8 * 24 * 60; m++) {
    const t = new Date(start.getTime() + m * 60000)
    if (isWithinActiveHours(cfg, t)) return t
  }
  return null
}
