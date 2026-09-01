import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { requireWorkspaceRole, EDIT_ROLES } from '@/lib/workspaces';

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

    if (profile.userId) {
      if (profile.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    } else if (profile.workspaceId) {
      const access = await requireWorkspaceRole(request, profile.workspaceId, EDIT_ROLES);
      if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const blocks = await prisma.bioBlock.findMany({ where: { profileId: profile.id }, select: { id: true } });
    const validIds = new Set(blocks.map((block) => block.id));
    if (blockIds.length !== validIds.size || blockIds.some((id) => typeof id !== 'string' || !validIds.has(id)) || new Set(blockIds).size !== blockIds.length) {
      return NextResponse.json({ error: 'blockIds must contain every block in this profile exactly once' }, { status: 400 });
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
