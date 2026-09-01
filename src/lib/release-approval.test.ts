import { describe, expect, it } from 'vitest'
import { approvalDecision, scheduledReleaseReady } from './release-approval'
describe('release approval hardening',()=>{
 it('rejects self approval even when it would complete quorum',()=>expect(approvalDecision({creatorUserId:'u1',reviewerUserId:'u1',approved:true,approvedCount:2,quorum:2,requiredRoles:['owner','admin'],approvedRoles:['owner','admin']}).error).toMatch(/cannot approve/))
 it('requires both quorum and required roles',()=>expect(approvalDecision({creatorUserId:'u1',reviewerUserId:'u2',approved:true,approvedCount:2,quorum:2,requiredRoles:['owner','admin'],approvedRoles:['admin','admin']}).status).toBe('pending_approval'))
 it('publishes only after a non-creator satisfies quorum',()=>expect(approvalDecision({creatorUserId:'u1',reviewerUserId:'u2',approved:true,approvedCount:2,quorum:2,requiredRoles:['owner','admin'],approvedRoles:['owner','admin']}).status).toBe('approved'))
 it('rejection wins regardless of quorum',()=>expect(approvalDecision({creatorUserId:'u1',reviewerUserId:'u2',approved:false,approvedCount:2,quorum:2,requiredRoles:['owner'],approvedRoles:['owner','admin']}).status).toBe('rejected'))
})


describe('scheduled activation boundary',()=>{
 it('never activates early, only at or after scheduledAt',()=>{const now=new Date('2026-09-01T12:00:00Z');expect(scheduledReleaseReady('approved',new Date('2026-09-01T12:01:00Z'),now)).toBe(false);expect(scheduledReleaseReady('approved',new Date('2026-09-01T12:00:00Z'),now)).toBe(true);expect(scheduledReleaseReady('pending_approval',new Date('2026-09-01T11:00:00Z'),now)).toBe(false)})
})
