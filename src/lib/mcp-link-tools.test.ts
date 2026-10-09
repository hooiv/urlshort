import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const shortenPost = vi.hoisted(() => vi.fn())
const shortenGet = vi.hoisted(() => vi.fn())
const linkPatch = vi.hoisted(() => vi.fn())
vi.mock('@/app/api/shorten/route', () => ({ POST: shortenPost, GET: shortenGet }))
vi.mock('@/app/api/links/[shortCode]/route', () => ({ PATCH: linkPatch }))

import { ToolInputError, callLinkTool } from './mcp-link-tools'

const origin = new NextRequest('https://ql.test/api/mcp', { method: 'POST', headers: { authorization: 'Bearer qlk_secret', 'x-forwarded-for': '203.0.113.9', cookie: 'ql_session=abc' } })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('MCP link tools', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates through the REST handler with the key and client IP forwarded, never the cookie', async () => {
    shortenPost.mockResolvedValue(json({ shortCode: 'spring' }, 201))
    expect(await callLinkTool(origin, 'links.create', { url: 'https://example.com', customCode: 'spring', tags: ['launch'] })).toEqual({ shortCode: 'spring' })
    const req = shortenPost.mock.calls[0][0] as NextRequest
    expect(req.headers.get('authorization')).toBe('Bearer qlk_secret')
    expect(req.headers.get('x-forwarded-for')).toBe('203.0.113.9')
    expect(req.headers.get('cookie')).toBeNull()
    expect(await req.json()).toMatchObject({ url: 'https://example.com', customCode: 'spring', tags: ['launch'] })
  })

  it('surfaces the API\'s own validation error', async () => {
    shortenPost.mockResolvedValue(json({ error: 'That alias is taken' }, 409))
    await expect(callLinkTool(origin, 'links.create', { url: 'https://example.com' })).rejects.toMatchObject({ message: 'That alias is taken', status: 409 })
  })

  it('builds list queries and clamps take', async () => {
    shortenGet.mockResolvedValue(json({ links: [] }))
    await callLinkTool(origin, 'links.list', { folder: 'none', take: 999 })
    expect((shortenGet.mock.calls[0][0] as NextRequest).nextUrl.search).toBe('?folder=none&take=100')
  })

  it('validates update input before calling the API', async () => {
    await expect(callLinkTool(origin, 'links.update', { shortCode: '../etc' })).rejects.toBeInstanceOf(ToolInputError)
    await expect(callLinkTool(origin, 'links.update', { shortCode: 'abc' })).rejects.toMatchObject({ message: 'Nothing to update' })
    linkPatch.mockResolvedValue(json({ ok: true }))
    await callLinkTool(origin, 'links.update', { shortCode: 'abc', isActive: false })
    expect(await (linkPatch.mock.calls[0][0] as NextRequest).json()).toEqual({ isActive: false })
    expect(await linkPatch.mock.calls[0][1].params).toEqual({ shortCode: 'abc' })
  })
})
