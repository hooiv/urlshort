import type { MetadataRoute } from 'next'
export default function manifest(): MetadataRoute.Manifest {
  return { name: 'QuickLink', short_name: 'QuickLink', description: 'Permanent smart links with routing and experiments.', start_url: '/', display: 'standalone', background_color: '#020617', theme_color: '#020617', icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }] }
}

