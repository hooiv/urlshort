import { NextResponse, NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { requireWorkspaceRole, EDIT_ROLES } from '@/lib/workspaces';
import { rateLimit } from '@/lib/rate-limit';

export const reorderSchema = z.object({
  blockIds: z.array(z.string().cuid()).min(1).max(100),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = await rateLimit(request, { name: 'bio-reorder', limit: 60, windowMs: 60_000 });
    if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const { handle: rawHandle } = await params;
    const handle = typeof rawHandle === 'string' ? rawHandle.trim().toLowerCase() : '';
    const parsed = reorderSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !handle) {
      return NextResponse.json({ error: 'blockIds array is required' }, { status: 400 });
    }
    const { blockIds } = parsed.data;

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
