import { describe, expect, it } from 'vitest'
import { validateWebhookHttps, webhookTestSchema } from './route'

describe('webhookTestSchema', () => {
  it('accepts empty body and caps length', () => {
    expect(webhookTestSchema.safeParse({}).success).toBe(true)
    expect(webhookTestSchema.safeParse({ webhookUrl: 'x'.repeat(3000) }).success).toBe(false)
  })
})

describe('validateWebhookHttps', () => {
  it('requires https', () => {
    expect(validateWebhookHttps('https://example.com/hook').hostname).toBe('example.com')
    expect(() => validateWebhookHttps('http://example.com/hook')).toThrow()
    expect(() => validateWebhookHttps('not-a-url')).toThrow()
  })
})
