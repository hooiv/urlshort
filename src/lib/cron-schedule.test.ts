import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('vercel cron schedule', () => {
  const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')) as { crons: Array<{ path: string; schedule: string }> }
  const scheduled = config.crons.map((c) => c.path)

  it('schedules every /api/cron/* route handler', () => {
    const dirs = readdirSync(join(root, 'src/app/api/cron'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => `/api/cron/${d.name}`)
    expect(dirs.filter((d) => !scheduled.includes(d))).toEqual([])
  })

  it('has no duplicate paths and no scheduled path without a route', () => {
    expect(new Set(scheduled).size).toBe(scheduled.length)
    for (const path of scheduled.filter((p) => p.startsWith('/api/cron/'))) {
      expect(() => readFileSync(join(root, 'src/app', path, 'route.ts'))).not.toThrow()
    }
  })

  it('every scheduled route answers GET (Vercel Cron only issues GET) and checks a secret in constant time, failing closed', () => {
    for (const path of scheduled) {
      const src = readFileSync(join(root, 'src/app', path, 'route.ts'), 'utf8')
      expect(src, `${path} must export GET`).toMatch(/export\s+(async\s+function\s+GET|const\s+GET)/)
      expect(src, `${path} must return 401 when unauthorized`).toMatch(/401/)
      expect(src, `${path} must read a secret env var`).toMatch(/process\.env\.[A-Z_]*SECRET/)
      expect(src, `${path} must compare secrets in constant time`).toMatch(/timingSafeEqual/)
    }
  })
})
