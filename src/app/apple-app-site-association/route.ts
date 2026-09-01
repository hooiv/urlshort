import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  // In a real multi-tenant app, this might dynamically fetch the App IDs associated
  // with a custom domain. For QuickLink's default domain, we serve a static manifest.
  
  const apps = await prisma.deepLinkApp.findMany({where:{enabled:true},select:{bundleId:true,appleTeamId:true,iosAssociatedDomainsJson:true}})
  const details = apps.flatMap((app) => {
    if (app.iosAssociatedDomainsJson) { try { const parsed=JSON.parse(app.iosAssociatedDomainsJson) as unknown; if(Array.isArray(parsed)) return parsed } catch {} }
    if (!app.bundleId || !app.appleTeamId) return []
    return [{appID:`${app.appleTeamId}.${app.bundleId}`,paths:['/*']}]
  })
  const appIds=details.map((d)=>typeof d==='object'&&d!==null&&'appID' in d?String((d as {appID?:unknown}).appID):'').filter(Boolean)
  const aasa = {
    applinks: {
      apps: [],
      details: details.length?details:[{appID:"TEAMID.com.quicklink.app",paths:["/m/*"]}]
    },
    webcredentials: {
      apps: appIds.length?appIds:["TEAMID.com.quicklink.app"]
    },
    appclips: {
      apps: ["TEAMID.com.quicklink.app.Clip"]
    }
  };

  return NextResponse.json(aasa, {
    headers: {
      'Content-Type': 'application/json',
      // AASA files often require no-cache or specific cache controls
      'Cache-Control': 's-maxage=86400, stale-while-revalidate',
    },
  });
}
