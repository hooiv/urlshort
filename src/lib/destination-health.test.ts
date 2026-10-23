import { describe, expect, it } from 'vitest'
import { assertPublicHost, isPrivateIPv4, isPrivateIPv6 } from './destination-health'

describe('isPrivateIPv4', () => {
  it.each(['10.0.0.1', '127.0.0.1', '0.0.0.0', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.1.1', '100.64.0.1', '100.127.255.254', '198.18.0.1', '192.0.0.1', '224.0.0.1', '255.255.255.255', '1.2.3', '300.1.1.1'])('blocks %s', (ip) => {
    expect(isPrivateIPv4(ip)).toBe(true)
  })
  it.each(['8.8.8.8', '172.32.0.1', '100.63.255.255', '100.128.0.1', '198.20.0.1', '1.1.1.1'])('allows %s', (ip) => {
    expect(isPrivateIPv4(ip)).toBe(false)
  })
})

describe('isPrivateIPv6', () => {
  it.each(['::1', '::', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a00:1', '::10.0.0.1', 'fc00::1', 'fd12::1', 'fe80::1', 'febf::1', 'ff02::1', '64:ff9b::7f00:1', '2002:7f00:1::', '2001:db8::1', '[::1]', 'fe80::1%eth0', 'garbage'])('blocks %s', (ip) => {
    expect(isPrivateIPv6(ip)).toBe(true)
  })
  it.each(['2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8', '64:ff9b::808:808'])('allows %s', (ip) => {
    expect(isPrivateIPv6(ip)).toBe(false)
  })
})

describe('assertPublicHost literals', () => {
  it.each(['http://[::ffff:7f00:1]/', 'http://[::1]/', 'http://[fd00::1]/', 'http://100.64.0.5/', 'http://2130706433/', 'http://0x7f.1/'])('rejects %s', async (u) => {
    await expect(assertPublicHost(new URL(u))).rejects.toThrow()
  })
  it('accepts public literal', async () => {
    await expect(assertPublicHost(new URL('http://[2606:4700:4700::1111]/'))).resolves.toBeUndefined()
    await expect(assertPublicHost(new URL('http://8.8.8.8/'))).resolves.toBeUndefined()
  })
})
