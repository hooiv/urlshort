/**
 * Recurring weekly schedules for routing rules ("Mon-Fri 09:00-17:00 Asia/Kolkata").
 *
 * Stored as one compact string so it travels through the redirect cache and the
 * edge config unchanged. Evaluation uses Intl with the rule's IANA timezone, so
 * daylight-saving transitions are handled by the platform, not by offset maths.
 * Windows may cross midnight (22:00-02:00): the part after midnight belongs to
 * the day the window started on.
 */

export const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
const MAX_WINDOWS = 14

export type ScheduleWindow = { days: number[]; startMin: number; endMin: number }
export type RuleSchedule = { timezone: string; windows: ScheduleWindow[] }

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz.length <= 64
  } catch {
    return false
  }
}

function parseTime(value: string): number {
  const m = /^([01]?\d|2[0-4]):([0-5]\d)$/.exec(value)
  if (!m) throw new Error(`Invalid time "${value}", use HH:MM`)
  const mins = Number(m[1]) * 60 + Number(m[2])
  if (mins > 1440) throw new Error(`Invalid time "${value}"`)
  return mins
}

function parseDays(spec: string): number[] {
  const out = new Set<number>()
  for (const part of spec.toLowerCase().split(',')) {
    const range = part.trim().split('-')
    if (range.length === 1) {
      const d = DAY_NAMES.indexOf(range[0] as (typeof DAY_NAMES)[number])
      if (d < 0) throw new Error(`Unknown day "${part.trim()}"`)
      out.add(d)
    } else if (range.length === 2) {
      const a = DAY_NAMES.indexOf(range[0] as (typeof DAY_NAMES)[number])
      const b = DAY_NAMES.indexOf(range[1] as (typeof DAY_NAMES)[number])
      if (a < 0 || b < 0) throw new Error(`Unknown day range "${part.trim()}"`)
      for (let d = a; ; d = (d + 1) % 7) {
        out.add(d)
        if (d === b) break
      }
    } else throw new Error(`Invalid day range "${part.trim()}"`)
  }
  if (!out.size) throw new Error('Pick at least one day')
  return [...out].sort((x, y) => x - y)
}

/** Grammar: `<tz>|<days> <HH:MM>-<HH:MM>[;<days> <HH:MM>-<HH:MM>...]` e.g. `Asia/Kolkata|mon-fri 09:00-17:00;sat 10:00-14:00`. */
export function parseRuleSchedule(input: string): RuleSchedule {
  const raw = input.trim()
  const sep = raw.indexOf('|')
  if (sep < 1) throw new Error('Schedule must look like "Timezone|mon-fri 09:00-17:00"')
  const timezone = raw.slice(0, sep).trim()
  if (!isValidTimezone(timezone)) throw new Error(`Unknown timezone "${timezone}"`)
  const windows = raw
    .slice(sep + 1)
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk): ScheduleWindow => {
      const m = /^(\S+)\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/.exec(chunk)
      if (!m) throw new Error(`Invalid window "${chunk}"`)
      const startMin = parseTime(m[2])
      const endMin = parseTime(m[3])
      if (startMin === endMin) throw new Error('Window start and end must differ')
      if (startMin >= 1440) throw new Error('Window must start before 24:00')
      return { days: parseDays(m[1]), startMin, endMin }
    })
  if (!windows.length) throw new Error('Add at least one time window')
  if (windows.length > MAX_WINDOWS) throw new Error(`At most ${MAX_WINDOWS} windows`)
  return { timezone, windows }
}

/** Canonical string form (sorted, lowercased days); null for empty input. Throws on invalid. */
export function normalizeRuleSchedule(input: unknown): string | null {
  if (input === undefined || input === null) return null
  const text = String(input).trim()
  if (!text) return null
  if (text.length > 400) throw new Error('Schedule is too long')
  const s = parseRuleSchedule(text)
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return `${s.timezone}|${s.windows.map((w) => `${w.days.map((d) => DAY_NAMES[d]).join(',')} ${fmt(w.startMin)}-${fmt(w.endMin)}`).join(';')}`
}

const partsCache = new Map<string, Intl.DateTimeFormat>()
function localParts(tz: string, at: Date): { day: number; minutes: number } {
  let fmt = partsCache.get(tz)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    partsCache.set(tz, fmt)
  }
  let weekday = ''
  let hour = 0
  let minute = 0
  for (const p of fmt.formatToParts(at)) {
    if (p.type === 'weekday') weekday = p.value.toLowerCase().slice(0, 3)
    else if (p.type === 'hour') hour = Number(p.value) % 24
    else if (p.type === 'minute') minute = Number(p.value)
  }
  return { day: DAY_NAMES.indexOf(weekday as (typeof DAY_NAMES)[number]), minutes: hour * 60 + minute }
}

/** True when `at` falls inside any window. Unparseable schedules fail open (rule stays eligible) so a bad value never blackholes traffic. */
export function isWithinRuleSchedule(schedule: string | null | undefined, at: Date): boolean {
  if (!schedule) return true
  let parsed: RuleSchedule
  try {
    parsed = parseRuleSchedule(schedule)
  } catch {
    return true
  }
  const { day, minutes } = localParts(parsed.timezone, at)
  const prevDay = (day + 6) % 7
  return parsed.windows.some((w) => {
    if (w.startMin < w.endMin) return w.days.includes(day) && minutes >= w.startMin && minutes < w.endMin
    // crosses midnight: evening part on start day, morning part on the next day
    return (w.days.includes(day) && minutes >= w.startMin) || (w.days.includes(prevDay) && minutes < w.endMin)
  })
}
