import { prisma } from '@/lib/prisma'
import {
  decryptSecret, encryptSecret, generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, otpauthUri, verifyTotp,
} from '@/lib/totp'

/** Begin enrolment: store a fresh (not yet enabled) secret. Returns it once for the QR. */
export async function beginTotpSetup(userId: string, email: string) {
  const secret = generateTotpSecret()
  await prisma.user.update({ where: { id: userId }, data: { totpSecretEnc: encryptSecret(secret), totpEnabledAt: null, totpLastCounter: null } })
  return { secret, otpauthUri: otpauthUri(secret, email) }
}

async function replaceRecoveryCodes(userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes()
  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId } }),
    prisma.recoveryCode.createMany({ data: codes.map((c) => ({ userId, codeHash: hashRecoveryCode(c) })) }),
  ])
  return codes
}

/** Confirm enrolment with a first valid code; enables 2FA and returns recovery codes (shown once). */
export async function enableTotp(userId: string, code: string, now = Date.now()): Promise<string[] | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user?.totpSecretEnc || user.totpEnabledAt) return null
  const counter = verifyTotp(decryptSecret(user.totpSecretEnc), code, { now })
  if (counter === null) return null
  await prisma.user.update({ where: { id: userId }, data: { totpEnabledAt: new Date(now), totpLastCounter: counter } })
  return replaceRecoveryCodes(userId)
}

/**
 * Check a second factor at sign-in: a TOTP code (replay-protected via an atomic
 * counter advance) or a single-use recovery code.
 */
export async function verifySecondFactor(userId: string, input: string, now = Date.now()): Promise<'totp' | 'recovery' | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user?.totpSecretEnc || !user.totpEnabledAt) return null
  const counter = verifyTotp(decryptSecret(user.totpSecretEnc), input, { now, lastUsedCounter: user.totpLastCounter })
  if (counter !== null) {
    const r = await prisma.user.updateMany({
      where: { id: userId, OR: [{ totpLastCounter: null }, { totpLastCounter: { lt: counter } }] },
      data: { totpLastCounter: counter },
    })
    return r.count === 1 ? 'totp' : null
  }
  if (/^\d{6}$/.test(input.replace(/\s/g, ''))) return null
  const r = await prisma.recoveryCode.updateMany({
    where: { userId, codeHash: hashRecoveryCode(input), usedAt: null },
    data: { usedAt: new Date(now) },
  })
  return r.count === 1 ? 'recovery' : null
}

export async function disableTotp(userId: string) {
  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId } }),
    prisma.user.update({ where: { id: userId }, data: { totpSecretEnc: null, totpEnabledAt: null, totpLastCounter: null } }),
  ])
}

export async function regenerateRecoveryCodes(userId: string) {
  return replaceRecoveryCodes(userId)
}

export async function mfaStatus(userId: string) {
  const [user, remaining] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { totpEnabledAt: true } }),
    prisma.recoveryCode.count({ where: { userId, usedAt: null } }),
  ])
  return { enabled: !!user?.totpEnabledAt, enabledAt: user?.totpEnabledAt ?? null, recoveryCodesRemaining: remaining }
}
