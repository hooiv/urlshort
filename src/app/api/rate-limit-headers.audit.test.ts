import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('route.ts') ? [p] : []
  })
}

// Every API route that answers a rate-limit 429 must say when to retry.
describe('API 429 responses carry rate-limit headers', () => {
  it('no rate-limited route returns a bare 429', () => {
    const offenders: string[] = []
    for (const file of walk(__dirname)) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (!/status: 429\s*\}/.test(line)) return
        const ctx = lines.slice(Math.max(0, i - 2), i + 1).join('\n')
        if (/\.allowed\)/.test(ctx) && /limit|Limit/.test(ctx) && !/quota|usage/i.test(ctx)) offenders.push(`${file}:${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })
})
