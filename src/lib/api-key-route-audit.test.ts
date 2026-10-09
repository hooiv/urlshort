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
  'analytics/[shortCode]/route.ts',
  'analytics/route.ts',
  'bulk/route.ts',
  'links/[shortCode]/domains/connect/route.ts',
  'links/[shortCode]/domains/route.ts',
  'links/[shortCode]/export/route.ts',
  'links/[shortCode]/folder/route.ts',
  'links/[shortCode]/goals/[goalId]/route.ts',
  'links/[shortCode]/goals/route.ts',
  'links/[shortCode]/promote/route.ts',
  'links/[shortCode]/qr/route.ts',
  'links/[shortCode]/revisions/route.ts',
  'links/[shortCode]/route.ts',
  'links/[shortCode]/routing/conflicts/route.ts',
  'links/[shortCode]/routing/preview/route.ts',
  'links/[shortCode]/rules/[ruleId]/route.ts',
  'links/[shortCode]/rules/route.ts',
  'links/[shortCode]/safety/route.ts',
  'mcp/route.ts',
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
  'webhooks/route.ts',
  'workspaces/route.ts',
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
      const readRoles = /getManageableUrl\([^)]*READ_ROLES\)|canManageUrl\([^)]*READ_ROLES\)/.test(route.source)
      expect(readRoles, `${route.path} exports ${mutating.join('/')} but authorizes with READ_ROLES (a read-only key could mutate)`).toBe(false)
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
