import { afterEach, describe, expect, it } from 'vitest'

process.env.MCP_CONFORMANCE_BYPASS = '1'

import { DELETE, GET, POST } from './route'

const modernHeaders = (extra: Record<string, string> = {}) => ({
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
  'MCP-Protocol-Version': '2026-07-28',
  ...extra,
})
const modernMeta = { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} } }

async function post(body: unknown, headers: Record<string, string>) {
  return POST(new Request('https://mcp.example.test/api/mcp', { method: 'POST', headers, body: JSON.stringify(body) }) as never)
}

afterEach(() => {
  delete process.env.MCP_ALLOWED_ORIGINS
})

describe('MCP Streamable HTTP 2026-07-28 compatibility', () => {
  it('supports server/discover without a session handshake', async () => {
    const res = await post(
      { jsonrpc: '2.0', id: 1, method: 'server/discover', params: modernMeta },
      modernHeaders({ 'Mcp-Method': 'server/discover' }),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('mcp-session-id')).toBeNull()
    const body = await res.json()
    expect(body.result.supportedVersions).toEqual(['2026-07-28'])
    expect(body.result.capabilities.tools).toEqual({ listChanged: false })
    expect(body.result._meta['io.modelcontextprotocol/serverInfo'].name).toBe('quicklink-mcp')
  })

  it('serves cacheable tools/list responses and validates standard headers', async () => {
    const res = await post(
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: modernMeta },
      modernHeaders({ 'Mcp-Method': 'tools/list' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.result.tools.map((t: { name: string }) => t.name)).toContain('campaign.list')
    expect(body.result.ttlMs).toBe(0)
    expect(body.result.cacheScope).toBe('private')
  })

  it('executes tools/call with the required Mcp-Name header', async () => {
    const res = await post(
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'campaign.list', arguments: {}, ...modernMeta } },
      modernHeaders({ 'Mcp-Method': 'tools/call', 'Mcp-Name': 'campaign.list' }),
    )
    expect(res.status).toBe(200)
    expect((await res.json()).result.content[0].text).toContain('campaign.list')
  })

  it('rejects missing or mismatched standard headers', async () => {
    const missing = await post({ jsonrpc: '2.0', id: 4, method: 'tools/list', params: modernMeta }, modernHeaders())
    expect(missing.status).toBe(400)
    expect((await missing.json()).error.code).toBe(-32020)

    const mismatch = await post(
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'campaign.list', arguments: {}, ...modernMeta } },
      modernHeaders({ 'Mcp-Method': 'tools/call', 'Mcp-Name': 'campaign.get' }),
    )
    expect(mismatch.status).toBe(400)
    expect((await mismatch.json()).error.code).toBe(-32020)
  })

  it('rejects transport sessions and old lifecycle methods in the modern era', async () => {
    const session = await post(
      { jsonrpc: '2.0', id: 6, method: 'tools/list', params: modernMeta },
      modernHeaders({ 'Mcp-Method': 'tools/list', 'Mcp-Session-Id': 'mcp_legacy' }),
    )
    expect(session.status).toBe(400)

    const initialize = await post(
      { jsonrpc: '2.0', id: 7, method: 'initialize', params: modernMeta },
      modernHeaders({ 'Mcp-Method': 'initialize' }),
    )
    expect(initialize.status).toBe(404)
  })

  it('does not silently downgrade unknown 2026 protocol revisions', async () => {
    const res = await post(
      { jsonrpc: '2.0', id: 10, method: 'tools/list', params: modernMeta },
      modernHeaders({ 'MCP-Protocol-Version': '2026-01-01', 'Mcp-Method': 'tools/list' }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 202 for a modern notification and 405 for modern GET/DELETE', async () => {
    const notification = await post(
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      modernHeaders(),
    )
    expect(notification.status).toBe(202)

    const req = new Request('https://mcp.example.test/api/mcp', { headers: modernHeaders() }) as never
    expect((await GET(req)).status).toBe(405)
    expect((await DELETE(req)).status).toBe(405)
  })

  it('enforces the Origin allow-list', async () => {
    process.env.MCP_ALLOWED_ORIGINS = 'https://allowed.example'
    const allowed = await post(
      { jsonrpc: '2.0', id: 8, method: 'tools/list', params: modernMeta },
      modernHeaders({ 'Mcp-Method': 'tools/list', Origin: 'https://allowed.example' }),
    )
    expect(allowed.status).toBe(200)

    const denied = await post(
      { jsonrpc: '2.0', id: 9, method: 'tools/list', params: modernMeta },
      modernHeaders({ 'Mcp-Method': 'tools/list', Origin: 'https://evil.example' }),
    )
    expect(denied.status).toBe(403)
  })
})
