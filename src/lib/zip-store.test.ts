import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildZip, crc32Of, safeZipName } from './zip-store'

describe('zip-store', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32Of(Buffer.from('123456789'))).toBe(0xcbf43926)
  })
  it('sanitises member names', () => {
    expect(safeZipName('../etc/passwd')).toBe('__etc_passwd')
    expect(safeZipName('')).toBe('file')
    expect(safeZipName('a:b*c.png')).toBe('a_b_c.png')
  })
  it('dedupes colliding names', () => {
    const zip = buildZip([{ name: 'a.png', data: Buffer.from('1') }, { name: 'a.png', data: Buffer.from('2') }])
    const text = zip.toString('latin1')
    expect(text).toContain('a-2.png')
  })
  it('produces an archive that unzip can extract intact', () => {
    const payload = Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 251))
    const zip = buildZip([{ name: 'x.bin', data: payload }, { name: 'ünï.txt', data: Buffer.from('héllo') }])
    const dir = mkdtempSync(join(tmpdir(), 'zip-'))
    const file = join(dir, 't.zip')
    writeFileSync(file, zip)
    let ok = true
    try { execFileSync('python3', ['-c', `import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;open(sys.argv[2],'wb').write(z.read('x.bin'));assert z.read('ünï.txt').decode()=='héllo'`, file, join(dir, 'o.bin')]) } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') ok = false; else throw e }
    if (ok) expect(readFileSync(join(dir, 'o.bin')).equals(payload)).toBe(true)
  })
  it('handles an empty archive', () => {
    expect(buildZip([]).length).toBe(22)
  })
})
