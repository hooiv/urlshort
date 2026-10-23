export interface UnfurlLike {
  title?: string | null
  description?: string | null
  image?: string | null
}

export interface OgFields {
  title: string
  description: string
  image: string
}

/**
 * Merge fetched destination metadata into the editor fields. Never clobbers
 * text the user already typed unless `overwrite` is set; clamps to the limits
 * social crawlers actually display.
 */
export function mergeUnfurledOg(current: OgFields, fetched: UnfurlLike, overwrite = false): OgFields {
  const pick = (existing: string, incoming: string | null | undefined, max: number) => {
    const next = (incoming ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
    if (!next) return existing
    return overwrite || !existing.trim() ? next : existing
  }
  return {
    title: pick(current.title, fetched.title, 120),
    description: pick(current.description, fetched.description, 300),
    image: pick(current.image, /^https?:\/\//i.test(fetched.image ?? '') ? fetched.image : '', 2048),
  }
}
