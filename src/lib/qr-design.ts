import QRCode from 'qrcode'

export type DotStyle = 'square' | 'rounded' | 'dots'
export type EyeStyle = 'square' | 'rounded' | 'circle'
export type QrLevel = 'L' | 'M' | 'Q' | 'H'

export interface QrDesign {
  size: number
  margin: number
  dark: string
  /** Second colour: when set the modules are painted with a linear gradient dark → dark2. */
  dark2: string | null
  light: string
  transparent: boolean
  dotStyle: DotStyle
  eyeStyle: EyeStyle
  /** Eye colour, defaults to `dark`. */
  eyeColor: string | null
  level: QrLevel
  /** Validated data:image/png|jpeg|webp|svg+xml;base64 URI. Never a remote URL (no SSRF, no tracking pixel). */
  logo: string | null
  /** Logo box as a fraction of the QR width (0.1–0.3). */
  logoScale: number
  caption: string | null
}

export const MAX_LOGO_BYTES = 256 * 1024
const HEX = /^#[0-9a-fA-F]{6}$/
const LOGO_RE = /^data:image\/(png|jpeg|webp|svg\+xml);base64,([A-Za-z0-9+/]+={0,2})$/

export class QrDesignError extends Error {}

function pick<T extends string>(v: string | null | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback
}
function hex(v: string | null | undefined, fallback: string | null): string | null {
  const s = v?.trim()
  if (!s) return fallback
  const withHash = s.startsWith('#') ? s : `#${s}`
  return HEX.test(withHash) ? withHash.toLowerCase() : fallback
}
function clamp(raw: string | null, lo: number, hi: number, fallback: number): number {
  if (raw === null || raw.trim() === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : fallback
}

export function validateLogo(value: string): string {
  const m = LOGO_RE.exec(value)
  if (!m) throw new QrDesignError('logo must be a base64 data:image/(png|jpeg|webp|svg+xml) URI')
  const bytes = Math.floor((m[2].length * 3) / 4)
  if (bytes > MAX_LOGO_BYTES) throw new QrDesignError(`logo exceeds ${MAX_LOGO_BYTES / 1024} KB`)
  if (m[1] === 'svg+xml') {
    const svg = Buffer.from(m[2], 'base64').toString('utf8')
    // An SVG logo is rendered inside our document: refuse anything executable or external.
    if (/<script|<foreignObject|\son[a-z]+\s*=|javascript:|(?:href|src)\s*=\s*["'](?!#)/i.test(svg)) {
      throw new QrDesignError('svg logo may not contain scripts or external references')
    }
  }
  return value
}

export function parseQrDesign(params: URLSearchParams, logo?: string | null): QrDesign {
  const rawLogo = logo ?? params.get('logo')
  const caption = params.get('caption')?.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 40) || null
  const level = pick((params.get('level') || '').toUpperCase() as QrLevel, ['L', 'M', 'Q', 'H'] as const, rawLogo ? 'H' : 'M')
  return {
    size: Math.round(clamp(params.get('size'), 128, 4096, 512)),
    margin: Math.round(clamp(params.get('margin'), 0, 10, 2)),
    dark: hex(params.get('dark'), '#0f172a')!,
    dark2: hex(params.get('dark2'), null),
    light: hex(params.get('light'), '#ffffff')!,
    transparent: params.get('transparent') === '1' || params.get('transparent') === 'true',
    dotStyle: pick(params.get('dots'), ['square', 'rounded', 'dots'] as const, 'square'),
    eyeStyle: pick(params.get('eyes'), ['square', 'rounded', 'circle'] as const, 'square'),
    eyeColor: hex(params.get('eyeColor'), null),
    level: rawLogo ? 'H' : level,
    logo: rawLogo ? validateLogo(rawLogo) : null,
    logoScale: clamp(params.get('logoScale'), 0.1, 0.3, 0.22),
    caption,
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const n = (v: number) => Number(v.toFixed(3))

function inEye(x: number, y: number, count: number): boolean {
  return (x < 7 && y < 7) || (x >= count - 7 && y < 7) || (x < 7 && y >= count - 7)
}

function eyePath(x: number, y: number, style: EyeStyle): string {
  // Outer 7×7 ring (even-odd with the 5×5 hole) plus a 3×3 pupil.
  const ring = (ox: number, oy: number, s: number, r: number) =>
    `M${n(ox + r)} ${oy}h${n(s - 2 * r)}a${r} ${r} 0 0 1 ${r} ${r}v${n(s - 2 * r)}a${r} ${r} 0 0 1 -${r} ${r}h-${n(s - 2 * r)}a${r} ${r} 0 0 1 -${r} -${r}v-${n(s - 2 * r)}a${r} ${r} 0 0 1 ${r} -${r}z`
  const rOuter = style === 'square' ? 0 : style === 'rounded' ? 1.6 : 3.5
  const rInner = style === 'square' ? 0 : style === 'rounded' ? 0.9 : 2.5
  const rPupil = style === 'square' ? 0 : style === 'rounded' ? 0.7 : 1.5
  return ring(x, y, 7, rOuter) + ring(x + 1, y + 1, 5, rInner) + ring(x + 2, y + 2, 3, rPupil)
}

/** Build the whole QR as a self-contained SVG string from the module matrix. */
export function renderQrSvg(text: string, d: QrDesign): string {
  const qr = QRCode.create(text, { errorCorrectionLevel: d.level })
  const count = qr.modules.size
  const data = qr.modules.data
  const total = count + d.margin * 2
  const captionH = d.caption ? Math.max(2, Math.round(total * 0.09)) : 0
  const logoSide = d.logo ? d.logoScale * count : 0
  const logoPos = d.margin + (count - logoSide) / 2
  const pad = 0.6
  const hole = d.logo ? { x0: logoPos - pad, x1: logoPos + logoSide + pad } : null

  let dots = ''
  for (let y = 0; y < count; y++) {
    for (let x = 0; x < count; x++) {
      if (!data[y * count + x] || inEye(x, y, count)) continue
      if (hole && x + 1 > hole.x0 - d.margin && x < hole.x1 - d.margin && y + 1 > hole.x0 - d.margin && y < hole.x1 - d.margin) continue
      const px = x + d.margin, py = y + d.margin
      if (d.dotStyle === 'dots') dots += `M${n(px + 0.5)} ${n(py + 0.5)}m-0.5 0a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0z`
      else if (d.dotStyle === 'rounded') dots += `M${n(px + 0.25)} ${py}h0.5a0.25 0.25 0 0 1 0.25 0.25v0.5a0.25 0.25 0 0 1 -0.25 0.25h-0.5a0.25 0.25 0 0 1 -0.25 -0.25v-0.5a0.25 0.25 0 0 1 0.25 -0.25z`
      else dots += `M${px} ${py}h1v1h-1z`
    }
  }
  let eyes = ''
  for (const [ex, ey] of [[0, 0], [count - 7, 0], [0, count - 7]]) eyes += eyePath(ex + d.margin, ey + d.margin, d.eyeStyle)

  const fill = d.dark2 ? 'url(#g)' : d.dark
  const eyeFill = d.eyeColor ?? (d.dark2 ? d.dark : d.dark)
  const height = total + captionH
  const pxW = d.size
  const pxH = Math.round((d.size * height) / total)
  const bg = d.transparent ? '' : `<rect width="${total}" height="${height}" fill="${d.light}"/>`
  const grad = d.dark2 ? `<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${total}" y2="${total}"><stop offset="0" stop-color="${d.dark}"/><stop offset="1" stop-color="${d.dark2}"/></linearGradient></defs>` : ''
  const logo = d.logo
    ? `<rect x="${n(logoPos - pad)}" y="${n(logoPos - pad)}" width="${n(logoSide + 2 * pad)}" height="${n(logoSide + 2 * pad)}" rx="${n(logoSide * 0.18)}" fill="${d.transparent ? '#ffffff' : d.light}"/><image x="${n(logoPos)}" y="${n(logoPos)}" width="${n(logoSide)}" height="${n(logoSide)}" preserveAspectRatio="xMidYMid meet" href="${d.logo}"/>`
    : ''
  const caption = d.caption
    ? `<text x="${total / 2}" y="${n(total + captionH * 0.68)}" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-weight="700" font-size="${n(captionH * 0.5)}" fill="${d.dark}">${esc(d.caption)}</text>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${height}" width="${pxW}" height="${pxH}" shape-rendering="geometricPrecision">${grad}${bg}<path d="${dots}" fill="${fill}"/><path d="${eyes}" fill="${eyeFill}" fill-rule="evenodd"/>${logo}${caption}</svg>`
}

/** True when the request needs the custom renderer rather than the stock `qrcode` output. */
export function isCustomDesign(d: QrDesign): boolean {
  return !!(d.logo || d.dark2 || d.eyeColor || d.caption || d.transparent || d.dotStyle !== 'square' || d.eyeStyle !== 'square')
}

export async function renderQrPng(text: string, d: QrDesign): Promise<Buffer> {
  const { default: sharp } = await import('sharp')
  return sharp(Buffer.from(renderQrSvg(text, d)), { density: 72 }).png().toBuffer()
}

/** Append a scan-source marker so QR scans are separable in analytics without a second link. */
export function withScanSource(url: string, enabled: boolean): string {
  if (!enabled) return url
  const u = new URL(url)
  u.searchParams.set('utm_medium', 'qr')
  if (!u.searchParams.has('utm_source')) u.searchParams.set('utm_source', 'qr')
  return u.toString()
}
