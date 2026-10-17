import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { sendEmail, type EmailMessage } from '@/lib/email'

export type DeviceInfo = { browser: string; os: string; label: string }

/** Coarse browser/OS family from a User-Agent. Versions are dropped on purpose so routine updates don't trigger alerts. */
export function parseDevice(userAgent: string | null | undefined): DeviceInfo {
  const ua = (userAgent ?? '').slice(0, 512)
  if (!ua) return { browser: 'Unknown browser', os: 'Unknown OS', label: 'Unknown device' }
  const browser =
    /Edg(e|A|iOS)?\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /(Firefox|FxiOS)\//.test(ua) ? 'Firefox'
    : /(Chrome|CriOS)\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : /curl\//i.test(ua) ? 'curl'
    : 'Unknown browser'
  const os =
    /Windows/.test(ua) ? 'Windows'
    : /(iPhone|iPad|iPod)/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /CrOS/.test(ua) ? 'ChromeOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'Unknown OS'
  return { browser, os, label: `${browser} on ${os}` }
}

export function deviceFingerprint(userAgent: string | null | undefined): string {
  const { browser, os } = parseDevice(userAgent)
  return createHash('sha256').update(`${browser}|${os}`).digest('hex').slice(0, 16)
}

/** Pure decision: alert only when the user has signed in before and never from this device family. */
export function shouldAlertNewDevice(priorFingerprints: ReadonlyArray<string | null | undefined>, current: string): boolean {
  const known = priorFingerprints.filter((value): value is string => typeof value === 'string' && value.length > 0)
  // Logins recorded before fingerprints existed carry none; treat them as "signed in before" only if we have any history at all.
  if (priorFingerprints.length === 0) return false
  return !known.includes(current)
}

export function renderNewDeviceEmail(params: { device: DeviceInfo; when: Date; securityUrl: string }): EmailMessage {
  return {
    to: '',
    subject: 'New sign-in to your QuickLink account',
    text: [
      `Your account was just signed in to from a new device: ${params.device.label}.`,
      `Time: ${params.when.toISOString()}`,
      '',
      'If this was you, no action is needed.',
      `If not, change your password and sign out other sessions here: ${params.securityUrl}`,
    ].join('\n'),
  }
}

function fingerprintFromMetadata(json: string | null): string | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as { device?: unknown }
    return typeof parsed.device === 'string' ? parsed.device : null
  } catch { return null }
}

/** Looks up prior logins and emails the user if this device family is new. Never throws. */
export async function notifyIfNewDevice(user: { id: string; email: string }, userAgent: string | null, baseUrl: string): Promise<boolean> {
  try {
    const fingerprint = deviceFingerprint(userAgent)
    const prior = await prisma.auditEvent.findMany({
      where: { actorUserId: user.id, action: 'auth.login' },
      select: { metadataJson: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    if (!shouldAlertNewDevice(prior.map((row) => fingerprintFromMetadata(row.metadataJson)), fingerprint)) return false
    const message = renderNewDeviceEmail({ device: parseDevice(userAgent), when: new Date(), securityUrl: `${baseUrl.replace(/\/$/, '')}/account/security` })
    return await sendEmail({ ...message, to: user.email })
  } catch (error) {
    console.error('New-device alert failed:', error)
    return false
  }
}
