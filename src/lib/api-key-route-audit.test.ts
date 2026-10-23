import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Static audit of every /api route that can be reached with an API key.
 *
 * Keys must only act within their scopes. Two helpers enforce that:
 *  - resolveActor(request, SCOPES)      → explicit scope list per call
 *  - getManageableUrl / canManageUrl    → READ_ROLES ⇒ read scopes, anything else ⇒ links:write
 * The failure modes this test closes: a new route silently becoming key-reachable,
 * a state-changing handler guarded only by READ_ROLES (a read-only key could then
 * mutate), and resolveActor called with an inline/empty scope list.
 */

const API_ROOT = join(process.cwd(), 'src', 'app', 'api')
const MUTATING = ['POST', 'PUT', 'PATCH', 'DELETE'] as const
const KEY_HELPERS = /\b(resolveActor|getManageableUrl|canManageUrl|authenticateApiKey|hasAnyApiScope|hasApiScope)\s*\(/
const KNOWN_SCOPE_CONSTANTS = ['LINK_READ_SCOPES', 'LINK_WRITE_SCOPES', 'WEBHOOK_SCOPES', 'ANALYTICS_READ_SCOPES']

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return routeFiles(full)
    return name === 'route.ts' ? [full] : []
  })
}

const routes = routeFiles(API_ROOT).map((file) => ({
  path: relative(API_ROOT, file).split(sep).join('/'),
  source: readFileSync(file, 'utf8'),
}))

function exportedMethods(source: string): string[] {
  const found = new Set<string>()
  for (const m of source.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)) found.add(m[1])
  for (const m of source.matchAll(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)) found.add(m[1])
  return [...found]
}

/** Source of one exported handler: from its declaration to the next top-level export. */
function handlerBody(source: string, method: string): string {
  const start = source.search(new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${method}\\b`))
  if (start < 0) return ''
  const rest = source.slice(start + 1)
  const next = rest.search(/\nexport\s/)
  return next < 0 ? rest : rest.slice(0, next)
}

/** Reviewed list of routes an API key can reach. Adding one means reviewing its scope checks. */
const KEY_REACHABLE = [
  'analytics/[shortCode]/insights/route.ts',
  'bulk/edit/undo/route.ts',
  'experiments/sample-size/route.ts',
  'links/[shortCode]/experiment/route.ts',
  'links/utm-hygiene/route.ts',
  'analytics/[shortCode]/forecast/route.ts',
  'analytics/compare/route.ts',
  'analytics/insecure/route.ts',
  'analytics/utm-coverage/route.ts',
  'links/attention/route.ts',
  'links/bulk-clone/route.ts',
  'links/chains/route.ts',
  'links/preflight/route.ts', // POST is a read-only dry-run (validates, never writes)
  'links/[shortCode]/click-target/route.ts', // writes go through getManageableUrl scope checks
  'links/insecure/route.ts',
  'links/missing-previews/route.ts',
  'links/tracking-params/route.ts',
  'links/lookup/route.ts',
  'links/qr-zip/route.ts',
  'links/untagged/route.ts',
  'links/never-clicked/route.ts',
  'links/expired/route.ts',
  'links/near-cap/route.ts',
  'links/unfiled/route.ts',
  'commissions/forecast/route.ts',
  'commissions/risk/route.ts',
  'links/[shortCode]/extend/route.ts',
  'links/slug-collisions/route.ts',
  'links/protected/route.ts',
  'links/single-use/route.ts',
  'links/scheduled/route.ts',
  'links/paused/route.ts',
  'views/[id]/route.ts',
  'views/route.ts',
  'analytics/[shortCode]/route.ts',
  'analytics/[shortCode]/heatmap/route.ts',
  'analytics/[shortCode]/funnel/route.ts',
  'analytics/[shortCode]/clicks/route.ts',
  'analytics/qr-scans/route.ts',
  'links/trace/route.ts',
  'analytics/[shortCode]/utm/route.ts',
  'analytics/[shortCode]/channels/route.ts',
  'analytics/[shortCode]/visitors/route.ts',
  'analytics/[shortCode]/compare/route.ts',
  'analytics/route.ts',
  'analytics/trending/route.ts',
  'analytics/stale/route.ts',
  'analytics/spikes/route.ts',
  'analytics/lifespan/route.ts',
  'analytics/concentration/route.ts',
  'analytics/drops/route.ts',
  'analytics/broken/route.ts',
  'analytics/tags/route.ts',
  'analytics/folders/route.ts',
  'analytics/countries/route.ts',
  'analytics/cities/route.ts',
  'analytics/referrers/route.ts',
  'analytics/referrer-spam/route.ts',
  'analytics/conversions/route.ts',
  'analytics/tech/route.ts',
  'analytics/traffic-quality/route.ts',
  'links/duplicates/route.ts',
  'links/export/route.ts',
  'links/hygiene/route.ts',
  'analytics/creators/route.ts',
  'analytics/languages/route.ts',
  'links/[shortCode]/clone/route.ts',
  'links/[shortCode]/move/route.ts',
  'links/internal-urls/route.ts',
  'links/long-urls/route.ts',
  'links/[shortCode]/rename/route.ts',
  'links/[shortCode]/revert/route.ts',
  'tags/rename/route.ts',
  'tags/route.ts',
  'tags/suggest/route.ts',
  'links/[shortCode]/activity/route.ts',
  'links/[shortCode]/restore/route.ts',
  'links/trash/route.ts',
  'bulk/route.ts',
  'bulk/edit/route.ts',
  'links/expiring/route.ts',
  'links/[shortCode]/domains/connect/route.ts',
  'links/[shortCode]/public-stats/route.ts',
  'links/[shortCode]/domains/route.ts',
  'links/[shortCode]/domain-settings/route.ts',
  'links/[shortCode]/export/route.ts',
  'workspaces/[workspaceId]/utm-templates/route.ts',   // GET only, LINK_READ_SCOPES; writes are session-only
  'links/[shortCode]/folder/route.ts',
  'links/[shortCode]/goals/[goalId]/route.ts',
  'links/[shortCode]/goals/route.ts',
  'links/[shortCode]/promote/route.ts',
  'links/[shortCode]/qr/render/route.ts',
  'links/[shortCode]/qr/route.ts',
  'links/[shortCode]/import-clicks/route.ts',
  'links/[shortCode]/revisions/route.ts',
  'links/[shortCode]/route.ts',
  'links/[shortCode]/routing/conflicts/route.ts',
  'links/[shortCode]/routing/preview/route.ts',
  'links/[shortCode]/rules/[ruleId]/route.ts',
  'links/[shortCode]/rules/route.ts',
  'links/[shortCode]/safety/route.ts',
  'mcp/route.ts',
  'rewards/config/route.ts',
  'rewards/preview/route.ts',
  'commissions/export/route.ts',
  'commissions/statement/route.ts',
  'commissions/route.ts',
  'shorten/route.ts',
  'v1/campaigns/create/route.ts',
  'v1/campaigns/route.ts',
  'links/[shortCode]/webhook-test/route.ts',
  'webhooks/[id]/deliveries/[deliveryId]/replay/route.ts',
  'webhooks/[id]/deliveries/[deliveryId]/route.ts',
  'webhooks/[id]/deliveries/replay-failed/route.ts',
  'webhooks/[id]/deliveries/route.ts',
  'webhooks/[id]/route.ts',
  'webhooks/[id]/test/route.ts',
  'webhooks/[id]/rotate-secret/route.ts',
  'webhooks/route.ts',
  'workspaces/route.ts',
  'zapier/hooks/[id]/route.ts',
  'zapier/hooks/route.ts',
  'zapier/me/route.ts',
  'zapier/triggers/[trigger]/route.ts',
]

describe('API key route audit', () => {
  const reachable = routes.filter((r) => KEY_HELPERS.test(r.source) || /@\/lib\/request-actor/.test(r.source))

  it('scans a plausible number of routes', () => {
    expect(routes.length).toBeGreaterThan(50)
  })

  it('only reviewed routes are reachable with an API key', () => {
    const found = reachable.map((r) => r.path).filter((p) => p !== 'workspaces/[workspaceId]/folders/route.ts').sort()
    const unreviewed = found.filter((p) => !KEY_REACHABLE.includes(p))
    expect(unreviewed, `New key-reachable routes need a scope review and an entry in KEY_REACHABLE: ${unreviewed.join(', ')}`).toEqual([])
  })

  it('reviewed routes still exist (no stale manifest entries)', () => {
    const paths = new Set(routes.map((r) => r.path))
    expect(KEY_REACHABLE.filter((p) => !paths.has(p))).toEqual([])
  })

  it('resolveActor is always called with a named scope constant', () => {
    for (const route of routes) {
      for (const m of route.source.matchAll(/resolveActor\(\s*[^,]+,\s*([^)]*)\)/g)) {
        expect(KNOWN_SCOPE_CONSTANTS, `${route.path} passes "${m[1].trim()}"`).toContain(m[1].trim())
      }
    }
  })

  it('state-changing handlers are never guarded by read-only roles or read scopes alone', () => {
    for (const route of routes) {
      const mutating = exportedMethods(route.source).filter((m) => (MUTATING as readonly string[]).includes(m))
      if (mutating.length === 0) continue
      // POST-only dry run that reads and writes nothing; read scopes are enough.
      if (route.path === 'rewards/preview/route.ts' || route.path === 'links/qr-zip/route.ts') continue
      const readRoles = /getManageableUrl\([^)]*READ_ROLES\)|canManageUrl\([^)]*READ_ROLES\)/.test(route.source)
      expect(readRoles, `${route.path} exports ${mutating.join('/')} but authorizes with READ_ROLES (a read-only key could mutate)`).toBe(false)
      if (route.path === 'links/preflight/route.ts') continue // dry-run only: nothing is created
      for (const method of mutating) {
        const body = handlerBody(route.source, method)
        const usesReadSet = /resolveActor\([^,]+,\s*(ANALYTICS_READ_SCOPES|LINK_READ_SCOPES)\)/.test(body)
        expect(usesReadSet, `${route.path} ${method} resolves its actor with read-only scopes`).toBe(false)
      }
    }
  })

  it('API keys can never mint, list or revoke API keys (session-only management)', () => {
    const route = routes.find((r) => r.path === 'account/api-keys/route.ts')
    expect(route).toBeDefined()
    expect(route!.source).not.toMatch(/authenticateApiKey|resolveActor|extractApiKey/)
    expect(route!.source).toMatch(/getCurrentUser/)
  })
})
