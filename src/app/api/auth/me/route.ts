import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ user: null })
  return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } })
}
