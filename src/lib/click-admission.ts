import { prisma } from './prisma'
import { releaseUsage, reserveUsageLeaseInTransaction, usagePeriodKey } from './tenant-usage'

/**
 * Click admission for tenant quotas on the redirect hot path.
 *
 * Before: every billable click on a workspace link opened a transaction that
 * took `SELECT … FOR UPDATE` on the tenant's quota row, so all clicks of a
 * tenant were serialised through one row lock at ~5 round trips each. A viral
 * link turned into lock convoys and p99 redirect latency in the hundreds of ms.
 *
 * Now each instance holds a short-lived lease of pre-reserved units per
 * tenant and admits clicks from memory. Properties:
 *
 *  - Never over-admits: every unit is reserved in the DB before it is spent.
 *  - Exact near the limit: lease size is headroom/20 (max 25), so it drops to
 *    one unit as a tenant approaches its quota, but grows to cover callers
 *    already queued so a burst is admitted in a handful of round trips.
 *  - Unlimited tenants (no quota row) skip synchronous accounting entirely;
 *    the click queue measures them, as it already did for unreserved clicks.
 *  - Leftover units are handed back when a lease expires (sweeper) or is
 *    renewed. A crashed instance can strand at most one lease (≤ 25 units)
 *    until month end: conservative, never in the tenant's favour.
 */

const LEASE_TTL_MS = 5_000
const UNLIMITED_TTL_MS = 5_000
export const MAX_LEASE_UNITS = 25n
export const HEADROOM_DIVISOR = 20n
/** Each acquisition grants ≥ 1 unit while headroom remains, so this only bounds pathological churn. */
const MAX_ACQUIRE_ATTEMPTS = 50

/** exhausted: the DB granted nothing (tenant at limit); reject fast until expiry. */
type Lease = { periodKey: string; remaining: bigint; expiresAt: number; exhausted: boolean }

type State = {
  leases: Map<string, Lease>
  unlimitedUntil: Map<string, number>
  inflight: Map<string, Promise<void>>
  /** Admissions currently waiting on an acquisition, per tenant: the next lease's demand. */
  waiting: Map<string, number>
  sweeper?: ReturnType<typeof setInterval>
}
const globalState = globalThis as unknown as { __qlClickAdmission?: State }
const state: State = globalState.__qlClickAdmission ?? { leases: new Map(), unlimitedUntil: new Map(), inflight: new Map(), waiting: new Map() }
globalState.__qlClickAdmission = state

export type ClickAdmission = { admitted: boolean; reserved: boolean }

function take(workspaceId: string, now: number): boolean {
  const lease = state.leases.get(workspaceId)
  if (!lease || lease.remaining <= 0n || lease.expiresAt <= now || lease.periodKey !== usagePeriodKey(new Date(now))) return false
  lease.remaining -= 1n
  return true
}

async function acquire(workspaceId: string): Promise<void> {
  const existing = state.inflight.get(workspaceId)
  if (existing) return existing
  const flight = (async () => {
    const previous = state.leases.get(workspaceId)
    const release = previous && previous.remaining > 0n ? { periodKey: previous.periodKey, amount: previous.remaining } : undefined
    // Detach the old lease before the await so concurrent callers can't spend
    // units we are about to hand back.
    state.leases.delete(workspaceId)
    let lease
    try {
      const demand = BigInt(Math.max(1, state.waiting.get(workspaceId) ?? 1))
      lease = await prisma.$transaction((tx) => reserveUsageLeaseInTransaction(tx, workspaceId, 'clicks', MAX_LEASE_UNITS, HEADROOM_DIVISOR, release, demand))
    } catch (error) {
      // The release rolled back with the transaction: keep owning those units.
      if (previous) state.leases.set(workspaceId, { ...previous, expiresAt: 0 })
      throw error
    }
    if (lease.unlimited) {
      state.unlimitedUntil.set(workspaceId, Date.now() + UNLIMITED_TTL_MS)
      return
    }
    state.unlimitedUntil.delete(workspaceId)
    state.leases.set(workspaceId, { periodKey: usagePeriodKey(), remaining: lease.granted, expiresAt: Date.now() + LEASE_TTL_MS, exhausted: lease.granted === 0n })
    ensureSweeper()
  })().finally(() => state.inflight.delete(workspaceId))
  state.inflight.set(workspaceId, flight)
  return flight
}

export async function admitBillableClick(workspaceId: string): Promise<ClickAdmission> {
  const now = Date.now()
  // Fast path: no awaits, no allocation beyond the result object.
  if ((state.unlimitedUntil.get(workspaceId) ?? 0) > now) return { admitted: true, reserved: false }
  if (take(workspaceId, now)) return { admitted: true, reserved: true }
  const current = state.leases.get(workspaceId)
  if (current?.exhausted && current.expiresAt > now && !state.inflight.has(workspaceId)) return { admitted: false, reserved: false }

  state.waiting.set(workspaceId, (state.waiting.get(workspaceId) ?? 0) + 1)
  try {
    for (let attempt = 0; attempt < MAX_ACQUIRE_ATTEMPTS; attempt++) {
      await acquire(workspaceId)
      const after = Date.now()
      if ((state.unlimitedUntil.get(workspaceId) ?? 0) > after) return { admitted: true, reserved: false }
      if (take(workspaceId, after)) return { admitted: true, reserved: true }
      // Granted nothing: the tenant is at its limit.
      if (state.leases.get(workspaceId)?.exhausted) return { admitted: false, reserved: false }
      // Otherwise other waiters drained this lease first; queue for the next one.
    }
    console.error(`Click admission gave up after ${MAX_ACQUIRE_ATTEMPTS} lease renewals`, { workspaceId })
    return { admitted: false, reserved: false }
  } finally {
    const left = (state.waiting.get(workspaceId) ?? 1) - 1
    if (left > 0) state.waiting.set(workspaceId, left)
    else state.waiting.delete(workspaceId)
  }
}

/** Give back a unit admitted but not used (e.g. the link's click cap rejected it). */
export function returnAdmittedClick(workspaceId: string): void {
  const lease = state.leases.get(workspaceId)
  if (lease && lease.periodKey === usagePeriodKey()) lease.remaining += 1n
  else void releaseUsage(workspaceId, 'clicks', usagePeriodKey(), 1n).catch(() => undefined)
}

/** Release every expired lease's leftover units. Exported for tests and shutdown hooks. */
export async function sweepExpiredLeases(now = Date.now()): Promise<number> {
  let released = 0
  for (const [workspaceId, lease] of state.leases) {
    if (lease.expiresAt > now || state.inflight.has(workspaceId)) continue
    state.leases.delete(workspaceId)
    if (lease.remaining <= 0n) continue
    try {
      await releaseUsage(workspaceId, 'clicks', lease.periodKey, lease.remaining)
      released++
    } catch (error) {
      console.error('Releasing click lease failed:', error)
    }
  }
  for (const [workspaceId, until] of state.unlimitedUntil) if (until <= now) state.unlimitedUntil.delete(workspaceId)
  return released
}

function ensureSweeper(): void {
  if (state.sweeper) return
  state.sweeper = setInterval(() => { void sweepExpiredLeases() }, LEASE_TTL_MS)
  state.sweeper.unref?.()
}

export function resetClickAdmissionForTests(): void {
  state.leases.clear()
  state.unlimitedUntil.clear()
  state.inflight.clear()
  state.waiting.clear()
  if (state.sweeper) clearInterval(state.sweeper)
  state.sweeper = undefined
}
