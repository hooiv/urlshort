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
})
