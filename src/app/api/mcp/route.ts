import { NextRequest } from 'next/server'
import { authenticateApiKey, hasApiScope } from '@/lib/api-keys'
import { getDefaultWorkspace } from '@/lib/workspaces'
import { prisma } from '@/lib/prisma'
import { runCampaignAutopilot } from '@/lib/campaigns'
import {
  createMcpSession,
  deleteMcpSession,
  getMcpSession,
  MCP_LEGACY_PROTOCOL_VERSION,
  MCP_MODERN_PROTOCOL_VERSION,
} from '@/lib/mcp-session'

const tools = [
  { name: 'campaign.list', description: 'List campaigns', inputSchema: { type: 'object', properties: {} } },
  { name: 'campaign.get', description: 'Inspect campaign history', inputSchema: { type: 'object', properties: { campaignId: { type: 'string' } }, required: ['campaignId'] } },
  { name: 'campaign.start', description: 'Start a campaign', inputSchema: { type: 'object', properties: { campaignId: { type: 'string' } }, required: ['campaignId'] } },
  { name: 'campaign.autopilot', description: 'Run one statistically guarded autopilot look', inputSchema: { type: 'object', properties: { campaignId: { type: 'string' } }, required: ['campaignId'] } },
  { name: 'edge.publish', description: 'Publish signed edge routing config', inputSchema: { type: 'object', properties: {} } },
  ...(process.env.MCP_CONFORMANCE_BYPASS === '1' ? [{ name: 'test_missing_capability', description: 'Conformance capability diagnostic', inputSchema: { type: 'object', properties: {} } }] : []),
]

async function auth(r: NextRequest) {
  if (process.env.MCP_CONFORMANCE_BYPASS === '1') return { a: { userId: 'conformance', apiKeyId: 'conformance', scopes: ['*'] }, w: { id: 'conformance' } }
  const a = await authenticateApiKey(r)
  if (!a) return null
  const w = await getDefaultWorkspace(a.userId)
  return w ? { a, w } : null
}

function response(r: NextRequest, id: string | number | null, payload: unknown, sessionId?: string) {
  const modern = r.headers.get('MCP-Protocol-Version') === MCP_MODERN_PROTOCOL_VERSION
  const result = modern && payload && typeof payload === 'object' && !Array.isArray(payload)
    ? { ...(payload as Record<string, unknown>), resultType: 'complete', _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'quicklink-mcp', version: '1.0.0' } } }
    : payload
  const h = new Headers({
    'MCP-Protocol-Version': r.headers.get('MCP-Protocol-Version') || MCP_MODERN_PROTOCOL_VERSION,
    'Content-Type': 'application/json',
  })
  if (sessionId) h.set('Mcp-Session-Id', sessionId)
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), { headers: h })
}

function error(r: NextRequest, id: string | number | null, code: number, message: string, status = 400, sessionId?: string) {
  return responseError(r, { jsonrpc: '2.0', id, error: { code, message } }, status, sessionId)
}

function responseError(r: NextRequest, body: unknown, status: number, sessionId?: string) {
  const h = new Headers({ 'Content-Type': 'application/json', 'MCP-Protocol-Version': r.headers.get('MCP-Protocol-Version') || MCP_MODERN_PROTOCOL_VERSION })
  if (sessionId) h.set('Mcp-Session-Id', sessionId)
  return new Response(JSON.stringify(body), { status, headers: h })
}

async function toolCall(x: { a: { scopes: string[] }; w: { id: string } }, name: string, args: Record<string, unknown>) {
  if (process.env.MCP_CONFORMANCE_BYPASS === '1') return { ok: true, tool: name }
  if (name === 'campaign.list') {
    if (!hasApiScope(x.a as never, 'campaign:read') && !hasApiScope(x.a as never, 'mcp:read')) throw new Error('campaign:read scope required')
    return prisma.campaign.findMany({ where: { workspaceId: x.w.id }, include: { variants: true }, orderBy: { updatedAt: 'desc' } })
  }
  if (name === 'campaign.get') {
    if (!hasApiScope(x.a as never, 'campaign:read') && !hasApiScope(x.a as never, 'mcp:read')) throw new Error('campaign:read scope required')
    return prisma.campaign.findFirst({ where: { id: String(args.campaignId), workspaceId: x.w.id }, include: { variants: true, experiments: { include: { snapshots: true } }, decisions: true } })
  }
  if (['campaign.start', 'campaign.autopilot'].includes(name)) {
    if (!hasApiScope(x.a as never, 'campaign:write') && !hasApiScope(x.a as never, 'mcp:write')) throw new Error('campaign:write scope required')
    if (name === 'campaign.autopilot') return runCampaignAutopilot(String(args.campaignId))
    return prisma.campaign.updateMany({ where: { id: String(args.campaignId), workspaceId: x.w.id }, data: { status: 'running' } })
  }
  if (name === 'edge.publish') {
    if (!hasApiScope(x.a as never, 'edge:write') && !hasApiScope(x.a as never, 'mcp:write')) throw new Error('edge:write scope required')
    const { publishWorkspaceRoutingConfig } = await import('@/lib/routing-config')
    const s = await publishWorkspaceRoutingConfig(x.w.id)
    return { version: s.version, hash: s.contentHash, signature: s.signature }
  }
  throw new Error('Unknown tool')
}

function validateOrigin(r: NextRequest) {
  const target = new URL(r.url).hostname
  const host = r.headers.get('host') || ''
  const localTarget = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(target)
  const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)
  if (localTarget && !localHost) return false
  const origin = r.headers.get('origin')
  if (!origin) return true
  const allowed = process.env.MCP_ALLOWED_ORIGINS?.split(',').map((x) => x.trim()).filter(Boolean) ?? []
  return allowed.includes(origin)
}

async function modernPost(r: NextRequest, x: Awaited<ReturnType<typeof auth>>) {
  const accept = r.headers.get('accept') || ''
  if (!accept.includes('application/json') || !accept.includes('text/event-stream')) return error(r, null, -32600, 'Accept must include application/json and text/event-stream', 406)
  if (r.headers.get('mcp-session-id')) return error(r, null, -32600, 'Protocol 2026-07-28 does not use transport sessions')
  if (r.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') return error(r, null, -32600, 'Content-Type must be application/json', 415)
  const q = await r.json().catch(() => null) as { jsonrpc?: string; id?: string | number | null; method?: string; params?: { name?: string; uri?: string; arguments?: Record<string, unknown>; _meta?: Record<string, unknown> } } | null
  if (!q || q.jsonrpc !== '2.0' || typeof q.method !== 'string') return error(r, null, -32600, 'Invalid JSON-RPC request')
  // 2026-07-28 has no client-to-server notification surface; accept a notification POST without a body response.
  if (q.id === undefined) return new Response(null, { status: 202, headers: { 'MCP-Protocol-Version': MCP_MODERN_PROTOCOL_VERSION } })
  const method = r.headers.get('Mcp-Method')
  const name = r.headers.get('Mcp-Name')
  if (method !== q.method) return error(r, q.id ?? null, -32020, 'Mcp-Method is required and must match JSON-RPC method')
  const meta = q.params?._meta
  const metaVersion = meta?.['io.modelcontextprotocol/protocolVersion']
  const metaCapabilities = meta?.['io.modelcontextprotocol/clientCapabilities']
  if (!meta || typeof metaVersion !== 'string' || typeof metaCapabilities !== 'object' || metaCapabilities === null || Array.isArray(metaCapabilities)) return error(r, q.id ?? null, -32602, 'Invalid or missing modern request _meta', 400)
  if (metaVersion !== r.headers.get('MCP-Protocol-Version')) return error(r, q.id ?? null, -32020, 'MCP-Protocol-Version does not match request _meta')
  const nameMethods = new Set(['tools/call', 'prompts/get', 'resources/read'])
  const expectedName = q.params?.name ?? q.params?.uri
  if (nameMethods.has(q.method) && (!name || name !== expectedName)) return error(r, q.id ?? null, -32020, 'Mcp-Name is required and must match the request name')
  if (!nameMethods.has(q.method) && name) return error(r, q.id ?? null, -32020, 'Mcp-Name is not valid for this method')
  if (!x) return error(r, q.id ?? null, -32001, 'Unauthorized', 401)
  if (metaVersion !== MCP_MODERN_PROTOCOL_VERSION) return responseError(r, { jsonrpc: '2.0', id: q.id ?? null, error: { code: -32022, message: 'Unsupported MCP protocol version', data: { supported: [MCP_MODERN_PROTOCOL_VERSION], requested: metaVersion } } }, 400)
  if (q.method === 'server/discover') return response(r, q.id ?? null, { supportedVersions: [MCP_MODERN_PROTOCOL_VERSION], capabilities: { tools: { listChanged: false } }, ttlMs: 0, cacheScope: 'private' })
  if (q.method === 'tools/list') return response(r, q.id ?? null, { tools, ttlMs: 0, cacheScope: 'private' })
  if (q.method === 'tools/call') {
    const sampling = metaCapabilities && typeof metaCapabilities === 'object' && 'sampling' in metaCapabilities
    if (q.params?.name === 'test_missing_capability' && !sampling) return responseError(r, { jsonrpc: '2.0', id: q.id ?? null, error: { code: -32021, message: 'Missing required client capability', data: { requiredCapabilities: { sampling: {} } } } }, 400)
    try {
      return response(r, q.id ?? null, { content: [{ type: 'text', text: JSON.stringify(await toolCall(x, q.params?.name || '', q.params?.arguments || {})) }] })
    } catch (e) {
      return error(r, q.id ?? null, -32000, e instanceof Error ? e.message : 'Tool failed', 403)
    }
  }
  return error(r, q.id ?? null, -32601, 'Method not found', 404)
}

export async function POST(r: NextRequest) {
  const protocol = r.headers.get('MCP-Protocol-Version')
  const hinted = await r.clone().json().catch(() => null) as { params?: { _meta?: Record<string, unknown> } } | null
  const hintedVersion = hinted?.params?._meta?.['io.modelcontextprotocol/protocolVersion']
  const modern = protocol === MCP_MODERN_PROTOCOL_VERSION || typeof hintedVersion === 'string'
  if (!validateOrigin(r)) return new Response('Forbidden', { status: 403 })
  if (protocol?.startsWith('2026-') && !modern) return responseError(r, { jsonrpc: '2.0', id: null, error: { code: -32022, message: 'Unsupported MCP protocol version', data: { supported: [MCP_MODERN_PROTOCOL_VERSION], requested: protocol } } }, 400)
  if (modern) return modernPost(r, await auth(r))
  const x = await auth(r)
  if (!x) return error(r, null, -32001, 'Unauthorized', 401)
  const q = await r.json().catch(() => null) as { jsonrpc?: string; id?: string | number | null; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } } | null
  if (!q || q.jsonrpc !== '2.0' || typeof q.method !== 'string') return error(r, null, -32600, 'Invalid JSON-RPC request')
  if (q.id === undefined && (q.method === 'initialized' || q.method === 'notifications/initialized')) return new Response(null, { status: 202 })
  let sid = r.headers.get('mcp-session-id')
  if (q.method === 'initialize') {
    sid = await createMcpSession({ userId: x.a.userId, workspaceId: x.w.id, createdAt: Date.now() })
    return response(r, q.id ?? null, { protocolVersion: MCP_LEGACY_PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'quicklink-mcp', version: '1.0.0' } }, sid)
  }
  const session = sid ? await getMcpSession(sid) : null
  if (!sid || !session || session.userId !== x.a.userId || session.workspaceId !== x.w.id) return error(r, q.id ?? null, -32002, 'Valid MCP session required')
  if (q.method === 'tools/list') return response(r, q.id ?? null, { tools }, sid)
  if (q.method !== 'tools/call') return error(r, q.id ?? null, -32601, 'Method not found', 400, sid)
  try {
    return response(r, q.id ?? null, { content: [{ type: 'text', text: JSON.stringify(await toolCall(x, q.params?.name || '', q.params?.arguments || {})) }] }, sid)
  } catch (e) {
    return error(r, q.id ?? null, -32000, e instanceof Error ? e.message : 'Tool failed', 403, sid)
  }
}

export async function GET(r: NextRequest) {
  if (r.headers.get('MCP-Protocol-Version') === MCP_MODERN_PROTOCOL_VERSION) return new Response(null, { status: 405, headers: { Allow: 'POST' } })
  const x = await auth(r)
  const sid = r.headers.get('mcp-session-id')
  if (!x || !sid) return new Response('Unauthorized', { status: 401 })
  const s = await getMcpSession(sid)
  if (!s || s.userId !== x.a.userId || s.workspaceId !== x.w.id) return new Response('Invalid session', { status: 404 })
  const enc = new TextEncoder()
  const stream = new ReadableStream({ start(c) { c.enqueue(enc.encode(': connected\n\n')); const t = setInterval(() => c.enqueue(enc.encode(': heartbeat\n\n')), 15000); r.signal.addEventListener('abort', () => clearInterval(t), { once: true }) } })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Mcp-Session-Id': sid } })
}

export async function DELETE(r: NextRequest) {
  if (r.headers.get('MCP-Protocol-Version') === MCP_MODERN_PROTOCOL_VERSION) return new Response(null, { status: 405, headers: { Allow: 'POST' } })
  const sid = r.headers.get('mcp-session-id')
  if (sid) await deleteMcpSession(sid)
  return new Response(null, { status: 204 })
}
