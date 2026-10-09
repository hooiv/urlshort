import { NextRequest } from 'next/server'

/**
 * Link and analytics tools for the MCP server.
 *
 * Each tool calls the same route handler the REST API uses, in-process, with
 * the caller's API key forwarded. Validation, phishing checks, folder and
 * workspace permissions, key scopes, rate limits, audit and webhooks are
 * therefore identical to the public API by construction, not by copy.
 */

export const LINK_TOOLS = [
  {
    name: 'links.create',
    description: 'Create a short link. Optional custom back-half, title, tags, workspace and folder.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Destination URL (http/https)' },
        customCode: { type: 'string', description: 'Custom back-half, e.g. spring-sale' },
        title: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        workspaceId: { type: 'string' },
        folderId: { type: 'string' },
      },
      required: ['url'],
    },
  },
  {
    name: 'links.list',
    description: 'List links you can see, newest first. Filter by search text, tag or folder (folder id or "none").',
    inputSchema: {
      type: 'object',
      properties: { search: { type: 'string' }, tag: { type: 'string' }, folder: { type: 'string' }, take: { type: 'integer', minimum: 1, maximum: 100 } },
    },
  },
  {
    name: 'links.update',
    description: 'Change a link\'s destination, title, tags or active state.',
    inputSchema: {
      type: 'object',
      properties: {
        shortCode: { type: 'string' },
        destinationUrl: { type: 'string' },
        title: { type: ['string', 'null'] },
        tags: { type: 'array', items: { type: 'string' } },
        isActive: { type: 'boolean' },
      },
      required: ['shortCode'],
    },
  },
  {
    name: 'analytics.summary',
    description: 'Clicks, conversions and revenue across your links, a workspace, a folder or a tag, with period-over-period change.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
        folder: { type: 'string', description: 'Folder id or "none" (workspace scope only)' },
        tag: { type: 'string' },
        range: { type: 'string', enum: ['7d', '30d', '90d', '365d'] },
      },
    },
  },
  {
    name: 'analytics.link',
    description: 'Time series and breakdowns for one link.',
    inputSchema: {
      type: 'object',
      properties: { shortCode: { type: 'string' }, range: { type: 'string', enum: ['24h', '7d', '30d', '90d'] } },
      required: ['shortCode'],
    },
  },
] as const

export const LINK_TOOL_NAMES = new Set<string>(LINK_TOOLS.map((t) => t.name))

/** A tool failure whose message is safe to show the MCP client (it came from our own API's validation). */
export class ToolInputError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

const FORWARDED_HEADERS = ['x-api-key', 'authorization', 'x-forwarded-for', 'x-real-ip', 'user-agent']
const SHORT_CODE = /^[A-Za-z0-9_-]{1,64}$/

function str(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || value.length > max) throw new ToolInputError(`${field} must be a string of at most ${max} characters`, 400)
  return value
}

async function invoke(
  origin: NextRequest,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  handler: (req: NextRequest, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>,
  options: { body?: unknown; params?: Record<string, string> } = {},
): Promise<unknown> {
  const headers = new Headers({ accept: 'application/json' })
  for (const name of FORWARDED_HEADERS) {
    const value = origin.headers.get(name)
    if (value) headers.set(name, value)
  }
  if (options.body !== undefined) headers.set('content-type', 'application/json')
  const req = new NextRequest(new URL(path, origin.url), { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) })
  const res = await handler(req, options.params ? { params: Promise.resolve(options.params) } : undefined)
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok) throw new ToolInputError(typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`, res.status)
  return data
}

export async function callLinkTool(request: NextRequest, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'links.create': {
      const { POST } = await import('@/app/api/shorten/route')
      const tags = args.tags === undefined ? undefined : Array.isArray(args.tags) ? args.tags : (() => { throw new ToolInputError('tags must be an array of strings', 400) })()
      return invoke(request, 'POST', '/api/shorten', POST as never, {
        body: {
          url: str(args.url, 'url', 2048),
          customCode: str(args.customCode, 'customCode', 64),
          title: str(args.title, 'title', 200),
          tags,
          workspaceId: str(args.workspaceId, 'workspaceId', 64),
          folderId: str(args.folderId, 'folderId', 64),
        },
      })
    }
    case 'links.list': {
      const { GET } = await import('@/app/api/shorten/route')
      const q = new URLSearchParams()
      for (const key of ['search', 'tag', 'folder'] as const) {
        const v = str(args[key], key, 200)
        if (v) q.set(key, v)
      }
      if (args.take !== undefined) q.set('take', String(Math.min(Math.max(Number(args.take) || 25, 1), 100)))
      return invoke(request, 'GET', `/api/shorten?${q}`, GET as never)
    }
    case 'links.update': {
      const shortCode = str(args.shortCode, 'shortCode', 64)
      if (!shortCode || !SHORT_CODE.test(shortCode)) throw new ToolInputError('A valid shortCode is required', 400)
      const { PATCH } = await import('@/app/api/links/[shortCode]/route')
      const body: Record<string, unknown> = {}
      for (const key of ['destinationUrl', 'title', 'tags', 'isActive'] as const) if (args[key] !== undefined) body[key] = args[key]
      if (Object.keys(body).length === 0) throw new ToolInputError('Nothing to update', 400)
      return invoke(request, 'PATCH', `/api/links/${encodeURIComponent(shortCode)}`, PATCH as never, { body, params: { shortCode } })
    }
    case 'analytics.summary': {
      const { GET } = await import('@/app/api/analytics/route')
      const q = new URLSearchParams({ range: str(args.range, 'range', 8) ?? '30d' })
      for (const key of ['workspaceId', 'folder', 'tag'] as const) {
        const v = str(args[key], key, 64)
        if (v) q.set(key, v)
      }
      return invoke(request, 'GET', `/api/analytics?${q}`, GET as never)
    }
    case 'analytics.link': {
      const shortCode = str(args.shortCode, 'shortCode', 64)
      if (!shortCode || !SHORT_CODE.test(shortCode)) throw new ToolInputError('A valid shortCode is required', 400)
      const { GET } = await import('@/app/api/analytics/[shortCode]/route')
      const q = new URLSearchParams({ range: str(args.range, 'range', 8) ?? '30d' })
      return invoke(request, 'GET', `/api/analytics/${encodeURIComponent(shortCode)}?${q}`, GET as never, { params: { shortCode } })
    }
    default:
      throw new ToolInputError('Unknown tool', 404)
  }
}
