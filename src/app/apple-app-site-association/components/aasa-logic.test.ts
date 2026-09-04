import { describe, expect, it } from 'vitest'
import {
  FALLBACK_APP_ID,
  buildAasaDetails,
  buildAasaManifest,
  parseAssociatedDomainsJson,
} from './aasa-logic'

describe('parseAssociatedDomainsJson', () => {
  it('returns null for empty or invalid JSON', () => {
    expect(parseAssociatedDomainsJson(null)).toBeNull()
    expect(parseAssociatedDomainsJson('not-json')).toBeNull()
    expect(parseAssociatedDomainsJson('{"appID":"x"}')).toBeNull()
  })

  it('keeps only entries with a non-empty appID', () => {
    expect(
      parseAssociatedDomainsJson(JSON.stringify([{ appID: '  ' }, { appID: 'T.b', paths: ['/a/*'] }])),
    ).toEqual([{ appID: 'T.b', paths: ['/a/*'] }])
  })

  it('defaults missing paths to /*', () => {
    expect(parseAssociatedDomainsJson(JSON.stringify([{ appID: 'T.b' }]))).toEqual([
      { appID: 'T.b', paths: ['/*'] },
    ])
  })
})

describe('buildAasaDetails', () => {
  it('derives appID from team + bundle ids', () => {
    expect(
      buildAasaDetails([{ bundleId: 'com.a.app', appleTeamId: 'TEAM', iosAssociatedDomainsJson: null }]),
    ).toEqual([{ appID: 'TEAM.com.a.app', paths: ['/*'] }])
  })

  it('prefers the stored JSON override and skips incomplete rows', () => {
    const override = JSON.stringify([{ appID: 'T.custom', paths: ['/x/*'] }])
    expect(
      buildAasaDetails([
        { bundleId: null, appleTeamId: null, iosAssociatedDomainsJson: null },
        { bundleId: 'com.a.app', appleTeamId: 'TEAM', iosAssociatedDomainsJson: override },
      ]),
    ).toEqual([{ appID: 'T.custom', paths: ['/x/*'] }])
  })

  it('falls back to the static manifest when no apps are configured', () => {
    expect(buildAasaDetails([])).toEqual([{ appID: FALLBACK_APP_ID, paths: ['/m/*'] }])
  })
})

describe('buildAasaManifest', () => {
  it('keeps the same shape with derived webcredentials', () => {
    const manifest = buildAasaManifest([
      { bundleId: 'com.a.app', appleTeamId: 'TEAM', iosAssociatedDomainsJson: null },
    ])
    expect(manifest.applinks.apps).toEqual([])
    expect(manifest.webcredentials.apps).toEqual(['TEAM.com.a.app'])
    expect(manifest.appclips.apps).toHaveLength(1)
  })
})
