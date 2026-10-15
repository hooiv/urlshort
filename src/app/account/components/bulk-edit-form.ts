export type BulkEditForm = {
  addTags: string
  removeTags: string
  folder: '' | 'none' | string
  expiry: '' | 'clear' | string // yyyy-mm-dd, interpreted as end of that day in the browser's zone
  extendDays: string // whole days to push existing expiries out
  state: '' | 'archive' | 'restore' | 'trash'
  password: '' | 'remove' | string // '' leaves as is, 'remove' clears, anything else sets
  pin: '' | 'pin' | 'unpin'
  redirect: '' | 'default' | '301' | '302' | '308'
  utmSource: string
  utmMedium: string
  utmCampaign: string
  rewriteMode: '' | 'host' | 'prefix' | 'text'
  rewriteFrom: string
  rewriteTo: string
  maxClicks: '' | 'clear' | string
  dailyCap: '' | 'clear' | string
  expiredUrl: '' | 'clear' | string
  notes: '' | 'clear' | string
  cloak: '' | 'on' | 'off'
}

export const emptyBulkEditForm: BulkEditForm = { addTags: '', removeTags: '', folder: '', expiry: '', extendDays: '', state: '', password: '', pin: '', redirect: '', utmSource: '', utmMedium: '', utmCampaign: '', rewriteMode: '', rewriteFrom: '', rewriteTo: '', maxClicks: '', dailyCap: '', expiredUrl: '', notes: '', cloak: '' }

const splitTags = (v: string) => v.split(',').map((t) => t.trim()).filter(Boolean)

/** Turns the form into the `changes` object for PATCH /api/bulk/edit, or an error to show. */
export function buildBulkEditChanges(form: BulkEditForm, now = new Date()): { changes: Record<string, unknown> } | { error: string } {
  const changes: Record<string, unknown> = {}
  const add = splitTags(form.addTags)
  const remove = splitTags(form.removeTags)
  if (add.length) changes.addTags = add
  if (remove.length) changes.removeTags = remove
  if (form.folder) changes.folderId = form.folder === 'none' ? null : form.folder
  if (form.expiry === 'clear') changes.expiresAt = null
  else if (form.expiry) {
    const [y, m, d] = form.expiry.split('-').map(Number)
    const end = new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59)
    if (!y || Number.isNaN(end.getTime())) return { error: 'Choose a valid expiry date' }
    if (end.getTime() <= now.getTime()) return { error: 'Expiry must be in the future' }
    changes.expiresAt = end.toISOString()
  }
  if (form.extendDays.trim()) {
    const n = Number(form.extendDays.trim())
    if (!Number.isInteger(n) || n < 1 || n > 3650) return { error: 'Extend by a whole number of days from 1 to 3650' }
    if (form.expiry) return { error: 'Set a new expiry date or extend by days, not both' }
    changes.extendExpiryDays = n
  }
  if (form.state === 'trash') {
    if (Object.keys(changes).length) return { error: 'Moving to trash cannot be combined with other changes' }
    return { changes: { trash: true } }
  }
  if (form.state) changes.archived = form.state === 'archive'
  if (form.pin) changes.pinned = form.pin === 'pin'
  if (form.redirect) changes.redirectStatus = form.redirect === 'default' ? null : Number(form.redirect)
  if (form.password === 'remove') changes.password = null
  else if (form.password) {
    if (form.password.length < 4 || form.password.length > 128) return { error: 'Password must be 4 to 128 characters' }
    changes.password = form.password
  }
  const utm: Record<string, string> = {}
  if (form.utmSource.trim()) utm.source = form.utmSource.trim()
  if (form.utmMedium.trim()) utm.medium = form.utmMedium.trim()
  if (form.utmCampaign.trim()) utm.campaign = form.utmCampaign.trim()
  if (Object.keys(utm).length) changes.utm = utm
  if (form.rewriteMode) {
    const from = form.rewriteFrom.trim()
    const to = form.rewriteTo.trim()
    if (!from) return { error: 'Enter the destination text to find' }
    if (form.rewriteMode !== 'text' && !to) return { error: 'Enter the replacement' }
    changes.rewriteDestination = form.rewriteMode === 'text'
      ? { mode: 'text', find: from, replace: form.rewriteTo }
      : { mode: form.rewriteMode, from, to }
  }
  for (const [key, raw, max, label] of [['maxClicks', form.maxClicks, 1_000_000_000, 'Click limit'], ['dailyClickCap', form.dailyCap, 1_000_000_000, 'Daily click cap']] as const) {
    const v = raw.trim()
    if (v === 'clear') changes[key] = null
    else if (v) {
      const n = Number(v)
      if (!Number.isInteger(n) || n < 1 || n > max) return { error: `${label} must be a whole number of at least 1` }
      changes[key] = n
    }
  }
  const eu = form.expiredUrl.trim()
  if (eu === 'clear') changes.expiredUrl = null
  else if (eu) {
    if (!/^https?:\/\/\S+$/i.test(eu) || eu.length > 2048) return { error: 'Fallback URL must start with http:// or https://' }
    changes.expiredUrl = eu
  }
  if (form.notes === 'clear') changes.notes = null
  else if (form.notes.trim()) {
    if (form.notes.trim().length > 2000) return { error: 'Notes are limited to 2000 characters' }
    changes.notes = form.notes.trim()
  }
  if (form.cloak) changes.cloaked = form.cloak === 'on'
  if (!Object.keys(changes).length) return { error: 'Choose at least one change' }
  return { changes }
}
