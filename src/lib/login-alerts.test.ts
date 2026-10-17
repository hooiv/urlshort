import { describe, expect, it } from 'vitest'
import { deviceFingerprint, parseDevice, renderNewDeviceEmail, shouldAlertNewDevice } from './login-alerts'

const chromeWin = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const chromeWinNewer = chromeWin.replace('130.0', '131.0')
const safariIphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'

describe('login alerts', () => {
  it('parses browser and os families', () => {
    expect(parseDevice(chromeWin).label).toBe('Chrome on Windows')
    expect(parseDevice(safariIphone).label).toBe('Safari on iOS')
    expect(parseDevice('Mozilla/5.0 Edg/120 Windows').browser).toBe('Edge')
    expect(parseDevice(null).label).toBe('Unknown device')
  })
  it('ignores version bumps in fingerprints', () => {
    expect(deviceFingerprint(chromeWin)).toBe(deviceFingerprint(chromeWinNewer))
    expect(deviceFingerprint(chromeWin)).not.toBe(deviceFingerprint(safariIphone))
  })
  it('never alerts on a first-ever login', () => {
    expect(shouldAlertNewDevice([], 'abc')).toBe(false)
  })
  it('alerts only for unseen devices', () => {
    expect(shouldAlertNewDevice(['a', 'b'], 'c')).toBe(true)
    expect(shouldAlertNewDevice(['a', 'b'], 'b')).toBe(false)
  })
  it('alerts when history predates fingerprints', () => {
    expect(shouldAlertNewDevice([null, undefined], 'c')).toBe(true)
  })
  it('renders the email', () => {
    const m = renderNewDeviceEmail({ device: parseDevice(chromeWin), when: new Date('2026-10-17T00:00:00Z'), securityUrl: 'https://x/account/security' })
    expect(m.text).toContain('Chrome on Windows')
    expect(m.text).toContain('https://x/account/security')
  })
})
