import { describe, expect, it, vi, beforeEach } from 'vitest'
import { isEventVisibleToWorkspace, publishRealtime, subscribeLocal, type RealtimeEvent } from './realtime'

describe('isEventVisibleToWorkspace', () => {
  it('delivers untagged legacy events to every workspace (broadcast)', () => {
    expect(isEventVisibleToWorkspace({ workspaceId: null }, 'ws1')).toBe(true)
    expect(isEventVisibleToWorkspace({}, 'ws1')).toBe(true)
  })

  it('isolates tagged events to their own workspace', () => {
    expect(isEventVisibleToWorkspace({ workspaceId: 'ws1' }, 'ws1')).toBe(true)
    expect(isEventVisibleToWorkspace({ workspaceId: 'ws1' }, 'ws2')).toBe(false)
  })
})

describe('workspace-scoped fan-out', () => {
  beforeEach(() => vi.clearAllMocks())

  it('routes tagged events only to matching scoped subscribers', () => {
    const seenA: RealtimeEvent[] = []
    const seenB: RealtimeEvent[] = []
    const stopA = subscribeLocal((e) => seenA.push(e), { workspaceId: 'wsA' })
    const stopB = subscribeLocal((e) => seenB.push(e), { workspaceId: 'wsB' })
    try {
      publishRealtime('click.batch', { count: 1 }, { workspaceId: 'wsA' })
      expect(seenA).toHaveLength(1)
      expect(seenB).toHaveLength(0)
      expect(seenA[0].workspaceId).toBe('wsA')
    } finally {
      stopA()
      stopB()
    }
  })

  it('keeps legacy broadcast for untagged events and unscoped subscribers', () => {
    const seenScoped: RealtimeEvent[] = []
    const seenGlobal: RealtimeEvent[] = []
    const stopScoped = subscribeLocal((e) => seenScoped.push(e), { workspaceId: 'wsA' })
    const stopGlobal = subscribeLocal((e) => seenGlobal.push(e))
    try {
      publishRealtime('click.batch', { count: 2 })
      expect(seenGlobal).toHaveLength(1)
      expect(seenScoped).toHaveLength(1)
    } finally {
      stopScoped()
      stopGlobal()
    }
  })

  it('unsubscribes cleanly', () => {
    const seen: RealtimeEvent[] = []
    const stop = subscribeLocal((e) => seen.push(e), { workspaceId: 'wsA' })
    stop()
    publishRealtime('click.batch', { count: 1 }, { workspaceId: 'wsA' })
    expect(seen).toHaveLength(0)
  })
})
