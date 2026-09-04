/**
 * Pure Apple App Site Association (AASA) manifest logic.
 *
 * Kept separate from the route handler so it is unit-testable in the node
 * vitest environment (no DOM). The route stays a thin DB + response wrapper.
 */

export interface DeepLinkAppRow {
  bundleId: string | null
  appleTeamId: string | null
  iosAssociatedDomainsJson: string | null
}

export interface AasaAppLinkDetail {
  appID: string
  paths: string[]
}

export interface AasaManifest {
  applinks: { apps: never[]; details: AasaAppLinkDetail[] }
  webcredentials: { apps: string[] }
  appclips: { apps: string[] }
}

export const FALLBACK_APP_ID = 'TEAMID.com.quicklink.app'
export const FALLBACK_CLIP_ID = 'TEAMID.com.quicklink.app.Clip'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Parse a stored `iosAssociatedDomainsJson` override. Returns the parsed
 * detail entries only when they are a well-formed array; otherwise null so
 * callers fall back to bundleId/teamId derivation.
 */
export function parseAssociatedDomainsJson(raw: string | null): AasaAppLinkDetail[] | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  const details: AasaAppLinkDetail[] = []
  for (const entry of parsed) {
    if (!isRecord(entry)) continue
    const appID = entry['appID']
    if (typeof appID !== 'string' || !appID.trim()) continue
    const paths = entry['paths']
    details.push({
      appID: appID.trim(),
      paths: Array.isArray(paths) ? paths.filter((p): p is string => typeof p === 'string') : ['/*'],
    })
  }
  return details
}

/** Derive applinks details for enabled apps, skipping rows without an appID. */
export function buildAasaDetails(apps: DeepLinkAppRow[]): AasaAppLinkDetail[] {
  const details: AasaAppLinkDetail[] = []
  for (const app of apps) {
    const override = parseAssociatedDomainsJson(app.iosAssociatedDomainsJson)
    if (override) {
      details.push(...override)
      continue
    }
    if (!app.bundleId?.trim() || !app.appleTeamId?.trim()) continue
    details.push({
      appID: `${app.appleTeamId.trim()}.${app.bundleId.trim()}`,
      paths: ['/*'],
    })
  }
  return details.length > 0
    ? details
    : [{ appID: FALLBACK_APP_ID, paths: ['/m/*'] }]
}

/** Build the full AASA manifest with safe fallbacks when no apps are configured. */
export function buildAasaManifest(apps: DeepLinkAppRow[]): AasaManifest {
  const details = buildAasaDetails(apps)
  const appIds = details.map((d) => d.appID).filter(Boolean)
  return {
    applinks: { apps: [], details },
    webcredentials: { apps: appIds.length > 0 ? appIds : [FALLBACK_APP_ID] },
    appclips: { apps: [FALLBACK_CLIP_ID] },
  }
}
