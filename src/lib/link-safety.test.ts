import { describe, expect, it } from 'vitest'
import { assessDestination } from './link-safety'

describe('assessDestination', () => {
  it('clears an ordinary https destination', () => {
    expect(assessDestination('https://example.com/blog/hello')).toEqual({ status: 'cleared', reason: null })
  })

  it('flags non-http(s) protocols instead of clearing them', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,<h1>x</h1>', 'file:///etc/passwd', 'ftp://example.com/f']) {
      const result = assessDestination(url)
      expect(result.status).toBe('review')
      expect(result.reason).toMatch(/protocol/i)
    }
  })

  it('flags credential-bearing destinations', () => {
    const result = assessDestination('https://user:pass@example.com/')
    expect(result.status).toBe('review')
    expect(result.reason).toMatch(/credential/i)
  })

  it('flags executables hidden behind query, fragment, or trailing slash', () => {
    for (const url of [
      'https://example.com/dl?file=setup.exe',
      'https://example.com/setup.exe#run',
      'https://example.com/setup.exe/',
      'https://example.com/setup.msi?x=1',
    ]) {
      expect(assessDestination(url).status).toBe('review')
    }
  })

  it('keeps existing signals (unparsable, http, ip, punycode)', () => {
    expect(assessDestination('not a url').status).toBe('review')
    expect(assessDestination('http://example.com/').reason).toMatch(/unencrypted/i)
    expect(assessDestination('https://1.2.3.4/x').reason).toMatch(/ip-address/i)
    expect(assessDestination('https://xn--exmple-cua.com/').reason).toMatch(/punycode/i)
  })
})

import { detectBrandImpersonation as dbi } from './link-safety'
describe('link-safety heuristics v2', () => {
  it('flags chained shorteners', () => {
    expect(assessDestination('https://bit.ly/abc').reason).toContain('Chained')
  })
  it('flags risky TLDs', () => {
    expect(assessDestination('https://free-gift.zip/').status).toBe('review')
  })
  it('flags brand impersonation incl. look-alikes', () => {
    expect(dbi('paypa1.com')).toBe('paypal')
    expect(dbi('secure-google.example.net')).toBe('google')
    expect(assessDestination('https://login.paypal-support.com/').reason).toContain('paypal')
  })
  it('does not flag legit brand domains', () => {
    expect(dbi('www.paypal.com')).toBeNull()
    expect(assessDestination('https://www.google.com/maps').status).toBe('cleared')
    expect(assessDestination('https://example.com/').status).toBe('cleared')
  })
  it('flags hyphen stuffing', () => {
    expect(assessDestination('https://a-b-c-d-e.example.com/').reason).toContain('hyphen')
  })
  it('accepts brand country domains but not look-alike suffix tricks', () => {
    expect(dbi('www.google.co.uk')).toBeNull()
    expect(dbi('amazon.de')).toBeNull()
    expect(dbi('paypal.com.evil.net')).toBe('paypal')
    expect(dbi('google.com.au')).toBeNull()
  })
  it('treats a trailing-dot host like the bare host', () => {
    expect(assessDestination('https://bit.ly./abc').reason).toContain('Chained')
  })
})

describe('embedded redirect parameters', () => {
  it('flags a redirect parameter pointing at another host', () => {
    const r = assessDestination('https://example.com/out?url=https%3A%2F%2Fevil.example.net%2Fx')
    expect(r.status).toBe('review')
    expect(r.reason).toMatch(/redirect parameter/i)
  })
  it('ignores same-host, relative and non-URL values', () => {
    for (const u of ['https://example.com/a?next=https://example.com/b', 'https://example.com/a?next=/dashboard', 'https://example.com/a?q=shoes', 'https://example.com/a?utm_source=x']) {
      expect(assessDestination(u)).toEqual({ status: 'cleared', reason: null })
    }
  })
  it('ignores non-http inner schemes', () => {
    expect(assessDestination('https://example.com/a?url=mailto:a@b.co').status).toBe('cleared')
  })

  it('flags non-standard ports and script/launcher files', () => {
    expect(assessDestination('https://example.com:8443/x').reason).toMatch(/port/i)
    expect(assessDestination('https://example.com/run.ps1').reason).toMatch(/script/i)
    expect(assessDestination('https://example.com/a.lnk?x=1').status).toBe('review')
    expect(assessDestination('https://example.com:443/x').status).toBe('cleared')
  })
})

describe('more chained shorteners', () => {
  it.each(['https://tiny.cc/x', 'https://www.bit.ly/x', 'https://lnkd.in/abc', 'https://dub.sh/a'])('flags %s', (u) => {
    expect(assessDestination(u).reason).toMatch(/Chained link-shortener/)
  })
  it('does not flag lookalike suffix hosts', () => {
    expect(assessDestination('https://notbit.ly.example.org/x').reason ?? '').not.toMatch(/Chained/)
  })
})

describe('encoded and numeric tricks', () => {
  it('flags percent-encoded control characters', () => {
    expect(assessDestination('https://example.com/a%0d%0aSet-Cookie:x').status).toBe('review')
    expect(assessDestination('https://example.com/a%7f').status).toBe('review')
  })
  it('does not flag ordinary encoded text', () => {
    expect(assessDestination('https://example.com/caf%C3%A9?q=a%20b').status).toBe('cleared')
  })
  it('flags numeric-only hosts that are not valid IPs', () => {
    expect(assessDestination('https://999.999.999.999/').status).toBe('review')
  })
})

describe('double encoding and archives', () => {
  it('flags double-encoded characters', () => {
    expect(assessDestination('https://example.com/a%252e%252e/b').reason).toMatch(/Double-encoded/)
  })
  it('flags archive and macro downloads', () => {
    expect(assessDestination('https://example.com/invoice.zip').reason).toMatch(/Archive/)
    expect(assessDestination('https://example.com/q.docm').status).toBe('review')
  })
  it('does not flag a literal percent sign followed by plain text', () => {
    expect(assessDestination('https://example.com/zip-codes?q=50%25off').status).toBe('cleared')
  })
})

describe('deep subdomains and script-scheme params', () => {
  it('flags 7+ label hosts', () => {
    expect(assessDestination('https://a.b.c.d.e.f.example.com/').reason).toContain('deep subdomain')
    expect(assessDestination('https://a.b.example.com/').status).toBe('cleared')
  })
  it('flags javascript:/data: query values', () => {
    expect(assessDestination('https://example.com/x?cb=javascript:alert(1)').reason).toContain('payload')
    expect(assessDestination('https://example.com/x?v=data:text/html,hi').status).toBe('review')
    expect(assessDestination('https://example.com/x?v=metadata:1').status).toBe('cleared')
  })

  it('flags unusually long URLs', () => {
    const r = assessDestination('https://example.com/?q=' + 'a'.repeat(2100))
    expect(r.status).toBe('review')
    expect(r.reason).toMatch(/long URL/)
  })

  it('flags trailing-dot hostnames', () => {
    const r = assessDestination('https://example.com./x')
    expect(r.status).toBe('review')
    expect(r.reason).toMatch(/Malformed hostname/)
  })

  it('flags invisible and bidi-control characters, raw or percent-encoded', () => {
    expect(assessDestination('https://example.com/a\u202Egpj.exe').reason).toMatch(/bidirectional/)
    expect(assessDestination('https://example.com/a%E2%80%8Bb').reason).toMatch(/Invisible/)
    expect(assessDestination('https://example.com/%E4%B8%AD').status).toBe('cleared')
    expect(assessDestination('https://example.com/100%zz').status).toBe('cleared')
  })
})

describe('mixed-script hostnames', () => {
  it('flags Latin+Cyrillic labels', () => {
    const r = assessDestination('https://pаypal.com/')
    expect(r.status).toBe('review')
    expect(r.reason).toContain('Mixed-script')
  })
  it('does not flag pure Cyrillic or pure Latin', () => {
    expect(assessDestination('https://пример.рф/').reason ?? '').not.toContain('Mixed-script')
    expect(assessDestination('https://example.com/').status).toBe('cleared')
  })
})

describe('double-extension masquerade', () => {
  it('flags invoice.pdf.exe style paths', () => {
    expect(assessDestination('https://example.com/files/invoice.pdf.exe').reason).toContain('Double-extension')
    expect(assessDestination('https://example.com/a/report.docx.js?x=1').reason).toContain('Double-extension')
  })
  it('does not flag ordinary documents', () => {
    expect(assessDestination('https://example.com/files/invoice.pdf').status).toBe('cleared')
  })

  it('flags fragments that mimic another destination', () => {
    expect(assessDestination('https://example.com/#//paypal.com/login').reason).toContain('fragment mimics')
    expect(assessDestination('https://example.com/#section-2').status).toBe('cleared')
  })

  it('flags installer and system-package file destinations', () => {
    for (const url of [
      'https://example.com/app.msix',
      'https://example.com/get?f=tool.pkg',
      'https://example.com/x.jnlp#go',
      'https://example.com/patch.reg/',
      'https://example.com/lib.dll',
    ]) {
      const r = assessDestination(url)
      expect(r.status).toBe('review')
      expect(r.reason).toMatch(/installer/i)
    }
    expect(assessDestination('https://example.com/packages/overview').status).toBe('cleared')
  })
})

describe('cloud metadata endpoints', () => {
  it.each(['http://169.254.169.254/latest/meta-data/', 'https://metadata.google.internal/computeMetadata/v1/', 'http://100.100.100.200/latest/', 'http://[fd00:ec2::254]/latest/'])('flags %s', (u) => {
    expect(assessDestination(u).reason).toContain('Cloud instance-metadata')
  })
  it('does not flag ordinary hosts', () => {
    expect(assessDestination('https://example.com/metadata').reason).toBeNull()
  })
})

describe('disk-image downloads', () => {
  it.each(['https://example.com/invoice.iso', 'https://example.com/a/setup.IMG?x=1', 'https://example.com/tool.vhdx'])('flags %s', (u) => {
    expect(assessDestination(u).reason).toContain('Disk-image')
  })
  it.each(['https://example.com/a.pdf.msc','https://example.com/a.docx.msix','https://example.com/a.zip.iso'])('flags double extension %s', (u) => {
    expect(assessDestination(u).reason).not.toBeNull()
  })
  it.each(['https://example.com/a.csv.scr','https://example.com/a.gif.js'])('flags decoy %s', (u) => {
    expect(assessDestination(u).reason).toContain('Double-extension')
  })
  it('flags right-to-left override in file name', () => {
    expect(assessDestination('https://example.com/invoice%E2%80%AEfdp.exe').reason).not.toBeNull()
    expect(assessDestination('https://example.com/report.pdf').reason).toBeNull()
  })
  it.each(['https://example.com/invoice.pdf.pif','https://example.com/doc.docx.wsf','https://example.com/a.txt.jse'])('flags double extension %s', (u) => {
    expect(assessDestination(u).reason).not.toBeNull()
  })
  it('does not flag lookalike paths', () => {
    expect(assessDestination('https://example.com/isometric-guide').reason).toBeNull()
  })
})

describe('macro documents and script files', () => {
  it.each(['https://example.com/invoice.docm', 'https://example.com/a/run.VBS?x=1', 'https://example.com/pay.hta'])('flags %s', (u) => {
    expect(assessDestination(u).reason).toContain('Macro-enabled')
  })
  it.each(['https://example.com/a.wsf', 'https://example.com/x.reg', 'https://example.com/h.chm', 'https://example.com/i.msix', 'https://example.com/s.scr', 'https://example.com/v.vbe', 'https://example.com/j.jse', 'https://example.com/p.msi', 'https://example.com/g.gadget', 'https://example.com/w.jnlp', 'https://example.com/p.msp', 'https://example.com/t.mst', 'https://example.com/m.psm1', 'https://example.com/a.appinstaller', 'https://example.com/c.application', 'https://example.com/b.xbap', 'https://example.com/s.sct', 'https://example.com/d.inf', 'https://example.com/o.ocx', 'https://example.com/a.appref-ms', 'https://example.com/a.xll', 'https://example.com/b.wll', 'https://example.com/q.iqy', 'https://example.com/s.slk', 'https://example.com/m.msc', 'https://example.com/m.psd1', 'https://example.com/m.ps1xml', 'https://example.com/m.psc1', 'https://example.com/m.diagcab', 'https://example.com/m.settingcontent-ms', 'https://example.com/m.themepack', 'https://example.com/m.library-ms', 'https://example.com/m.searchconnector-ms', 'https://example.com/m.msh1', 'https://example.com/m.mht', 'https://example.com/d.iso', 'https://example.com/d.vhd', 'https://example.com/d.vhdx', 'https://example.com/d.img'])('flags launcher file %s', (u) => {
    expect(assessDestination(u).reason).not.toBeNull()
  })
  it('does not flag lookalike paths', () => {
    expect(assessDestination('https://example.com/docmost-guide').reason).toBeNull()
  })
})

describe('tunnel and dynamic-DNS hosts', () => {
  it.each(['https://abc123.ngrok-free.app/x', 'https://random-words.trycloudflare.com/', 'https://me.duckdns.org/a', 'https://ngrok.io/'])('flags %s', (u) => {
    expect(assessDestination(u).reason).toContain('tunnel')
  })
  it('does not flag lookalike hosts', () => {
    expect(assessDestination('https://notngrok.io.example.com/').reason).toBeNull()
    expect(assessDestination('https://myduckdns.org.example.com/').reason).toBeNull()
  })
})

describe('free-hosting brand phishing', () => {
  it('flags brand names on free-hosting subdomains', () => {
    expect(assessDestination('https://paypal-login.pages.dev/x').reason).toMatch(/free-hosting/)
  })
  it('does not flag unrelated free-hosting sites', () => {
    expect(assessDestination('https://my-portfolio.pages.dev/').reason ?? '').not.toMatch(/free-hosting/)
  })
})

describe('ipfs-hosted brand phishing', () => {
  it('flags brand names in IPFS gateway paths', () => {
    expect(assessDestination('https://ipfs.io/ipfs/Qm123/paypal-login.html').reason).toMatch(/IPFS/)
  })
  it('allows plain IPFS content', () => {
    expect(assessDestination('https://ipfs.io/ipfs/Qm123/readme.html').reason ?? '').not.toMatch(/IPFS/)
  })

  it('flags brand names in cloud-storage bucket hostnames', () => {
    const r = assessDestination('https://paypal-login.s3.amazonaws.com/index.html')
    expect(r.status).toBe('review')
    expect(r.reason).toContain('cloud-storage bucket')
    expect(assessDestination('https://paypal-login.example.com/a.png').reason).not.toContain('cloud-storage bucket')
  })
})

describe('whole-script homoglyph spoofing', () => {
  it('flags an all-Cyrillic lookalike of a brand', async () => {
    const { detectWholeScriptSpoof } = await import('./link-safety')
    expect(detectWholeScriptSpoof('арр\u04CFе.com')).toBe('apple')
    expect(assessDestination('https://аррӏе.com/').reason).toMatch(/lookalike of apple/)
  })
  it('does not flag plain Latin or unrelated Cyrillic hosts', async () => {
    const { detectWholeScriptSpoof } = await import('./link-safety')
    expect(detectWholeScriptSpoof('apple.com')).toBeNull()
    expect(detectWholeScriptSpoof('пример.рф')).toBeNull()
  })

  it('flags double-extension disguised executables but not plain documents', () => {
    expect(assessDestination('https://example.com/files/invoice.pdf.exe').reason).toContain('Double-extension')
    expect(assessDestination('https://example.com/a/report.docx.js?x=1').status).toBe('review')
    expect(assessDestination('https://example.com/files/invoice.pdf')).toEqual({ status: 'cleared', reason: null })
  })
})

describe('backslash authority confusion', () => {
  it('flags backslashes that make parsers disagree about the host', () => {
    expect(assessDestination('https://example.com\\@evil.test/').reason).toContain('Backslash')
    expect(assessDestination('https:\\\\evil.test/').reason).toContain('Backslash')
  })
  it('does not flag normal URLs', () => {
    expect(assessDestination('https://example.com/a/b')).toEqual({ status: 'cleared', reason: null })
  })
})


describe('encoded delimiter in credentials', () => {
  it('flags %40 and %2f smuggled into userinfo', () => {
    expect(assessDestination('https://paypal.com%40evil.test@example.org/').reason).toContain('Encoded delimiter')
    expect(assessDestination('https://shop.com%2f@example.org/').reason).toContain('Encoded delimiter')
  })
  it('does not flag plain paths with encoded characters', () => {
    expect(assessDestination('https://example.com/a%40b')).toEqual({ status: 'cleared', reason: null })
  })
})

describe('windows shortcut and search-connector files', () => {
  it('flags .search-ms, .url and .chm destinations', () => {
    expect(assessDestination('https://example.com/invoice.search-ms').reason).toContain('Windows shortcut')
    expect(assessDestination('https://example.com/help.chm?x=1').status).toBe('review')
    expect(assessDestination('https://example.com/Shortcut.URL').status).toBe('review')
  })
  it('does not flag lookalike path segments', () => {
    expect(assessDestination('https://example.com/url/guide')).toEqual({ status: 'cleared', reason: null })
    expect(assessDestination('https://example.com/a.html')).toEqual({ status: 'cleared', reason: null })
  })
})

describe('obfuscated IP literals', () => {
  it('flags hex, octal, integer and short-form IPs', () => {
    for (const u of ['http://0x7f.1/', 'http://2130706433/x', 'https://0177.0.0.1/', 'https://0x7f000001:8080/a'])
      expect(assessDestination(u).reason).toContain('Obfuscated IP')
  })
  it('reports plain dotted IPs only as direct IP', () => {
    const r = assessDestination('https://8.8.8.8/x')
    expect(r.reason).toContain('Direct IP')
    expect(r.reason).not.toContain('Obfuscated')
  })
})

describe('private IP destinations', () => {
  it('flags loopback, RFC1918, CGNAT, link-local and IPv6 private ranges', () => {
    for (const u of ['http://127.0.0.1/', 'https://10.1.2.3/', 'https://172.16.0.9/', 'https://192.168.1.1/', 'https://100.64.0.1/', 'https://169.254.1.1/', 'https://[::1]/', 'https://[fd12:3456::1]/', 'https://[fe80::1]/', 'https://[::ffff:10.0.0.1]/'])
      expect(assessDestination(u).reason, u).toContain('Private, loopback')
  })
  it('does not flag public IPs as private', () => {
    expect(assessDestination('https://8.8.8.8/').reason).not.toContain('Private')
    expect(assessDestination('https://172.32.0.1/').reason).not.toContain('Private')
    expect(assessDestination('https://100.128.0.1/').reason).not.toContain('Private')
  })
})

describe('base64-hidden destinations', () => {
  it('flags base64 URLs in query values and path segments (std and url-safe)', () => {
    const b = Buffer.from('http://evil.example/x').toString('base64')
    expect(assessDestination(`https://example.com/go?u=${encodeURIComponent(b)}`).reason).toContain('Base64-encoded URL')
    expect(assessDestination(`https://example.com/r/${Buffer.from('https://evil.example/y').toString('base64url')}`).reason).toContain('Base64-encoded URL')
  })
  it('ignores ordinary long tokens', () => {
    expect(assessDestination('https://example.com/a/abcdefghijklmnopqrstuvwxyz').reason ?? '').not.toContain('Base64')
  })
})

describe('lookalike dot/slash characters', () => {
  it('flags fraction-slash and one-dot-leader characters', () => {
    expect(assessDestination('https://example.com\u2215login.evil.example/').reason).toContain('Lookalike dot or slash')
    expect(assessDestination('https://example.com/a\u2024exe').reason).toContain('Lookalike dot or slash')
  })
  it('does not flag plain URLs', () => {
    expect(assessDestination('https://example.com/a.b/c').reason ?? '').not.toContain('Lookalike')
  })
})

describe('userinfo hostname spoofing', () => {
  it('flags a domain-shaped username before the real host', () => {
    const r = assessDestination('https://paypal.com@evil-example.org/x')
    expect(r.status).toBe('review')
    expect(r.reason).toContain('Hostname-lookalike in credentials')
  })
  it('does not flag a plain username', () => {
    expect(assessDestination('https://bob@example.org/x').reason ?? '').not.toContain('Hostname-lookalike')
  })
})

describe('heavy percent-encoding', () => {
  it('flags a mostly-encoded path', () => {
    const enc = Array.from('login-verify-account').map((c) => '%' + c.charCodeAt(0).toString(16)).join('')
    expect(assessDestination(`https://example.org/${enc}`).reason).toContain('Heavily percent-encoded')
  })
  it('does not flag a normal encoded space or short path', () => {
    expect(assessDestination('https://example.org/my%20long%20document%20name%20here').reason ?? '').not.toContain('Heavily')
  })
})

describe('accented brand lookalikes', () => {
  it('flags diacritic and stroked-letter spoofs of protected brands', () => {
    for (const url of ['https://paypál.com/', 'https://amazøn.com/x', 'https://goögle.com/']) {
      const r = assessDestination(url)
      expect(r.status).toBe('review')
      expect(r.reason).toMatch(/Accented lookalike/)
    }
  })
  it('does not flag legitimate accented domains or plain brand-free hosts', () => {
    expect(assessDestination('https://café.example/menu').reason).not.toMatch(/Accented lookalike/)
    expect(assessDestination('https://münchen.example/').reason).not.toMatch(/Accented lookalike/)
  })
})

describe('office add-in and legacy script-host files', () => {
  it('flags .xll, .wsh and .iqy destinations', () => {
    expect(assessDestination('https://example.com/report.xll').reason).toContain('Office add-in')
    expect(assessDestination('https://example.com/a.wsh?x=1').status).toBe('review')
    expect(assessDestination('https://example.com/q.iqy#f').status).toBe('review')
  })
  it('does not flag lookalike names', () => {
    expect(assessDestination('https://example.com/xll-guide').status).toBe('cleared')
    expect(assessDestination('https://example.com/news.html').status).toBe('cleared')
  })
})

describe('ClickOnce and Word add-in destinations', () => {
  it('flags .application and .wll files', () => {
    expect(assessDestination('https://example.com/setup.application').status).toBe('review')
    expect(assessDestination('https://example.com/a.wll?x=1').status).toBe('review')
  })
  it('does not flag lookalike paths', () => {
    expect(assessDestination('https://example.com/application-form').status).toBe('cleared')
  })
})

describe('Java Web Start and PowerShell console destinations', () => {
  it('flags .jnlp, .pif, .psc1 and .cmd files', () => {
    for (const f of ['a.jnlp', 'b.pif', 'c.psc1', 'd.cmd?x=1', 'e.ps1xml']) {
      expect(assessDestination(`https://example.com/${f}`).status).toBe('review')
    }
  })
  it('does not flag lookalike paths', () => {
    expect(assessDestination('https://example.com/cmd-guide').status).toBe('cleared')
  })
})

describe('legacy Windows script and screensaver destinations', () => {
  it('flags .vbe, .wsf, .wsc, .scr, .cpl and .hta files', () => {
    for (const f of ['a.vbe', 'b.wsf', 'c.wsc', 'd.scr?x=1', 'e.cpl', 'f.hta']) {
      expect(assessDestination(`https://example.com/${f}`).status).toBe('review')
    }
  })
  it('does not flag lookalike paths', () => {
    expect(assessDestination('https://example.com/scr-guide').status).toBe('cleared')
  })
})

import { detectBrandImpersonation as detectBrandExtra } from './link-safety'
describe('brand impersonation (extended brand list)', () => {
  it('flags wellsfargo and whatsapp look-alikes', () => {
    expect(detectBrandExtra('wellsfargo-login.example.com')).toBe('wellsfargo')
    expect(detectBrandExtra('whatsapp.verify-now.net')).toBe('whatsapp')
  })
  it('allows the brand own domain', () => {
    expect(detectBrandExtra('www.linkedin.com')).toBeNull()
  })
})
