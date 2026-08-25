import { NextResponse } from 'next/server';

export async function GET() {
  const assetlinks = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.quicklink.app",
        sha256_cert_fingerprints: [
          "14:6D:E9:83:C5:7D:06:9D:14:E4:4E:1A:3F:2B:6E:B4:71:2F:3C:9A:89:15:3A:56:4C:E3:B2:7F:6A:9D:41:88"
        ]
      }
    }
  ];

  return NextResponse.json(assetlinks, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=86400, stale-while-revalidate',
    },
  });
}
