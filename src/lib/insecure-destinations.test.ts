import { describe, expect, it } from 'vitest'
import { httpsUpgrade, isInsecurePublicUrl, parseInsecureLimit } from './insecure-destinations'

describe('insecure destinations', () => {
  it('flags public http only', () => {
    expect(isInsecurePublicUrl('http://example.com/a?b=1')).toBe(true)
    expect(isInsecurePublicUrl('https://example.com')).toBe(false)
    expect(isInsecurePublicUrl('ftp://example.com')).toBe(false)
    expect(isInsecurePublicUrl('not a url')).toBe(false)
  })
  it('skips local and private hosts', () => {
    for (const h of ['localhost:3000', '127.0.0.1', '10.0.0.5', '192.168.1.2', '172.20.1.1', 'nas.local', 'svc.internal', '169.254.1.1', '[::1]'])
      expect(isInsecurePublicUrl(`http://${h}/x`)).toBe(false)
    expect(isInsecurePublicUrl('http://172.32.0.1/')).toBe(true)
  })
  it('suggests an https form preserving path and query', () => {
    expect(httpsUpgrade('http://example.com:80/a?b=1#c')).toBe('https://example.com/a?b=1#c')
    expect(httpsUpgrade('https://example.com')).toBeNull()
  })
  it('parses limit strictly', () => {
    expect(parseInsecureLimit(null)).toBe(50)
    expect(parseInsecureLimit('200')).toBe(200)
    expect(parseInsecureLimit('0')).toBeNull()
    expect(parseInsecureLimit('x')).toBeNull()
  })
})
