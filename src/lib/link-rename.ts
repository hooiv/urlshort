import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { validateCloneCode } from '@/lib/link-clone'

/**
 * Rename a link's short code (Bitly "edit back-half"). The old code stops
 * resolving immediately, so callers must require explicit confirmation.
 */
export class RenameConflictError extends Error {
  constructor() {
    super('Short code already in use')
  }
}

export type RenameInput = { ok: true; code: string } | { ok: false; error: string }

export function validateRename(input: unknown, current: string): RenameInput {
  if (typeof input !== 'string' || input === '') return { ok: false, error: 'newShortCode is required' }
  const checked = validateCloneCode(input)
  if (!checked.ok) return { ok: false, error: checked.error.replace('shortCode', 'newShortCode') }
  if (checked.code === current) return { ok: false, error: 'newShortCode is the same as the current code' }
  return { ok: true, code: input }
}

export async function renameLink(urlId: string, newCode: string): Promise<{ id: string; shortCode: string }> {
  try {
    return await prisma.url.update({ where: { id: urlId }, data: { shortCode: newCode }, select: { id: true, shortCode: true } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new RenameConflictError()
    throw error
  }
}
