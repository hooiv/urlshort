import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import crypto from 'crypto';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { userId: user.id },
      include: {
        _count: {
          select: { deliveries: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(endpoints);
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const json = await request.json();
    const { url, events } = json;

    if (!url) return NextResponse.json({ error: 'URL is required' }, { status: 400 });

    const secret = crypto.randomBytes(24).toString('hex');

    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        userId: user.id,
        url,
        secret,
        events: events || ['click'],
      },
    });

    return NextResponse.json(endpoint, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
