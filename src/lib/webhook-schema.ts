export const WEBHOOK_EVENTS={
 'link.clicked':{version:1,description:'A short link was resolved',required:['shortCode','clickEventId','timestamp']},
 'conversion.created':{version:1,description:'A conversion was attributed',required:['conversionId','goalId','urlId']},
 'campaign.updated':{version:1,description:'A campaign configuration changed',required:['campaignId','version']},
 'campaign.decision':{version:1,description:'Autopilot made a traffic decision',required:['campaignId','action','confidenceBps']},
 'destination.anomaly':{version:1,description:'Destination or traffic anomaly detected',required:['campaignId','type','severity']},
} as const
export type WebhookEventName=keyof typeof WEBHOOK_EVENTS
export function webhookEnvelope(event:WebhookEventName,data:Record<string,unknown>,id:string){return {id,type:event,version:WEBHOOK_EVENTS[event].version,createdAt:new Date().toISOString(),data}}