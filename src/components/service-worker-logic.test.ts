import { describe, expect, it } from 'vitest'
import { SERVICE_WORKER_URL, canUseServiceWorker } from './service-worker-logic'

describe('canUseServiceWorker', () => {
  it('registers only when the api exists', () => {
    expect(canUseServiceWorker(true)).toBe(true)
    expect(canUseServiceWorker(false)).toBe(false)
  })
  it('uses the app-local worker script', () => {
    expect(SERVICE_WORKER_URL).toBe('/sw.js')
  })
})
