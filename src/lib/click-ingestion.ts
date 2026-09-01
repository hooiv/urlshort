import { prisma } from '@/lib/prisma'
import { sanitizeClickForIngestion } from '@/lib/privacy-ingestion'
import type { ClickData } from '@/lib/queue'

export async function prepareClicks(items:ClickData[]):Promise<ClickData[]>{const workspaceIds=await prisma.url.findMany({where:{id:{in:[...new Set(items.map(x=>x.urlId))]}},select:{id:true,workspaceId:true}});const map=new Map(workspaceIds.map(x=>[x.id,x.workspaceId]));const out:ClickData[]=[];for(const item of items){const ws=map.get(item.urlId);if(!ws)continue;const safe=await sanitizeClickForIngestion(item,ws);if(safe)out.push(safe)}return out}
export function dedupeClickIds(items:ClickData[]):ClickData[]{return [...new Map(items.map(i=>[i.clickEventId,i])).values()]}

