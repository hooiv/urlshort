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
})
