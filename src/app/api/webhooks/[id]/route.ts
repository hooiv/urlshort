import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    const endpoint = await prisma.webhookEndpoint.findUnique({
      where: { id },
    });

    if (!endpoint || endpoint.userId !== user.id) {
      return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 });
    }

    await prisma.webhookEndpoint.delete({
      where: { id },
    });

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
