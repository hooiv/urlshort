import {describe,expect,it} from 'vitest'
import {versionAtLeast} from './deep-link'

describe('deep-link version lifecycle',()=>{
  it('fails closed when a minimum version is configured but client version is absent',()=>expect(versionAtLeast(null,'2.0.0')).toBe(false))
  it('compares semantic numeric versions without allowing prefixes to bypass',()=>{expect(versionAtLeast('2.0.0','2.0.0')).toBe(true);expect(versionAtLeast('2.0.9','2.0.10')).toBe(false);expect(versionAtLeast('v3.1','2.9.9')).toBe(true)})
  it('allows any version when no minimum is configured',()=>expect(versionAtLeast(null,null)).toBe(true))
})
