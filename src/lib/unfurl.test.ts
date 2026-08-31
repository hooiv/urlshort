import { describe, expect, it } from 'vitest'
import { parseHtmlMetadata } from './unfurl'

describe('parseHtmlMetadata', () => {
  it('extracts standard OpenGraph tags accurately', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Fallback Title</title>
          <meta property="og:title" content="OpenGraph Product Launch" />
          <meta property="og:description" content="Supercharge your marketing campaigns with smart routing." />
          <meta property="og:image" content="/assets/hero.png" />
          <meta property="og:site_name" content="Acme Cloud" />
          <link rel="icon" href="/favicon.svg" />
        </head>
        <body>Hello world</body>
      </html>
    `
    const result = parseHtmlMetadata(html, 'https://example.com/products/launch')
    expect(result.title).toBe('OpenGraph Product Launch')
    expect(result.description).toBe('Supercharge your marketing campaigns with smart routing.')
    expect(result.image).toBe('https://example.com/assets/hero.png')
    expect(result.siteName).toBe('Acme Cloud')
    expect(result.icon).toBe('https://example.com/favicon.svg')
  })

  it('falls back to Twitter card tags and standard title when OG is missing', () => {
    const html = `
      <html>
        <head>
          <meta name="twitter:title" content="Twitter Card Title &amp; More" />
          <meta name="twitter:description" content="Fast &quot;reliable&quot; link engine." />
          <meta name="twitter:image" content="https://cdn.example.com/thumb.jpg" />
          <link rel="apple-touch-icon" href="/icons/apple-180.png" />
        </head>
      </html>
    `
    const result = parseHtmlMetadata(html, 'https://sub.domain.com/blog/post-1')
    expect(result.title).toBe('Twitter Card Title & More')
    expect(result.description).toBe('Fast "reliable" link engine.')
    expect(result.image).toBe('https://cdn.example.com/thumb.jpg')
    expect(result.icon).toBe('https://sub.domain.com/icons/apple-180.png')
    expect(result.siteName).toBe('sub.domain.com')
  })

  it('falls back to HTML title and description meta tag when social tags are absent', () => {
    const html = `
      <html>
        <head>
          <title>Simple Documentation &#8211; Guide</title>
          <meta name="description" content="Official documentation for developers." />
        </head>
      </html>
    `
    const result = parseHtmlMetadata(html, 'https://docs.acme.io/v2')
    expect(result.title).toBe('Simple Documentation &#8211; Guide')
    expect(result.description).toBe('Official documentation for developers.')
    expect(result.image).toBeNull()
    expect(result.icon).toBe('https://docs.acme.io/favicon.ico')
  })

  it('handles HTML entities and protocol-relative image URLs correctly', () => {
    const html = `
      <html>
        <head>
          <title>Test Page</title>
          <meta property="og:image" content="//cdn.brand.com/images/card.png" />
        </head>
      </html>
    `
    const result = parseHtmlMetadata(html, 'https://brand.com')
    expect(result.image).toBe('https://cdn.brand.com/images/card.png')
  })
})
