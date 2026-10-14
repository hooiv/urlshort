/**
 * Short links are redirect shims: search engines should index the destination,
 * never the short URL (avoids duplicate-content and link-equity dilution).
 * `noindex` alone would still let crawlers follow the redirect, so we leave
 * `follow` implicit and pass equity through.
 */
export const ROBOTS_NOINDEX = 'noindex'

export function applyRobotsHeader<T extends { headers: Headers }>(response: T): T {
  response.headers.set('X-Robots-Tag', ROBOTS_NOINDEX)
  return response
}
