import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Don't crawl private per-link pages or API routes.
        disallow: ['/api/', '/manage/', '/analytics/', '/account', '/workspaces'],
      },
    ],
  }
}
