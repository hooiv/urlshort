/**
 * Timed destination swaps: "send traffic to A until 9am Friday, then to B".
 * Stored as a JSON array on the link and resolved at click time (no cron, so
 * the switch is exact to the request). Pure so redirect, edge and API share it.
 */
export interface DestinationStep {
  at: string // ISO instant
  url: string
}

export const MAX_DESTINATION_STEPS = 20

export type DestinationScheduleParse =
  | { ok: true; steps: DestinationStep[] | null }
  | { ok: false; error: string }

/**
 * Validate and canonicalise user input: sorted by time, unique instants, each
 * URL passed through `normalize` (which should throw on unsafe URLs).
 */
export function parseDestinationSchedule(
  input: unknown,
  normalize: (url: string) => string,
): DestinationScheduleParse {
  if (input === null || input === undefined) return { ok: true, steps: null }
  if (!Array.isArray(input)) return { ok: false, error: 'destinationSchedule must be an array' }
  if (input.length === 0) return { ok: true, steps: null }
  if (input.length > MAX_DESTINATION_STEPS) {
    return { ok: false, error: `At most ${MAX_DESTINATION_STEPS} scheduled destinations are allowed` }
  }
  const steps: DestinationStep[] = []
  const seen = new Set<number>()
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'Each scheduled destination needs at and url' }
    const { at, url } = raw as { at?: unknown; url?: unknown }
    if (typeof at !== 'string' || typeof url !== 'string' || !url.trim()) {
      return { ok: false, error: 'Each scheduled destination needs at and url' }
    }
    const time = new Date(at).getTime()
    if (Number.isNaN(time)) return { ok: false, error: `Invalid schedule time: ${at}` }
    if (seen.has(time)) return { ok: false, error: 'Two scheduled destinations share the same time' }
    seen.add(time)
    let normalized: string
    try {
      normalized = normalize(url)
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Invalid scheduled URL' }
    }
    steps.push({ at: new Date(time).toISOString(), url: normalized })
  }
  steps.sort((a, b) => a.at.localeCompare(b.at))
  return { ok: true, steps }
}

/** Tolerant read of the stored JSON (never throws on corrupt data). */
export function readDestinationSchedule(value: unknown): DestinationStep[] {
  if (!Array.isArray(value)) return []
  const out: DestinationStep[] = []
  for (const v of value) {
    if (v && typeof v === 'object' && typeof (v as DestinationStep).at === 'string' && typeof (v as DestinationStep).url === 'string') {
      if (!Number.isNaN(new Date((v as DestinationStep).at).getTime())) out.push(v as DestinationStep)
    }
  }
  return out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
}

/** The url of the latest step whose time has passed, or null before the first. */
export function activeScheduledDestination(value: unknown, now: Date = new Date()): string | null {
  const t = now.getTime()
  let active: string | null = null
  for (const step of readDestinationSchedule(value)) {
    if (new Date(step.at).getTime() <= t) active = step.url
    else break
  }
  return active
}

/** The next pending swap, for UI/"coming up" display. */
export function nextScheduledSwap(value: unknown, now: Date = new Date()): DestinationStep | null {
  const t = now.getTime()
  return readDestinationSchedule(value).find((s) => new Date(s.at).getTime() > t) ?? null
}
