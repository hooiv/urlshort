import { describe, expect, it } from 'vitest'
import { classifyInternalUrl, parseInternalLimit } from './internal-destinations'

describe('internal destinations', () => {
  it.each([
    ['http://localhost:3000/x', 'loopback'],
    ['http://app.localhost/x', 'loopback'],
    ['http://127.0.0.1/', 'loopback'],
    ['http://[::1]:8080/', 'loopback'],
    ['http://10.1.2.3/a', 'private-ip'],
    ['https://172.16.0.1/', 'private-ip'],
    ['https://192.168.1.1/', 'private-ip'],
    ['http://[fd00::1]/', 'private-ip'],
    ['http://169.254.169.254/latest', 'link-local'],
    ['http://[fe80::1]/', 'link-local'],
    ['https://wiki.corp/page', 'internal-suffix'],
    ['https://printer.local./', 'internal-suffix'],
    ['http://intranet/home', 'single-label'],
  ])('flags %s', (url, reason) => expect(classifyInternalUrl(url)).toBe(reason))

  it.each(['https://example.com', 'https://172.32.0.1/', 'https://8.8.8.8/', 'https://corp.example.com/', 'not a url', 'https://[2001:db8::1]/'])(
    'passes %s',
    (url) => expect(classifyInternalUrl(url)).toBeNull(),
  )

  it('parses limit', () => {
    expect(parseInternalLimit(null)).toBe(50)
    expect(parseInternalLimit('200')).toBe(200)
    expect(parseInternalLimit('201')).toBeNull()
    expect(parseInternalLimit('x')).toBeNull()
  })
})
