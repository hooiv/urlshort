import { crc32 } from 'node:zlib'

export interface ZipEntry {
  name: string
  data: Uint8Array
  date?: Date
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32Of(data: Uint8Array): number {
  if (typeof crc32 === 'function') return crc32(data) >>> 0
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getUTCFullYear())
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  }
}

/** Safe archive member name: no paths, no control characters, never empty. */
export function safeZipName(name: string): string {
  const cleaned = name.replace(/[\u0000-\u001f\\/:*?"<>|]/g, '_').replace(/^\.+/, '_').trim()
  return cleaned.slice(0, 120) || 'file'
}

/** Builds a store-only (uncompressed) ZIP: right for PNG/SVG which are already compact. Max 65535 entries, 4 GiB. */
export function buildZip(entries: ZipEntry[]): Buffer {
  if (entries.length > 0xffff) throw new Error('too many zip entries')
  const seen = new Set<string>()
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    let name = safeZipName(entry.name)
    // Case-insensitive: Windows/macOS extractors would silently overwrite A.png with a.png.
    if (seen.has(name.toLowerCase())) {
      const dot = name.lastIndexOf('.')
      const base = dot > 0 ? name.slice(0, dot) : name
      const ext = dot > 0 ? name.slice(dot) : ''
      let i = 2
      while (seen.has(`${base}-${i}${ext}`.toLowerCase())) i++
      name = `${base}-${i}${ext}`
    }
    seen.add(name.toLowerCase())
    const nameBuf = Buffer.from(name, 'utf8')
    const data = Buffer.from(entry.data)
    if (offset + data.length > 0xfffffff0) throw new Error('zip too large')
    const crc = crc32Of(data)
    const { time, date } = dosDateTime(entry.date ?? new Date())
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // UTF-8 names
    local.writeUInt16LE(0, 8) // stored
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBuf, data)
    centrals.push(central, nameBuf)
    offset += local.length + nameBuf.length + data.length
  }
  const centralBuf = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralBuf, end])
}
