import { describe, it, expect } from 'vitest'
import { isSlackWebhookUrl, escapeSlack, buildSlackMessage, slackBodyForDelivery, formatMoney } from './slack-format'

const HOOK = 'https://hooks.slack.com/services/T01ABC234/B01DEF567/abcdEFGH1234ijklMNOP5678'

describe('slack webhook detection', () => {
  it('accepts a real incoming webhook url', () => expect(isSlackWebhookUrl(HOOK)).toBe(true))
  it.each([
    'http://hooks.slack.com/services/T01ABC234/B01DEF567/abcdEFGH1234ijklMNOP5678',
    'https://hooks.slack.com:8443/services/T01ABC234/B01DEF567/abcdEFGH1234ijklMNOP5678',
    'https://evil.com/services/T01ABC234/B01DEF567/abcdEFGH1234ijklMNOP5678',
    'https://hooks.slack.com.evil.com/services/T01ABC234/B01DEF567/abcdEFGH1234ijklMNOP5678',
    'https://hooks.slack.com/services/T01/B01/short',
    'https://user@hooks.slack.com/services/T01ABC234/B01DEF567/abcdEFGH1234ijklMNOP5678',
    'nonsense',
  ])('rejects %s', (u) => expect(isSlackWebhookUrl(u)).toBe(false))
})

describe('slack messages', () => {
  it('escapes mrkdwn control characters', () => expect(escapeSlack('<!channel> & <x|y>')).toBe('&lt;!channel&gt; &amp; &lt;x|y&gt;'))
  it('does not let a destination ping the channel', () => {
    const m = buildSlackMessage('link.created', { shortCode: 'a', destinationUrl: 'https://x.com/<!channel>' })
    expect(JSON.stringify(m)).not.toContain('<!channel>')
  })
  it('formats sales and refunds', () => {
    expect(buildSlackMessage('conversion.recorded', { valueCents: 4900, currency: 'usd', source: 'stripe' }).text).toContain('$49.00')
    expect(buildSlackMessage('conversion.refunded', { refundedCents: 1000, netValueCents: 3900, currency: 'USD' }).text).toContain('$10.00')
  })
  it('falls back safely on bad currency and payloads', () => {
    expect(formatMoney(100, 'not-a-currency')).toBe('$1.00')
    expect(JSON.parse(slackBodyForDelivery('link.clicked', 'not json')).text).toContain('Link clicked')
  })
  it('handles unknown events and test pings', () => {
    expect(buildSlackMessage('diagnostic.test', {}).text).toContain('connected')
    expect(buildSlackMessage('weird<>', {}).text).toContain('weird')
  })
  it('caps fields at Slack limits', () => {
    const m = buildSlackMessage('link.clicked', { shortCode: 'x', country: 'US' })
    const section = (m.blocks as { fields?: unknown[] }[]).find(b => b.fields)
    expect(section!.fields!.length).toBeLessThanOrEqual(10)
  })
})
