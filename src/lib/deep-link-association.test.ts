import { describe, expect, it } from 'vitest'

function appleEntry(team: string, bundle: string) {
  return { appID: `${team}.${bundle}`, paths: ['*'] }
}
function androidEntry(pkg: string, fingerprints: string[]) {
  return { relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: fingerprints } }
}

describe('native association document shapes', () => {
  it('creates an Apple applinks entry from team and bundle identity', () => {
    expect(appleEntry('TEAM123', 'com.example.app')).toEqual({ appID: 'TEAM123.com.example.app', paths: ['*'] })
  })
  it('creates Android assetlinks statements with every signing fingerprint', () => {
    expect(androidEntry('com.example.app', ['AA:BB', 'CC:DD']).target.sha256_cert_fingerprints).toHaveLength(2)
  })
})
