import { NextRequest } from 'next/server'
import { qrGet } from '@/lib/qr-response'

/** GET /api/links/[shortCode]/qr?format=png|svg&size=&dark=&dark2=&dots=&eyes=&caption=&track=1 */
export async function GET(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  return qrGet(request, context)
}
