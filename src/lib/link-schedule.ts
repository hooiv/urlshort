/**
 * Scheduled launch window for a link: it only routes between `startsAt` and `expiresAt`.
 * Before the start, visitors go to `notStartedUrl` (e.g. a teaser page) or the hosted
 * /coming-soon page. Pure helpers so redirect, API and UI share one definition.
 */
export type LinkWindowState = 'scheduled' | 'live' | 'expired'

export function parseStartsAt(input: unknown): Date | null {
  if (input === null || input === undefined || input === '') return null
  const parsed = new Date(String(input))
  if (Number.isNaN(parsed.getTime())) throw new Error('Invalid start date')
  return parsed
}

/** Throws when the window is impossible (start at or after expiry). */
export function assertValidWindow(startsAt: Date | null, expiresAt: Date | null): void {
  if (startsAt && expiresAt && startsAt.getTime() >= expiresAt.getTime()) {
    throw new Error('Start date must be before the expiration date')
  }
}

export function linkWindowState(
  link: { startsAt?: Date | null; expiresAt?: Date | null },
  now: Date = new Date(),
): LinkWindowState {
  if (link.startsAt && now.getTime() < link.startsAt.getTime()) return 'scheduled'
  if (link.expiresAt && now.getTime() > link.expiresAt.getTime()) return 'expired'
  return 'live'
}

/** Where a visitor goes when the link has not started yet. */
export function notStartedTarget(link: { notStartedUrl?: string | null }, baseUrl: string): string {
  return link.notStartedUrl || new URL('/coming-soon', baseUrl).toString()
}
