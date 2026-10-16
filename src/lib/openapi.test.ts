/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { OPERATIONS, buildOpenApiDocument, routeFileFor } from './openapi'

const appDir = path.join(process.cwd(), 'src/app')

describe('openapi document', () => {
  it('maps every operation to a real route exporting that method', () => {
    for (const op of OPERATIONS) {
      const file = path.join(appDir, routeFileFor(op.path))
      expect(existsSync(file), `${op.path} -> ${file}`).toBe(true)
      const src = readFileSync(file, 'utf8')
      const name = op.method.toUpperCase()
      expect(new RegExp(`export (async function|const) ${name}\\b`).test(src), `${name} ${op.path}`).toBe(true)
    }
  })

  it('has no duplicate operations', () => {
    const keys = OPERATIONS.map((o) => `${o.method} ${o.path}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('declares path parameters and scopes', () => {
    const doc = buildOpenApiDocument('https://x.test') as Record<string, any>
    expect(doc.openapi).toBe('3.1.0')
    const get = doc.paths['/api/links/{shortCode}'].get
    expect(get.parameters[0]).toMatchObject({ name: 'shortCode', in: 'path', required: true })
    expect(get['x-required-scopes-any-of']).toContain('links:read')
    expect(doc.paths['/api/shorten'].post.requestBody.content['application/json'].schema.required).toEqual(['url'])
  })

  it('declared scopes match the constants each route passes to resolveActor', () => {
    const consts: Record<string, string[]> = {
      LINK_READ_SCOPES: ['links:read', 'links:write'],
      LINK_WRITE_SCOPES: ['links:write'],
      WEBHOOK_SCOPES: ['webhooks:write'],
      ANALYTICS_READ_SCOPES: ['analytics:read', 'links:read', 'links:write'],
    }
    for (const op of OPERATIONS) {
      const src = readFileSync(path.join(appDir, routeFileFor(op.path)), 'utf8')
      const used = [...src.matchAll(/resolveActor\(\w+,\s*(\w+)\)/g)].map((m) => m[1]).filter((n) => consts[n])
      if (used.length === 0) continue
      const ok = used.some((n) => JSON.stringify(consts[n]) === JSON.stringify(op.scopes))
      expect(ok, `${op.method} ${op.path} declares ${op.scopes} but route uses ${used}`).toBe(true)
    }
  })
})
