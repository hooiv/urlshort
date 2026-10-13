export const LINK_NOTES_MAX = 1000

/**
 * Validates a private link note. Null/empty clears it. Control characters other
 * than newline and tab are stripped; length is capped after normalisation.
 */
export function validateLinkNotes(input: unknown): string | null {
  if (input === null || input === undefined) return null
  if (typeof input !== 'string') throw new Error('notes must be a string')
  const s = input.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim()
  if (!s) return null
  if (s.length > LINK_NOTES_MAX) throw new Error(`notes must be at most ${LINK_NOTES_MAX} characters`)
  return s
}

/** Case-insensitive substring match used by link search to include notes. */
export function notesMatch(notes: string | null | undefined, query: string): boolean {
  const q = query.trim().toLowerCase()
  return !!q && !!notes && notes.toLowerCase().includes(q)
}
