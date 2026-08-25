import { NextResponse } from 'next/server';

export async function GET() {
  // In a real multi-tenant app, this might dynamically fetch the App IDs associated
  // with a custom domain. For QuickLink's default domain, we serve a static manifest.
  
  const aasa = {
    applinks: {
      apps: [],
      details: [
        {
          appID: "TEAMID.com.quicklink.app",
          paths: ["/m/*"] // Mobile specific paths, or all paths '/*' 
        }
      ]
    },
    webcredentials: {
      apps: ["TEAMID.com.quicklink.app"]
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
