import { describe, expect, it, vi } from 'vitest'
import { copyTextWithFallback } from './clipboard'

describe('copyTextWithFallback', () => {
  it('resolves true when the Clipboard API succeeds', async () => {
    const writeClipboard = vi.fn(async () => {})
    await expect(copyTextWithFallback('code', { writeClipboard })).resolves.toBe(true)
    expect(writeClipboard).toHaveBeenCalledWith('code')
  })

  it('falls back to the legacy path when the Clipboard API rejects', async () => {
    const writeClipboard = vi.fn(async () => {
      throw new Error('denied')
    })
    const legacyCopy = vi.fn(() => true)
    await expect(copyTextWithFallback('code', { writeClipboard, legacyCopy })).resolves.toBe(true)
    expect(legacyCopy).toHaveBeenCalledWith('code')
  })

  it('uses the legacy path when no Clipboard API is provided', async () => {
    await expect(copyTextWithFallback('code', { legacyCopy: () => true })).resolves.toBe(true)
  })

  it('resolves false when every path fails or is missing', async () => {
    await expect(copyTextWithFallback('code', {})).resolves.toBe(false)
    await expect(
      copyTextWithFallback('code', {
        writeClipboard: async () => {
          throw new Error('nope')
        },
        legacyCopy: () => false,
      }),
    ).resolves.toBe(false)
  })
})
