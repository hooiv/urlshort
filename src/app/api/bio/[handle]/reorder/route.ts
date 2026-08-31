import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { handle } = await params;
    const json = await request.json();
    const { blockIds } = json;

    if (!Array.isArray(blockIds)) {
      return NextResponse.json({ error: 'blockIds array is required' }, { status: 400 });
    }

    const profile = await prisma.bioProfile.findUnique({
      where: { handle },
    });

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    if (profile.userId && profile.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Update positions in a transaction
    await prisma.$transaction(
      blockIds.map((id, index) =>
        prisma.bioBlock.update({
          where: { id },
          data: { position: index },
        })
      )
    );

    const updatedBlocks = await prisma.bioBlock.findMany({
      where: { profileId: profile.id },
      orderBy: { position: 'asc' },
    });

    return NextResponse.json(updatedBlocks);
  } catch (error) {
    console.error('Error reordering bio blocks:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
