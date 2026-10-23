/**
 * Folder defaults: tags and a UTM template that every link created in a
 * folder inherits. Explicit input always wins: the caller's tags are kept and
 * defaults are only added; a template the caller picked is never replaced.
 */
export const MAX_FOLDER_DEFAULT_TAGS = 10
const TAG_RE = /^[a-z0-9][a-z0-9-_ ]{0,31}$/

export function normalizeDefaultTags(input: readonly string[]): string[] {
  const out: string[] = []
  for (const raw of input) {
    const tag = raw.trim().toLowerCase()
    if (!TAG_RE.test(tag)) throw new Error(`Invalid default tag "${raw.slice(0, 32)}"`)
    if (!out.includes(tag)) out.push(tag)
  }
  if (out.length > MAX_FOLDER_DEFAULT_TAGS) throw new Error(`A folder can have at most ${MAX_FOLDER_DEFAULT_TAGS} default tags`)
  return out
}

/** Caller tags first, then folder defaults not already present, capped at `max`. */
export function mergeFolderTags(explicit: readonly string[], defaults: readonly string[] | null | undefined, max = MAX_FOLDER_DEFAULT_TAGS): string[] {
  const out = [...explicit]
  for (const tag of defaults ?? []) if (!out.includes(tag)) out.push(tag)
  return out.slice(0, max)
}

/** The template to apply: the caller's explicit choice, else the folder's default. */
export function pickUtmTemplateId(explicit: unknown, folderDefault: string | null | undefined): string | null {
  if (typeof explicit === 'string' && explicit) return explicit
  return folderDefault || null
}
