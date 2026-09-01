export function scheduledReleaseReady(status:string, scheduledAt:Date|null, now:Date):boolean {
  return status === 'approved' && scheduledAt !== null && scheduledAt.getTime() <= now.getTime()
}
export function approvalDecision(input:{creatorUserId:string; reviewerUserId:string; approved:boolean; approvedCount:number; quorum:number; requiredRoles:string[]; approvedRoles:string[]}) {
  if (input.creatorUserId === input.reviewerUserId) return {status:'pending_approval' as const,error:'Release creators cannot approve their own release'}
  if (!input.approved) return {status:'rejected' as const}
  const roles = new Set(input.approvedRoles)
  const rolesSatisfied = input.requiredRoles.every(r => roles.has(r))
  return {status: input.approvedCount >= input.quorum && rolesSatisfied ? 'approved' as const : 'pending_approval' as const}
}
