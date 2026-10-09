import { describe, expect, it } from 'vitest'
import { decodeDeliveryCursor, encodeDeliveryCursor } from './webhook-delivery-log'
import { readCappedText } from './webhooks'

describe('delivery cursor', () => {
  it('round-trips and rejects tampered input', () => {
    const cursor = { createdAt: new Date('2026-10-09T10:00:00.123Z'), id: 'clx123abc' }
    expect(decodeDeliveryCursor(encodeDeliveryCursor(cursor))).toEqual(cursor)
    expect(decodeDeliveryCursor('not-a-cursor')).toBeNull()
    expect(decodeDeliveryCursor(Buffer.from('2026-10-09T10:00:00Z|id;drop').toString('base64url'))).toBeNull()
    expect(decodeDeliveryCursor(Buffer.from('yesterday|abc').toString('base64url'))).toBeNull()
    expect(decodeDeliveryCursor(null)).toBeNull()
  })
})

describe('readCappedText', () => {
  it('stops reading an endless body at the cap', async () => {
    let pulls = 0
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { pulls++; controller.enqueue(new TextEncoder().encode('x'.repeat(400))) } })
    const text = await readCappedText(new Response(stream), 1000)
    expect(text).toHaveLength(1000)
    expect(pulls).toBeLessThan(10)
  })

  it('returns short bodies whole', async () => {
    expect(await readCappedText(new Response('ok'), 1000)).toBe('ok')
    expect(await readCappedText(new Response(null), 1000)).toBe('')
  })
})
