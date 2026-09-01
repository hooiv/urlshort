import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { requireWorkspaceRole, EDIT_ROLES } from '@/lib/workspaces';


export async function POST(
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
    const { type, title, url, content, metadataJson } = json;

    const profile = await prisma.bioProfile.findUnique({
      where: { handle },
      include: {
        _count: {
          select: { blocks: true },
        },
      },
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

    const block = await prisma.bioBlock.create({
      data: {
        profileId: profile.id,
        type,
        position: profile._count.blocks,
        title,
        url,
        content,
        metadataJson,
      },
    });

    return NextResponse.json(block, { status: 201 });
  } catch (error) {
    console.error('Error creating bio block:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
